namespace HidI2cSimulation.Docs;

/// <summary>
/// =========================================================================================
///  COMPREHENSIVE KNOWLEDGE BASE & ARCHITECTURE GUIDE: HID OVER I2C (HIDI2C)
/// =========================================================================================
///
///  This module contains deep-dive documentation, comparison tables, ASCII architecture
///  charts, and historical context explaining every aspect of HID and HID-over-I2C.
/// =========================================================================================
/// </summary>
public static class ArchitectureKnowledgeBase
{
    public static string GetFullArchitectureOverview() =>
"""
====================================================================================================
                        HID OVER I2C (HIDI2C) DEEP-DIVE ARCHITECTURE GUIDE
====================================================================================================

1. WHO DEFINED HID AND HIDI2C?
----------------------------------------------------------------------------------------------------
- [HID ORIGIN - USB-IF]:
  The Human Interface Device (HID) standard was originally conceived and standardized in 1997-2001 
  by the USB Implementers Forum (USB-IF). Its core breakthrough was "Self-Describing Hardware":
  Instead of requiring device-specific proprietary drivers (e.g., separate drivers for 100 brands
  of mice), devices describe their capabilities using a standardized bytecode called a 
  "Report Descriptor". The operating system's generic HID class driver reads this descriptor and
  immediately knows how to parse buttons, coordinates, sliders, and haptic feedback.

- [HIDI2C SPECIFICATION - MICROSOFT CORPORATION]:
  The "HID Over I2C Protocol Specification" (Version 1.00) was authored and published by 
  MICROSOFT CORPORATION in 2011/2012 for the Windows 8 launch. 
  Windows 8 heavily focused on touch-enabled tablets, convertibles, and ultrabooks.
  Microsoft took the elegant USB-IF HID data model and adapted it to the low-power I2C bus.
  Today, both Microsoft Windows (via inbox 'hidi2c.sys') and Linux (via kernel driver 'i2c-hid')
  natively support this standard without needing third-party drivers.


2. SYSTEM ARCHITECTURE & BUS TOPOLOGY
----------------------------------------------------------------------------------------------------

 +---------------------------------------------------------------------------------------------+
 |                                  HOST SYSTEM (PC / SoC)                                     |
 |                                                                                             |
 |   +-------------------------------------------------------------------------------------+   |
 |   |                             USER SPACE / APPLICATION                                |   |
 |   |        (Chrome, Windows UI, Games, Multi-touch Gestures, Precision Touchpad)        |   |
 |   +-------------------------------------------------------------------------------------+   |
 |                                              ^                                              |
 |   +-------------------------------------------------------------------------------------+   |
 |   |                           OS INPUT SUBSYSTEM (RawInput / evdev)                     |   |
 |   +-------------------------------------------------------------------------------------+   |
 |                                              ^                                              |
 |   +-------------------------------------------------------------------------------------+   |
 |   |                         GENERIC HID CLASS DRIVER (hidclass.sys / hid-core)          |   |
 |   +-------------------------------------------------------------------------------------+   |
 |                                              ^                                              |
 |   +-------------------------------------------------------------------------------------+   |
 |   |               HID-OVER-I2C TRANSPORT MINI-DRIVER (hidi2c.sys / i2c-hid)             |   |
 |   |   - ACPI _DSM query to find registers       - Reads 30-byte HID Descriptor          |   |
 |   |   - Parses 2-byte Length prefixed packets   - Translates GPIO ISR to I2C Reads      |   |
 |   +-------------------------------------------------------------------------------------+   |
 |                          |                                         |                        |
 |   +------------------------------+                       +------------------------------+   |
 |   |  I2C CONTROLLER DRIVER       |                       |  GPIO INTERRUPT CONTROLLER   |   |
 |   +------------------------------+                       +------------------------------+   |
 +------------------|-------------------------------------------------------|------------------+
                    |                                                       |
                    | SCL (Serial Clock)                                    |
                    | SDA (Serial Data)                                     | INT# (Active-Low IRQ)
                    v                                                       v
 +---------------------------------------------------------------------------------------------+
 |                                 PERIPHERAL HARDWARE DEVICE                                  |
 |                               (e.g., Elan / Synaptics Touchpad)                             |
 |                                                                                             |
 |   +--------------------+     +------------------------+     +---------------------------+   |
 |   | Microcontroller    |     | 30-Byte HID Descriptor |     | Hardware Input FIFO       |   |
 |   | Registers & State  |     | & USB-IF Report Desc   |     | & INT# Output Transistor  |   |
 |   +--------------------+     +------------------------+     +---------------------------+   |
 |                                                                                             |
 |   +-------------------------------------------------------------------------------------+   |
 |   |                             CAPACITIVE TOUCH SENSOR GRID                            |   |
 |   +-------------------------------------------------------------------------------------+   |
 +---------------------------------------------------------------------------------------------+


3. HARDWARE PINS & ELECTRICAL CHARACTERISTICS
----------------------------------------------------------------------------------------------------
 To run a HID-over-I2C peripheral, exactly FIVE (5) to SIX (6) pins are required:

 Pin 1: SCL (Serial Clock)
   - Direction: Host (Master) -> Peripheral (Slave).
   - Electrical: Open-drain with external pull-up resistor (typically 2.2kΩ to 4.7kΩ to VDD).
   - Frequency: Standard Mode (100 kHz), Fast Mode (400 kHz), or Fast Mode Plus (1 MHz).

 Pin 2: SDA (Serial Data)
   - Direction: Bidirectional.
   - Electrical: Open-drain with external pull-up resistor (2.2kΩ to 4.7kΩ to VDD).

 Pin 3: INT# / IRQ# (Interrupt Line)
   - Direction: Peripheral (Slave) -> Host (Master).
   - Electrical: Active-LOW, open-drain with pull-up (typically 10kΩ to VDD).
   - Function: Since I2C is strictly a Master-driven bus (Slaves cannot speak unless addressed),
     the Slave pulls INT# LOW to notify the Host that an Input Report is ready in its FIFO!
   - Mode: Level-sensitive or Falling-Edge triggered. Host reads I2C bus ONLY when INT# is asserted.

 Pin 4: RESET# (Hardware Reset - Highly Recommended)
   - Direction: Host (Master) -> Peripheral (Slave).
   - Electrical: Active-LOW GPIO line from SoC.
   - Function: Pulled LOW during cold boot or recovery to force hardware reset of the peripheral.

 Pin 5: VDD / VCC (Power Rail)
   - Typical voltages: 1.8V, 2.8V, or 3.3V DC.
   - Low-power mobile SoCs heavily favor 1.8V I/O logic.

 Pin 6: GND (Ground)
   - System common ground reference.


4. USB HID VS. HID OVER I2C: COMPLETE COMPARISON MATRIX
----------------------------------------------------------------------------------------------------
+----------------------+------------------------------------+--------------------------------------+
| Feature              | USB HID (Universal Serial Bus)     | HID over I2C (HIDI2C)                |
+----------------------+------------------------------------+--------------------------------------+
| Origin / Spec By     | USB-IF (1997, 2001)                | Microsoft Corporation (2011/2012)    |
| Physical Lines       | 4 wires: D+, D-, VBUS, GND         | 5-6 wires: SCL, SDA, INT#, RST#, VDD |
| Signaling            | Differential NRZI, USB PHY         | Single-ended Open-Drain (I2C)        |
| Bus Speed            | 12 Mbps (Full) / 480 Mbps (High)   | 400 kHz (Fast) / 1 MHz (FM+)         |
| Interrupt Mechanism  | POLLING via USB IN Tokens          | HARDWARE IRQ: Slave pulls INT# LOW   |
| Idle Power Draw      | Milliamps (Continuous SOF tokens)  | Microamps (Bus completely silent)    |
| Device Discovery     | Dynamic Plug-and-Play USB Enum     | Static ACPI (_DSM) or Device Tree    |
| Packet Header        | USB Packets (Token/Data/Handshake) | 2-byte Length prefix (Little-Endian) |
| Silicon Complexity   | Higher (Needs USB Controller, PLL) | Extremely low (Simple I2C slave logic|
| Dominant Use Cases   | External mice/keyboards/gamepads   | Internal laptop touchpads & screens  |
+----------------------+------------------------------------+--------------------------------------+


5. WHY WAS HID-OVER-I2C CREATED INSTEAD OF USB?
----------------------------------------------------------------------------------------------------
 1. BATTERY LIFE & POWER EFFICIENCY:
    USB controllers require continuous frame synchronization (Start of Frame tokens every 1ms),
    preventing the CPU and peripheral from entering ultra-deep C-states/sleep.
    HIDI2C is completely silent when idle (0 Hz clock activity, zero bus traffic). The peripheral
    sleeps at < 10 µA until a finger touches the glass.

 2. SILICON CHIP FOOTPRINT & BILL OF MATERIALS (BOM) COST:
    An I2C slave engine requires just a few thousand logic gates and no high-frequency analog PLLs
    or precision crystals, drastically lowering the cost of touch sensor microcontrollers.

 3. COMPACT TRACE ROUTING ON MOTHERBOARDS:
    I2C uses standard low-speed motherboard traces without requiring impedance-matched differential
    pairs or RF shielding.


6. REAL-WORLD APPLICATIONS
----------------------------------------------------------------------------------------------------
 - Windows Precision Touchpads (PTP): Every modern Dell XPS, ThinkPad, Surface, and HP Spectre
   laptop routes its touchpad over HID-I2C.
 - Capacitive Multi-touch Screens: Microsoft Surface, 2-in-1 laptops, tablets.
 - Integrated Sensor Hubs (ISH): Gyroscopes, accelerometers, ambient light sensors, barometers.
 - Automotive Infotainment Displays & Center Consoles.
 - Smart Home Touch Terminals & Industrial HMIs.
====================================================================================================
""";

