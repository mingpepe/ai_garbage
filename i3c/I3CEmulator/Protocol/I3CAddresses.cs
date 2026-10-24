// =====================================================================================================
//  Protocol/I3CAddresses.cs  -  I3C 7-bit Address Space, Reserved Addresses, and Priority Rules
// =====================================================================================================
//
//  HOW I3C USES THE 7-BIT ADDRESS SPACE (0x00 .. 0x7F)
//  ===================================================
//
//  In I2C, you pick a 7-bit slave address from the chip datasheet (sometimes with 1-2 solder-jumper
//  pins A0/A1). If two sensors have the same hardcoded I2C address, you need an external I2C mux!
//
//  In I3C:
//    1. Every I3C Target receives its 7-bit DYNAMIC ADDRESS at runtime from the Controller (via ENTDAA
//       or SETDASA). Two identical sensors on the same board get two different Dynamic Addresses!
//    2. Because Open-Drain arbitration is MSB-first and '0' beats '1' (Wired-AND), a NUMERICALLY
//       SMALLER 7-bit address has HIGHER INTERRUPT PRIORITY on the bus!
//       For example, Target at 0x09 (0001001b) will ALWAYS beat Target at 0x1A (0011010b) at bit 5
//       when both raise an In-Band Interrupt (IBI) in the same START header.
//    3. Certain 7-bit addresses are reserved by the MIPI I3C specification so that:
//       - 0x7E (1111110b) is the universal I3C Broadcast Address.
//       - 0x02 (0000010b) is the Hot-Join Request Address.
//       - Any address that differs from 0x7E by only ONE bit (Hamming distance = 1) is forbidden!
//         Why? Because Address Headers do NOT have a parity bit (their 9th bit is the ACK/NACK bit).
//         Forbidding all single-bit-flip neighbors of 0x7E guarantees that a 1-bit noise glitch on SDA
//         can never accidentally turn a Broadcast 0x7E into a valid Target's private address, nor turn
//         a Target's private address into a Broadcast 0x7E! (Targets detect these as Error TE0.)
//
//  ASCII MAP OF RESTRICTED I3C ADDRESSES:
//  +-------------------+-----------------------------------------------------------------------------+
//  | 7-bit Hex Value   | Meaning in MIPI I3C Specification                                           |
//  +-------------------+-----------------------------------------------------------------------------+
//  | 0x00 .. 0x01      | Reserved (I2C General Call / CBUS)                                          |
//  | 0x02              | I3C Hot-Join (HJ) Request Address (sent as 0x02 + W = 0x04 in header)       |
//  | 0x03 .. 0x07      | Reserved (I2C High-Speed / future use)                                      |
//  | 0x3E (0111110b)   | Reserved: 0x7E with bit 6 flipped (single-bit error protection around 0x7E) |
//  | 0x5E (1011110b)   | Reserved: 0x7E with bit 5 flipped                                           |
//  | 0x6E (1101110b)   | Reserved: 0x7E with bit 4 flipped                                           |
//  | 0x76 (1110110b)   | Reserved: 0x7E with bit 3 flipped                                           |
//  | 0x78 .. 0x7B      | Reserved (I2C 10-bit addressing prefix 11110xx, includes 0x7A = bit 2 flip) |
//  | 0x7C (1111100b)   | Reserved: 0x7E with bit 1 flipped (also I2C Device ID)                      |
//  | 0x7E (1111110b)   | I3C Broadcast Address! Every I3C Target listens to 0x7E.                    |
//  | 0x7F (1111111b)   | Reserved: 0x7E with bit 0 flipped                                           |
//  +-------------------+-----------------------------------------------------------------------------+
//  All remaining values (0x08..0x3D, 0x3F..0x5D, 0x5F..0x6D, 0x6F..0x75, 0x77, 0x7D) are available
//  for Dynamic Address allocation (excluding any Static Addresses used by Legacy I2C slaves on the bus).
//
// =====================================================================================================

namespace I3CEmulator.Protocol;

