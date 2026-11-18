using I3CEmulator.Physical;
using I3CEmulator.Protocol;

namespace I3CEmulator.Simulation;

public enum PacketCategory
{
    Idle,
    Framing,
    AddressOpenDrain,
    AddressPushPull,
    Ack,
    Nack,
    CccCommand,
    WriteDataPushPull,
    ReadDataPushPull,
    EntdaaArbitration64,
    DynamicAddressAssign,
    InBandInterrupt,
    HotJoin,
    LegacyI2C,
    Error
}

/// <summary>
/// High-level protocol span decoded from physical <see cref="BusSample"/> edges, suitable for
/// Logic Analyzer swimlanes and packet tables.
/// </summary>
public sealed record DecodedPacket(
    int Id,
    int StartSampleIndex,
    int EndSampleIndex,
    long StartTimeNs,
    long EndTimeNs,
    PacketCategory Category,
    string ShortLabel,
    string Summary,
    string Details,
    string InitiatorOrDriver,
    DriveMode ElectricalMode,
    bool IsI2CMode,
    int ChapterIndex);

/// <summary>
/// Stateful, incremental MIPI I3C SDR &amp; Legacy I2C protocol decoder operating directly on the
/// captured physical <see cref="BusSample"/> stream.
/// </summary>
public sealed class I3CProtocolDecoder
{
    private enum DecoderState
    {
        Idle,
        Header8Bits,
        HeaderAck9thBit,
        CccOrDataAfter7EW,
        BroadcastCccPayload,
        EntdaaArbitrating64,
        EntdaaAssignDa8Bits,
        EntdaaAssignDaAck9thBit,
        PrivateWriteData,
        PrivateReadData,
        IbiPayloadData,
        IgnoreUntilFraming
    }

    private readonly List<DecodedPacket> _packets = new();

    private DecoderState _state = DecoderState.Idle;
    private bool _afterRepeatedStart;
    private bool _inCccFrame;
    private bool _inEntdaaLoop;
    private CccCode _activeCcc;
    private bool _currentTransferIsRead;
    private bool _currentFrameIsI2C;
    private bool _isIbiFrame;

    // Bit accumulator for current byte or 64-bit word
    private int _bitCount;
    private ulong _accumBits;
    private int _fieldStartSample = -1;
    private long _fieldStartTimeNs;
    private DriveMode _fieldMode = DriveMode.OpenDrain;
    private bool _anyTargetDroveHeader;
    private string _headerWinningTargetName = string.Empty;
    private readonly HashSet<string> _activeDriversInField = new();
    private readonly List<string> _arbitrationLosersInField = new();

    public IReadOnlyList<DecodedPacket> Packets => _packets;

    public void Reset()
    {
        _packets.Clear();
        ResetFrameState();
    }

    private void ResetFrameState()
    {
        _state = DecoderState.Idle;
        _afterRepeatedStart = false;
        _inCccFrame = false;
        _inEntdaaLoop = false;
        _activeCcc = default;
        _currentTransferIsRead = false;
        _currentFrameIsI2C = false;
        _isIbiFrame = false;
        ResetFieldAccumulator();
    }

    private void ResetFieldAccumulator()
    {
        _bitCount = 0;
        _accumBits = 0;
        _fieldStartSample = -1;
        _fieldStartTimeNs = 0;
        _fieldMode = DriveMode.OpenDrain;
        _anyTargetDroveHeader = false;
        _headerWinningTargetName = string.Empty;
        _activeDriversInField.Clear();
        _arbitrationLosersInField.Clear();
    }

    public DecodedPacket[] GetPacketsSnapshot() => _packets.ToArray();

