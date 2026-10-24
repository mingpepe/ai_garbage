// =====================================================================================================
//  Devices/I2CSlave.cs  -  Legacy I2C Target (Slave) coexisting on an I3C Bus
// =====================================================================================================
//
//  HOW CAN AN OLD I2C CHIP SIT ON THE SAME SDA/SCL WIRES AS A 12.5 MHz PUSH-PULL I3C BUS?
//  ======================================================================================
//
//  If you already know I2C, you might worry:
//    "Wait! When the I3C Controller sends 12.5 MHz Push-Pull data bytes (or 64-bit ENTDAA arbitration)
//     on SDA and SCL, won't a Legacy I2C EEPROM or sensor sitting on the same wires accidentally see
//     its 7-bit address inside the bit stream and pull SDA low in the middle of an I3C transfer?!"
//
//  The MIPI I3C specification solves this with THREE clever hardware rules:
//
//  1. THE 50 ns SPIKE FILTER TRICK (Why I2C Slaves are "blind" during I3C transfers):
//     Since the I2C Fast-Mode (400 kHz) specification (NXP UM10204), every compliant I2C Fast-Mode and
//     Fast-Mode+ slave is required to include an analog low-pass glitch filter on its SCL and SDA pins
//     that suppresses any pulse narrower than 50 nanoseconds (tSP = 50 ns).
//
//     Look at what the I3C Controller does to the SCL HIGH width (tHIGH):
//
//                       I3C Open-Drain (4.17 MHz)         I3C Push-Pull SDR (12.5 MHz)
//                         tLOW=200ns, tHIGH=40ns            tLOW=40ns, tHIGH=40ns
//       Wire SCL   :  ______/‾\__________/‾\__________   ____/‾\__/‾\__/‾\__/‾\____
//                           40ns         40ns                40ns 40ns 40ns 40ns
//                            |            |                   |    |    |    |
//                            v            v                   v    v    v    v
//                     +------------------------------------------------------------+
//                     |   Legacy I2C Slave's 50 ns Analog Spike Filter on SCL      |
//                     |   (Any HIGH pulse < 50 ns fails to cross the RC threshold) |
//                     +------------------------------------------------------------+
//                                                 |
//                                                 v
//       Filtered SCL  _____________________________________________________________ (Stays flat LOW!)
//       inside I2C
//       state machine
//
//     Because `tHIGH = 40 ns < 50 ns`, the Legacy I2C chip's internal shift register receives ZERO
//     clock edges during normal I3C Open-Drain headers and 12.5 MHz Push-Pull data!
//
//  2. WHAT ABOUT THE VERY FIRST 7'h7E BROADCAST (WHERE tHIGH = 200 ns)?
//     During the initial wake-up broadcast (`FirstBroadcastOpenDrain`), `tHIGH = 200 ns >= 50 ns`, so
//     the Legacy I2C Slave DOES clock in those 8 bits (`7'h7E + W`).
//     Why doesn't it cause trouble?
//     Because `7'h7E` (`1111_110b`) is in the reserved I2C address range (`1111_XXX`), so no legal
//     7-bit I2C slave ever has Static Address `0x7E`! The I2C slave simply sees an address mismatch,
//     does not ACK on bit 9, and enters its idle-until-STOP state.
//
//  3. WHAT WHEN THE I3C CONTROLLER ACTUALLY WANTS TO TALK TO THIS LEGACY I2C SLAVE?
//     The Controller looks up the I2C device's Static Address and LVR in its table, switches SCL to
//     `LegacyI2CFastMode` (`tLOW = 1300 ns, tHIGH = 600 ns >= 50 ns`), keeps SDA in `OpenDrain` mode
//     for every single bit, and uses standard I2C 9th-bit ACK/NACK handshakes!
//
//  IMPORTANT REQUIREMENT FOR I2C SLAVES ON AN I3C BUS:
//     - The I2C Slave MUST NOT stretch the SCL clock (holding SCL low is forbidden because the I3C
//       Controller drives SCL with a Push-Pull output stage).
//     - The I2C Slave's 7-bit Static Address is reserved in the Controller's address pool so it is
//       never assigned as a Dynamic Address to any I3C Target.
//
// =====================================================================================================

using I3CEmulator.Physical;
using I3CEmulator.Protocol;

namespace I3CEmulator.Devices;

