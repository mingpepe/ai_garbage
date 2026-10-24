// =====================================================================================================
//  Devices/I3CMaster.Bits.cs  -  Controller (Master) Low-Level Bit-Banging, Clocking, & Arbitration
// =====================================================================================================
//
//  HOW THE I3C CONTROLLER CONTROLS SCL AND SDA AT THE PHYSICAL LAYER
//  =================================================================
//
//  In I2C, both SCL and SDA are open-drain lines. A slave can hold SCL low ("clock stretching") to
//  pause the master while doing an internal calculation or ADC conversion.
//
//  In I3C:
//    1. The Controller is the ONLY device that drives SCL, and it drives SCL in PUSH-PULL 100% of the
//       time. Slaves are physically forbidden from holding SCL low!
//    2. The Controller switches SDA between OPEN-DRAIN and PUSH-PULL depending on the current bit:
//
//       +-----------------------+---------------------+-------------------+---------------------------+
//       | Field / Bit           | SDA Driver          | SCL Timing        | Reason                    |
//       +-----------------------+---------------------+-------------------+---------------------------+
//       | START condition (S)   | Controller (or IBI) | Bus Available/Idle| Falling edge on SDA       |
//       | Address Header (8b)   | Open-Drain          | I3C-OD (tLOW=200ns| Allows Target IBI / HJ to |
//       |   (right after S)     |                     |         tHIGH=40ns| arbitrate simultaneously! |
//       | Address Header (8b)   | PUSH-PULL           | 12.5 MHz SDR      | Targets cannot arbitrate  |
//       |   (after Repeated Sr) |                     | (40ns/40ns)       | after Sr -> Controller PP |
//       | Address ACK/NACK (9th)| Target drives OD    | I3C-OD (tLOW=200ns| Target pulls low for ACK, |
//       |                       |                     |         tHIGH=40ns| leaves High-Z for NACK   |
//       | Write Data / CCC (8b) | Controller Push-Pull| 12.5 MHz SDR      | Max speed, single driver  |
//       | Write T-bit (9th)     | Controller Push-Pull| 12.5 MHz SDR      | Odd Parity from Controller|
//       | Read Data (8b)        | Target Push-Pull    | 12.5 MHz SDR      | Max speed from Target     |
//       | Read T-bit (9th)      | Target Push-Pull    | 12.5 MHz SDR      | T=1: more, T=0: last byte |
//       | Repeated START (Sr)   | Controller          | 12.5 MHz          | SDA edge while SCL=1      |
//       | STOP condition (P)    | Controller          | Returns to Free   | SDA rising while SCL=1    |
//       | Legacy I2C bits       | Open-Drain          | I2C Fast-Mode     | tHIGH=600ns passes 50ns   |
//       |                       |                     | (400 kHz)         | spike filter of I2C slave |
//       +-----------------------+---------------------+-------------------+---------------------------+
//
//  HOW HEADER ARBITRATION IS DETECTED AND RESOLVED:
//  ================================================
//
//  ASCII TIMING DIAGRAM OF OPEN-DRAIN ARBITRATION DURING THE FIRST ADDRESS HEADER:
//
//          Bit 7 (MSB)          Bit 6                Bit 5 (Target wins!)
//  SCL :   __/\________         __/\________         __/\________
//  Ctrl:   Drives '1' (Hi-Z)    Drives '1' (Hi-Z)    Drives '1' (Hi-Z, wants to send 7'h7E = 1111110b)
//  Tgt :   Drives '1' (Hi-Z)    Drives '1' (Hi-Z)    Drives '0' (NMOS ON, sending DA=0x0A = 0001010b)
//          ------------------   ------------------   -------------------------------------------------
//  Wire:   SDA = 1 (Rp pulls)   SDA = 1 (Rp pulls)   SDA = 0 (Target pulls to GND!)
//                                                    ^
//                                                    Controller samples SDA=0 at SCL rising edge!
//                                                    "I drove '1', but SDA is '0' -> I LOST ARBITRATION!"
//                                                    Controller releases SDA pad, continues clocking SCL,
//                                                    and reads the rest of the winner's header!
//
// =====================================================================================================

