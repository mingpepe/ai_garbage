using System.Collections.ObjectModel;
using Avalonia.Threading;
using I3CEmulator.Devices;
using I3CEmulator.Gui.Controls;
using I3CEmulator.Physical;
using I3CEmulator.Protocol;
using I3CEmulator.Simulation;

namespace I3CEmulator.Gui.ViewModels;

public sealed class ChapterItemViewModel : ViewModelBase
{
    private string _status = "Pending";
    private int? _startSampleIndex;
    private int _assertionCount;

    public ChapterItemViewModel(ChapterDefinition definition)
    {
        Definition = definition;
        KeySignalsText = string.Join("  •  ", definition.KeySignals);
    }

    public ChapterDefinition Definition { get; }
    public int Index => Definition.Index;
    public string Title => $"Ch {Definition.Index}: {Definition.Title}";
    public string Summary => Definition.Summary;
    public string KeySignalsText { get; }

    public string Status
    {
        get => _status;
        set => SetField(ref _status, value);
    }

    public int? StartSampleIndex
    {
        get => _startSampleIndex;
        set => SetField(ref _startSampleIndex, value);
    }

    public int AssertionCount
    {
        get => _assertionCount;
        set => SetField(ref _assertionCount, value);
    }
}

public sealed record DeviceStateSummary(
    string Name,
    string Role,
    string AddressText,
    string IdentityText,
    string FlagsText,
    string CountersText,
    string RegistersPreview);

public sealed record SpeedPreset(string Label, int DelayMs)
{
    public override string ToString() => Label;
}

public sealed class MainWindowViewModel : ViewModelBase, IDisposable
{
    private I3CSimulationScenario _scenario = null!;
    private SimulationStepGate _stepGate = null!;
    private SimulationStepGate? _interactiveGate;
    private CancellationTokenSource? _sessionCts;
    private Task? _workerTask;
    private readonly SemaphoreSlim _sandboxLock = new(1, 1);

    private readonly DispatcherTimer _uiSyncTimer;
    private volatile bool _dirty;

    private BusSample[] _samples = Array.Empty<BusSample>();
    private DecodedPacket[] _packets = Array.Empty<DecodedPacket>();
    private ChapterMarker[] _chapters = Array.Empty<ChapterMarker>();

    private int _selectedSampleIndex = -1;
    private int _secondarySampleIndex = -1;
    private BusSample? _inspectedSample;
    private DecodedPacket? _activePacket;
    private DecodedPacket? _selectedPacketRow;
    private IReadOnlyDictionary<string, DeviceCardMetadata>? _deviceMetadata;

    private bool _useTrueTimeScale;
    private bool _followLive = true;
    private SpeedPreset _selectedSpeed;
    private string _executionStatus = "HOLD @ CH0";
    private string _metricsBanner = "TIME 0 ns | OD 0b | PP 0b | FLT50 0 | DAT 0/4";
    private string _selectedSampleBanner = "X1: L-CLICK TRACE   X2: R-CLICK DELTA   SHIFT+DRAG: PAN   WHEEL: TIMEBASE";
    private string _cursorDeltaBanner = "X1: -- ns\nX2: -- ns\nΔX: -- ns\n1/ΔX: --";
    private bool _isScenarioRunning;
    private bool _isScenarioCompleted;
    private int _lastSyncedPacketCount;
    private int _lastSyncedLogCount;
    private int _lastSyncedAssertionCount;

