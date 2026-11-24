using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Os;

/// <summary>
/// Deterministic simulated OS architecture layer (lwIP sys_arch) providing virtual clock and timers.
/// Zero reliance on real OS threads, real sockets, or WSL.
/// </summary>
public sealed class SimulatedSysArch : ISysArch
{
    private sealed class TimerEntry
    {
        public string Name { get; init; } = "";
        public long NextFireMs { get; set; }
        public long IntervalMs { get; init; }
        public bool Repeating { get; init; }
        public Action Callback { get; init; } = null!;
    }

    private readonly List<TimerEntry> _timers = [];
    private uint _rngState = 0x5A17C391;

    public long NowMs { get; private set; }

    public void ScheduleTimeout(string name, long delayMs, Action callback, bool repeating = false)
    {
        CancelTimeout(name);
        _timers.Add(new TimerEntry
        {
            Name = name,
            NextFireMs = NowMs + Math.Max(1, delayMs),
            IntervalMs = Math.Max(1, delayMs),
            Repeating = repeating,
            Callback = callback
        });
    }

    public void CancelTimeout(string name)
    {
        _timers.RemoveAll(t => t.Name == name);
    }

    public void AdvanceTime(long deltaMs)
    {
        long target = NowMs + Math.Max(0, deltaMs);
        while (true)
        {
            TimerEntry? next = null;
            foreach (var t in _timers)
            {
                if (t.NextFireMs <= target && (next == null || t.NextFireMs < next.NextFireMs))
                    next = t;
            }
            if (next == null) break;

            NowMs = next.NextFireMs;
            if (next.Repeating)
                next.NextFireMs = NowMs + next.IntervalMs;
            else
                _timers.Remove(next);

            next.Callback();
        }
        NowMs = target;
    }

    public void SetNowMs(long nowMs)
    {
        if (nowMs > NowMs) NowMs = nowMs;
    }

    public uint NextRandomUInt32()
    {
        // Deterministic xorshift32 for reproducible sequence numbers & IDs
        uint x = _rngState;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        _rngState = x;
        return x;
    }

    public ushort NextRandomUInt16() => (ushort)(NextRandomUInt32() & 0xFFFF);

    public void Reset()
    {
        NowMs = 0;
        _rngState = 0x5A17C391;
    }
}
