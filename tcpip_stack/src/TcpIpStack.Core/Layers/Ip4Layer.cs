using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

public sealed record RouteEntry(Ip4Address Network, Ip4Address Netmask, Ip4Address NextHop, string InterfaceName, int Metric);

/// <summary>
/// Layer 3: IPv4 Layer (lwIP ip4.c + ip4_frag.c).
/// Supports header verification, routing table, loopback, IP forwarding (gateway mode),
/// and full IPv4 fragmentation & reassembly.
/// </summary>
public sealed class Ip4Layer : IIp4Layer
{
    private sealed class ReassemblyBuffer
    {
        public Ip4Address Src { get; init; }
        public Ip4Address Dst { get; init; }
        public ushort Id { get; init; }
        public byte Protocol { get; init; }
        public byte Ttl { get; init; }
        public int? TotalPayloadLen { get; set; }
        public int AgeSeconds { get; set; }
        public SortedDictionary<int, byte[]> Fragments { get; } = new();
    }

    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly Netif _netif;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private readonly List<RouteEntry> _routes = [];
    private readonly Dictionary<(Ip4Address, Ip4Address, ushort, byte), ReassemblyBuffer> _reass = new();
    private ushort _nextIpId = 1;

    private ILinkLayer? _link;
    private IArpLayer? _arp;
    private IIcmpLayer? _icmp;
    private IIgmpLayer? _igmp;
    private IUdpLayer? _udp;
    private ITcpLayer? _tcp;
    private IRawLayer? _raw;

    public bool EnableForwarding { get; set; }

    public Ip4Address LocalIp { get => _netif.Ip4Addr; set => _netif.Ip4Addr = value; }
    public Ip4Address Netmask { get => _netif.Netmask; set => _netif.Netmask = value; }
    public Ip4Address Gateway { get => _netif.Gateway; set => _netif.Gateway = value; }

    public Ip4Layer(string nodeId, string nodeLabel, Netif netif, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _netif = netif;
        _scheduler = scheduler;
        _stats = stats;
    }

    public void SetLowerLayers(ILinkLayer link, IArpLayer arp)
    {
        _link = link;
        _arp = arp;
    }

    public void RegisterUpperLayers(IIcmpLayer icmp, IIgmpLayer igmp, IUdpLayer udp, ITcpLayer tcp, IRawLayer raw)
    {
        _icmp = icmp;
        _igmp = igmp;
        _udp = udp;
        _tcp = tcp;
        _raw = raw;
    }

    public void AddRoute(RouteEntry route) => _routes.Add(route);

    public IReadOnlyList<RouteEntry> GetRoutingTable()
    {
        var list = new List<RouteEntry>
        {
            new(new Ip4Address(127, 0, 0, 0), new Ip4Address(255, 0, 0, 0), Ip4Address.Loopback, "lo0", 0),
            new(new Ip4Address(_netif.Ip4Addr.Value & _netif.Netmask.Value), _netif.Netmask, Ip4Address.Any, _netif.Name, 1)
        };
        list.AddRange(_routes);
        if (!_netif.Gateway.IsAny)
            list.Add(new RouteEntry(Ip4Address.Any, Ip4Address.Any, _netif.Gateway, _netif.Name, 10));
        return list;
    }

    public int ActiveReassemblyCount => _reass.Count;

    public Ip4Address ResolveNextHop(Ip4Address dstIp)
    {
        if (dstIp.IsLoopback || dstIp == _netif.Ip4Addr) return dstIp;
        if (dstIp.IsBroadcast || dstIp.IsMulticast) return dstIp;
        if (!_netif.Ip4Addr.IsAny && dstIp.InSameSubnet(_netif.Ip4Addr, _netif.Netmask)) return dstIp;

        // Longest-prefix match in explicit routing table
        RouteEntry? best = null;
        uint bestMask = 0;
        foreach (var r in _routes)
        {
            if ((dstIp.Value & r.Netmask.Value) == (r.Network.Value & r.Netmask.Value))
            {
                if (best == null || r.Netmask.Value > bestMask)
                {
                    best = r;
                    bestMask = r.Netmask.Value;
                }
            }
        }
        if (best != null) return best.NextHop.IsAny ? dstIp : best.NextHop;

        return !_netif.Gateway.IsAny ? _netif.Gateway : dstIp;
    }

