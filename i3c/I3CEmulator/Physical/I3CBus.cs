// =====================================================================================================
//  Physical/I3CBus.cs  -  Cycle-accurate electrical model of the two-wire I3C / I2C bus (SCL + SDA)
// =====================================================================================================
//
//  1. HARDWARE CIRCUIT: HOW AN I3C PAD DIFFERS FROM AN I2C PAD
//  ===========================================================
//
//  In classic I2C, both SCL and SDA only have an NMOS pull-down transistor ("Open-Drain") and rely on
//  an external board resistor Rp (typically 1 kOhm .. 4.7 kOhm) to pull the wire back up to VDD:
//
//        VDD                         VDD (Controller switched pull-up, ~1..2 kOhm when OD is active)
//         |                           |
//        [Rp]                        [Rp]   <-- Passive Pull-Up Resistor (slow RC rise: tR ~ Rp * Cbus)
//         |                           |
//         +----------- SDA Wire ------+------------------------+
//         |                           |                        |
//         |        +------------------+-----+                  |
//         |        |     I3C Device Pad     |                  |     +--------------------+
//         |        |                        |                  |     |  Legacy I2C Pad    |
//         |        |       VDD              |                  |     |                    |
//         |        |        |               |                  |     |  (No PMOS at all!) |
//         |        |    ||--+               |                  |     |                    |
//         |        |    ||<-+ PMOS (High-   |                  |     |                    |
//         |        |    ||--+  Side Driver) |                  |     |                    |
//         |        |        |  ONLY ON IN   |                  |     |                    |
//         +--------+--------+  PUSH-PULL!   |                  +-----+--------+           |
//                  |        |               |                        |        |           |
//                  |    ||--+               |                        |    ||--+           |
//                  |    ||->+ NMOS (Low-    |                        |    ||->+ NMOS      |
//                  |    ||--+  Side Driver) |                        |    ||--+ (Open-    |
//                  |        |  Used in BOTH |                        |        |  Drain)   |
//                  |       GND  OD and PP   |                        |       GND          |
//                  +------------------------+                        +--------------------+
//
//  2. WHY CAN'T WE JUST USE PUSH-PULL ALL THE TIME?
//  ================================================
//
//  Suppose Device A and Device B are BOTH driving SDA at the same time (which happens legitimately
//  during an Address Header after START, or during the 64-bit ENTDAA PID arbitration):
//    - Device A wants to send '1'.
//    - Device B wants to send '0'.
//
//  Case 1: Both use OPEN-DRAIN (PMOS is OFF in all devices):
//    - Device A ('1'): NMOS = OFF (High-Z).
//    - Device B ('0'): NMOS = ON  (connects SDA to GND).
//    - Result on wire : GND ('0') wins cleanly! Current through Rp is tiny (VDD / Rp ~ 1 mA).
//    - Device A samples SDA, sees '0' instead of its '1', and immediately knows:
//      "Someone else is driving '0' -> I LOST ARBITRATION!"
//      This is called WIRED-AND logic: SDA = Dev1_Bit & Dev2_Bit & ... & DevN_Bit.
//
//  Case 2: Both use PUSH-PULL (PMOS is ON for '1', NMOS is ON for '0'):
//    - Device A ('1'): PMOS = ON (connects VDD directly to SDA with ~20 Ohm impedance).
//    - Device B ('0'): NMOS = ON (connects SDA directly to GND with ~20 Ohm impedance).
//    - Result on wire : SHORT CIRCUIT from VDD -> Device A PMOS -> SDA -> Device B NMOS -> GND!
//      Large shoot-through current flows, voltage on SDA sits at an indeterminate ~VDD/2 level, and
//      neither device can reliably read the bit.
//
//  THEREFORE, THE GOLDEN RULE OF I3C IS:
//  +-------------------------------------------------------------------------------------------------+
//  | * Use OPEN-DRAIN whenever >= 2 devices might drive SDA simultaneously (or when a target might  |
//  |   NACK by staying High-Z while the pull-up holds SDA at '1'):                                   |
//  |     1) The 8-bit Address Header right after a START (S) -- because Master + any IBI/HJ Target   |
//  |        may drive SDA at the same time!                                                          |
//  |     2) Every Address ACK/NACK bit (9th bit after an address header).                            |
//  |     3) The entire 64-bit PID+BCR+DCR arbitration phase during ENTDAA -- because ALL unassigned  |
//  |        I3C targets drive their IDs onto SDA simultaneously!                                     |
//  |     4) Legacy I2C transfers (every bit).                                                        |
//  |                                                                                                 |
//  | * Switch to PUSH-PULL (12.5 MHz) ONLY when bus ownership is 100% unambiguous (exactly ONE       |
//  |   driver on SDA):                                                                               |
//  |     1) The 8-bit Address Header right after a REPEATED START (Sr) -- because targets are        |
//  |        FORBIDDEN from starting an IBI or Hot-Join on Sr! Only the Master drives SDA here!       |
//  |     2) CCC Command Code bytes, Defining bytes, and Write Data bytes + their Odd-Parity T-bits   |
//  |        (driven solely by the Master).                                                           |
//  |     3) Read Data bytes + their T-bit (driven solely by the ONE addressed Target, or the ONE     |
//  |        Target that already won IBI arbitration).                                                |
//  +-------------------------------------------------------------------------------------------------+
//
//  What about SCL (the clock line)?
//    In I3C, the Controller is the ONLY device that ever drives SCL, and it drives SCL in PUSH-PULL
//    100% of the time. Target clock stretching (holding SCL low) is strictly forbidden in I3C.
//
// =====================================================================================================

