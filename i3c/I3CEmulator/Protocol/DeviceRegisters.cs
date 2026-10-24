// =====================================================================================================
//  Protocol/DeviceRegisters.cs  -  PID (48-bit), BCR (8-bit), DCR (8-bit), and I2C LVR (8-bit)
// =====================================================================================================
//
//  During ENTDAA (Enter Dynamic Address Assignment), every unassigned I3C Target shifts out a 64-bit
//  open-drain identifier MSB-first onto SDA:
//
//    Bit # on Wire (0 = first MSB sent, 63 = last LSB sent):
//    +----------------------------------------------------+-------------------+-------------------+
//    |                Bits 0 .. 47 (48 bits)              |  Bits 48..55 (8b) |  Bits 56..63 (8b) |
//    |                Provisional ID (PID)                |        BCR        |        DCR        |
//    +----------------------------------------------------+-------------------+-------------------+
//
//  1. 48-BIT PROVISIONAL ID (PID) STRUCTURE
//  ========================================
//
//    Bit 47 ............... Bit 33 | Bit 32 | Bit 31 ....... Bit 16 | Bit 15 .............. Bit 0
//   +------------------------------+--------+-----------------------+-----------------------------+
//   | MIPI Manufacturer ID (15-bit)|IdType=0|   Part ID (16-bit)    | Instance ID (4b) + Rsvd(12b)|
//   +------------------------------+--------+-----------------------+-----------------------------+
//    (or if Bit 32 == 1: Bits 31..0 are a 32-bit random provisional value)
//
//    Notice why Instance ID is in the lower bits: if you solder TWO identical temperature sensors
//    (same Manufacturer ID, same Part ID) onto the same I3C bus, you strap their Instance ID pins to
//    0 and 1. During ENTDAA, they tie on the first 44 bits, and then Instance ID=0 wins arbitration
//    on bit 44..47 while Instance ID=1 loses cleanly and gets its address on the very next round!
//
//  2. 8-BIT BUS CHARACTERISTICS REGISTER (BCR)
//  ===========================================
//
//    Bit 7 .. Bit 6 |   Bit 5   |    Bit 4    |    Bit 3    |     Bit 2     |  Bit 1  |     Bit 0
//   +---------------+-----------+-------------+-------------+---------------+---------+---------------+
//   | Device Role   | Advanced  | Bridge      | Offline     | IBI Payload   | IBI     | Max Data      |
//   | 00=I3C Target | (HDR)     | Capable     | Capable     | 1 = Mandatory | Request | Speed         |
//   | 01=I3C Ctrlr  | Capable   |             |             |     Data Byte | Capable | Limitation    |
//   |               |           |             |             |     follows   |         |               |
//   +---------------+-----------+-------------+-------------+---------------+---------+---------------+
//
//    Pay special attention to Bit 1 and Bit 2:
//      * BCR[1] (IbiRequestCapable): Tells the Controller whether this Target can generate In-Band
//        Interrupts (IBIs).
//      * BCR[2] (IbiHasMandatoryDataByte): CRITICAL! When the Controller ACKs an IBI from this Target,
//        how does the Controller know whether to immediately issue a STOP (P) or to clock 8+1 bits to
//        read a Mandatory Data Byte (MDB) from the Target?
//        Answer: The Controller checks the Target's BCR[2] bit (which it learned during ENTDAA or
//        via GETBCR)! If BCR[2] == 1, the Controller MUST clock at least one byte + T-bit in Push-Pull!
//
//  3. 8-BIT DEVICE CHARACTERISTICS REGISTER (DCR)
//  ==============================================
//
//    Standardized MIPI device class code (similar to USB Class Code), e.g.:
//      0x00 = Generic I3C Device
//      0x41 = IMU / Accelerometer + Gyroscope
//      0x62 = Temperature / Humidity Sensor
//      0xC5 = Power Management IC (PMIC)
//
//  4. 8-BIT LEGACY VIRTUAL REGISTER (LVR)  -- For Legacy I2C Slaves on an I3C Bus
//  ==============================================================================
//
//    Obviously an old I2C chip does not have PID/BCR/DCR registers inside its silicon! Instead, the
//    system designer stores the I2C device's 7-bit Static Address + 8-bit LVR value in the Controller's
//    firmware / Device Tree table:
//      * LVR[7:5] : Legacy I2C Index
//      * LVR[4]   : 0 = I2C device HAS a 50 ns spike filter (safe to run 12.5 MHz I3C on the bus!)
//                   1 = I2C device LACKS a 50 ns spike filter (limits the bus to compatibility mode)
//      * LVR[3:0] : Mode indicator (0 = FM+ 1 MHz capable, 1 = FM 400 kHz only)
//
// =====================================================================================================

namespace I3CEmulator.Protocol;

/// <summary>
/// Flags inside the 8-bit Bus Characteristics Register (BCR) of every I3C Target.
/// </summary>
[Flags]
public enum BcrFlags : byte
{
    None = 0x00,

    /// <summary>BCR[0]: Max Data Speed Limitation (1 = target has speed limits, query via GETMXDS).</summary>
    MaxDataSpeedLimitation = 1 << 0,

    /// <summary>BCR[1]: Target is capable of issuing In-Band Interrupt (IBI) requests.</summary>
    IbiRequestCapable = 1 << 1,

