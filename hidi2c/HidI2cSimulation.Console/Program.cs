using System.Text;
using HidI2cSimulation.Device;
using HidI2cSimulation.Docs;
using HidI2cSimulation.Hardware;
using HidI2cSimulation.Host;
using HidI2cSimulation.Protocol;
using HidI2cSimulation.Simulation;

namespace HidI2cSimulation;

/// <summary>
/// =========================================================================================
///  HID OVER I2C (HIDI2C) HOST & DEVICE SIMULATION CONSOLE APPLICATION
/// =========================================================================================
///
///  Uses the shared HidI2cSimulation.Core library (shared with the Avalonia Visualizer).
/// =========================================================================================
/// </summary>
public static class Program
{
    private static HidI2cSimulationSession _session = null!;
    private static I2CBus _bus => _session.Bus;
    private static GpioPin _interruptPin => _session.InterruptPin;
    private static HidI2cDevice _touchpadDevice => _session.TouchpadDevice;
    private static HidI2cHostDriver _hostDriver => _session.HostDriver;

    public static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        InitializeHardware();

        if (args.Contains("--test"))
        {
            return RunAutomatedTests(interactivePause: false);
        }

        bool running = true;
        while (running)
        {
            PrintHeader();
            Console.WriteLine(" Select an option:");
            Console.WriteLine("  [1] Guided Step-by-Step Walkthrough (Boot -> ACPI -> Enumerate -> Touch)");
            Console.WriteLine("  [2] Interactive Touchpad Laboratory (Tap, Drag, Multi-touch, Click)");
            Console.WriteLine("  [3] Virtual Logic Analyzer / Wire Protocol Trace Viewer");
            Console.WriteLine("  [4] USB-IF HID Report Descriptor Disassembler & Bytecode Inspector");
            Console.WriteLine("  [5] Architecture Knowledge Base, Pinout & USB vs I2C Comparison");
            Console.WriteLine("  [6] Run Automated Protocol Compliance Test Suite");
            Console.WriteLine("  [7] Exit");
            Console.Write("\n Enter selection (1-7): ");

            string? choice = Console.ReadLine()?.Trim();
            Console.WriteLine();

            switch (choice)
            {
                case "1":
                    RunGuidedWalkthrough();
                    break;
                case "2":
                    RunInteractiveLab();
                    break;
                case "3":
                    ShowWireTrace();
                    break;
                case "4":
                    ShowReportDescriptorDisassembly();
                    break;
                case "5":
                    ShowKnowledgeBase();
                    break;
                case "6":
                    RunAutomatedTests(interactivePause: true);
                    break;
                case "7":
                    running = false;
                    Console.WriteLine("Exiting simulation. Goodbye!");
                    break;
                default:
                    Console.WriteLine("Invalid option. Press any key to continue...");
                    Console.ReadKey();
                    break;
            }
        }

