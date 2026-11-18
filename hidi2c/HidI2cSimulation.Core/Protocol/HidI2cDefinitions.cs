namespace HidI2cSimulation.Protocol;

/// <summary>
/// =========================================================================================
///  MICROSOFT HID OVER I2C PROTOCOL SPECIFICATION VERSION 1.00 (DECEMBER 2012)
/// =========================================================================================
/// 
///  ORIGIN & STANDARDS HISTORY:
///  ---------------------------
///  1. WHAT IS HID?
///     HID stands for "Human Interface Device".
///     Originally defined by the USB Implementers Forum (USB-IF) in 1997 (v1.0) and 2001 (v1.11)
///     for USB peripherals (mice, keyboards, joysticks).
///     The core genius of HID is "Self-Describing Peripherals": a device exports a binary
///     "Report Descriptor" detailing the exact format, bit offsets, units, and ranges of its
///     input/output data packets without requiring custom OS-level device drivers!
///
///  2. WHO DEFINED HID OVER I2C?
///     Defined by MICROSOFT CORPORATION in 2011-2012 for the Windows 8 ecosystem.
///     Microsoft standardized this protocol so low-power mobile devices (tablets, ultrabooks,
///     laptops, convertibles) could interface touchscreens, touchpads, sensor hubs, and keyboards
///     over the simple 2-wire I2C bus instead of power-hungry USB transceivers.
///     Standard OS Drivers:
///       - Windows: inbox 'hidi2c.sys'
///       - Linux:   kernel driver 'drivers/hid/i2c-hid/i2c-hid-core.c'
///
/// =========================================================================================
///  HARDWARE PINOUT & ELECTRICAL REQUIREMENTS
/// =========================================================================================
///
///  +---------------------------------------------------------------------------------+
///  |                          HID OVER I2C PIN CONNECTIONS                           |
///  +---------------------------------------------------------------------------------+
///  |                                                                                 |
///  |   HOST PROCESSOR (SoC)                                   HIDI2C SLAVE DEVICE    |
///  |   (e.g., Intel / AMD / ARM)                              (Touchpad/Touchscreen) |
///  |   +--------------------+                                 +--------------------+ |
///  |   |                    |           VDD (1.8V / 3.3V)     |                    | |
///  |   |                    |           +------+              |                    | |
///  |   |                    |                  |              |                    | |
///  |   |                    |                 [R] ~2.2k-4.7k  |                    | |
///  |   |                    |                  |              |                    | |
///  |   |        I2C_SCL ----+------------------+------------> | SCL                | |
///  |   |                    |                  |              |                    | |
///  |   |                    |                 [R] ~2.2k-4.7k  |                    | |
///  |   |                    |                  |              |                    | |
///  |   |        I2C_SDA <---+------------------+------------> | SDA (Open-Drain)   | |
///  |   |                    |                  |              |                    | |
///  |   |                    |                 [R] ~10k Pull-up|                    | |
///  |   |                    |                  |              |                    | |
///  |   |       GPIO_INT <---+------------------+------------- | INT# / IRQ#        | |
///  |   |                    |                                 | (Active-LOW)       | |
///  |   |                    |                                 |                    | |
///  |   |      GPIO_RST# ----+-------------------------------> | RESET# (Opt/ActiveL| |
///  |   |                    |                                 |                    | |
///  |   |                VDD +--------------------------------> VDD                 | |
///  |   |                GND +--------------------------------> GND                 | |
///  |   +--------------------+                                 +--------------------+ |
///  +---------------------------------------------------------------------------------+
///
///  PIN DESCRIPTIONS:
///  1. SCL    (Serial Clock): Host-driven open-drain clock line (100kHz, 400kHz, or 1MHz).
///  2. SDA    (Serial Data):  Bidirectional open-drain data line. Requires external pull-up.
///  3. INT#   (Interrupt):    Active-LOW level/edge triggered line driven by the Slave.
///                            PULLED LOW when slave has pending input reports for the host.
///                            Host reads I2C bus ONLY when INT# is asserted!
///  4. RESET# (Hardware Reset): Active-LOW hardware reset pin from Host (Optional).
///  5. VDD    (Power):        1.8V or 3.3V logic supply rail.
///  6. GND    (Ground):       Common electrical reference.
///
/// =========================================================================================
/// </summary>

public static class HidI2cConstants
{
    /// <summary>
    /// Microsoft ACPI Device Specific Method (_DSM) GUID for HID-over-I2C:
    /// 3CDFF6F7-4267-4555-AD05-B30A3D8938DE
    /// </summary>
    public const string AcpiDsmGuid = "3CDFF6F7-4267-4555-AD05-B30A3D8938DE";
    public const int AcpiDsmRevId = 1;
    public const int AcpiDsmFnHidDescriptor = 1;