using I3CEmulator.Physical;
using I3CEmulator.Protocol;

namespace I3CEmulator.Devices;

/// <summary>
/// Result of transmitting an 8-bit Address Header + 9th ACK/NACK bit on the I3C bus.
/// </summary>
public sealed record HeaderResult(
    byte RequestedHeaderByte,
    byte WinningHeaderByte,
    bool MasterLostArbitration,
    bool AckReceived,
    string Description);

/// <summary>
/// Emulates an active MIPI I3C Controller (Master), driving SCL in Push-Pull and managing SDA
/// across Open-Drain and Push-Pull modes for I3C CCCs, DAA, IBIs, and legacy I2C transfers.
/// </summary>
public sealed partial class I3CMaster : IBusDevice
{
    private I3CBus? _bus;
    private bool _isFirstBroadcast = true;
    private byte _nextDynamicAddressToAssign = 0x08;

    /// <summary>Human-readable name of the Controller.</summary>
    public string Name { get; } = "I3C-MainController";

    /// <summary>Device Address Table (DAT) mapping assigned Dynamic Addresses to Target identity and capabilities.</summary>
    public Dictionary<byte, I3CDeviceIdentity> TargetTable { get; } = new();

    /// <summary>Static table of known Legacy I2C Slaves attached to the bus.</summary>
    public List<LegacyI2CDeviceDescriptor> LegacyI2CTable { get; } = new();

    /// <summary>When true, Master will NACK an incoming IBI (used to demonstrate NACK + DISEC handling!).</summary>
    public bool RejectNextIbiWithNack { get; set; }

    /// <summary>Event raised whenever an In-Band Interrupt is received and accepted by the Controller.</summary>
    public event Action<byte, byte, byte[]>? OnInBandInterruptReceived;

    /// <summary>Event raised whenever a Hot-Join request (7'h02/W) is accepted by the Controller.</summary>
    public event Action? OnHotJoinDetected;

    public void AttachToBus(I3CBus bus)
    {
        _bus = bus;
    }

    public void OnBusFreeTimeAdvanced(long continuousFreeTimeNs) { }
    public void OnStartCondition() { }
    public void OnRepeatedStartCondition() { }
    public void OnStopCondition() { }
    public void OnSclFallingEdge(SclClockProfile upcomingProfile) { }
    public void OnSclRisingEdge(SclClockProfile profile, bool resolvedSda) { }

    // =================================================================================================
    //  FRAMING GENERATION: START, REPEATED START, STOP
    // =================================================================================================

    /// <summary>
    /// Generates a START condition (S) on the bus.
    /// If an I3C Target was already pulling SDA LOW (Target-initiated START for IBI or Hot-Join),
    /// the Master recognizes the request and starts clocking the frame.
    /// </summary>
    public void SendStart(string reason = "Controller initiated")
    {
        EnsureBusAttached();
        if (_bus!.IsTargetPullingSdaLowForStart)
        {
            _bus.BroadcastStart(this, $"Recognized Target-initiated START ({reason})");
        }
        else
        {
            _bus.BroadcastStart(this, reason);
        }
    }

    /// <summary>
    /// Generates a Repeated START condition (Sr).
    /// In I3C, NO target is allowed to arbitrate after an Sr. Thus, any Address Header immediately
    /// following Sr can be driven in fast PUSH-PULL mode by the Controller!
    /// </summary>
    public void SendRepeatedStart()
    {
        EnsureBusAttached();
        _bus!.BroadcastRepeatedStart(this);
    }

    /// <summary>
    /// Generates a STOP condition (P), releasing the bus to the Free state.
    /// </summary>
    public void SendStop()
    {
        EnsureBusAttached();
        _bus!.BroadcastStop(this);
    }

    // =================================================================================================
    //  ADDRESS HEADER TRANSMISSION & ARBITRATION (OPEN-DRAIN VS PUSH-PULL)
    // =================================================================================================

