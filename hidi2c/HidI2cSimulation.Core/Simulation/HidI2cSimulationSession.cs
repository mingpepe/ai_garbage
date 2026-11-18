using HidI2cSimulation.Device;
using HidI2cSimulation.Hardware;
using HidI2cSimulation.Host;
using HidI2cSimulation.Protocol;

namespace HidI2cSimulation.Simulation;

public enum BootStepStage
{
    NotStarted = 0,
    AcpiDiscovered = 1,
    HardwareResetDone = 2,
    HidDescriptorRead = 3,
    SoftResetDone = 4,
    ReportDescriptorRead = 5,
    Ready = 6
}

/// <summary>
/// Unified simulation session shared across Console and GUI apps.
/// Coordinates Hardware (I2CBus, GpioPin), Peripheral (HidI2cDevice), Host Driver (HidI2cHostDriver),
/// Logic Analyzer Capture, and Component-to-Component communication logs.
/// </summary>
public sealed class HidI2cSimulationSession
{
    private readonly List<ComponentCommEvent> _commEvents = new();
    private int _nextSeq = 1;

    public SimulationTimeline Timeline { get; }
    public LogicAnalyzerCapture Capture { get; }
    public I2CBus Bus { get; }
    public GpioPin InterruptPin { get; }
    public GpioPin ResetPin { get; }
    public HidI2cDevice TouchpadDevice { get; }
    public HidI2cHostDriver HostDriver { get; }

    public BootStepStage CurrentBootStage { get; private set; } = BootStepStage.NotStarted;
    public IReadOnlyList<ComponentCommEvent> CommEvents => _commEvents;

    public event Action<ComponentCommEvent>? OnCommEvent;
    public event Action<BootStepStage>? OnBootStageChanged;

    public HidI2cSimulationSession(byte slaveAddress = 0x20, string deviceName = "Elan Precision Touchpad")
    {
        Timeline = new SimulationTimeline();
        Capture = new LogicAnalyzerCapture(Timeline);
        Bus = new I2CBus();

        InterruptPin = new GpioPin("GPIO_INT# (Pin 14)", PinDriveMode.OpenDrainWithPullUp, PinState.High);
        ResetPin = new GpioPin("GPIO_RST# (Pin 15)", PinDriveMode.PushPull, PinState.High);

        InterruptPin.AttachLogicAnalyzer(Capture, LogicChannelId.Int);
        ResetPin.AttachLogicAnalyzer(Capture, LogicChannelId.Reset);
        Bus.AttachLogicAnalyzer(Capture);

        TouchpadDevice = new HidI2cDevice(slaveAddress, deviceName, InterruptPin, ResetPin);
        Bus.RegisterSlave(TouchpadDevice);

        HostDriver = new HidI2cHostDriver(Bus, InterruptPin, ResetPin);
        HostDriver.AttachLogicAnalyzer(Capture);

        HostDriver.OnInputReportReceived += report =>
        {
            long now = Timeline.CurrentTimeNs;
            EmitComm(
                now,
                now,
                SimComponent.HostDriver,
                SimComponent.OsInput,
                CommChannel.HidInputReport,
                SimulationPhase.HostIsrRead,
                $"HID Input -> ({report.X}, {report.Y}) {(report.TipSwitch ? "Touch" : "Release")}",
                report.ToString());
        };
    }

    public void ResetSimulation()
    {
        _commEvents.Clear();
        _nextSeq = 1;
        HostDriver.ResetDriverState();
        TouchpadDevice.ResetToColdBoot();
        InterruptPin.ReleaseActiveLow();
        ResetPin.ReleaseActiveLow();
        Bus.ClearTrace();
        Capture.Clear(
            initialIntLevel: (byte)InterruptPin.CurrentState,
            initialResetLevel: (byte)ResetPin.CurrentState);
        SetBootStage(BootStepStage.NotStarted);
    }

    public void ClearTraces()
    {
        _commEvents.Clear();
        _nextSeq = 1;
        Bus.ClearTrace();
        Capture.Clear(
            initialIntLevel: (byte)InterruptPin.CurrentState,
            initialResetLevel: (byte)ResetPin.CurrentState);
    }

    /// <summary>
    /// Executes the next boot/enumeration stage in order (1 through 6).
    /// Returns false if already Ready.
    /// </summary>
    public bool ExecuteNextBootStep(bool blockWithThreadSleep = false)
    {
        switch (CurrentBootStage)
        {
            case BootStepStage.NotStarted:
                RunStepAcpiDiscovery();
                return true;

            case BootStepStage.AcpiDiscovered:
                RunStepHardwareReset(blockWithThreadSleep);
                return true;

            case BootStepStage.HardwareResetDone:
                return RunStepReadHidDescriptor();

            case BootStepStage.HidDescriptorRead:
                return RunStepSoftReset(blockWithThreadSleep);

            case BootStepStage.SoftResetDone:
                return RunStepReadReportDescriptor();

            case BootStepStage.ReportDescriptorRead:
                return RunStepSetPowerOn();

            default:
                return false;
        }
    }