/// <summary>
/// Emulates a Legacy I2C Fast-Mode Slave (such as an EEPROM or legacy environmental sensor) connected
/// directly to an I3C bus. Includes an internal 256-byte register file, 50 ns SCL spike filter, and
/// complete bit-level Open-Drain I2C state machine.
/// </summary>
public sealed class I2CSlave : IBusDevice
{
    private enum State
    {
        IdleWaitingForStart,
        ReceivingAddressHeader,
        SendingAddressAck,
        ReceivingWriteByte,
        SendingWriteAck,
        SendingReadByte,
        ReceivingMasterReadAck,
        IgnoringUntilNextStartOrStop
    }

    private I3CBus? _bus;
    private State _state = State.IdleWaitingForStart;
    private int _bitIndex;
    private byte _shiftReg;
    private bool _isReadTransfer;
    private bool _registerPointerSetInFrame;

    /// <summary>Human-readable name of this Legacy I2C device.</summary>
    public string Name { get; }

    /// <summary>Fixed 7-bit I2C Static Address (configured by hardware pins/factory).</summary>
    public byte StaticAddress7Bit { get; }

    /// <summary>
    /// Legacy Virtual Register (LVR) describing this I2C device's capabilities to the I3C Controller.
    /// By default 0x00 = Has 50 ns spike filter (bit 4 = 0) and supports FM+ (bits 3:0 = 0).
    /// </summary>
    public byte Lvr { get; }

    /// <summary>True if the 50 ns analog spike filter on SCL is present (LVR[4] == 0).</summary>
    public bool Has50NsSpikeFilter => (Lvr & (1 << 4)) == 0;

    /// <summary>Internal 256-byte register/memory map accessible via standard I2C register reads/writes.</summary>
    public byte[] Registers { get; } = new byte[256];

    /// <summary>Current internal 8-bit register address pointer.</summary>
    public byte RegisterPointer { get; private set; }

    /// <summary>
    /// Diagnostic counter: how many high-speed I3C SCL clock pulses (`tHIGH &lt; 50 ns`) were blocked by
    /// this I2C device's 50 ns analog spike filter.
    /// </summary>
    public int FilteredOutI3CClockPulses { get; private set; }

    /// <summary>Diagnostic counter: how many I2C transactions addressed to this slave succeeded.</summary>
    public int CompletedI2CTransactions { get; private set; }

    public I2CSlave(string name, byte staticAddress7Bit, byte lvr = 0x00)
    {
        if (staticAddress7Bit > 0x7F || staticAddress7Bit == I3CAddresses.Broadcast)
            throw new ArgumentOutOfRangeException(nameof(staticAddress7Bit),
                "I2C 7-bit static address must be in 0x08..0x77 and cannot be 0x7E.");

        Name = name;
        StaticAddress7Bit = staticAddress7Bit;
        Lvr = lvr;
    }

    public LegacyI2CDeviceDescriptor GetDescriptor() =>
        new(Name, StaticAddress7Bit, Lvr);

    public void AttachToBus(I3CBus bus)
    {
        _bus = bus;
    }

    public void OnBusFreeTimeAdvanced(long continuousFreeTimeNs)
    {
        // Legacy I2C slaves NEVER initiate traffic on their own (no IBI, no Hot-Join).
        // If an I2C chip wants attention, it requires a separate physical INT# wire on the PCB!
    }

    public void OnStartCondition() => BeginHeaderReception();

    public void OnRepeatedStartCondition() => BeginHeaderReception();

    private void BeginHeaderReception()
    {
        _bus?.ReleaseSda(this);
        _state = State.ReceivingAddressHeader;
        _bitIndex = 0;
        _shiftReg = 0;
    }

    public void OnStopCondition()
    {
        _bus?.ReleaseSda(this);
        _state = State.IdleWaitingForStart;
        _bitIndex = 0;
        _shiftReg = 0;
        _registerPointerSetInFrame = false;
    }

