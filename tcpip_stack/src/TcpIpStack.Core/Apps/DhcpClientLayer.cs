using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;
using TcpIpStack.Core.Layers;

namespace TcpIpStack.Core.Apps;

/// <summary>
/// Layer 7: RFC 2131 DHCP Client (lwIP dhcp.c) over IUdpLayer.
/// Implements full DORA state machine: OFF -> SELECTING -> REQUESTING -> BOUND.
/// </summary>
public sealed class DhcpClientLayer : IDhcpClient
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly Netif _netif;
    private readonly IUdpLayer _udp;
    private readonly IDnsClient _dns;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private readonly int _udpPcbId;

    private uint _xid = 0x3903F326;
    public string StateName { get; private set; } = "BOUND (Static)";
    public Ip4Address OfferedIp { get; private set; }
    public Ip4Address ServerIp { get; private set; }
    public uint LeaseTimeSeconds { get; private set; }

    public DhcpClientLayer(
        string nodeId, string nodeLabel, Netif netif, IUdpLayer udp, IDnsClient dns,
        IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _netif = netif;
        _udp = udp;
        _dns = dns;
        _scheduler = scheduler;
        _stats = stats;

        _udpPcbId = _udp.CreatePcb(OnDhcpReply);
        _udp.Bind(_udpPcbId, IpAddress.AnyV4, 68);
    }

    public LwipErr Start()
    {
        _xid++;
        _netif.Ip4Addr = Ip4Address.Any;
        StateName = "SELECTING";
        var pkt = BuildDhcpPacket(1, Ip4Address.Any, Ip4Address.Any); // DHCPDISCOVER
        _stats.Dhcp.Xmit++;

        _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.Application, LayerId.TransportUdp,
            "IDhcpClient.Start -> IUdpLayer.SendTo(255.255.255.255:67)", TraceDirection.DownTx, "DHCP",
            $"DHCP DISCOVER (XID=0x{_xid:X8}) -> Broadcast :67",
            "Cleared netif IPv4 to 0.0.0.0 and broadcasting DHCPDISCOVER",
            pkt, "DHCP",
            () => _udp.SendTo(_udpPcbId, new IpAddress(Ip4Address.Broadcast), 67, pkt, "DHCP DISCOVER"));
        return LwipErr.Ok;
    }

    public LwipErr Release()
    {
        if (ServerIp.IsAny) return LwipErr.Val;
        var pkt = BuildDhcpPacket(7, _netif.Ip4Addr, ServerIp); // DHCPRELEASE
        _netif.Ip4Addr = Ip4Address.Any;
        StateName = "OFF";
        _stats.Dhcp.Xmit++;
        return _udp.SendTo(_udpPcbId, new IpAddress(ServerIp), 67, pkt, "DHCP RELEASE");
    }

    private void OnDhcpReply(int pcbId, IpAddress srcIp, ushort srcPort, byte[] payload)
    {
        if (payload.Length < 244) return;
        uint xid = BinaryPrimitives.ReadUInt32BigEndian(payload.AsSpan(4, 4));
        if (xid != _xid) return;

        var yiaddr = Ip4Address.FromSpan(payload.AsSpan(16, 4));
        var siaddr = Ip4Address.FromSpan(payload.AsSpan(20, 4));
        byte msgType = 0;
        Ip4Address mask = new(255, 255, 255, 0);
        Ip4Address router = siaddr;
        Ip4Address dns = siaddr;
        uint lease = 3600;

        int i = 240;
        while (i < payload.Length)
        {
            byte opt = payload[i++];
            if (opt == 255) break;
            if (opt == 0) continue;
            if (i >= payload.Length) break;
            byte olen = payload[i++];
            if (i + olen > payload.Length) break;
            if (opt == 53 && olen >= 1) msgType = payload[i];
            else if (opt == 1 && olen == 4) mask = Ip4Address.FromSpan(payload.AsSpan(i, 4));
            else if (opt == 3 && olen >= 4) router = Ip4Address.FromSpan(payload.AsSpan(i, 4));
            else if (opt == 6 && olen >= 4) dns = Ip4Address.FromSpan(payload.AsSpan(i, 4));
            else if (opt == 51 && olen == 4) lease = BinaryPrimitives.ReadUInt32BigEndian(payload.AsSpan(i, 4));
            else if (opt == 54 && olen == 4) siaddr = Ip4Address.FromSpan(payload.AsSpan(i, 4));
            i += olen;
        }

        _stats.Dhcp.Recv++;

        if (StateName == "SELECTING" && msgType == 2) // DHCPOFFER
        {
            OfferedIp = yiaddr;
            ServerIp = siaddr;
            StateName = "REQUESTING";
            var req = BuildDhcpPacket(3, yiaddr, siaddr); // DHCPREQUEST
            _stats.Dhcp.Xmit++;

            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.Application, LayerId.TransportUdp,
                "DhcpClientLayer [REQUESTING] -> IUdpLayer.SendTo(67)", TraceDirection.DownTx, "DHCP",
                $"DHCP REQUEST for {yiaddr} (Server {siaddr})",
                "Received DHCPOFFER; broadcasting DHCPREQUEST to accept lease",
                req, "DHCP",
                () => _udp.SendTo(_udpPcbId, new IpAddress(Ip4Address.Broadcast), 67, req, $"DHCP REQUEST {yiaddr}"));
        }
        else if (StateName == "REQUESTING" && msgType == 5) // DHCPACK
        {
            _netif.Ip4Addr = yiaddr;
            _netif.Netmask = mask;
            _netif.Gateway = router;
            _dns.DnsServer = dns;
            LeaseTimeSeconds = lease;
            StateName = "BOUND";

            _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.Application, LayerId.Application,
                "DhcpClientLayer [BOUND]", TraceDirection.Control, "DHCP",
                $"DHCP BOUND: IP={yiaddr}, Mask={mask}, GW={router}, DNS={dns}, Lease={lease}s",
                "Applied DHCP lease parameters to Netif and DNS client", payload, "DHCP");
        }
    }

    private byte[] BuildDhcpPacket(byte msgType, Ip4Address requestedIp, Ip4Address serverIp)
    {
        var buf = new byte[272];
        buf[0] = 1; // BOOTREQUEST
        buf[1] = 1; // Ethernet
        buf[2] = 6; // HLEN
        BinaryPrimitives.WriteUInt32BigEndian(buf.AsSpan(4, 4), _xid);
        BinaryPrimitives.WriteUInt16BigEndian(buf.AsSpan(10, 2), 0x8000); // Broadcast flag
        _netif.HwAddr.WriteTo(buf.AsSpan(28, 6));

        // Magic cookie 99.130.83.99
        buf[236] = 99; buf[237] = 130; buf[238] = 83; buf[239] = 99;

        int pos = 240;
        buf[pos++] = 53; buf[pos++] = 1; buf[pos++] = msgType;
        if (!requestedIp.IsAny)
        {
            buf[pos++] = 50; buf[pos++] = 4; requestedIp.WriteTo(buf.AsSpan(pos, 4)); pos += 4;
        }
        if (!serverIp.IsAny)
        {
            buf[pos++] = 54; buf[pos++] = 4; serverIp.WriteTo(buf.AsSpan(pos, 4)); pos += 4;
        }
        buf[pos] = 255; // End option
        return buf;
    }

    public void FineTimerTick() { }
}