    public LwipErr Output(Ip4Address srcIp, Ip4Address dstIp, byte protocol, byte ttl, Pbuf payload, string summary)
    {
        if (_link == null || _arp == null) return LwipErr.If;

        var effectiveSrc = srcIp.IsAny ? (dstIp.IsLoopback ? Ip4Address.Loopback : _netif.Ip4Addr) : srcIp;
        int mtu = Math.Max(68, _netif.Mtu);
        ushort ipId = _nextIpId++;

        // Fragmentation if IP header (20) + payload > MTU (lwIP ip4_frag)
        if (20 + payload.Length > mtu && !dstIp.IsLoopback)
        {
            return FragmentAndSend(effectiveSrc, dstIp, protocol, ttl, ipId, payload, mtu, summary);
        }

        return SendSingleDatagram(effectiveSrc, dstIp, protocol, ttl, ipId, 0, false, payload, summary);
    }

    private LwipErr FragmentAndSend(
        Ip4Address srcIp, Ip4Address dstIp, byte protocol, byte ttl, ushort ipId,
        Pbuf payload, int mtu, string summary)
    {
        byte[] all = payload.ToLinearArray();
        int maxFragPayload = ((mtu - 20) / 8) * 8;
        if (maxFragPayload < 8) maxFragPayload = 8;

        int fragCount = (all.Length + maxFragPayload - 1) / maxFragPayload;
        _scheduler.RecordInstantEvent(
            _nodeId, _nodeLabel,
            LayerId.NetworkIp4, LayerId.NetworkIp4,
            "Ip4Layer.Fragment (ip4_frag)",
            TraceDirection.Control,
            "IPV4",
            $"IPv4 Fragmenting {all.Length}B into {fragCount} fragments (MTU={mtu}, ID=0x{ipId:X4})",
            $"Payload exceeds MTU {mtu}; splitting into 8-byte aligned fragments");

        int offset = 0;
        int fragIdx = 1;
        while (offset < all.Length)
        {
            int len = Math.Min(maxFragPayload, all.Length - offset);
            bool moreFrags = (offset + len) < all.Length;
            var fragPbuf = Pbuf.FromBytes(all.AsSpan(offset, len), PbufLayer.Ip);
            _stats.Ip4Frag.Xmit++;

            var err = SendSingleDatagram(srcIp, dstIp, protocol, ttl, ipId, offset, moreFrags, fragPbuf,
                $"[Frag {fragIdx}/{fragCount} off={offset} MF={(moreFrags ? 1 : 0)}] {summary}");
            if (err != LwipErr.Ok) return err;

            offset += len;
            fragIdx++;
        }
        return LwipErr.Ok;
    }

