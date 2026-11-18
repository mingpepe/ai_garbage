using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Avalonia.Threading;
using HidI2cSimulation.Device;
using HidI2cSimulation.Docs;
using HidI2cSimulation.Hardware;
using HidI2cSimulation.Protocol;
using HidI2cSimulation.Simulation;

namespace HidI2cSimulation.Visualizer.ViewModels;

public sealed class CommLogRow
{
    public int Sequence { get; init; }
    public string SimTimeText { get; init; } = "";
    public string FlowText { get; init; } = "";
    public string ChannelBadge { get; init; } = "";
    public string ChannelColor { get; init; } = "#38BDF8";
    public string Title { get; init; } = "";
    public string Detail { get; init; } = "";
    public string HexPayload { get; init; } = "";
    public ComponentCommEvent RawEvent { get; init; } = null!;
}

public sealed class DescriptorFieldRow
{
    public string Offset { get; init; } = "";
    public string FieldName { get; init; } = "";
    public string Size { get; init; } = "";
    public string HexValue { get; init; } = "";
    public string DecodedValue { get; init; } = "";
    public string Description { get; init; } = "";
}

public sealed class RegisterMapRow
{
    public string Address { get; init; } = "";
    public string Name { get; init; } = "";
    public string Direction { get; init; } = "";
    public string Summary { get; init; } = "";
    public string LastAccess { get; init; } = "-";
    public bool IsHighlighted { get; init; }
}

public sealed class MainWindowViewModel : INotifyPropertyChanged
{
    private readonly HidI2cSimulationSession _session;
    private CancellationTokenSource? _autoRunCts;
    private bool _isAutoRunning;
    private int _stepDelayMs = 750;
    private string _laCursorStatus = "Scroll wheel: Zoom  |  Left-drag: Pan  |  Right-drag / Shift+drag: Measure ΔT";
    private byte _selectedFingers = 1;
    private byte _selectedPressure = 40;
    private byte _featureMode = 1;
    private byte _featureHaptic = 75;
    private string _complianceSummary = "Not run yet";

    public event PropertyChangedEventHandler? PropertyChanged;
    public event Action<BusTransactionSummary>? RequestZoomToTransaction;
    public event Action<ComponentCommEvent>? RequestHighlightComm;
    public event Action<ushort, ushort, bool>? RequestTouchpadFeedback;

    public HidI2cSimulationSession Session => _session;

    public ObservableCollection<CommLogRow> CommLogs { get; } = new();
    public ObservableCollection<BusTransactionSummary> TransactionBookmarks { get; } = new();
    public ObservableCollection<DescriptorFieldRow> HidDescriptorFields { get; } = new();
    public ObservableCollection<RegisterMapRow> RegisterMapRows { get; } = new();
    public ObservableCollection<ReportDescriptorItem> ReportDescriptorItems { get; } = new();
    public ObservableCollection<ComplianceTestResult> ComplianceResults { get; } = new();
    public ObservableCollection<string> RawLogs { get; } = new();

    public string AcpiAslSample => ArchitectureKnowledgeBase.GetAcpiDsmCodeSample();
    public string ArchitectureGuide => ArchitectureKnowledgeBase.GetFullArchitectureOverview();

    public MainWindowViewModel()
    {
        _session = new HidI2cSimulationSession(0x20, "Elan Precision Touchpad");

        _session.OnCommEvent += evt => Dispatcher.UIThread.Post(() => AddCommRow(evt));
        _session.OnBootStageChanged += _ => Dispatcher.UIThread.Post(RefreshAllStates);
        _session.Bus.OnTransactionCompleted += tx => Dispatcher.UIThread.Post(() => TransactionBookmarks.Add(tx));
        _session.TouchpadDevice.StateUpdated += () => Dispatcher.UIThread.Post(RefreshAllStates);
        _session.InterruptPin.StateChanged += (_, _) => Dispatcher.UIThread.Post(RefreshAllStates);
        _session.ResetPin.StateChanged += (_, _) => Dispatcher.UIThread.Post(RefreshAllStates);
        _session.TouchpadDevice.OnDeviceLog += msg => Dispatcher.UIThread.Post(() => AppendRawLog(msg));
        _session.HostDriver.OnDriverLog += msg => Dispatcher.UIThread.Post(() => AppendRawLog(msg));

        RefreshRegisterMap();
        RefreshAllStates();
    }

