// =====================================================================================================
//  Devices/IBusDevice.cs  -  Hardware pad interface for every device attached to the two-wire I3C bus
// =====================================================================================================

using I3CEmulator.Physical;

namespace I3CEmulator.Devices;

/// <summary>
/// Represents any hardware component connected to the two physical wires (SCL and SDA) of an
/// <see cref="I3CBus"/>: an <see cref="I3CMaster"/>, an <see cref="I3CSlave"/>, or a legacy
/// <see cref="I2CSlave"/>.
///
/// Notice how minimal this interface is: in real silicon there are NO side-channel function calls
/// between Master and Slave! Every single piece of information (addresses, CCC commands, PID
/// arbitration, dynamic address assignment, In-Band Interrupts, Hot-Join, T-bit parity, and I2C transfers)
/// MUST travel through SCL edges and SDA voltage levels via these callbacks.
/// </summary>
public interface IBusDevice
{
    /// <summary>Human-readable name for waveform traces and bus logs (e.g. "IMU-Gyro", "I2C-EEPROM").</summary>
    string Name { get; }

    /// <summary>Called when the device is physically wired onto an <see cref="I3CBus"/>.</summary>
    void AttachToBus(I3CBus bus);

    /// <summary>
    /// Notification that SDA transitioned HIGH -> LOW while SCL was HIGH, starting a new frame
    /// from the Bus Free / Available / Idle state.
    /// </summary>
    void OnStartCondition();

    /// <summary>
    /// Notification that SDA transitioned HIGH -> LOW while SCL was HIGH inside an already-active
    /// frame (Repeated START, "Sr").
    /// Note: in I3C, the Controller generates Sr by setting SDA=1 while SCL=0, raising SCL=1, and
    /// then pulling SDA=0 while SCL=1. Crucially, NO target is allowed to arbitrate after an Sr!
    /// </summary>
    void OnRepeatedStartCondition();

    /// <summary>
    /// Notification that SDA transitioned LOW -> HIGH while SCL was HIGH (STOP, "P").
    /// The bus returns to the Free state.
    /// </summary>
    void OnStopCondition();

    /// <summary>
    /// Called on the FALLING edge of SCL (SCL: 1 -> 0).
    /// Just like in real hardware, devices change their SDA driver (Open-Drain, Push-Pull, or High-Z)
    /// while SCL is LOW so that SDA is stable before the next SCL rising edge.
    /// </summary>
    /// <param name="upcomingProfile">
    /// The clock timing profile that will be used for this bit cycle. Devices with a 50 ns spike
    /// filter (such as <see cref="I2CSlave"/> or an uninitialized <see cref="I3CSlave"/>) check
    /// the pulse width to see if their internal clock circuit even notices the pulse.
    /// </param>
    void OnSclFallingEdge(SclClockProfile upcomingProfile);

    /// <summary>
    /// Called on the RISING edge of SCL (SCL: 0 -> 1), when SDA has settled.
    /// All devices sample the resolved SDA line here, shift bits into their shift registers, and
    /// check whether they won or lost Open-Drain arbitration (if they drove '1' but sampled '0').
    /// </summary>
    /// <param name="profile">The clock timing profile of the current HIGH pulse.</param>
    /// <param name="resolvedSda">The physical logic level (false=0/LOW, true=1/HIGH) on the SDA wire.</param>
    void OnSclRisingEdge(SclClockProfile profile, bool resolvedSda);

    /// <summary>
    /// Called when the bus sits idle (SCL=1, SDA=1 after a STOP) and simulated wall-clock time
    /// advances. Allows I3C Targets to check if <see cref="Timing.BusAvailableNs"/> (1 us, for IBI)
    /// or <see cref="Timing.BusIdleNs"/> (200 us, for Hot-Join) has elapsed so they can pull SDA LOW
    /// to request a Target-initiated START.
    /// </summary>
    /// <param name="continuousFreeTimeNs">How long SCL and SDA have both been continuously HIGH.</param>
    void OnBusFreeTimeAdvanced(long continuousFreeTimeNs);
}