    public MainWindowViewModel()
    {
        SpeedPresets =
        [
            new SpeedPreset("Slow Bit (120 ms/bit)", 120),
            new SpeedPreset("Live Bit (30 ms/bit)", 30),
            new SpeedPreset("Fast Stream (5 ms/bit)", 5),
            new SpeedPreset("Burst (No Delay)", 0)
        ];
        _selectedSpeed = SpeedPresets[1];

        RunOrPauseCommand = new RelayCommand(ToggleRunOrPause);
        StepHalfCycleCommand = new RelayCommand(() => Step(StepGranularity.HalfCycle));
        StepBitCommand = new RelayCommand(() => Step(StepGranularity.ClockBit));
        StepFieldCommand = new RelayCommand(() => Step(StepGranularity.ProtocolField));
        StepTransactionCommand = new RelayCommand(() => Step(StepGranularity.Transaction));
        StepChapterCommand = new RelayCommand(() => Step(StepGranularity.Chapter));
        ResetCommand = new RelayCommand(ResetSimulation);

        QueueIbiTargetACommand = new RelayCommand(() => RunInteractive("Target A IBI (0x99)", s =>
            s.InteractiveQueueAndServiceIbi(s.TargetA, 0x99, 0xCA, 0xFE)));
        QueueIbiTargetCCommand = new RelayCommand(() => RunInteractive("Target C IBI (0x77)", s =>
            s.InteractiveQueueAndServiceIbi(s.TargetC, 0x77)));
        TriggerCollisionCommand = new RelayCommand(() => RunInteractive("3-Way Collision (IBI A+C vs Write B)", s =>
        {
            if (!s.TargetA.DynamicAddress.HasValue || !s.TargetC.DynamicAddress.HasValue || !s.TargetB.DynamicAddress.HasValue)
                throw new InvalidOperationException("Run Chapters 1-4 first so Targets have Dynamic Addresses.");
            s.TargetA.QueueInBandInterrupt(0xA5);
            s.TargetC.QueueInBandInterrupt(0xC5);
            s.Master.PrivateWrite(s.TargetB.DynamicAddress.Value, true, 0xAB, 0xCD);
        }));
        PrivateWriteTargetACommand = new RelayCommand(() => RunInteractive("Private Write 0x09 (Reg 0x20)", s =>
        {
            if (!s.TargetA.DynamicAddress.HasValue)
                throw new InvalidOperationException("Target A has no Dynamic Address yet (run Chapters 1-3).");
            byte tick = (byte)((s.Recorder.SampleCount / 10) & 0xFF);
            s.InteractivePrivateWrite(s.TargetA.DynamicAddress.Value, 0x20, 0x5A, tick, 0x77);
        }));
        PrivateReadTargetACommand = new RelayCommand(() => RunInteractive("Private Read 0x09 (Reg 0x20, 4B)", s =>
        {
            if (!s.TargetA.DynamicAddress.HasValue)
                throw new InvalidOperationException("Target A has no Dynamic Address yet (run Chapters 1-3).");
            s.InteractivePrivateRead(s.TargetA.DynamicAddress.Value, 0x20, 4);
        }));
        LegacyI2CReadCommand = new RelayCommand(() => RunInteractive("Legacy I2C Read 0x50 (4B)", s =>
            s.InteractiveI2CRead(0x10, 4)));
        HotJoinTargetDCommand = new RelayCommand(() => RunInteractive("Hot-Join Target D", s =>
            s.InteractiveHotJoinTargetD()));

        _uiSyncTimer = new DispatcherTimer(TimeSpan.FromMilliseconds(33), DispatcherPriority.Render, (_, _) =>
        {
            if (_dirty)
            {
                _dirty = false;
                SyncFromScenario();
            }
        });
        _uiSyncTimer.Start();

        InitializeNewSession();
    }

    public IReadOnlyList<SpeedPreset> SpeedPresets { get; }
    public ObservableCollection<ChapterItemViewModel> ChapterItems { get; } = new();
    public ObservableCollection<DecodedPacket> DecodedPackets { get; } = new();
    public ObservableCollection<DeviceStateSummary> DeviceStates { get; } = new();
    public ObservableCollection<string> BusLogs { get; } = new();
    public ObservableCollection<string> PassedAssertions { get; } = new();

    public RelayCommand RunOrPauseCommand { get; }
    public RelayCommand StepHalfCycleCommand { get; }
    public RelayCommand StepBitCommand { get; }
    public RelayCommand StepFieldCommand { get; }
    public RelayCommand StepTransactionCommand { get; }
    public RelayCommand StepChapterCommand { get; }
    public RelayCommand ResetCommand { get; }

    public RelayCommand QueueIbiTargetACommand { get; }
    public RelayCommand QueueIbiTargetCCommand { get; }
    public RelayCommand TriggerCollisionCommand { get; }
    public RelayCommand PrivateWriteTargetACommand { get; }
    public RelayCommand PrivateReadTargetACommand { get; }
    public RelayCommand LegacyI2CReadCommand { get; }
    public RelayCommand HotJoinTargetDCommand { get; }

