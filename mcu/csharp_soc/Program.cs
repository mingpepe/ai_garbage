using System;
using System.IO;
using System.Threading;

namespace DualCoreSoC;

public static class Program
{
    public static int Main(string[] args)
    {
        bool gdbMode        = Array.Exists(args, a => a == "--gdb");
        bool freeThreadMode = Array.Exists(args, a => a == "--free-threads");

        string baseDir   = FindWorkspaceRoot();
        string core0Bin  = Path.Combine(baseDir, "fw", "build", "fw_core0.bin");
        string core1Bin  = Path.Combine(baseDir, "fw", "build", "fw_core1.bin");

        if (!File.Exists(core0Bin) || !File.Exists(core1Bin))
        {
            Console.Error.WriteLine($"[C# SoC] Error: Firmware binaries not found at {core0Bin} / {core1Bin}. Run 'make fw' first.");
            return 1;
        }

        var bus     = new SoCBus();
        bus.LoadBinaryToSram(0, core0Bin);
        bus.LoadBinaryToSram(1, core1Bin);

        var i2cBus  = new I2cBusSimulator(bus.RegBankSubsys);
        var hostApp = new HostApplication(i2cBus);

        var core0   = new RiscVCore(0, bus);
        var core1   = new RiscVCore(1, bus);

        if (gdbMode)
        {
            return RunGdbServerMode(core0, core1, bus, hostApp);
        }

        return RunDualThreadSimulation(core0, core1, bus, hostApp, freeThreadMode);
    }

    private static int RunDualThreadSimulation(
        RiscVCore core0,
        RiscVCore core1,
        SoCBus bus,
        HostApplication hostApp,
        bool freeThreadMode)
    {
        Console.WriteLine("==================================================================");
        Console.WriteLine("[C# SoC] Starting Dual-Core RISC-V SoC + I2C Host Simulation...");
        Console.WriteLine($"[C# SoC] Mode: {(freeThreadMode ? "Free-Running OS Threads" : "Cycle-Synchronized Threads (Matches Verilog)")}");
        Console.WriteLine("==================================================================");

        using var barrier = new Barrier(3); // Core 0 Thread + Core 1 Thread + Host I2C App Thread
        int maxSteps = freeThreadMode ? 500000 : 50000;

        // --------------------------------------------------------------------
        // Thread 0: Simulates RISC-V Core 0 (Booted by SoC on reset @ 0x00000000)
        // --------------------------------------------------------------------
        var threadCore0 = new Thread(() =>
        {
            for (int step = 0; step < maxSteps; step++)
            {
                if (bus.SimDoneFlags == 0x0000_0003u && hostApp.ReportVerified) break;

                core0.Step(out _);

                if (!freeThreadMode)
                {
                    barrier.SignalAndWait();
                }
                else if (core0.InWfi)
                {
                    Thread.Yield();
                }
            }
            if (!freeThreadMode)
            {
                barrier.RemoveParticipant();
            }
        })
        {
            Name = "RISCV-Core0-Thread",
            IsBackground = false
        };

        // --------------------------------------------------------------------
        // Thread 1: Simulates RISC-V Core 1 (Held in reset until Core 0 boots it @ 0x00010000)
        // --------------------------------------------------------------------
        var threadCore1 = new Thread(() =>
        {
            for (int step = 0; step < maxSteps; step++)
            {
                if (bus.SimDoneFlags == 0x0000_0003u && hostApp.ReportVerified) break;

                if (freeThreadMode && !bus.Core1BootEn)
                {
                    bus.Core1BootEvent.Wait(50);
                }

                core1.Step(out _);

                if (!freeThreadMode)
                {
                    barrier.SignalAndWait();
                }
                else if (core1.InWfi)
                {
                    Thread.Yield();
                }
            }
            if (!freeThreadMode)
            {
                barrier.RemoveParticipant();
            }
        })
        {
            Name = "RISCV-Core1-Thread",
            IsBackground = false
        };

        // --------------------------------------------------------------------
        // Thread 2: Simulates Host I2C Application (Polls RegBank via I2C,
        //           switches Bank via 0x7F, reads Report Buffer via Bank 0 0x0F)
        // --------------------------------------------------------------------
        var threadHostI2c = new Thread(() =>
        {
            for (int step = 0; step < maxSteps; step++)
            {
                if (bus.SimDoneFlags == 0x0000_0003u && hostApp.ReportVerified) break;

                // Poll over I2C every ~110 CPU steps (matches I2C bus rate in Verilog testbench)
                if (step == 10 || (step % 110 == 0 && !hostApp.ReportVerified))
                {
                    hostApp.StepHostPollAndRead();
                }

                if (!freeThreadMode)
                {
                    barrier.SignalAndWait();
                }
                else
                {
                    Thread.Yield();
                }
            }
            if (!freeThreadMode)
            {
                barrier.RemoveParticipant();
            }
        })
        {
            Name = "Host-I2C-App-Thread",
            IsBackground = false
        };

        // Start Core 0, Core 1, and Host I2C Application threads
        threadCore0.Start();
        threadCore1.Start();
        threadHostI2c.Start();

        threadCore0.Join();
        threadCore1.Join();
        threadHostI2c.Join();

        uint doneFlags     = bus.SimDoneFlags;
        uint spinlockVal   = bus.ReadSharedWord(0x00);
        uint sharedCounter = bus.ReadSharedWord(0x04);
        uint core1Booted   = bus.ReadSharedWord(0x08);
        uint ipiPingPong   = bus.ReadSharedWord(0x0C);
        byte rptWrPtr      = bus.RegBankSubsys.RptWrPtr;
        byte rptRdPtr      = bus.RegBankSubsys.RptRdPtr;

        Console.WriteLine("==================================================================");
        Console.WriteLine($"[C# SoC] Simulation Finished (Core0 instret={core0.CsrMinstret}, Core1 instret={core1.CsrMinstret})");
        Console.WriteLine($"  sim_done_flags     = 0x{doneFlags:x8} (Expected: 0x00000003)");
        Console.WriteLine($"  shm_spinlock       = {spinlockVal,-10} (Expected: 0)");
        Console.WriteLine($"  shm_shared_counter = {sharedCounter,-10} (Expected: 10)");
        Console.WriteLine($"  shm_core1_booted   = {core1Booted,-10} (Expected: 1)");
        Console.WriteLine($"  shm_ipi_ping_pong  = {ipiPingPong,-10} (Expected: 4)");
        Console.WriteLine($"  rpt_wr_ptr / rd_ptr= {rptWrPtr} / {rptRdPtr,-5} (Expected: 32 / 32)");
        Console.WriteLine($"  rpt_checksum_match = 0x{hostApp.CalculatedChecksum:x2} == 0x{hostApp.ExpectedChecksum:x2}");
        Console.WriteLine($"  regbank_arb_access = FW:{bus.RegBankSubsys.FwAccessCount}, HostI2C:{bus.RegBankSubsys.HostAccessCount}");
        Console.WriteLine("==================================================================");

        if (doneFlags == 0x0000_0003u &&
            spinlockVal == 0u &&
            sharedCounter == 10u &&
            core1Booted == 1u &&
            ipiPingPong == 4u &&
            rptWrPtr == 32 &&
            rptRdPtr == 32 &&
            hostApp.ReportVerified)
        {
            Console.WriteLine("[C# SoC] >>> ALL C# SOC + I2C REGBANK + REPORT BUFFER CHECKS PASSED (IDENTICAL TO VERILOG)! <<<");
            return 0;
        }
        else
        {
            Console.Error.WriteLine("[C# SoC] >>> ERROR: C# SOC CHECK FAILED! <<<");
            return 1;
        }
    }

