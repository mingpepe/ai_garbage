using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

public enum ArpEntryState { Empty, Pending, Stable }

public sealed class ArpCacheEntry
{
    public Ip4Address Ip { get; init; }
    public MacAddress Mac { get; set; }
    public ArpEntryState State { get; set; }
    public int AgeSeconds { get; set; }
    public Queue<(Pbuf Packet, string Summary)> PendingQueue { get; } = new();
}

/// <summary>
/// Layer 2.5: ARP Layer (lwIP etharp.c).
/// Maintains ARP cache, pending packet queue (etharp_q_entry), Gratuitous ARP, and ARP probing.
/// </summary>
public sealed class ArpLayer : IArpLayer
{
    private const int ArpMaxAgeSeconds = 300;
    private const int ArpPendingTimeoutSeconds = 5;

    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly Netif _netif;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private readonly Dictionary<Ip4Address, ArpCacheEntry> _cache = new();

    private ILinkLayer? _link;
    private IIp4Layer? _ip4;

    public event Action<Ip4Address, MacAddress>? OnArpConflictDetected;

    public ArpLayer(string nodeId, string nodeLabel, Netif netif, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _netif = netif;
        _scheduler = scheduler;
        _stats = stats;
    }

    public void SetLowerLayer(ILinkLayer link) => _link = link;
    public void SetUpperLayer(IIp4Layer ip4) => _ip4 = ip4;

    public IReadOnlyCollection<ArpCacheEntry> GetCacheEntries() => _cache.Values.ToList();

    public void FlushCache() => _cache.Clear();

    public LwipErr Output(Ip4Address nextHopIp, Pbuf ipPacket, string summary)
    {
        if (_link == null) return LwipErr.If;

        // Broadcast or Multicast fast-path
        if (nextHopIp.IsBroadcast || nextHopIp.IsSubnetBroadcast(_netif.Ip4Addr, _netif.Netmask))
        {
            return DispatchToEthernet(MacAddress.Broadcast, ipPacket, summary, "Broadcast MAC FF:FF:FF:FF:FF:FF");
        }
        if (nextHopIp.IsMulticast)
        {
            var mcastMac = MacAddress.ForIpv4Multicast(nextHopIp);
            return DispatchToEthernet(mcastMac, ipPacket, summary, $"IPv4 Multicast MAC {mcastMac}");
        }

        if (_cache.TryGetValue(nextHopIp, out var entry) && entry.State == ArpEntryState.Stable)
        {
            _stats.EthArp.CacheHit++;
            return DispatchToEthernet(entry.Mac, ipPacket, summary, $"ARP cache HIT: {nextHopIp} -> {entry.Mac}");
        }

        // Cache MISS: queue IP packet and transmit ARP Request only on initial Pending transition
        bool isNewPending = entry == null;
        if (entry == null)
        {
            entry = new ArpCacheEntry { Ip = nextHopIp, State = ArpEntryState.Pending, AgeSeconds = 0 };
            _cache[nextHopIp] = entry;
        }
        entry.PendingQueue.Enqueue((ipPacket, summary));

        _scheduler.RecordInstantEvent(
            _nodeId, _nodeLabel,
            LayerId.LinkArp, LayerId.LinkArp,
            "IArpLayer.Output [Cache MISS]",
            TraceDirection.Control,
            "ARP",
            isNewPending
                ? $"ARP MISS for {nextHopIp}: queued IP packet ({entry.PendingQueue.Count} pending), issuing ARP Request"
                : $"ARP PENDING for {nextHopIp}: queued IP packet ({entry.PendingQueue.Count} pending), waiting for ARP Reply",
            $"Packet '{summary}' held in etharp pending queue until {nextHopIp} replies");

        return isNewPending ? SendRequest(nextHopIp) : LwipErr.Ok;
    }

