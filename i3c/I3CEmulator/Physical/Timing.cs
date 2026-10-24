// =====================================================================================================
//  Physical/Timing.cs  -  Why an I3C bus runs at FOUR different clock profiles on the SAME two wires
// =====================================================================================================
//
//  If you know I2C, you are used to picking ONE bus speed (e.g., 100 kHz Standard Mode or 400 kHz Fast
//  Mode) and keeping SCL at that speed forever.
//
//  I3C is fundamentally different: the Controller dynamically changes the SCL period (and duty cycle!)
//  FROM ONE BIT TO THE NEXT inside a single frame depending on:
//    1. Whether SDA is currently driven in OPEN-DRAIN or PUSH-PULL mode.
//    2. Whether the Controller is talking to an I3C Target or a Legacy I2C Target.
//    3. Whether this is the VERY FIRST broadcast after bus initialization (to wake up I3C targets that
//       currently have their 50 ns I2C spike filter enabled).
//
//  ASCII COMPARISON OF SCL WAVEFORMS (drawn to approximate relative scale):
//
//  (A) Legacy I2C Fast-Mode (400 kHz)  -- Open-Drain everywhere, slow RC rise time on both edges
//      tLOW >= 1300 ns, tHIGH >= 600 ns   (Notice: tHIGH = 600 ns >> 50 ns spike filter -> I2C SEES IT!)
//
//      SCL   /‾‾‾‾‾‾‾‾‾‾‾\_______________________/‾‾‾‾‾‾‾‾‾‾‾\_______________________
//            |<--600ns-->|<-------1300ns-------->|<--600ns-->|<-------1300ns-------->|
//
//  (B) First I3C Broadcast 7'h7E after power-up -- Open-Drain, slow tHIGH so targets in I2C-mode see it
//      tLOW >= 200 ns, tHIGH >= 200 ns    (Once an I3C target sees 7'h7E, it disables its 50ns filter!)
//
//      SCL   /‾‾‾‾‾\_____/‾‾‾‾‾\_____
//            |200ns|200ns|200ns|200ns|
//
//  (C) Normal I3C Open-Drain phase (Address headers after START, ACK bits, ENTDAA arbitration)
//      tLOW >= 200 ns (gives SDA time to be pulled HIGH through the pull-up resistor while SCL is LOW),
//      tHIGH <= 40 ns (SHORT pulse! Legacy I2C 50 ns spike filter swallows this pulse completely!)
//
//      SCL   /‾\_______/‾\_______/‾\_______
//            | | 200ns | | 200ns | | 200ns
//            40ns      40ns      40ns  <-- < 50ns! Invisible to Legacy I2C devices!
//
//  (D) Normal I3C Push-Pull phase (SDR Data, T-bit, CCC bytes, Address after Repeated START)
//      fSCL up to 12.5 MHz: tLOW = 40 ns, tHIGH = 40 ns (symmetric 50% duty cycle, active drivers!)
//      Because tHIGH = 40 ns < 50 ns, Legacy I2C devices are ALSO completely blind to 12.5 MHz traffic.
//
//      SCL   /‾\_/‾\_/‾\_/‾\_/‾\_/‾\_/‾\_/‾\_
//            40  40  40  40  40  40  (ns)
//
// =====================================================================================================
//  BUS IDLE / AVAILABLE TIMERS (How a Target knows WHEN it is allowed to pull SDA low on its own)
// =====================================================================================================
//
//  After the Controller issues a STOP (P) condition, both SCL and SDA sit HIGH (Free state):
//
//  STOP (P)
//    |
//    |<-- tFREE (38.4ns) -->|<-------- tAVAL (1.0 us) -------->|<--------- tIDLE (200 us) --------->
//    v                      v                                  v
//  --+----------------------+----------------------------------+--------------------------------------> time
//    |   No one may touch   |   "BUS AVAILABLE" state          |   "BUS IDLE" state
//    |   the bus yet        |   Targets may now initiate an    |   Newly plugged-in or powered-up
//    |                      |   In-Band Interrupt (IBI) or     |   targets may now initiate a
//    |                      |   Controller-Role Request!       |   Hot-Join (HJ) request (7'h02/W)!
//
// =====================================================================================================

