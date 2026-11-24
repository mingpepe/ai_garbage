using System.Buffers.Binary;
using System.Text;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Apps;

public sealed class DnsCacheEntry
{
    public string Hostname { get; init; } = "";
    public Ip4Address Address { get; set; }
    public int TtlSeconds { get; set; }
}

/// <summary>
/// Layer 7: RFC 1035 DNS Client (lwIP dns.c) over IUdpLayer.
/// Encodes/decodes real DNS wire-format packets on UDP port 53 and maintains a TTL cache.
/// </summary>
public sealed class DnsClientLayer : IDnsClient
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly IUdpLayer _udp;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private readonly int _udpPcbId;
    private readonly Dictionary<string, DnsCacheEntry> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<ushort, (string Hostname, List<Action<string, Ip4Address?, LwipErr>> Callbacks)> _pending = new();
    private ushort _nextTxId = 0x1A2B;

    public Ip4Address DnsServer { get; set; }

    public DnsClientLayer(string nodeId, string nodeLabel, IUdpLayer udp, Ip4Address dnsServer, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _udp = udp;
        DnsServer = dnsServer;
        _scheduler = scheduler;
        _stats = stats;
        _udpPcbId = _udp.CreatePcb(OnDnsUdpReceive);
        _udp.Bind(_udpPcbId, IpAddress.AnyV4, 0);
    }

    public IReadOnlyCollection<DnsCacheEntry> GetCache() => _cache.Values.ToList();
    public void FlushCache() => _cache.Clear();

    public bool TryGetCached(string hostname, out Ip4Address addr)
    {
        if (Ip4Address.TryParse(hostname, out addr)) return true;
        if (_cache.TryGetValue(hostname, out var entry) && entry.TtlSeconds > 0)
        {
            addr = entry.Address;
            return true;
        }
        addr = Ip4Address.Any;
        return false;
    }

    public LwipErr Resolve(string hostname, Action<string, Ip4Address?, LwipErr> callback, bool forceQuery = false)
    {
        if (Ip4Address.TryParse(hostname, out var literal))
        {
            callback(hostname, literal, LwipErr.Ok);
            return LwipErr.Ok;
        }

        if (!forceQuery && TryGetCached(hostname, out var cached))
        {
            _stats.Dns.CacheHit++;
            _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.Application, LayerId.Application,
                $"IDnsClient.Resolve({hostname}) [CACHE HIT]", TraceDirection.Control, "DNS",
                $"DNS Cache HIT: {hostname} -> {cached}", "Resolved locally without network query");
            callback(hostname, cached, LwipErr.Ok);
            return LwipErr.Ok;
        }

        ushort txId = _nextTxId++;
        var queryBytes = BuildDnsQuery(txId, hostname);
        _pending[txId] = (hostname, [callback]);
        _stats.Dns.Xmit++;

        _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.Application, LayerId.TransportUdp,
            $"IDnsClient.Resolve({hostname}) -> IUdpLayer.SendTo(53)", TraceDirection.DownTx, "DNS",
            $"DNS Query A '{hostname}' (TxID=0x{txId:X4}) -> {DnsServer}:53",
            "Built RFC 1035 DNS Standard Query packet and handed to UDP layer",
            queryBytes, "DNS",
            () => _udp.SendTo(_udpPcbId, new IpAddress(DnsServer), 53, queryBytes, $"DNS Query {hostname}"));

        return LwipErr.InProgress;
    }

    private void OnDnsUdpReceive(int pcbId, IpAddress srcIp, ushort srcPort, byte[] payload)
    {
        if (payload.Length < 12) { _stats.Dns.LenErr++; return; }
        ushort txId = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(0, 2));
        ushort flags = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(2, 2));
        ushort qdCount = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(4, 2));
        ushort anCount = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(6, 2));

        if ((flags & 0x8000) == 0) return; // Not a response
        _stats.Dns.Recv++;

        if (!_pending.Remove(txId, out var req)) return;

        int pos = 12;
        for (int q = 0; q < qdCount && pos < payload.Length; q++)
        {
            pos = SkipDnsName(payload, pos);
            pos += 4; // QTYPE + QCLASS
        }

        Ip4Address? resolved = null;
        int ttl = 300;
        for (int a = 0; a < anCount && pos + 12 <= payload.Length; a++)
        {
            pos = SkipDnsName(payload, pos);
            if (pos + 10 > payload.Length) break;
            ushort rtype = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(pos, 2));
            ttl = (int)BinaryPrimitives.ReadUInt32BigEndian(payload.AsSpan(pos + 4, 4));
            ushort rdlen = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(pos + 8, 2));
            pos += 10;
            if (rtype == 1 && rdlen == 4 && pos + 4 <= payload.Length)
            {
                resolved = Ip4Address.FromSpan(payload.AsSpan(pos, 4));
                break;
            }
            pos += rdlen;
        }

        if (resolved.HasValue)
        {
            _cache[req.Hostname] = new DnsCacheEntry { Hostname = req.Hostname, Address = resolved.Value, TtlSeconds = Math.Max(60, ttl) };
            _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.Application, LayerId.Application,
                "DnsClientLayer.OnResponse", TraceDirection.UpRx, "DNS",
                $"DNS Resolved '{req.Hostname}' -> {resolved.Value} (TTL={ttl}s)",
                "Cached A-record and invoking caller callback", payload, "DNS");
            foreach (var cb in req.Callbacks) cb(req.Hostname, resolved.Value, LwipErr.Ok);
        }
        else
        {
            foreach (var cb in req.Callbacks) cb(req.Hostname, null, LwipErr.Val);
        }
    }

    public void TimerTick()
    {
        var expired = new List<string>();
        foreach (var kv in _cache)
        {
            kv.Value.TtlSeconds--;
            if (kv.Value.TtlSeconds <= 0) expired.Add(kv.Key);
        }
        foreach (var k in expired) _cache.Remove(k);
    }

    public static byte[] BuildDnsQuery(ushort txId, string hostname)
    {
        using var ms = new MemoryStream();
        Span<byte> hdr = stackalloc byte[12];
        BinaryPrimitives.WriteUInt16BigEndian(hdr[..2], txId);
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(2, 2), 0x0100); // RD=1
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(4, 2), 1); // QDCOUNT=1
        ms.Write(hdr);
        WriteDnsName(ms, hostname);
        ms.Write([0x00, 0x01, 0x00, 0x01]); // QTYPE=A, QCLASS=IN
        return ms.ToArray();
    }

    public static void WriteDnsName(Stream s, string name)
    {
        foreach (var label in name.Split('.', StringSplitOptions.RemoveEmptyEntries))
        {
            var bytes = Encoding.ASCII.GetBytes(label);
            s.WriteByte((byte)bytes.Length);
            s.Write(bytes);
        }
        s.WriteByte(0);
    }

    public static int SkipDnsName(byte[] buf, int pos)
    {
        while (pos < buf.Length)
        {
            byte len = buf[pos];
            if (len == 0) return pos + 1;
            if ((len & 0xC0) == 0xC0) return pos + 2;
            pos += 1 + len;
        }
        return pos;
    }
}