    /// <summary>
    /// BCR[2]: When this Target's IBI is ACKed by the Controller, the Target ALWAYS follows the ACK
    /// with at least one Mandatory Data Byte (MDB) + T-bit in Push-Pull mode.
    /// </summary>
    IbiHasMandatoryDataByte = 1 << 2,

    /// <summary>BCR[3]: Offline Capable (Target may not always respond immediately).</summary>
    OfflineCapable = 1 << 3,

    /// <summary>BCR[4]: Bridge Device (e.g. I3C-to-SPI or I3C-to-UART bridge).</summary>
    BridgeDevice = 1 << 4,

    /// <summary>BCR[5]: Supports HDR (High Data Rate) modes in addition to mandatory SDR.</summary>
    HdrCapable = 1 << 5,

    /// <summary>BCR[6]: Secondary Controller role capable (00 = I3C Target, 01 = I3C Controller-capable).</summary>
    SecondaryControllerCapable = 1 << 6
}

/// <summary>
/// Represents the 48-bit Provisional ID (PID), 8-bit BCR, and 8-bit DCR that uniquely identify an
/// I3C Target and form its 64-bit Open-Drain arbitration word during ENTDAA.
/// </summary>
public readonly record struct I3CDeviceIdentity(
    ulong ProvisionalId48,
    BcrFlags Bcr,
    byte Dcr)
{
    /// <summary>
    /// Builds a standard fixed 48-bit MIPI Provisional ID from its constituent fields:
    ///   - Bits [47:33]: 15-bit MIPI Manufacturer ID
    ///   - Bit  [32]   : 0 (Vendor Fixed ID, not random)
    ///   - Bits [31:16]: 16-bit Part ID
    ///   - Bits [15:12]: 4-bit Instance ID (distinguishes identical chips on the same PCB)
    ///   - Bits [11:0] : 12-bit Vendor Extra Info
    /// </summary>
    public static ulong BuildProvisionalId(
        ushort manufacturerId15Bit,
        ushort partId16Bit,
        byte instanceId4Bit = 0,
        ushort extra12Bit = 0)
    {
        ulong mfg = (ulong)(manufacturerId15Bit & 0x7FFF) << 33;
        ulong part = (ulong)partId16Bit << 16;
        ulong inst = (ulong)(instanceId4Bit & 0x0F) << 12;
        ulong ext = (ulong)(extra12Bit & 0x0FFF);
        return mfg | part | inst | ext;
    }

    /// <summary>
    /// Combines the 48-bit PID, 8-bit BCR, and 8-bit DCR into the exact 64-bit word transmitted
    /// MSB-first (bit 63 down to bit 0) during ENTDAA Open-Drain arbitration.
    /// </summary>
    public ulong ToEntdaa64BitWord()
    {
        ulong pid48 = ProvisionalId48 & 0xFFFF_FFFF_FFFFUL;
        return (pid48 << 16) | ((ulong)(byte)Bcr << 8) | Dcr;
    }

    /// <summary>
    /// Extracts the 6 bytes of the 48-bit Provisional ID in Big-Endian (MSB-first) order, as returned
    /// by the Direct <see cref="CccCode.GETPID"/> command.
    /// </summary>
    public byte[] GetPidBytesBigEndian()
    {
        ulong pid = ProvisionalId48 & 0xFFFF_FFFF_FFFFUL;
        return new byte[]
        {
            (byte)((pid >> 40) & 0xFF),
            (byte)((pid >> 32) & 0xFF),
            (byte)((pid >> 24) & 0xFF),
            (byte)((pid >> 16) & 0xFF),
            (byte)((pid >> 8) & 0xFF),
            (byte)(pid & 0xFF)
        };
    }

    /// <summary>
    /// Reconstructs an <see cref="I3CDeviceIdentity"/> from the 64-bit word received by the Controller
    /// during ENTDAA.
    /// </summary>
    public static I3CDeviceIdentity FromEntdaa64BitWord(ulong word64)
    {
        ulong pid48 = (word64 >> 16) & 0xFFFF_FFFF_FFFFUL;
        BcrFlags bcr = (BcrFlags)((word64 >> 8) & 0xFF);
        byte dcr = (byte)(word64 & 0xFF);
        return new I3CDeviceIdentity(pid48, bcr, dcr);
    }

    public override string ToString() =>
        $"PID=0x{ProvisionalId48:X12}, BCR=0x{(byte)Bcr:X2} ({Bcr}), DCR=0x{Dcr:X2}";
}

/// <summary>
/// Static configuration entry for a Legacy I2C Slave stored in the I3C Controller's Device Address
/// Table (DAT), including its 7-bit Static Address and 8-bit Legacy Virtual Register (LVR).
/// </summary>
public sealed record LegacyI2CDeviceDescriptor(
    string Name,
    byte StaticAddress7Bit,
    byte Lvr)
{
    /// <summary>LVR[4] == 0 means the I2C device has a 50 ns spike filter on SCL/SDA.</summary>
    public bool Has50NsSpikeFilter => (Lvr & (1 << 4)) == 0;

    /// <summary>LVR[0] == 0 means Fast-Mode Plus (1 MHz); LVR[0] == 1 means Fast-Mode (400 kHz).</summary>
    public bool IsFastModePlusCapable => (Lvr & 0x01) == 0;
}