    /// <summary>
    /// Standard length of the 30-byte Microsoft HID Descriptor.
    /// </summary>
    public const ushort StandardHidDescLength = 30; // 0x001E

    /// <summary>
    /// Protocol BCD Version 1.00.
    /// </summary>
    public const ushort ProtocolVersionBcd100 = 0x0100;
}

/// <summary>
/// =========================================================================================
///  30-BYTE MICROSOFT HID DESCRIPTOR STRUCTURE (LITTLE ENDIAN)
/// =========================================================================================
///
///  Offset | Field Name           | Size (Bytes) | Description
///  -------+----------------------+--------------+-----------------------------------------
///   0..1  | wHIDDescLength       | 2            | Length of this descriptor (Always 30 / 0x001E)
///   2..3  | bcdVersion           | 2            | Version of spec (0x0100 = v1.00)
///   4..5  | wReportDescLength    | 2            | Length of HID Report Descriptor in bytes
///   6..7  | wReportDescRegister  | 2            | 16-bit I2C register address to read Report Desc
///   8..9  | wInputRegister       | 2            | 16-bit register to read pending Input Reports
///  10..11 | wMaxInputLength      | 2            | Maximum size of any single Input Report
///  12..13 | wOutputRegister      | 2            | 16-bit register to write Output Reports
///  14..15 | wMaxOutputLength     | 2            | Maximum size of an Output Report
///  16..17 | wCommandRegister     | 2            | 16-bit register to issue HID Commands
///  18..19 | wDataRegister        | 2            | 16-bit register for Command Data payloads
///  20..21 | wVendorID            | 2            | Vendor ID (VID) assigned by USB-IF
///  22..23 | wProductID           | 2            | Product ID (PID)
///  24..25 | wVersionID           | 2            | Firmware revision (REV)
///  26..29 | Reserved             | 4            | Reserved, must be 0x00000000
///
/// =========================================================================================
/// </summary>
public record HidDescriptor
{
    public ushort HIDDescLength { get; init; } = 30;
    public ushort BcdVersion { get; init; } = 0x0100;
    public ushort ReportDescLength { get; init; }
    public ushort ReportDescRegister { get; init; }
    public ushort InputRegister { get; init; }
    public ushort MaxInputLength { get; init; }
    public ushort OutputRegister { get; init; }
    public ushort MaxOutputLength { get; init; }
    public ushort CommandRegister { get; init; }
    public ushort DataRegister { get; init; }
    public ushort VendorId { get; init; }
    public ushort ProductId { get; init; }
    public ushort VersionId { get; init; }
    public uint Reserved { get; init; } = 0;

    /// <summary>
    /// Serializes the 30-byte HID Descriptor to little-endian byte array.
    /// </summary>
    public byte[] ToBytes()
    {
        byte[] buffer = new byte[30];
        BinaryPrimitivesWrite(buffer, 0, HIDDescLength);
        BinaryPrimitivesWrite(buffer, 2, BcdVersion);
        BinaryPrimitivesWrite(buffer, 4, ReportDescLength);
        BinaryPrimitivesWrite(buffer, 6, ReportDescRegister);
        BinaryPrimitivesWrite(buffer, 8, InputRegister);
        BinaryPrimitivesWrite(buffer, 10, MaxInputLength);
        BinaryPrimitivesWrite(buffer, 12, OutputRegister);
        BinaryPrimitivesWrite(buffer, 14, MaxOutputLength);
        BinaryPrimitivesWrite(buffer, 16, CommandRegister);
        BinaryPrimitivesWrite(buffer, 18, DataRegister);
        BinaryPrimitivesWrite(buffer, 20, VendorId);
        BinaryPrimitivesWrite(buffer, 22, ProductId);
        BinaryPrimitivesWrite(buffer, 24, VersionId);
        buffer[26] = 0; buffer[27] = 0; buffer[28] = 0; buffer[29] = 0;
        return buffer;
    }

    /// <summary>
    /// Deserializes a 30-byte little-endian byte array into a HidDescriptor object.
    /// </summary>
    public static HidDescriptor FromBytes(byte[] buffer, int offset = 0)
    {
        if (buffer.Length - offset < 30)
            throw new ArgumentException("Buffer must be at least 30 bytes to parse HID Descriptor.");

        return new HidDescriptor
        {
            HIDDescLength = BinaryPrimitivesRead(buffer, offset + 0),
            BcdVersion = BinaryPrimitivesRead(buffer, offset + 2),
            ReportDescLength = BinaryPrimitivesRead(buffer, offset + 4),
            ReportDescRegister = BinaryPrimitivesRead(buffer, offset + 6),
            InputRegister = BinaryPrimitivesRead(buffer, offset + 8),
            MaxInputLength = BinaryPrimitivesRead(buffer, offset + 10),
            OutputRegister = BinaryPrimitivesRead(buffer, offset + 12),
            MaxOutputLength = BinaryPrimitivesRead(buffer, offset + 14),
            CommandRegister = BinaryPrimitivesRead(buffer, offset + 16),
            DataRegister = BinaryPrimitivesRead(buffer, offset + 18),
            VendorId = BinaryPrimitivesRead(buffer, offset + 20),
            ProductId = BinaryPrimitivesRead(buffer, offset + 22),
            VersionId = BinaryPrimitivesRead(buffer, offset + 24),
            Reserved = 0
        };
    }

