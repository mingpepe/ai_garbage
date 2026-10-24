using HidI2cSimulation.Hardware;
using HidI2cSimulation.Protocol;

namespace HidI2cSimulation.Host;

/// <summary>
/// =========================================================================================
///  HOST OS HID-OVER-I2C DRIVER (WINDOWS hidi2c.sys / LINUX i2c-hid EMULATION)
/// =========================================================================================
///
///  This class simulates how an operating system driver initializes, enumerates,
///  and services a HID-over-I2C device.
///
///  THE ENUMERATION SEQUENCE (STEP-BY-STEP):
///  ----------------------------------------
///  1. ACPI Discovery (_CRS & _DSM):
///     OS queries ACPI DSDT/SSDT table for device (e.g., "PNP0C50").
///     - Retrieves I2C slave address (e.g. 0x20).
///     - Retrieves GPIO Interrupt line configuration.
///     - Calls _DSM (Device Specific Method) with GUID {3CDFF6F7-4267-4555-AD05-B30A3D8938DE}
///       Function 1 to obtain the 16-bit HID Descriptor Register Address (0x0001).
///
///  2. Hardware Power & Reset:
///     - Toggles RESET# GPIO pin (Active-Low) if present to cold-boot peripheral silicon.
///
///  3. Read 30-Byte HID Descriptor:
///     - Reads 30 bytes from register 0x0001.
///     - Validates bcdVersion == 0x0100 and descriptor length == 30.
///     - Learns register addresses for Input, Output, Command, Data, and Report Descriptor.
///
///  4. Send Soft RESET Command:
///     - Writes RESET opcode (0x01) to wCommandRegister.
///
///  5. Read Report Descriptor:
///     - Reads wReportDescLength bytes from wReportDescRegister.
///     - Parses USB-IF items (Usage Pages, Buttons, Coordinates, Collections).
///
///  6. Send SET_POWER (Active / ON) Command:
///     - Writes SET_POWER opcode (0x08) with parameter 0x00 (ON) to wCommandRegister.
///
///  7. Hook GPIO Interrupt (INT#):
///     - When INT# falls LOW, ISR initiates I2C read to wInputRegister.
/// =========================================================================================
/// </summary>
public class HidI2cHostDriver
{
    private readonly I2CBus _i2cBus;
    private readonly GpioPin _interruptPin;
    private readonly GpioPin? _resetPin;

    public byte TargetSlaveAddress { get; private set; }
    public ushort HidDescriptorRegister { get; private set; }
    public HidDescriptor? DeviceDescriptor { get; private set; }
    public byte[]? RawReportDescriptor { get; private set; }
    public bool IsEnumerated { get; private set; } = false;

    public event Action<string>? OnDriverLog;
    public event Action<TouchpadInputReport>? OnInputReportReceived;

    public HidI2cHostDriver(I2CBus bus, GpioPin interruptPin, GpioPin? resetPin = null)
    {
        _i2cBus = bus;
        _interruptPin = interruptPin;
        _resetPin = resetPin;

        // Register hardware interrupt handler (Active-Low Falling Edge)
        _interruptPin.FallingEdge += pin =>
        {
            if (IsEnumerated)
            {
                OnHardwareInterrupt();
            }
        };
    }

    /// <summary>
    /// Simulates ACPI query discovering the device.
    /// In Windows, this is evaluated by ACPI.sys and passed to HIDI2C.SYS.
    /// In Linux, this is parsed from ACPI DSDT or Device Tree.
    /// </summary>
    public void DiscoverViaAcpi(byte slaveAddress = 0x20, ushort hidDescRegister = 0x0001)
    {
        TargetSlaveAddress = slaveAddress;
        HidDescriptorRegister = hidDescRegister;

        OnDriverLog?.Invoke("[ACPI] Discovered ACPI device: Hardware ID: PNP0C50 (Microsoft HID over I2C Device)");
        OnDriverLog?.Invoke($"[ACPI] _CRS Resource: I2C Slave Address = 0x{TargetSlaveAddress:X2}, 400kHz Fast-Mode");
        OnDriverLog?.Invoke($"[ACPI] _CRS Resource: GPIO Interrupt Pin = {_interruptPin.Name} (Active-Low, Level-Sensitive)");
        OnDriverLog?.Invoke($"[ACPI] _DSM Query (GUID {HidI2cConstants.AcpiDsmGuid}): HID Descriptor Register = 0x{HidDescriptorRegister:X4}");
    }

