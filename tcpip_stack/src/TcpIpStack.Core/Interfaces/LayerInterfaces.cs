using TcpIpStack.Core.Common;

namespace TcpIpStack.Core.Interfaces;

/// <summary>
/// lwIP sys_arch abstraction: isolates timers, virtual clock, and OS synchronization primitives.
/// </summary>
public interface ISysArch
{
    long NowMs { get; }
    void ScheduleTimeout(string name, long delayMs, Action callback, bool repeating = false);
    void CancelTimeout(string name);
    uint NextRandomUInt32();
    ushort NextRandomUInt16();
}

/// <summary>
/// Boundary between Link Layer (L2) and OS/Hardware NIC Driver (L1).
/// Allows swapping simulated OS NIC for a real driver without touching any protocol layer.
/// </summary>
public interface IOsNetworkInterface
{
    string Name { get; }
    MacAddress MacAddress { get; }
    int Mtu { get; set; }
    bool IsLinkUp { get; set; }
    void SetRxCallback(IOsRxCallback upper);
    LwipErr TransmitFrame(Pbuf frame, string description);
}

/// <summary>Upward callback from OS NIC Driver (L1) into Ethernet/Link Layer (L2).</summary>
public interface IOsRxCallback
{
    void OnFrameReceived(Pbuf frame);
}

/// <summary>L2 Link Layer downward interface (called by L2.5 ARP/NDP and L3 IPv4/IPv6).</summary>
public interface ILinkLayer
{
    MacAddress LocalMac { get; }
    int Mtu { get; }
    bool IsUp { get; }
    void SetUpperLayers(IArpLayer arp, IIp4Layer ip4, IIp6Layer ip6);
    LwipErr SendFrame(MacAddress dstMac, ushort etherType, Pbuf payload, string summary);
    LwipErr SendLoopbackIpv4(Pbuf ipPacket, string summary);
    LwipErr SendLoopbackIpv6(Pbuf ip6Packet, string summary);
}

/// <summary>L2.5 ARP interface separating Ethernet (L2) and IPv4 (L3).</summary>
public interface IArpLayer
{
    void SetLowerLayer(ILinkLayer link);
    void SetUpperLayer(IIp4Layer ip4);
    void Input(Pbuf arpPayload, MacAddress srcMac);
    LwipErr Output(Ip4Address nextHopIp, Pbuf ipPacket, string summary);
    LwipErr SendRequest(Ip4Address targetIp);
    LwipErr SendGratuitousArp();
    LwipErr SendProbe(Ip4Address probeIp);
    void FlushCache();
    void TimerTick();
}

/// <summary>L2.5 IPv6 Neighbor Discovery Protocol (NDP) interface.</summary>
public interface INdpLayer
{
    void SetLowerLayer(ILinkLayer link);
    void SetIp6Layer(IIp6Layer ip6);
    LwipErr Output(Ip6Address nextHopIp, Pbuf ip6Packet, string summary);
    void HandleNeighborSolicitation(Ip6Address srcIp, ReadOnlySpan<byte> icmp6Payload);
    void HandleNeighborAdvertisement(Ip6Address srcIp, ReadOnlySpan<byte> icmp6Payload);
    void FlushCache();
    void TimerTick();
}

/// <summary>L3 IPv4 interface separating L2/ARP (below) and ICMP/IGMP/UDP/TCP/RAW (above).</summary>
public interface IIp4Layer
{
    Ip4Address LocalIp { get; set; }
    Ip4Address Netmask { get; set; }
    Ip4Address Gateway { get; set; }
    void SetLowerLayers(ILinkLayer link, IArpLayer arp);
    void RegisterUpperLayers(IIcmpLayer icmp, IIgmpLayer igmp, IUdpLayer udp, ITcpLayer tcp, IRawLayer raw);
    void Input(Pbuf packet, bool fromLoopback = false);
    LwipErr Output(Ip4Address srcIp, Ip4Address dstIp, byte protocol, byte ttl, Pbuf payload, string summary);
    Ip4Address ResolveNextHop(Ip4Address dstIp);
    void TimerTick();
}