    public void RunStepAcpiDiscovery(byte slaveAddress = 0x20, ushort hidDescRegister = 0x0001)
    {
        long t0 = Timeline.CurrentTimeNs;
        HostDriver.DiscoverViaAcpi(slaveAddress, hidDescRegister);
        Timeline.AdvanceUs(15);
        long t1 = Timeline.CurrentTimeNs;

        EmitComm(
            t0, t1,
            SimComponent.HostDriver,
            SimComponent.AcpiBios,
            CommChannel.AcpiMethod,
            SimulationPhase.AcpiDiscovery,
            "ACPI DSDT Query: _HID = PNP0C50, _CRS",
            $"Resolved I2C Slave=0x{slaveAddress:X2} (400kHz), GPIO14=INT#, GPIO15=RESET#");

        EmitComm(
            t1, t1,
            SimComponent.AcpiBios,
            SimComponent.HostDriver,
            CommChannel.AcpiMethod,
            SimulationPhase.AcpiDiscovery,
            $"ACPI _DSM(Fn=1) -> Reg 0x{hidDescRegister:X4}",
            $"GUID {HidI2cConstants.AcpiDsmGuid} returned HID Descriptor Register = 0x{hidDescRegister:X4}",
            $"0x{hidDescRegister:X4}");

        Capture.NotifyUpdated();
        SetBootStage(BootStepStage.AcpiDiscovered);
    }

    public void RunStepHardwareReset(bool blockWithThreadSleep = false)
    {
        long t0 = Timeline.CurrentTimeNs;
        HostDriver.StepHardwareReset(blockWithThreadSleep);
        long t1 = Timeline.CurrentTimeNs;

        EmitComm(
            t0, t1,
            SimComponent.HostDriver,
            SimComponent.SocController,
            CommChannel.ResetPin,
            SimulationPhase.HardwareReset,
            "Pulse GPIO_RST# LOW (Hardware Reset)",
            "Host SoC drives RESET# LOW then releases HIGH so peripheral PLL settles");

        EmitComm(
            t0, t1,
            SimComponent.PhysicalBus,
            SimComponent.HidDevice,
            CommChannel.ResetPin,
            SimulationPhase.HardwareReset,
            "RESET# Falling Edge -> Silicon Cold Reset",
            "Device clears FIFO, enters Sleep state, releases INT# HIGH");

        SetBootStage(BootStepStage.HardwareResetDone);
    }

    public bool RunStepReadHidDescriptor()
    {
        long t0 = Timeline.CurrentTimeNs;
        bool ok = HostDriver.StepReadHidDescriptor();
        long t1 = Timeline.CurrentTimeNs;
        int? txId = Capture.Transactions.LastOrDefault()?.Id;
        var desc = HostDriver.DeviceDescriptor;

        if (ok && desc != null)
        {
            string hex = string.Join(" ", desc.ToBytes().Take(12).Select(b => $"{b:X2}")) + " ...";
            EmitComm(
                t0, t1,
                SimComponent.HostDriver,
                SimComponent.SocController,
                CommChannel.I2cRead,
                SimulationPhase.HidDescriptorRead,
                $"I2C Read 30B HID Descriptor @ 0x{HostDriver.HidDescriptorRegister:X4}",
                $"S -> 0x{HostDriver.TargetSlaveAddress:X2}+W -> Reg 0x{HostDriver.HidDescriptorRegister:X4} -> Sr -> +R -> 30B -> P",
                hex,
                txId);

            EmitComm(
                t1, t1,
                SimComponent.HidDevice,
                SimComponent.HostDriver,
                CommChannel.I2cRead,
                SimulationPhase.HidDescriptorRead,
                $"30B HID Desc Parsed (VID:0x{desc.VendorId:X4} PID:0x{desc.ProductId:X4})",
                $"Input=0x{desc.InputRegister:X4} (Max {desc.MaxInputLength}B), Cmd=0x{desc.CommandRegister:X4}, RptDesc=0x{desc.ReportDescRegister:X4} ({desc.ReportDescLength}B)",
                null,
                txId);

            SetBootStage(BootStepStage.HidDescriptorRead);
        }

        return ok;
    }