    public event Action<int>? RequestScrollToSample;

    public BusSample[] Samples
    {
        get => _samples;
        private set => SetField(ref _samples, value);
    }

    public DecodedPacket[] Packets
    {
        get => _packets;
        private set => SetField(ref _packets, value);
    }

    public ChapterMarker[] Chapters
    {
        get => _chapters;
        private set => SetField(ref _chapters, value);
    }

    public int SelectedSampleIndex
    {
        get => _selectedSampleIndex;
        set
        {
            if (SetField(ref _selectedSampleIndex, value))
                UpdateInspectedSample(value);
        }
    }

    public int SecondarySampleIndex
    {
        get => _secondarySampleIndex;
        set
        {
            if (SetField(ref _secondarySampleIndex, value))
                UpdateInspectedSample(_selectedSampleIndex);
        }
    }

    public BusSample? InspectedSample
    {
        get => _inspectedSample;
        private set => SetField(ref _inspectedSample, value);
    }

    public DecodedPacket? ActivePacket
    {
        get => _activePacket;
        private set => SetField(ref _activePacket, value);
    }

    public DecodedPacket? SelectedPacketRow
    {
        get => _selectedPacketRow;
        set
        {
            if (SetField(ref _selectedPacketRow, value) && value is not null)
                JumpToPacket(value);
        }
    }

    public IReadOnlyDictionary<string, DeviceCardMetadata>? DeviceMetadata
    {
        get => _deviceMetadata;
        private set => SetField(ref _deviceMetadata, value);
    }

    public bool UseTrueTimeScale
    {
        get => _useTrueTimeScale;
        set => SetField(ref _useTrueTimeScale, value);
    }

    public bool FollowLive
    {
        get => _followLive;
        set => SetField(ref _followLive, value);
    }

    public SpeedPreset SelectedSpeed
    {
        get => _selectedSpeed;
        set
        {
            if (SetField(ref _selectedSpeed, value))
                _stepGate.StepDelayMs = value.DelayMs;
        }
    }

    public string ExecutionStatus
    {
        get => _executionStatus;
        private set => SetField(ref _executionStatus, value);
    }

    public string MetricsBanner
    {
        get => _metricsBanner;
        private set => SetField(ref _metricsBanner, value);
    }

    public string SelectedSampleBanner
    {
        get => _selectedSampleBanner;
        private set => SetField(ref _selectedSampleBanner, value);
    }

    public string CursorDeltaBanner
    {
        get => _cursorDeltaBanner;
        private set => SetField(ref _cursorDeltaBanner, value);
    }

    public string RunPauseButtonText => _isScenarioRunning && !_stepGate.IsPaused ? "PAUSE" : "RUN ALL";

    public void JumpToChapter(ChapterItemViewModel item)
    {
        if (item.StartSampleIndex is int idx)
        {
            FollowLive = false;
            SelectedSampleIndex = idx;
            RequestScrollToSample?.Invoke(idx);
        }
        else if (!_isScenarioCompleted)
        {
            // Fast-forward up to the requested chapter so the user can inspect it immediately.
            _stepGate.Pause();
            ExecutionStatus = $"ARMED: RUN OR STEP_CH TO CH{item.Index}";
        }
    }

    public void JumpToPacket(DecodedPacket pkt)
    {
        FollowLive = false;
        SelectedSampleIndex = pkt.StartSampleIndex;
        RequestScrollToSample?.Invoke(pkt.StartSampleIndex);
    }

