namespace I3CEmulator.Simulation;

public enum StepGranularity
{
    Continuous,
    HalfCycle,
    ClockBit,
    ProtocolField,
    Transaction,
    Chapter
}

/// <summary>
/// Thread-safe execution barrier embedded into the bus and scenario runner so a GUI can pause,
/// slow-motion stream, or single-step a live simulation at half-cycle, bit, protocol-field,
/// transaction, or chapter boundaries while the Console runner runs unthrottled.
/// </summary>
public sealed class SimulationStepGate
{
    private readonly object _sync = new();
    private StepGranularity _granularity = StepGranularity.Continuous;
    private bool _isPaused;
    private bool _singleStepArmed;
    private bool _isWaiting;
    private bool _cancelled;
    private int _stepDelayMs;
    private int _lastPacketCount;

    public event Action<string>? StateChanged;

    public bool IsPaused
    {
        get { lock (_sync) return _isPaused; }
    }

    public bool IsWaiting
    {
        get { lock (_sync) return _isWaiting; }
    }

    public StepGranularity CurrentGranularity
    {
        get { lock (_sync) return _granularity; }
    }

    public int StepDelayMs
    {
        get { lock (_sync) return _stepDelayMs; }
        set
        {
            lock (_sync)
            {
                _stepDelayMs = Math.Max(0, value);
                Monitor.PulseAll(_sync);
            }
        }
    }

    public void StartPaused(StepGranularity initialGranularity = StepGranularity.Chapter)
    {
        lock (_sync)
        {
            _cancelled = false;
            _granularity = initialGranularity;
            _isPaused = true;
            _singleStepArmed = false;
            _lastPacketCount = 0;
        }
        StateChanged?.Invoke("Paused");
    }

    public void Resume(int stepDelayMs = 0)
    {
        lock (_sync)
        {
            _granularity = StepGranularity.Continuous;
            _stepDelayMs = Math.Max(0, stepDelayMs);
            _isPaused = false;
            _singleStepArmed = false;
            Monitor.PulseAll(_sync);
        }
        StateChanged?.Invoke("Running");
    }

    public void Pause()
    {
        lock (_sync)
        {
            _isPaused = true;
            _singleStepArmed = false;
            Monitor.PulseAll(_sync);
        }
        StateChanged?.Invoke("Paused");
    }

    public void StepOnce(StepGranularity granularity)
    {
        lock (_sync)
        {
            _granularity = granularity;
            _isPaused = false;
            _singleStepArmed = true;
            Monitor.PulseAll(_sync);
        }
        StateChanged?.Invoke($"Stepping ({granularity})");
    }

    public void Cancel()
    {
        lock (_sync)
        {
            _cancelled = true;
            _isPaused = false;
            _singleStepArmed = false;
            Monitor.PulseAll(_sync);
        }
        StateChanged?.Invoke("Cancelled");
    }

    public void ResetPacketBaseline(int packetCount)
    {
        lock (_sync)
        {
            _lastPacketCount = packetCount;
        }
    }

    public void OnSampleCommitted(BusSample sample, int totalPacketCount)
    {
        bool hitBoundary;
        lock (_sync)
        {
            bool packetCompleted = totalPacketCount > _lastPacketCount;
            if (packetCompleted)
                _lastPacketCount = totalPacketCount;

            if (_cancelled)
                throw new OperationCanceledException("Simulation cancelled.");

            hitBoundary = _granularity switch
            {
                StepGranularity.HalfCycle => true,
                StepGranularity.ClockBit => sample.Kind is BusSampleKind.SclHighPhase
                    or BusSampleKind.StartCondition
                    or BusSampleKind.RepeatedStartCondition
                    or BusSampleKind.StopCondition
                    or BusSampleKind.IdleGap,
                StepGranularity.ProtocolField => packetCompleted,
                StepGranularity.Transaction => sample.Kind == BusSampleKind.StopCondition,
                StepGranularity.Chapter => false,
                _ => false
            };

            // Apply slow-motion delay on clock bits or framing edges while running continuously.
            if (!hitBoundary && !_isPaused && _stepDelayMs > 0 &&
                sample.Kind is BusSampleKind.SclHighPhase
                    or BusSampleKind.StartCondition
                    or BusSampleKind.RepeatedStartCondition
                    or BusSampleKind.StopCondition
                    or BusSampleKind.IdleGap)
            {
                Monitor.Wait(_sync, _stepDelayMs);
                if (_cancelled)
                    throw new OperationCanceledException("Simulation cancelled.");
            }
        }

        if (hitBoundary)
        {
            WaitAtBoundary($"Sample #{sample.Index} ({sample.Kind})");
        }
        else
        {
            WaitIfPaused($"Sample #{sample.Index}");
        }
    }

    public void NotifyTransactionBoundary(string description)
    {
        bool hit;
        lock (_sync)
        {
            if (_cancelled)
                throw new OperationCanceledException("Simulation cancelled.");
            hit = _granularity == StepGranularity.Transaction;
        }

        if (hit)
            WaitAtBoundary(description);
        else
            WaitIfPaused(description);
    }

    public void NotifyChapterBoundary(string description)
    {
        bool hit;
        lock (_sync)
        {
            if (_cancelled)
                throw new OperationCanceledException("Simulation cancelled.");
            hit = _granularity == StepGranularity.Chapter;
        }

        if (hit)
            WaitAtBoundary(description);
        else
            WaitIfPaused(description);
    }

    private void WaitAtBoundary(string reason)
    {
        bool notified = false;
        lock (_sync)
        {
            if (_cancelled)
                throw new OperationCanceledException("Simulation cancelled.");

            if (_singleStepArmed || _isPaused)
            {
                _isPaused = true;
                _singleStepArmed = false;
                _isWaiting = true;
                notified = true;
            }
        }

        if (notified)
            StateChanged?.Invoke($"Paused @ {reason}");

        WaitLoop();
    }

    private void WaitIfPaused(string reason)
    {
        bool needWait;
        lock (_sync)
        {
            if (_cancelled)
                throw new OperationCanceledException("Simulation cancelled.");
            needWait = _isPaused;
            if (needWait)
                _isWaiting = true;
        }

        if (needWait)
            StateChanged?.Invoke($"Paused @ {reason}");

        WaitLoop();
    }

    private void WaitLoop()
    {
        lock (_sync)
        {
            try
            {
                while (_isPaused && !_cancelled)
                {
                    Monitor.Wait(_sync);
                }

                if (_cancelled)
                    throw new OperationCanceledException("Simulation cancelled.");
            }
            finally
            {
                _isWaiting = false;
            }
        }
    }
}