    /// <summary>
    /// Executes the full HID-over-I2C host enumeration sequence.
    /// </summary>
    public bool InitializeAndEnumerate()
    {
        OnDriverLog?.Invoke("\n==================== [HOST] STARTING DEVICE ENUMERATION ====================");

        // Step 1: Hardware Reset (if pin wired)
        if (_resetPin != null)
        {
            OnDriverLog?.Invoke("[HOST] Step 1: Asserting hardware RESET# line (PULL LOW for 10ms)...");
            _resetPin.AssertActiveLow();
            Thread.Sleep(10);
            OnDriverLog?.Invoke("[HOST] Step 1: Releasing hardware RESET# line (PULL HIGH)...");
            _resetPin.ReleaseActiveLow();
            Thread.Sleep(20); // Allow peripheral PLL/internal regulators to settle
        }

        // Step 2: Read 30-byte HID Descriptor
        OnDriverLog?.Invoke($"[HOST] Step 2: Fetching 30-byte HID Descriptor from Register 0x{HidDescriptorRegister:X4}...");
        byte[] hidDescRaw = _i2cBus.Read(TargetSlaveAddress, HidDescriptorRegister, 30);
        if (hidDescRaw.Length < 30)
        {
            OnDriverLog?.Invoke("[HOST] ERROR: Failed to read 30-byte HID Descriptor!");
            return false;
        }

        DeviceDescriptor = HidDescriptor.FromBytes(hidDescRaw);
        OnDriverLog?.Invoke($"[HOST] Successfully parsed HID Descriptor: VID=0x{DeviceDescriptor.VendorId:X4}, PID=0x{DeviceDescriptor.ProductId:X4}, REV=0x{DeviceDescriptor.VersionId:X4}");
        OnDriverLog?.Invoke($"[HOST]   - wReportDescRegister: 0x{DeviceDescriptor.ReportDescRegister:X4} (Length: {DeviceDescriptor.ReportDescLength} bytes)");
        OnDriverLog?.Invoke($"[HOST]   - wInputRegister:      0x{DeviceDescriptor.InputRegister:X4} (MaxInputLength: {DeviceDescriptor.MaxInputLength})");
        OnDriverLog?.Invoke($"[HOST]   - wOutputRegister:     0x{DeviceDescriptor.OutputRegister:X4}");
        OnDriverLog?.Invoke($"[HOST]   - wCommandRegister:    0x{DeviceDescriptor.CommandRegister:X4}");
        OnDriverLog?.Invoke($"[HOST]   - wDataRegister:       0x{DeviceDescriptor.DataRegister:X4}");

        // Step 3: Issue Soft RESET Command
        OnDriverLog?.Invoke($"[HOST] Step 3: Sending Soft RESET Command to wCommandRegister (0x{DeviceDescriptor.CommandRegister:X4})...");
        ushort resetCmd = ((ushort)HidCommandOpCode.Reset << 8);
        byte[] resetPayload = new byte[] { (byte)(resetCmd & 0xFF), (byte)((resetCmd >> 8) & 0xFF) };
        _i2cBus.Write(TargetSlaveAddress, DeviceDescriptor.CommandRegister, resetPayload);
        Thread.Sleep(10);

        // Step 4: Read USB-IF HID Report Descriptor
        OnDriverLog?.Invoke($"[HOST] Step 4: Fetching {DeviceDescriptor.ReportDescLength}-byte Report Descriptor from 0x{DeviceDescriptor.ReportDescRegister:X4}...");
        RawReportDescriptor = _i2cBus.Read(TargetSlaveAddress, DeviceDescriptor.ReportDescRegister, DeviceDescriptor.ReportDescLength);
        if (RawReportDescriptor.Length != DeviceDescriptor.ReportDescLength)
        {
            OnDriverLog?.Invoke("[HOST] ERROR: Report Descriptor read mismatch!");
            return false;
        }
        OnDriverLog?.Invoke($"[HOST] Received {RawReportDescriptor.Length} bytes of Report Descriptor. Parsing HID item collection...");

        // Step 5: Power Management - Set Power ON
        OnDriverLog?.Invoke($"[HOST] Step 5: Setting Device Power State to ON via wCommandRegister (0x{DeviceDescriptor.CommandRegister:X4})...");
        ushort powerCmd = (ushort)(((ushort)HidCommandOpCode.SetPower << 8) | 0x00); // 0x00 = ON
        byte[] powerPayload = new byte[] { (byte)(powerCmd & 0xFF), (byte)((powerCmd >> 8) & 0xFF) };
        _i2cBus.Write(TargetSlaveAddress, DeviceDescriptor.CommandRegister, powerPayload);

        IsEnumerated = true;
        OnDriverLog?.Invoke("==================== [HOST] ENUMERATION COMPLETE & READY ====================\n");
        return true;
    }

