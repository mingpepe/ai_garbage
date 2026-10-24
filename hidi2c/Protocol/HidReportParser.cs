using System.Text;

namespace HidI2cSimulation.Protocol;

/// <summary>
/// =========================================================================================
///  USB-IF HID REPORT DESCRIPTOR & REPORT PARSER
/// =========================================================================================
///
///  WHAT IS A REPORT DESCRIPTOR?
///  -----------------------------
///  In the USB HID architecture (and inherited by HID-over-I2C), the Report Descriptor
///  is a state-machine bytecode sequence that informs the Operating System:
///    1. What physical controls exist on the hardware (Buttons, X/Y axes, Touch contacts).
///    2. How the raw bytes transferred over I2C correspond to those controls.
///    3. The minimum/maximum mathematical ranges, units, and bit-sizes of each field.
///
///  Because of this, an OS driver like Windows 'hidi2c.sys' or Linux 'i2c-hid' does NOT
///  need hardcoded knowledge about the touchpad's resolution or packet format!
///
///  PACKET STRUCTURE DECODED IN THIS SIMULATOR:
///
///  Report ID 0x01: Precision Touchpad Input Report (8 bytes payload)
///  +--------+--------+--------+--------+--------+--------+--------+--------+
///  | Byte 0 | Byte 1 | Byte 2 | Byte 3 | Byte 4 | Byte 5 | Byte 6 | Byte 7 |
///  +--------+--------+--------+--------+--------+--------+--------+--------+
///  | Report | Button |  X-Coordinate   |  Y-Coordinate   | Contact| Touch  |
///  |   ID   | Bitmask|  (0 .. 4095)    |  (0 .. 4095)    | Count  | Flags &|
///  | (0x01) | L/R/M  |  LSB   |  MSB   |  LSB   |  MSB   | (1..5) |Pressure|
///  +--------+--------+--------+--------+--------+--------+--------+--------+
///
///  Report ID 0x02: Feature Report (Touchpad Configuration)
///  +--------+--------------------------+---------------------------+
///  | Byte 0 | Byte 1                   | Byte 2                    |
///  +--------+--------------------------+---------------------------+
///  | Report | Operating Mode           | Haptic Click Intensity    |
///  |   ID   | 0 = Legacy Mouse         | (0 to 100%)               |
///  | (0x02) | 1 = Precision Touchpad   |                           |
///  +--------+--------------------------+---------------------------+
/// =========================================================================================
/// </summary>

public record TouchpadInputReport(
    byte ReportId,
    bool LeftButton,
    bool RightButton,
    bool MiddleButton,
    ushort X,
    ushort Y,
    byte ContactCount,
    bool TipSwitch,
    bool Confidence,
    byte Pressure
)
{
    public override string ToString() =>
        $"[Touchpad Event] ID:{ReportId} | Pos:({X,4}, {Y,4}) | Fingers:{ContactCount} | " +
        $"Buttons:[{(LeftButton ? "L" : "-")}{(RightButton ? "R" : "-")}{(MiddleButton ? "M" : "-")}] | " +
        $"Touch:{(TipSwitch ? "Down" : "Up")} | Conf:{(Confidence ? "Yes" : "No")} | Pressure:{Pressure}";
}

public record TouchpadFeatureReport(
    byte ReportId,
    byte OperatingMode,      // 0 = Mouse, 1 = Precision Touchpad
    byte HapticIntensity     // 0..100
);