/// <summary>L3 ICMPv4 interface.</summary>
public interface IIcmpLayer
{
    void SetLowerLayer(IIp4Layer ip4);
    void Input(Pbuf icmpPayload, Ip4Address srcIp, Ip4Address dstIp, byte ttl);
    LwipErr SendEchoRequest(Ip4Address dstIp, ushort id, ushort seq, byte[] data);
    LwipErr SendDestUnreachable(byte code, Ip4Address dstIp, ReadOnlySpan<byte> originalIpPacket);
    LwipErr SendTimeExceeded(byte code, Ip4Address dstIp, ReadOnlySpan<byte> originalIpPacket);
}

/// <summary>L3 IGMPv2 Multicast Group Management interface.</summary>
public interface IIgmpLayer
{
    void SetLowerLayer(IIp4Layer ip4);
    void Input(Pbuf igmpPayload, Ip4Address srcIp, Ip4Address dstIp);
    LwipErr JoinGroup(Ip4Address groupAddr);
    LwipErr LeaveGroup(Ip4Address groupAddr);
    IReadOnlyCollection<Ip4Address> JoinedGroups { get; }
}

/// <summary>L3 IPv6 + ICMPv6 interface.</summary>
public interface IIp6Layer
{
    Ip6Address LinkLocalIp { get; set; }
    Ip6Address GlobalIp { get; set; }
    void SetLowerLayers(ILinkLayer link, INdpLayer ndp);
    void RegisterUpperLayers(IUdpLayer udp, ITcpLayer tcp, IRawLayer raw);
    void Input(Pbuf packet, bool fromLoopback = false);
    LwipErr Output(Ip6Address srcIp, Ip6Address dstIp, byte nextHeader, byte hopLimit, Pbuf payload, string summary);
    LwipErr SendEchoRequest(Ip6Address dstIp, ushort id, ushort seq, byte[] data);
}

/// <summary>L4 Raw PCB interface (lwIP raw_pcb).</summary>
public interface IRawLayer
{
    void SetLowerLayers(IIp4Layer ip4, IIp6Layer ip6);
    bool InputIpv4(Pbuf ipPacket, Ip4Address srcIp, Ip4Address dstIp, byte protocol);
    bool InputIpv6(Pbuf ip6Packet, Ip6Address srcIp, Ip6Address dstIp, byte nextHeader);
    int CreatePcb(byte protocol, Action<IpAddress, byte[]> onReceive);
    LwipErr SendTo(int pcbId, IpAddress dstIp, byte[] payload);
    void RemovePcb(int pcbId);
}

/// <summary>L4 UDP interface (lwIP udp_pcb).</summary>
public interface IUdpLayer
{
    void SetLowerLayers(IIp4Layer ip4, IIp6Layer ip6, IIcmpLayer icmp);
    void InputIpv4(Pbuf udpPayload, Ip4Address srcIp, Ip4Address dstIp);
    void InputIpv6(Pbuf udpPayload, Ip6Address srcIp, Ip6Address dstIp);
    int CreatePcb(Action<int, IpAddress, ushort, byte[]> onReceive);
    LwipErr Bind(int pcbId, IpAddress localIp, ushort port);
    LwipErr Connect(int pcbId, IpAddress remoteIp, ushort remotePort);
    LwipErr SendTo(int pcbId, IpAddress dstIp, ushort dstPort, byte[] data, string? appSummary = null);
    LwipErr Send(int pcbId, byte[] data, string? appSummary = null);
    void RemovePcb(int pcbId);
}

public enum TcpState
{
    Closed,
    Listen,
    SynSent,
    SynRcvd,
    Established,
    FinWait1,
    FinWait2,
    CloseWait,
    Closing,
    LastAck,
    TimeWait
}

/// <summary>Upward notification interface from TCP Layer (L4) to Socket/App Layer (L5).</summary>
public interface ITcpCallbacks
{
    void OnConnected(int pcbId);
    void OnAccepted(int listenPcbId, int newPcbId, IpAddress remoteIp, ushort remotePort);
    void OnReceived(int pcbId, byte[] data);
    void OnSent(int pcbId, int ackedBytes);
    void OnClosed(int pcbId);
    void OnError(int pcbId, LwipErr err);
}

