using I3CEmulator.Devices;
using I3CEmulator.Physical;
using I3CEmulator.Simulation;
using Xunit;
using Xunit.Abstractions;

namespace I3CEmulator.Tests;

public sealed class I3CProtocolAndScenarioTests
{
    private readonly ITestOutputHelper _output;

    public I3CProtocolAndScenarioTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public void FullScenario_ShouldPassAllAssertions_AndDecodeWithoutErrors()
    {
        var scenario = new I3CSimulationScenario(verboseTrace: false);
        scenario.RunAllChapters();

        Assert.Equal(35, scenario.AssertionsPassed.Count);

        var snap = scenario.Recorder.GetSnapshot();
        Assert.NotEmpty(snap.Samples);
        Assert.NotEmpty(snap.Packets);
        Assert.Equal(11, snap.Chapters.Length);

        foreach (var pkt in snap.Packets)
        {
            _output.WriteLine($"[Ch{pkt.ChapterIndex}] {pkt.StartTimeNs,8:N0}..{pkt.EndTimeNs,8:N0} ns | {pkt.Category,-20} | {pkt.ShortLabel,-18} | {pkt.Summary}");
            Assert.NotEqual(PacketCategory.Error, pkt.Category);
        }

        // Verify key protocol milestones were decoded accurately
        Assert.Contains(snap.Packets, p => p.Category == PacketCategory.CccCommand && p.ShortLabel.Contains("RSTDAA"));
        Assert.Contains(snap.Packets, p => p.Category == PacketCategory.CccCommand && p.ShortLabel.Contains("SETDASA"));
        Assert.Contains(snap.Packets, p => p.Category == PacketCategory.EntdaaArbitration64);
        Assert.Contains(snap.Packets, p => p.Category == PacketCategory.DynamicAddressAssign && p.ShortLabel.Contains("0x08"));
        Assert.Contains(snap.Packets, p => p.Category == PacketCategory.DynamicAddressAssign && p.ShortLabel.Contains("0x09"));
        Assert.Contains(snap.Packets, p => p.Category == PacketCategory.DynamicAddressAssign && p.ShortLabel.Contains("0x0B"));
        Assert.Contains(snap.Packets, p => p.Category == PacketCategory.LegacyI2C);
        Assert.Contains(snap.Packets, p => p.Category == PacketCategory.InBandInterrupt);
        Assert.Contains(snap.Packets, p => p.Category == PacketCategory.HotJoin);
        Assert.DoesNotContain(snap.Packets, p => p.Category == PacketCategory.AddressPushPull && p.ShortLabel == "7'h7E/R");
    }

    [Fact]
    public void ElectricalShortCircuit_ShouldThrowOnPushPullHighVsOpenDrainLow()
    {
        var bus = new I3CBus { VerboseTrace = false };
        var d1 = new DummyDevice("Dev1");
        var d2 = new DummyDevice("Dev2");
        bus.Attach(d1);
        bus.Attach(d2);

        bus.DriveSdaPushPull(d1, true);
        Assert.Throws<InvalidOperationException>(() => bus.DriveSdaOpenDrain(d2, false));
    }