    private LwipErr DispatchToEthernet(MacAddress dstMac, Pbuf ipPacket, string summary, string detail)
    {
        var bytes = ipPacket.ToLinearArray();
        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.LinkArp, LayerId.LinkEthernet,
            "IArpLayer -> ILinkLayer.SendFrame(0x0800)",
            TraceDirection.DownTx,
            "IPV4",
            $"ARP resolved {dstMac} -> Eth: {summary}",
            detail,
            bytes,
            "IPV4",
            () => _link!.SendFrame(dstMac, ProtocolNumbers.EtherTypeIpv4, ipPacket, summary));
        return LwipErr.Ok;
    }

    public LwipErr SendRequest(Ip4Address targetIp) =>
        SendRawArp(1, _netif.HwAddr, _netif.Ip4Addr, MacAddress.Zero, targetIp, MacAddress.Broadcast,
            $"ARP Request: Who has {targetIp}? Tell {_netif.Ip4Addr}");

    public LwipErr SendGratuitousArp() =>
        SendRawArp(1, _netif.HwAddr, _netif.Ip4Addr, MacAddress.Zero, _netif.Ip4Addr, MacAddress.Broadcast,
            $"Gratuitous ARP: {_netif.Ip4Addr} is at {_netif.HwAddr}");

    public LwipErr SendProbe(Ip4Address probeIp) =>
        SendRawArp(1, _netif.HwAddr, Ip4Address.Any, MacAddress.Zero, probeIp, MacAddress.Broadcast,
            $"ARP Probe (RFC 5227): Is {probeIp} in use?");

    private LwipErr SendRawArp(
        ushort opcode,
        MacAddress sha, Ip4Address spa,
        MacAddress tha, Ip4Address tpa,
        MacAddress dstEthMac,
        string summary)
    {
        if (_link == null) return LwipErr.If;
        var p = Pbuf.Alloc(PbufLayer.Link, 28);
        var s = p.PayloadSpan;
        BinaryPrimitives.WriteUInt16BigEndian(s[..2], 1); // Ethernet
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), ProtocolNumbers.EtherTypeIpv4);
        s[4] = 6; // HLEN
        s[5] = 4; // PLEN
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(6, 2), opcode);
        sha.WriteTo(s.Slice(8, 6));
        spa.WriteTo(s.Slice(14, 4));
        tha.WriteTo(s.Slice(18, 6));
        tpa.WriteTo(s.Slice(24, 4));

        _stats.EthArp.Xmit++;
        var bytes = p.ToLinearArray();

        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.LinkArp, LayerId.LinkEthernet,
            "IArpLayer -> ILinkLayer.SendFrame(0x0806)",
            TraceDirection.DownTx,
            "ARP",
            summary,
            $"Constructed 28-byte ARP {(opcode == 1 ? "Request" : "Reply")} packet",
            bytes,
            "ARP",
            () => _link.SendFrame(dstEthMac, ProtocolNumbers.EtherTypeArp, p, summary));

        return LwipErr.Ok;
    }

    public void Input(Pbuf arpPayload, MacAddress srcMac)
    {
        if (arpPayload.Length < 28)
        {
            _stats.EthArp.LenErr++;
            _stats.EthArp.Drop++;
            return;
        }

        _stats.EthArp.Recv++;
        var s = arpPayload.ReadOnlyPayload;
        ushort htype = BinaryPrimitives.ReadUInt16BigEndian(s[..2]);
        ushort ptype = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        ushort opcode = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2));
        if (htype != 1 || ptype != ProtocolNumbers.EtherTypeIpv4)
        {
            _stats.EthArp.ProtErr++;
            return;
        }

        var sha = MacAddress.FromSpan(s.Slice(8, 6));
        var spa = Ip4Address.FromSpan(s.Slice(14, 4));
        var tpa = Ip4Address.FromSpan(s.Slice(24, 4));

        // Conflict detection for AutoIP
        if (!spa.IsAny && spa == _netif.Ip4Addr && sha != _netif.HwAddr)
        {
            OnArpConflictDetected?.Invoke(spa, sha);
        }

        // Update ARP cache if sender IP is non-zero
        if (!spa.IsAny)
        {
            UpdateCacheAndFlush(spa, sha);
        }

        // Reply if request targets our IP
        if (opcode == 1 && !_netif.Ip4Addr.IsAny && tpa == _netif.Ip4Addr)
        {
            SendRawArp(2, _netif.HwAddr, _netif.Ip4Addr, sha, spa, sha,
                $"ARP Reply: {_netif.Ip4Addr} is at {_netif.HwAddr} (to {spa})");
        }
    }

    private void UpdateCacheAndFlush(Ip4Address ip, MacAddress mac)
    {
        if (!_cache.TryGetValue(ip, out var entry))
        {
            entry = new ArpCacheEntry { Ip = ip };
            _cache[ip] = entry;
        }
        entry.Mac = mac;
        entry.State = ArpEntryState.Stable;
        entry.AgeSeconds = 0;

        if (entry.PendingQueue.Count > 0)
        {
            int count = entry.PendingQueue.Count;
            _scheduler.RecordInstantEvent(
                _nodeId, _nodeLabel,
                LayerId.LinkArp, LayerId.LinkArp,
                "ArpLayer.FlushPendingQueue",
                TraceDirection.Control,
                "ARP",
                $"ARP Resolved {ip} -> {mac}; flushing {count} queued packet(s)",
                "etharp pending queue drained after receiving ARP Reply");

            while (entry.PendingQueue.Count > 0)
            {
                var (pkt, sum) = entry.PendingQueue.Dequeue();
                DispatchToEthernet(mac, pkt, sum, $"Flushed from ARP queue ({ip} -> {mac})");
            }
        }
    }

    public void TimerTick()
    {
        var expired = new List<Ip4Address>();
        foreach (var kv in _cache)
        {
            kv.Value.AgeSeconds++;
            if (kv.Value.State == ArpEntryState.Stable && kv.Value.AgeSeconds >= ArpMaxAgeSeconds)
                expired.Add(kv.Key);
            else if (kv.Value.State == ArpEntryState.Pending && kv.Value.AgeSeconds >= ArpPendingTimeoutSeconds)
                expired.Add(kv.Key);
        }
        foreach (var ip in expired)
        {
            _cache.Remove(ip);
        }
    }
}
