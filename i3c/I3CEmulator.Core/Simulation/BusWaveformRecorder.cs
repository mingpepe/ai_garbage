using I3CEmulator.Physical;

namespace I3CEmulator.Simulation;

/// <summary>
/// Distinguishes the exact physical bus phase captured by a <see cref="BusSample"/>.
/// </summary>
public enum BusSampleKind
{
    IdleGap,
    StartCondition,
    RepeatedStartSetup,
    RepeatedStartCondition,
    StopSetup,
    StopCondition,
    SclLowPhase,
    SclHighPhase
}

/// <summary>
/// Immutable per-device hardware pad and protocol state captured at a single bus sample.
/// </summary>
public readonly record struct DeviceSampleSnapshot(
    string DeviceName,
    DriveMode PadMode,
    bool PadLevel,
    string PhaseName,
    byte? DynamicAddress,
    bool IsConnected,
    bool IsSpikeFilterEnabled,
    bool SpikeFilterBlockedPulse,
    bool LostArbitrationOnEdge);

/// <summary>
/// Immutable waveform sample representing one electrical state interval on the two-wire I3C bus.
/// </summary>
public sealed record BusSample(
    int Index,
    long StartTimeNs,
    long DurationNs,
    BusSampleKind Kind,
    bool Scl,
    bool Sda,
    SclClockProfile? Profile,
    DriveMode ResolvedBusMode,
    string? Annotation,
    int ChapterIndex,
    DeviceSampleSnapshot[] Devices)
{
    public long EndTimeNs => StartTimeNs + DurationNs;
}

/// <summary>
/// Marks the sample and time range covered by an educational simulation chapter.
/// </summary>
public sealed record ChapterMarker(
    int ChapterIndex,
    string Title,
    int StartSampleIndex,
    long StartTimeNs,
    int? EndSampleIndex = null,
    long? EndTimeNs = null);

/// <summary>
/// Thread-safe capture buffer storing physical <see cref="BusSample"/> waveforms, incremental
/// <see cref="DecodedPacket"/> records, log entries, and chapter markers for live UI inspection.
/// </summary>
public sealed class BusWaveformRecorder
{
    private readonly object _sync = new();
    private readonly List<BusSample> _samples = new();
    private readonly List<ChapterMarker> _chapters = new();
    private readonly List<string> _logs = new();
    private readonly I3CProtocolDecoder _decoder = new();

    private int _currentChapterIndex;

    public event Action<BusSample>? SampleRecorded;
    public event Action<string>? LogAppended;

    public int CurrentChapterIndex
    {
        get { lock (_sync) return _currentChapterIndex; }
    }

    public int SampleCount
    {
        get { lock (_sync) return _samples.Count; }
    }

    public int PacketCount
    {
        get { lock (_sync) return _decoder.Packets.Count; }
    }

    public void BeginChapter(int chapterIndex, string title, long currentTimeNs)
    {
        lock (_sync)
        {
            // Close previous chapter end boundary if open.
            if (_chapters.Count > 0)
            {
                var prev = _chapters[^1];
                if (prev.EndSampleIndex is null)
                {
                    _chapters[^1] = prev with
                    {
                        EndSampleIndex = Math.Max(0, _samples.Count - 1),
                        EndTimeNs = currentTimeNs
                    };
                }
            }

            _currentChapterIndex = chapterIndex;
            _chapters.Add(new ChapterMarker(chapterIndex, title, _samples.Count, currentTimeNs));
        }
    }

    public void CompleteCurrentChapter(long currentTimeNs)
    {
        lock (_sync)
        {
            if (_chapters.Count > 0)
            {
                var last = _chapters[^1];
                _chapters[^1] = last with
                {
                    EndSampleIndex = Math.Max(last.StartSampleIndex, _samples.Count - 1),
                    EndTimeNs = currentTimeNs
                };
            }
        }
    }

    public BusSample RecordSample(
        long startTimeNs,
        long durationNs,
        BusSampleKind kind,
        bool scl,
        bool sda,
        SclClockProfile? profile,
        DriveMode resolvedBusMode,
        string? annotation,
        DeviceSampleSnapshot[] devices)
    {
        BusSample sample;
        lock (_sync)
        {
            sample = new BusSample(
                Index: _samples.Count,
                StartTimeNs: startTimeNs,
                DurationNs: durationNs,
                Kind: kind,
                Scl: scl,
                Sda: sda,
                Profile: profile,
                ResolvedBusMode: resolvedBusMode,
                Annotation: annotation,
                ChapterIndex: _currentChapterIndex,
                Devices: devices);

            _samples.Add(sample);
            _decoder.ProcessSample(sample);
        }

        SampleRecorded?.Invoke(sample);
        return sample;
    }

    public void RecordLog(string line)
    {
        lock (_sync)
        {
            _logs.Add(line);
        }
        LogAppended?.Invoke(line);
    }

    public WaveformSnapshot GetSnapshot()
    {
        lock (_sync)
        {
            return new WaveformSnapshot(
                _samples.ToArray(),
                _decoder.GetPacketsSnapshot(),
                _chapters.ToArray(),
                _logs.ToArray());
        }
    }

    public void Clear()
    {
        lock (_sync)
        {
            _samples.Clear();
            _chapters.Clear();
            _logs.Clear();
            _decoder.Reset();
            _currentChapterIndex = 0;
        }
    }
}

public sealed record WaveformSnapshot(
    BusSample[] Samples,
    DecodedPacket[] Packets,
    ChapterMarker[] Chapters,
    string[] Logs);
