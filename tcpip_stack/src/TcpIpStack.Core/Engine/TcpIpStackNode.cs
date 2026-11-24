using TcpIpStack.Core.Apps;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Interfaces;
using TcpIpStack.Core.Layers;
using TcpIpStack.Core.Os;

namespace TcpIpStack.Core.Engine;

/// <summary>
/// Complete host network stack assembling every layer class strictly through its upper and lower interfaces.
/// </summary>
public sealed class TcpIpStackNode
{
    public string NodeId { get; }
    public string NodeLabel { get; }
    public Netif Netif { get; }
    public LwipStats Stats { get; } = new();
    public PbufPool PbufPool { get; } = new();

    // L1: Simulated OS NIC (behind IOsNetworkInterface)
    public SimulatedOsNic OsNic { get; }
    // L2: Link / Ethernet
    public EthernetLayer Ethernet { get; }
    // L2.5: ARP & NDP
    public ArpLayer Arp { get; }
    public NdpLayer Ndp { get; }
    // L3: IPv4, ICMPv4, IGMPv2, IPv6/ICMPv6
    public Ip4Layer Ip4 { get; }
    public IcmpLayer Icmp { get; }
    public IgmpLayer Igmp { get; }
    public Ip6Layer Ip6 { get; }
    // L4: RAW, UDP, TCP
    public RawLayer Raw { get; }
    public UdpLayer Udp { get; }
    public TcpLayer Tcp { get; }
    // L5: BSD Socket API
    public SocketApiLayer Sockets { get; }
    // L7: DNS, DHCP, AutoIP, HTTP
    public DnsClientLayer Dns { get; }
    public DhcpClientLayer Dhcp { get; }
    public AutoIpLayer AutoIp { get; }
    public HttpClientLayer Http { get; }

    public TcpIpStackNode(
        string nodeId,
        string nodeLabel,
        MacAddress mac,
        Ip4Address ip4,
        Ip4Address netmask,
        Ip4Address gateway,
        Ip6Address ip6LinkLocal,
        Ip4Address dnsServer,
        VirtualNetworkSwitch vswitch,
        ISysArch sysArch,
        IStepScheduler scheduler)
    {
        NodeId = nodeId;
        NodeLabel = nodeLabel;
        Netif = new Netif("eth0", mac, ip4, netmask, gateway, ip6LinkLocal);

        // Instantiate each layer as its own class
        OsNic = new SimulatedOsNic(nodeId, nodeLabel, "vnic0", mac, vswitch, scheduler);
        Ethernet = new EthernetLayer(nodeId, nodeLabel, Netif, OsNic, scheduler, Stats);
        Arp = new ArpLayer(nodeId, nodeLabel, Netif, scheduler, Stats);
        Ndp = new NdpLayer(nodeId, nodeLabel, Netif, scheduler, Stats);
        Ip4 = new Ip4Layer(nodeId, nodeLabel, Netif, scheduler, Stats);
        Icmp = new IcmpLayer(nodeId, nodeLabel, scheduler, Stats);
        Igmp = new IgmpLayer(nodeId, nodeLabel, scheduler, Stats);
        Ip6 = new Ip6Layer(nodeId, nodeLabel, Netif, scheduler, Stats);
        Raw = new RawLayer(nodeId, nodeLabel, scheduler, Stats);
        Udp = new UdpLayer(nodeId, nodeLabel, scheduler, Stats);
        Tcp = new TcpLayer(nodeId, nodeLabel, sysArch, scheduler, Stats);
        Sockets = new SocketApiLayer(nodeId, nodeLabel, Tcp, Udp, Raw, scheduler);
        Dns = new DnsClientLayer(nodeId, nodeLabel, Udp, dnsServer, scheduler, Stats);
        Dhcp = new DhcpClientLayer(nodeId, nodeLabel, Netif, Udp, Dns, scheduler, Stats);
        AutoIp = new AutoIpLayer(nodeId, nodeLabel, Netif, Arp, scheduler);
        Http = new HttpClientLayer(nodeId, nodeLabel, Sockets, Dns, Arp, scheduler);

        // Wire strict upper/lower interface boundaries
        Ethernet.SetUpperLayers(Arp, Ip4, Ip6);
        Arp.SetLowerLayer(Ethernet);
        Arp.SetUpperLayer(Ip4);
        Ndp.SetLowerLayer(Ethernet);
        Ndp.SetIp6Layer(Ip6);
        Ip4.SetLowerLayers(Ethernet, Arp);
        Ip4.RegisterUpperLayers(Icmp, Igmp, Udp, Tcp, Raw);
        Icmp.SetLowerLayer(Ip4);
        Igmp.SetLowerLayer(Ip4);
        Ip6.SetLowerLayers(Ethernet, Ndp);
        Ip6.RegisterUpperLayers(Udp, Tcp, Raw);
        Raw.SetLowerLayers(Ip4, Ip6);
        Udp.SetLowerLayers(Ip4, Ip6, Icmp);
        Tcp.SetLowerLayers(Ip4, Ip6);
    }

    public void FastTimerTick()
    {
        Tcp.FastTimerTick();
    }

    public void SlowTimerTick()
    {
        Tcp.SlowTimerTick();
        Dhcp.FineTimerTick();
    }

    public void OneSecondTimerTick()
    {
        Arp.TimerTick();
        Ndp.TimerTick();
        Ip4.TimerTick();
        Dns.TimerTick();
        AutoIp.TimerTick();
    }
}
