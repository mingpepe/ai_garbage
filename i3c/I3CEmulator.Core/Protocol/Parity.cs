// =====================================================================================================
//  Protocol/Parity.cs  -  Why I3C replaced the per-byte I2C ACK/NACK with the "T-Bit" (and Parity)
// =====================================================================================================
//
//  IF YOU KNOW I2C, THIS IS ONE OF THE BIGGEST SURPRISES IN I3C:
//  =============================================================
//
//  In I2C, every 8-bit byte (address OR data) is followed by a 9th clock cycle where the transmitter
//  releases SDA (Open-Drain High-Z) and the receiver pulls SDA low to ACK (0) or leaves it high to
//  NACK (1).
//
//  Why did MIPI remove the per-byte ACK/NACK on data bytes in I3C?
//    Because an Open-Drain ACK requires:
//      1. A direction turnaround on SDA before bit 9 (Master -> Target -> Master), AND
//      2. Slow Open-Drain timing (tLOW = 200 ns) so the passive pull-up resistor can represent a NACK!
//    If every data byte had an Open-Drain ACK bit, a 12.5 MHz Push-Pull bus would lose more than 60%
//    of its throughput waiting for Open-Drain ACKs on every 9th bit!
//
//  HOW THE 9TH BIT ("T-BIT" = TRANSITION BIT) WORKS IN I3C SDR:
//  ============================================================
//
//  1. ON AN ADDRESS HEADER (first byte after S or Sr):
//     Bit 9 is STILL a classic Open-Drain ACK (0) / NACK (1) driven by the receiver!
//     (Because the Controller needs to know if the Target actually exists and is ready.)
//
//  2. ON ANY MASTER-WRITTEN BYTE (CCC Command Code, Defining Byte, or Private Write Data Byte):
//     There is NO turnaround on Bit 9! The Controller keeps driving SDA in PUSH-PULL at 12.5 MHz and
//     transmits an ODD PARITY BIT as the 9th bit (the T-bit):
//
//         T = !(D7 ^ D6 ^ D5 ^ D4 ^ D3 ^ D2 ^ D1 ^ D0)
//         (i.e. Total number of '1's across the 8 data bits + the T-bit is ODD.)
//
//     ASCII diagram of a Master-Written byte in I3C:
//       Bit # :   1     2     3     4     5     6     7     8       9 (T-bit)
//               +-----+-----+-----+-----+-----+-----+-----+-----+---------------+
//       SDA   : | D7  | D6  | D5  | D4  | D3  | D2  | D1  | D0  |  Odd Parity   |
//               +-----+-----+-----+-----+-----+-----+-----+-----+---------------+
//       Driver: |<------------ Master drives ALL 9 bits in PUSH-PULL ---------->|
//
//     What if the Target detects a parity mismatch?
//       - In a CCC command byte -> Error TE1 (Target ignores the rest of the frame until Sr or P).
//       - In Write data         -> Error TE2 (Target drops the corrupted byte and ignores further bytes
//                                  until Sr or P).
//
//  3. ON ANY TARGET-READ BYTE (Private Read, Direct GETxxx CCC, or IBI Payload):
//     In I2C, when reading from a slave, the Master ACKs (0) each byte and NACKs (1) the final byte.
//     In I3C, EITHER the Target OR the Master may decide to end a read transfer!
//     How? During the 9th bit (T-bit) of a read byte:
//       - The Target drives the first half of the T-bit in Push-Pull:
//           * T = 1: "I have MORE read bytes available."
//           * T = 0: "This was my LAST byte (End-Of-Data); I have nothing more to send."
//       - If T == 1 ("Target has more") BUT the Master wants to stop reading right now (Master Abort),
//         then while SCL is HIGH during the T-bit, the Master pulls SDA LOW (a falling edge on SDA
//         while SCL is HIGH = looks like a START/Sr, which serves as the Controller's Abort signal)
//         and immediately follows it with a STOP (P) or Repeated START (Sr)!
//
//  4. ON THE DYNAMIC ADDRESS SENT DURING ENTDAA (Special 8-bit payload: 7-bit DA + 1-bit Odd Parity):
//     During ENTDAA, after a Target wins the 64-bit PID/BCR/DCR arbitration, the Master sends 8 bits
//     plus a 9th ACK bit:
//       - Bits 7..1 : The newly assigned 7-bit Dynamic Address (DA[6:0]).
//       - Bit 0     : Odd Parity calculated over the 7 bits of DA[6:0]:
//                     P = !(DA6 ^ DA5 ^ DA4 ^ DA3 ^ DA2 ^ DA1 ^ DA0)
//       - 9th bit   : Open-Drain ACK (0) driven by the winning Target if the parity bit was valid!
//                     If the parity bit was wrong (Error TE3), the Target NACKs (1) and rejects the DA.
//
// =====================================================================================================

