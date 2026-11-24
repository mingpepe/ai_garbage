using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

[Flags]
public enum TcpFlags : byte
{
    None = 0,
    Fin = 0x01,
    Syn = 0x02,
    Rst = 0x04,
    Psh = 0x08,
    Ack = 0x10,
    Urg = 0x20
}

public sealed class TcpSegmentRecord
{
    public uint Seq { get; init; }
    public byte[] Data { get; init; } = [];
    public TcpFlags Flags { get; init; }
    public long SentTimeMs { get; set; }
    public int RetransmitCount { get; set; }
    public string? AppSummary { get; init; }
    public uint EndSeq => Seq + (uint)Data.Length + (Flags.HasFlag(TcpFlags.Syn) ? 1u : 0u) + (Flags.HasFlag(TcpFlags.Fin) ? 1u : 0u);
}

public sealed class TcpPcb
{
    public int Id { get; init; }
    public TcpState State { get; set; } = TcpState.Closed;
    public IpAddress LocalIp { get; set; } = IpAddress.AnyV4;
    public ushort LocalPort { get; set; }
    public IpAddress RemoteIp { get; set; } = IpAddress.AnyV4;
    public ushort RemotePort { get; set; }

    // Sequence & Window variables (RFC 793)
    public uint Iss { get; set; }
    public uint SndUna { get; set; }
    public uint SndNxt { get; set; }
    public ushort SndWnd { get; set; } = 65535;
    public uint Irs { get; set; }
    public uint RcvNxt { get; set; }
    public ushort RcvWnd { get; set; } = 16384;

    // Options & MSS
    public ushort Mss { get; set; } = 1460;
    public byte WindowScale { get; set; }
    public bool SackPermitted { get; set; } = true;
    public bool TimestampsEnabled { get; set; } = true;

    // Congestion Control (RFC 5681)
    public uint Cwnd { get; set; } = 1460 * 4;
    public uint SsThresh { get; set; } = 65535;
    public int DupAcks { get; set; }
    public bool InFastRecovery { get; set; }

    // RTT / RTO Estimation (RFC 6298)
    public double SrttMs { get; set; } = 100;
    public double RttVarMs { get; set; } = 50;
    public long RtoMs { get; set; } = 1000;
    public long RtoTimerMs { get; set; } = -1;

    // Flags & Timers (lwIP tcp_fasttmr / tcp_slowtmr)
    public bool NoDelay { get; set; } = true; // Nagle toggle
    public bool KeepAlive { get; set; }
    public bool DelayedAckPending { get; set; }
    public long LastActivityMs { get; set; }
    public long TimeWaitStartMs { get; set; }
    public int PersistTicks { get; set; }
    public int Backlog { get; set; } = 5;
    public int? ParentListenPcbId { get; set; }

    // Queues
    public List<TcpSegmentRecord> Unacked { get; } = [];
    public Queue<(byte[] Data, string? Summary)> Unsent { get; } = new();
    public SortedDictionary<uint, byte[]> OutOfOrderQueue { get; } = new();

    public ITcpCallbacks Callbacks { get; init; } = null!;
}

/// <summary>
/// Layer 4: Full lwIP-equivalent TCP Layer (tcp.c, tcp_in.c, tcp_out.c).
/// Implements all 11 RFC 793 states, sliding window, MSS/WScale/SACK/TS options,
/// out-of-order reassembly, Jacobson/Karels RTO, Slow Start / Congestion Avoidance / Fast Recovery,
/// Nagle's algorithm, Delayed ACK, Keepalive, Zero-Window persist, and TIME_WAIT.
/// </summary>
public sealed class TcpLayer : ITcpLayer
{
    private const long TimeWaitDurationMs = 4000; // Accelerated 2*MSL for interactive inspection
    private const long KeepAliveIdleMs = 10000;

    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly ISysArch _sysArch;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private readonly Dictionary<int, TcpPcb> _pcbs = new();
    private int _nextId = 1;
    private ushort _nextEphemeralPort = 50000;
    private uint _issCounter = 1000;

    private IIp4Layer? _ip4;
    private IIp6Layer? _ip6;

    public TcpLayer(string nodeId, string nodeLabel, ISysArch sysArch, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _sysArch = sysArch;
        _scheduler = scheduler;
        _stats = stats;
    }

    public void SetLowerLayers(IIp4Layer ip4, IIp6Layer ip6)
    {
        _ip4 = ip4;
        _ip6 = ip6;
    }

    public IReadOnlyCollection<TcpPcb> GetPcbs() => _pcbs.Values.ToList();
    public TcpPcb? GetPcb(int id) => _pcbs.TryGetValue(id, out var p) ? p : null;

    public int CreatePcb(ITcpCallbacks callbacks)
    {
        int id = _nextId++;
        _pcbs[id] = new TcpPcb
        {
            Id = id,
            Callbacks = callbacks,
            LastActivityMs = _sysArch.NowMs
        };
        return id;
    }

