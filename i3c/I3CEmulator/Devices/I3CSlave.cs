// =====================================================================================================
//  Devices/I3CSlave.cs  -  Complete MIPI I3C Target (Slave) Hardware State Machine
// =====================================================================================================
//
//  WHAT THIS FILE DEMONSTRATES FROM THE TARGET (SLAVE) PERSPECTIVE:
//  ================================================================
//
//  1. INITIAL WAKE-UP & 50 ns SPIKE FILTER:
//     If an I3C Target also has a Legacy Static Address, it powers up with its 50 ns spike filter ON
//     (just in case it is plugged into a legacy I2C board). As soon as it sees `7'h7E` on the bus, it
//     knows an I3C Controller is in charge and permanently turns OFF its 50 ns filter so it can receive
//     12.5 MHz clocks.
//
//  2. WHEN & HOW THE SLAVE RECEIVES ITS DYNAMIC ADDRESS (SLAVE ID):
//     - Via `SETDASA (0x87)` if the Slave has a hardware Static Address, OR
//     - Via `ENTDAA (0x07)` where ALL unassigned Slaves shift out their 64-bit `PID + BCR + DCR` in
//       OPEN-DRAIN mode simultaneously:
//
//       ENTDAA 64-Bit Open-Drain Arbitration inside the Slave:
//       +-----------------------------------------------------------------------------------+
//       | For bit = 63 down to 0 of {PID[47:0], BCR[7:0], DCR[7:0]}:                        |
//       |   * On SCL Falling Edge: DriveSdaOpenDrain(myBit)                                 |
//       |   * On SCL Rising Edge : Sample resolvedSda on wire                               |
//       |       If (myBit == 1 && resolvedSda == 0):                                        |
//       |           -> Another slave with a '0' at this bit position beat us!               |
//       |           -> ReleaseSda() immediately, stop driving, and wait for the NEXT        |
//       |              Repeated START (Sr -> 7E/R) round to try again!                      |
//       +-----------------------------------------------------------------------------------+
//       If we survive all 64 bits without losing -> WE WON THIS ROUND!
//       We then read the 8-bit [NewDA(7b) | OddParity(1b)] from the Controller and drive ACK (0) in
//       Open-Drain on bit 9 (unless the parity bit was corrupted -> Error TE3 -> NACK!).
//
//  3. WHEN & HOW THE SLAVE ISSUES AN INTERRUPT (IBI) OR HOT-JOIN (HJ):
//     A Slave has NO dedicated INT# wire in I3C. Instead, it requests an interrupt IN-BAND on SDA:
//       (A) If the bus has been Free (SCL=1, SDA=1) for >= tAVAL (1 us) [or >= tIDLE (200 us) for HJ],
//           the Slave pulls SDA LOW in Open-Drain to create a START request!
//       (B) Or if the Controller generates a START (S) [NEVER on a Repeated START (Sr)!], the Slave
//           immediately arbitrates in the 8-bit Open-Drain Address Header by driving:
//             * `(DynamicAddress << 1) | 1`  (DA/R) for an In-Band Interrupt (IBI)
//             * `(0x02 << 1) | 0`            (02/W) for a Hot-Join request
//       - If the Slave wins all 8 header bits, it releases SDA on bit 9 and lets the CONTROLLER drive
//         ACK (0) or NACK (1) in Open-Drain!
//       - If the Controller ACKs (0) an IBI and our `BCR[2]` (IbiHasMandatoryDataByte) is 1, we switch
//         our SDA pad to PUSH-PULL (12.5 MHz) and transmit the Mandatory Data Byte (MDB) + optional
//         payload bytes, each followed by a T-bit (`T=1` = more bytes, `T=0` = last byte).
//       - If we lose header arbitration OR the Controller NACKs (1), we KEEP the interrupt pending!
//
// =====================================================================================================

using I3CEmulator.Physical;
using I3CEmulator.Protocol;

namespace I3CEmulator.Devices;

/// <summary>
/// Full bit-level state machine for a MIPI I3C Target (Slave) device.
/// </summary>
public sealed class I3CSlave : IBusDevice
{
    private enum Phase
    {
        Idle,

        // --- Address header right after S or Sr ---
        Header8Bits,
        HeaderAck9thBit,

        // --- Broadcast 7E/W -> CCC Command Byte (8 bits + Parity T-bit) ---
        CccCommandByte,
        CccBroadcastPayloadByte,

        // --- Direct CCC target selection after Sr (DA/W or DA/R) ---
        DirectCccWriteDataByte,
        DirectCccReadDataByte,

        // --- ENTDAA (0x07) Dynamic Address Assignment loop ---
        EntdaaArbitrating64Bits,
        EntdaaReceivingAssignedDa8Bits,
        EntdaaSendingDaAck9thBit,
        EntdaaWaitingForNextRoundSr,

        // --- Private SDR Write / Read ---
        PrivateWriteDataByte,
        PrivateReadDataByte,

        // --- In-Band Interrupt (IBI) or Hot-Join (HJ) after winning Header arbitration ---
        WaitingForControllerIbiOrHjAck9thBit,
        SendingIbiPayloadByte,

        // --- Unaddressed or after Parity Error (TE0/TE1/TE2) ---
        IgnoreUntilStartOrStop
    }

    private I3CBus? _bus;
    private Phase _phase = Phase.Idle;

    // Frame & bit-level tracking
    private bool _headerFollowsRepeatedStart;
    private int _bitIndex;
    private byte _shiftByte;
    private ulong _entdaaShift64;

    // Header arbitration state (when Slave drives IBI or Hot-Join during an S header)
    private bool _isArbitratingHeader;
    private bool _arbitratingForHotJoin;
    private byte _arbiterHeaderToDrive;

    // Active CCC state across Repeated STARTs within the same CCC frame
    private bool _inCccFrame;
    private CccCode _activeCcc;
    private readonly List<byte> _cccPayloadBuffer = new();
    private bool _addressedViaStaticAddress;
    private bool _currentHeaderIsRead;

    // Outgoing read queue (used for Direct CCC GETxxx, Private Read, and IBI Payload)
    private readonly Queue<byte> _txReadQueue = new();