/// <summary>
/// Constants and validation helpers for the 7-bit I3C address space.
/// </summary>
public static class I3CAddresses
{
    /// <summary>
    /// The universal I3C Broadcast Address (7'h7E = 0b111_1110).
    /// Used to start all Common Command Codes (CCCs), to wake up targets into I3C mode, and as the
    /// recommended Open-Drain arbitration header before a Repeated START private transfer.
    /// </summary>
    public const byte Broadcast = 0x7E;

    /// <summary>
    /// Reserved 7-bit address (7'h02 = 0b000_0010) used by newly connected or newly powered I3C
    /// Targets to request a Dynamic Address after the bus has been joined (Hot-Join).
    /// Sent with RnW = 0 (Write), so the 8-bit header byte on the wire is (0x02 &lt;&lt; 1) | 0 = 0x04.
    /// </summary>
    public const byte HotJoin = 0x02;

    /// <summary>
    /// All 7-bit addresses that have Hamming distance 1 from <see cref="Broadcast"/> (0x7E = 1111110b).
    /// If a Target sees one of these after START, it treats it as a corrupted 0x7E (Error Type TE0).
    /// </summary>
    private static readonly HashSet<byte> SingleBitFlipNeighborsOf7E = new()
    {
        0x3E, // 011_1110 (bit 6 flipped)
        0x5E, // 101_1110 (bit 5 flipped)
        0x6E, // 110_1110 (bit 4 flipped)
        0x76, // 111_0110 (bit 3 flipped)
        0x7A, // 111_1010 (bit 2 flipped)
        0x7C, // 111_1100 (bit 1 flipped)
        0x7F  // 111_1111 (bit 0 flipped)
    };

    /// <summary>
    /// Returns true if <paramref name="address7Bit"/> is one of the 7 single-bit-error neighbors of 0x7E.
    /// </summary>
    public static bool IsSingleBitErrorOf7E(byte address7Bit) =>
        SingleBitFlipNeighborsOf7E.Contains(address7Bit);

    /// <summary>
    /// Returns true if <paramref name="address7Bit"/> is legal to assign as a Dynamic Address to an
    /// I3C Target according to the MIPI I3C specification table.
    /// </summary>
    public static bool IsValidDynamicAddress(byte address7Bit)
    {
        if (address7Bit > 0x7F)
            return false;

        // 0x00 .. 0x07 are reserved (includes 0x02 Hot-Join)
        if (address7Bit <= 0x07)
            return false;

        // Broadcast address itself
        if (address7Bit == Broadcast)
            return false;

        // Single-bit-flip neighbors of 0x7E
        if (SingleBitFlipNeighborsOf7E.Contains(address7Bit))
            return false;

        // I2C 10-bit address prefix range 0x78..0x7B
        if (address7Bit is >= 0x78 and <= 0x7B)
            return false;

        return true;
    }

    /// <summary>
    /// Packs a 7-bit address and the R/W bit (false = Write/0, true = Read/1) into the 8-bit header
    /// byte transmitted MSB-first on SDA.
    /// </summary>
    public static byte PackHeader(byte address7Bit, bool isRead) =>
        (byte)((address7Bit << 1) | (isRead ? 1 : 0));

    /// <summary>
    /// Unpacks an 8-bit header byte sampled from SDA into its 7-bit address and R/W flag.
    /// </summary>
    public static (byte Address7Bit, bool IsRead) UnpackHeader(byte headerByte) =>
        ((byte)(headerByte >> 1), (headerByte & 0x01) != 0);

    /// <summary>
    /// Formats an 8-bit header byte into a readable notation such as "0x7E/W" or "0x0A/R".
    /// </summary>
    public static string FormatHeader(byte headerByte)
    {
        var (addr, isRead) = UnpackHeader(headerByte);
        string rw = isRead ? "R" : "W";
        if (addr == Broadcast)
            return $"7'h7E/{rw} (Broadcast)";
        if (addr == HotJoin && !isRead)
            return "7'h02/W (Hot-Join Req)";
        return $"0x{addr:X2}/{rw}";
    }
}