        return 0;
    }

    private static void InitializeHardware()
    {
        _session = new HidI2cSimulationSession(0x20, "Elan Precision Touchpad");

        _touchpadDevice.OnDeviceLog += msg =>
        {
            Console.ForegroundColor = ConsoleColor.DarkYellow;
            Console.WriteLine($"  {msg}");
            Console.ResetColor();
        };

        _hostDriver.OnDriverLog += msg =>
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine($"  {msg}");
            Console.ResetColor();
        };
    }

    private static void PrintHeader()
    {
        Console.Clear();
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("""
====================================================================================================
           HID OVER I2C (HIDI2C) PROTOCOL SIMULATOR & EDUCATIONAL HOST CONTROLLER
====================================================================================================
 Hardware Wiring:
   [Host SoC] --- SCL (I2C Clock) ---------> [Slave Device: 0x20]
   [Host SoC] <-> SDA (Bidirectional Data) -> [Slave Device: 0x20]
   [Host SoC] <-- INT# (Active-Low IRQ) ----- [Slave Device: 0x20] (Pulled HIGH via 10k)
   [Host SoC] --- RESET# (Hardware Reset) --> [Slave Device: 0x20]
====================================================================================================
""");
        Console.ResetColor();
    }

    private static void RunGuidedWalkthrough()
    {
        Console.Clear();
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("""
====================================================================================================
                    PHASE 1: ACPI DISCOVERY & STATIC HARDWARE CONFIGURATION
====================================================================================================
 Unlike USB devices, which are dynamically discovered via USB bus enumeration on port connect,
 I2C is a dumb, non-discoverable bus.
 In x86 PCs, the BIOS/UEFI declares the touchpad in ACPI DSDT tables using device ID 'PNP0C50'.
 In ARM / Embedded systems, this is declared in the Device Tree (DT) 'compatible = "hid-over-i2c"'.

 The OS queries ACPI:
   1. _CRS returns: I2C Slave Address (0x20) and GPIO Interrupt Pin.
   2. _DSM (Method with Microsoft GUID 3CDFF6F7-4267-4555-AD05-B30A3D8938DE) returns:
      The 16-bit register address where the 30-byte Microsoft HID Descriptor resides (0x0001).
""");
        Console.ResetColor();
        Console.WriteLine("Press ENTER to trigger ACPI Query...");
        Console.ReadLine();

        _session.ResetSimulation();
        _session.RunStepAcpiDiscovery(0x20, 0x0001);

        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("""

====================================================================================================
                    PHASE 2: HOST DRIVER ENUMERATION & REGISTRATION
====================================================================================================
 Now the Host Driver (hidi2c.sys / i2c-hid) proceeds through the standardized startup handshake:
   Step 1: Pulse RESET# GPIO pin LOW to hard-reset peripheral silicon.
   Step 2: Read the 30-byte HID Descriptor from register 0x0001.
   Step 3: Issue Soft RESET Command to wCommandRegister (0x0007).
   Step 4: Read USB-IF HID Report Descriptor from wReportDescRegister (0x0020).
   Step 5: Send SET_POWER (ON) Command to wake peripheral clocks from sleep.
""");
        Console.ResetColor();
        Console.WriteLine("Press ENTER to execute Enumeration...");
        Console.ReadLine();

        _session.RunStepHardwareReset(blockWithThreadSleep: true);
        bool success = _session.RunStepReadHidDescriptor()
            && _session.RunStepSoftReset(blockWithThreadSleep: true)
            && _session.RunStepReadReportDescriptor()
            && _session.RunStepSetPowerOn();

        if (!success)
        {
            Console.WriteLine("Enumeration failed!");
            Pause();
            return;
        }

        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("""

====================================================================================================
                    PHASE 3: INTERRUPT-DRIVEN INPUT REPORT SERVICING
====================================================================================================
 How does data flow when a user touches the trackpad?
   1. Capacitive sensor detects a finger touch at X=1024, Y=768.
   2. Device formats an 8-byte Input Report and asserts INT# LOW!
   3. Host GPIO controller detects the active-low interrupt and invokes the Driver's ISR.
   4. Host executes an I2C Read to wInputRegister (0x0005).
   5. First 2 bytes received over I2C indicate packet length (e.g. 0x000A = 10 bytes).
   6. Payload is passed to the OS Input Subsystem and translated into cursor movement!
   7. Device releases INT# back to HIGH.
""");
        Console.ResetColor();
        Console.WriteLine("Press ENTER to simulate a Finger Touch on the trackpad...");
        Console.ReadLine();

        _session.TriggerTouch(x: 1024, y: 768, leftBtn: false, rightBtn: false, fingers: 1, inContact: true, pressure: 45);

        Console.WriteLine("\nPress ENTER to simulate Finger Release (Touch Up)...");
        Console.ReadLine();

        _session.TriggerFingerRelease();

        Console.WriteLine("\nGuided Walkthrough completed! Press ENTER to view the bus wire trace...");
        Console.ReadLine();
        ShowWireTrace();
    }

    private static void RunInteractiveLab()
    {
        if (!_hostDriver.IsEnumerated)
        {
            Console.WriteLine("[INFO] Device not yet enumerated. Running automatic enumeration first...");
            _hostDriver.DiscoverViaAcpi(0x20, 0x0001);
            _hostDriver.InitializeAndEnumerate();
            Console.WriteLine();
        }

        bool inLab = true;
        while (inLab)
        {
            Console.Clear();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("""
====================================================================================================
                              INTERACTIVE TOUCHPAD LABORATORY
====================================================================================================
 Test various real-world input gestures. Watch the INT# pin drop LOW and observe how the Host
 reads the input register and decodes the HID packet.
====================================================================================================
""");
            Console.ResetColor();
            Console.WriteLine(" Choose a gesture to simulate:");
            Console.WriteLine("  [1] Single Finger Tap (Click at Center: X=2048, Y=2048)");
            Console.WriteLine("  [2] Finger Drag Movement (Draw diagonal line from 500,500 to 3500,3500)");
            Console.WriteLine("  [3] Two-Finger Scroll Gesture (2 fingers moving vertically)");
            Console.WriteLine("  [4] Physical Left Click Button Press & Release");
            Console.WriteLine("  [5] Physical Right Click Button Press & Release");
            Console.WriteLine("  [6] Send Feature Report: Adjust Haptic Click Intensity & Operating Mode");
            Console.WriteLine("  [7] Return to Main Menu");
            Console.Write("\n Enter selection (1-7): ");

            string? choice = Console.ReadLine()?.Trim();
            Console.WriteLine();

            switch (choice)
            {
                case "1":
                    Console.WriteLine("--> Simulating Single Finger Tap...");
                    _session.TriggerTouch(2048, 2048, false, false, fingers: 1, inContact: true, pressure: 30);
                    Thread.Sleep(50);
                    _session.TriggerFingerRelease();
                    Pause();
                    break;

                case "2":
                    Console.WriteLine("--> Simulating Finger Drag over 5 steps...");
                    for (ushort coord = 500; coord <= 3500; coord += 600)
                    {
                        Console.WriteLine($"\n[Motion Step] Finger at ({coord}, {coord})");
                        _session.TriggerTouch(coord, coord, false, false, fingers: 1, inContact: true, pressure: 40);
                        Thread.Sleep(30);
                    }
                    _session.TriggerFingerRelease();
                    Pause();
                    break;

                case "3":
                    Console.WriteLine("--> Simulating Two-Finger Scroll...");
                    for (ushort y = 1000; y <= 3000; y += 500)
                    {
                        Console.WriteLine($"\n[Scroll Step] 2 Fingers at Y={y}");
                        _session.TriggerTouch(2048, y, false, false, fingers: 2, inContact: true, pressure: 50);
                        Thread.Sleep(30);
                    }
                    _session.TriggerFingerRelease();
                    Pause();
                    break;

                case "4":
                    Console.WriteLine("--> Simulating Physical Left Click...");
                    _session.TriggerTouch(2048, 2048, leftBtn: true, rightBtn: false, fingers: 1, inContact: true, pressure: 60);
                    Thread.Sleep(50);
                    _session.TriggerFingerRelease();
                    Pause();
                    break;

                case "5":
                    Console.WriteLine("--> Simulating Physical Right Click...");
                    _session.TriggerTouch(3500, 3500, leftBtn: false, rightBtn: true, fingers: 1, inContact: true, pressure: 60);
                    Thread.Sleep(50);
                    _session.TriggerFingerRelease();
                    Pause();
                    break;

                case "6":
                    Console.Write("Enter new Haptic Feedback Intensity (0 - 100%): ");
                    if (byte.TryParse(Console.ReadLine(), out byte haptic) && haptic <= 100)
                    {
                        _session.SetFeature(mode: 1, hapticIntensity: haptic);
                    }
                    else
                    {
                        Console.WriteLine("Invalid intensity value.");
                    }
                    Pause();
                    break;

                case "7":
                    inLab = false;
                    break;
            }
        }
    }

    private static void ShowWireTrace()
    {
        Console.Clear();
        Console.WriteLine(_bus.GenerateAsciiWaveform(maxEntries: 20));
        Console.WriteLine("\n[Legend]");
        Console.WriteLine(" [S]  = START condition (SDA goes Low while SCL is High)");
        Console.WriteLine(" [Sr] = REPEATED START condition (allows changing from Write to Read without bus release)");
        Console.WriteLine(" [W]  = 7-bit Slave Address + Write bit (0)");
        Console.WriteLine(" [R]  = 7-bit Slave Address + Read bit (1)");
        Console.WriteLine(" [REG]= 16-bit Sub-address register pointer (LSB first)");
        Console.WriteLine(" [DAT]= Data byte stream (Input reports always start with 2-byte Length prefix)");
        Console.WriteLine(" [ACK]= Acknowledged by receiver (line pulled Low on 9th clock)");
        Console.WriteLine(" [NAK]= Not Acknowledged (sent by Host before STOP on read)");
        Console.WriteLine(" [P]  = STOP condition (SDA goes High while SCL is High)");
        Pause();
    }

    private static void ShowReportDescriptorDisassembly()
    {
        Console.Clear();
        byte[] desc = HidReportParser.CreateTouchpadReportDescriptor();
        Console.WriteLine(HidReportParser.DisassembleReportDescriptor(desc));
        Console.WriteLine("""
 KEY INSIGHT:
 Notice how the Report Descriptor defines:
   - Report ID 1: Finger Digitizer / Touch Pad with Left/Right/Middle Buttons, X/Y (0..4095),
     Contact Count, Tip Switch, Confidence, and Tip Pressure.
   - Report ID 2: Feature Report with Device Mode and Haptic Intensity.
 This bytecode is 100% compliant with standard USB-IF HID specifications!
""");
        Pause();
    }

    private static void ShowKnowledgeBase()
    {
        Console.Clear();
        Console.WriteLine(ArchitectureKnowledgeBase.GetFullArchitectureOverview());
        Console.WriteLine("\nWould you like to view the ACPI DSDT ASL code sample? (y/n): ");
        if (Console.ReadLine()?.Trim().ToLowerInvariant() == "y")
        {
            Console.Clear();
            Console.WriteLine(ArchitectureKnowledgeBase.GetAcpiDsmCodeSample());
        }
        Pause();
    }

    private static int RunAutomatedTests(bool interactivePause)
    {
        if (interactivePause) Console.Clear();
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("""
====================================================================================================
                        AUTOMATED HID-OVER-I2C PROTOCOL TEST SUITE
====================================================================================================
""");
        Console.ResetColor();

        _session.ResetSimulation();
        var results = ProtocolComplianceRunner.RunAll(_session);

        int passed = 0;
        int failed = 0;
        foreach (var r in results)
        {
            Console.Write($" [TEST] {r.TestName,-55} ... ");
            if (r.Passed)
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("PASS");
                Console.ResetColor();
                passed++;
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"FAIL ({r.Detail})");
                Console.ResetColor();
                failed++;
            }
        }

        Console.WriteLine("\n----------------------------------------------------------------------------------------------------");
        Console.ForegroundColor = failed == 0 ? ConsoleColor.Green : ConsoleColor.Red;
        Console.WriteLine($" TEST SUMMARY: {passed} PASSED, {failed} FAILED.");
        Console.ResetColor();

        if (interactivePause) Pause();
        return failed == 0 ? 0 : 1;
    }

    private static void Pause()
    {
        Console.WriteLine("\nPress ENTER to continue...");
        Console.ReadLine();
    }
}