    /// <summary>
    /// Interrupt Service Routine (ISR) triggered by hardware GPIO pin falling LOW.
    /// </summary>
    private void OnHardwareInterrupt()
    {
        if (!IsEnumerated || DeviceDescriptor == null)
            return;

        OnDriverLog?.Invoke("\n[HOST ISR] *** GPIO INTERRUPT (INT# LOW) DETECTED! Servicing peripheral... ***");

        // Host reads the wInputRegister. First 2 bytes are packet length.
        byte[] rawInput = _i2cBus.Read(TargetSlaveAddress, DeviceDescriptor.InputRegister, DeviceDescriptor.MaxInputLength);
        if (rawInput.Length < 2)
        {
            OnDriverLog?.Invoke("[HOST ISR] Empty read or bus failure.");
            return;
        }

        var packet = HidPacket.FromWireBytes(rawInput);
        if (packet.Payload.Length == 0)
        {
            OnDriverLog?.Invoke("[HOST ISR] Read Length == 0 or 2 (No pending report).");
            return;
        }

        OnDriverLog?.Invoke($"[HOST ISR] Received Input Packet Payload ({packet.Payload.Length} bytes): [{string.Join(" ", packet.Payload.Select(b => $"0x{b:X2}"))}]");

        var report = HidReportParser.ParseInputReport(packet.Payload);
        if (report != null)
        {
            OnDriverLog?.Invoke($"[HOST INPUT SUBSYSTEM] Decoded Input: {report}");
            OnInputReportReceived?.Invoke(report);
        }
        else
        {
            OnDriverLog?.Invoke("[HOST INPUT SUBSYSTEM] Unknown or unhandled Report ID.");
        }
    }

    /// <summary>
    /// Demonstrates Host sending a Feature Report to the device to configure haptics/mode.
    /// </summary>
    public bool SetTouchpadFeature(byte mode, byte hapticIntensity)
    {
        if (!IsEnumerated || DeviceDescriptor == null) return false;

        OnDriverLog?.Invoke($"[HOST] Sending Feature Report 0x02 (Mode={mode}, Haptic={hapticIntensity}%)...");

        // 1. Write Feature data to wDataRegister
        byte[] featureData = new byte[] { 0x02, mode, hapticIntensity };
        _i2cBus.Write(TargetSlaveAddress, DeviceDescriptor.DataRegister, featureData);

        // 2. Issue SET_REPORT command for Feature (ReportType=3, ReportID=2)
        ushort cmd = (ushort)(((ushort)HidCommandOpCode.SetReport << 8) | ((byte)HidReportType.Feature << 4) | 0x02);
        byte[] cmdBytes = new byte[] { (byte)(cmd & 0xFF), (byte)((cmd >> 8) & 0xFF) };
        _i2cBus.Write(TargetSlaveAddress, DeviceDescriptor.CommandRegister, cmdBytes);

        OnDriverLog?.Invoke("[HOST] Feature Report successfully applied!");
        return true;
    }
}