    // Pending IBI & Hot-Join state
    private bool _hasPendingIbi;
    private byte _pendingIbiMdb;
    private byte[] _pendingIbiExtraBytes = Array.Empty<byte>();
    private bool _hasPendingHotJoin;

    /// <summary>Human-readable device name (e.g., "TempSensor-A", "IMU-Gyro").</summary>
    public string Name { get; }

    /// <summary>48-bit Provisional ID (PID), 8-bit BCR, and 8-bit DCR baked into this Target.</summary>
    public I3CDeviceIdentity Identity { get; }

    /// <summary>
    /// Optional 7-bit hardware Static Address (SA) if this Target supports SETDASA / SETAASA.
    /// Null if the Target is a pure I3C device that only supports ENTDAA.
    /// </summary>
    public byte? StaticAddress7Bit { get; }

    /// <summary>
    /// Currently assigned 7-bit Dynamic Address (Slave ID), or null if unassigned (power-up or after RSTDAA).
    /// </summary>
    public byte? DynamicAddress { get; private set; }

    /// <summary>
    /// True if the device is physically powered and connected to the bus.
    /// Can be set to false initially and later connected via <see cref="PlugInForHotJoin"/> to
    /// demonstrate Hot-Join!
    /// </summary>
    public bool IsConnectedToBus { get; private set; }

    /// <summary>
    /// True at power-up if the device has a Static Address (dual I2C/I3C startup). Automatically
    /// switches to false the instant the Target observes `7'h7E` on the bus!
    /// </summary>
    public bool IsI2CSpikeFilterEnabled { get; private set; }

    /// <summary>
    /// Which Target-initiated events (IBI, Controller-Role, Hot-Join) are currently enabled on this
    /// Target. Controlled by the Master via `ENEC` (Enable Events) and `DISEC` (Disable Events).
    /// Per MIPI I3C spec, Hot-Join is enabled by default for hot-joining devices; IBI can be enabled
    /// via ENEC.
    /// </summary>
    public TargetEventMask EnabledEvents { get; private set; } = TargetEventMask.HotJoin;

    /// <summary>Maximum Write Length configured via SETMWL (default 256).</summary>
    public ushort MaxWriteLength { get; private set; } = 256;

    /// <summary>Maximum Read Length configured via SETMRL (default 256).</summary>
    public ushort MaxReadLength { get; private set; } = 256;

    /// <summary>Internal 256-byte register/FIFO memory for Private SDR Writes and Reads.</summary>
    public byte[] Registers { get; } = new byte[256];

    /// <summary>Current internal register pointer for Private SDR Writes and Reads.</summary>
    public byte RegisterPointer { get; set; }

    private bool _registerPointerSetInPrivateWrite;

    /// <summary>True while this Target still has an unserviced In-Band Interrupt queued.</summary>
    public bool HasPendingIbi => _hasPendingIbi;

    /// <summary>True while this Target still has an unserviced Hot-Join request queued.</summary>
    public bool HasPendingHotJoin => _hasPendingHotJoin;

    /// <summary>Diagnostic counter of parity/protocol errors (TE0/TE1/TE2/TE3) detected by this Target.</summary>
    public int ParityOrProtocolErrorCount { get; private set; }

    /// <summary>Diagnostic counter of how many times this Target lost ENTDAA or IBI arbitration.</summary>
    public int ArbitrationLossCount { get; private set; }

    public I3CSlave(
        string name,
        I3CDeviceIdentity identity,
        byte? staticAddress7Bit = null,
        bool connectedAtPowerOn = true)
    {
        Name = name;
        Identity = identity;
        StaticAddress7Bit = staticAddress7Bit;
        IsConnectedToBus = connectedAtPowerOn;

        // A Target with a static I2C address starts with its 50ns spike filter enabled until first 7'h7E
        IsI2CSpikeFilterEnabled = staticAddress7Bit.HasValue;
    }

    public void AttachToBus(I3CBus bus)
    {
        _bus = bus;
    }

    // =================================================================================================
    //  EXTERNAL STIMULUS API: TRIGGERING AN IN-BAND INTERRUPT (IBI) OR HOT-JOIN (HJ)
    // =================================================================================================

    /// <summary>
    /// Simulates an internal sensor event (e.g., FIFO watermark reached, threshold crossed, button
    /// pressed) that wants to interrupt the Controller over the SDA wire.
    /// </summary>
    /// <param name="mandatoryDataByte">
    /// The Mandatory Data Byte (MDB) describing the interrupt group/cause (sent if BCR[2] == 1).
    /// </param>
    /// <param name="extraPayloadBytes">Optional extra payload bytes (e.g. sensor reading or timestamp).</param>
    public void QueueInBandInterrupt(byte mandatoryDataByte, params byte[] extraPayloadBytes)
    {
        if ((Identity.Bcr & BcrFlags.IbiRequestCapable) == 0)
            throw new InvalidOperationException($"Target '{Name}' does not have BCR.IbiRequestCapable set.");

        _hasPendingIbi = true;
        _pendingIbiMdb = mandatoryDataByte;
        _pendingIbiExtraBytes = extraPayloadBytes;

        _bus?.Log($"    [IRQ Event inside {Name}] Queued IBI request (MDB=0x{mandatoryDataByte:X2}, " +
                  $"ExtraBytes={extraPayloadBytes.Length}, DA={(DynamicAddress.HasValue ? $"0x{DynamicAddress:X2}" : "None")}, " +
                  $"IBI_Enabled={EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt)})");
    }

    /// <summary>
    /// Simulates hot-plugging (or powering up) this I3C Target onto an already running I3C bus!
    /// The Target waits for the bus to be Idle for tIDLE (200 us) or for a START header, then sends
    /// the reserved Hot-Join address `7'h02/W`.
    /// </summary>
    public void PlugInForHotJoin()
    {
        IsConnectedToBus = true;
        DynamicAddress = null;
        IsI2CSpikeFilterEnabled = false;
        _hasPendingHotJoin = true;
        EnabledEvents |= TargetEventMask.HotJoin;

        _bus?.Log($"    [HOT-PLUG {Name}] Device powered on and connected to bus! Queued Hot-Join request (7'h02/W).");
    }