    private static void BinaryPrimitivesWrite(byte[] b, int offset, ushort val)
    {
        b[offset] = (byte)(val & 0xFF);
        b[offset + 1] = (byte)((val >> 8) & 0xFF);
    }

    private static ushort BinaryPrimitivesRead(byte[] b, int offset)
    {
        return (ushort)(b[offset] | (b[offset + 1] << 8));
    }
}

/// <summary>
/// =========================================================================================
///  COMMAND REGISTER STRUCTURE (16 BITS)
/// =========================================================================================
///
///  Bit 15..12: Reserved (0)
///  Bit 11..8 : Command OpCode (0x01 = RESET, 0x02 = GET_REPORT, 0x08 = SET_POWER, etc.)
///  Bit 7..4  : Report Type (0=Reserved, 1=Input, 2=Output, 3=Feature)
///  Bit 3..0  : Report ID (0x00..0x0E; if 0x0F, an extra 8-bit Report ID byte follows)
///
///  +---------------+---------------+---------------+---------------+
///  | 15 14 13 12   | 11 10  9  8   |  7  6  5  4   |  3  2  1  0   |
///  |   Reserved    |    OpCode     |  Report Type  |   Report ID   |
///  |    (0000)     |  (4 bits)     |  (4 bits)     |   (4 bits)    |
///  +---------------+---------------+---------------+---------------+
/// =========================================================================================
/// </summary>
public enum HidCommandOpCode : byte
{
    Reserved     = 0x00,
    Reset        = 0x01, // Host triggers soft-reset of HID device
    GetReport    = 0x02, // Host requests specific report from device
    SetReport    = 0x03, // Host sends report to device
    GetIdle      = 0x04, // Reads idle rate
    SetIdle      = 0x05, // Sets idle rate
    GetProtocol  = 0x06, // Reads active protocol (Boot / Report)
    SetProtocol  = 0x07, // Sets active protocol
    SetPower     = 0x08  // Sets power state: 0 = Sleep / Low-Power, 1 = On / Active
}

public enum HidReportType : byte
{
    None    = 0x00,
    Input   = 0x01,
    Output  = 0x02,
    Feature = 0x03
}

public enum HidPowerState : byte
{
    Sleep = 0x00, // Device in low-power sleep state (clocks stopped, minimal leakage)
    On    = 0x01  // Device fully awake and active
}

/// <summary>
/// =========================================================================================
///  DATA PACKET FRAMING OVER I2C
/// =========================================================================================
///
///  All data transferred via Input, Output, and Feature reports on I2C must begin with
///  a 2-byte Length header in little-endian format:
///
///  +----------------+----------------+----------------+-------------------------+
///  |  Byte 0 (LSB)  |  Byte 1 (MSB)  |  Byte 2 (Opt)  |  Byte 3 .. N            |
///  +----------------+----------------+----------------+-------------------------+
///  |       Total Packet Length       |   Report ID    | HID Report Payload Data |
///  | (Includes these 2 length bytes)| (If specified) | (Defined by ReportDesc) |
///  +----------------+----------------+----------------+-------------------------+
///
///  Rule: Total Packet Length = 2 (Length Field) + Payload Length (including Report ID).
///  If Length == 0x0000 or 0x0002 without data, no report is pending.
/// =========================================================================================
/// </summary>
public record HidPacket
{
    public ushort TotalLength => (ushort)(2 + Payload.Length);
    public byte[] Payload { get; init; } = Array.Empty<byte>();

    public byte[] ToWireBytes()
    {
        byte[] wire = new byte[2 + Payload.Length];
        wire[0] = (byte)(TotalLength & 0xFF);
        wire[1] = (byte)((TotalLength >> 8) & 0xFF);
        Array.Copy(Payload, 0, wire, 2, Payload.Length);
        return wire;
    }

    public static HidPacket FromWireBytes(byte[] wire)
    {
        if (wire.Length < 2)
            return new HidPacket { Payload = Array.Empty<byte>() };

        ushort length = (ushort)(wire[0] | (wire[1] << 8));
        if (length <= 2)
            return new HidPacket { Payload = Array.Empty<byte>() };

        int payloadLen = Math.Min(wire.Length - 2, length - 2);
        byte[] payload = new byte[payloadLen];
        Array.Copy(wire, 2, payload, 0, payloadLen);
        return new HidPacket { Payload = payload };
    }
}
