namespace TcpIpStack.Core.Common;

public sealed class ProtoStats
{
    public long Xmit { get; set; }
    public long Recv { get; set; }
    public long Fw { get; set; }
    public long Drop { get; set; }
    public long ChkErr { get; set; }
    public long LenErr { get; set; }
    public long MemErr { get; set; }
    public long RtErr { get; set; }
    public long ProtErr { get; set; }
    public long OptErr { get; set; }
    public long Err { get; set; }
    public long CacheHit { get; set; }
}

/// <summary>lwIP-compatible MIB / protocol statistics structure (lwip_stats).</summary>
public sealed class LwipStats
{
    public ProtoStats Link { get; } = new();
    public ProtoStats EthArp { get; } = new();
    public ProtoStats Ip4 { get; } = new();
    public ProtoStats Ip4Frag { get; } = new();
    public ProtoStats Icmp { get; } = new();
    public ProtoStats Igmp { get; } = new();
    public ProtoStats Ip6 { get; } = new();
    public ProtoStats Icmp6 { get; } = new();
    public ProtoStats Nd6 { get; } = new();
    public ProtoStats Udp { get; } = new();
    public ProtoStats Tcp { get; } = new();
    public ProtoStats Raw { get; } = new();
    public ProtoStats Dns { get; } = new();
    public ProtoStats Dhcp { get; } = new();

    public Dictionary<string, ProtoStats> AsDictionary() => new()
    {
        ["link"] = Link,
        ["etharp"] = EthArp,
        ["ip4"] = Ip4,
        ["ip4_frag"] = Ip4Frag,
        ["icmp"] = Icmp,
        ["igmp"] = Igmp,
        ["ip6"] = Ip6,
        ["icmp6"] = Icmp6,
        ["nd6"] = Nd6,
        ["udp"] = Udp,
        ["tcp"] = Tcp,
        ["raw"] = Raw,
        ["dns"] = Dns,
        ["dhcp"] = Dhcp
    };
}
