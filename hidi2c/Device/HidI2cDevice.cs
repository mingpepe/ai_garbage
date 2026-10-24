using System.Collections.Concurrent;
using HidI2cSimulation.Hardware;
using HidI2cSimulation.Protocol;

namespace HidI2cSimulation.Device;

/// <summary>
/// =========================================================================================
///  SIMULATED HID OVER I2C SLAVE DEVICE (PRECISION TOUCHPAD & DIGITIZER)
/// =========================================================================================
///
///  This class emulates a real-world touchpad microcontroller (e.g. Synaptics / Elan / Goodix)
///  interfacing with the Host SoC over I2C and GPIO INT# lines.
///
///  REGISTER ARCHITECTURE (MICROSOFT SPEC V1.00):
///  ---------------------------------------------
///  Address | Register Name           | Description
///  --------+-------------------------+---------------------------------------------------
///   0x0001 | wHIDDescRegister        | 30-byte Microsoft HID Descriptor
///   0x0020 | wReportDescRegister     | USB-IF Report Descriptor bytecode
///   0x0005 | wInputRegister          | Input Reports (prefixed with 2-byte Length header)
///   0x0006 | wOutputRegister         | Output Reports sent by Host
///   0x0007 | wCommandRegister        | 16-bit Command OpCode + ReportType + ReportID
///   0x0008 | wDataRegister           | Command payload data buffer
///
///  INTERRUPT ASSERTION TIMING:
///  ---------------------------
///  Whenever user touches the trackpad, the internal sensor scan detects finger presence:
///  1. Microcontroller formats an 8-byte Input Report.
///  2. Packet is pushed into the Hardware Input FIFO.
///  3. Hardware pulls INT# line LOW (AssertActiveLow).
///  4. Host Interrupt Controller fires -> Host reads 0x0005 (wInputRegister).
///  5. FIFO dequeues. If empty, INT# line is released HIGH (ReleaseActiveLow).
/// =========================================================================================
/// </summary>
public class HidI2cDevice : II2CSlave
{
    public byte I2CAddress { get; }
    public string DeviceName { get; }
    public GpioPin InterruptPin { get; }
    public GpioPin? ResetPin { get; }

    // Register Map
    public const ushort RegHidDesc = 0x0001;
    public const ushort RegReportDesc = 0x0020;
    public const ushort RegInput = 0x0005;
    public const ushort RegOutput = 0x0006;
    public const ushort RegCommand = 0x0007;
    public const ushort RegData = 0x0008;

    private readonly HidDescriptor _hidDescriptor;
    private readonly byte[] _reportDescriptor;
    private readonly ConcurrentQueue<byte[]> _inputQueue = new();

    // Device Internal State
    public HidPowerState PowerState { get; private set; } = HidPowerState.Sleep;
    public byte DeviceMode { get; private set; } = 1; // 1 = Precision Touchpad, 0 = Legacy Mouse
    public byte HapticClickIntensity { get; private set; } = 75; // 75% default
    public bool IsResetPending { get; private set; } = false;

    // Last known touch state
    private ushort _curX = 2048;
    private ushort _curY = 2048;
    private bool _inContact = false;

    public event Action<string>? OnDeviceLog;

    public HidI2cDevice(byte i2cAddress, string deviceName, GpioPin interruptPin, GpioPin? resetPin = null)
    {
        I2CAddress = i2cAddress;
        DeviceName = deviceName;
        InterruptPin = interruptPin;
        ResetPin = resetPin;

        _reportDescriptor = HidReportDescriptorBuilder.CreateTouchpadReportDescriptor();

        _hidDescriptor = new HidDescriptor
        {
            HIDDescLength = HidI2cConstants.StandardHidDescLength,
            BcdVersion = HidI2cConstants.ProtocolVersionBcd100,
            ReportDescLength = (ushort)_reportDescriptor.Length,
            ReportDescRegister = RegReportDesc,
            InputRegister = RegInput,
            MaxInputLength = 10,     // 2 length bytes + 8 bytes payload
            OutputRegister = RegOutput,
            MaxOutputLength = 8,
            CommandRegister = RegCommand,
            DataRegister = RegData,
            VendorId = 0x04F3,       // Elan Microelectronics Corp
            ProductId = 0x2718,      // Precision Touchpad Controller
            VersionId = 0x0100       // Firmware v1.0.0
        };

        if (ResetPin != null)
        {
            ResetPin.FallingEdge += pin =>
            {
                OnDeviceLog?.Invoke($"[DEVICE] Hardware RESET# asserted (LOW)! Reinitializing controller silicon...");
                PerformHardwareReset();
            };
        }
    }