    public bool RunStepSoftReset(bool blockWithThreadSleep = false)
    {
        if (HostDriver.DeviceDescriptor == null) return false;
        long t0 = Timeline.CurrentTimeNs;
        bool ok = HostDriver.StepSoftReset(blockWithThreadSleep);
        long t1 = Timeline.CurrentTimeNs;
        int? txId = Capture.Transactions.LastOrDefault()?.Id;

        EmitComm(
            t0, t1,
            SimComponent.HostDriver,
            SimComponent.HidDevice,
            CommChannel.I2cWrite,
            SimulationPhase.SoftReset,
            $"I2C Write Soft RESET -> 0x{HostDriver.DeviceDescriptor.CommandRegister:X4}",
            "Command OpCode=0x01 (RESET), Payload=[0x00 0x01] -> Device resets state machine",
            "00 01",
            txId);

        if (ok)
            SetBootStage(BootStepStage.SoftResetDone);
        return ok;
    }

    public bool RunStepReadReportDescriptor()
    {
        if (HostDriver.DeviceDescriptor == null) return false;
        long t0 = Timeline.CurrentTimeNs;
        bool ok = HostDriver.StepReadReportDescriptor();
        long t1 = Timeline.CurrentTimeNs;
        int? txId = Capture.Transactions.LastOrDefault()?.Id;

        if (ok && HostDriver.RawReportDescriptor != null)
        {
            EmitComm(
                t0, t1,
                SimComponent.HidDevice,
                SimComponent.HostDriver,
                CommChannel.I2cRead,
                SimulationPhase.ReportDescriptorRead,
                $"I2C Read {HostDriver.RawReportDescriptor.Length}B USB-IF Report Descriptor",
                $"Fetched from wReportDescRegister 0x{HostDriver.DeviceDescriptor.ReportDescRegister:X4}; parsed {HostDriver.ParsedReportItems.Count} HID items",
                string.Join(" ", HostDriver.RawReportDescriptor.Take(10).Select(b => $"{b:X2}")) + " ...",
                txId);

            SetBootStage(BootStepStage.ReportDescriptorRead);
        }

        return ok;
    }

    public bool RunStepSetPowerOn()
    {
        if (HostDriver.DeviceDescriptor == null) return false;
        long t0 = Timeline.CurrentTimeNs;
        bool ok = HostDriver.StepSetPower(HidPowerState.On);
        long t1 = Timeline.CurrentTimeNs;
        int? txId = Capture.Transactions.LastOrDefault()?.Id;

        EmitComm(
            t0, t1,
            SimComponent.HostDriver,
            SimComponent.HidDevice,
            CommChannel.I2cWrite,
            SimulationPhase.SetPowerOn,
            $"I2C Write SET_POWER(ON) -> 0x{HostDriver.DeviceDescriptor.CommandRegister:X4}",
            "OpCode=0x08, PowerState=0x00 (ON). Device awake; Host ISR armed on GPIO INT#",
            "00 08",
            txId);

        if (ok)
            SetBootStage(BootStepStage.Ready);
        return ok;
    }

    public bool SetDevicePowerState(HidPowerState state)
    {
        if (HostDriver.DeviceDescriptor == null) return false;
        long t0 = Timeline.CurrentTimeNs;
        bool ok = HostDriver.StepSetPower(state);
        long t1 = Timeline.CurrentTimeNs;
        int? txId = Capture.Transactions.LastOrDefault()?.Id;

        string label = state == HidPowerState.On ? "ON (0x00)" : "SLEEP (0x01)";
        EmitComm(
            t0, t1,
            SimComponent.HostDriver,
            SimComponent.HidDevice,
            CommChannel.I2cWrite,
            state == HidPowerState.On ? SimulationPhase.SetPowerOn : SimulationPhase.SetPowerSleep,
            $"I2C Write SET_POWER({label})",
            $"Device transitioned to {TouchpadDevice.PowerState}",
            state == HidPowerState.On ? "00 08" : "01 08",
            txId);

        return ok;
    }