    [Fact]
    public void StepGate_ShouldStepByChapterFieldAndBit_AndSupportCancellation()
    {
        var gate = new SimulationStepGate();
        var scenario = new I3CSimulationScenario(verboseTrace: false, stepGate: gate);
        scenario.ExecuteChapter(0);
        gate.StartPaused(StepGranularity.Chapter);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var worker = Task.Run(() => scenario.RunThroughChapter(3), cts.Token);

        // Wait until worker reaches chapter boundary pause or stalls in Chapter 1
        Assert.True(SpinWait.SpinUntil(() => gate.IsWaiting, TimeSpan.FromSeconds(3)));

        // Step through Chapter 1 completely
        gate.StepOnce(StepGranularity.Chapter);
        Assert.True(SpinWait.SpinUntil(() => scenario.LastCompletedChapter >= 1 && gate.IsWaiting, TimeSpan.FromSeconds(3)));

        // Step one ProtocolField inside Chapter 2
        int packetsBefore = scenario.Recorder.GetSnapshot().Packets.Length;
        gate.StepOnce(StepGranularity.ProtocolField);
        Assert.True(SpinWait.SpinUntil(() =>
            scenario.Recorder.GetSnapshot().Packets.Length > packetsBefore && gate.IsWaiting,
            TimeSpan.FromSeconds(3)));

        // Step one ClockBit inside Chapter 2
        int samplesBefore = scenario.Recorder.GetSnapshot().Samples.Length;
        gate.StepOnce(StepGranularity.ClockBit);
        Assert.True(SpinWait.SpinUntil(() =>
            scenario.Recorder.GetSnapshot().Samples.Length > samplesBefore && gate.IsWaiting,
            TimeSpan.FromSeconds(3)));

        // Resume remaining chapters through 3
        gate.Resume(stepDelayMs: 0);
        Assert.True(worker.Wait(TimeSpan.FromSeconds(5)));
        Assert.Equal(3, scenario.LastCompletedChapter);

        // Verify cancellation raises OperationCanceledException when paused
        var cancelGate = new SimulationStepGate();
        var cancelScenario = new I3CSimulationScenario(verboseTrace: false, stepGate: cancelGate);
        cancelGate.StartPaused(StepGranularity.ClockBit);
        var cancelTask = Task.Run(() => cancelScenario.RunAllChapters());
        Assert.True(SpinWait.SpinUntil(() => cancelGate.IsWaiting, TimeSpan.FromSeconds(3)));
        cancelGate.Cancel();
        var ex = Assert.Throws<AggregateException>(() => cancelTask.Wait(TimeSpan.FromSeconds(3)));
        Assert.IsType<OperationCanceledException>(ex.InnerException);
    }

    [Fact]
    public void InteractiveSandbox_ShouldExecuteLiveTrafficAndDecodeCleanly()
    {
        var scenario = new I3CSimulationScenario(verboseTrace: false);
        scenario.RunAllChapters();

        scenario.InteractivePrivateWrite(dynamicAddress: 0x09, regAddr: 0x30, 0xAB, 0xCD);
        byte[]? readBack = scenario.InteractivePrivateRead(dynamicAddress: 0x09, regAddr: 0x30, count: 2);
        Assert.NotNull(readBack);
        Assert.Equal(new byte[] { 0xAB, 0xCD }, readBack);

        Assert.True(scenario.InteractiveI2CWrite(regAddr: 0x10, 0x5A, 0xA5));
        byte[]? i2cRead = scenario.InteractiveI2CRead(regAddr: 0x10, count: 2);
        Assert.NotNull(i2cRead);
        Assert.Equal(new byte[] { 0x5A, 0xA5 }, i2cRead);

        scenario.InteractiveQueueAndServiceIbi(scenario.TargetA, mdb: 0x77, 0x12, 0x34);
        Assert.False(scenario.TargetA.HasPendingIbi);

        var snap = scenario.Recorder.GetSnapshot();
        Assert.DoesNotContain(snap.Packets, p => p.Category == PacketCategory.Error);
    }

    private sealed class DummyDevice : IBusDevice
    {
        public DummyDevice(string name) => Name = name;
        public string Name { get; }
        public BusDeviceKind DeviceKind => BusDeviceKind.I3CTarget;
        public string CurrentPhaseName => "Dummy";
        public byte? ActiveAddress => null;
        public bool IsDeviceConnected => true;
        public bool IsSpikeFilterActive => false;
        public bool WasLastPulseFilteredOut => false;
        public int ArbitrationLossCount => 0;
        public void AttachToBus(I3CBus bus) { }
        public void OnStartCondition() { }
        public void OnRepeatedStartCondition() { }
        public void OnStopCondition() { }
        public void OnSclFallingEdge(SclClockProfile upcomingProfile) { }
        public void OnSclRisingEdge(SclClockProfile profile, bool resolvedSda) { }
        public void OnBusFreeTimeAdvanced(long continuousFreeTimeNs) { }
    }
}
