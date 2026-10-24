using System.Text;
using HidI2cSimulation.Device;
using HidI2cSimulation.Docs;
using HidI2cSimulation.Hardware;
using HidI2cSimulation.Host;
using HidI2cSimulation.Protocol;

namespace HidI2cSimulation;

/// <summary>
/// =========================================================================================
///  HID OVER I2C (HIDI2C) HOST & DEVICE SIMULATION CONSOLE APPLICATION
/// =========================================================================================
///
///  This application provides an interactive, hardware-accurate simulation of the
///  Microsoft HID over I2C Protocol Specification (v1.00) and USB-IF HID standard.
///
///  It demonstrates:
///    1. Physical Layer: SCL, SDA, INT# (Active-Low Interrupt), RESET# GPIO lines.
///    2. Bus Transactions: START, Addressing, Sub-addressing, Repeated-Start, Read/Write, STOP.
///    3. OS Driver Lifecycle: ACPI _DSM discovery, 30-byte HID Descriptor read, Soft RESET,
///       Report Descriptor parsing, Power Management, and Interrupt Service Routine (ISR).
///    4. Real-time Telemetry: Logic Analyzer wire traces, touch event decoding.
///
/// =========================================================================================
/// </summary>
public static class Program
{
    private static I2CBus _bus = null!;
    private static GpioPin _interruptPin = null!;
    private static GpioPin _resetPin = null!;
    private static HidI2cDevice _touchpadDevice = null!;
    private static HidI2cHostDriver _hostDriver = null!;