    public void TriggerTouch(ushort x, ushort y, bool leftBtn = false, bool rightBtn = false, byte fingers = 1, bool inContact = true, byte pressure = 35)
    {
        Capture.EmitIdleGap(25_000);
        long tTouch = Timeline.CurrentTimeNs;

        // Track transactions count before touch so we can detect whether AutoISR fired
        int txBefore = Capture.Transactions.Count;

        TouchpadDevice.SimulateTouch(x, y, leftBtn, rightBtn, fingers, inContact, pressure);

        EmitComm(
            tTouch,
            tTouch,
            SimComponent.HidDevice,
            SimComponent.PhysicalBus,
            CommChannel.IntPin,
            SimulationPhase.TouchInterrupt,
            $"Touch ({x},{y}) -> FIFO Enqueue & INT# LOW",
            $"Device pushed 8B Input Report (FIFO={TouchpadDevice.InputQueueCount}) and asserted INT# LOW");

        if (Capture.Transactions.Count > txBefore)
        {
            var tx = Capture.Transactions[^1];
            EmitIsrReadComm(tx);
        }
        else if (HostDriver.HasPendingInterrupt)
        {
            EmitComm(
                Timeline.CurrentTimeNs,
                Timeline.CurrentTimeNs,
                SimComponent.PhysicalBus,
                SimComponent.SocController,
                CommChannel.IntPin,
                SimulationPhase.TouchInterrupt,
                "INT# LOW Pending (Manual ISR Paused)",
                "Host GPIO Pin 14 sees Active-LOW; click 'Service INT#' to execute I2C Read 0x0005");
        }

        Capture.NotifyUpdated();
    }

    public void TriggerFingerRelease()
    {
        Capture.EmitIdleGap(25_000);
        long tTouch = Timeline.CurrentTimeNs;
        int txBefore = Capture.Transactions.Count;

        TouchpadDevice.SimulateFingerRelease();

        EmitComm(
            tTouch,
            tTouch,
            SimComponent.HidDevice,
            SimComponent.PhysicalBus,
            CommChannel.IntPin,
            SimulationPhase.TouchInterrupt,
            "Finger Release -> FIFO Enqueue & INT# LOW",
            $"TipSwitch=0 enqueued (FIFO={TouchpadDevice.InputQueueCount}); INT# asserted LOW");

        if (Capture.Transactions.Count > txBefore)
        {
            EmitIsrReadComm(Capture.Transactions[^1]);
        }

        Capture.NotifyUpdated();
    }

    public bool ServicePendingInterrupt()
    {
        int txBefore = Capture.Transactions.Count;
        bool serviced = HostDriver.ServicePendingInterrupt();
        if (serviced && Capture.Transactions.Count > txBefore)
        {
            EmitIsrReadComm(Capture.Transactions[^1]);
            Capture.NotifyUpdated();
        }
        return serviced;
    }

    public bool SetFeature(byte mode, byte hapticIntensity)
    {
        if (!HostDriver.IsEnumerated || HostDriver.DeviceDescriptor == null)
            return false;

        int txBefore = Capture.Transactions.Count;
        long t0 = Timeline.CurrentTimeNs;
        bool ok = HostDriver.SetTouchpadFeature(mode, hapticIntensity);
        long t1 = Timeline.CurrentTimeNs;

        int? txId = Capture.Transactions.Count > txBefore ? Capture.Transactions[^1].Id : null;
        EmitComm(
            t0, t1,
            SimComponent.HostDriver,
            SimComponent.HidDevice,
            CommChannel.I2cWrite,
            SimulationPhase.FeatureReport,
            $"Feature Report (Mode={mode}, Haptic={hapticIntensity}%)",
            $"Wrote DataReg 0x{HostDriver.DeviceDescriptor.DataRegister:X4} + SET_REPORT to CmdReg 0x{HostDriver.DeviceDescriptor.CommandRegister:X4}",
            $"02 {mode:X2} {hapticIntensity:X2}",
            txId);

        Capture.NotifyUpdated();
        return ok;
    }

    private void EmitIsrReadComm(BusTransactionSummary tx)
    {
        EmitComm(
            tx.StartTimeNs,
            tx.EndTimeNs,
            SimComponent.HostDriver,
            SimComponent.HidDevice,
            CommChannel.I2cRead,
            SimulationPhase.HostIsrRead,
            $"ISR Read Input @ 0x{tx.RegisterAddress:X4} ({tx.ByteCount}B)",
            $"Host serviced INT# -> S|0x40|0x{tx.RegisterAddress:X4}|Sr|0x41|{tx.ByteCount}B|P -> INT# {(InterruptPin.CurrentState == PinState.High ? "Released HIGH" : "Still LOW")}",
            string.Join(" ", tx.Data.Select(b => $"{b:X2}")),
            tx.Id);
    }

    private void EmitComm(
        long startNs,
        long endNs,
        SimComponent from,
        SimComponent to,
        CommChannel channel,
        SimulationPhase phase,
        string title,
        string detail,
        string? hexPayload = null,
        int? txId = null)
    {
        var evt = new ComponentCommEvent(_nextSeq++, startNs, endNs, from, to, channel, phase, title, detail, hexPayload, txId);
        _commEvents.Add(evt);
        OnCommEvent?.Invoke(evt);
    }

    private void SetBootStage(BootStepStage stage)
    {
        CurrentBootStage = stage;
        OnBootStageChanged?.Invoke(stage);
    }
}
