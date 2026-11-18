using HidI2cSimulation.Hardware;
using HidI2cSimulation.Host;
using HidI2cSimulation.Protocol;

namespace HidI2cSimulation.Simulation;

public sealed record ComplianceTestResult(string TestName, bool Passed, string Detail);

/// <summary>
/// Runs the automated HID-over-I2C protocol compliance test suite against a clean session.
/// Shared by both Console and Visualizer apps.
/// </summary>
public static class ProtocolComplianceRunner
{
    public static IReadOnlyList<ComplianceTestResult> RunAll(HidI2cSimulationSession session)
    {
        var results = new List<ComplianceTestResult>();

        void Check(string name, bool condition, string failDetail)
        {
            results.Add(new ComplianceTestResult(name, condition, condition ? "PASS" : failDetail));
        }

        // Test 1: ACPI Discovery & Descriptor
        session.HostDriver.DiscoverViaAcpi(0x20, 0x0001);
        Check(
            "ACPI Discovery values populated",
            session.HostDriver.TargetSlaveAddress == 0x20 && session.HostDriver.HidDescriptorRegister == 0x0001,
            "Address mismatch");

        // Test 2: Read 30-byte HID Descriptor
        byte[] hidDescRaw = session.Bus.Read(0x20, 0x0001, 30);
        var parsedDesc = HidDescriptor.FromBytes(hidDescRaw);
        Check("30-Byte HID Descriptor Length", parsedDesc.HIDDescLength == 30, $"Got {parsedDesc.HIDDescLength}");
        Check("BCD Version is 0x0100 (v1.00)", parsedDesc.BcdVersion == 0x0100, $"Got 0x{parsedDesc.BcdVersion:X4}");
        Check("Vendor ID and Product ID valid", parsedDesc.VendorId == 0x04F3 && parsedDesc.ProductId == 0x2718, "VID/PID mismatch");

        // Test 3: Soft Reset Command
        ushort resetCmd = ((ushort)HidCommandOpCode.Reset << 8);
        byte[] resetPayload = new byte[] { (byte)(resetCmd & 0xFF), (byte)((resetCmd >> 8) & 0xFF) };
        bool resetAck = session.Bus.Write(0x20, parsedDesc.CommandRegister, resetPayload);
        Check("Soft RESET Command ACKed", resetAck, "Reset write failed");

        // Test 4: Report Descriptor Read
        byte[] repDesc = session.Bus.Read(0x20, parsedDesc.ReportDescRegister, parsedDesc.ReportDescLength);
        Check("Report Descriptor Byte Count Match", repDesc.Length == parsedDesc.ReportDescLength, $"Expected {parsedDesc.ReportDescLength}, got {repDesc.Length}");

        // Test 5: Power State Management
        ushort powerCmd = (ushort)(((ushort)HidCommandOpCode.SetPower << 8) | 0x00); // ON
        byte[] powerPayload = new byte[] { (byte)(powerCmd & 0xFF), (byte)((powerCmd >> 8) & 0xFF) };
        bool powerAck = session.Bus.Write(0x20, parsedDesc.CommandRegister, powerPayload);
        Check("SET_POWER (Active/ON) Command ACKed", powerAck && session.TouchpadDevice.PowerState == HidPowerState.On, "Power transition failed");

        // Test 6: Interrupt Line & Input Report FIFO (Manual read verification)
        bool prevAuto = session.HostDriver.AutoServiceInterrupts;
        session.HostDriver.AutoServiceInterrupts = false;
        try
        {
            session.TouchpadDevice.SimulateTouch(1000, 2000, leftBtn: true, rightBtn: false, fingers: 1, inContact: true, pressure: 50);
            Check("INT# Pin Pulled LOW on Input Event", session.InterruptPin.Read() == PinState.Low, "INT# not low");

            byte[] inputWire = session.Bus.Read(0x20, parsedDesc.InputRegister, parsedDesc.MaxInputLength);
            var pkt = HidPacket.FromWireBytes(inputWire);
            var decodedReport = HidReportParser.ParseInputReport(pkt.Payload);

            Check("Input Packet 2-Byte Length Header Valid", pkt.TotalLength == 10, $"Got {pkt.TotalLength}");
            Check("Input Report Decoded: Left Button Active", decodedReport != null && decodedReport.LeftButton, "Button not decoded");
            Check("Input Report Decoded: X/Y Coordinates Match", decodedReport != null && decodedReport.X == 1000 && decodedReport.Y == 2000, "Coord mismatch");
            Check("INT# Pin Released HIGH After Read", session.InterruptPin.Read() == PinState.High, "INT# still low");
        }
        finally
        {
            session.HostDriver.AutoServiceInterrupts = prevAuto;
        }

        // Ensure Host Driver state is marked enumerated
        if (!session.HostDriver.IsEnumerated)
        {
            session.HostDriver.InitializeAndEnumerate();
        }

        // Test 7: Feature Report Setting
        bool featureResult = session.HostDriver.SetTouchpadFeature(mode: 1, hapticIntensity: 85);
        Check("Feature Report Write (Mode=1, Haptic=85%)", featureResult && session.TouchpadDevice.HapticClickIntensity == 85, "Feature update failed");

        return results;
    }
}
