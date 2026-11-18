using HidI2cSimulation.Hardware;
using HidI2cSimulation.Protocol;
using HidI2cSimulation.Simulation;
using Xunit;

namespace HidI2cSimulation.Tests;

public class SimulationTests
{
    [Fact]
    public void ProtocolComplianceSuite_All13ChecksPass()
    {
        var session = new HidI2cSimulationSession();
        var results = ProtocolComplianceRunner.RunAll(session);

        Assert.Equal(13, results.Count);
        Assert.All(results, r => Assert.True(r.Passed, $"{r.TestName}: {r.Detail}"));
    }

    [Fact]
    public void StepByStepBootSequence_ProducesExpectedStagesTransactionsAndCommEvents()
    {
        var session = new HidI2cSimulationSession();
        Assert.Equal(BootStepStage.NotStarted, session.CurrentBootStage);

        // 1. ACPI
        Assert.True(session.ExecuteNextBootStep());
        Assert.Equal(BootStepStage.AcpiDiscovered, session.CurrentBootStage);

        // 2. HW RESET#
        Assert.True(session.ExecuteNextBootStep());
        Assert.Equal(BootStepStage.HardwareResetDone, session.CurrentBootStage);
        Assert.Contains(session.Capture.GetChannelEdges(LogicChannelId.Reset), e => e.Level == 0);

        // 3. Read 30B HID Descriptor
        Assert.True(session.ExecuteNextBootStep());
        Assert.Equal(BootStepStage.HidDescriptorRead, session.CurrentBootStage);
        Assert.NotNull(session.HostDriver.DeviceDescriptor);

        // 4. Soft RESET
        Assert.True(session.ExecuteNextBootStep());
        Assert.Equal(BootStepStage.SoftResetDone, session.CurrentBootStage);

        // 5. Read Report Descriptor
        Assert.True(session.ExecuteNextBootStep());
        Assert.Equal(BootStepStage.ReportDescriptorRead, session.CurrentBootStage);
        Assert.Equal(134, session.HostDriver.RawReportDescriptor?.Length);
        Assert.NotEmpty(session.HostDriver.ParsedReportItems);

        // 6. SET_POWER(ON)
        Assert.True(session.ExecuteNextBootStep());
        Assert.Equal(BootStepStage.Ready, session.CurrentBootStage);
        Assert.True(session.HostDriver.IsEnumerated);
        Assert.Equal(HidPowerState.On, session.TouchpadDevice.PowerState);

        // Next call returns false since boot is complete
        Assert.False(session.ExecuteNextBootStep());

        // 4 I2C bus transactions generated during boot (HID Desc, Soft Reset, Report Desc, SetPower)
        Assert.Equal(4, session.Capture.Transactions.Count);
        Assert.NotEmpty(session.CommEvents);
    }

    [Fact]
    public void ManualIsrTouchCycle_HoldsIntLowUntilReadCompletesAndReleasesAfterDataBytes()
    {
        var session = new HidI2cSimulationSession();
        while (session.ExecuteNextBootStep()) { }

        session.HostDriver.AutoServiceInterrupts = false;
        session.TriggerTouch(1234, 2345, leftBtn: true);

        // INT# must remain LOW and FIFO must hold 1 packet until ISR runs
        Assert.Equal(PinState.Low, session.InterruptPin.CurrentState);
        Assert.Equal(1, session.TouchpadDevice.InputQueueCount);
        int txCountBeforeIsr = session.Capture.Transactions.Count;

        // Now manually service ISR
        Assert.True(session.ServicePendingInterrupt());

        Assert.Equal(PinState.High, session.InterruptPin.CurrentState);
        Assert.Equal(0, session.TouchpadDevice.InputQueueCount);
        Assert.Equal(txCountBeforeIsr + 1, session.Capture.Transactions.Count);

        var rpt = session.HostDriver.LastReceivedReport;
        Assert.NotNull(rpt);
        Assert.Equal(1234, rpt!.X);
        Assert.Equal(2345, rpt.Y);
        Assert.True(rpt.LeftButton);

        // Verify LA INT# rising edge occurs AFTER the DataRead frames of the ISR transaction
        var isrTx = session.Capture.Transactions[^1];
        var intEdges = session.Capture.GetChannelEdges(LogicChannelId.Int);
        var lastIntEdge = intEdges[^1];
        Assert.Equal((byte)1, lastIntEdge.Level);
        Assert.True(lastIntEdge.TimeNs >= isrTx.EndTimeNs - 2000 && lastIntEdge.TimeNs <= isrTx.EndTimeNs);
        Assert.True(lastIntEdge.TimeNs > isrTx.StartTimeNs);
    }

    [Fact]
    public void LogicAnalyzerCapture_EmitsValidI2cStartRepeatedStartAckNackStopSequence()
    {
        var session = new HidI2cSimulationSession();
        session.RunStepAcpiDiscovery();
        session.RunStepReadHidDescriptor();

        var frames = session.Capture.Frames;
        Assert.Equal(I2cFrameKind.Start, frames[0].Kind);
        Assert.Equal(I2cFrameKind.AddressWrite, frames[1].Kind);
        Assert.Equal(I2cFrameKind.Ack, frames[2].Kind);
        Assert.Contains(frames, f => f.Kind == I2cFrameKind.RepeatedStart);
        Assert.Contains(frames, f => f.Kind == I2cFrameKind.AddressRead);
        Assert.Equal(I2cFrameKind.Nack, frames[^2].Kind);
        Assert.Equal(I2cFrameKind.Stop, frames[^1].Kind);
    }
}