using I3CEmulator.Devices;

namespace I3CEmulator.Physical;

/// <summary>
/// Represents the instantaneous output pad state of a single device on the SDA wire.
/// </summary>
public readonly record struct SdaDriverState(DriveMode Mode, bool Level)
{
    public static readonly SdaDriverState Released = new(DriveMode.HighZ, true);

    public override string ToString() => Mode switch
    {
        DriveMode.HighZ => "Hi-Z",
        DriveMode.OpenDrain => Level ? "OD:1(Hi-Z)" : "OD:0(PullDown)",
        DriveMode.PushPull => Level ? "PP:1(StrongHigh)" : "PP:0(StrongLow)",
        _ => "?"
    };
}

/// <summary>
/// High-level state of the I3C bus between or during frames.
/// </summary>
public enum BusCondition
{
    /// <summary>After STOP: SCL=1, SDA=1, for less than tAVAL (1 us).</summary>
    Free,

    /// <summary>SCL=1, SDA=1 continuously for >= tAVAL (1 us). Targets may initiate an IBI here.</summary>
    Available,

    /// <summary>SCL=1, SDA=1 continuously for >= tIDLE (200 us). Targets may initiate Hot-Join here.</summary>
    Idle,

    /// <summary>Between START (or Sr) and STOP: a frame is currently in progress on the bus.</summary>
    Busy
}

/// <summary>
/// Emulates the physical two-wire I3C bus (SCL and SDA), resolving wired-AND Open-Drain levels,
/// verifying Push-Pull exclusivity, propagating clock edges to all attached <see cref="IBusDevice"/>
/// instances, and keeping timing/mode statistics for educational inspection.
/// </summary>
public sealed class I3CBus
{
    private readonly List<IBusDevice> _devices = new();
    private readonly Dictionary<IBusDevice, SdaDriverState> _sdaDrivers = new();
    private readonly List<string> _log = new();

    /// <summary>Current logic level on the SCL wire (driven Push-Pull by the Active Controller).</summary>
    public bool Scl { get; private set; } = true;

    /// <summary>Current resolved logic level on the SDA wire.</summary>
    public bool Sda { get; private set; } = true;

    /// <summary>Current bus condition (Free / Available / Idle / Busy).</summary>
    public BusCondition Condition { get; private set; } = BusCondition.Idle;

    /// <summary>Simulated wall-clock time in nanoseconds since power-on.</summary>
    public long SimulatedTimeNs { get; private set; }

    /// <summary>How many nanoseconds the bus has been continuously Free (SCL=1, SDA=1) since the last STOP.</summary>
    public long ContinuousFreeTimeNs { get; private set; } = Timing.BusIdleNs;

    /// <summary>Total number of SCL clock cycles executed in Open-Drain mode (I3C OD + I2C).</summary>
    public int OpenDrainBitCount { get; private set; }

    /// <summary>Total number of SCL clock cycles executed in Push-Pull mode (12.5 MHz SDR).</summary>
    public int PushPullBitCount { get; private set; }