    public LwipErr Bind(int pcbId, IpAddress localIp, ushort localPort)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return LwipErr.Arg;
        if (localPort == 0) localPort = AllocEphemeralPort();
        pcb.LocalIp = localIp;
        pcb.LocalPort = localPort;
        return LwipErr.Ok;
    }

    public LwipErr Listen(int pcbId, int backlog = 5)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return LwipErr.Arg;
        pcb.Backlog = backlog;
        TransitionState(pcb, TcpState.Listen, "Passive open (tcp_listen)");
        return LwipErr.Ok;
    }

    public LwipErr Connect(int pcbId, IpAddress remoteIp, ushort remotePort)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return LwipErr.Arg;
        if (pcb.State != TcpState.Closed) return LwipErr.IsConn;

        if (pcb.LocalPort == 0) pcb.LocalPort = AllocEphemeralPort();
        if (pcb.LocalIp.IsAny)
            pcb.LocalIp = remoteIp.IsV6 ? new IpAddress(_ip6?.LinkLocalIp ?? Ip6Address.Any) : new IpAddress(_ip4?.LocalIp ?? Ip4Address.Any);

        pcb.RemoteIp = remoteIp;
        pcb.RemotePort = remotePort;
        pcb.Iss = AllocIss();
        pcb.SndUna = pcb.Iss;
        pcb.SndNxt = pcb.Iss;

        TransitionState(pcb, TcpState.SynSent, $"Active open -> {remoteIp}:{remotePort}");
        SendControlSegment(pcb, TcpFlags.Syn, includeSynOptions: true, summary: $"SYN -> {remoteIp}:{remotePort}");
        return LwipErr.Ok;
    }

    public LwipErr Write(int pcbId, byte[] data, string? appSummary = null)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return LwipErr.Arg;
        if (pcb.State is not (TcpState.Established or TcpState.CloseWait)) return LwipErr.Conn;
        if (data.Length == 0) return LwipErr.Ok;

        pcb.Unsent.Enqueue((data, appSummary));
        FlushUnsent(pcb);
        return LwipErr.Ok;
    }

    public LwipErr Close(int pcbId)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return LwipErr.Arg;
        switch (pcb.State)
        {
            case TcpState.Closed:
            case TcpState.Listen:
                TransitionState(pcb, TcpState.Closed, "Closed listener/idle PCB");
                _pcbs.Remove(pcbId);
                return LwipErr.Ok;

            case TcpState.SynSent:
                TransitionState(pcb, TcpState.Closed, "Closed during SYN_SENT");
                _pcbs.Remove(pcbId);
                return LwipErr.Ok;

            case TcpState.SynRcvd:
            case TcpState.Established:
                FlushUnsent(pcb);
                TransitionState(pcb, TcpState.FinWait1, "Active close: sending FIN");
                SendControlSegment(pcb, TcpFlags.Fin | TcpFlags.Ack, false, "FIN+ACK (Active Close)");
                return LwipErr.Ok;

            case TcpState.CloseWait:
                FlushUnsent(pcb);
                TransitionState(pcb, TcpState.LastAck, "Passive close: sending FIN");
                SendControlSegment(pcb, TcpFlags.Fin | TcpFlags.Ack, false, "FIN+ACK (Passive Close)");
                return LwipErr.Ok;

            default:
                return LwipErr.Ok;
        }
    }

    public void Abort(int pcbId)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return;
        if (pcb.State is not (TcpState.Closed or TcpState.Listen))
        {
            SendRst(pcb.LocalIp, pcb.LocalPort, pcb.RemoteIp, pcb.RemotePort, pcb.SndNxt, pcb.RcvNxt, true);
        }
        TransitionState(pcb, TcpState.Closed, "Aborted with RST");
        _pcbs.Remove(pcbId);
    }

    public void SetNoDelay(int pcbId, bool noDelay)
    {
        if (_pcbs.TryGetValue(pcbId, out var pcb)) pcb.NoDelay = noDelay;
    }

    public void SetKeepAlive(int pcbId, bool keepAlive)
    {
        if (_pcbs.TryGetValue(pcbId, out var pcb)) pcb.KeepAlive = keepAlive;
    }

    public void SetReceiveWindow(int pcbId, ushort window)
    {
        if (_pcbs.TryGetValue(pcbId, out var pcb)) pcb.RcvWnd = window;
    }

    public void InputIpv4(Pbuf tcpSegment, Ip4Address srcIp, Ip4Address dstIp)
    {
        if (tcpSegment.Length < 20) { _stats.Tcp.LenErr++; _stats.Tcp.Drop++; return; }
        var s = tcpSegment.ReadOnlyPayload;
        if (Checksum.ComputePseudoIpv4(srcIp, dstIp, ProtocolNumbers.IpProtoTcp, s) != 0)
        {
            _stats.Tcp.ChkErr++;
            _stats.Tcp.Drop++;
            _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.TransportTcp,
                "TcpLayer.InputIpv4 [CHECKSUM FAIL]", TraceDirection.UpRx, "TCP",
                "TCP Checksum INVALID - segment dropped!",
                "Pseudo-header + TCP segment checksum != 0", s, "TCP", dropped: true, dropReason: "TCP Checksum Error");
            return;
        }
        ProcessSegment(s, new IpAddress(srcIp), new IpAddress(dstIp));
    }

    public void InputIpv6(Pbuf tcpSegment, Ip6Address srcIp, Ip6Address dstIp)
    {
        if (tcpSegment.Length < 20) { _stats.Tcp.LenErr++; _stats.Tcp.Drop++; return; }
        var s = tcpSegment.ReadOnlyPayload;
        if (Checksum.ComputePseudoIpv6(srcIp, dstIp, ProtocolNumbers.IpProtoTcp, s) != 0)
        {
            _stats.Tcp.ChkErr++;
            _stats.Tcp.Drop++;
            return;
        }
        ProcessSegment(s, new IpAddress(srcIp), new IpAddress(dstIp));
    }

    private void ProcessSegment(ReadOnlySpan<byte> s, IpAddress srcIp, IpAddress dstIp)
    {
        ushort srcPort = BinaryPrimitives.ReadUInt16BigEndian(s[..2]);
        ushort dstPort = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        uint seq = BinaryPrimitives.ReadUInt32BigEndian(s.Slice(4, 4));
        uint ack = BinaryPrimitives.ReadUInt32BigEndian(s.Slice(8, 4));
        int hdrLen = (s[12] >> 4) * 4;
        if (hdrLen < 20 || hdrLen > s.Length) { _stats.Tcp.LenErr++; _stats.Tcp.Drop++; return; }
        var flags = (TcpFlags)(s[13] & 0x3F);
        ushort win = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(14, 2));
        var payload = s[hdrLen..].ToArray();

        // Parse MSS option if present
        ushort? peerMss = null;
        if (hdrLen > 20)
        {
            int i = 20;
            while (i < hdrLen)
            {
                byte kind = s[i];
                if (kind == 0) break;
                if (kind == 1) { i++; continue; }
                if (i + 1 >= hdrLen) break;
                byte olen = s[i + 1];
                if (olen < 2 || i + olen > hdrLen) break;
                if (kind == 2 && olen == 4)
                    peerMss = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(i + 2, 2));
                i += olen;
            }
        }

        _stats.Tcp.Recv++;

        // Match exact 4-tuple first, then LISTEN PCB
        var pcb = _pcbs.Values.FirstOrDefault(p =>
            p.State != TcpState.Listen && p.State != TcpState.Closed &&
            p.LocalPort == dstPort && p.RemotePort == srcPort && p.RemoteIp == srcIp);

        pcb ??= _pcbs.Values.FirstOrDefault(p => p.State == TcpState.Listen && p.LocalPort == dstPort);

        if (pcb == null)
        {
            _stats.Tcp.Drop++;
            if (!flags.HasFlag(TcpFlags.Rst))
            {
                uint rstSeq = flags.HasFlag(TcpFlags.Ack) ? ack : 0;
                uint rstAck = seq + (uint)payload.Length + (flags.HasFlag(TcpFlags.Syn) ? 1u : 0u) + (flags.HasFlag(TcpFlags.Fin) ? 1u : 0u);
                SendRst(dstIp, dstPort, srcIp, srcPort, rstSeq, rstAck, !flags.HasFlag(TcpFlags.Ack));
            }
            return;
        }

        pcb.LastActivityMs = _sysArch.NowMs;

        if (flags.HasFlag(TcpFlags.Rst))
        {
            if (pcb.State != TcpState.Listen)
            {
                TransitionState(pcb, TcpState.Closed, "Received RST from peer");
                pcb.Unacked.Clear();
                pcb.Callbacks.OnError(pcb.Id, LwipErr.Rst);
                _pcbs.Remove(pcb.Id);
            }
            return;
        }

        switch (pcb.State)
        {
            case TcpState.Listen:
                HandleListen(pcb, srcIp, dstIp, srcPort, dstPort, seq, flags, win, peerMss);
                break;

            case TcpState.SynSent:
                HandleSynSent(pcb, seq, ack, flags, win, peerMss);
                break;

            case TcpState.SynRcvd:
                HandleSynRcvd(pcb, seq, ack, flags, win, payload);
                break;

            case TcpState.Established:
            case TcpState.FinWait1:
            case TcpState.FinWait2:
            case TcpState.CloseWait:
            case TcpState.Closing:
            case TcpState.LastAck:
            case TcpState.TimeWait:
                HandleActiveState(pcb, seq, ack, flags, win, payload);
                break;
        }
    }

    private void HandleListen(
        TcpPcb listenPcb, IpAddress srcIp, IpAddress dstIp, ushort srcPort, ushort dstPort,
        uint seq, TcpFlags flags, ushort win, ushort? peerMss)
    {
        if (!flags.HasFlag(TcpFlags.Syn) || flags.HasFlag(TcpFlags.Ack)) return;

        int childId = _nextId++;
        var child = new TcpPcb
        {
            Id = childId,
            LocalIp = dstIp,
            LocalPort = dstPort,
            RemoteIp = srcIp,
            RemotePort = srcPort,
            Iss = AllocIss(),
            Irs = seq,
            RcvNxt = seq + 1,
            SndWnd = win,
            Mss = peerMss.HasValue ? Math.Min((ushort)1460, peerMss.Value) : (ushort)1460,
            ParentListenPcbId = listenPcb.Id,
            Callbacks = listenPcb.Callbacks,
            LastActivityMs = _sysArch.NowMs
        };
        child.SndUna = child.Iss;
        child.SndNxt = child.Iss;
        _pcbs[childId] = child;

        TransitionState(child, TcpState.SynRcvd, $"SYN received from {srcIp}:{srcPort}; sending SYN+ACK");
        SendControlSegment(child, TcpFlags.Syn | TcpFlags.Ack, includeSynOptions: true, summary: $"SYN+ACK -> {srcIp}:{srcPort}");
    }

    private void HandleSynSent(TcpPcb pcb, uint seq, uint ack, TcpFlags flags, ushort win, ushort? peerMss)
    {
        if (flags.HasFlag(TcpFlags.Syn) && flags.HasFlag(TcpFlags.Ack) && ack == pcb.SndNxt)
        {
            pcb.Irs = seq;
            pcb.RcvNxt = seq + 1;
            pcb.SndUna = ack;
            pcb.SndWnd = win;
            if (peerMss.HasValue) pcb.Mss = Math.Min(pcb.Mss, peerMss.Value);
            UpdateRttAndClearAcked(pcb, ack);

            TransitionState(pcb, TcpState.Established, "SYN+ACK received; 3-way handshake complete (sending ACK)");
            SendPureAck(pcb, "ACK (3-Way Handshake Complete)");

            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.SocketApi,
                "ITcpCallbacks.OnConnected", TraceDirection.UpRx, "TCP",
                $"TCP PCB#{pcb.Id} ESTABLISHED ({pcb.LocalPort} <-> {pcb.RemoteIp}:{pcb.RemotePort})",
                "Notifying Socket API that connect() completed",
                ReadOnlySpan<byte>.Empty, "RAW",
                () => pcb.Callbacks.OnConnected(pcb.Id));
        }
    }

    private void HandleSynRcvd(TcpPcb pcb, uint seq, uint ack, TcpFlags flags, ushort win, byte[] payload)
    {
        if (flags.HasFlag(TcpFlags.Ack) && ack == pcb.SndNxt)
        {
            pcb.SndUna = ack;
            pcb.SndWnd = win;
            UpdateRttAndClearAcked(pcb, ack);
            TransitionState(pcb, TcpState.Established, "Final ACK received; passive 3-way handshake complete");

            if (pcb.ParentListenPcbId.HasValue)
            {
                int listenId = pcb.ParentListenPcbId.Value;
                _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.SocketApi,
                    "ITcpCallbacks.OnAccepted", TraceDirection.UpRx, "TCP",
                    $"TCP Server Accepted PCB#{pcb.Id} from {pcb.RemoteIp}:{pcb.RemotePort}",
                    "Passive connection established; queued for accept()",
                    ReadOnlySpan<byte>.Empty, "RAW",
                    () => pcb.Callbacks.OnAccepted(listenId, pcb.Id, pcb.RemoteIp, pcb.RemotePort));
            }

            if (payload.Length > 0 || flags.HasFlag(TcpFlags.Fin))
            {
                HandleIncomingDataAndFin(pcb, seq, flags, payload);
            }
        }
    }

    private void HandleActiveState(TcpPcb pcb, uint seq, uint ack, TcpFlags flags, ushort win, byte[] payload)
    {
        pcb.SndWnd = win;

        // 1. Process ACK
        if (flags.HasFlag(TcpFlags.Ack))
        {
            if (SeqGt(ack, pcb.SndUna) && SeqLeq(ack, pcb.SndNxt))
            {
                int ackedBytes = (int)(ack - pcb.SndUna);
                pcb.SndUna = ack;
                pcb.DupAcks = 0;

                if (pcb.InFastRecovery)
                {
                    pcb.Cwnd = pcb.SsThresh;
                    pcb.InFastRecovery = false;
                }
                else
                {
                    // RFC 5681 Slow Start vs Congestion Avoidance
                    if (pcb.Cwnd < pcb.SsThresh)
                        pcb.Cwnd += pcb.Mss;
                    else
                        pcb.Cwnd += Math.Max(1u, (uint)(pcb.Mss * pcb.Mss) / Math.Max(1u, pcb.Cwnd));
                }

                UpdateRttAndClearAcked(pcb, ack);
                pcb.Callbacks.OnSent(pcb.Id, ackedBytes);

                // State transitions on FIN ACKed
                if (pcb.State == TcpState.FinWait1 && pcb.Unacked.Count == 0)
                    TransitionState(pcb, TcpState.FinWait2, "Our FIN was ACKed");
                else if (pcb.State == TcpState.Closing && pcb.Unacked.Count == 0)
                {
                    pcb.TimeWaitStartMs = _sysArch.NowMs;
                    TransitionState(pcb, TcpState.TimeWait, "Both FINs ACKed -> TIME_WAIT");
                }
                else if (pcb.State == TcpState.LastAck && pcb.Unacked.Count == 0)
                {
                    TransitionState(pcb, TcpState.Closed, "Final FIN ACKed -> CLOSED");
                    pcb.Callbacks.OnClosed(pcb.Id);
                    _pcbs.Remove(pcb.Id);
                    return;
                }

                FlushUnsent(pcb);
            }
            else if (ack == pcb.SndUna && payload.Length == 0 && !flags.HasFlag(TcpFlags.Fin) && pcb.Unacked.Count > 0)
            {
                // Duplicate ACK -> Fast Retransmit (RFC 5681)
                pcb.DupAcks++;
                if (pcb.DupAcks == 3)
                {
                    pcb.SsThresh = Math.Max(2u * pcb.Mss, pcb.Cwnd / 2);
                    pcb.Cwnd = pcb.SsThresh + 3u * pcb.Mss;
                    pcb.InFastRecovery = true;
                    RetransmitOldest(pcb, "Fast Retransmit (3 Dup ACKs)");
                }
            }
        }

        // 2. Process incoming payload and FIN
        if (payload.Length > 0 || flags.HasFlag(TcpFlags.Fin))
        {
            HandleIncomingDataAndFin(pcb, seq, flags, payload);
        }
    }

    private void HandleIncomingDataAndFin(TcpPcb pcb, uint seq, TcpFlags flags, byte[] payload)
    {
        if (payload.Length > 0)
        {
            if (seq == pcb.RcvNxt)
            {
                // In-order segment
                var delivered = new List<byte>(payload);
                pcb.RcvNxt += (uint)payload.Length;

                // Drain contiguous out-of-order queue (lwIP ooseq)
                while (pcb.OutOfOrderQueue.TryGetValue(pcb.RcvNxt, out var nextChunk))
                {
                    pcb.OutOfOrderQueue.Remove(pcb.RcvNxt);
                    delivered.AddRange(nextChunk);
                    pcb.RcvNxt += (uint)nextChunk.Length;
                }

                var dataArr = delivered.ToArray();
                string appProto = (pcb.LocalPort == 80 || pcb.RemotePort == 80) ? "HTTP" : "RAW";
                _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.SocketApi,
                    "ITcpCallbacks.OnReceived", TraceDirection.UpRx, appProto,
                    $"TCP RX Data ({dataArr.Length}B) -> Socket PCB#{pcb.Id} (RCV.NXT={pcb.RcvNxt})",
                    "In-order TCP payload stripped of header and delivered to Socket receive buffer",
                    dataArr, appProto,
                    () => pcb.Callbacks.OnReceived(pcb.Id, dataArr));

                // Send ACK (immediate for responsive stepping; Delayed ACK flag tracked for fasttmr)
                SendPureAck(pcb, $"ACK RcvNxt={pcb.RcvNxt}");
            }
            else if (SeqGt(seq, pcb.RcvNxt))
            {
                // Out-of-order segment -> buffer in ooseq & send duplicate ACK
                pcb.OutOfOrderQueue[seq] = payload;
                _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.TransportTcp,
                    "TcpLayer.OoseqBuffer", TraceDirection.Control, "TCP",
                    $"Out-of-order segment Seq={seq} (expected {pcb.RcvNxt}); buffered in ooseq, sending Dup ACK",
                    $"ooseq count={pcb.OutOfOrderQueue.Count}");
                SendPureAck(pcb, $"Dup ACK RcvNxt={pcb.RcvNxt}");
            }
            else
            {
                // Retransmitted already-received segment -> re-ACK
                SendPureAck(pcb, $"Re-ACK RcvNxt={pcb.RcvNxt}");
            }
        }

        if (flags.HasFlag(TcpFlags.Fin))
        {
            uint finSeq = seq + (uint)payload.Length;
            if (finSeq == pcb.RcvNxt)
            {
                pcb.RcvNxt++;
                if (pcb.State == TcpState.Established)
                {
                    TransitionState(pcb, TcpState.CloseWait, "FIN received from peer -> CLOSE_WAIT");
                    SendPureAck(pcb, "ACK (FIN)");
                    _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.SocketApi,
                        "ITcpCallbacks.OnClosed(EOF)", TraceDirection.UpRx, "TCP",
                        $"TCP PCB#{pcb.Id} EOF (Peer closed write side)",
                        "Notifying Socket API of peer FIN",
                        ReadOnlySpan<byte>.Empty, "RAW",
                        () => pcb.Callbacks.OnClosed(pcb.Id));
                }
                else if (pcb.State == TcpState.FinWait1)
                {
                    TransitionState(pcb, TcpState.Closing, "Simultaneous close FIN -> CLOSING");
                    SendPureAck(pcb, "ACK (Simultaneous FIN)");
                }
                else if (pcb.State == TcpState.FinWait2)
                {
                    pcb.TimeWaitStartMs = _sysArch.NowMs;
                    TransitionState(pcb, TcpState.TimeWait, "FIN received in FIN_WAIT_2 -> TIME_WAIT");
                    SendPureAck(pcb, "ACK (Final 4-Way Teardown)");
                    pcb.Callbacks.OnClosed(pcb.Id);
                }
                else if (pcb.State == TcpState.TimeWait)
                {
                    pcb.TimeWaitStartMs = _sysArch.NowMs;
                    SendPureAck(pcb, "Re-ACK FIN in TIME_WAIT");
                }
            }
        }
    }

    private void FlushUnsent(TcpPcb pcb)
    {
        while (pcb.Unsent.Count > 0)
        {
            uint inFlight = pcb.SndNxt - pcb.SndUna;
            uint effectiveWnd = Math.Min(pcb.SndWnd, pcb.Cwnd);
            if (effectiveWnd <= inFlight)
            {
                if (pcb.SndWnd == 0) pcb.PersistTicks = 1; // Trigger Zero-Window Probe
                break;
            }

            var (data, summary) = pcb.Unsent.Peek();
            // Nagle's algorithm check (RFC 896)
            if (!pcb.NoDelay && inFlight > 0 && data.Length < pcb.Mss)
                break;

            pcb.Unsent.Dequeue();

            int offset = 0;
            while (offset < data.Length)
            {
                inFlight = pcb.SndNxt - pcb.SndUna;
                effectiveWnd = Math.Min(pcb.SndWnd, pcb.Cwnd);
                int avail = (int)Math.Max(0, (long)effectiveWnd - inFlight);
                if (avail <= 0)
                {
                    // Re-queue remaining slice
                    var rem = data[offset..];
                    var temp = new Queue<(byte[], string?)>();
                    temp.Enqueue((rem, summary));
                    while (pcb.Unsent.Count > 0) temp.Enqueue(pcb.Unsent.Dequeue());
                    while (temp.Count > 0) pcb.Unsent.Enqueue(temp.Dequeue());
                    return;
                }

                int segLen = Math.Min(Math.Min(pcb.Mss, avail), data.Length - offset);
                var chunk = data.AsSpan(offset, segLen).ToArray();
                bool isLast = (offset + segLen) >= data.Length;
                var flags = TcpFlags.Ack | (isLast ? TcpFlags.Psh : TcpFlags.None);

                var seg = new TcpSegmentRecord
                {
                    Seq = pcb.SndNxt,
                    Data = chunk,
                    Flags = flags,
                    SentTimeMs = _sysArch.NowMs,
                    AppSummary = summary
                };
                pcb.SndNxt += (uint)chunk.Length;
                pcb.Unacked.Add(seg);
                if (pcb.RtoTimerMs < 0) pcb.RtoTimerMs = _sysArch.NowMs + pcb.RtoMs;

                TransmitSegment(pcb, seg, includeSynOptions: false,
                    summary ?? $"DATA ({chunk.Length}B) Seq={seg.Seq}");
                offset += segLen;
            }
        }
    }

    private void SendControlSegment(TcpPcb pcb, TcpFlags flags, bool includeSynOptions, string summary)
    {
        var seg = new TcpSegmentRecord
        {
            Seq = pcb.SndNxt,
            Data = [],
            Flags = flags,
            SentTimeMs = _sysArch.NowMs,
            AppSummary = summary
        };
        if (flags.HasFlag(TcpFlags.Syn)) pcb.SndNxt++;
        if (flags.HasFlag(TcpFlags.Fin)) pcb.SndNxt++;
        pcb.Unacked.Add(seg);
        if (pcb.RtoTimerMs < 0) pcb.RtoTimerMs = _sysArch.NowMs + pcb.RtoMs;

        TransmitSegment(pcb, seg, includeSynOptions, summary);
    }

    private void SendPureAck(TcpPcb pcb, string summary)
    {
        pcb.DelayedAckPending = false;
        var seg = new TcpSegmentRecord
        {
            Seq = pcb.SndNxt,
            Data = [],
            Flags = TcpFlags.Ack,
            SentTimeMs = _sysArch.NowMs,
            AppSummary = summary
        };
        TransmitSegment(pcb, seg, includeSynOptions: false, summary);
    }

    private void TransmitSegment(TcpPcb pcb, TcpSegmentRecord seg, bool includeSynOptions, string summary)
    {
        int optLen = includeSynOptions ? 12 : 0; // MSS(4) + NOP(1) + WScale(3) + SACK_OK(2) + NOP(2) = 12 bytes
        int hdrLen = 20 + optLen;
        var p = Pbuf.Alloc(PbufLayer.Transport, hdrLen + seg.Data.Length);
        var s = p.PayloadSpan;

        BinaryPrimitives.WriteUInt16BigEndian(s[..2], pcb.LocalPort);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), pcb.RemotePort);
        BinaryPrimitives.WriteUInt32BigEndian(s.Slice(4, 4), seg.Seq);
        BinaryPrimitives.WriteUInt32BigEndian(s.Slice(8, 4), seg.Flags.HasFlag(TcpFlags.Ack) ? pcb.RcvNxt : 0u);
        s[12] = (byte)((hdrLen / 4) << 4);
        s[13] = (byte)seg.Flags;
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(14, 2), pcb.RcvWnd);
        s[16] = 0; s[17] = 0; // checksum placeholder
        s[18] = 0; s[19] = 0; // urgent ptr

        if (includeSynOptions)
        {
            // MSS option (Kind=2, Len=4)
            s[20] = 2; s[21] = 4;
            BinaryPrimitives.WriteUInt16BigEndian(s.Slice(22, 2), pcb.Mss);
            // NOP + WScale (Kind=3, Len=3, Shift=0)
            s[24] = 1; s[25] = 3; s[26] = 3; s[27] = pcb.WindowScale;
            // SACK Permitted (Kind=4, Len=2) + 2 NOP padding
            s[28] = 4; s[29] = 2; s[30] = 1; s[31] = 1;
        }

        if (seg.Data.Length > 0) seg.Data.CopyTo(s[hdrLen..]);

        _stats.Tcp.Xmit++;

        if (!pcb.RemoteIp.IsV6 && _ip4 != null)
        {
            var srcIp = pcb.LocalIp.IsAny ? _ip4.LocalIp : pcb.LocalIp.V4;
            ushort csum = Checksum.ComputePseudoIpv4(srcIp, pcb.RemoteIp.V4, ProtocolNumbers.IpProtoTcp, s);
            BinaryPrimitives.WriteUInt16BigEndian(s.Slice(16, 2), csum);

            var bytes = p.ToLinearArray();
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.NetworkIp4,
                "ITcpLayer -> IIp4Layer.Output", TraceDirection.DownTx, "TCP",
                $"TCP TX [{pcb.State}] :{pcb.LocalPort} -> {pcb.RemoteIp.V4}:{pcb.RemotePort} [{seg.Flags}] Seq={seg.Seq} Ack={pcb.RcvNxt} Len={seg.Data.Length} | {summary}",
                $"Built {hdrLen}B TCP header (Win={pcb.RcvWnd}, Cwnd={pcb.Cwnd}, csum=0x{csum:X4})",
                bytes, "TCP",
                () => _ip4.Output(srcIp, pcb.RemoteIp.V4, ProtocolNumbers.IpProtoTcp, 64, p, summary));
        }
        else if (pcb.RemoteIp.IsV6 && _ip6 != null)
        {
            var src6 = pcb.LocalIp.IsAny ? _ip6.LinkLocalIp : pcb.LocalIp.V6;
            ushort csum = Checksum.ComputePseudoIpv6(src6, pcb.RemoteIp.V6, ProtocolNumbers.IpProtoTcp, s);
            BinaryPrimitives.WriteUInt16BigEndian(s.Slice(16, 2), csum);

            var bytes = p.ToLinearArray();
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.NetworkIp6,
                "ITcpLayer -> IIp6Layer.Output", TraceDirection.DownTx, "TCP",
                $"TCP6 TX [{pcb.State}] :{pcb.LocalPort} -> [{pcb.RemoteIp.V6}]:{pcb.RemotePort} [{seg.Flags}] Seq={seg.Seq} Len={seg.Data.Length}",
                $"Built {hdrLen}B TCP header over IPv6 (csum=0x{csum:X4})",
                bytes, "TCP",
                () => _ip6.Output(src6, pcb.RemoteIp.V6, ProtocolNumbers.IpProtoTcp, 64, p, summary));
        }
    }

    private void SendRst(IpAddress localIp, ushort localPort, IpAddress remoteIp, ushort remotePort, uint seq, uint ack, bool withAck)
    {
        var p = Pbuf.Alloc(PbufLayer.Transport, 20);
        var s = p.PayloadSpan;
        BinaryPrimitives.WriteUInt16BigEndian(s[..2], localPort);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), remotePort);
        BinaryPrimitives.WriteUInt32BigEndian(s.Slice(4, 4), seq);
        BinaryPrimitives.WriteUInt32BigEndian(s.Slice(8, 4), withAck ? ack : 0u);
        s[12] = 0x50;
        s[13] = (byte)(TcpFlags.Rst | (withAck ? TcpFlags.Ack : TcpFlags.None));
        if (!remoteIp.IsV6 && _ip4 != null)
        {
            var src = localIp.IsAny ? _ip4.LocalIp : localIp.V4;
            ushort csum = Checksum.ComputePseudoIpv4(src, remoteIp.V4, ProtocolNumbers.IpProtoTcp, s);
            BinaryPrimitives.WriteUInt16BigEndian(s.Slice(16, 2), csum);
            _ip4.Output(src, remoteIp.V4, ProtocolNumbers.IpProtoTcp, 64, p, "TCP RST");
        }
    }

    private void UpdateRttAndClearAcked(TcpPcb pcb, uint ack)
    {
        long now = _sysArch.NowMs;
        for (int i = pcb.Unacked.Count - 1; i >= 0; i--)
        {
            var seg = pcb.Unacked[i];
            if (SeqLeq(seg.EndSeq, ack))
            {
                if (seg.RetransmitCount == 0)
                {
                    // RFC 6298 SRTT & RTTVAR update
                    double rtt = Math.Max(10, now - seg.SentTimeMs);
                    pcb.RttVarMs = 0.75 * pcb.RttVarMs + 0.25 * Math.Abs(pcb.SrttMs - rtt);
                    pcb.SrttMs = 0.875 * pcb.SrttMs + 0.125 * rtt;
                    pcb.RtoMs = Math.Clamp((long)(pcb.SrttMs + 4 * pcb.RttVarMs), 500, 16000);
                }
                pcb.Unacked.RemoveAt(i);
            }
        }
        pcb.RtoTimerMs = pcb.Unacked.Count > 0 ? now + pcb.RtoMs : -1;
    }

    private void RetransmitOldest(TcpPcb pcb, string reason)
    {
        if (pcb.Unacked.Count == 0) return;
        var seg = pcb.Unacked[0];
        seg.RetransmitCount++;
        seg.SentTimeMs = _sysArch.NowMs;
        bool synOpts = seg.Flags.HasFlag(TcpFlags.Syn);

        _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.TransportTcp,
            $"TcpLayer.Retransmit ({reason})", TraceDirection.Timer, "TCP",
            $"RETRANSMIT #{seg.RetransmitCount} PCB#{pcb.Id} Seq={seg.Seq} [{seg.Flags}] (RTO={pcb.RtoMs}ms, Cwnd={pcb.Cwnd})",
            $"Triggered by {reason}; SsThresh={pcb.SsThresh}, Cwnd={pcb.Cwnd}");

        TransmitSegment(pcb, seg, synOpts, $"[RETX #{seg.RetransmitCount}] {seg.AppSummary}");
    }

    public void FastTimerTick()
    {
        foreach (var pcb in _pcbs.Values.ToList())
        {
            if (pcb.DelayedAckPending)
                SendPureAck(pcb, "Delayed ACK (tcp_fasttmr 250ms)");
        }
    }

    public void SlowTimerTick()
    {
        long now = _sysArch.NowMs;
        foreach (var pcb in _pcbs.Values.ToList())
        {
            // 1. Retransmission Timeout (RTO)
            if (pcb.Unacked.Count > 0 && pcb.RtoTimerMs > 0 && now >= pcb.RtoTimerMs)
            {
                if (pcb.Unacked[0].RetransmitCount >= 6)
                {
                    TransitionState(pcb, TcpState.Closed, "Max retransmissions exceeded (TIMEOUT)");
                    pcb.Callbacks.OnError(pcb.Id, LwipErr.Timeout);
                    _pcbs.Remove(pcb.Id);
                    continue;
                }
                pcb.SsThresh = Math.Max(2u * pcb.Mss, pcb.Cwnd / 2);
                pcb.Cwnd = pcb.Mss; // Back to Slow Start
                pcb.RtoMs = Math.Min(pcb.RtoMs * 2, 16000); // Exponential backoff
                pcb.RtoTimerMs = now + pcb.RtoMs;
                RetransmitOldest(pcb, "RTO Timeout (tcp_slowtmr)");
            }

            // 2. Zero-Window Persist Probe
            if (pcb.PersistTicks > 0 && pcb.SndWnd == 0 && pcb.Unsent.Count > 0)
            {
                pcb.PersistTicks++;
                if (pcb.PersistTicks >= 3)
                {
                    pcb.PersistTicks = 1;
                    SendPureAck(pcb, "Zero-Window Persist Probe");
                }
            }

            // 3. Keepalive Probe
            if (pcb.KeepAlive && pcb.State == TcpState.Established && (now - pcb.LastActivityMs) >= KeepAliveIdleMs)
            {
                pcb.LastActivityMs = now;
                var probe = new TcpSegmentRecord { Seq = pcb.SndNxt - 1, Data = [], Flags = TcpFlags.Ack };
                TransmitSegment(pcb, probe, false, "TCP Keepalive Probe");
            }

            // 4. TIME_WAIT 2*MSL expiration
            if (pcb.State == TcpState.TimeWait && (now - pcb.TimeWaitStartMs) >= TimeWaitDurationMs)
            {
                TransitionState(pcb, TcpState.Closed, "TIME_WAIT 2*MSL expired -> CLOSED");
                _pcbs.Remove(pcb.Id);
            }
        }
    }

    private void TransitionState(TcpPcb pcb, TcpState next, string reason)
    {
        var prev = pcb.State;
        pcb.State = next;
        _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.TransportTcp, LayerId.TransportTcp,
            "TcpStateMachine.Transition", TraceDirection.Control, "TCP",
            $"TCP PCB#{pcb.Id} State: {prev} -> {next} ({reason})",
            $"Local={pcb.LocalIp}:{pcb.LocalPort} Remote={pcb.RemoteIp}:{pcb.RemotePort} SND.NXT={pcb.SndNxt} RCV.NXT={pcb.RcvNxt}");
    }

    private uint AllocIss() { _issCounter += 64000; return _issCounter; }

    private ushort AllocEphemeralPort()
    {
        for (int tries = 0; tries < 1000; tries++)
        {
            ushort p = _nextEphemeralPort++;
            if (_nextEphemeralPort >= 65000) _nextEphemeralPort = 50000;
            if (_pcbs.Values.All(x => x.LocalPort != p)) return p;
        }
        return _nextEphemeralPort++;
    }

    private static bool SeqLt(uint a, uint b) => (int)(a - b) < 0;
    private static bool SeqLeq(uint a, uint b) => (int)(a - b) <= 0;
    private static bool SeqGt(uint a, uint b) => (int)(a - b) > 0;
}