using System.Numerics;

namespace I3CEmulator.Protocol;

/// <summary>
/// Helpers for calculating and checking I3C Odd Parity T-bits (for 8-bit bytes) and ENTDAA Dynamic
/// Address parity (for 7-bit dynamic addresses).
/// </summary>
public static class Parity
{
    /// <summary>
    /// Computes the I3C Odd-Parity T-bit for an 8-bit byte (CCC command or Write data).
    /// Returns true ('1') if the byte has an EVEN number of '1' bits, or false ('0') if the byte
    /// already has an ODD number of '1' bits, so that PopCount(byte) + (T ? 1 : 0) is always ODD.
    /// </summary>
    public static bool ComputeOddParityTBit(byte value)
    {
        int ones = BitOperations.PopCount(value);
        // If ones is even (ones % 2 == 0), we need T = 1 to make total ones odd.
        return (ones & 1) == 0;
    }

    /// <summary>
    /// Verifies that a received 8-bit byte and its sampled 9th T-bit satisfy I3C Odd Parity.
    /// </summary>
    public static bool VerifyOddParityTBit(byte value, bool sampledTBit) =>
        ComputeOddParityTBit(value) == sampledTBit;

    /// <summary>
    /// Computes the LSB parity bit (bit 0) for a 7-bit Dynamic Address assigned during ENTDAA.
    /// In ENTDAA, the 8-bit byte sent by the Controller is: [DA6 DA5 DA4 DA3 DA2 DA1 DA0 Parity],
    /// where Parity makes the total number of '1's across all 8 bits ODD.
    /// </summary>
    public static bool Compute7BitAddressOddParity(byte address7Bit)
    {
        int ones = BitOperations.PopCount((uint)(address7Bit & 0x7F));
        return (ones & 1) == 0;
    }

    /// <summary>
    /// Packs a 7-bit Dynamic Address (bits 7..1) with its Odd Parity bit in bit 0, producing the
    /// 8-bit byte transmitted by the Controller at the end of an ENTDAA round or during SETDASA/SETNEWDA.
    /// Note: For SETDASA/SETNEWDA, bit 0 is reserved=0 per spec, whereas for ENTDAA bit 0 is Odd Parity!
    /// </summary>
    public static byte PackEntdaaAddressWithParity(byte address7Bit)
    {
        bool parityBit = Compute7BitAddressOddParity(address7Bit);
        return (byte)(((address7Bit & 0x7F) << 1) | (parityBit ? 1 : 0));
    }

    /// <summary>
    /// Unpacks an 8-bit ENTDAA address byte into its 7-bit Dynamic Address and checks whether bit 0
    /// matches the required Odd Parity (Error TE3 check on the Target side).
    /// </summary>
    public static (byte Address7Bit, bool IsParityValid) UnpackAndVerifyEntdaaAddress(byte rawByte)
    {
        byte addr7 = (byte)(rawByte >> 1);
        bool receivedParity = (rawByte & 0x01) != 0;
        bool expectedParity = Compute7BitAddressOddParity(addr7);
        return (addr7, receivedParity == expectedParity);
    }
}