    private void InitializeNewSession()
    {
        _stepGate = new SimulationStepGate();
        _scenario = new I3CSimulationScenario(verboseTrace: false, stepGate: _stepGate);
        _sessionCts = new CancellationTokenSource();

        _isScenarioCompleted = false;
        _isScenarioRunning = false;
        _lastSyncedPacketCount = 0;
        _lastSyncedLogCount = 0;
        _lastSyncedAssertionCount = 0;
        _selectedSampleIndex = -1;
        _secondarySampleIndex = -1;

        ChapterItems.Clear();
        foreach (var ch in I3CSimulationScenario.ChapterCatalog)
            ChapterItems.Add(new ChapterItemViewModel(ch));

        DecodedPackets.Clear();
        BusLogs.Clear();
        PassedAssertions.Clear();

        _scenario.Recorder.SampleRecorded += _ => _dirty = true;
        _scenario.Recorder.LogAppended += _ => _dirty = true;
        _scenario.ChapterStarted += ch =>
        {
            Dispatcher.UIThread.Post(() =>
            {
                if (ch.Index >= 0 && ch.Index < ChapterItems.Count)
                {
                    ChapterItems[ch.Index].Status = "Running...";
                    ChapterItems[ch.Index].StartSampleIndex = _scenario.Recorder.SampleCount;
                }
                ExecutionStatus = $"Running Ch {ch.Index}: {ch.Title}";
                _dirty = true;
            });
        };
        _scenario.ChapterCompleted += (ch, assertions) =>
        {
            Dispatcher.UIThread.Post(() =>
            {
                if (ch.Index >= 0 && ch.Index < ChapterItems.Count)
                {
                    ChapterItems[ch.Index].Status = "PASS";
                    ChapterItems[ch.Index].AssertionCount = assertions.Length;
                }
                _dirty = true;
            });
        };
        _stepGate.StateChanged += msg =>
        {
            Dispatcher.UIThread.Post(() =>
            {
                ExecutionStatus = msg.ToUpperInvariant();
                OnPropertyChanged(nameof(RunPauseButtonText));
                _dirty = true;
            });
        };

        // Run Chapter 0 (topology setup) synchronously so devices appear on the bus diagram immediately.
        _scenario.ExecuteChapter(0);
        _stepGate.StartPaused(StepGranularity.Chapter);
        _stepGate.StepDelayMs = SelectedSpeed.DelayMs;

        var token = _sessionCts.Token;
        _workerTask = Task.Run(() => RunScenarioWorker(token), token);

        SyncFromScenario();
        ExecutionStatus = "HOLD @ CH0  |  PRESS [RUN ALL] OR [STEP]";
        OnPropertyChanged(nameof(RunPauseButtonText));
    }

    private void RunScenarioWorker(CancellationToken ct)
    {
        try
        {
            _isScenarioRunning = true;
            _scenario.RunThroughChapter(10);
            _isScenarioCompleted = true;
            _isScenarioRunning = false;

            Dispatcher.UIThread.Post(() =>
            {
                ExecutionStatus = $"ACQ COMPLETE: 11 CH / {_scenario.AssertionsPassed.Count} PASS  |  SANDBOX ARMED";
                OnPropertyChanged(nameof(RunPauseButtonText));
                SyncFromScenario();
            });
        }
        catch (OperationCanceledException)
        {
            _isScenarioRunning = false;
        }
        catch (Exception ex)
        {
            _isScenarioRunning = false;
            Dispatcher.UIThread.Post(() =>
            {
                ExecutionStatus = $"Error: {ex.Message}";
                OnPropertyChanged(nameof(RunPauseButtonText));
                SyncFromScenario();
            });
        }
    }

    private void ToggleRunOrPause()
    {
        if (_sandboxLock.CurrentCount == 0)
        {
            ExecutionStatus = "Interactive transaction in progress...";
            return;
        }

        if (_isScenarioCompleted)
        {
            ResetSimulation();
            FollowLive = true;
            _stepGate.Resume(SelectedSpeed.DelayMs);
            OnPropertyChanged(nameof(RunPauseButtonText));
            return;
        }

        if (_stepGate.IsPaused)
        {
            FollowLive = true;
            _stepGate.Resume(SelectedSpeed.DelayMs);
        }
        else
        {
            _stepGate.Pause();
        }
        OnPropertyChanged(nameof(RunPauseButtonText));
    }

    private void Step(StepGranularity granularity)
    {
        if (_isScenarioCompleted || _sandboxLock.CurrentCount == 0)
            return;

        FollowLive = true;
        _stepGate.StepOnce(granularity);
        OnPropertyChanged(nameof(RunPauseButtonText));
    }