    public void ProcessSample(BusSample sample)
    {
        switch (sample.Kind)
        {
            case BusSampleKind.IdleGap:
                if (sample.DurationNs >= Timing.BusAvailableNs)
                {
                    string idleKind = sample.DurationNs >= Timing.BusIdleNs
                        ? $"Bus IDLE ({sample.DurationNs:N0} ns >= tIDLE 200us)"
                        : $"Bus Available ({sample.DurationNs:N0} ns >= tAVAL 1us)";
                    EmitPacket(
                        sample.Index, sample.Index,
                        sample.StartTimeNs, sample.EndTimeNs,
                        PacketCategory.Idle,
                        sample.DurationNs >= Timing.BusIdleNs ? "tIDLE" : "tAVAL",
                        idleKind,
                        "SCL=1, SDA=1 idle period allowing Target IBI or Hot-Join START requests.",
                        "Bus Pull-Up Rp",
                        DriveMode.HighZ,
                        false,
                        sample.ChapterIndex);
                }
                break;

            case BusSampleKind.StartCondition:
                ResetFrameState();
                _state = DecoderState.Header8Bits;
                _afterRepeatedStart = false;
                bool targetInitiated = sample.Devices.Any(d =>
                    d.DeviceName != "I3C-MainController" &&
                    d.PadMode == DriveMode.OpenDrain && !d.PadLevel);
                string initiator = targetInitiated
                    ? string.Join(", ", sample.Devices.Where(d => d.PadMode == DriveMode.OpenDrain && !d.PadLevel).Select(d => d.DeviceName))
                    : "I3C-MainController";

                EmitPacket(
                    sample.Index, sample.Index,
                    sample.StartTimeNs, sample.EndTimeNs,
                    targetInitiated ? PacketCategory.InBandInterrupt : PacketCategory.Framing,
                    targetInitiated ? "T-S" : "S",
                    targetInitiated ? $"Target START Request ({initiator})" : "START (S)",
                    sample.Annotation ?? "SDA 1->0 while SCL=1",
                    initiator,
                    DriveMode.OpenDrain,
                    false,
                    sample.ChapterIndex);
                break;

            case BusSampleKind.RepeatedStartCondition:
                ResetFieldAccumulator();
                _state = DecoderState.Header8Bits;
                _afterRepeatedStart = true;
                _isIbiFrame = false;
                EmitPacket(
                    sample.Index, sample.Index,
                    sample.StartTimeNs, sample.EndTimeNs,
                    PacketCategory.Framing,
                    "Sr",
                    "Repeated START (Sr)",
                    "Targets cannot arbitrate after Sr -> next header may use 12.5 MHz Push-Pull.",
                    "I3C-MainController",
                    DriveMode.OpenDrain,
                    false,
                    sample.ChapterIndex);
                break;

            case BusSampleKind.StopCondition:
                EmitPacket(
                    sample.Index, sample.Index,
                    sample.StartTimeNs, sample.EndTimeNs,
                    PacketCategory.Framing,
                    "P",
                    "STOP (P)",
                    "SDA 0->1 while SCL=1; frame ended and bus returns to Free.",
                    "I3C-MainController",
                    DriveMode.OpenDrain,
                    _currentFrameIsI2C,
                    sample.ChapterIndex);
                ResetFrameState();
                break;

            case BusSampleKind.SclLowPhase:
                if (_state != DecoderState.Idle && _state != DecoderState.IgnoreUntilFraming && _fieldStartSample < 0)
                {
                    _fieldStartSample = sample.Index;
                    _fieldStartTimeNs = sample.StartTimeNs;
                    _fieldMode = sample.ResolvedBusMode;
                }
                if (sample.ResolvedBusMode == DriveMode.PushPull)
                    _fieldMode = DriveMode.PushPull;
                TrackActiveDrivers(sample);
                break;

            case BusSampleKind.SclHighPhase:
                if (_state == DecoderState.Idle || _state == DecoderState.IgnoreUntilFraming)
                    return;

                if (_fieldStartSample < 0)
                {
                    _fieldStartSample = sample.Index;
                    _fieldStartTimeNs = sample.StartTimeNs;
                    _fieldMode = sample.ResolvedBusMode;
                }
                if (sample.ResolvedBusMode == DriveMode.PushPull)
                    _fieldMode = DriveMode.PushPull;

                TrackActiveDrivers(sample);
                ProcessRisingEdgeBit(sample);
                break;
        }
    }

