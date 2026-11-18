using I3CEmulator.Devices;
using I3CEmulator.Physical;
using I3CEmulator.Protocol;

namespace I3CEmulator.Simulation;

public sealed record ChapterDefinition(
    int Index,
    string Title,
    string Summary,
    string[] KeySignals);

public sealed record SimulationMetricsSnapshot(
    long SimulatedTimeNs,
    int OpenDrainBitCount,
    int PushPullBitCount,
    int FilteredI3CPulsesOnLegacyI2C,
    int CompletedLegacyI2CTransactions,
    int RegisteredTargetsInDat);

/// <summary>
/// Shared MIPI I3C v1.1.1 SDR &amp; Legacy I2C verification scenario engine consumed by both the
/// Console testbench and the Logic Analyzer GUI application.
/// </summary>
public sealed class I3CSimulationScenario
{
    public static readonly IReadOnlyList<ChapterDefinition> ChapterCatalog =
    [
        new(0, "PHYSICAL BUS SETUP & DEVICE TOPOLOGY",
            "Attach 1 Controller, 4 I3C Targets (Target D powered off at boot), and 1 Legacy 24C02 EEPROM onto shared SCL + SDA wires.",
            ["SCL=1 (Idle)", "SDA=1 (Pull-Up Rp)", "TargetB 50ns Filter=ON"]),
        new(1, "INITIAL WAKE-UP BROADCAST (7'h7E) & 50 ns SPIKE FILTER",
            "Controller sends first 7'h7E/W broadcast with tHIGH=200ns (>=50ns) so dual-mode Target B disables its 50ns spike filter, followed by RSTDAA (0x06).",
            ["FirstBroadcast tHIGH=200ns", "TargetB Filter->OFF", "RSTDAA (0x06)"]),
        new(2, "STATIC-TO-DYNAMIC ADDRESS ASSIGNMENT (SETDASA, CCC 0x87)",
            "Controller assigns DA=0x0A directly to Target B via Static Address 0x48 without 64-bit arbitration. Notice 0x48/W after Sr runs in 12.5 MHz Push-Pull.",
            ["S -> 7E/W(OD)", "CCC 0x87(PP)", "Sr -> 0x48/W(PP)", "DA=0x0A"]),
        new(3, "DYNAMIC ADDRESS ASSIGNMENT (ENTDAA, CCC 0x07) & 64-BIT ARBITRATION",
            "Target A and Target C compete in 64-bit Open-Drain Wired-AND arbitration {PID, BCR, DCR}. Target C (smaller PID) wins Round 1 -> DA=0x08; Target A wins Round 2 -> DA=0x09.",
            ["Sr -> 7E/R(OD)", "64-bit Wired-AND Arb", "TargetC=0x08", "TargetA=0x09"]),
        new(4, "DIRECT CCCs (GETPID, GETBCR, GETDCR) & ENEC",
            "Controller verifies Target A identity via Direct Push-Pull Read CCCs (0x8D, 0x8E, 0x8F) and enables In-Band Interrupts across all targets using Broadcast ENEC (0x00).",
            ["GETPID/BCR/DCR (PP)", "ENEC Broadcast (0x00)", "IBI Enabled"]),
        new(5, "PRIVATE HIGH-SPEED I3C SDR READ & WRITE (12.5 MHz PUSH-PULL)",
            "Controller writes [0x20, 0x11, 0x22, 0x33, 0x44] and reads back 4 bytes at 12.5 MHz Push-Pull using 9th T-bits (Odd Parity on Write, End-of-Data on Read). Legacy EEPROM filters out narrow 40ns pulses.",
            ["Write + Parity T-Bit", "Read + EOD T-Bit", "EEPROM Spike Filter Blocks 40ns"]),
        new(6, "LEGACY I2C SLAVE COMPATIBILITY ON THE SAME I3C BUS",
            "Controller switches to 400 kHz Open-Drain (tHIGH=600ns >= 50ns) to read and write Legacy 24C02 EEPROM (0x50) using classic 9th-bit ACK/NACK.",
            ["I2C-FM 400kHz OD", "50ns Filter Passes", "Classic 9th ACK/NACK"]),
        new(7, "IN-BAND INTERRUPT (IBI) ARBITRATION & SERVICING",
            "7A: Target A waits tAVAL (1us) and pulls SDA LOW for Target-initiated START -> MDB 0x88 + payload [0x01, 0x02].\n7B: Simultaneous collision between Master (7E/W), Target A (0x09/R), and Target C (0x08/R); Target C wins first, Target A wins retry.",
            ["tAVAL (1us) Target START", "3-Way Header Arb", "MDB + Payload (PP)"]),
        new(8, "CONTROLLER NACKing AN IBI & DISABLING INTERRUPTS (DISEC)",
            "Controller NACKs Target A's IBI (Target A keeps pending), silences it via Direct DISEC (0x81) after Sr, then re-enables via ENEC.",
            ["Master NACK(1) on Bit 9", "Sr -> DISEC 0x81", "ENEC Re-enable"]),
        new(9, "HOT-JOIN (CONNECTING NEW DEVICE AT RUN-TIME, 7'h02/W)",
            "Target D powers on, waits tIDLE (200us), pulls SDA LOW and sends 7'h02/W. Controller ACKs and runs ENTDAA to assign Target D DA=0x0B.",
            ["tIDLE (200us)", "7'h02/W Hot-Join", "ENTDAA -> DA=0x0B"]),
        new(10, "BUS SIMULATION METRICS & SUMMARY",
            "Final verification of total simulated time, Open-Drain vs Push-Pull bit counts, blocked pulses on Legacy I2C, and DAT registration.",
            ["Simulation Complete", "All Assertions Passed"])
    ];