namespace I3CEmulator.Physical;

/// <summary>
/// Which physical signaling mode a device uses when driving the SDA line during the current bit.
/// </summary>
public enum DriveMode
{
    /// <summary>
    /// Open-Drain (OD):
    ///   - Writing '0': Turn ON the NMOS pull-down transistor (actively sinks current to GND -> Strong 0).
    ///   - Writing '1': Turn OFF the NMOS transistor (High-Z -> Weak 1 via the bus pull-up resistor).
    /// Multiple devices can drive SDA in Open-Drain simultaneously without short-circuiting VDD to GND.
    /// This forms a "Wired-AND" on the bus: if ANY device drives '0', the wire is '0'.
    /// Used whenever collisions/arbitration can happen or when ownership of SDA is uncertain.
    /// </summary>
    OpenDrain,

    /// <summary>
    /// Push-Pull (PP):
    ///   - Writing '0': Turn ON the NMOS pull-down transistor, turn OFF PMOS (Strong 0).
    ///   - Writing '1': Turn ON the PMOS pull-up transistor, turn OFF NMOS (Strong 1).
    /// Fast edges in both directions (up to 12.5 MHz in SDR), near-zero static power on '0' vs '1',
    /// no slow RC rise time.
    /// CRITICAL RULE: AT MOST ONE device on the entire bus may enable its Push-Pull driver at any
    /// instant! If Device A drives Push-Pull '1' (PMOS to VDD) while Device B drives '0' (NMOS to GND),
    /// VDD is shorted to GND through the two transistors (bus contention / hardware damage).
    /// </summary>
    PushPull,

    /// <summary>
    /// High-Impedance (Hi-Z / Released):
    /// Both PMOS and NMOS transistors are OFF. The device is only listening (reading) on SDA.
    /// </summary>
    HighZ
}

/// <summary>
/// Represents the SCL clock profile chosen by the Controller for a single bit or transfer phase.
/// See the ASCII waveform chart at the top of <see cref="Timing"/> for why these four profiles exist.
/// </summary>
public sealed record SclClockProfile(
    string Name,
    int LowNs,
    int HighNs,
    string Reason)
{
    /// <summary>Total SCL clock period in nanoseconds.</summary>
    public int PeriodNs => LowNs + HighNs;

    /// <summary>Effective clock frequency in MHz.</summary>
    public double FrequencyMHz => 1000.0 / PeriodNs;

    /// <summary>
    /// True if a legacy I2C device's mandatory 50 ns analog spike filter on SCL will suppress
    /// (swallow) the HIGH pulse of this clock profile, making the clock edge invisible to I2C slaves.
    /// </summary>
    public bool FilteredOutByI2CSpikeFilter => HighNs < Timing.I2CSpikeFilterThresholdNs;
}

/// <summary>
/// Standard MIPI I3C v1.1.1 timing constants (in nanoseconds) used by the emulator.
/// </summary>
public static class Timing
{
    /// <summary>
    /// Legacy I2C Fast-Mode / Fast-Mode+ devices are required to have a 50 ns glitch/spike filter on
    /// SCL and SDA. Any pulse narrower than 50 ns is ignored by the I2C state machine.
    /// I3C exploits this by keeping SCL HIGH <= 40 ns during all normal I3C traffic!
    /// </summary>
    public const int I2CSpikeFilterThresholdNs = 50;

    /// <summary>
    /// Bus Free Condition time (tCAS / tCBA / tFREE) after STOP before another Controller transfer.
    /// </summary>
    public const int BusFreeNs = 40;