/// <summary>L4 TCP interface (lwIP tcp_pcb).</summary>
public interface ITcpLayer
{
    void SetLowerLayers(IIp4Layer ip4, IIp6Layer ip6);
    void InputIpv4(Pbuf tcpSegment, Ip4Address srcIp, Ip4Address dstIp);
    void InputIpv6(Pbuf tcpSegment, Ip6Address srcIp, Ip6Address dstIp);
    int CreatePcb(ITcpCallbacks callbacks);
    LwipErr Bind(int pcbId, IpAddress localIp, ushort localPort);
    LwipErr Listen(int pcbId, int backlog = 5);
    LwipErr Connect(int pcbId, IpAddress remoteIp, ushort remotePort);
    LwipErr Write(int pcbId, byte[] data, string? appSummary = null);
    LwipErr Close(int pcbId);
    void Abort(int pcbId);
    void SetNoDelay(int pcbId, bool noDelay);
    void SetKeepAlive(int pcbId, bool keepAlive);
    void SetReceiveWindow(int pcbId, ushort window);
    void FastTimerTick();
    void SlowTimerTick();
}

public enum AddressFamilyType { AfInet = 2, AfInet6 = 10 }
public enum SocketTypeKind { SockStream = 1, SockDgram = 2, SockRaw = 3 }

/// <summary>L5 BSD Socket API interface separating Application Layer (L7) from Transport (L4).</summary>
public interface ISocketApi
{
    int Socket(AddressFamilyType family, SocketTypeKind type, byte protocol);
    LwipErr Bind(int fd, IpAddress addr, ushort port);
    LwipErr Listen(int fd, int backlog = 5);
    int Accept(int fd, out IpAddress remoteIp, out ushort remotePort);
    LwipErr Connect(int fd, IpAddress remoteIp, ushort remotePort);
    int Send(int fd, byte[] data, string? appSummary = null);
    int Recv(int fd, int maxLen, out byte[] data);
    int SendTo(int fd, byte[] data, IpAddress dstIp, ushort dstPort, string? appSummary = null);
    int RecvFrom(int fd, int maxLen, out byte[] data, out IpAddress srcIp, out ushort srcPort);
    LwipErr Close(int fd);
    LwipErr SetSockOpt(int fd, string optionName, int value);
    bool IsConnected(int fd);
    bool IsClosedOrError(int fd, out LwipErr err);
    bool HasReadableData(int fd);
    bool HasPendingAccept(int fd);
    TcpState? GetTcpState(int fd);
}

/// <summary>L7 DNS Client interface (lwIP dns.c).</summary>
public interface IDnsClient
{
    Ip4Address DnsServer { get; set; }
    LwipErr Resolve(string hostname, Action<string, Ip4Address?, LwipErr> callback, bool forceQuery = false);
    bool TryGetCached(string hostname, out Ip4Address addr);
    void FlushCache();
    void TimerTick();
}

/// <summary>L7 DHCP Client interface (lwIP dhcp.c).</summary>
public interface IDhcpClient
{
    string StateName { get; }
    LwipErr Start();
    LwipErr Release();
    void FineTimerTick();
}

/// <summary>L7 AutoIP (RFC 3927) interface (lwIP autoip.c).</summary>
public interface IAutoIpClient
{
    string StateName { get; }
    LwipErr Start();
    void TimerTick();
}

public sealed record HttpRequestSpec(
    string Method,
    string Url,
    Dictionary<string, string>? Headers = null,
    string? Body = null,
    bool FlushDnsBefore = false,
    bool FlushArpBefore = false);

public sealed class HttpTransactionState
{
    public string Id { get; init; } = "";
    public string Method { get; init; } = "GET";
    public string Url { get; init; } = "";
    public string Host { get; set; } = "";
    public int Port { get; set; } = 80;
    public string Path { get; set; } = "/";
    public string? ResolvedIp { get; set; }
    public string Phase { get; set; } = "IDLE";
    public bool Completed { get; set; }
    public string? Error { get; set; }
    public string RawRequest { get; set; } = "";
    public string RawResponse { get; set; } = "";
    public int StatusCode { get; set; }
    public string StatusText { get; set; } = "";
    public Dictionary<string, string> ResponseHeaders { get; set; } = new();
    public string ResponseBody { get; set; } = "";
    public List<HttpPhaseMilestone> Milestones { get; } = [];
}

public sealed record HttpPhaseMilestone(long TimeMs, string Phase, string Description);

/// <summary>L7 HTTP/1.1 Client interface built strictly on ISocketApi + IDnsClient.</summary>
public interface IHttpClient
{
    HttpTransactionState StartRequest(HttpRequestSpec spec);
    HttpTransactionState? CurrentTransaction { get; }
    void Poll();
}