    /// <summary>
    /// Transmits an 8-bit Address Header (7-bit address + R/W bit) and clocks the 9th ACK/NACK bit.
    ///
    /// HOW THE ELECTRICAL MODE AND ARBITRATION ARE HANDLED:
    /// ---------------------------------------------------
    /// 1. If <paramref name="isAfterRepeatedStart"/> is FALSE (Header immediately after START 'S'):
    ///    - Driven in OPEN-DRAIN mode.
    ///    - Targets with an enabled pending IBI or Hot-Join compete simultaneously on SDA!
    ///    - Bit-by-bit: Controller sets its SDA pad to OD. On each SCL rising edge, if Controller
    ///      drove '1' (High-Z) but samples '0', Controller immediately knows it LOST ARBITRATION.
    ///    - If Controller loses arbitration:
    ///        * If winner header is `DA/R` -> An I3C Target is requesting an In-Band Interrupt (IBI)!
    ///        * If winner header is `7'h02/W` -> An unassigned Target is requesting Hot-Join!
    ///        * On the 9th bit, the CONTROLLER drives ACK (0) or NACK (1) in Open-Drain!
    /// 2. If <paramref name="isAfterRepeatedStart"/> is TRUE (Header immediately after Repeated START 'Sr'):
    ///    - Driven in fast PUSH-PULL mode at 12.5 MHz!
    ///    - Targets are forbidden from arbitrating after Sr, so no collision is possible.
    ///    - On the 9th bit, Controller releases SDA and samples the addressed Target's Open-Drain ACK.
    /// </summary>
    public HeaderResult SendAddressHeader(byte address7Bit, bool isRead, bool isAfterRepeatedStart)
    {
        EnsureBusAttached();
        byte requestedHeader = I3CAddresses.PackHeader(address7Bit, isRead);

        if (isAfterRepeatedStart)
        {
            // -----------------------------------------------------------------------------------------
            //  AFTER REPEATED START (Sr): PUSH-PULL MODE (12.5 MHz SDR)
            //  Zero risk of arbitration collision -> Controller drives all 8 bits in Push-Pull!
            // -----------------------------------------------------------------------------------------
            var ppProfile = Timing.I3CPushPull;

            for (int bit = 7; bit >= 0; bit--)
            {
                _bus!.ClockFallingEdge(ppProfile);
                bool b = ((requestedHeader >> bit) & 0x01) != 0;
                _bus.DriveSdaPushPull(this, b);
                _bus.ClockRisingEdge(ppProfile);
            }

            // 9th bit: Target ACKs in Open-Drain -> Controller releases SDA and clocks SCL
            _bus!.ReleaseSda(this);
            var odProfile = Timing.I3COpenDrain;
            _bus.ClockFallingEdge(odProfile);
            bool ackSampled = _bus.ClockRisingEdge(odProfile);
            bool ackReceived = !ackSampled; // 0 = ACK, 1 = NACK

            _bus.Log($"  [Header after Sr (Push-Pull)] Sent {I3CAddresses.FormatHeader(requestedHeader)} -> {(ackReceived ? "ACK(0)" : "NACK(1)")}");
            return new HeaderResult(requestedHeader, requestedHeader, MasterLostArbitration: false, ackReceived, "Push-Pull header after Sr");
        }

        // ---------------------------------------------------------------------------------------------
        //  AFTER START (S): OPEN-DRAIN MODE WITH ARBITRATION DETECTION
        // ---------------------------------------------------------------------------------------------
        var profile = _isFirstBroadcast && address7Bit == I3CAddresses.Broadcast
            ? Timing.FirstBroadcastOpenDrain
            : Timing.I3COpenDrain;

        if (_isFirstBroadcast && address7Bit == I3CAddresses.Broadcast)
        {
            _isFirstBroadcast = false; // Initial slow wake-up broadcast completed
        }

        bool masterLostArbitration = false;
        byte winningHeader = 0;

        for (int bit = 7; bit >= 0; bit--)
        {
            _bus!.ClockFallingEdge(profile);
            bool myBit = ((requestedHeader >> bit) & 0x01) != 0;

            if (!masterLostArbitration)
            {
                _bus.DriveSdaOpenDrain(this, myBit);
            }
            else
            {
                _bus.ReleaseSda(this);
            }

            bool wireBit = _bus.ClockRisingEdge(profile);
            winningHeader = (byte)((winningHeader << 1) | (wireBit ? 1 : 0));

            // Check Wired-AND arbitration loss on SCL rising edge
            if (!masterLostArbitration && myBit && !wireBit)
            {
                masterLostArbitration = true;
                _bus.ReleaseSda(this);
                _bus.Log($"  [ARBITRATION LOSS] Controller drove bit {bit}='1', but SDA wire resolved to '0'!");
            }
        }

        // 9th bit: Address ACK / NACK
        bool finalAck;
        _bus!.ClockFallingEdge(profile);

        if (masterLostArbitration)
        {
            // The Controller LOST arbitration to an incoming IBI (DA/R) or Hot-Join (7'h02/W)!
            // Therefore, THE CONTROLLER MUST DRIVE THE 9th ACK/NACK BIT in Open-Drain!
            bool controllerAck = !RejectNextIbiWithNack;
            if (RejectNextIbiWithNack)
            {
                RejectNextIbiWithNack = false;
                _bus.Log("  [Master Decision] Intentionally driving NACK(1) to reject Target interrupt request!");
                _bus.ReleaseSda(this); // NACK = 1 (let Rp pull SDA high)
            }
            else
            {
                _bus.DriveSdaOpenDrain(this, false); // ACK = 0 (NMOS pulls SDA to GND)
            }

            bool ackWire = _bus.ClockRisingEdge(profile);
            _bus.ReleaseSda(this);
            finalAck = !ackWire;

            _bus.Log($"  [Header after S (Open-Drain)] Target won arbitration with {I3CAddresses.FormatHeader(winningHeader)}! Controller drove {(finalAck ? "ACK(0)" : "NACK(1)")}");
            return new HeaderResult(requestedHeader, winningHeader, MasterLostArbitration: true, finalAck, "Target won arbitration in Open-Drain header");
        }
        else
        {
            // Controller won arbitration (or no target arbitrated). The addressed Target drives ACK/NACK.
            _bus.ReleaseSda(this);
            bool ackSampled = _bus.ClockRisingEdge(profile);
            finalAck = !ackSampled;

            _bus.Log($"  [Header after S (Open-Drain)] Controller won: {I3CAddresses.FormatHeader(requestedHeader)} -> Target {(finalAck ? "ACK(0)" : "NACK(1)")}");
            return new HeaderResult(requestedHeader, winningHeader, MasterLostArbitration: false, finalAck, "Controller won Open-Drain header");
        }
    }