    private void PerformHardwareReset()
    {
        _inputQueue.Clear();
        PowerState = HidPowerState.Sleep;
        IsResetPending = true;
        InterruptPin.ReleaseActiveLow(); // Floats high
        OnDeviceLog?.Invoke("[DEVICE] Hardware reset completed. Clocks in low-power sleep mode.");
    }

    /// <summary>
    /// Handles I2C Read transactions from the Host.
    /// </summary>
    public byte[] HandleRead(ushort registerAddress, int requestedLength)
    {
        switch (registerAddress)
        {
            case RegHidDesc:
                OnDeviceLog?.Invoke($"[DEVICE] Reading 30-byte Microsoft HID Descriptor (Reg 0x{RegHidDesc:X4})");
                return _hidDescriptor.ToBytes();

            case RegReportDesc:
                OnDeviceLog?.Invoke($"[DEVICE] Reading {_reportDescriptor.Length}-byte USB-IF Report Descriptor (Reg 0x{RegReportDesc:X4})");
                return _reportDescriptor;

            case RegInput:
                return HandleInputRegisterRead(requestedLength);

            case RegData:
                OnDeviceLog?.Invoke($"[DEVICE] Reading Command Data Register (Reg 0x{RegData:X4})");
                // Return current feature report data if queried
                byte[] featureResp = new byte[] { 0x02, DeviceMode, HapticClickIntensity };
                var pkt = new HidPacket { Payload = featureResp };
                return pkt.ToWireBytes();

            default:
                OnDeviceLog?.Invoke($"[DEVICE] Read from unknown register 0x{registerAddress:X4}");
                return new byte[requestedLength];
        }
    }

    private byte[] HandleInputRegisterRead(int requestedLength)
    {
        if (_inputQueue.TryDequeue(out byte[]? reportPayload))
        {
            var packet = new HidPacket { Payload = reportPayload };
            byte[] wireBytes = packet.ToWireBytes();

            OnDeviceLog?.Invoke($"[DEVICE] Dequeued input report ({wireBytes.Length} wire bytes). Remaining in FIFO: {_inputQueue.Count}");

            // If queue is now empty, release INT# line
            if (_inputQueue.IsEmpty)
            {
                InterruptPin.ReleaseActiveLow();
                OnDeviceLog?.Invoke("[DEVICE] Input FIFO empty -> INT# released HIGH (idle).");
            }

            return wireBytes;
        }

        // No report pending: return 2 bytes with length 0x0000
        OnDeviceLog?.Invoke("[DEVICE] wInputRegister read, but no packet pending. Returning Length=0.");
        InterruptPin.ReleaseActiveLow();
        return new byte[] { 0x00, 0x00 };
    }

    /// <summary>
    /// Handles I2C Write transactions from the Host.
    /// </summary>
    public bool HandleWrite(ushort registerAddress, byte[] data)
    {
        switch (registerAddress)
        {
            case RegCommand:
                return HandleCommandRegisterWrite(data);

            case RegOutput:
                OnDeviceLog?.Invoke($"[DEVICE] Received Output Report ({data.Length} bytes)");
                return true;

            case RegData:
                OnDeviceLog?.Invoke($"[DEVICE] Received Data Register write ({data.Length} bytes)");
                if (data.Length >= 3 && data[0] == 0x02) // Feature Report 0x02
                {
                    DeviceMode = data[1];
                    HapticClickIntensity = data[2];
                    OnDeviceLog?.Invoke($"[DEVICE] Feature updated: DeviceMode={DeviceMode}, Haptic={HapticClickIntensity}%");
                }
                return true;

            default:
                OnDeviceLog?.Invoke($"[DEVICE] Write to unknown register 0x{registerAddress:X4}");
                return false;
        }
    }