    /// <summary>
    /// True if a Target pulled SDA LOW while the bus was Available/Idle to request a START (IBI or Hot-Join).
    /// </summary>
    public bool IsTargetPullingSdaLowForStart =>
        Condition != BusCondition.Busy && Scl && !Sda;

    /// <summary>When enabled, prints detailed bit-by-bit or event-by-event traces to the console.</summary>
    public bool VerboseTrace { get; set; } = true;

    /// <summary>Read-only list of all devices physically wired to this bus.</summary>
    public IReadOnlyList<IBusDevice> Devices => _devices;

    /// <summary>Chronological log of bus events.</summary>
    public IReadOnlyList<string> EventLog => _log;

    /// <summary>
    /// Attaches a device (Master, I3C Slave, or I2C Slave) to the physical SCL/SDA wires.
    /// </summary>
    public void Attach(IBusDevice device)
    {
        if (_devices.Contains(device))
            return;

        _devices.Add(device);
        _sdaDrivers[device] = SdaDriverState.Released;
        device.AttachToBus(this);
        ResolveSda();
    }

    // =================================================================================================
    //  SDA PAD DRIVER API (Called by Master and Slaves to set their MOSFET output stage)
    // =================================================================================================

    /// <summary>
    /// Device sets its SDA pad in Open-Drain mode:
    ///   - <paramref name="bit"/> == false ('0'): NMOS ON (pulls SDA to GND).
    ///   - <paramref name="bit"/> == true  ('1'): NMOS OFF (High-Z; passive pull-up Rp pulls SDA to VDD
    ///     unless another device on the bus has its NMOS ON).
    /// </summary>
    public void DriveSdaOpenDrain(IBusDevice device, bool bit)
    {
        _sdaDrivers[device] = new SdaDriverState(DriveMode.OpenDrain, bit);
        ResolveSda();
    }

    /// <summary>
    /// Device sets its SDA pad in Push-Pull mode:
    ///   - <paramref name="bit"/> == false ('0'): NMOS ON, PMOS OFF (Strong LOW).
    ///   - <paramref name="bit"/> == true  ('1'): PMOS ON, NMOS OFF (Strong HIGH).
    /// Throws if another device is simultaneously driving an opposing level against a Push-Pull driver!
    /// </summary>
    public void DriveSdaPushPull(IBusDevice device, bool bit)
    {
        _sdaDrivers[device] = new SdaDriverState(DriveMode.PushPull, bit);
        ResolveSda();
    }

    /// <summary>
    /// Device turns off both PMOS and NMOS on its SDA pad (High-Z listener mode).
    /// </summary>
    public void ReleaseSda(IBusDevice device)
    {
        _sdaDrivers[device] = SdaDriverState.Released;
        ResolveSda();
    }

    /// <summary>
    /// Inspects the current driver state of a specific device (useful for educational logging).
    /// </summary>
    public SdaDriverState GetDriverState(IBusDevice device) =>
        _sdaDrivers.TryGetValue(device, out var state) ? state : SdaDriverState.Released;

    /// <summary>
    /// Returns a summary of all devices actively driving SDA right now (for trace diagnostics).
    /// </summary>
    public string DescribeActiveSdaDrivers()
    {
        var active = _sdaDrivers
            .Where(kv => kv.Value.Mode != DriveMode.HighZ &&
                         !(kv.Value.Mode == DriveMode.OpenDrain && kv.Value.Level))
            .Select(kv => $"{kv.Key.Name}:{kv.Value}")
            .ToList();

        if (active.Count == 0)
            return "Pull-Up Rp -> 1 (all pads Hi-Z / OD:1)";

        return string.Join(", ", active);
    }