    public I3CBus Bus { get; }
    public BusWaveformRecorder Recorder { get; }
    public SimulationStepGate? StepGate { get; }
    public I3CMaster Master { get; }
    public I3CSlave TargetA { get; }
    public I3CSlave TargetB { get; }
    public I3CSlave TargetC { get; }
    public I3CSlave TargetD { get; }
    public I2CSlave LegacyI2C { get; }

    public I3CDeviceIdentity TargetAIdentity { get; }
    public I3CDeviceIdentity TargetBIdentity { get; }
    public I3CDeviceIdentity TargetCIdentity { get; }
    public I3CDeviceIdentity TargetDIdentity { get; }

    public int LastCompletedChapter { get; private set; } = -1;
    public List<string> AssertionsPassed { get; } = new();

    public event Action<ChapterDefinition>? ChapterStarted;
    public event Action<ChapterDefinition, string[]>? ChapterCompleted;
    public event Action<string>? InfoLogged;
    public event Action<string>? AssertionVerified;

    // Captures latest IBI delivered during Scenario 7A.
    private byte _lastIbiDa;
    private byte _lastIbiMdb;
    private byte[] _lastIbiPayload = Array.Empty<byte>();
    private bool _hotJoinDetected;

    public I3CSimulationScenario(
        bool verboseTrace = true,
        Action<string>? logSink = null,
        SimulationStepGate? stepGate = null)
    {
        Recorder = new BusWaveformRecorder();
        StepGate = stepGate;
        Bus = new I3CBus
        {
            VerboseTrace = verboseTrace,
            LogSink = logSink,
            Recorder = Recorder,
            StepGate = stepGate
        };

        Master = new I3CMaster();
        Bus.Attach(Master);

        TargetAIdentity = new I3CDeviceIdentity(
            I3CDeviceIdentity.BuildProvisionalId(0x0123, 0x4001, instanceId4Bit: 0),
            BcrFlags.IbiRequestCapable | BcrFlags.IbiHasMandatoryDataByte,
            Dcr: 0x41);
        TargetA = new I3CSlave("TargetA-Gyro", TargetAIdentity);
        Bus.Attach(TargetA);

        TargetBIdentity = new I3CDeviceIdentity(
            I3CDeviceIdentity.BuildProvisionalId(0x0123, 0x4002, instanceId4Bit: 1),
            BcrFlags.IbiRequestCapable | BcrFlags.IbiHasMandatoryDataByte,
            Dcr: 0x62);
        TargetB = new I3CSlave("TargetB-Temp", TargetBIdentity, staticAddress7Bit: 0x48);
        Bus.Attach(TargetB);

        TargetCIdentity = new I3CDeviceIdentity(
            I3CDeviceIdentity.BuildProvisionalId(0x0055, 0x1000, instanceId4Bit: 0),
            BcrFlags.IbiRequestCapable,
            Dcr: 0xC5);
        TargetC = new I3CSlave("TargetC-Alert", TargetCIdentity);
        Bus.Attach(TargetC);

        TargetDIdentity = new I3CDeviceIdentity(
            I3CDeviceIdentity.BuildProvisionalId(0x0789, 0x9999, instanceId4Bit: 0),
            BcrFlags.IbiRequestCapable | BcrFlags.IbiHasMandatoryDataByte,
            Dcr: 0x00);
        TargetD = new I3CSlave("TargetD-HotPlug", TargetDIdentity, connectedAtPowerOn: false);
        Bus.Attach(TargetD);

        LegacyI2C = new I2CSlave("Legacy-EEPROM-24C02", staticAddress7Bit: 0x50, lvr: 0x00);
        Bus.Attach(LegacyI2C);
        Master.LegacyI2CTable.Add(LegacyI2C.GetDescriptor());

        LegacyI2C.Registers[0x10] = 0xAA;
        LegacyI2C.Registers[0x11] = 0xBB;
        LegacyI2C.Registers[0x12] = 0xCC;

        Master.OnInBandInterruptReceived += (da, mdb, payload) =>
        {
            _lastIbiDa = da;
            _lastIbiMdb = mdb;
            _lastIbiPayload = payload;
        };

        Master.OnHotJoinDetected += () => _hotJoinDetected = true;
    }