    public static void Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        InitializeHardware();

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
                    RunAutomatedTests();
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
    }

    private static void InitializeHardware()
    {
        _bus = new I2CBus();

        // INT# line: Active-LOW, Open-Drain with external pull-up (defaults to HIGH)
        _interruptPin = new GpioPin("GPIO_INT# (Pin 14)", PinDriveMode.OpenDrainWithPullUp, PinState.High);

        // RESET# line: Active-LOW from Host (defaults to HIGH)
        _resetPin = new GpioPin("GPIO_RST# (Pin 15)", PinDriveMode.PushPull, PinState.High);

        // Peripheral Device: 7-bit Slave Address = 0x20 (Elan Precision Touchpad)
        _touchpadDevice = new HidI2cDevice(0x20, "Elan Precision Touchpad", _interruptPin, _resetPin);
        _bus.RegisterSlave(_touchpadDevice);

        // Host OS Driver (Windows hidi2c.sys / Linux i2c-hid)
        _hostDriver = new HidI2cHostDriver(_bus, _interruptPin, _resetPin);

        // Hook logs to console
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

    /// <summary>
    /// Walkthrough narrating every single phase from power-on to user touch.
    /// </summary>
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

        _bus.ClearTrace();
        _hostDriver.DiscoverViaAcpi(0x20, 0x0001);

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

        bool success = _hostDriver.InitializeAndEnumerate();
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

        _touchpadDevice.SimulateTouch(x: 1024, y: 768, leftBtn: false, rightBtn: false, fingers: 1, inContact: true, pressure: 45);

        Console.WriteLine("\nPress ENTER to simulate Finger Release (Touch Up)...");
        Console.ReadLine();

        _touchpadDevice.SimulateFingerRelease();

        Console.WriteLine("\nGuided Walkthrough completed! Press ENTER to view the bus wire trace...");
        Console.ReadLine();
        ShowWireTrace();
    }

    /// <summary>
    /// Interactive laboratory to test various gestures and watch hardware logs.
    /// </summary>
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
                    _touchpadDevice.SimulateTouch(2048, 2048, false, false, fingers: 1, inContact: true, pressure: 30);
                    Thread.Sleep(50);
                    _touchpadDevice.SimulateFingerRelease();
                    Pause();
                    break;

                case "2":
                    Console.WriteLine("--> Simulating Finger Drag over 5 steps...");
                    for (ushort coord = 500; coord <= 3500; coord += 600)
                    {
                        Console.WriteLine($"\n[Motion Step] Finger at ({coord}, {coord})");
                        _touchpadDevice.SimulateTouch(coord, coord, false, false, fingers: 1, inContact: true, pressure: 40);
                        Thread.Sleep(30);
                    }
                    _touchpadDevice.SimulateFingerRelease();
                    Pause();
                    break;

                case "3":
                    Console.WriteLine("--> Simulating Two-Finger Scroll...");
                    for (ushort y = 1000; y <= 3000; y += 500)
                    {
                        Console.WriteLine($"\n[Scroll Step] 2 Fingers at Y={y}");
                        _touchpadDevice.SimulateTouch(2048, y, false, false, fingers: 2, inContact: true, pressure: 50);
                        Thread.Sleep(30);
                    }
                    _touchpadDevice.SimulateFingerRelease();
                    Pause();
                    break;

                case "4":
                    Console.WriteLine("--> Simulating Physical Left Click...");
                    _touchpadDevice.SimulateTouch(2048, 2048, leftBtn: true, rightBtn: false, fingers: 1, inContact: true, pressure: 60);
                    Thread.Sleep(50);
                    _touchpadDevice.SimulateFingerRelease();
                    Pause();
                    break;

                case "5":
                    Console.WriteLine("--> Simulating Physical Right Click...");
                    _touchpadDevice.SimulateTouch(3500, 3500, leftBtn: false, rightBtn: true, fingers: 1, inContact: true, pressure: 60);
                    Thread.Sleep(50);
                    _touchpadDevice.SimulateFingerRelease();
                    Pause();
                    break;

                case "6":
                    Console.Write("Enter new Haptic Feedback Intensity (0 - 100%): ");
                    if (byte.TryParse(Console.ReadLine(), out byte haptic) && haptic <= 100)
                    {
                        _hostDriver.SetTouchpadFeature(mode: 1, hapticIntensity: haptic);
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

    /// <summary>
    /// Displays the virtual oscilloscope / logic analyzer wire trace.
    /// </summary>
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

    /// <summary>
    /// Displays the disassembled USB-IF HID Report Descriptor tree.
    /// </summary>
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

    /// <summary>
    /// Displays the architecture guide and knowledge base.
    /// </summary>
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

    /// <summary>
    /// Automated protocol and compliance test suite.
    /// </summary>
    private static void RunAutomatedTests()
    {
        Console.Clear();
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("""
====================================================================================================
                        AUTOMATED HID-OVER-I2C PROTOCOL TEST SUITE
====================================================================================================
""");
        Console.ResetColor();

        int passed = 0;
        int failed = 0;

        void AssertTest(string testName, bool condition, string detail)
        {
            Console.Write($" [TEST] {testName,-55} ... ");
            if (condition)
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("PASS");
                Console.ResetColor();
                passed++;
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"FAIL ({detail})");
                Console.ResetColor();
                failed++;
            }
        }

        // Test 1: ACPI Discovery & Descriptor
        _hostDriver.DiscoverViaAcpi(0x20, 0x0001);
        AssertTest("ACPI Discovery values populated", _hostDriver.TargetSlaveAddress == 0x20 && _hostDriver.HidDescriptorRegister == 0x0001, "Address mismatch");

        // Test 2: Read 30-byte HID Descriptor
        byte[] hidDescRaw = _bus.Read(0x20, 0x0001, 30);
        var parsedDesc = HidDescriptor.FromBytes(hidDescRaw);
        AssertTest("30-Byte HID Descriptor Length", parsedDesc.HIDDescLength == 30, $"Got {parsedDesc.HIDDescLength}");
        AssertTest("BCD Version is 0x0100 (v1.00)", parsedDesc.BcdVersion == 0x0100, $"Got 0x{parsedDesc.BcdVersion:X4}");
        AssertTest("Vendor ID and Product ID valid", parsedDesc.VendorId == 0x04F3 && parsedDesc.ProductId == 0x2718, "VID/PID mismatch");

        // Test 3: Soft Reset Command
        ushort resetCmd = ((ushort)HidCommandOpCode.Reset << 8);
        byte[] resetPayload = new byte[] { (byte)(resetCmd & 0xFF), (byte)((resetCmd >> 8) & 0xFF) };
        bool resetAck = _bus.Write(0x20, parsedDesc.CommandRegister, resetPayload);
        AssertTest("Soft RESET Command ACKed", resetAck, "Reset write failed");

        // Test 4: Report Descriptor Read
        byte[] repDesc = _bus.Read(0x20, parsedDesc.ReportDescRegister, parsedDesc.ReportDescLength);
        AssertTest("Report Descriptor Byte Count Match", repDesc.Length == parsedDesc.ReportDescLength, $"Expected {parsedDesc.ReportDescLength}, got {repDesc.Length}");

        // Test 5: Power State Management
        ushort powerCmd = (ushort)(((ushort)HidCommandOpCode.SetPower << 8) | 0x00); // ON
        byte[] powerPayload = new byte[] { (byte)(powerCmd & 0xFF), (byte)((powerCmd >> 8) & 0xFF) };
        bool powerAck = _bus.Write(0x20, parsedDesc.CommandRegister, powerPayload);
        AssertTest("SET_POWER (Active/ON) Command ACKed", powerAck && _touchpadDevice.PowerState == HidPowerState.On, "Power transition failed");

        // Test 6: Interrupt Line & Input Report FIFO
        _touchpadDevice.SimulateTouch(1000, 2000, leftBtn: true, rightBtn: false, fingers: 1, inContact: true, pressure: 50);
        AssertTest("INT# Pin Pulled LOW on Input Event", _interruptPin.Read() == PinState.Low, "INT# not low");

        byte[] inputWire = _bus.Read(0x20, parsedDesc.InputRegister, parsedDesc.MaxInputLength);
        var pkt = HidPacket.FromWireBytes(inputWire);
        var decodedReport = HidReportParser.ParseInputReport(pkt.Payload);

        AssertTest("Input Packet 2-Byte Length Header Valid", pkt.TotalLength == 10, $"Got {pkt.TotalLength}");
        AssertTest("Input Report Decoded: Left Button Active", decodedReport != null && decodedReport.LeftButton, "Button not decoded");
        AssertTest("Input Report Decoded: X/Y Coordinates Match", decodedReport != null && decodedReport.X == 1000 && decodedReport.Y == 2000, "Coord mismatch");
        AssertTest("INT# Pin Released HIGH After Read", _interruptPin.Read() == PinState.High, "INT# still low");

        // Ensure Host Driver state is marked enumerated
        if (!_hostDriver.IsEnumerated)
        {
            _hostDriver.InitializeAndEnumerate();
        }

        // Test 7: Feature Report Setting
        bool featureResult = _hostDriver.SetTouchpadFeature(mode: 1, hapticIntensity: 85);
        AssertTest("Feature Report Write (Mode=1, Haptic=85%)", featureResult && _touchpadDevice.HapticClickIntensity == 85, "Feature update failed");

        Console.WriteLine("\n----------------------------------------------------------------------------------------------------");
        Console.ForegroundColor = failed == 0 ? ConsoleColor.Green : ConsoleColor.Red;
        Console.WriteLine($" TEST SUMMARY: {passed} PASSED, {failed} FAILED.");
        Console.ResetColor();
        Pause();
    }

    private static void Pause()
    {
        Console.WriteLine("\nPress ENTER to continue...");
        Console.ReadLine();
    }
}