    /// <summary>
    /// Resolves the physical voltage on the SDA wire from all attached device pads and checks for
    /// illegal Push-Pull bus contention.
    /// </summary>
    private void ResolveSda()
    {
        var pushPullDrivers = _sdaDrivers
            .Where(kv => kv.Value.Mode == DriveMode.PushPull)
            .ToList();

        var openDrainLowDrivers = _sdaDrivers
            .Where(kv => kv.Value.Mode == DriveMode.OpenDrain && !kv.Value.Level)
            .ToList();

        // Check 1: More than one device enabling its Push-Pull driver at the same time is illegal.
        if (pushPullDrivers.Count > 1)
        {
            string culprits = string.Join(", ", pushPullDrivers.Select(kv => $"{kv.Key.Name}={kv.Value}"));
            throw new InvalidOperationException(
                $"[ELECTRICAL CONTENTION] Multiple devices driving SDA in Push-Pull simultaneously: {culprits}");
        }

        // Check 2: One device driving Push-Pull HIGH (PMOS to VDD) while another drives Open-Drain LOW
        // (NMOS to GND) creates a direct short circuit from VDD to GND!
        if (pushPullDrivers.Count == 1 && pushPullDrivers[0].Value.Level && openDrainLowDrivers.Count > 0)
        {
            string pp = $"{pushPullDrivers[0].Key.Name}=PP:1";
            string od = string.Join(", ", openDrainLowDrivers.Select(kv => $"{kv.Key.Name}=OD:0"));
            throw new InvalidOperationException(
                $"[ELECTRICAL SHORT CIRCUIT] Push-Pull HIGH ({pp}) collided with Open-Drain LOW ({od})!");
        }

        if (pushPullDrivers.Count == 1)
        {
            Sda = pushPullDrivers[0].Value.Level;
        }
        else
        {
            // Wired-AND in Open-Drain / High-Z:
            // If ANY device has its NMOS turned ON (OpenDrain with Level=false), SDA is pulled LOW (0).
            // Otherwise the passive pull-up resistor Rp pulls SDA HIGH (1).
            Sda = openDrainLowDrivers.Count == 0;
        }
    }

    // =================================================================================================
    //  BUS FRAMING CONDITIONS: START (S), REPEATED START (Sr), STOP (P), AND IDLE TIME
    // =================================================================================================

    /// <summary>
    /// Advances simulated time while the bus is between frames (SCL=1, SDA=1).
    /// Updates <see cref="Condition"/> from <see cref="BusCondition.Free"/> -&gt;
    /// <see cref="BusCondition.Available"/> (at 1 us) -&gt; <see cref="BusCondition.Idle"/> (at 200 us),
    /// and notifies all attached devices so Targets with pending IBIs or Hot-Join requests can act.
    /// </summary>
    public void AdvanceIdleTimeNs(int nanoseconds)
    {
        if (Condition == BusCondition.Busy)
            throw new InvalidOperationException("Cannot advance idle time while the bus is Busy inside a frame.");

        SimulatedTimeNs += nanoseconds;
        ContinuousFreeTimeNs += nanoseconds;

        if (ContinuousFreeTimeNs >= Timing.BusIdleNs)
            Condition = BusCondition.Idle;
        else if (ContinuousFreeTimeNs >= Timing.BusAvailableNs)
            Condition = BusCondition.Available;
        else
            Condition = BusCondition.Free;

        foreach (var device in _devices)
        {
            device.OnBusFreeTimeAdvanced(ContinuousFreeTimeNs);
        }
    }

    /// <summary>
    /// Generates a START (S) condition on the bus: while SCL is HIGH, SDA transitions HIGH -&gt; LOW.
    /// Note that either the Controller OR a Target (after tAVAL / tIDLE) may have pulled SDA LOW;
    /// when the Controller begins clocking the frame, all devices recognize the START condition.
    /// </summary>
    public void BroadcastStart(IBusDevice initiator, string reason)
    {
        if (!Scl)
            throw new InvalidOperationException("START condition requires SCL to be HIGH.");

        Condition = BusCondition.Busy;
        ContinuousFreeTimeNs = 0;
        SimulatedTimeNs += 20;

        Log($"[S] START on bus (initiated by {initiator.Name}: {reason})");

        foreach (var device in _devices)
        {
            device.OnStartCondition();
        }
    }