    private void ResetSimulation()
    {
        _interactiveGate?.Cancel();
        _stepGate.Cancel();
        _sessionCts?.Cancel();
        try
        {
            _workerTask?.Wait(TimeSpan.FromMilliseconds(500));
        }
        catch
        {
            // Worker cancellation expected on reset.
        }
        _sessionCts?.Dispose();
        InitializeNewSession();
    }

    private void RunInteractive(string label, Action<I3CSimulationScenario> action)
    {
        if (!_stepGate.IsPaused && !_isScenarioCompleted)
        {
            ExecutionStatus = "Pause the running scenario before injecting manual bus traffic.";
            return;
        }

        Task.Run(async () =>
        {
            if (!await _sandboxLock.WaitAsync(0))
                return;

            var scenario = _scenario;
            var gate = SelectedSpeed.DelayMs > 0
                ? new SimulationStepGate { StepDelayMs = SelectedSpeed.DelayMs }
                : null;
            gate?.Resume(SelectedSpeed.DelayMs);
            _interactiveGate = gate;

            try
            {
                // Detach _stepGate temporarily so running an interactive burst while paused
                // never pulses _stepGate and accidentally wakes the parked scenario worker.
                scenario.Bus.StepGate = gate;

                Dispatcher.UIThread.Post(() =>
                {
                    FollowLive = true;
                    ExecutionStatus = $"Executing interactive: {label}...";
                });

                action(scenario);

                Dispatcher.UIThread.Post(() =>
                {
                    ExecutionStatus = $"Completed: {label}";
                    SyncFromScenario();
                });
            }
            catch (OperationCanceledException)
            {
                Dispatcher.UIThread.Post(() => ExecutionStatus = $"Cancelled: {label}");
            }
            catch (Exception ex)
            {
                Dispatcher.UIThread.Post(() => ExecutionStatus = $"Action failed: {ex.Message}");
            }
            finally
            {
                scenario.Bus.StepGate = _stepGate;
                _interactiveGate = null;
                _sandboxLock.Release();
            }
        });
    }

    private void SyncFromScenario()
    {
        var snap = _scenario.Recorder.GetSnapshot();
        Samples = snap.Samples;
        Packets = snap.Packets;
        Chapters = snap.Chapters;

        for (int i = _lastSyncedPacketCount; i < snap.Packets.Length; i++)
            DecodedPackets.Add(snap.Packets[i]);
        _lastSyncedPacketCount = snap.Packets.Length;

        for (int i = _lastSyncedLogCount; i < snap.Logs.Length; i++)
            BusLogs.Add(snap.Logs[i]);
        _lastSyncedLogCount = snap.Logs.Length;

        var assertions = _scenario.AssertionsPassed.ToArray();
        for (int i = _lastSyncedAssertionCount; i < assertions.Length; i++)
            PassedAssertions.Add($"[PASS] {assertions[i]}");
        _lastSyncedAssertionCount = assertions.Length;

        foreach (var ch in snap.Chapters)
        {
            if (ch.ChapterIndex >= 0 && ch.ChapterIndex < ChapterItems.Count)
                ChapterItems[ch.ChapterIndex].StartSampleIndex = ch.StartSampleIndex;
        }

        if (FollowLive && snap.Samples.Length > 0)
        {
            _selectedSampleIndex = snap.Samples.Length - 1;
            OnPropertyChanged(nameof(SelectedSampleIndex));
        }

        UpdateInspectedSample(_selectedSampleIndex);
        UpdateDeviceSummariesAndMetadata();

        var m = _scenario.GetMetrics();
        MetricsBanner = $"TIME {m.SimulatedTimeNs:N0} ns  |  OD {m.OpenDrainBitCount}b  |  " +
                        $"PP {m.PushPullBitCount}b  |  FLT50 {m.FilteredI3CPulsesOnLegacyI2C}  |  " +
                        $"DAT {m.RegisteredTargetsInDat}/4  |  SMPL {snap.Samples.Length:N0}";
    }

