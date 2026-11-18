namespace HidI2cSimulation.Simulation;

public enum LogicChannelId
{
    Scl = 0,
    Sda = 1,
    Int = 2,
    Reset = 3
}

public readonly record struct LogicEdge(long TimeNs, byte Level);

public enum I2cFrameKind
{
    Start,
    RepeatedStart,
    AddressWrite,
    AddressRead,
    RegisterAddress,
    DataWrite,
    DataRead,
    Ack,
    Nack,
    Stop
}

public sealed record ProtocolFrame(
    long StartTimeNs,
    long EndTimeNs,
    I2cFrameKind Kind,
    string ShortText,
    string DetailText,
    byte? ByteValue = null,
    bool? IsAck = null
);

public sealed record SemanticSpan(
    long StartTimeNs,
    long EndTimeNs,
    string Category,
    string Label,
    string Detail,
    int TransactionId
);

public sealed record BusTransactionSummary(
    int Id,
    long StartTimeNs,
    long EndTimeNs,
    bool IsRead,
    byte SlaveAddress,
    ushort RegisterAddress,
    int ByteCount,
    bool Acked,
    string Summary,
    byte[] Data
)
{
    public string BookmarkLabel => $"#{Id} {Summary}";
}

/// <summary>
/// Captures bit-accurate I2C (SCL/SDA) and GPIO (INT#/RESET#) digital waveforms
/// alongside aligned protocol-decoder frames and transaction bookmarks.
/// </summary>
public sealed class LogicAnalyzerCapture
{
    private readonly List<LogicEdge>[] _channels;
    private readonly List<ProtocolFrame> _frames = new();
    private readonly List<SemanticSpan> _semanticSpans = new();
    private readonly List<BusTransactionSummary> _transactions = new();
    private readonly SimulationTimeline _timeline;

    private int _nextTxId = 1;

    public SimulationTimeline Timeline => _timeline;
    public IReadOnlyList<ProtocolFrame> Frames => _frames;
    public IReadOnlyList<SemanticSpan> SemanticSpans => _semanticSpans;
    public IReadOnlyList<BusTransactionSummary> Transactions => _transactions;

    public long TotalDurationNs => Math.Max(_timeline.CurrentTimeNs, 10_000L);

    public event Action? CaptureUpdated;

    public LogicAnalyzerCapture(SimulationTimeline timeline)
    {
        _timeline = timeline;
        _channels = new List<LogicEdge>[4];
        for (int i = 0; i < _channels.Length; i++)
            _channels[i] = new List<LogicEdge>();

        InitializeIdleStates();
    }

    private void InitializeIdleStates()
    {
        for (int i = 0; i < _channels.Length; i++)
        {
            _channels[i].Clear();
            _channels[i].Add(new LogicEdge(0, 1));
        }
    }

    public void Clear(byte initialIntLevel = 1, byte initialResetLevel = 1)
    {
        _timeline.Reset();
        _frames.Clear();
        _semanticSpans.Clear();
        _transactions.Clear();
        _nextTxId = 1;

        InitializeIdleStates();
        if (initialIntLevel != 1)
            RecordPinState(LogicChannelId.Int, 0, initialIntLevel);
        if (initialResetLevel != 1)
            RecordPinState(LogicChannelId.Reset, 0, initialResetLevel);

        NotifyUpdated();
    }

    public void NotifyUpdated() => CaptureUpdated?.Invoke();

    public IReadOnlyList<LogicEdge> GetChannelEdges(LogicChannelId channel) => _channels[(int)channel];

    public void RecordPinState(LogicChannelId channel, long timeNs, byte level)
    {
        var list = _channels[(int)channel];
        byte normalized = level != 0 ? (byte)1 : (byte)0;

        if (list.Count == 0)
        {
            list.Add(new LogicEdge(timeNs, normalized));
            return;
        }

        var last = list[^1];
        if (last.Level == normalized)
            return;

        long clampedTime = Math.Max(last.TimeNs, timeNs);
        if (clampedTime == last.TimeNs)
        {
            list[^1] = new LogicEdge(clampedTime, normalized);
        }
        else
        {
            list.Add(new LogicEdge(clampedTime, normalized));
        }
    }

    public byte GetLevelAt(LogicChannelId channel, long timeNs)
    {
        var list = _channels[(int)channel];
        if (list.Count == 0) return 1;

        int lo = 0;
        int hi = list.Count - 1;
        while (lo <= hi)
        {
            int mid = lo + ((hi - lo) >> 1);
            if (list[mid].TimeNs <= timeNs)
                lo = mid + 1;
            else
                hi = mid - 1;
        }

        return hi >= 0 ? list[hi].Level : list[0].Level;
    }

    /// <summary>
    /// Returns the index of the last edge at or before startNs (or 0).
    /// </summary>
    public int FindFirstEdgeIndex(LogicChannelId channel, long startNs)
    {
        var list = _channels[(int)channel];
        if (list.Count == 0) return 0;

        int lo = 0;
        int hi = list.Count - 1;
        while (lo <= hi)
        {
            int mid = lo + ((hi - lo) >> 1);
            if (list[mid].TimeNs <= startNs)
                lo = mid + 1;
            else
                hi = mid - 1;
        }

        return Math.Max(0, hi);
    }

    public void EmitIdleGap(long gapNs = 40_000)
    {
        if (_timeline.CurrentTimeNs > 0)
            _timeline.AdvanceNs(gapNs);
        else
            _timeline.AdvanceNs(10_000);
    }