    /// <summary>
    /// Bus Available condition (tAVAL = 1,000 ns = 1 us) of continuous SCL=1 &amp; SDA=1 after STOP.
    /// Once the bus has been free for >= 1 us, an I3C Target is allowed to pull SDA LOW to initiate
    /// an In-Band Interrupt (IBI) without waiting for the Controller to start a frame.
    /// </summary>
    public const int BusAvailableNs = 1_000;

    /// <summary>
    /// Bus Idle condition (tIDLE = 200,000 ns = 200 us) of continuous SCL=1 &amp; SDA=1.
    /// Required before a Target is allowed to issue a Hot-Join request (7'h02/W).
    /// </summary>
    public const int BusIdleNs = 200_000;

    /// <summary>
    /// Profile 1: Very first broadcast (7'h7E/W) after power-up or reset.
    /// Why tHIGH = 200 ns? At power-up, an I3C target that also has a static I2C address starts up
    /// with its 50 ns I2C spike filter ENABLED (in case it was soldered onto an old I2C board).
    /// To make sure it sees the first 7'h7E header and switches into I3C mode (disabling its spike
    /// filter), the Controller stretches tHIGH to >= 200 ns on the very first broadcast header.
    /// </summary>
    public static readonly SclClockProfile FirstBroadcastOpenDrain = new(
        Name: "I3C-OD-INIT (2.5 MHz)",
        LowNs: 200,
        HighNs: 200,
        Reason: "tHIGH=200ns (>50ns) so I3C targets wake up from initial I2C-filter mode on first 7'h7E");

    /// <summary>
    /// Profile 2: Standard I3C Open-Drain bit timing (used for address headers after START, ACK bits,
    /// and all ENTDAA arbitration bits).
    /// Why tLOW = 200 ns? When a device releases SDA from '0' to '1' in Open-Drain mode, the passive
    /// pull-up resistor needs ~150-200 ns to charge the bus capacitance back to VDD while SCL is LOW.
    /// Why tHIGH = 40 ns? Keeping tHIGH &lt; 50 ns hides all I3C Open-Drain clocks from Legacy I2C slaves!
    /// </summary>
    public static readonly SclClockProfile I3COpenDrain = new(
        Name: "I3C-OD (4.17 MHz)",
        LowNs: 200,
        HighNs: 40,
        Reason: "tLOW=200ns allows RC pull-up rise on SDA; tHIGH=40ns (<50ns) hides clock from I2C slaves");

    /// <summary>
    /// Profile 3: Standard I3C Push-Pull SDR timing (12.5 MHz).
    /// Used whenever a single device actively drives both '0' and '1' on SDA (Address after Sr,
    /// CCC bytes, Write Data + Parity T-bit, Read Data + T-bit, IBI payload).
    /// </summary>
    public static readonly SclClockProfile I3CPushPull = new(
        Name: "I3C-PP-SDR (12.5 MHz)",
        LowNs: 40,
        HighNs: 40,
        Reason: "Active PMOS+NMOS driver on SDA; 40ns/40ns = 12.5 MHz; tHIGH=40ns invisible to I2C slaves");

    /// <summary>
    /// Profile 4: Legacy I2C Fast-Mode (400 kHz) used when the I3C Controller intentionally talks to a
    /// Legacy I2C Slave on the bus.
    /// Here tHIGH = 600 ns (&gt;= 50 ns), so the Legacy I2C Slave's spike filter lets the clock through!
    /// I3C Targets also see these clocks, of course, which is why the Controller never assigns an I2C
    /// slave's static address to any I3C Target.
    /// </summary>
    public static readonly SclClockProfile LegacyI2CFastMode = new(
        Name: "I2C-FM (400 kHz)",
        LowNs: 1300,
        HighNs: 600,
        Reason: "tHIGH=600ns passes the 50ns I2C spike filter so Legacy I2C slaves can receive the transfer");
}