    private static int RunGdbServerMode(RiscVCore core0, RiscVCore core1, SoCBus bus, HostApplication hostApp)
    {
        Console.WriteLine("==================================================================");
        Console.WriteLine("[C# SoC GDB Server] Dual-Core RISC-V GDB Remote Debugging Server");
        Console.WriteLine("  Core 0 GDB Target: localhost:3333 (fw/build/fw_core0.elf)");
        Console.WriteLine("  Core 1 GDB Target: localhost:3334 (fw/build/fw_core1.elf)");
        Console.WriteLine("  Press Ctrl+C to stop the GDB server.");
        Console.WriteLine("==================================================================");

        var cts      = new CancellationTokenSource();
        var coreLock = new object();

        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
        };

        var gdbCore0 = new GdbServer(core0, core1, bus, hostApp, 3333, coreLock);
        var gdbCore1 = new GdbServer(core1, core0, bus, hostApp, 3334, coreLock);

        var t0 = new Thread(() => gdbCore0.RunServer(cts.Token, gdbCore1)) { Name = "GDB-Core0-Thread" };
        var t1 = new Thread(() => gdbCore1.RunServer(cts.Token, gdbCore0)) { Name = "GDB-Core1-Thread" };

        t0.Start();
        t1.Start();

        t0.Join();
        t1.Join();
        return 0;
    }

    private static string FindWorkspaceRoot()
    {
        string dir = AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            if (Directory.Exists(Path.Combine(dir, "fw")) && Directory.Exists(Path.Combine(dir, "rtl")))
            {
                return dir;
            }
            dir = Path.GetDirectoryName(dir) ?? "";
        }
        return Directory.GetCurrentDirectory();
    }
}