public static class HidReportParser
{
    /// <summary>
    /// Builds a genuine USB-IF compliant HID Report Descriptor for a Precision Touchpad
    /// and Configuration Feature report.
    /// </summary>
    public static byte[] CreateTouchpadReportDescriptor()
    {
        return new byte[]
        {
            // ---------------------------------------------------------------------
            // REPORT ID 1: Precision Touchpad / Digitizer Application
            // ---------------------------------------------------------------------
            0x05, 0x0D,        // USAGE_PAGE (Digitizers)
            0x09, 0x05,        // USAGE (Touch Pad)
            0xA1, 0x01,        // COLLECTION (Application)
            0x85, 0x01,        //   REPORT_ID (1)

            // Collection (Physical Contact)
            0x05, 0x0D,        //   USAGE_PAGE (Digitizers)
            0x09, 0x22,        //   USAGE (Finger)
            0xA1, 0x02,        //   COLLECTION (Logical)

            // Button Bitmask (3 bits of buttons + 5 bits padding)
            0x05, 0x09,        //     USAGE_PAGE (Button)
            0x19, 0x01,        //     USAGE_MINIMUM (Button 1: Left)
            0x29, 0x03,        //     USAGE_MAXIMUM (Button 3: Middle)
            0x15, 0x00,        //     LOGICAL_MINIMUM (0)
            0x25, 0x01,        //     LOGICAL_MAXIMUM (1)
            0x75, 0x01,        //     REPORT_SIZE (1 bit)
            0x95, 0x03,        //     REPORT_COUNT (3 fields)
            0x81, 0x02,        //     INPUT (Data,Var,Abs)

            // Button padding (5 bits to align to 1 byte)
            0x95, 0x05,        //     REPORT_COUNT (5 fields)
            0x81, 0x03,        //     INPUT (Const,Var,Abs)

            // X and Y Absolute Coordinates (16-bit, 0..4095)
            0x05, 0x01,        //     USAGE_PAGE (Generic Desktop)
            0x09, 0x30,        //     USAGE (X)
            0x15, 0x00,        //     LOGICAL_MINIMUM (0)
            0x26, 0xFF, 0x0F,  //     LOGICAL_MAXIMUM (4095)
            0x75, 0x10,        //     REPORT_SIZE (16 bits)
            0x95, 0x01,        //     REPORT_COUNT (1)
            0x81, 0x02,        //     INPUT (Data,Var,Abs)

            0x09, 0x31,        //     USAGE (Y)
            0x15, 0x00,        //     LOGICAL_MINIMUM (0)
            0x26, 0xFF, 0x0F,  //     LOGICAL_MAXIMUM (4095)
            0x75, 0x10,        //     REPORT_SIZE (16 bits)
            0x95, 0x01,        //     REPORT_COUNT (1)
            0x81, 0x02,        //     INPUT (Data,Var,Abs)

            // Contact Count (Number of active fingers: 1..5)
            0x05, 0x0D,        //     USAGE_PAGE (Digitizers)
            0x09, 0x54,        //     USAGE (Contact Count)
            0x15, 0x00,        //     LOGICAL_MINIMUM (0)
            0x25, 0x0A,        //     LOGICAL_MAXIMUM (10)
            0x75, 0x08,        //     REPORT_SIZE (8 bits)
            0x95, 0x01,        //     REPORT_COUNT (1)
            0x81, 0x02,        //     INPUT (Data,Var,Abs)

            // Tip Switch (1 bit), Confidence (1 bit), Pressure (6 bits)
            0x09, 0x42,        //     USAGE (Tip Switch / In-Contact)
            0x09, 0x47,        //     USAGE (Confidence)
            0x15, 0x00,        //     LOGICAL_MINIMUM (0)
            0x25, 0x01,        //     LOGICAL_MAXIMUM (1)
            0x75, 0x01,        //     REPORT_SIZE (1 bit)
            0x95, 0x02,        //     REPORT_COUNT (2)
            0x81, 0x02,        //     INPUT (Data,Var,Abs)

            0x09, 0x30,        //     USAGE (Tip Pressure)
            0x15, 0x00,        //     LOGICAL_MINIMUM (0)
            0x25, 0x3F,        //     LOGICAL_MAXIMUM (63)
            0x75, 0x06,        //     REPORT_SIZE (6 bits)
            0x95, 0x01,        //     REPORT_COUNT (1)
            0x81, 0x02,        //     INPUT (Data,Var,Abs)

            0xC0,              //   END_COLLECTION (Logical)

            // ---------------------------------------------------------------------
            // REPORT ID 2: Feature Report (Device Configuration & Haptics)
            // ---------------------------------------------------------------------
            0x85, 0x02,        //   REPORT_ID (2)
            0x05, 0x0D,        //   USAGE_PAGE (Digitizers)
            0x09, 0x52,        //   USAGE (Device Mode)
            0x15, 0x00,        //   LOGICAL_MINIMUM (0)
            0x25, 0x0A,        //   LOGICAL_MAXIMUM (10)
            0x75, 0x08,        //   REPORT_SIZE (8 bits)
            0x95, 0x01,        //   REPORT_COUNT (1)
            0xB1, 0x02,        //   FEATURE (Data,Var,Abs)

            0x05, 0x0E,        //   USAGE_PAGE (Haptics)
            0x09, 0x01,        //   USAGE (Auto Trigger Click Intensity)
            0x15, 0x00,        //   LOGICAL_MINIMUM (0)
            0x25, 0x64,        //   LOGICAL_MAXIMUM (100)
            0x75, 0x08,        //   REPORT_SIZE (8 bits)
            0x95, 0x01,        //   REPORT_COUNT (1)
            0xB1, 0x02,        //   FEATURE (Data,Var,Abs)

            0xC0               // END_COLLECTION (Application)
        };
    }

    /// <summary>
    /// Parses an 8-byte Input Report packet received over I2C.
    /// </summary>
    public static TouchpadInputReport? ParseInputReport(byte[] rawPayload)
    {
        if (rawPayload.Length < 8) return null;

        byte reportId = rawPayload[0];
        if (reportId != 0x01) return null;

        byte buttons = rawPayload[1];
        bool left = (buttons & 0x01) != 0;
        bool right = (buttons & 0x02) != 0;
        bool middle = (buttons & 0x04) != 0;

        ushort x = (ushort)(rawPayload[2] | (rawPayload[3] << 8));
        ushort y = (ushort)(rawPayload[4] | (rawPayload[5] << 8));
        byte contactCount = rawPayload[6];

        byte touchFlags = rawPayload[7];
        bool tipSwitch = (touchFlags & 0x01) != 0;
        bool confidence = (touchFlags & 0x02) != 0;
        byte pressure = (byte)((touchFlags >> 2) & 0x3F);

        return new TouchpadInputReport(reportId, left, right, middle, x, y, contactCount, tipSwitch, confidence, pressure);
    }