    private void UpdateInspectedSample(int index)
    {
        if (_samples.Length == 0)
        {
            InspectedSample = null;
            ActivePacket = null;
            SelectedSampleBanner = "NO SAMPLES CAPTURED — PRESS [RUN ALL] OR [STEP].";
            CursorDeltaBanner = "X1: -- ns\nX2: -- ns\nΔX: -- ns\n1/ΔX: --";
            return;
        }

        int clamped = Math.Clamp(index < 0 ? _samples.Length - 1 : index, 0, _samples.Length - 1);
        var s = _samples[clamped];
        InspectedSample = s;

        DecodedPacket? match = null;
        for (int i = _packets.Length - 1; i >= 0; i--)
        {
            var p = _packets[i];
            if (clamped >= p.StartSampleIndex && clamped <= p.EndSampleIndex)
            {
                match = p;
                break;
            }
        }
        ActivePacket = match;

        string prof = s.Profile?.Name ?? "Framing/Idle";
        string activeDrv = string.Join(", ",
            s.Devices.Where(d => d.PadMode == DriveMode.PushPull || (d.PadMode == DriveMode.OpenDrain && !d.PadLevel))
                     .Select(d => $"{d.DeviceName}={d.PadMode}:{(d.PadLevel ? 1 : 0)}"));
        if (string.IsNullOrEmpty(activeDrv))
            activeDrv = "Rp Pull-Up (Hi-Z)";

        string x2Text = "--";
        string dxText = "--";
        string freqText = "--";
        if (_secondarySampleIndex >= 0 && _secondarySampleIndex < _samples.Length)
        {
            long t2 = _samples[_secondarySampleIndex].StartTimeNs;
            long dt = Math.Abs(t2 - s.StartTimeNs);
            x2Text = $"{t2:N0} ns";
            dxText = $"{dt:N0} ns";
            if (dt > 0)
            {
                double mhz = 1000.0 / dt;
                freqText = mhz >= 1.0 ? $"{mhz:F2} MHz" : $"{mhz * 1000.0:F1} kHz";
            }
        }

        CursorDeltaBanner = $"X1: {s.StartTimeNs:N0} ns (#{s.Index})\nX2: {x2Text}\nΔX: {dxText}\n1/ΔX: {freqText}";

        SelectedSampleBanner = $"X1={s.StartTimeNs:N0}ns (+{s.DurationNs}ns) | ΔX={dxText} ({freqText}) | {s.Kind} | " +
                               $"SCL={(s.Scl ? 1 : 0)} SDA={(s.Sda ? 1 : 0)} [{prof}] | DRV: {activeDrv}" +
                               (match is not null ? $" | {match.Summary}" : string.Empty);
    }