    public void EmitI2cStart()
    {
        long half = _timeline.HalfPeriodNs;
        long startNs = _timeline.CurrentTimeNs;

        // Ensure bus idle HIGH
        RecordPinState(LogicChannelId.Scl, _timeline.CurrentTimeNs, 1);
        RecordPinState(LogicChannelId.Sda, _timeline.CurrentTimeNs, 1);
        _timeline.AdvanceNs(half / 2);

        // START: SDA falls while SCL is HIGH
        RecordPinState(LogicChannelId.Sda, _timeline.CurrentTimeNs, 0);
        _timeline.AdvanceNs(half / 2);

        // Pull SCL LOW to prepare first bit
        RecordPinState(LogicChannelId.Scl, _timeline.CurrentTimeNs, 0);
        long endNs = _timeline.CurrentTimeNs;

        _frames.Add(new ProtocolFrame(startNs, endNs, I2cFrameKind.Start, "S", "START condition (SDA falls while SCL=H)"));
    }

    public void EmitI2cRepeatedStart()
    {
        long half = _timeline.HalfPeriodNs;
        long startNs = _timeline.CurrentTimeNs;

        // Release SDA HIGH while SCL is LOW
        RecordPinState(LogicChannelId.Sda, _timeline.CurrentTimeNs, 1);
        _timeline.AdvanceNs(half / 2);

        // Release SCL HIGH
        RecordPinState(LogicChannelId.Scl, _timeline.CurrentTimeNs, 1);
        _timeline.AdvanceNs(half / 2);

        // Repeated START: SDA falls while SCL is HIGH
        RecordPinState(LogicChannelId.Sda, _timeline.CurrentTimeNs, 0);
        _timeline.AdvanceNs(half / 2);

        // Pull SCL LOW
        RecordPinState(LogicChannelId.Scl, _timeline.CurrentTimeNs, 0);
        long endNs = _timeline.CurrentTimeNs;

        _frames.Add(new ProtocolFrame(startNs, endNs, I2cFrameKind.RepeatedStart, "Sr", "REPEATED START condition (Direction switch without STOP)"));
    }

    public void EmitI2cByte(byte value, bool ack, I2cFrameKind kind, string shortText, string detailText)
    {
        long half = _timeline.HalfPeriodNs;
        long quarter = Math.Max(50L, half / 2);
        long byteStartNs = _timeline.CurrentTimeNs;

        // 8 data bits MSB first
        for (int bit = 7; bit >= 0; bit--)
        {
            byte level = (byte)((value >> bit) & 1);
            RecordPinState(LogicChannelId.Sda, _timeline.CurrentTimeNs, level);
            _timeline.AdvanceNs(quarter);

            RecordPinState(LogicChannelId.Scl, _timeline.CurrentTimeNs, 1);
            _timeline.AdvanceNs(half);

            RecordPinState(LogicChannelId.Scl, _timeline.CurrentTimeNs, 0);
            _timeline.AdvanceNs(quarter);
        }

        long dataEndNs = _timeline.CurrentTimeNs;
        _frames.Add(new ProtocolFrame(byteStartNs, dataEndNs, kind, shortText, detailText, value, ack));

        // 9th clock: ACK (0) or NACK (1)
        long ackStartNs = _timeline.CurrentTimeNs;
        RecordPinState(LogicChannelId.Sda, _timeline.CurrentTimeNs, ack ? (byte)0 : (byte)1);
        _timeline.AdvanceNs(quarter);

        RecordPinState(LogicChannelId.Scl, _timeline.CurrentTimeNs, 1);
        _timeline.AdvanceNs(half);

        RecordPinState(LogicChannelId.Scl, _timeline.CurrentTimeNs, 0);
        _timeline.AdvanceNs(quarter);

        long ackEndNs = _timeline.CurrentTimeNs;
        _frames.Add(new ProtocolFrame(
            ackStartNs,
            ackEndNs,
            ack ? I2cFrameKind.Ack : I2cFrameKind.Nack,
            ack ? "A" : "N",
            ack ? "ACK (SDA pulled LOW on 9th clock)" : "NACK (SDA HIGH on 9th clock)",
            null,
            ack));
    }

    public void EmitI2cStop()
    {
        long half = _timeline.HalfPeriodNs;
        long startNs = _timeline.CurrentTimeNs;

        // Ensure SDA LOW while SCL LOW
        RecordPinState(LogicChannelId.Sda, _timeline.CurrentTimeNs, 0);
        _timeline.AdvanceNs(half / 2);

        // Release SCL HIGH
        RecordPinState(LogicChannelId.Scl, _timeline.CurrentTimeNs, 1);
        _timeline.AdvanceNs(half / 2);

        // STOP: SDA rises while SCL is HIGH
        RecordPinState(LogicChannelId.Sda, _timeline.CurrentTimeNs, 1);
        _timeline.AdvanceNs(half / 2);

        long endNs = _timeline.CurrentTimeNs;
        _frames.Add(new ProtocolFrame(startNs, endNs, I2cFrameKind.Stop, "P", "STOP condition (SDA rises while SCL=H)"));
    }

    public int AddTransaction(
        long startTimeNs,
        long endTimeNs,
        bool isRead,
        byte slaveAddress,
        ushort registerAddress,
        int byteCount,
        bool acked,
        string semanticCategory,
        string summary,
        string detail,
        byte[] data)
    {
        int id = _nextTxId++;
        var tx = new BusTransactionSummary(id, startTimeNs, endTimeNs, isRead, slaveAddress, registerAddress, byteCount, acked, summary, data);
        _transactions.Add(tx);
        _semanticSpans.Add(new SemanticSpan(startTimeNs, endTimeNs, semanticCategory, summary, detail, id));
        NotifyUpdated();
        return id;
    }
}
