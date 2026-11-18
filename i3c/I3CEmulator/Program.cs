// =====================================================================================================
//  Program.cs  -  Console Testbench Runner powered by shared I3CEmulator.Core library
// =====================================================================================================

using I3CEmulator.Physical;
using I3CEmulator.Simulation;

Console.OutputEncoding = System.Text.Encoding.UTF8;
PrintAsciiBanner();

var scenario = new I3CSimulationScenario(verboseTrace: true);

scenario.ChapterStarted += chapter =>
{
    PrintChapterHeader(chapter.Index, chapter.Title);
    Console.WriteLine(chapter.Summary);
    Console.WriteLine();
};

scenario.InfoLogged += info => Console.WriteLine($"\n{info}");

scenario.ChapterCompleted += (chapter, assertions) =>
{
    if (chapter.Index == 3)
    {
        Console.WriteLine("\nDEVICE ADDRESS TABLE (DAT) IN CONTROLLER AFTER DAA:");
        foreach (var (da, ident) in scenario.Master.TargetTable.OrderBy(kv => kv.Key))
        {
            Console.WriteLine($"  * Dynamic Address 0x{da:X2} : {ident}");
        }
    }
    else if (chapter.Index == 5)
    {
        Console.WriteLine($"\nChecking Legacy I2C EEPROM spike filter status:");
        Console.WriteLine($"  - Total 12.5 MHz clock pulses suppressed by EEPROM's 50ns spike filter: {scenario.LegacyI2C.FilteredOutI3CClockPulses}");
    }
    else if (chapter.Index == 6)
    {
        Console.WriteLine($"Legacy I2C transactions completed successfully: {scenario.LegacyI2C.CompletedI2CTransactions}\n");
    }
    else if (chapter.Index == 9)
    {
        Console.WriteLine($"\nTarget D successfully Hot-Joined and was assigned DynamicAddress = 0x{scenario.TargetD.DynamicAddress:X2}!");
    }
};

try
{
    scenario.RunAllChapters();
}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"\n{ex.Message}\n");
    Console.ResetColor();
    Environment.Exit(1);
}

var metrics = scenario.GetMetrics();
var snapshot = scenario.Recorder.GetSnapshot();

Console.WriteLine($"""
+------------------------------------------------------+-------------------------+
| Metric                                               | Value                   |
+------------------------------------------------------+-------------------------+
| Simulated Wall-Clock Time Elapsed                    | {metrics.SimulatedTimeNs,12:N0} ns        |
| Total SCL Clock Bits in Open-Drain Mode              | {metrics.OpenDrainBitCount,12:N0} bits      |
| Total SCL Clock Bits in 12.5 MHz Push-Pull Mode      | {metrics.PushPullBitCount,12:N0} bits      |
| Clock Pulses Blocked by Legacy I2C 50ns Spike Filter | {metrics.FilteredI3CPulsesOnLegacyI2C,12:N0} pulses    |
| Successful Legacy I2C Transactions                  | {metrics.CompletedLegacyI2CTransactions,12:N0} transfers |
| I3C Targets Actively Registered in DAT               | {metrics.RegisteredTargetsInDat,12:N0} devices   |
| Captured LA Waveform Samples                         | {snapshot.Samples.Length,12:N0} samples   |
| Decoded Protocol Packets                             | {snapshot.Packets.Length,12:N0} packets   |
+------------------------------------------------------+-------------------------+
""");

Console.ForegroundColor = ConsoleColor.Green;
Console.WriteLine("=========================================================================================");
Console.WriteLine($"  ALL {scenario.AssertionsPassed.Count} I3C & I2C SPECIFICATION ASSERTIONS PASSED SUCCESSFULLY!");
Console.WriteLine("=========================================================================================\n");
Console.ResetColor();

static void PrintAsciiBanner()
{
    Console.ForegroundColor = ConsoleColor.Cyan;
    Console.WriteLine("""
=========================================================================================================
  ███   ██████    ██████    ███████  ███    ███  ██    ██  ██          █████   ████████   ██████  ██████  
  ███  ████████  ████████   ███████  ████  ████  ██    ██  ██         ███████  ████████  ████████ ███████ 
  ███       ███  ██         ██       ██████████  ██    ██  ██         ██   ██     ██     ██    ██ ██   ██ 
  ███   ██████   ██         █████    ██ ████ ██  ██    ██  ██         ███████     ██     ██    ██ ███████ 
  ███      ████  ██         ██       ██  ██  ██  ██    ██  ██         ███████     ██     ██    ██ ██████  
  ███  ████████  ████████   ███████  ██      ██  ████████  █████████  ██   ██     ██     ████████ ██   ██ 
  ███   ██████    ██████    ███████  ██      ██   ██████   █████████  ██   ██     ██      ██████  ██   ██ 
=========================================================================================================
      Comprehensive MIPI I3C v1.1.1 SDR & Legacy I2C Coexistence Emulator in C# (.NET 10)
=========================================================================================================
""");
    Console.ResetColor();
}

static void PrintChapterHeader(int number, string title)
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine("\n#########################################################################################");
    Console.WriteLine($"  CHAPTER {number}: {title}");
    Console.WriteLine("#########################################################################################\n");
    Console.ResetColor();
}
