using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

public sealed class NdpCacheEntry
{
    public Ip6Address Ip6 { get; init; }
    public MacAddress Mac { get; set; }
    public string State { get; set; } = "INCOMPLETE";
    public int AgeSeconds { get; set; }
    public Queue<(Pbuf Packet, string Summary)> PendingQueue { get; } = new();
}

/// <summary>
/// Layer 2.5: IPv6 Neighbor Discovery Protocol (lwIP nd6.c).
/// Handles Neighbor Solicitation (ICMPv6 135), Neighbor Advertisement (ICMPv6 136), and neighbor cache.
/// </summary>
public sealed class NdpLayer : INdpLayer
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly Netif _netif;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private readonly Dictionary<Ip6Address, NdpCacheEntry> _cache = new();

    private ILinkLayer? _link;
    private IIp6Layer? _ip6;

    public NdpLayer(string nodeId, string nodeLabel, Netif netif, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _netif = netif;
        _scheduler = scheduler;
        _stats = stats;
    }

    public void SetLowerLayer(ILinkLayer link) => _link = link;
    public void SetIp6Layer(IIp6Layer ip6) => _ip6 = ip6;
    public IReadOnlyCollection<NdpCacheEntry> GetCacheEntries() => _cache.Values.ToList();
    public void FlushCache() => _cache.Clear();

    public LwipErr Output(Ip6Address nextHopIp, Pbuf ip6Packet, string summary)
    {
        if (_link == null) return LwipErr.If;

        if (nextHopIp.IsMulticast)
        {
            var mcastMac = MacAddress.ForIpv6Multicast(nextHopIp);
            return SendToEthernet(mcastMac, ip6Packet, summary, $"IPv6 Multicast MAC {mcastMac}");
        }

        if (_cache.TryGetValue(nextHopIp, out var entry) && entry.State == "REACHABLE")
        {
            _stats.Nd6.CacheHit++;
            return SendToEthernet(entry.Mac, ip6Packet, summary, $"NDP cache HIT: {nextHopIp} -> {entry.Mac}");
        }

        if (entry == null)
        {
            entry = new NdpCacheEntry { Ip6 = nextHopIp, State = "INCOMPLETE" };
            _cache[nextHopIp] = entry;
        }
        entry.PendingQueue.Enqueue((ip6Packet, summary));
        SendNeighborSolicitation(nextHopIp);
        return LwipErr.Ok;
    }

    private LwipErr SendToEthernet(MacAddress dstMac, Pbuf ip6Packet, string summary, string detail)
    {
        var bytes = ip6Packet.ToLinearArray();
        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.LinkNdp, LayerId.LinkEthernet,
            "INdpLayer -> ILinkLayer.SendFrame(0x86DD)",
            TraceDirection.DownTx,
            "IPV6",
            $"NDP -> Eth ({dstMac}): {summary}",
            detail,
            bytes,
            "IPV6",
            () => _link!.SendFrame(dstMac, ProtocolNumbers.EtherTypeIpv6, ip6Packet, summary));
        return LwipErr.Ok;
    }

    private void SendNeighborSolicitation(Ip6Address targetIp)
    {
        if (_ip6 == null) return;
        // ICMPv6 NS: Type=135, Code=0, Csum, Reserved(4), TargetAddr(16), Option Source LLA(8)
        var p = Pbuf.Alloc(PbufLayer.Ip, 32);
        var s = p.PayloadSpan;
        s[0] = 135; s[1] = 0;
        targetIp.WriteTo(s.Slice(8, 16));
        s[24] = 1; // Source Link-Layer Address option
        s[25] = 1; // length in units of 8 bytes
        _netif.HwAddr.WriteTo(s.Slice(26, 6));

        var dst = Ip6Address.SolicitedNodeMulticast(targetIp);
        ushort csum = Checksum.ComputePseudoIpv6(_netif.Ip6LinkLocal, dst, ProtocolNumbers.IpProtoIcmpv6, s);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), csum);

        _stats.Nd6.Xmit++;
        _ip6.Output(_netif.Ip6LinkLocal, dst, ProtocolNumbers.IpProtoIcmpv6, 255, p,
            $"NDP Neighbor Solicitation for {targetIp}");
    }

    public void HandleNeighborSolicitation(Ip6Address srcIp, ReadOnlySpan<byte> icmp6Payload)
    {
        if (icmp6Payload.Length < 24 || _ip6 == null) return;
        _stats.Nd6.Recv++;
        var target = Ip6Address.FromSpan(icmp6Payload.Slice(8, 16));

        if (icmp6Payload.Length >= 32 && icmp6Payload[24] == 1 && icmp6Payload[25] == 1)
        {
            var srcMac = MacAddress.FromSpan(icmp6Payload.Slice(26, 6));
            UpdateCache(srcIp, srcMac);
        }

        if (target == _netif.Ip6LinkLocal || (!target.IsAny && target == _netif.Ip6Global))
        {
            // Send Neighbor Advertisement (Type 136)
            var p = Pbuf.Alloc(PbufLayer.Ip, 32);
            var s = p.PayloadSpan;
            s[0] = 136; s[1] = 0;
            s[4] = 0x60; // Solicited + Override flags
            target.WriteTo(s.Slice(8, 16));
            s[24] = 2; // Target Link-Layer Address option
            s[25] = 1;
            _netif.HwAddr.WriteTo(s.Slice(26, 6));

            ushort csum = Checksum.ComputePseudoIpv6(target, srcIp, ProtocolNumbers.IpProtoIcmpv6, s);
            BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), csum);

            _stats.Nd6.Xmit++;
            _ip6.Output(target, srcIp, ProtocolNumbers.IpProtoIcmpv6, 255, p,
                $"NDP Neighbor Advertisement: {target} is at {_netif.HwAddr}");
        }
    }

    public void HandleNeighborAdvertisement(Ip6Address srcIp, ReadOnlySpan<byte> icmp6Payload)
    {
        if (icmp6Payload.Length < 24) return;
        _stats.Nd6.Recv++;
        var target = Ip6Address.FromSpan(icmp6Payload.Slice(8, 16));
        if (icmp6Payload.Length >= 32 && icmp6Payload[24] == 2 && icmp6Payload[25] == 1)
        {
            var mac = MacAddress.FromSpan(icmp6Payload.Slice(26, 6));
            UpdateCache(target, mac);
        }
    }

    private void UpdateCache(Ip6Address ip, MacAddress mac)
    {
        if (!_cache.TryGetValue(ip, out var entry))
        {
            entry = new NdpCacheEntry { Ip6 = ip };
            _cache[ip] = entry;
        }
        entry.Mac = mac;
        entry.State = "REACHABLE";
        entry.AgeSeconds = 0;

        while (entry.PendingQueue.Count > 0)
        {
            var (pkt, sum) = entry.PendingQueue.Dequeue();
            SendToEthernet(mac, pkt, sum, $"Flushed from NDP queue ({ip} -> {mac})");
        }
    }

    public void TimerTick()
    {
        var remove = new List<Ip6Address>();
        foreach (var kv in _cache)
        {
            kv.Value.AgeSeconds++;
            if (kv.Value.AgeSeconds > 120) remove.Add(kv.Key);
        }
        foreach (var k in remove) _cache.Remove(k);
    }
}