    public void RunAllChapters() => RunThroughChapter(10);

    public void RunThroughChapter(int targetChapter)
    {
        for (int ch = LastCompletedChapter + 1; ch <= targetChapter && ch <= 10; ch++)
        {
            ExecuteChapter(ch);
        }
    }

    public SimulationMetricsSnapshot GetMetrics() =>
        new(
            Bus.SimulatedTimeNs,
            Bus.OpenDrainBitCount,
            Bus.PushPullBitCount,
            LegacyI2C.FilteredOutI3CClockPulses,
            LegacyI2C.CompletedI2CTransactions,
            Master.TargetTable.Count);

    public void ExecuteChapter(int chapterIndex)
    {
        var def = ChapterCatalog[chapterIndex];
        Recorder.BeginChapter(chapterIndex, def.Title, Bus.SimulatedTimeNs);
        ChapterStarted?.Invoke(def);

        var chapterAssertions = new List<string>();

        void Check(bool condition, string message)
        {
            if (!condition)
                throw new InvalidOperationException($"[ASSERTION FAILED in Chapter {chapterIndex}]: {message}");

            chapterAssertions.Add(message);
            AssertionsPassed.Add(message);
            AssertionVerified?.Invoke(message);
        }

        switch (chapterIndex)
        {
            case 0:
                Bus.Log("[Chapter 0] Topology initialized: 1 Controller, 4 I3C Targets, 1 Legacy I2C EEPROM (0x50). Bus IDLE.");
                StepGate?.NotifyTransactionBoundary("Chapter 0 Topology Initialized");
                break;

            case 1:
                Master.ExecuteRstdaa();
                Check(!TargetB.IsI2CSpikeFilterEnabled,
                    "Target B must disable its 50ns spike filter after seeing 7'h7E.");
                Check(TargetA.DynamicAddress is null && TargetB.DynamicAddress is null && TargetC.DynamicAddress is null,
                    "All Targets must start with DynamicAddress = null after RSTDAA.");
                break;

            case 2:
                bool setdasaOk = Master.ExecuteSetdasa(staticAddress7Bit: 0x48, dynamicAddressToAssign: 0x0A);
                Check(setdasaOk, "SETDASA to Target B must succeed.");
                Check(TargetB.DynamicAddress == 0x0A, "Target B Dynamic Address must now be 0x0A.");
                Master.TargetTable[0x0A] = TargetBIdentity;
                break;

            case 3:
                int entdaaAssigned = Master.ExecuteEntdaa();
                Check(entdaaAssigned == 2, $"ENTDAA must assign exactly 2 targets (assigned: {entdaaAssigned}).");
                Check(TargetC.DynamicAddress == 0x08, $"Target C (smaller PID) must win Round 1 -> DA=0x08 (got 0x{TargetC.DynamicAddress:X2}).");
                Check(TargetA.DynamicAddress == 0x09, $"Target A must win Round 2 -> DA=0x09 (got 0x{TargetA.DynamicAddress:X2}).");
                break;

            case 4:
                ulong? pidA = Master.GetProvisionalId(0x09);
                BcrFlags? bcrA = Master.GetBcr(0x09);
                byte? dcrA = Master.GetDcr(0x09);
                InfoLogged?.Invoke($"Target A (0x09): PID=0x{pidA:X12}, BCR=0x{(byte)bcrA!:X2} ({bcrA}), DCR=0x{dcrA:X2}");

                Check(pidA == TargetAIdentity.ProvisionalId48, "GETPID must match Target A's 48-bit PID.");
                Check(bcrA == TargetAIdentity.Bcr, "GETBCR must match Target A's BCR.");
                Check(dcrA == TargetAIdentity.Dcr, "GETDCR must match Target A's DCR.");

                Master.EnableEvents(TargetEventMask.InBandInterrupt);
                Check(TargetA.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt), "Target A IBI must be enabled.");
                Check(TargetB.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt), "Target B IBI must be enabled.");
                Check(TargetC.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt), "Target C IBI must be enabled.");
                break;

            case 5:
                byte[] writePayload = { 0x20, 0x11, 0x22, 0x33, 0x44 };
                bool writeOk = Master.PrivateWrite(dynamicAddress: 0x09, useBroadcastPreamble: true, writePayload);
                Check(writeOk, "Private Write to Target A (0x09) must succeed.");
                Check(TargetA.Registers[0x20] == 0x11 && TargetA.Registers[0x21] == 0x22 &&
                      TargetA.Registers[0x22] == 0x33 && TargetA.Registers[0x23] == 0x44,
                    "Target A Registers[0x20..0x23] must hold [0x11, 0x22, 0x33, 0x44].");

                TargetA.RegisterPointer = 0x20;
                byte[]? readBack = Master.PrivateRead(dynamicAddress: 0x09, byteCount: 4);
                Check(readBack is not null && readBack.SequenceEqual(new byte[] { 0x11, 0x22, 0x33, 0x44 }),
                    "Private Read from Target A must return [0x11, 0x22, 0x33, 0x44].");
                Check(LegacyI2C.FilteredOutI3CClockPulses > 0,
                    $"Legacy EEPROM 50ns spike filter must suppress narrow I3C pulses ({LegacyI2C.FilteredOutI3CClockPulses} blocked).");
                break;

            case 6:
                byte[]? eepromRead = Master.I2CWriteRead(staticAddress7Bit: 0x50, registerAddress: 0x10, readCount: 3);
                Check(eepromRead is not null && eepromRead.SequenceEqual(new byte[] { 0xAA, 0xBB, 0xCC }),
                    "Legacy I2C EEPROM must return pre-filled [0xAA, 0xBB, 0xCC].");

                bool i2cWriteOk = Master.I2CWrite(staticAddress7Bit: 0x50, registerAddress: 0x10, 0xDE, 0xAD, 0xBE, 0xEF);
                Check(i2cWriteOk, "Legacy I2C Write to EEPROM (0x50) must succeed.");
                Check(LegacyI2C.Registers[0x10] == 0xDE && LegacyI2C.Registers[0x11] == 0xAD,
                    "Legacy EEPROM Registers[0x10..0x11] must update to [0xDE, 0xAD].");

                eepromRead = Master.I2CWriteRead(staticAddress7Bit: 0x50, registerAddress: 0x10, readCount: 4);
                Check(eepromRead is not null && eepromRead.SequenceEqual(new byte[] { 0xDE, 0xAD, 0xBE, 0xEF }),
                    "Legacy I2C EEPROM read-back must return [0xDE, 0xAD, 0xBE, 0xEF].");
                break;

            case 7:
                // 7A: Target-Initiated START after tAVAL (1 us)
                TargetA.QueueInBandInterrupt(mandatoryDataByte: 0x88, 0x01, 0x02);
                Check(TargetA.HasPendingIbi, "Target A must have pending IBI queued.");
                StepGate?.NotifyTransactionBoundary("7A: Target A queued IBI (MDB=0x88)");

                bool serviced = Master.CheckAndServiceTargetInterrupts(idleTimeStepNs: 1_200);
                Check(serviced, "Controller must service Target A's IBI after tAVAL.");
                Check(_lastIbiDa == 0x09 && _lastIbiMdb == 0x88 && _lastIbiPayload.SequenceEqual(new byte[] { 0x01, 0x02 }),
                    "Received IBI must be DA=0x09, MDB=0x88, Payload=[0x01, 0x02].");
                Check(!TargetA.HasPendingIbi, "Target A pending IBI must clear after ACK.");

                // 7B: 3-Way Arbitration Collision (Master 7E/W vs Target A 0x09/R vs Target C 0x08/R)
                TargetA.QueueInBandInterrupt(mandatoryDataByte: 0xA1);
                TargetC.QueueInBandInterrupt(mandatoryDataByte: 0xC1);
                StepGate?.NotifyTransactionBoundary("7B: Target A + Target C queued simultaneous IBIs");

                bool writeWithCollisionsOk = Master.PrivateWrite(dynamicAddress: 0x0A, useBroadcastPreamble: true, 0x55, 0x66);
                Check(writeWithCollisionsOk, "Private Write to Target B (0x0A) must succeed after servicing both IBIs.");
                Check(!TargetC.HasPendingIbi && !TargetA.HasPendingIbi,
                    "Both Target C (higher priority, 0x08) and Target A (0x09) IBIs must be serviced.");
                break;

            case 8:
                TargetA.QueueInBandInterrupt(mandatoryDataByte: 0xFF);
                Master.RejectNextIbiWithNack = true;
                StepGate?.NotifyTransactionBoundary("Target A queued IBI; Master armed to NACK");

                Master.CheckAndServiceTargetInterrupts(idleTimeStepNs: 1_200);
                Check(TargetA.HasPendingIbi, "Target A must keep IBI pending when Controller NACKs it.");

                Master.DisableEvents(TargetEventMask.InBandInterrupt, targetDynamicAddress: 0x09);
                Check(!TargetA.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt),
                    "Target A IBI must be disabled after Direct DISEC (0x81).");

                Master.EnableEvents(TargetEventMask.InBandInterrupt, targetDynamicAddress: 0x09);
                Check(TargetA.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt),
                    "Target A IBI re-enabled after ENEC.");
                break;

            case 9:
                _hotJoinDetected = false;
                TargetD.PlugInForHotJoin();
                Check(TargetD.HasPendingHotJoin, "Target D must have pending Hot-Join request.");
                StepGate?.NotifyTransactionBoundary("Target D hot-plugged onto bus");

                Master.CheckAndServiceTargetInterrupts(idleTimeStepNs: Timing.BusIdleNs + 5_000);
                Check(_hotJoinDetected, "Controller must detect and ACK Target D's 7'h02/W Hot-Join request.");
                Check(TargetD.DynamicAddress.HasValue, $"Target D must receive Dynamic Address via ENTDAA (got 0x{TargetD.DynamicAddress:X2}).");
                break;

            case 10:
                var metrics = GetMetrics();
                Check(metrics.RegisteredTargetsInDat == 4, $"DAT must contain 4 registered I3C targets (got {metrics.RegisteredTargetsInDat}).");
                Check(metrics.OpenDrainBitCount > 0 && metrics.PushPullBitCount > 0,
                    "Bus must record both Open-Drain and 12.5 MHz Push-Pull clock cycles.");
                break;
        }

        Recorder.CompleteCurrentChapter(Bus.SimulatedTimeNs);
        LastCompletedChapter = chapterIndex;
        ChapterCompleted?.Invoke(def, chapterAssertions.ToArray());
        StepGate?.NotifyChapterBoundary($"Chapter {chapterIndex} Complete: {def.Title}");
    }

    // =================================================================================================
    //  INTERACTIVE SANDBOX OPERATIONS (Triggerable from GUI after or between chapters)
    // =================================================================================================

    public void InteractiveQueueAndServiceIbi(I3CSlave target, byte mdb, params byte[] payload)
    {
        if (!target.DynamicAddress.HasValue)
            throw new InvalidOperationException($"{target.Name} does not have a Dynamic Address yet. Run Chapters 1-3 first.");

        if (!target.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt))
            Master.EnableEvents(TargetEventMask.InBandInterrupt, target.DynamicAddress.Value);

        target.QueueInBandInterrupt(mdb, payload);
        Master.CheckAndServiceTargetInterrupts(idleTimeStepNs: 1_200);
    }

    public void InteractivePrivateWrite(byte dynamicAddress, byte regAddr, params byte[] data)
    {
        byte[] payload = new byte[1 + data.Length];
        payload[0] = regAddr;
        Array.Copy(data, 0, payload, 1, data.Length);
        Master.PrivateWrite(dynamicAddress, useBroadcastPreamble: true, payload);
    }

    public byte[]? InteractivePrivateRead(byte dynamicAddress, byte regAddr, int count)
    {
        I3CSlave? target = new[] { TargetA, TargetB, TargetC, TargetD }
            .FirstOrDefault(t => t.DynamicAddress == dynamicAddress);
        if (target is not null)
            target.RegisterPointer = regAddr;

        return Master.PrivateRead(dynamicAddress, count);
    }

    public byte[]? InteractiveI2CRead(byte regAddr, int count) =>
        Master.I2CWriteRead(LegacyI2C.StaticAddress7Bit, regAddr, count);

    public bool InteractiveI2CWrite(byte regAddr, params byte[] data) =>
        Master.I2CWrite(LegacyI2C.StaticAddress7Bit, regAddr, data);

    public void InteractiveHotJoinTargetD()
    {
        if (TargetD.IsConnectedToBus && TargetD.DynamicAddress.HasValue)
            return;

        TargetD.PlugInForHotJoin();
        Master.CheckAndServiceTargetInterrupts(idleTimeStepNs: Timing.BusIdleNs + 5_000);
    }
}