    /// <summary>
    /// Formats the raw byte array into an annotated human-readable Report Descriptor disassembly.
    /// </summary>
    public static string DisassembleReportDescriptor(byte[] desc)
    {
        var sb = new StringBuilder();
        sb.AppendLine("+========================================================================================+");
        sb.AppendLine("| USB-IF HID REPORT DESCRIPTOR DISASSEMBLY (PARSED TREE)                                 |");
        sb.AppendLine("+========================================================================================+");

        int i = 0;
        int indent = 0;
        while (i < desc.Length)
        {
            byte b = desc[i++];
            int size = b & 0x03;
            if (size == 3) size = 4;
            int type = (b >> 2) & 0x03;
            int tag = (b >> 4) & 0x0F;

            uint val = 0;
            for (int s = 0; s < size && i < desc.Length; s++)
            {
                val |= ((uint)desc[i++] << (s * 8));
            }

            string itemText = GetItemDescription(type, tag, val);
            if (tag == 0x0C && type == 0) // End Collection
                indent = Math.Max(0, indent - 1);

            string pad = new string(' ', indent * 2);
            sb.AppendFormat("| 0x{0:X4} | {1}{2,-60} |\n", i - 1 - size, pad, itemText);

            if (tag == 0x0A && type == 0) // Collection
                indent++;
        }

        sb.AppendLine("+========================================================================================+");
        return sb.ToString();
    }

    private static string GetItemDescription(int type, int tag, uint val)
    {
        // Global Items (type 1)
        if (type == 1)
        {
            return tag switch
            {
                0x00 => $"USAGE_PAGE (0x{val:X2}: {GetUsagePageName(val)})",
                0x01 => $"LOGICAL_MINIMUM ({val})",
                0x02 => $"LOGICAL_MAXIMUM ({val})",
                0x03 => $"PHYSICAL_MINIMUM ({val})",
                0x04 => $"PHYSICAL_MAXIMUM ({val})",
                0x07 => $"REPORT_SIZE ({val} bits)",
                0x08 => $"REPORT_ID ({val})",
                0x09 => $"REPORT_COUNT ({val})",
                _ => $"GLOBAL_ITEM [Tag: 0x{tag:X}, Val: 0x{val:X}]"
            };
        }
        // Main Items (type 0)
        else if (type == 0)
        {
            return tag switch
            {
                0x08 => $"INPUT (0x{val:X2}) [{(val % 2 == 0 ? "Data" : "Const")}, {((val & 2) != 0 ? "Var" : "Array")}, {((val & 4) != 0 ? "Rel" : "Abs")}]",
                0x09 => $"OUTPUT (0x{val:X2})",
                0x0A => $"COLLECTION (0x{val:X2}: {(val == 1 ? "Application" : val == 2 ? "Logical" : "Physical")})",
                0x0B => $"FEATURE (0x{val:X2})",
                0x0C => "END_COLLECTION",
                _ => $"MAIN_ITEM [Tag: 0x{tag:X}, Val: 0x{val:X}]"
            };
        }
        // Local Items (type 2)
        else if (type == 2)
        {
            return tag switch
            {
                0x00 => $"USAGE (0x{val:X2}: {GetUsageName(val)})",
                0x01 => $"USAGE_MINIMUM ({val})",
                0x02 => $"USAGE_MAXIMUM ({val})",
                _ => $"LOCAL_ITEM [Tag: 0x{tag:X}, Val: 0x{val:X}]"
            };
        }

        return $"UNKNOWN_ITEM [Type:{type}, Tag:{tag}, Val:0x{val:X}]";
    }

    private static string GetUsagePageName(uint page) => page switch
    {
        0x01 => "Generic Desktop Controls",
        0x09 => "Button",
        0x0D => "Digitizers / Touch",
        0x0E => "Haptics",
        _ => $"Page 0x{page:X2}"
    };

    private static string GetUsageName(uint usage) => usage switch
    {
        0x01 => "Pointer",
        0x02 => "Mouse",
        0x05 => "Touch Pad",
        0x22 => "Finger",
        0x30 => "X / Tip Pressure",
        0x31 => "Y",
        0x42 => "Tip Switch (Touch In-Contact)",
        0x47 => "Confidence Flag",
        0x52 => "Device Mode",
        0x54 => "Contact Count",
        _ => $"Usage 0x{usage:X2}"
    };
}

public static class HidReportDescriptorBuilder
{
    public static byte[] CreateTouchpadReportDescriptor() => HidReportParser.CreateTouchpadReportDescriptor();
}
