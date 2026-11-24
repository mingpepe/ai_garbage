using TcpIpStack.Core.Common;

namespace TcpIpStack.Core.Layers;

[Flags]
public enum NetifFlags : ushort
{
    None = 0,
    Up = 1 << 0,
    Broadcast = 1 << 1,
    LinkUp = 1 << 2,
    EthArp = 1 << 3,
    Igmp = 1 << 4,
    Mld6 = 1 << 5
}

/// <summary>lwIP struct netif representation holding interface addressing, MTU, and status flags.</summary>
public sealed class Netif
{
    public string Name { get; }
    public MacAddress HwAddr { get; }
    public Ip4Address Ip4Addr { get; set; }
    public Ip4Address Netmask { get; set; }
    public Ip4Address Gateway { get; set; }
    public Ip6Address Ip6LinkLocal { get; set; }
    public Ip6Address Ip6Global { get; set; }
    public int Mtu { get; set; } = 1500;
    public NetifFlags Flags { get; set; } =
        NetifFlags.Up | NetifFlags.Broadcast | NetifFlags.LinkUp | NetifFlags.EthArp | NetifFlags.Igmp | NetifFlags.Mld6;

    public bool IsUp => (Flags & NetifFlags.Up) != 0 && (Flags & NetifFlags.LinkUp) != 0;

    public Netif(string name, MacAddress hwAddr, Ip4Address ip4, Ip4Address mask, Ip4Address gw, Ip6Address ip6LinkLocal)
    {
        Name = name;
        HwAddr = hwAddr;
        Ip4Addr = ip4;
        Netmask = mask;
        Gateway = gw;
        Ip6LinkLocal = ip6LinkLocal;
        Ip6Global = Ip6Address.Any;
    }
}
