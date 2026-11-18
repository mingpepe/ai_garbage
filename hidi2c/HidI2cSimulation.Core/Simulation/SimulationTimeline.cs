namespace HidI2cSimulation.Simulation;

/// <summary>
/// Deterministic nanosecond-resolution hardware simulation clock used to align
/// GPIO transitions, bit-level I2C waveforms, and protocol decoder frames.
/// </summary>
public sealed class SimulationTimeline
{
    private long _currentTimeNs;

    public int I2cClockFrequencyHz { get; set; } = 400_000;

    public long HalfPeriodNs => Math.Max(100L, 1_000_000_000L / (2L * Math.Max(1, I2cClockFrequencyHz)));

    public long CurrentTimeNs => _currentTimeNs;

    public double CurrentTimeUs => _currentTimeNs / 1000.0;

    public void AdvanceNs(long deltaNs)
    {
        if (deltaNs > 0)
            _currentTimeNs += deltaNs;
    }

    public void AdvanceUs(double deltaUs)
    {
        if (deltaUs > 0)
            _currentTimeNs += (long)(deltaUs * 1000.0);
    }

    public void Reset()
    {
        _currentTimeNs = 0;
    }
}