    private void TrackActiveDrivers(BusSample sample)
    {
        foreach (var d in sample.Devices)
        {
            if (d.PadMode == DriveMode.PushPull || (d.PadMode == DriveMode.OpenDrain && !d.PadLevel))
            {
                _activeDriversInField.Add(d.DeviceName);
                if (_state == DecoderState.Header8Bits && d.DeviceName != "I3C-MainController")
                {
                    _anyTargetDroveHeader = true;
                    _headerWinningTargetName = d.DeviceName;
                }
            }

            if (d.LostArbitrationOnEdge)
            {
                _arbitrationLosersInField.Add($"{d.DeviceName}@bit{_bitCount}");
            }
        }
    }

    private void ProcessRisingEdgeBit(BusSample sample)
    {
        bool bit = sample.Sda;
        bool isI2c = sample.Profile == Timing.LegacyI2CFastMode;
        if (isI2c)
            _currentFrameIsI2C = true;

        switch (_state)
        {
            case DecoderState.Header8Bits:
                _accumBits = (_accumBits << 1) | (bit ? 1UL : 0UL);
                _bitCount++;
                if (_bitCount == 8)
                {
                    byte header = (byte)_accumBits;
                    var (addr7, isRead) = I3CAddresses.UnpackHeader(header);
                    _currentTransferIsRead = isRead;

                    PacketCategory cat;
                    string shortLbl;
                    string summary;

                    if (isI2c)
                    {
                        cat = PacketCategory.LegacyI2C;
                        shortLbl = $"I2C 0x{addr7:X2}/{(isRead ? "R" : "W")}";
                        summary = $"Legacy I2C Address 0x{addr7:X2}/{(isRead ? "R" : "W")}";
                    }
                    else if (_anyTargetDroveHeader && addr7 == I3CAddresses.HotJoin && !isRead)
                    {
                        _isIbiFrame = true;
                        cat = PacketCategory.HotJoin;
                        shortLbl = "HJ 7'h02/W";
                        summary = $"Hot-Join Request 7'h02/W from {_headerWinningTargetName}";
                    }
                    else if (_anyTargetDroveHeader && isRead)
                    {
                        _isIbiFrame = true;
                        cat = PacketCategory.InBandInterrupt;
                        shortLbl = $"IBI 0x{addr7:X2}/R";
                        summary = $"In-Band Interrupt Header 0x{addr7:X2}/R ({_headerWinningTargetName})";
                    }
                    else
                    {
                        bool isEntdaaPoll = _inEntdaaLoop && addr7 == I3CAddresses.Broadcast && isRead;
                        bool isHeaderPushPull = _afterRepeatedStart && !isEntdaaPoll;
                        cat = isHeaderPushPull ? PacketCategory.AddressPushPull : PacketCategory.AddressOpenDrain;
                        shortLbl = addr7 == I3CAddresses.Broadcast
                            ? $"7'h7E/{(isRead ? "R" : "W")}"
                            : $"0x{addr7:X2}/{(isRead ? "R" : "W")}";
                        summary = addr7 == I3CAddresses.Broadcast
                            ? $"Broadcast Header 7'h7E/{(isRead ? "R" : "W")}"
                            : $"Address Header 0x{addr7:X2}/{(isRead ? "R" : "W")}";
                    }

                    bool isEntdaaPollHeader = _inEntdaaLoop && addr7 == I3CAddresses.Broadcast && isRead;
                    bool headerIsPushPull = _afterRepeatedStart && !isEntdaaPollHeader && !_anyTargetDroveHeader && !isI2c;
                    string arbNote = _arbitrationLosersInField.Count > 0
                        ? $" | Lost Arb: {string.Join(", ", _arbitrationLosersInField)}"
                        : string.Empty;
                    string drivers = _activeDriversInField.Count > 0
                        ? string.Join(", ", _activeDriversInField)
                        : "I3C-MainController";

                    EmitPacket(
                        _fieldStartSample, sample.Index,
                        _fieldStartTimeNs, sample.EndTimeNs,
                        cat,
                        shortLbl,
                        summary + arbNote,
                        $"Mode={(headerIsPushPull ? "Push-Pull" : "Open-Drain")}, Header=0x{header:X2}{arbNote}",
                        drivers,
                        _fieldMode,
                        isI2c,
                        sample.ChapterIndex);

                    ResetFieldAccumulator();
                    _state = DecoderState.HeaderAck9thBit;
                    _lastHeaderAddr7 = addr7;
                }
                break;

            case DecoderState.HeaderAck9thBit:
                bool ack = !bit;
                string ackDriver = _isIbiFrame
                    ? "I3C-MainController"
                    : (_activeDriversInField.Count > 0 ? string.Join(", ", _activeDriversInField) : "Target / Rp");

                EmitPacket(
                    _fieldStartSample, sample.Index,
                    _fieldStartTimeNs, sample.EndTimeNs,
                    ack ? PacketCategory.Ack : PacketCategory.Nack,
                    ack ? "ACK" : "NACK",
                    ack ? "Address ACK (0)" : "Address NACK (1)",
                    _isIbiFrame ? "Controller drives ACK/NACK for Target IBI/HJ" : "Target drives Open-Drain ACK/NACK",
                    ackDriver,
                    DriveMode.OpenDrain,
                    isI2c,
                    sample.ChapterIndex);

                ResetFieldAccumulator();

                if (!ack)
                {
                    _state = DecoderState.IgnoreUntilFraming;
                    break;
                }

                if (_isIbiFrame)
                {
                    _state = _lastHeaderAddr7 == I3CAddresses.HotJoin
                        ? DecoderState.IgnoreUntilFraming
                        : DecoderState.IbiPayloadData;
                }
                else if (isI2c)
                {
                    _state = _currentTransferIsRead ? DecoderState.PrivateReadData : DecoderState.PrivateWriteData;
                }
                else if (_lastHeaderAddr7 == I3CAddresses.Broadcast)
                {
                    if (!_currentTransferIsRead)
                    {
                        _state = DecoderState.CccOrDataAfter7EW;
                    }
                    else if (_inEntdaaLoop)
                    {
                        _state = DecoderState.EntdaaArbitrating64;
                    }
                    else
                    {
                        _state = DecoderState.IgnoreUntilFraming;
                    }
                }
                else if (_inCccFrame && _activeCcc.IsDirect() && _afterRepeatedStart)
                {
                    _state = _currentTransferIsRead ? DecoderState.PrivateReadData : DecoderState.PrivateWriteData;
                }
                else
                {
                    _state = _currentTransferIsRead ? DecoderState.PrivateReadData : DecoderState.PrivateWriteData;
                }
                break;

            case DecoderState.CccOrDataAfter7EW:
                Process9BitByte(sample, isWriteDirection: true, isCccByte: true, isI2c: false);
                break;

            case DecoderState.BroadcastCccPayload:
            case DecoderState.PrivateWriteData:
                Process9BitByte(sample, isWriteDirection: true, isCccByte: false, isI2c: isI2c);
                break;

            case DecoderState.PrivateReadData:
            case DecoderState.IbiPayloadData:
                Process9BitByte(sample, isWriteDirection: false, isCccByte: false, isI2c: isI2c);
                break;

            case DecoderState.EntdaaArbitrating64:
                _accumBits = (_accumBits << 1) | (bit ? 1UL : 0UL);
                _bitCount++;
                if (_bitCount == 64)
                {
                    var ident = I3CDeviceIdentity.FromEntdaa64BitWord(_accumBits);
                    string arbNote = _arbitrationLosersInField.Count > 0
                        ? $"Losers: {string.Join(", ", _arbitrationLosersInField)}"
                        : "Sole unassigned contestant";
                    string drivers = _activeDriversInField.Count > 0
                        ? string.Join(", ", _activeDriversInField)
                        : "Unassigned Targets";

                    EmitPacket(
                        _fieldStartSample, sample.Index,
                        _fieldStartTimeNs, sample.EndTimeNs,
                        PacketCategory.EntdaaArbitration64,
                        $"PID 0x{ident.ProvisionalId48:X12}",
                        $"64b ENTDAA Arb Winner: PID=0x{ident.ProvisionalId48:X12}, BCR=0x{(byte)ident.Bcr:X2}, DCR=0x{ident.Dcr:X2}",
                        arbNote,
                        drivers,
                        DriveMode.OpenDrain,
                        false,
                        sample.ChapterIndex);

                    ResetFieldAccumulator();
                    _state = DecoderState.EntdaaAssignDa8Bits;
                }
                break;

            case DecoderState.EntdaaAssignDa8Bits:
                _accumBits = (_accumBits << 1) | (bit ? 1UL : 0UL);
                _bitCount++;
                if (_bitCount == 8)
                {
                    byte rawDa = (byte)_accumBits;
                    var (da7, parityOk) = Parity.UnpackAndVerifyEntdaaAddress(rawDa);
                    EmitPacket(
                        _fieldStartSample, sample.Index,
                        _fieldStartTimeNs, sample.EndTimeNs,
                        parityOk ? PacketCategory.DynamicAddressAssign : PacketCategory.Error,
                        $"Assign DA=0x{da7:X2}",
                        $"Assign Dynamic Addr 0x{da7:X2} (Byte=0x{rawDa:X2}, Parity={(parityOk ? "OK" : "ERR")})",
                        "Open-Drain 7-bit DA + Odd Parity bit",
                        "I3C-MainController",
                        DriveMode.OpenDrain,
                        false,
                        sample.ChapterIndex);
                    ResetFieldAccumulator();
                    _state = DecoderState.EntdaaAssignDaAck9thBit;
                }
                break;

            case DecoderState.EntdaaAssignDaAck9thBit:
                bool daAck = !bit;
                EmitPacket(
                    _fieldStartSample, sample.Index,
                    _fieldStartTimeNs, sample.EndTimeNs,
                    daAck ? PacketCategory.Ack : PacketCategory.Nack,
                    daAck ? "DA ACK" : "DA NACK",
                    daAck ? "Winner accepted Dynamic Address (ACK)" : "Winner rejected DA (NACK)",
                    "9th bit Open-Drain confirmation",
                    _activeDriversInField.Count > 0 ? string.Join(", ", _activeDriversInField) : "Winning Target",
                    DriveMode.OpenDrain,
                    false,
                    sample.ChapterIndex);
                ResetFieldAccumulator();
                _state = DecoderState.IgnoreUntilFraming;
                break;
        }
    }