    public void OnSclFallingEdge(SclClockProfile upcomingProfile)
    {
        if (_bus is null)
            return;

        // ---------------------------------------------------------------------------------------------
        //  50 ns SPIKE FILTER CHECK
        //  If this device has a 50 ns spike filter and the upcoming SCL pulse has tHIGH < 50 ns
        //  (i.e. 40 ns I3C Open-Drain or 40 ns I3C Push-Pull), the internal state machine does not
        //  clock and keeps SDA released (High-Z).
        // ---------------------------------------------------------------------------------------------
        if (Has50NsSpikeFilter && upcomingProfile.FilteredOutByI2CSpikeFilter)
        {
            _bus.ReleaseSda(this);
            return;
        }

        switch (_state)
        {
            case State.ReceivingAddressHeader:
            case State.ReceivingWriteByte:
            case State.ReceivingMasterReadAck:
            case State.IgnoringUntilNextStartOrStop:
            case State.IdleWaitingForStart:
                _bus.ReleaseSda(this);
                break;

            case State.SendingAddressAck:
            case State.SendingWriteAck:
                // Classic I2C ACK: pull SDA LOW (0) in Open-Drain mode on the 9th clock cycle!
                _bus.DriveSdaOpenDrain(this, false);
                break;

            case State.SendingReadByte:
                // Drive the next MSB bit of the current register byte in Open-Drain mode:
                //   bit = 1 -> NMOS OFF (High-Z, pulled up by Rp)
                //   bit = 0 -> NMOS ON  (pulls SDA low)
                bool bitToDrive = ((_shiftReg >> (7 - _bitIndex)) & 0x01) != 0;
                _bus.DriveSdaOpenDrain(this, bitToDrive);
                break;
        }
    }

    public void OnSclRisingEdge(SclClockProfile profile, bool resolvedSda)
    {
        if (_bus is null)
            return;

        // 50 ns spike filter suppresses narrow I3C clock pulses (< 50 ns)
        if (Has50NsSpikeFilter && profile.FilteredOutByI2CSpikeFilter)
        {
            FilteredOutI3CClockPulses++;
            return;
        }

        switch (_state)
        {
            case State.ReceivingAddressHeader:
                _shiftReg = (byte)((_shiftReg << 1) | (resolvedSda ? 1 : 0));
                _bitIndex++;
                if (_bitIndex == 8)
                {
                    var (addr7, isRead) = I3CAddresses.UnpackHeader(_shiftReg);
                    if (addr7 == StaticAddress7Bit)
                    {
                        _isReadTransfer = isRead;
                        _state = State.SendingAddressAck;
                    }
                    else
                    {
                        // Address does not match our StaticAddress7Bit (e.g., it was 0x7E or another
                        // device's address). Stay silent until the next START / Sr / STOP.
                        _state = State.IgnoringUntilNextStartOrStop;
                    }
                }
                break;

            case State.SendingAddressAck:
                // We just ACKed our 7-bit Static Address on the 9th clock cycle!
                _bus.ReleaseSda(this);
                CompletedI2CTransactions++;
                _bitIndex = 0;
                if (_isReadTransfer)
                {
                    _shiftReg = Registers[RegisterPointer++];
                    _state = State.SendingReadByte;
                }
                else
                {
                    _shiftReg = 0;
                    _state = State.ReceivingWriteByte;
                }
                break;

            case State.ReceivingWriteByte:
                _shiftReg = (byte)((_shiftReg << 1) | (resolvedSda ? 1 : 0));
                _bitIndex++;
                if (_bitIndex == 8)
                {
                    if (!_registerPointerSetInFrame)
                    {
                        RegisterPointer = _shiftReg;
                        _registerPointerSetInFrame = true;
                        _bus.Log($"    [{Name} (I2C 0x{StaticAddress7Bit:X2})] Set internal RegisterPointer = 0x{RegisterPointer:X2}");
                    }
                    else
                    {
                        byte targetReg = RegisterPointer++;
                        Registers[targetReg] = _shiftReg;
                        _bus.Log($"    [{Name} (I2C 0x{StaticAddress7Bit:X2})] Wrote Registers[0x{targetReg:X2}] = 0x{_shiftReg:X2}");
                    }
                    _state = State.SendingWriteAck;
                }
                break;

            case State.SendingWriteAck:
                // Ready to receive the next written byte in this frame
                _bus.ReleaseSda(this);
                _bitIndex = 0;
                _shiftReg = 0;
                _state = State.ReceivingWriteByte;
                break;

            case State.SendingReadByte:
                _bitIndex++;
                if (_bitIndex == 8)
                {
                    // After sending 8 read bits, release SDA on the 9th clock so Master can ACK(0) or NACK(1)
                    _state = State.ReceivingMasterReadAck;
                }
                break;

            case State.ReceivingMasterReadAck:
                // In I2C: Master drives 0 (ACK) to request another byte, or 1 (NACK) to end the read.
                if (!resolvedSda)
                {
                    // Master ACKed (0) -> load next register byte
                    _bitIndex = 0;
                    _shiftReg = Registers[RegisterPointer++];
                    _state = State.SendingReadByte;
                }
                else
                {
                    // Master NACKed (1) -> stop driving SDA, wait for Sr or P
                    _state = State.IgnoringUntilNextStartOrStop;
                }
                break;
        }
    }
}