    public static string GetAcpiDsmCodeSample() =>
"""
====================================================================================================
                       ACPI DSDT ASL CODE DEFINITION (MICROSOFT SPEC EXAMPLE)
====================================================================================================

Scope (\_SB.PCI0.I2C1)
{
    Device (TPD0)
    {
        Name (_HID, "PNP0C50")                      // Microsoft HID-over-I2C Standard Device
        Name (_CID, "PNP0C50")
        Name (_UID, 0x01)
        Name (_CRS, ResourceTemplate ()
        {
            // 1. I2C Slave Address (0x0020), 400kHz Fast-Mode
            I2cSerialBusV2 (0x0020, ControllerInitiated, 400000,
                AddressingMode7Bit, "\\_SB.PCI0.I2C1",
                0x00, ResourceConsumer, , Exclusive, )

            // 2. Hardware Interrupt Pin (GPIO Pin 14, Active-Low, Level-Triggered)
            GpioInt (Level, ActiveLow, ExclusiveAndWake, PullUp, 0x0000,
                "\\_SB.GPI0", 0x00, ResourceConsumer, , )
            {
                14  // Pin number on SoC GPIO controller
            }
        })

        // 3. Device Specific Method (_DSM) for Microsoft HID-I2C
        Method (_DSM, 4, Serialized)
        {
            // Microsoft HIDI2C DSM GUID: 3CDFF6F7-4267-4555-AD05-B30A3D8938DE
            If (Arg0 == ToUUID("3CDFF6F7-4267-4555-AD05-B30A3D8938DE"))
            {
                // Function 0: Query Supported Functions
                If (Arg2 == 0) { Return (Buffer() { 0x03 }) }

                // Function 1: Return 16-bit HID Descriptor Register Address
                If (Arg2 == 1)
                {
                    Return (0x0001)                 // Register address 0x0001!
                }
            }
            Return (Buffer() { 0x00 })
        }
    }
}
====================================================================================================
""";
}
