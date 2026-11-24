using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

public sealed record PingResult(Ip4Address From, ushort Id, ushort Seq, byte Ttl, int Bytes, long RttMs);

/// <summary>
/// Layer 3: ICMPv4 Layer (lwIP icmp.c).
/// Handles Echo Request/Reply, Destination Unreachable, and Time Exceeded.
/// </summary>
public sealed class IcmpLayer : IIcmpLayer
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private IIp4Layer? _ip4;

    private readonly Dictionary<(ushort Id, ushort Seq), long> _pendingPings = new();
    public List<PingResult> RecentReplies { get; } = [];
    public event Action<PingResult>? OnEchoReply;

    public IcmpLayer(string nodeId, string nodeLabel, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _scheduler = scheduler;
        _stats = stats;
    }

    public void SetLowerLayer(IIp4Layer ip4) => _ip4 = ip4;

    public LwipErr SendEchoRequest(Ip4Address dstIp, ushort id, ushort seq, byte[] data)
    {
        if (_ip4 == null) return LwipErr.Rte;
        var p = Pbuf.Alloc(PbufLayer.Ip, 8 + data.Length);
        var s = p.PayloadSpan;
        s[0] = 8; // Echo Request
        s[1] = 0;
        s[2] = 0; s[3] = 0;
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(4, 2), id);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(6, 2), seq);
        data.CopyTo(s[8..]);

        ushort csum = Checksum.Compute(s);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), csum);

        _pendingPings[(id, seq)] = _scheduler.NowMs;
        _stats.Icmp.Xmit++;
        var bytes = p.ToLinearArray();

        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.NetworkIcmp, LayerId.NetworkIp4,
            "IIcmpLayer.SendEchoRequest -> IIp4Layer.Output",
            TraceDirection.DownTx,
            "ICMP",
            $"ICMP Echo Request -> {dstIp} id={id} seq={seq} ({data.Length}B)",
            $"Built ICMPv4 Echo Request (csum=0x{csum:X4})",
            bytes, "ICMP",
            () => _ip4.Output(Ip4Address.Any, dstIp, ProtocolNumbers.IpProtoIcmp, 64, p,
                $"ICMP Echo Req seq={seq}"));

        return LwipErr.Ok;
    }

    public LwipErr SendDestUnreachable(byte code, Ip4Address dstIp, ReadOnlySpan<byte> originalIpPacket)
    {
        if (_ip4 == null) return LwipErr.Rte;
        int copyLen = Math.Min(originalIpPacket.Length, 28);
        var p = Pbuf.Alloc(PbufLayer.Ip, 8 + copyLen);
        var s = p.PayloadSpan;
        s[0] = 3; // Dest Unreachable
        s[1] = code;
        originalIpPacket[..copyLen].CopyTo(s[8..]);
        ushort csum = Checksum.Compute(s);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), csum);

        _stats.Icmp.Xmit++;
        var bytes = p.ToLinearArray();
        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.NetworkIcmp, LayerId.NetworkIp4,
            "IIcmpLayer.SendDestUnreachable -> IIp4Layer.Output",
            TraceDirection.DownTx,
            "ICMP",
            $"ICMP Dest Unreachable (code={code}) -> {dstIp}",
            "Port/Protocol unreachable reported to source",
            bytes, "ICMP",
            () => _ip4.Output(Ip4Address.Any, dstIp, ProtocolNumbers.IpProtoIcmp, 64, p,
                $"ICMP Unreachable code={code}"));
        return LwipErr.Ok;
    }

    public LwipErr SendTimeExceeded(byte code, Ip4Address dstIp, ReadOnlySpan<byte> originalIpPacket)
    {
        if (_ip4 == null) return LwipErr.Rte;
        int copyLen = Math.Min(originalIpPacket.Length, 28);
        var p = Pbuf.Alloc(PbufLayer.Ip, 8 + copyLen);
        var s = p.PayloadSpan;
        s[0] = 11; // Time Exceeded
        s[1] = code;
        originalIpPacket[..copyLen].CopyTo(s[8..]);
        ushort csum = Checksum.Compute(s);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), csum);

        _stats.Icmp.Xmit++;
        var bytes = p.ToLinearArray();
        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.NetworkIcmp, LayerId.NetworkIp4,
            "IIcmpLayer.SendTimeExceeded -> IIp4Layer.Output",
            TraceDirection.DownTx,
            "ICMP",
            $"ICMP Time Exceeded (code={code}) -> {dstIp}",
            "TTL reached 0 during forwarding",
            bytes, "ICMP",
            () => _ip4.Output(Ip4Address.Any, dstIp, ProtocolNumbers.IpProtoIcmp, 64, p,
                "ICMP Time Exceeded"));
        return LwipErr.Ok;
    }

    public void Input(Pbuf icmpPayload, Ip4Address srcIp, Ip4Address dstIp, byte ttl)
    {
        if (icmpPayload.Length < 8)
        {
            _stats.Icmp.LenErr++;
            _stats.Icmp.Drop++;
            return;
        }

        var s = icmpPayload.ReadOnlyPayload;
        if (Checksum.Compute(s) != 0)
        {
            _stats.Icmp.ChkErr++;
            _stats.Icmp.Drop++;
            return;
        }

        _stats.Icmp.Recv++;
        byte type = s[0];
        ushort id = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        ushort seq = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2));

        if (type == 8 && _ip4 != null) // Echo Request -> send Echo Reply
        {
            var reply = Pbuf.FromBytes(s, PbufLayer.Ip);
            var rs = reply.PayloadSpan;
            rs[0] = 0; // Echo Reply
            rs[2] = 0; rs[3] = 0;
            ushort csum = Checksum.Compute(rs);
            BinaryPrimitives.WriteUInt16BigEndian(rs.Slice(2, 2), csum);

            _stats.Icmp.Xmit++;
            var bytes = reply.ToLinearArray();
            _scheduler.ScheduleHop(
                _nodeId, _nodeLabel,
                LayerId.NetworkIcmp, LayerId.NetworkIp4,
                "IcmpLayer [EchoReply] -> IIp4Layer.Output",
                TraceDirection.DownTx,
                "ICMP",
                $"ICMP Echo Reply -> {srcIp} id={id} seq={seq}",
                $"Replying to ICMP Echo Request from {srcIp}",
                bytes, "ICMP",
                () => _ip4.Output(Ip4Address.Any, srcIp, ProtocolNumbers.IpProtoIcmp, 64, reply,
                    $"ICMP Echo Reply seq={seq}"));
        }
        else if (type == 0) // Echo Reply
        {
            long rtt = _pendingPings.TryGetValue((id, seq), out var sentMs) ? Math.Max(1, _scheduler.NowMs - sentMs) : 0;
            _pendingPings.Remove((id, seq));
            var res = new PingResult(srcIp, id, seq, ttl, s.Length - 8, rtt);
            RecentReplies.Add(res);
            if (RecentReplies.Count > 50) RecentReplies.RemoveAt(0);
            OnEchoReply?.Invoke(res);

            _scheduler.RecordInstantEvent(
                _nodeId, _nodeLabel,
                LayerId.NetworkIcmp, LayerId.Application,
                "IcmpLayer -> PingCallback",
                TraceDirection.UpRx,
                "ICMP",
                $"PING REPLY from {srcIp}: bytes={res.Bytes} seq={seq} TTL={ttl} time={rtt}ms",
                "ICMPv4 Echo Reply matched pending ping request",
                s, "ICMP");
        }
    }
}