    private LwipErr SendSingleDatagram(
        Ip4Address srcIp, Ip4Address dstIp, byte protocol, byte ttl,
        ushort ipId, int fragOffsetBytes, bool moreFrags, Pbuf payload, string summary)
    {
        payload.PrependHeader(20);
        var hdr = payload.PayloadSpan;
        ushort totalLen = (ushort)payload.Length;
        ushort flagsFrag = (ushort)((moreFrags ? 0x2000 : 0) | ((fragOffsetBytes / 8) & 0x1FFF));

        hdr[0] = 0x45; // IPv4, IHL=5 (20 bytes)
        hdr[1] = 0x00; // DSCP/ECN
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(2, 2), totalLen);
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(4, 2), ipId);
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(6, 2), flagsFrag);
        hdr[8] = ttl;
        hdr[9] = protocol;
        hdr[10] = 0; hdr[11] = 0;
        srcIp.WriteTo(hdr.Slice(12, 4));
        dstIp.WriteTo(hdr.Slice(16, 4));

        ushort csum = Checksum.Compute(hdr[..20]);
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(10, 2), csum);

        _stats.Ip4.Xmit++;
        var bytes = payload.ToLinearArray();

        // Loopback check
        if (dstIp.IsLoopback || (!dstIp.IsAny && dstIp == _netif.Ip4Addr))
        {
            _scheduler.ScheduleHop(
                _nodeId, _nodeLabel,
                LayerId.NetworkIp4, LayerId.LinkEthernet,
                "IIp4Layer -> ILinkLayer.SendLoopbackIpv4",
                TraceDirection.DownTx,
                "IPV4",
                $"IPv4 TX (loopback) {srcIp} -> {dstIp} Len={totalLen} | {summary}",
                "Destination is local/loopback; handing to lo0",
                bytes,
                "IPV4",
                () => _link!.SendLoopbackIpv4(payload, summary));
            return LwipErr.Ok;
        }

        var nextHop = ResolveNextHop(dstIp);
        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.NetworkIp4, LayerId.LinkArp,
            "IIp4Layer.Output -> IArpLayer.Output",
            TraceDirection.DownTx,
            "IPV4",
            $"IPv4 TX {srcIp} -> {dstIp} (via {nextHop}) TTL={ttl} Len={totalLen} | {summary}",
            $"Prepended 20-byte IPv4 header (csum=0x{csum:X4}, nextHop={nextHop}), handing to ARP layer",
            bytes,
            "IPV4",
            () => _arp!.Output(nextHop, payload, summary));

        return LwipErr.Ok;
    }

    public void Input(Pbuf packet, bool fromLoopback = false)
    {
        if (packet.Length < 20)
        {
            _stats.Ip4.LenErr++;
            _stats.Ip4.Drop++;
            return;
        }

        var s = packet.ReadOnlyPayload;
        int version = s[0] >> 4;
        int ihl = (s[0] & 0x0F) * 4;
        if (version != 4 || ihl < 20 || packet.Length < ihl)
        {
            _stats.Ip4.Err++;
            _stats.Ip4.Drop++;
            return;
        }

        // RFC 1071 IPv4 header checksum verification
        if (Checksum.Compute(s[..ihl]) != 0)
        {
            _stats.Ip4.ChkErr++;
            _stats.Ip4.Drop++;
            _scheduler.RecordInstantEvent(
                _nodeId, _nodeLabel,
                LayerId.NetworkIp4, LayerId.NetworkIp4,
                "Ip4Layer.Input [CHECKSUM FAIL]",
                TraceDirection.UpRx,
                "IPV4",
                "IPv4 Header Checksum INVALID - packet dropped!",
                "RFC 1071 one's complement header checksum != 0",
                s, "IPV4", dropped: true, dropReason: "IPv4 Checksum Error");
            return;
        }

        ushort totalLen = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        if (totalLen < ihl || totalLen > packet.Length)
        {
            _stats.Ip4.LenErr++;
            _stats.Ip4.Drop++;
            return;
        }

        ushort ipId = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        ushort flagsFrag = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2));
        bool mf = (flagsFrag & 0x2000) != 0;
        int fragOffset = (flagsFrag & 0x1FFF) * 8;
        byte ttl = s[8];
        byte proto = s[9];
        var srcIp = Ip4Address.FromSpan(s.Slice(12, 4));
        var dstIp = Ip4Address.FromSpan(s.Slice(16, 4));

        _stats.Ip4.Recv++;

        // Is this packet addressed to us?
        bool forUs = fromLoopback ||
                     dstIp == _netif.Ip4Addr ||
                     dstIp.IsBroadcast ||
                     dstIp.IsSubnetBroadcast(_netif.Ip4Addr, _netif.Netmask) ||
                     dstIp.IsMulticast ||
                     (_netif.Ip4Addr.IsAny && proto == ProtocolNumbers.IpProtoUdp); // DHCP before IP bound

        if (!forUs)
        {
            if (EnableForwarding)
            {
                ForwardPacket(packet, srcIp, dstIp, ttl, ihl, totalLen);
            }
            else
            {
                _stats.Ip4.Drop++;
            }
            return;
        }

        // Trim Ethernet padding if packet.Length > totalLen
        var trimmedPayload = s.Slice(ihl, totalLen - ihl).ToArray();

        // Handle IPv4 Reassembly (lwIP ip4_reass)
        if (mf || fragOffset > 0)
        {
            _stats.Ip4Frag.Recv++;
            var reassembled = TryReassemble(srcIp, dstIp, ipId, proto, ttl, fragOffset, mf, trimmedPayload);
            if (reassembled == null) return;
            trimmedPayload = reassembled;
        }

        // Raw PCBs inspect incoming IP packet before transport dispatch (lwIP raw_input)
        var rawCopy = Pbuf.FromBytes(s[..totalLen]);
        _raw?.InputIpv4(rawCopy, srcIp, dstIp, proto);

        var upperPbuf = Pbuf.FromBytes(trimmedPayload, PbufLayer.Raw);
        DispatchToUpper(proto, upperPbuf, srcIp, dstIp, ttl);
    }

    private void ForwardPacket(Pbuf packet, Ip4Address srcIp, Ip4Address dstIp, byte ttl, int ihl, ushort totalLen)
    {
        if (ttl <= 1)
        {
            _stats.Ip4.Drop++;
            _icmp?.SendTimeExceeded(0, srcIp, packet.ReadOnlyPayload[..Math.Min(packet.Length, ihl + 8)]);
            return;
        }

        var copy = Pbuf.FromBytes(packet.ReadOnlyPayload[..totalLen], PbufLayer.Link);
        var hdr = copy.PayloadSpan;
        hdr[8] = (byte)(ttl - 1);
        hdr[10] = 0; hdr[11] = 0;
        ushort csum = Checksum.Compute(hdr[..ihl]);
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(10, 2), csum);

        _stats.Ip4.Fw++;
        var nextHop = ResolveNextHop(dstIp);
        var raw = copy.ToLinearArray();

        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.NetworkIp4, LayerId.LinkArp,
            "Ip4Layer.Forward -> IArpLayer.Output",
            TraceDirection.DownTx,
            "IPV4",
            $"IPv4 FORWARD {srcIp} -> {dstIp} (TTL {ttl}->{ttl - 1}, nextHop={nextHop})",
            $"Gateway router decremented TTL, recomputed IP checksum (0x{csum:X4}), forwarding to {nextHop}",
            raw,
            "IPV4",
            () => _arp!.Output(nextHop, copy, $"FWD {srcIp}->{dstIp}"));
    }

    private byte[]? TryReassemble(
        Ip4Address src, Ip4Address dst, ushort id, byte proto, byte ttl,
        int fragOffset, bool moreFrags, byte[] data)
    {
        var key = (src, dst, id, proto);
        if (!_reass.TryGetValue(key, out var buf))
        {
            buf = new ReassemblyBuffer { Src = src, Dst = dst, Id = id, Protocol = proto, Ttl = ttl };
            _reass[key] = buf;
        }
        buf.Fragments[fragOffset] = data;
        if (!moreFrags) buf.TotalPayloadLen = fragOffset + data.Length;

        if (!buf.TotalPayloadLen.HasValue)
        {
            _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.NetworkIp4, LayerId.NetworkIp4,
                "Ip4Layer.Reassemble (ip4_reass)", TraceDirection.Control, "IPV4",
                $"Buffered IPv4 fragment ID=0x{id:X4} off={fragOffset} len={data.Length} (waiting for more)",
                $"Have {buf.Fragments.Count} fragment(s) in reassembly buffer");
            return null;
        }

        // Check contiguous coverage from 0 to TotalPayloadLen
        int expected = 0;
        foreach (var kv in buf.Fragments)
        {
            if (kv.Key != expected) return null;
            expected += kv.Value.Length;
        }
        if (expected != buf.TotalPayloadLen.Value) return null;

        var assembled = new byte[expected];
        int pos = 0;
        foreach (var kv in buf.Fragments)
        {
            kv.Value.CopyTo(assembled, pos);
            pos += kv.Value.Length;
        }
        _reass.Remove(key);

        _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.NetworkIp4, LayerId.NetworkIp4,
            "Ip4Layer.Reassemble [COMPLETE]", TraceDirection.Control, "IPV4",
            $"Reassembled IPv4 datagram ID=0x{id:X4} ({assembled.Length}B from {buf.Fragments.Count} fragments)",
            "All IPv4 fragments received and reassembled into contiguous upper-layer payload");
        return assembled;
    }

    private void DispatchToUpper(byte proto, Pbuf payload, Ip4Address srcIp, Ip4Address dstIp, byte ttl)
    {
        var bytes = payload.ToLinearArray();
        switch (proto)
        {
            case ProtocolNumbers.IpProtoIcmp when _icmp != null:
                _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp4, LayerId.NetworkIcmp,
                    "Ip4Layer -> IIcmpLayer.Input", TraceDirection.UpRx, "ICMP",
                    $"IPv4 RX {srcIp} -> {dstIp} [ICMP] ({bytes.Length}B)",
                    "Stripped 20-byte IPv4 header, passing payload to ICMPv4 layer",
                    bytes, "ICMP", () => _icmp.Input(payload, srcIp, dstIp, ttl));
                break;

            case ProtocolNumbers.IpProtoIgmp when _igmp != null:
                _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp4, LayerId.NetworkIgmp,
                    "Ip4Layer -> IIgmpLayer.Input", TraceDirection.UpRx, "IGMP",
                    $"IPv4 RX {srcIp} -> {dstIp} [IGMP] ({bytes.Length}B)",
                    "Stripped 20-byte IPv4 header, passing payload to IGMPv2 layer",
                    bytes, "IGMP", () => _igmp.Input(payload, srcIp, dstIp));
                break;

            case ProtocolNumbers.IpProtoUdp when _udp != null:
                _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp4, LayerId.TransportUdp,
                    "Ip4Layer -> IUdpLayer.InputIpv4", TraceDirection.UpRx, "UDP",
                    $"IPv4 RX {srcIp} -> {dstIp} [UDP] ({bytes.Length}B)",
                    "Stripped 20-byte IPv4 header, passing datagram to UDP layer",
                    bytes, "UDP", () => _udp.InputIpv4(payload, srcIp, dstIp));
                break;

            case ProtocolNumbers.IpProtoTcp when _tcp != null:
                _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.NetworkIp4, LayerId.TransportTcp,
                    "Ip4Layer -> ITcpLayer.InputIpv4", TraceDirection.UpRx, "TCP",
                    $"IPv4 RX {srcIp} -> {dstIp} [TCP] ({bytes.Length}B)",
                    "Stripped 20-byte IPv4 header, passing segment to TCP layer",
                    bytes, "TCP", () => _tcp.InputIpv4(payload, srcIp, dstIp));
                break;

            default:
                _stats.Ip4.ProtErr++;
                break;
        }
    }

    public void TimerTick()
    {
        var expired = _reass.Where(kv => ++kv.Value.AgeSeconds > 15).Select(kv => kv.Key).ToList();
        foreach (var k in expired)
        {
            _reass.Remove(k);
            _stats.Ip4Frag.Drop++;
        }
    }
}