    private void UpdateDeviceSummariesAndMetadata()
    {
        var meta = new Dictionary<string, DeviceCardMetadata>
        {
            [_scenario.Master.Name] = new(
                _scenario.Master.Name,
                "Controller",
                $"DAT={_scenario.Master.TargetTable.Count} | ArbLoss={_scenario.Master.ArbitrationLossCount}",
                $"NextDA=0x{_scenario.Master.AllocatePreview():X2}",
                false),
            [_scenario.TargetA.Name] = BuildI3CMeta(_scenario.TargetA),
            [_scenario.TargetB.Name] = BuildI3CMeta(_scenario.TargetB),
            [_scenario.TargetC.Name] = BuildI3CMeta(_scenario.TargetC),
            [_scenario.TargetD.Name] = BuildI3CMeta(_scenario.TargetD),
            [_scenario.LegacyI2C.Name] = new(
                _scenario.LegacyI2C.Name,
                "Legacy I2C",
                $"LVR=0x{_scenario.LegacyI2C.Lvr:X2} (50ns Flt)",
                $"Blocked={_scenario.LegacyI2C.FilteredOutI3CClockPulses} | Tx={_scenario.LegacyI2C.CompletedI2CTransactions}",
                false)
        };
        DeviceMetadata = meta;

        DeviceStates.Clear();
        DeviceStates.Add(new DeviceStateSummary(
            _scenario.Master.Name,
            "Controller (Main)",
            "Master",
            $"Registered DAT Targets: {_scenario.Master.TargetTable.Count}",
            $"I2C Table: {_scenario.Master.LegacyI2CTable.Count} | RejectNextIBI: {_scenario.Master.RejectNextIbiWithNack}",
            $"OD Bits: {_scenario.Bus.OpenDrainBitCount} | PP Bits: {_scenario.Bus.PushPullBitCount} | ArbLoss: {_scenario.Master.ArbitrationLossCount}",
            string.Join(", ", _scenario.Master.TargetTable.OrderBy(k => k.Key).Select(kv => $"0x{kv.Key:X2}->PID 0x{kv.Value.ProvisionalId48:X12}"))));

        foreach (var t in new[] { _scenario.TargetA, _scenario.TargetB, _scenario.TargetC, _scenario.TargetD })
        {
            string regSlice = string.Join(" ", Enumerable.Range(0x20, 6).Select(r => $"{t.Registers[r]:X2}"));
            DeviceStates.Add(new DeviceStateSummary(
                t.Name,
                t.IsConnectedToBus ? "I3C Target" : "I3C Target (Offline)",
                $"DA={(t.DynamicAddress.HasValue ? $"0x{t.DynamicAddress:X2}" : "None")} | SA={(t.StaticAddress7Bit.HasValue ? $"0x{t.StaticAddress7Bit:X2}" : "None")}",
                $"PID=0x{t.Identity.ProvisionalId48:X12} | BCR=0x{(byte)t.Identity.Bcr:X2} | DCR=0x{t.Identity.Dcr:X2}",
                $"Events=[{t.EnabledEvents}] | 50nsFlt={(t.IsI2CSpikeFilterEnabled ? "ON" : "OFF")}",
                $"PendingIBI={t.HasPendingIbi} | PendingHJ={t.HasPendingHotJoin} | ArbLoss={t.ArbitrationLossCount} | Err={t.ParityOrProtocolErrorCount}",
                $"Regs[0x20..0x25]: {regSlice}"));
        }

        string eepSlice = string.Join(" ", Enumerable.Range(0x10, 6).Select(r => $"{_scenario.LegacyI2C.Registers[r]:X2}"));
        DeviceStates.Add(new DeviceStateSummary(
            _scenario.LegacyI2C.Name,
            "Legacy I2C Slave",
            $"SA=0x{_scenario.LegacyI2C.StaticAddress7Bit:X2}",
            $"LVR=0x{_scenario.LegacyI2C.Lvr:X2} (50ns Spike Filter={_scenario.LegacyI2C.Has50NsSpikeFilter})",
            $"RegPtr=0x{_scenario.LegacyI2C.RegisterPointer:X2}",
            $"BlockedPulses={_scenario.LegacyI2C.FilteredOutI3CClockPulses} | CompletedTx={_scenario.LegacyI2C.CompletedI2CTransactions}",
            $"EEPROM[0x10..0x15]: {eepSlice}"));
    }

    private static DeviceCardMetadata BuildI3CMeta(I3CSlave t)
    {
        if (!t.IsConnectedToBus)
            return new DeviceCardMetadata(t.Name, "I3C Target", "Not Powered / Unplugged", "Hot-Join Ready", false);

        string sub = $"PID=..{t.Identity.ProvisionalId48 & 0xFFFF_FFFF:X8} BCR=0x{(byte)t.Identity.Bcr:X2}";
        string extra = t.HasPendingIbi
            ? "IBI PENDING!"
            : t.HasPendingHotJoin
                ? "HOT-JOIN PENDING!"
                : $"ArbLoss={t.ArbitrationLossCount} | IBI={(t.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt) ? "EN" : "DIS")}";
        return new DeviceCardMetadata(t.Name, "I3C Target", sub, extra, t.HasPendingIbi || t.HasPendingHotJoin);
    }

    public void Dispose()
    {
        _uiSyncTimer.Stop();
        _stepGate.Cancel();
        _sessionCts?.Cancel();
        try { _workerTask?.Wait(300); } catch { }
        _sessionCts?.Dispose();
        _sandboxLock.Dispose();
    }
}

file static class MasterPreviewExtensions
{
    public static byte AllocatePreview(this I3CMaster master)
    {
        for (byte c = 0x08; c < 0x77; c++)
        {
            if (I3CEmulator.Protocol.I3CAddresses.IsValidDynamicAddress(c) &&
                !master.TargetTable.ContainsKey(c) &&
                !master.LegacyI2CTable.Any(x => x.StaticAddress7Bit == c))
            {
                return c;
            }
        }
        return 0x08;
    }
}
