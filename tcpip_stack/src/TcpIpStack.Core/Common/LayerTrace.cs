namespace TcpIpStack.Core.Common;

public enum LayerId
{
    Application,     // L7: HTTP Client/Server, DNS, DHCP, AutoIP, Socket Script
    SocketApi,       // L5: BSD Sockets / Netconn API
    TransportTcp,    // L4: TCP
    TransportUdp,    // L4: UDP
    TransportRaw,    // L4: RAW PCB
    NetworkIp4,      // L3: IPv4
    NetworkIcmp,     // L3: ICMPv4
    NetworkIgmp,     // L3: IGMPv2
    NetworkIp6,      // L3: IPv6 + ICMPv6
    LinkArp,         // L2.5: ARP
    LinkNdp,         // L2.5: NDP (Neighbor Discovery)
    LinkEthernet,    // L2: Ethernet / Netif
    OsNic,           // L1: Simulated OS NIC Driver (IOsNetworkInterface)
    VirtualWire      // L0: Virtual Ethernet Switch / Wire
}

public enum TraceDirection
{
    DownTx,
    UpRx,
    Wire,
    Timer,
    Control
}

public sealed record DecodedField(string Name, string Value);

public sealed record DecodedHeader(
    string Protocol,
    int Offset,
    int Length,
    string Summary,
    List<DecodedField> Fields);

public sealed class TraceRecord
{
    public int Id { get; init; }
    public long TimestampMs { get; init; }
    public string NodeId { get; init; } = "";
    public string NodeLabel { get; init; } = "";
    public LayerId FromLayer { get; init; }
    public LayerId ToLayer { get; init; }
    public string InterfaceCall { get; init; } = "";
    public TraceDirection Direction { get; init; }
    public string Protocol { get; init; } = "";
    public string Summary { get; init; } = "";
    public string Detail { get; init; } = "";
    public string? PhaseTag { get; init; }
    public int ByteLength { get; init; }
    public string HexDump { get; init; } = "";
    public string AsciiPreview { get; init; } = "";
    public List<DecodedHeader> Headers { get; init; } = [];
    public bool Dropped { get; set; }
    public string? DropReason { get; set; }
}

public sealed class PendingHop
{
    public int Id { get; init; }
    public long ScheduledAtMs { get; init; }
    public TraceRecord Trace { get; init; } = null!;
    public Action Execute { get; init; } = null!;
}