    /// <summary>
    /// Generates a Repeated START (Sr) condition inside an ongoing frame.
    /// How Sr works electrically:
    ///   1. While SCL is LOW, the Controller brings SDA HIGH (and all targets release SDA).
    ///   2. Controller raises SCL HIGH.
    ///   3. While SCL is HIGH, Controller pulls SDA LOW -&gt; Repeated START!
    /// Why Sr is special in I3C:
    ///   Targets are NOT allowed to start an IBI or Hot-Join on a Repeated START! Therefore, the
    ///   Controller is guaranteed to be the sole driver of the next 8-bit address header and drives
    ///   that address header in fast PUSH-PULL mode (12.5 MHz) instead of Open-Drain!
    /// </summary>
    public void BroadcastRepeatedStart(IBusDevice controller)
    {
        // Release all target drivers while SCL is LOW so SDA can go cleanly HIGH before Sr
        Scl = false;
        foreach (var d in _devices)
            _sdaDrivers[d] = SdaDriverState.Released;
        ResolveSda();

        Scl = true;
        SimulatedTimeNs += 20;

        // Controller pulls SDA LOW while SCL is HIGH
        DriveSdaOpenDrain(controller, false);
        SimulatedTimeNs += 20;

        Log("[Sr] REPEATED START (Targets may NOT arbitrate after Sr -> next address header can use Push-Pull!)");

        foreach (var device in _devices)
        {
            device.OnRepeatedStartCondition();
        }
    }

    /// <summary>
    /// Generates a STOP (P) condition: while SCL is HIGH, SDA transitions LOW -&gt; HIGH.
    /// Releases all device drivers and transitions the bus back to <see cref="BusCondition.Free"/>.
    /// </summary>
    public void BroadcastStop(IBusDevice controller)
    {
        Scl = false;
        // Controller ensures SDA is LOW while SCL is LOW, and all other devices release SDA
        foreach (var d in _devices)
            _sdaDrivers[d] = SdaDriverState.Released;
        DriveSdaOpenDrain(controller, false);

        // Raise SCL HIGH first, then release SDA LOW -> HIGH = STOP condition!
        Scl = true;
        SimulatedTimeNs += 20;
        ReleaseSda(controller);
        SimulatedTimeNs += Timing.BusFreeNs;

        Condition = BusCondition.Free;
        ContinuousFreeTimeNs = Timing.BusFreeNs;

        Log("[P] STOP -> Bus is now FREE (SCL=1, SDA=1)\n");

        foreach (var device in _devices)
        {
            device.OnStopCondition();
        }
    }

    // =================================================================================================
    //  BIT-LEVEL CLOCK GENERATION (SCL FALLING EDGE -> SDA SETUP -> SCL RISING EDGE -> SDA SAMPLE)
    // =================================================================================================

    /// <summary>
    /// Executes the LOW phase of a single SCL clock cycle:
    ///   1. Controller drives SCL LOW (1 -&gt; 0).
    ///   2. Every attached device receives <see cref="IBusDevice.OnSclFallingEdge"/> and updates its
    ///      SDA driver (Open-Drain, Push-Pull, or High-Z) for the new bit.
    ///   3. Simulated time advances by <see cref="SclClockProfile.LowNs"/>.
    /// </summary>
    public void ClockFallingEdge(SclClockProfile profile)
    {
        Scl = false;
        foreach (var device in _devices)
        {
            device.OnSclFallingEdge(profile);
        }
        ResolveSda();
        SimulatedTimeNs += profile.LowNs;
    }

    /// <summary>
    /// Executes the HIGH phase of a single SCL clock cycle:
    ///   1. Controller drives SCL HIGH (0 -&gt; 1) in Push-Pull.
    ///   2. SDA is resolved (Wired-AND if Open-Drain, or single strong driver if Push-Pull).
    ///   3. Every attached device receives <see cref="IBusDevice.OnSclRisingEdge"/> with the resolved
    ///      SDA bit so it can sample the wire and detect arbitration loss immediately.
    ///   4. Simulated time advances by <see cref="SclClockProfile.HighNs"/>.
    /// </summary>
    public bool ClockRisingEdge(SclClockProfile profile)
    {
        Scl = true;
        ResolveSda();
        bool sampledSda = Sda;

        if (_sdaDrivers.Values.Any(v => v.Mode == DriveMode.PushPull))
            PushPullBitCount++;
        else
            OpenDrainBitCount++;

        foreach (var device in _devices)
        {
            device.OnSclRisingEdge(profile, sampledSda);
        }

        SimulatedTimeNs += profile.HighNs;
        return sampledSda;
    }

    /// <summary>
    /// Appends a formatted line to the bus log (and prints to console when <see cref="VerboseTrace"/> is true).
    /// </summary>
    public void Log(string message)
    {
        string line = $"[{SimulatedTimeNs,9:N0} ns] {message}";
        _log.Add(line);
        if (VerboseTrace)
        {
            Console.WriteLine(line);
        }
    }
}