    /// <summary>
    /// Returns true if this Target is currently eligible and ready to arbitrate for an In-Band Interrupt.
    /// </summary>
    private bool CanArbitrateForIbiNow =>
        IsConnectedToBus &&
        _hasPendingIbi &&
        DynamicAddress.HasValue &&
        Identity.Bcr.HasFlag(BcrFlags.IbiRequestCapable) &&
        EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt);

    /// <summary>
    /// Returns true if this Target is currently eligible and ready to arbitrate for a Hot-Join request.
    /// </summary>
    private bool CanArbitrateForHotJoinNow =>
        IsConnectedToBus &&
        _hasPendingHotJoin &&
        !DynamicAddress.HasValue &&
        EnabledEvents.HasFlag(TargetEventMask.HotJoin);

    // =================================================================================================
    //  BUS IDLE / AVAILABLE TIMER CALLBACK (Target-Initiated START when Bus is Free!)
    // =================================================================================================

    public void OnBusFreeTimeAdvanced(long continuousFreeTimeNs)
    {
        if (_bus is null || !IsConnectedToBus)
            return;

        // 1. Hot-Join requires the bus to be continuously Idle for >= tIDLE (200,000 ns = 200 us)
        if (CanArbitrateForHotJoinNow && continuousFreeTimeNs >= Timing.BusIdleNs)
        {
            if (!_bus.IsTargetPullingSdaLowForStart)
            {
                _bus.Log($"    [{Name}] Bus has been IDLE for {continuousFreeTimeNs:N0} ns (>= tIDLE 200us) -> Pulling SDA LOW (OD:0) to request Hot-Join START!");
            }
            _bus.DriveSdaOpenDrain(this, false);
            return;
        }

        // 2. In-Band Interrupt (IBI) requires the bus to be continuously Available for >= tAVAL (1,000 ns = 1 us)
        if (CanArbitrateForIbiNow && continuousFreeTimeNs >= Timing.BusAvailableNs)
        {
            if (!_bus.IsTargetPullingSdaLowForStart)
            {
                _bus.Log($"    [{Name} (DA=0x{DynamicAddress:X2})] Bus Available for {continuousFreeTimeNs:N0} ns (>= tAVAL 1us) -> Pulling SDA LOW (OD:0) to request IBI START!");
            }
            _bus.DriveSdaOpenDrain(this, false);
        }
    }

    // =================================================================================================
    //  FRAMING CALLBACKS: START (S), REPEATED START (Sr), AND STOP (P)
    // =================================================================================================

    public void OnStartCondition()
    {
        if (!IsConnectedToBus)
            return;

        _inCccFrame = false;
        _headerFollowsRepeatedStart = false;
        _registerPointerSetInPrivateWrite = false;
        PrepareForAddressHeader(allowTargetArbitration: true);
    }

    public void OnRepeatedStartCondition()
    {
        if (!IsConnectedToBus)
            return;

        _headerFollowsRepeatedStart = true;
        _registerPointerSetInPrivateWrite = false;

        // CRITICAL I3C SPEC RULE:
        // Targets are NEVER allowed to initiate IBI or Hot-Join arbitration on a Repeated START (Sr)!
        // That is why allowTargetArbitration is false here, and why the Controller can drive the
        // address header after Sr in Push-Pull mode!
        PrepareForAddressHeader(allowTargetArbitration: false);
    }

    public void OnStopCondition()
    {
        _bus?.ReleaseSda(this);
        _phase = Phase.Idle;
        _inCccFrame = false;
        _headerFollowsRepeatedStart = false;
        _isArbitratingHeader = false;
        _registerPointerSetInPrivateWrite = false;
        _txReadQueue.Clear();
    }

    private void PrepareForAddressHeader(bool allowTargetArbitration)
    {
        _phase = Phase.Header8Bits;
        _bitIndex = 0;
        _shiftByte = 0;
        _addressedViaStaticAddress = false;
        _isArbitratingHeader = false;
        _arbitratingForHotJoin = false;

        if (allowTargetArbitration)
        {
            if (CanArbitrateForHotJoinNow)
            {
                // Compete in Open-Drain with 7'h02 + Write (0) = 0x04
                _isArbitratingHeader = true;
                _arbitratingForHotJoin = true;
                _arbiterHeaderToDrive = I3CAddresses.PackHeader(I3CAddresses.HotJoin, isRead: false);
            }
            else if (CanArbitrateForIbiNow)
            {
                // Compete in Open-Drain with DynamicAddress + Read (1)
                _isArbitratingHeader = true;
                _arbitratingForHotJoin = false;
                _arbiterHeaderToDrive = I3CAddresses.PackHeader(DynamicAddress!.Value, isRead: true);
            }
        }
    }

    // =================================================================================================
    //  SCL FALLING EDGE: TARGET SETS ITS SDA DRIVER (OPEN-DRAIN, PUSH-PULL, OR HIGH-Z)
    // =================================================================================================

    public void OnSclFallingEdge(SclClockProfile upcomingProfile)
    {
        if (_bus is null || !IsConnectedToBus)
            return;

        // If this Target still has its startup 50ns I2C spike filter active, ignore narrow pulses (<50ns)
        if (IsI2CSpikeFilterEnabled && upcomingProfile.FilteredOutByI2CSpikeFilter)
        {
            _bus.ReleaseSda(this);
            return;
        }

        switch (_phase)
        {
            case Phase.Header8Bits:
                if (_isArbitratingHeader)
                {
                    // Drive our IBI (DA/R) or Hot-Join (02/W) header bit MSB-first in OPEN-DRAIN!
                    bool myHeaderBit = ((_arbiterHeaderToDrive >> (7 - _bitIndex)) & 0x01) != 0;
                    _bus.DriveSdaOpenDrain(this, myHeaderBit);
                }
                else
                {
                    _bus.ReleaseSda(this);
                }
                break;

            case Phase.HeaderAck9thBit:
                // Address ACK is ALWAYS driven in Open-Drain (pulls SDA low = 0).
                // Note: During ENTDAA (`Sr -> 7E/R`), ALL unassigned targets ACK in Open-Drain together!
                _bus.DriveSdaOpenDrain(this, false);
                break;

            case Phase.WaitingForControllerIbiOrHjAck9thBit:
                // When WE won the header arbitration for an IBI or Hot-Join, the CONTROLLER drives the
                // 9th ACK/NACK bit! So we MUST release SDA (High-Z) and listen on bit 9!
                _bus.ReleaseSda(this);
                break;

            case Phase.EntdaaArbitrating64Bits:
                // -------------------------------------------------------------------------------------
                //  ENTDAA 64-BIT OPEN-DRAIN ARBITRATION (MSB bit 63 down to LSB bit 0)
                //  Every participating unassigned Target drives its next bit of {PID, BCR, DCR} in
                //  Open-Drain mode.
                // -------------------------------------------------------------------------------------
                bool myIdBit = ((_entdaaShift64 >> (63 - _bitIndex)) & 0x01UL) != 0;
                _bus.DriveSdaOpenDrain(this, myIdBit);
                break;

            case Phase.EntdaaSendingDaAck9thBit:
                // We won the 64-bit ENTDAA round and verified Odd Parity on the 7-bit Dynamic Address!
                // Drive ACK (0) in Open-Drain to confirm we accepted the new Dynamic Address.
                _bus.DriveSdaOpenDrain(this, false);
                break;

            case Phase.DirectCccReadDataByte:
            case Phase.PrivateReadDataByte:
            case Phase.SendingIbiPayloadByte:
                // -------------------------------------------------------------------------------------
                //  PUSH-PULL READ DATA + 9TH T-BIT (12.5 MHz SDR)
                //  Because this Target is the ONLY device transmitting during a Read or IBI payload,
                //  it drives SDA in fast PUSH-PULL mode!
                // -------------------------------------------------------------------------------------
                if (_bitIndex < 8)
                {
                    bool dataBit = ((_shiftByte >> (7 - _bitIndex)) & 0x01) != 0;
                    _bus.DriveSdaPushPull(this, dataBit);
                }
                else
                {
                    // 9th bit = Read T-bit!
                    //   T = 1 if we have MORE bytes left in _txReadQueue (and haven't hit MaxReadLength)
                    //   T = 0 if this was our LAST byte (End-Of-Data)
                    bool hasMoreBytes = _txReadQueue.Count > 0;
                    _bus.DriveSdaPushPull(this, hasMoreBytes);
                }
                break;

            default:
                // In all receive / ignore states, keep SDA in High-Z
                _bus.ReleaseSda(this);
                break;
        }
    }

    // =================================================================================================
    //  SCL RISING EDGE: TARGET SAMPLES SDA, CHECKS ARBITRATION, AND UPDATES PROTOCOL STATE
    // =================================================================================================

    public void OnSclRisingEdge(SclClockProfile profile, bool resolvedSda)
    {
        if (_bus is null || !IsConnectedToBus)
            return;

        if (IsI2CSpikeFilterEnabled && profile.FilteredOutByI2CSpikeFilter)
            return;

        switch (_phase)
        {
            case Phase.Header8Bits:
                HandleHeaderBitRisingEdge(resolvedSda);
                break;

            case Phase.HeaderAck9thBit:
                HandleHeaderAckCompleted();
                break;

            case Phase.WaitingForControllerIbiOrHjAck9thBit:
                HandleControllerIbiOrHjAckRisingEdge(resolvedSda);
                break;

            case Phase.CccCommandByte:
                HandleCccCommandBitRisingEdge(resolvedSda);
                break;

            case Phase.CccBroadcastPayloadByte:
                HandleCccBroadcastPayloadBitRisingEdge(resolvedSda);
                break;

            case Phase.DirectCccWriteDataByte:
                HandleDirectCccWriteBitRisingEdge(resolvedSda);
                break;

            case Phase.EntdaaArbitrating64Bits:
                HandleEntdaaArbitrationBitRisingEdge(resolvedSda);
                break;

            case Phase.EntdaaReceivingAssignedDa8Bits:
                HandleEntdaaAssignedDaBitRisingEdge(resolvedSda);
                break;

            case Phase.EntdaaSendingDaAck9thBit:
                // We just finished ACKing our newly assigned Dynamic Address!
                _bus.ReleaseSda(this);
                // Wait quietly for the remaining ENTDAA rounds (for other slaves) until STOP.
                _phase = Phase.EntdaaWaitingForNextRoundSr;
                break;

            case Phase.PrivateWriteDataByte:
                HandlePrivateWriteBitRisingEdge(resolvedSda);
                break;

            case Phase.DirectCccReadDataByte:
            case Phase.PrivateReadDataByte:
            case Phase.SendingIbiPayloadByte:
                HandleReadOrIbiPayloadBitRisingEdge(resolvedSda);
                break;
        }
    }

    // -------------------------------------------------------------------------------------------------
    //  1. ADDRESS HEADER RECEPTION & IBI / HOT-JOIN ARBITRATION
    // -------------------------------------------------------------------------------------------------

    private void HandleHeaderBitRisingEdge(bool resolvedSda)
    {
        // If we were driving our IBI (DA/R) or Hot-Join (02/W) header in Open-Drain, check if we lost!
        if (_isArbitratingHeader)
        {
            bool myBit = ((_arbiterHeaderToDrive >> (7 - _bitIndex)) & 0x01) != 0;
            if (myBit && !resolvedSda)
            {
                // We drove '1' (High-Z) in Open-Drain, but the wire is '0'!
                // Another device with a lower address (higher priority) beat us on this bit!
                _isArbitratingHeader = false;
                ArbitrationLossCount++;
                _bus!.ReleaseSda(this);
                _bus.Log($"    [{Name}] Lost Header Arbitration at bit {7 - _bitIndex} (drove '1', saw '0' on SDA). Keeping interrupt pending!");
            }
        }

        _shiftByte = (byte)((_shiftByte << 1) | (resolvedSda ? 1 : 0));
        _bitIndex++;

        if (_bitIndex < 8)
            return;

        // All 8 bits of the Address Header have been clocked!
        var (addr7, isRead) = I3CAddresses.UnpackHeader(_shiftByte);

        // Did WE win the header arbitration for an IBI or Hot-Join?
        if (_isArbitratingHeader && _shiftByte == _arbiterHeaderToDrive)
        {
            _phase = Phase.WaitingForControllerIbiOrHjAck9thBit;
            return;
        }

        // Check for Error TE0: Single-bit-flip neighbor of 0x7E
        if (I3CAddresses.IsSingleBitErrorOf7E(addr7))
        {
            _lastHeaderWasBroadcast7E = false;
            ParityOrProtocolErrorCount++;
            _bus!.Log($"    [{Name}] ERROR TE0: Invalid address 0x{addr7:X2} (1-bit flip from 0x7E)! NACKing and ignoring frame.");
            _phase = Phase.IgnoreUntilStartOrStop;
            return;
        }

        // Case A: Broadcast Address 7'h7E
        if (addr7 == I3CAddresses.Broadcast)
        {
            _lastHeaderWasBroadcast7E = true;
            // Seeing 7'h7E for the first time permanently disables our initial 50ns I2C spike filter!
            if (IsI2CSpikeFilterEnabled)
            {
                IsI2CSpikeFilterEnabled = false;
                _bus!.Log($"    [{Name}] Detected first 7'h7E Broadcast -> Disabled 50 ns I2C spike filter (entered full I3C mode).");
            }

            if (!isRead)
            {
                // 7'h7E/W: Every connected I3C Target ACKs 7'h7E/W in Open-Drain!
                _currentHeaderIsRead = false;
                _phase = Phase.HeaderAck9thBit;
            }
            else if (_inCccFrame && _activeCcc == CccCode.ENTDAA)
            {
                // Sr -> 7'h7E/R during ENTDAA:
                // ONLY I3C Targets that do NOT yet have a Dynamic Address ACK 7'h7E/R and join the
                // 64-bit PID+BCR+DCR arbitration!
                if (!DynamicAddress.HasValue)
                {
                    _currentHeaderIsRead = true;
                    _phase = Phase.HeaderAck9thBit;
                }
                else
                {
                    _phase = Phase.EntdaaWaitingForNextRoundSr;
                }
            }
            else
            {
                _phase = Phase.IgnoreUntilStartOrStop;
            }
            return;
        }

        // Case B: Direct CCC target header after Sr (e.g. SETDASA uses StaticAddress, others use DynamicAddress)
        if (_inCccFrame && _activeCcc.IsDirect() && _headerFollowsRepeatedStart)
        {
            _lastHeaderWasBroadcast7E = false;
            if (_activeCcc == CccCode.SETDASA)
            {
                // SETDASA addresses the Target by its 7-bit STATIC Address (only if it doesn't have a DA yet)!
                if (!isRead && !DynamicAddress.HasValue && StaticAddress7Bit.HasValue && addr7 == StaticAddress7Bit.Value)
                {
                    _addressedViaStaticAddress = true;
                    _currentHeaderIsRead = false;
                    _phase = Phase.HeaderAck9thBit;
                    return;
                }
            }
            else if (DynamicAddress.HasValue && addr7 == DynamicAddress.Value)
            {
                _currentHeaderIsRead = isRead;
                _phase = Phase.HeaderAck9thBit;
                return;
            }

            _phase = Phase.IgnoreUntilStartOrStop;
            return;
        }

        // Case C: Private SDR Read/Write to our assigned Dynamic Address
        if (DynamicAddress.HasValue && addr7 == DynamicAddress.Value)
        {
            _lastHeaderWasBroadcast7E = false;
            // Note: If a frame started with `S -> 7E/W -> ACK -> Sr -> DA/RW`, `_inCccFrame` was never
            // set because no CCC byte was sent between `7E/W` and `Sr`!
            _inCccFrame = false;
            _currentHeaderIsRead = isRead;
            _phase = Phase.HeaderAck9thBit;
            return;
        }

        _phase = Phase.IgnoreUntilStartOrStop;
    }

    private void HandleHeaderAckCompleted()
    {
        _bus?.ReleaseSda(this);
        _bitIndex = 0;
        _shiftByte = 0;

        var (addr7, _) = I3CAddresses.UnpackHeader(_shiftByte);
        // Wait: _shiftByte was reset to 0 above! Let's check what state we transition to based on flags:
        if (_inCccFrame && _activeCcc == CccCode.ENTDAA && _currentHeaderIsRead)
        {
            // We just ACKed `Sr -> 7E/R` inside ENTDAA!
            // Load our 64-bit {PID[47:0], BCR[7:0], DCR[7:0]} word and enter 64-bit Open-Drain arbitration!
            _entdaaShift64 = Identity.ToEntdaa64BitWord();
            _bitIndex = 0;
            _phase = Phase.EntdaaArbitrating64Bits;
            return;
        }

        if (_inCccFrame && _activeCcc.IsDirect() && _headerFollowsRepeatedStart)
        {
            _cccPayloadBuffer.Clear();
            if (_currentHeaderIsRead)
            {
                PrepareDirectCccReadResponse();
                LoadNextReadByteIntoShiftRegister();
                _phase = Phase.DirectCccReadDataByte;
            }
            else
            {
                _phase = Phase.DirectCccWriteDataByte;
            }
            return;
        }

        // If we were addressed via 7'h7E/W, the next byte (if no Sr occurs immediately) will be a CCC command byte!
        if (!_currentHeaderIsRead && !_headerFollowsRepeatedStart && !DynamicAddress.HasValue)
        {
            _phase = Phase.CccCommandByte;
            return;
        }

        // Wait: what if we HAVE a DynamicAddress and the header was 7'h7E/W?
        // How do we distinguish `7'h7E/W` from `DynamicAddress/W`? Let's track `_lastHeaderAddr7`!
        if (_lastHeaderWasBroadcast7E)
        {
            _phase = Phase.CccCommandByte;
            return;
        }

        // Otherwise this is a Private SDR Read or Write to our DynamicAddress!
        if (_currentHeaderIsRead)
        {
            PreparePrivateReadResponse();
            LoadNextReadByteIntoShiftRegister();
            _phase = Phase.PrivateReadDataByte;
        }
        else
        {
            _phase = Phase.PrivateWriteDataByte;
        }
    }

    private bool _lastHeaderWasBroadcast7E;

    // Let's make sure _lastHeaderWasBroadcast7E is set in HandleHeaderBitRisingEdge!
    // Wait: let's check how HandleHeaderBitRisingEdge sets _lastHeaderWasBroadcast7E. Let's refine it cleanly.

    // -------------------------------------------------------------------------------------------------
    //  2. CONTROLLER ACK/NACK OF OUR IBI OR HOT-JOIN REQUEST
    // -------------------------------------------------------------------------------------------------

    private void HandleControllerIbiOrHjAckRisingEdge(bool resolvedSda)
    {
        bool controllerAcked = !resolvedSda; // ACK = 0, NACK = 1

        if (_arbitratingForHotJoin)
        {
            if (controllerAcked)
            {
                _hasPendingHotJoin = false;
                _bus!.Log($"    [{Name}] Controller ACKed our Hot-Join (7'h02/W)! Waiting for Controller to run ENTDAA.");
            }
            else
            {
                _bus!.Log($"    [{Name}] Controller NACKed our Hot-Join (7'h02/W). Keeping Hot-Join request pending.");
            }
            _phase = Phase.IgnoreUntilStartOrStop;
            return;
        }

        // In-Band Interrupt (IBI) ACK/NACK from Controller:
        if (controllerAcked)
        {
            _hasPendingIbi = false;
            if (Identity.Bcr.HasFlag(BcrFlags.IbiHasMandatoryDataByte))
            {
                _txReadQueue.Clear();
                _txReadQueue.Enqueue(_pendingIbiMdb);
                foreach (byte b in _pendingIbiExtraBytes)
                    _txReadQueue.Enqueue(b);

                LoadNextReadByteIntoShiftRegister();
                _phase = Phase.SendingIbiPayloadByte;
            }
            else
            {
                _phase = Phase.IgnoreUntilStartOrStop;
            }
        }
        else
        {
            // Controller NACKed our IBI! Keep _hasPendingIbi = true so we retry (unless DISEC follows!).
            _bus!.Log($"    [{Name} (DA=0x{DynamicAddress:X2})] Controller NACKed our IBI! Keeping _hasPendingIbi=true.");
            _phase = Phase.IgnoreUntilStartOrStop;
        }
    }

    // -------------------------------------------------------------------------------------------------
    //  3. CCC COMMAND & PAYLOAD HANDLING (WITH T-BIT ODD PARITY CHECK: ERROR TE1 / TE2)
    // -------------------------------------------------------------------------------------------------

    private void HandleCccCommandBitRisingEdge(bool resolvedSda)
    {
        if (_bitIndex < 8)
        {
            _shiftByte = (byte)((_shiftByte << 1) | (resolvedSda ? 1 : 0));
            _bitIndex++;
            return;
        }

        // 9th bit = Odd-Parity T-bit driven by Controller in Push-Pull!
        bool parityOk = Parity.VerifyOddParityTBit(_shiftByte, resolvedSda);
        _bitIndex = 0;

        if (!parityOk)
        {
            ParityOrProtocolErrorCount++;
            _bus!.Log($"    [{Name}] ERROR TE1: Odd-Parity mismatch on CCC byte 0x{_shiftByte:X2} (T={resolvedSda})! Ignoring frame.");
            _phase = Phase.IgnoreUntilStartOrStop;
            return;
        }

        _inCccFrame = true;
        _activeCcc = (CccCode)_shiftByte;
        _cccPayloadBuffer.Clear();

        // Execute zero-payload Broadcast CCCs immediately:
        switch (_activeCcc)
        {
            case CccCode.RSTDAA_Broadcast:
                if (DynamicAddress.HasValue)
                {
                    _bus!.Log($"    [{Name}] Executed Broadcast RSTDAA: Cleared DynamicAddress (was 0x{DynamicAddress:X2}) -> null");
                    DynamicAddress = null;
                }
                _phase = Phase.IgnoreUntilStartOrStop;
                break;

            case CccCode.SETAASA:
                if (!DynamicAddress.HasValue && StaticAddress7Bit.HasValue)
                {
                    DynamicAddress = StaticAddress7Bit.Value;
                    _bus!.Log($"    [{Name}] Executed Broadcast SETAASA: Promoted StaticAddress 0x{StaticAddress7Bit:X2} -> DynamicAddress!");
                }
                _phase = Phase.IgnoreUntilStartOrStop;
                break;

            case CccCode.ENTDAA:
                // Wait for Controller to issue `Sr -> 7E/R` to begin 64-bit Open-Drain PID arbitration!
                _phase = Phase.EntdaaWaitingForNextRoundSr;
                break;

            default:
                if (_activeCcc.IsDirect())
                {
                    // Direct CCCs wait for `Sr -> TargetDA/RW`
                    _phase = Phase.IgnoreUntilStartOrStop;
                }
                else
                {
                    // Broadcast CCC with payload bytes (e.g. ENEC, DISEC, SETMWL, SETMRL)
                    _phase = Phase.CccBroadcastPayloadByte;
                }
                break;
        }
    }

    private void HandleCccBroadcastPayloadBitRisingEdge(bool resolvedSda)
    {
        if (_bitIndex < 8)
        {
            _shiftByte = (byte)((_shiftByte << 1) | (resolvedSda ? 1 : 0));
            _bitIndex++;
            return;
        }

        // 9th bit = Odd-Parity T-bit
        bool parityOk = Parity.VerifyOddParityTBit(_shiftByte, resolvedSda);
        _bitIndex = 0;

        if (!parityOk)
        {
            ParityOrProtocolErrorCount++;
            _bus!.Log($"    [{Name}] ERROR TE2: Odd-Parity mismatch on Broadcast CCC data 0x{_shiftByte:X2}!");
            _phase = Phase.IgnoreUntilStartOrStop;
            return;
        }

        _cccPayloadBuffer.Add(_shiftByte);
        ExecuteBroadcastCccPayloadIfComplete();
        _shiftByte = 0;
    }

    private void ExecuteBroadcastCccPayloadIfComplete()
    {
        switch (_activeCcc)
        {
            case CccCode.ENEC_Broadcast when _cccPayloadBuffer.Count == 1:
                var enMask = (TargetEventMask)_cccPayloadBuffer[0];
                EnabledEvents |= enMask;
                _bus!.Log($"    [{Name}] Broadcast ENEC(0x{_cccPayloadBuffer[0]:X2}): EnabledEvents is now [{EnabledEvents}]");
                break;

            case CccCode.DISEC_Broadcast when _cccPayloadBuffer.Count == 1:
                var disMask = (TargetEventMask)_cccPayloadBuffer[0];
                EnabledEvents &= ~disMask;
                _bus!.Log($"    [{Name}] Broadcast DISEC(0x{_cccPayloadBuffer[0]:X2}): EnabledEvents is now [{EnabledEvents}]");
                break;

            case CccCode.SETMWL_Broadcast when _cccPayloadBuffer.Count == 2:
                MaxWriteLength = (ushort)((_cccPayloadBuffer[0] << 8) | _cccPayloadBuffer[1]);
                break;

            case CccCode.SETMRL_Broadcast when _cccPayloadBuffer.Count == 2:
                MaxReadLength = (ushort)((_cccPayloadBuffer[0] << 8) | _cccPayloadBuffer[1]);
                break;
        }
    }

    private void HandleDirectCccWriteBitRisingEdge(bool resolvedSda)
    {
        if (_bitIndex < 8)
        {
            _shiftByte = (byte)((_shiftByte << 1) | (resolvedSda ? 1 : 0));
            _bitIndex++;
            return;
        }

        // 9th bit = Odd-Parity T-bit
        bool parityOk = Parity.VerifyOddParityTBit(_shiftByte, resolvedSda);
        _bitIndex = 0;

        if (!parityOk)
        {
            ParityOrProtocolErrorCount++;
            _bus!.Log($"    [{Name}] ERROR TE2: Odd-Parity mismatch on Direct CCC write byte 0x{_shiftByte:X2}!");
            _phase = Phase.IgnoreUntilStartOrStop;
            return;
        }

        _cccPayloadBuffer.Add(_shiftByte);
        ExecuteDirectCccWriteIfComplete();
        _shiftByte = 0;
    }

    private void ExecuteDirectCccWriteIfComplete()
    {
        switch (_activeCcc)
        {
            case CccCode.SETDASA when _cccPayloadBuffer.Count == 1 && _addressedViaStaticAddress:
                // In SETDASA, the 7-bit new Dynamic Address is in bits [7:1] of the payload byte
                byte newDaFromSa = (byte)(_cccPayloadBuffer[0] >> 1);
                DynamicAddress = newDaFromSa;
                _bus!.Log($"    [{Name}] Direct SETDASA complete: Static 0x{StaticAddress7Bit:X2} -> DynamicAddress = 0x{DynamicAddress:X2}!");
                break;

            case CccCode.SETNEWDA when _cccPayloadBuffer.Count == 1:
                byte oldDa = DynamicAddress!.Value;
                byte updatedDa = (byte)(_cccPayloadBuffer[0] >> 1);
                DynamicAddress = updatedDa;
                _bus!.Log($"    [{Name}] Direct SETNEWDA complete: Changed DynamicAddress 0x{oldDa:X2} -> 0x{DynamicAddress:X2}!");
                break;

            case CccCode.ENEC_Direct when _cccPayloadBuffer.Count == 1:
                var enMask = (TargetEventMask)_cccPayloadBuffer[0];
                EnabledEvents |= enMask;
                _bus!.Log($"    [{Name} (DA=0x{DynamicAddress:X2})] Direct ENEC(0x{_cccPayloadBuffer[0]:X2}): EnabledEvents = [{EnabledEvents}]");
                break;

            case CccCode.DISEC_Direct when _cccPayloadBuffer.Count == 1:
                var disMask = (TargetEventMask)_cccPayloadBuffer[0];
                EnabledEvents &= ~disMask;
                _bus!.Log($"    [{Name} (DA=0x{DynamicAddress:X2})] Direct DISEC(0x{_cccPayloadBuffer[0]:X2}): EnabledEvents = [{EnabledEvents}]");
                break;

            case CccCode.RSTDAA_Direct:
                DynamicAddress = null;
                break;

            case CccCode.SETMWL_Direct when _cccPayloadBuffer.Count == 2:
                MaxWriteLength = (ushort)((_cccPayloadBuffer[0] << 8) | _cccPayloadBuffer[1]);
                break;

            case CccCode.SETMRL_Direct when _cccPayloadBuffer.Count == 2:
                MaxReadLength = (ushort)((_cccPayloadBuffer[0] << 8) | _cccPayloadBuffer[1]);
                break;
        }
    }

    private void PrepareDirectCccReadResponse()
    {
        _txReadQueue.Clear();
        switch (_activeCcc)
        {
            case CccCode.GETPID:
                foreach (byte b in Identity.GetPidBytesBigEndian())
                    _txReadQueue.Enqueue(b);
                break;

            case CccCode.GETBCR:
                _txReadQueue.Enqueue((byte)Identity.Bcr);
                break;

            case CccCode.GETDCR:
                _txReadQueue.Enqueue(Identity.Dcr);
                break;

            case CccCode.GETMWL:
                _txReadQueue.Enqueue((byte)(MaxWriteLength >> 8));
                _txReadQueue.Enqueue((byte)(MaxWriteLength & 0xFF));
                break;

            case CccCode.GETMRL:
                _txReadQueue.Enqueue((byte)(MaxReadLength >> 8));
                _txReadQueue.Enqueue((byte)(MaxReadLength & 0xFF));
                break;

            case CccCode.GETSTATUS:
                // Bit [3:0] of MSB: Pending interrupt number (1 if _hasPendingIbi else 0)
                // Bit [5]   of LSB: Protocol error occurred since last GETSTATUS
                byte msb = (byte)(_hasPendingIbi ? 0x01 : 0x00);
                byte lsb = (byte)(ParityOrProtocolErrorCount > 0 ? (1 << 5) : 0x00);
                _txReadQueue.Enqueue(msb);
                _txReadQueue.Enqueue(lsb);
                break;
        }
    }

    // -------------------------------------------------------------------------------------------------
    //  4. ENTDAA 64-BIT OPEN-DRAIN ARBITRATION & DYNAMIC ADDRESS PARITY CHECK (ERROR TE3)
    // -------------------------------------------------------------------------------------------------

    private void HandleEntdaaArbitrationBitRisingEdge(bool resolvedSda)
    {
        bool myBit = ((_entdaaShift64 >> (63 - _bitIndex)) & 0x01UL) != 0;

        // Open-Drain Wired-AND Arbitration Check:
        // If we tried to send '1' (High-Z) and the wire is '0', another unassigned Target has a smaller
        // 64-bit {PID, BCR, DCR} at this bit position!
        if (myBit && !resolvedSda)
        {
            ArbitrationLossCount++;
            _bus!.ReleaseSda(this);
            string fieldLostIn = _bitIndex switch
            {
                < 48 => $"PID bit {47 - _bitIndex}",
                < 56 => $"BCR bit {55 - _bitIndex}",
                _ => $"DCR bit {63 - _bitIndex}"
            };
            _bus.Log($"    [{Name}] Lost ENTDAA arbitration at bit #{_bitIndex}/63 ({fieldLostIn}): " +
                     $"drove OD:1, saw 0 on SDA -> Dropping out until next Sr -> 7E/R round.");
            _phase = Phase.EntdaaWaitingForNextRoundSr;
            return;
        }

        _bitIndex++;
        if (_bitIndex == 64)
        {
            // We survived all 64 bits of Open-Drain arbitration! We are the SOLE WINNER of this ENTDAA round!
            _bus!.ReleaseSda(this);
            _bitIndex = 0;
            _shiftByte = 0;
            _phase = Phase.EntdaaReceivingAssignedDa8Bits;
        }
    }

    private void HandleEntdaaAssignedDaBitRisingEdge(bool resolvedSda)
    {
        _shiftByte = (byte)((_shiftByte << 1) | (resolvedSda ? 1 : 0));
        _bitIndex++;

        if (_bitIndex < 8)
            return;

        // All 8 bits of [DA[6:0] | OddParity] have been clocked by the Controller.
        // Verify the Odd Parity bit (Error TE3 check) BEFORE we ACK on the 9th bit!
        var (assignedDa, isParityValid) = Parity.UnpackAndVerifyEntdaaAddress(_shiftByte);

        if (!isParityValid || !I3CAddresses.IsValidDynamicAddress(assignedDa))
        {
            ParityOrProtocolErrorCount++;
            _bus!.Log($"    [{Name}] ERROR TE3 during ENTDAA: Received invalid Dynamic Address byte 0x{_shiftByte:X2} " +
                      $"(DA=0x{assignedDa:X2}, ParityValid={isParityValid}) -> NACKing on bit 9!");
            _phase = Phase.EntdaaWaitingForNextRoundSr;
            return;
        }

        DynamicAddress = assignedDa;
        _bus!.Log($"    [{Name}] Won ENTDAA round & verified Odd Parity -> Assigned DynamicAddress = 0x{DynamicAddress:X2}! Driving ACK(0) on bit 9.");
        _phase = Phase.EntdaaSendingDaAck9thBit;
    }

    // -------------------------------------------------------------------------------------------------
    //  5. PRIVATE SDR WRITE & READ TRANSFERS (12.5 MHz PUSH-PULL WITH T-BIT)
    // -------------------------------------------------------------------------------------------------

    private void HandlePrivateWriteBitRisingEdge(bool resolvedSda)
    {
        if (_bitIndex < 8)
        {
            _shiftByte = (byte)((_shiftByte << 1) | (resolvedSda ? 1 : 0));
            _bitIndex++;
            return;
        }

        // 9th bit = Odd-Parity T-bit driven by Controller in Push-Pull!
        bool parityOk = Parity.VerifyOddParityTBit(_shiftByte, resolvedSda);
        _bitIndex = 0;

        if (!parityOk)
        {
            ParityOrProtocolErrorCount++;
            _bus!.Log($"    [{Name} (DA=0x{DynamicAddress:X2})] ERROR TE2: Odd-Parity mismatch on Private Write byte 0x{_shiftByte:X2} (T={resolvedSda})! Dropping byte & ignoring rest of write.");
            _phase = Phase.IgnoreUntilStartOrStop;
            return;
        }

        if (!_registerPointerSetInPrivateWrite)
        {
            RegisterPointer = _shiftByte;
            _registerPointerSetInPrivateWrite = true;
            _bus!.Log($"    [{Name} (DA=0x{DynamicAddress:X2})] Set RegisterPointer = 0x{RegisterPointer:X2} (Parity T={resolvedSda} OK)");
        }
        else
        {
            byte reg = RegisterPointer++;
            Registers[reg] = _shiftByte;
            _bus!.Log($"    [{Name} (DA=0x{DynamicAddress:X2})] Wrote Registers[0x{reg:X2}] = 0x{_shiftByte:X2} (Parity T={resolvedSda} OK)");
        }

        _shiftByte = 0;
    }

    private void PreparePrivateReadResponse()
    {
        _txReadQueue.Clear();
        int count = Math.Min((int)MaxReadLength, 16);
        for (int i = 0; i < count; i++)
        {
            byte addr = (byte)(RegisterPointer + i);
            _txReadQueue.Enqueue(Registers[addr]);
        }
    }

    private void LoadNextReadByteIntoShiftRegister()
    {
        _bitIndex = 0;
        _shiftByte = _txReadQueue.Count > 0 ? _txReadQueue.Dequeue() : (byte)0x00;
    }

    private void HandleReadOrIbiPayloadBitRisingEdge(bool resolvedSda)
    {
        if (_bitIndex < 8)
        {
            if (_phase == Phase.PrivateReadDataByte && _bitIndex == 7)
            {
                RegisterPointer++;
            }
            _bitIndex++;
            return;
        }

        // 9th bit = Read T-bit!
        // Release SDA after the T-bit is sampled so Master can issue Sr, P, or abort without contention
        _bus!.ReleaseSda(this);

        // If we had more bytes (_txReadQueue.Count > 0), we drove T = 1; otherwise we drove T = 0.
        if (_txReadQueue.Count > 0 && resolvedSda)
        {
            LoadNextReadByteIntoShiftRegister();
        }
        else
        {
            // Either we reached our last byte (T = 0) or the Controller aborted the read!
            _phase = Phase.IgnoreUntilStartOrStop;
        }
    }
}
