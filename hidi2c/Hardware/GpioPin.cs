namespace HidI2cSimulation.Hardware;

/// <summary>
/// =========================================================================================
///  GPIO PIN SIMULATION (HARDWARE LEVEL)
/// =========================================================================================
///
///  In HID over I2C systems, two critical GPIO lines exist between Host and Peripheral:
///
///  1. INT# / IRQ# (Active-Low Interrupt Line):
///     - Driven by the I2C Slave (Touchpad/Touchscreen).
///     - When idle: Pulled HIGH to VDD via external resistor (e.g., 10k pull-up).
///     - When active: Driven LOW by slave's open-drain output transistor when an input
///       report is ready.
///     - Host detects the Level (Active-LOW) or Falling Edge, and dispatches an
///       Interrupt Service Routine (ISR) / Deferred Procedure Call (DPC) to read I2C.
///
///  2. RESET# (Active-Low Hardware Reset Line - Optional):
///     - Driven by the Host.
///     - Pulled LOW for >= 10ms to force hardware reset of the slave controller.
///
///  ASCII SIGNAL DIAGRAM (INTERRUPT TRIGGERING & SERVICING):
///
///               Idle (High)           Event Occurred                I2C Read Finished
///  INT# Line:  --------------------\                              /---------------------
///                                  \____________________________/
///                                   <-- Low: Report Pending --->
///
///  Host Action: [Idle / Sleep]     [Detects Edge/Level]   [Initiates I2C Read]  [Resumes]
/// =========================================================================================
/// </summary>
public enum PinState : byte
{
    Low = 0,
    High = 1
}

public enum PinDriveMode
{
    PushPull,
    OpenDrainWithPullUp
}

public class GpioPin
{
    public string Name { get; }
    public PinDriveMode DriveMode { get; }
    public PinState CurrentState { get; private set; }

    public event Action<GpioPin, PinState>? StateChanged;
    public event Action<GpioPin>? FallingEdge;
    public event Action<GpioPin>? RisingEdge;

    public GpioPin(string name, PinDriveMode driveMode = PinDriveMode.OpenDrainWithPullUp, PinState defaultState = PinState.High)
    {
        Name = name;
        DriveMode = driveMode;
        CurrentState = defaultState;
    }

    /// <summary>
    /// Sets the digital voltage level of this pin.
    /// Triggers edge and state change events when transitioning.
    /// </summary>
    public void Write(PinState newState)
    {
        if (CurrentState == newState)
            return;

        PinState oldState = CurrentState;
        CurrentState = newState;

        StateChanged?.Invoke(this, newState);

        if (oldState == PinState.High && newState == PinState.Low)
        {
            FallingEdge?.Invoke(this);
        }
        else if (oldState == PinState.Low && newState == PinState.High)
        {
            RisingEdge?.Invoke(this);
        }
    }

    /// <summary>
    /// Reads the current state of the pin.
    /// </summary>
    public PinState Read() => CurrentState;

    /// <summary>
    /// Convenient helper to assert active-low signal (pull to LOW).
    /// </summary>
    public void AssertActiveLow() => Write(PinState.Low);

    /// <summary>
    /// Convenient helper to release active-low signal (pull up to HIGH).
    /// </summary>
    public void ReleaseActiveLow() => Write(PinState.High);
}