    public bool IsAutoRunning
    {
        get => _isAutoRunning;
        private set
        {
            if (_isAutoRunning != value)
            {
                _isAutoRunning = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(AutoRunButtonLabel));
            }
        }
    }

    public string AutoRunButtonLabel => IsAutoRunning ? "Stop Auto" : "Auto Run Boot";

    public int StepDelayMs
    {
        get => _stepDelayMs;
        set
        {
            if (_stepDelayMs != value)
            {
                _stepDelayMs = value;
                OnPropertyChanged();
            }
        }
    }

    public bool AutoServiceInterrupts
    {
        get => _session.HostDriver.AutoServiceInterrupts;
        set
        {
            if (_session.HostDriver.AutoServiceInterrupts != value)
            {
                _session.HostDriver.AutoServiceInterrupts = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsrModeDescription));
            }
        }
    }

    public string IsrModeDescription => AutoServiceInterrupts
        ? "Auto ISR: INT# LOW immediately triggers I2C Read (0x0005)"
        : "Manual Step ISR: Pauses with INT# LOW so you can inspect FIFO & LA";

    public string LaCursorStatus
    {
        get => _laCursorStatus;
        set
        {
            if (_laCursorStatus != value)
            {
                _laCursorStatus = value;
                OnPropertyChanged();
            }
        }
    }

    public byte SelectedFingers
    {
        get => _selectedFingers;
        set { _selectedFingers = value; OnPropertyChanged(); }
    }

    public byte SelectedPressure
    {
        get => _selectedPressure;
        set { _selectedPressure = value; OnPropertyChanged(); }
    }

    public byte FeatureMode
    {
        get => _featureMode;
        set { _featureMode = value; OnPropertyChanged(); }
    }

    public byte FeatureHaptic
    {
        get => _featureHaptic;
        set { _featureHaptic = value; OnPropertyChanged(); }
    }

    public string ComplianceSummary
    {
        get => _complianceSummary;
        set { _complianceSummary = value; OnPropertyChanged(); }
    }

    public BootStepStage CurrentStage => _session.CurrentBootStage;

    public bool IsStep1Done => CurrentStage >= BootStepStage.AcpiDiscovered;
    public bool IsStep2Done => CurrentStage >= BootStepStage.HardwareResetDone;
    public bool IsStep3Done => CurrentStage >= BootStepStage.HidDescriptorRead;
    public bool IsStep4Done => CurrentStage >= BootStepStage.SoftResetDone;
    public bool IsStep5Done => CurrentStage >= BootStepStage.ReportDescriptorRead;
    public bool IsStep6Done => CurrentStage >= BootStepStage.Ready;
    public bool CanExecuteNextBootStep => CurrentStage < BootStepStage.Ready;

    public string NextStepButtonText => CurrentStage switch
    {
        BootStepStage.NotStarted => "Next: 1. ACPI _DSM",
        BootStepStage.AcpiDiscovered => "Next: 2. HW RESET#",
        BootStepStage.HardwareResetDone => "Next: 3. Read HID Desc",
        BootStepStage.HidDescriptorRead => "Next: 4. Soft RESET",
        BootStepStage.SoftResetDone => "Next: 5. Read Report Desc",
        BootStepStage.ReportDescriptorRead => "Next: 6. SET_POWER (ON)",
        _ => "Boot Complete (Ready)"
    };

    public bool HasPendingInterrupt => _session.HostDriver.HasPendingInterrupt;
    public bool IsEnumerated => _session.HostDriver.IsEnumerated;
    public string IntPinText => _session.InterruptPin.CurrentState == PinState.Low ? "[!] INT#: LOW (IRQ)" : "[*] INT#: HIGH (IDLE)";
    public string IntPinColor => _session.InterruptPin.CurrentState == PinState.Low ? "#FF3366" : "#38E54D";
    public string PowerStateText => $"Power: {_session.TouchpadDevice.PowerState}";
    public string FifoText => $"FIFO: {_session.TouchpadDevice.InputQueueCount}";
    public string PowerToggleText => _session.TouchpadDevice.PowerState == HidPowerState.On ? "Sleep (SET_POWER 1)" : "Wake (SET_POWER 0)";

    public string LastInputSummary => _session.HostDriver.LastReceivedReport?.ToString()
        ?? "No HID Input Report received yet.";

    public string CommandBitBreakdown
    {
        get
        {
            ushort cmd = _session.TouchpadDevice.LastCommandWord;
            var op = (HidCommandOpCode)((cmd >> 8) & 0x0F);
            var rt = (HidReportType)((cmd >> 4) & 0x0F);
            byte id = (byte)(cmd & 0x0F);
            return $"Last wCommandRegister (0x0007) = 0x{cmd:X4}   |   Rsvd[15..12]=0x{(cmd >> 12) & 0xF:X}   OpCode[11..8]={op} (0x{(byte)op:X})   Type[7..4]={rt} ({(byte)rt})   ReportID[3..0]=0x{id:X}";
        }
    }

    public void ExecuteNextStep()
    {
        _session.ExecuteNextBootStep(blockWithThreadSleep: false);
        PopulateDescriptorsIfAvailable();
        RefreshAllStates();
    }

    public async Task ToggleAutoRunAsync()
    {
        if (IsAutoRunning)
        {
            _autoRunCts?.Cancel();
            return;
        }

        if (CurrentStage == BootStepStage.Ready)
        {
            ResetAll();
        }

        _autoRunCts = new CancellationTokenSource();
        var token = _autoRunCts.Token;
        IsAutoRunning = true;

        try
        {
            while (!token.IsCancellationRequested && CurrentStage < BootStepStage.Ready)
            {
                ExecuteNextStep();
                await Task.Delay(StepDelayMs, token);
            }
        }
        catch (OperationCanceledException)
        {
            // Normal stop
        }
        finally
        {
            IsAutoRunning = false;
            _autoRunCts = null;
        }
    }

    public void ResetAll()
    {
        _autoRunCts?.Cancel();
        CommLogs.Clear();
        TransactionBookmarks.Clear();
        HidDescriptorFields.Clear();
        ReportDescriptorItems.Clear();
        RawLogs.Clear();
        _session.ResetSimulation();
        RefreshAllStates();
    }

    public void ClearTraces()
    {
        CommLogs.Clear();
        TransactionBookmarks.Clear();
        RawLogs.Clear();
        _session.ClearTraces();
    }

    public void ServicePendingInterrupt()
    {
        _session.ServicePendingInterrupt();
        RefreshAllStates();
    }

    public void ToggleDevicePower()
    {
        if (!_session.HostDriver.IsEnumerated && _session.HostDriver.DeviceDescriptor == null)
            return;
        var next = _session.TouchpadDevice.PowerState == HidPowerState.On
            ? HidPowerState.Sleep
            : HidPowerState.On;
        _session.SetDevicePowerState(next);
        RefreshAllStates();
    }

    public void ApplyFeatureConfig()
    {
        _session.SetFeature(FeatureMode, FeatureHaptic);
        RefreshAllStates();
    }

    public void TriggerTouch(ushort x, ushort y, bool leftBtn = false, bool rightBtn = false)
    {
        _session.TriggerTouch(x, y, leftBtn, rightBtn, SelectedFingers, inContact: true, pressure: SelectedPressure);
        RefreshAllStates();
    }

    public void TriggerRelease()
    {
        _session.TriggerFingerRelease();
        RefreshAllStates();
    }

    public async Task RunGestureTapAsync()
    {
        EnsureEnumerated();
        RequestTouchpadFeedback?.Invoke(2048, 2048, true);
        _session.TriggerTouch(2048, 2048, false, false, 1, true, 35);
        await Task.Delay(260);
        RequestTouchpadFeedback?.Invoke(2048, 2048, false);
        _session.TriggerFingerRelease();
        RefreshAllStates();
    }

    public async Task RunGestureDragAsync()
    {
        EnsureEnumerated();
        for (ushort c = 600; c <= 3400; c += 700)
        {
            RequestTouchpadFeedback?.Invoke(c, c, true);
            _session.TriggerTouch(c, c, false, false, 1, true, 42);
            await Task.Delay(220);
        }
        RequestTouchpadFeedback?.Invoke(3400, 3400, false);
        _session.TriggerFingerRelease();
        RefreshAllStates();
    }

    public async Task RunGestureTwoFingerScrollAsync()
    {
        EnsureEnumerated();
        for (ushort y = 900; y <= 3100; y += 550)
        {
            RequestTouchpadFeedback?.Invoke(2048, y, true);
            _session.TriggerTouch(2048, y, false, false, fingers: 2, inContact: true, pressure: 48);
            await Task.Delay(220);
        }
        RequestTouchpadFeedback?.Invoke(2048, 3100, false);
        _session.TriggerFingerRelease();
        RefreshAllStates();
    }

    public async Task RunGestureRightClickAsync()
    {
        EnsureEnumerated();
        RequestTouchpadFeedback?.Invoke(3200, 3600, true);
        _session.TriggerTouch(3200, 3600, leftBtn: false, rightBtn: true, fingers: 1, inContact: true, pressure: 60);
        await Task.Delay(260);
        RequestTouchpadFeedback?.Invoke(3200, 3600, false);
        _session.TriggerFingerRelease();
        RefreshAllStates();
    }

    public void RunComplianceTests()
    {
        var testSession = new HidI2cSimulationSession(0x20, "Elan Precision Touchpad");
        var results = ProtocolComplianceRunner.RunAll(testSession);
        ComplianceResults.Clear();
        int pass = 0;
        foreach (var r in results)
        {
            ComplianceResults.Add(r);
            if (r.Passed) pass++;
        }
        ComplianceSummary = $"{pass}/{results.Count} Passed";
    }

    public void SelectCommLog(CommLogRow? row)
    {
        if (row == null) return;
        RequestHighlightComm?.Invoke(row.RawEvent);
        if (row.RawEvent.TransactionId.HasValue)
        {
            var tx = _session.Capture.Transactions.FirstOrDefault(t => t.Id == row.RawEvent.TransactionId.Value);
            if (tx != null)
                RequestZoomToTransaction?.Invoke(tx);
        }
    }

    private void EnsureEnumerated()
    {
        while (CurrentStage < BootStepStage.Ready)
        {
            ExecuteNextStep();
        }
    }

    private void AddCommRow(ComponentCommEvent evt)
    {
        string color = evt.Channel switch
        {
            CommChannel.AcpiMethod => "#C084FC",
            CommChannel.ResetPin => "#FF7A00",
            CommChannel.IntPin => "#FF3366",
            CommChannel.I2cRead => "#00E5FF",
            CommChannel.I2cWrite => "#FFB800",
            CommChannel.HidInputReport => "#38E54D",
            _ => "#9B92B8"
        };

        string badge = evt.Channel switch
        {
            CommChannel.AcpiMethod => "ACPI",
            CommChannel.ResetPin => "RST#",
            CommChannel.IntPin => "INT#",
            CommChannel.I2cRead => "I2C R",
            CommChannel.I2cWrite => "I2C W",
            CommChannel.HidInputReport => "HID",
            _ => "SYS"
        };

        CommLogs.Add(new CommLogRow
        {
            Sequence = evt.Sequence,
            SimTimeText = $"{evt.StartTimeNs / 1000.0:F1} µs",
            FlowText = $"{FormatComponent(evt.From)} -> {FormatComponent(evt.To)}",
            ChannelBadge = badge,
            ChannelColor = color,
            Title = evt.Title,
            Detail = evt.Detail,
            HexPayload = evt.HexPayload ?? "",
            RawEvent = evt
        });
    }

    private void PopulateDescriptorsIfAvailable()
    {
        var desc = _session.HostDriver.DeviceDescriptor;
        if (desc != null && HidDescriptorFields.Count == 0)
        {
            byte[] raw = desc.ToBytes();
            void AddField(int off, string name, int size, ushort val, string meaning)
            {
                string hex = string.Join(" ", raw.Skip(off).Take(size).Select(b => $"{b:X2}"));
                HidDescriptorFields.Add(new DescriptorFieldRow
                {
                    Offset = $"{off}..{off + size - 1}",
                    FieldName = name,
                    Size = $"{size}B",
                    HexValue = hex,
                    DecodedValue = size == 2 ? $"0x{val:X4} ({val})" : "0x00000000",
                    Description = meaning
                });
            }

            AddField(0, "wHIDDescLength", 2, desc.HIDDescLength, "Always 30 bytes (0x001E) per MS Spec");
            AddField(2, "bcdVersion", 2, desc.BcdVersion, "HID over I2C Specification v1.00");
            AddField(4, "wReportDescLength", 2, desc.ReportDescLength, "Length of USB-IF Report Descriptor");
            AddField(6, "wReportDescRegister", 2, desc.ReportDescRegister, "Register to read Report Descriptor");
            AddField(8, "wInputRegister", 2, desc.InputRegister, "Register to read Input Reports (FIFO)");
            AddField(10, "wMaxInputLength", 2, desc.MaxInputLength, "2B Length + Max Input Report Payload");
            AddField(12, "wOutputRegister", 2, desc.OutputRegister, "Register to write Output Reports");
            AddField(14, "wMaxOutputLength", 2, desc.MaxOutputLength, "Maximum Output Report Length");
            AddField(16, "wCommandRegister", 2, desc.CommandRegister, "16-bit Control Command Register");
            AddField(18, "wDataRegister", 2, desc.DataRegister, "Data payload exchange register");
            AddField(20, "wVendorID", 2, desc.VendorId, "USB-IF VID (0x04F3 = Elan)");
            AddField(22, "wProductID", 2, desc.ProductId, "Product ID (Precision Touchpad)");
            AddField(24, "wVersionID", 2, desc.VersionId, "Firmware Revision");
            AddField(26, "Reserved", 4, 0, "Reserved (must be 0x00000000)");
        }

        if (_session.HostDriver.ParsedReportItems.Count > 0 && ReportDescriptorItems.Count == 0)
        {
            foreach (var item in _session.HostDriver.ParsedReportItems)
                ReportDescriptorItems.Add(item);
        }
    }

    private void RefreshRegisterMap()
    {
        var dev = _session.TouchpadDevice;
        ushort lastReg = dev.LastAccessedRegister;
        string rw = dev.LastAccessWasWrite ? "WRITE" : "READ";

        RegisterMapRows.Clear();
        void AddReg(ushort addr, string name, string dir, string summary)
        {
            bool hit = lastReg == addr;
            RegisterMapRows.Add(new RegisterMapRow
            {
                Address = $"0x{addr:X4}",
                Name = name,
                Direction = dir,
                Summary = summary,
                LastAccess = hit ? rw : "-",
                IsHighlighted = hit
            });
        }

        AddReg(HidI2cDevice.RegHidDesc, "wHIDDescRegister", "R", "30-Byte Microsoft HID Descriptor");
        AddReg(HidI2cDevice.RegReportDesc, "wReportDescRegister", "R", $"{dev.ReportDescriptor.Length}-Byte USB-IF Report Descriptor");
        AddReg(HidI2cDevice.RegInput, "wInputRegister", "R", $"Input FIFO ({dev.InputQueueCount} pending)");
        AddReg(HidI2cDevice.RegOutput, "wOutputRegister", "W", "Host Output Report");
        AddReg(HidI2cDevice.RegCommand, "wCommandRegister", "W", $"Last Cmd: 0x{dev.LastCommandWord:X4}");
        AddReg(HidI2cDevice.RegData, "wDataRegister", "R/W", $"Mode={dev.DeviceMode}, Haptic={dev.HapticClickIntensity}%");
    }

    private void RefreshAllStates()
    {
        RefreshRegisterMap();
        OnPropertyChanged(nameof(CurrentStage));
        OnPropertyChanged(nameof(IsStep1Done));
        OnPropertyChanged(nameof(IsStep2Done));
        OnPropertyChanged(nameof(IsStep3Done));
        OnPropertyChanged(nameof(IsStep4Done));
        OnPropertyChanged(nameof(IsStep5Done));
        OnPropertyChanged(nameof(IsStep6Done));
        OnPropertyChanged(nameof(CanExecuteNextBootStep));
        OnPropertyChanged(nameof(NextStepButtonText));
        OnPropertyChanged(nameof(HasPendingInterrupt));
        OnPropertyChanged(nameof(IsEnumerated));
        OnPropertyChanged(nameof(IntPinText));
        OnPropertyChanged(nameof(IntPinColor));
        OnPropertyChanged(nameof(PowerStateText));
        OnPropertyChanged(nameof(FifoText));
        OnPropertyChanged(nameof(PowerToggleText));
        OnPropertyChanged(nameof(LastInputSummary));
        OnPropertyChanged(nameof(CommandBitBreakdown));
    }

    private void AppendRawLog(string line)
    {
        RawLogs.Add(line);
        if (RawLogs.Count > 300)
            RawLogs.RemoveAt(0);
    }

    private static string FormatComponent(SimComponent c) => c switch
    {
        SimComponent.OsInput => "OS Input",
        SimComponent.HostDriver => "Host Driver",
        SimComponent.AcpiBios => "ACPI BIOS",
        SimComponent.SocController => "SoC I2C/GPIO",
        SimComponent.PhysicalBus => "I2C/GPIO Bus",
        SimComponent.HidDevice => "Device 0x20",
        _ => c.ToString()
    };

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