    // =================================================================================================
    //  BYTE TRANSMISSION & RECEPTION WITH T-BIT (12.5 MHz PUSH-PULL SDR)
    // =================================================================================================

    /// <summary>
    /// Writes one 8-bit byte (CCC code or Write data) in PUSH-PULL mode, followed by the 9th T-bit
    /// containing the Odd Parity bit.
    /// </summary>
    public void WriteByteWithOddParityTBit(byte data, SclClockProfile? profile = null)
    {
        EnsureBusAttached();
        profile ??= Timing.I3CPushPull;

        // Drive 8 data bits in Push-Pull MSB-first
        for (int bit = 7; bit >= 0; bit--)
        {
            _bus!.ClockFallingEdge(profile);
            bool b = ((data >> bit) & 0x01) != 0;
            _bus.DriveSdaPushPull(this, b);
            _bus.ClockRisingEdge(profile);
        }

        // 9th bit = Odd Parity T-bit
        _bus!.ClockFallingEdge(profile);
        bool tBit = Parity.ComputeOddParityTBit(data);
        _bus.DriveSdaPushPull(this, tBit);
        _bus.ClockRisingEdge(profile);

        _bus.Log($"    [PP Write] 0x{data:X2} (Bits: {Convert.ToString(data, 2).PadLeft(8, '0')}) + Odd Parity T-Bit={tBit}");
    }