    private bool HandleCommandRegisterWrite(byte[] data)
    {
        if (data.Length < 2) return false;

        ushort commandWord = (ushort)(data[0] | (data[1] << 8));
        var opcode = (HidCommandOpCode)((commandWord >> 8) & 0x0F);
        var reportType = (HidReportType)((commandWord >> 4) & 0x0F);
        byte reportId = (byte)(commandWord & 0x0F);

        OnDeviceLog?.Invoke($"[DEVICE] Command Received: OpCode={opcode} (0x{(byte)opcode:X2}), ReportType={reportType}, ReportID=0x{reportId:X2}");

        switch (opcode)
        {
            case HidCommandOpCode.Reset:
                OnDeviceLog?.Invoke("[DEVICE] Soft RESET command processed. Resetting state machine...");
                _inputQueue.Clear();
                InterruptPin.ReleaseActiveLow();
                // When reset completes, spec requires asserting INT# with a 0-length reset notification
                // or returning to ready state.
                return true;

            case HidCommandOpCode.SetPower:
                // Bit 0 of lower byte or parameter controls power
                // In standard Microsoft HIDI2C spec:
                // Command = (0x08 << 8) | (PowerState & 0x03)
                byte powerParam = (byte)(commandWord & 0x03);
                PowerState = (powerParam == 0x00) ? HidPowerState.On : HidPowerState.Sleep;
                // Note: In Microsoft HIDI2C spec: 0x00 is ON, 0x01 is SLEEP (or inverted depending on vendor)
                // We'll normalize: 0 = ON, 1 = SLEEP
                OnDeviceLog?.Invoke($"[DEVICE] SET_POWER command executed. New Power State: {PowerState}");
                return true;

            case HidCommandOpCode.GetReport:
                OnDeviceLog?.Invoke($"[DEVICE] GET_REPORT requested for Type={reportType}, ID={reportId}");
                return true;

            case HidCommandOpCode.SetReport:
                OnDeviceLog?.Invoke($"[DEVICE] SET_REPORT ready for Type={reportType}, ID={reportId}");
                return true;

            default:
                OnDeviceLog?.Invoke($"[DEVICE] Unhandled OpCode: {opcode}");
                return true;
        }
    }

    /// <summary>
    /// Simulates a finger touching the trackpad.
    /// Formats an input report, pushes to FIFO, and pulls INT# LOW.
    /// </summary>
    public void SimulateTouch(ushort x, ushort y, bool leftBtn = false, bool rightBtn = false, byte fingers = 1, bool inContact = true, byte pressure = 35)
    {
        _curX = Math.Clamp(x, (ushort)0, (ushort)4095);
        _curY = Math.Clamp(y, (ushort)0, (ushort)4095);
        _inContact = inContact;

        byte buttonBits = 0;
        if (leftBtn) buttonBits |= 0x01;
        if (rightBtn) buttonBits |= 0x02;

        byte touchFlags = 0;
        if (inContact) touchFlags |= 0x01; // Tip Switch
        touchFlags |= 0x02;                // Confidence
        touchFlags |= (byte)((pressure & 0x3F) << 2);

        byte[] payload = new byte[8]
        {
            0x01,                          // Report ID = 1
            buttonBits,                    // Buttons
            (byte)(_curX & 0xFF),          // X LSB
            (byte)((_curX >> 8) & 0xFF),   // X MSB
            (byte)(_curY & 0xFF),          // Y LSB
            (byte)((_curY >> 8) & 0xFF),   // Y MSB
            fingers,                       // Contact count
            touchFlags                     // Tip Switch / Pressure
        };

        _inputQueue.Enqueue(payload);
        OnDeviceLog?.Invoke($"[DEVICE] Touch Event Enqueued -> Pos:({_curX}, {_curY}), Fingers:{fingers}, Contact:{inContact}");
        OnDeviceLog?.Invoke("[DEVICE] *** INT# PIN PULLED LOW! Host GPIO Interrupt triggered! ***");

        // Assert Active-Low Interrupt pin (PULL LOW!)
        InterruptPin.AssertActiveLow();
    }

    public void SimulateFingerRelease()
    {
        SimulateTouch(_curX, _curY, leftBtn: false, rightBtn: false, fingers: 0, inContact: false, pressure: 0);
    }
}
