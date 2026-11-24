using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

/// <summary>
/// Layer 3: IPv6 + ICMPv6 Layer (lwIP ip6.c + icmp6.c).
/// Lower boundaries: ILinkLayer, INdpLayer.
/// Upper boundaries: IUdpLayer, ITcpLayer, IRawLayer, INdpLayer.
/// </summary>
public sealed class Ip6Layer : IIp6Layer
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly Netif _netif;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;

    private ILinkLayer? _link;
    private INdpLayer? _ndp;
    private IUdpLayer? _udp;
    private ITcpLayer? _tcp;
    private IRawLayer? _raw;

    public Ip6Address LinkLocalIp { get => _netif.Ip6LinkLocal; set => _netif.Ip6LinkLocal = value; }
    public Ip6Address GlobalIp { get => _netif.Ip6Global; set => _netif.Ip6Global = value; }

    public Ip6Layer(string nodeId, string nodeLabel, Netif netif, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _netif = netif;
        _scheduler = scheduler;
        _stats = stats;
    }

    public void SetLowerLayers(ILinkLayer link, INdpLayer ndp)
    {
        _link = link;
        _ndp = ndp;
    }

    public void RegisterUpperLayers(IUdpLayer udp, ITcpLayer tcp, IRawLayer raw)
    {
        _udp = udp;
        _tcp = tcp;
        _raw = raw;
    }

    public LwipErr Output(Ip6Address srcIp, Ip6Address dstIp, byte nextHeader, byte hopLimit, Pbuf payload, string summary)
    {
        if (_link == null || _ndp == null) return LwipErr.If;

        var effSrc = srcIp.IsAny ? (dstIp.IsLinkLocal || _netif.Ip6Global.IsAny ? _netif.Ip6LinkLocal : _netif.Ip6Global) : srcIp;
        ushort payloadLen = (ushort)payload.Length;

        payload.PrependHeader(40);
        var hdr = payload.PayloadSpan;
        BinaryPrimitives.WriteUInt32BigEndian(hdr[..4], 0x60000000); // Version 6
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(4, 2), payloadLen);
        hdr[6] = nextHeader;
        hdr[7] = hopLimit;
        effSrc.WriteTo(hdr.Slice(8, 16));
        dstIp.WriteTo(hdr.Slice(24, 16));

        _stats.Ip6.Xmit++;
        var bytes = payload.ToLinearArray();

        if (dstIp.IsLoopback || dstIp == _netif.Ip6LinkLocal || (!dstIp.IsAny && dstIp == _netif.Ip6Global))
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp6, LayerId.LinkEthernet,
                "IIp6Layer -> ILinkLayer.SendLoopbackIpv6", TraceDirection.DownTx, "IPV6",
                $"IPv6 TX (loopback) {effSrc} -> {dstIp} | {summary}",
                "Loopback IPv6 packet via lo0", bytes, "IPV6",
                () => _link.SendLoopbackIpv6(payload, summary));
            return LwipErr.Ok;
        }

        _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp6, LayerId.LinkNdp,
            "IIp6Layer.Output -> INdpLayer.Output", TraceDirection.DownTx, "IPV6",
            $"IPv6 TX {effSrc} -> {dstIp} Hop={hopLimit} | {summary}",
            "Prepended 40-byte IPv6 header, handing to NDP layer for L2 MAC resolution",
            bytes, "IPV6",
            () => _ndp.Output(dstIp, payload, summary));

        return LwipErr.Ok;
    }

    public LwipErr SendEchoRequest(Ip6Address dstIp, ushort id, ushort seq, byte[] data)
    {
        var effSrc = dstIp.IsLinkLocal || _netif.Ip6Global.IsAny ? _netif.Ip6LinkLocal : _netif.Ip6Global;
        var p = Pbuf.Alloc(PbufLayer.Ip, 8 + data.Length);
        var s = p.PayloadSpan;
        s[0] = 128; // ICMPv6 Echo Request
        s[1] = 0;
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(4, 2), id);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(6, 2), seq);
        data.CopyTo(s[8..]);

        ushort csum = Checksum.ComputePseudoIpv6(effSrc, dstIp, ProtocolNumbers.IpProtoIcmpv6, s);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), csum);

        _stats.Icmp6.Xmit++;
        return Output(effSrc, dstIp, ProtocolNumbers.IpProtoIcmpv6, 64, p, $"ICMPv6 Echo Request seq={seq}");
    }

    public void Input(Pbuf packet, bool fromLoopback = false)
    {
        if (packet.Length < 40) { _stats.Ip6.LenErr++; _stats.Ip6.Drop++; return; }
        var s = packet.ReadOnlyPayload;
        if ((s[0] >> 4) != 6) { _stats.Ip6.Err++; _stats.Ip6.Drop++; return; }

        ushort payloadLen = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        byte nextHeader = s[6];
        var srcIp = Ip6Address.FromSpan(s.Slice(8, 16));
        var dstIp = Ip6Address.FromSpan(s.Slice(24, 16));

        bool forUs = fromLoopback || dstIp.IsMulticast || dstIp == _netif.Ip6LinkLocal ||
                     (!_netif.Ip6Global.IsAny && dstIp == _netif.Ip6Global);
        if (!forUs) { _stats.Ip6.Drop++; return; }

        _stats.Ip6.Recv++;
        int actualLen = Math.Min(payloadLen, packet.Length - 40);
        var payloadBytes = s.Slice(40, actualLen).ToArray();
        var upper = Pbuf.FromBytes(payloadBytes, PbufLayer.Raw);

        _raw?.InputIpv6(packet, srcIp, dstIp, nextHeader);

        switch (nextHeader)
        {
            case ProtocolNumbers.IpProtoIcmpv6:
                HandleIcmp6(payloadBytes, srcIp, dstIp);
                break;
            case ProtocolNumbers.IpProtoUdp when _udp != null:
                _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp6, LayerId.TransportUdp,
                    "Ip6Layer -> IUdpLayer.InputIpv6", TraceDirection.UpRx, "UDP",
                    $"IPv6 RX {srcIp} -> {dstIp} [UDP]", "Dispatching IPv6 payload to UDP",
                    payloadBytes, "UDP", () => _udp.InputIpv6(upper, srcIp, dstIp));
                break;
            case ProtocolNumbers.IpProtoTcp when _tcp != null:
                _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp6, LayerId.TransportTcp,
                    "Ip6Layer -> ITcpLayer.InputIpv6", TraceDirection.UpRx, "TCP",
                    $"IPv6 RX {srcIp} -> {dstIp} [TCP]", "Dispatching IPv6 payload to TCP",
                    payloadBytes, "TCP", () => _tcp.InputIpv6(upper, srcIp, dstIp));
                break;
            default:
                _stats.Ip6.ProtErr++;
                break;
        }
    }

    private void HandleIcmp6(byte[] payload, Ip6Address srcIp, Ip6Address dstIp)
    {
        if (payload.Length < 8) { _stats.Icmp6.LenErr++; return; }
        if (Checksum.ComputePseudoIpv6(srcIp, dstIp, ProtocolNumbers.IpProtoIcmpv6, payload) != 0)
        {
            _stats.Icmp6.ChkErr++;
            return;
        }
        _stats.Icmp6.Recv++;
        byte type = payload[0];

        if (type == 135 && _ndp != null) // Neighbor Solicitation
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp6, LayerId.LinkNdp,
                "Ip6Layer -> INdpLayer.HandleNeighborSolicitation", TraceDirection.UpRx, "NDP",
                $"ICMPv6 Neighbor Solicitation from {srcIp}", "Dispatching NS to NDP layer",
                payload, "ICMPV6", () => _ndp.HandleNeighborSolicitation(srcIp, payload));
        }
        else if (type == 136 && _ndp != null) // Neighbor Advertisement
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp6, LayerId.LinkNdp,
                "Ip6Layer -> INdpLayer.HandleNeighborAdvertisement", TraceDirection.UpRx, "NDP",
                $"ICMPv6 Neighbor Advertisement from {srcIp}", "Dispatching NA to NDP layer",
                payload, "ICMPV6", () => _ndp.HandleNeighborAdvertisement(srcIp, payload));
        }
        else if (type == 128) // Echo Request -> Reply
        {
            var reply = Pbuf.FromBytes(payload, PbufLayer.Ip);
            var rs = reply.PayloadSpan;
            rs[0] = 129; // Echo Reply
            rs[2] = 0; rs[3] = 0;
            var mySrc = dstIp.IsMulticast ? _netif.Ip6LinkLocal : dstIp;
            ushort csum = Checksum.ComputePseudoIpv6(mySrc, srcIp, ProtocolNumbers.IpProtoIcmpv6, rs);
            BinaryPrimitives.WriteUInt16BigEndian(rs.Slice(2, 2), csum);
            _stats.Icmp6.Xmit++;
            Output(mySrc, srcIp, ProtocolNumbers.IpProtoIcmpv6, 64, reply, $"ICMPv6 Echo Reply -> {srcIp}");
        }
        else if (type == 129) // Echo Reply
        {
            ushort id = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(4, 2));
            ushort seq = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(6, 2));
            _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.NetworkIp6, LayerId.Application,
                "Ip6Layer -> Ping6Callback", TraceDirection.UpRx, "ICMPV6",
                $"PING6 REPLY from {srcIp}: id={id} seq={seq} bytes={payload.Length - 8}",
                "ICMPv6 Echo Reply delivered to application", payload, "ICMPV6");
        }
    }
}