    private byte _lastHeaderAddr7;
    private byte _pendingByteValue;

    private void Process9BitByte(BusSample sample, bool isWriteDirection, bool isCccByte, bool isI2c)
    {
        if (_bitCount < 8)
        {
            _accumBits = (_accumBits << 1) | (sample.Sda ? 1UL : 0UL);
            _bitCount++;
            if (_bitCount == 8)
            {
                _pendingByteValue = (byte)_accumBits;
            }
            return;
        }

        // 9th bit (T-bit in I3C, ACK/NACK in Legacy I2C)
        bool bit9 = sample.Sda;
        byte value = _pendingByteValue;
        string drivers = _activeDriversInField.Count > 0
            ? string.Join(", ", _activeDriversInField)
            : (isWriteDirection ? "I3C-MainController" : "Target");

        if (isI2c)
        {
            bool ack = !bit9;
            EmitPacket(
                _fieldStartSample, sample.Index,
                _fieldStartTimeNs, sample.EndTimeNs,
                PacketCategory.LegacyI2C,
                $"0x{value:X2} {(ack ? "A" : "N")}",
                $"I2C {(isWriteDirection ? "Write" : "Read")} 0x{value:X2} -> {(ack ? "ACK" : "NACK")}",
                $"Open-Drain 400kHz, Bit9={(ack ? "ACK(0)" : "NACK(1)")}",
                drivers,
                DriveMode.OpenDrain,
                true,
                sample.ChapterIndex);

            ResetFieldAccumulator();
            return;
        }

        if (isCccByte)
        {
            bool parityOk = Parity.VerifyOddParityTBit(value, bit9);
            _inCccFrame = true;
            _activeCcc = (CccCode)value;
            _inEntdaaLoop = _activeCcc == CccCode.ENTDAA;
            string cccName = Enum.IsDefined(typeof(CccCode), _activeCcc)
                ? _activeCcc.ToString()
                : $"CCC_0x{value:X2}";

            EmitPacket(
                _fieldStartSample, sample.Index,
                _fieldStartTimeNs, sample.EndTimeNs,
                parityOk ? PacketCategory.CccCommand : PacketCategory.Error,
                $"{cccName}",
                $"CCC 0x{value:X2} ({cccName}) + T={(bit9 ? 1 : 0)} ({(parityOk ? "Parity OK" : "TE1 ERR")})",
                $"12.5 MHz Push-Pull Command Byte, Odd Parity={(parityOk ? "Valid" : "Mismatch")}",
                "I3C-MainController",
                DriveMode.PushPull,
                false,
                sample.ChapterIndex);

            ResetFieldAccumulator();
            if (!parityOk || _activeCcc == CccCode.ENTDAA || _activeCcc.IsDirect())
            {
                _state = DecoderState.IgnoreUntilFraming;
            }
            else
            {
                _state = DecoderState.BroadcastCccPayload;
            }
            return;
        }

        if (isWriteDirection)
        {
            bool parityOk = Parity.VerifyOddParityTBit(value, bit9);
            EmitPacket(
                _fieldStartSample, sample.Index,
                _fieldStartTimeNs, sample.EndTimeNs,
                parityOk ? PacketCategory.WriteDataPushPull : PacketCategory.Error,
                $"W 0x{value:X2} T={(bit9 ? 1 : 0)}",
                $"Write 0x{value:X2} + Parity T={(bit9 ? 1 : 0)} ({(parityOk ? "OK" : "TE2 ERR")})",
                "12.5 MHz Push-Pull, 9th bit = Odd Parity",
                "I3C-MainController",
                DriveMode.PushPull,
                false,
                sample.ChapterIndex);
        }
        else
        {
            bool hasMore = bit9;
            PacketCategory cat = _state == DecoderState.IbiPayloadData
                ? PacketCategory.InBandInterrupt
                : PacketCategory.ReadDataPushPull;

            EmitPacket(
                _fieldStartSample, sample.Index,
                _fieldStartTimeNs, sample.EndTimeNs,
                cat,
                $"{(_state == DecoderState.IbiPayloadData ? "IBI" : "R")} 0x{value:X2} T={(bit9 ? 1 : 0)}",
                $"{(_state == DecoderState.IbiPayloadData ? "IBI Payload" : "Read")} 0x{value:X2} + T={(bit9 ? 1 : 0)} ({(hasMore ? "More" : "EOD")})",
                "12.5 MHz Push-Pull, 9th bit = Target End-Of-Data T-bit",
                drivers,
                DriveMode.PushPull,
                false,
                sample.ChapterIndex);
        }

        ResetFieldAccumulator();
    }

    private void EmitPacket(
        int startSample,
        int endSample,
        long startTimeNs,
        long endTimeNs,
        PacketCategory category,
        string shortLabel,
        string summary,
        string details,
        string driver,
        DriveMode mode,
        bool isI2C,
        int chapterIndex)
    {
        _packets.Add(new DecodedPacket(
            Id: _packets.Count,
            StartSampleIndex: startSample,
            EndSampleIndex: endSample,
            StartTimeNs: startTimeNs,
            EndTimeNs: endTimeNs,
            Category: category,
            ShortLabel: shortLabel,
            Summary: summary,
            Details: details,
            InitiatorOrDriver: driver,
            ElectricalMode: mode,
            IsI2CMode: isI2C,
            ChapterIndex: chapterIndex));
    }
}