    /// <summary>
    /// Reads one 8-bit byte from an I3C Target in PUSH-PULL mode, followed by reading the 9th T-bit
    /// from the Target (T=1: more data available, T=0: last byte).
    /// </summary>
    public (byte Data, bool TargetHasMoreData) ReadByteWithTBit(SclClockProfile? profile = null, bool abortNow = false)
    {
        EnsureBusAttached();
        profile ??= Timing.I3CPushPull;

        // Release SDA so the Target can drive in Push-Pull
        _bus!.ReleaseSda(this);

        byte data = 0;
        for (int bit = 7; bit >= 0; bit--)
        {
            _bus.ClockFallingEdge(profile);
            bool wireBit = _bus.ClockRisingEdge(profile);
            data = (byte)((data << 1) | (wireBit ? 1 : 0));
        }

        // 9th bit = Read T-bit driven by Target
        _bus.ClockFallingEdge(profile);
        bool tBitSampled = _bus.ClockRisingEdge(profile);

        // If Controller Abort requested while Target has more data (T=1):
        if (abortNow && tBitSampled)
        {
            _bus.Log($"    [PP Read] 0x{data:X2} (T={tBitSampled}) -> CONTROLLER ABORT (Master requested end of read)");
            return (data, false);
        }

        _bus.Log($"    [PP Read] 0x{data:X2} (T={tBitSampled} -> {(tBitSampled ? "Target has more bytes" : "End-Of-Data")})");
        return (data, tBitSampled);
    }

    // =================================================================================================
    //  LEGACY I2C BYTE-LEVEL OPERATIONS (OPEN-DRAIN, 400 kHz, 9th BIT ACK/NACK)
    // =================================================================================================

    /// <summary>
    /// Transmits an 8-bit byte to a Legacy I2C Slave in OPEN-DRAIN mode and samples the slave's 9th-bit ACK.
    /// </summary>
    public bool I2CWriteByte(byte data)
    {
        EnsureBusAttached();
        var profile = Timing.LegacyI2CFastMode;

        for (int bit = 7; bit >= 0; bit--)
        {
            _bus!.ClockFallingEdge(profile);
            bool b = ((data >> bit) & 0x01) != 0;
            _bus.DriveSdaOpenDrain(this, b);
            _bus.ClockRisingEdge(profile);
        }

        // 9th bit: Release SDA so I2C slave can drive ACK (0) in Open-Drain
        _bus!.ReleaseSda(this);
        _bus.ClockFallingEdge(profile);
        bool ackWire = _bus.ClockRisingEdge(profile);
        bool ackReceived = !ackWire;

        _bus.Log($"    [I2C-FM Write] 0x{data:X2} -> Slave {(ackReceived ? "ACK(0)" : "NACK(1)")}");
        return ackReceived;
    }

    /// <summary>
    /// Reads an 8-bit byte from a Legacy I2C Slave in OPEN-DRAIN mode and drives the 9th-bit ACK or NACK.
    /// </summary>
    public byte I2CReadByte(bool ackToSlave)
    {
        EnsureBusAttached();
        var profile = Timing.LegacyI2CFastMode;

        // Release SDA so I2C slave drives the data byte
        _bus!.ReleaseSda(this);
        byte data = 0;
        for (int bit = 7; bit >= 0; bit--)
        {
            _bus.ClockFallingEdge(profile);
            bool wireBit = _bus.ClockRisingEdge(profile);
            data = (byte)((data << 1) | (wireBit ? 1 : 0));
        }

        // 9th bit: Controller drives ACK (0) to request more bytes, or NACK (1) to end the read
        _bus.DriveSdaOpenDrain(this, !ackToSlave);
        _bus.ClockFallingEdge(profile);
        _bus.ClockRisingEdge(profile);
        _bus.ReleaseSda(this);

        _bus.Log($"    [I2C-FM Read] 0x{data:X2} -> Controller drove {(ackToSlave ? "ACK(0)" : "NACK(1)")}");
        return data;
    }

    private void EnsureBusAttached()
    {
        if (_bus is null)
            throw new InvalidOperationException("I3CMaster must be attached to an I3CBus before generating bus traffic.");
    }
}
