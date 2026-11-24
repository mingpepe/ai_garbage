using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

/// <summary>
/// Layer 2: Ethernet / Netif Layer.
/// Lower boundary: IOsNetworkInterface (OS/NIC driver).
/// Upper boundaries: IArpLayer, IIp4Layer, IIp6Layer.
/// </summary>
public sealed class EthernetLayer : ILinkLayer, IOsRxCallback
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly Netif _netif;
    private readonly IOsNetworkInterface _osNic;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;

    private IArpLayer? _arp;
    private IIp4Layer? _ip4;
    private IIp6Layer? _ip6;

    public MacAddress LocalMac => _netif.HwAddr;
    public int Mtu => _netif.Mtu;
    public bool IsUp => _netif.IsUp && _osNic.IsLinkUp;

    public EthernetLayer(
        string nodeId,
        string nodeLabel,
        Netif netif,
        IOsNetworkInterface osNic,
        IStepScheduler scheduler,
        LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _netif = netif;
        _osNic = osNic;
        _scheduler = scheduler;
        _stats = stats;
        _osNic.SetRxCallback(this);
    }

    public void SetUpperLayers(IArpLayer arp, IIp4Layer ip4, IIp6Layer ip6)
    {
        _arp = arp;
        _ip4 = ip4;
        _ip6 = ip6;
    }

    public LwipErr SendFrame(MacAddress dstMac, ushort etherType, Pbuf payload, string summary)
    {
        if (!IsUp)
        {
            _stats.Link.Drop++;
            return LwipErr.If;
        }

        payload.PrependHeader(14);
        var hdr = payload.PayloadSpan;
        dstMac.WriteTo(hdr[..6]);
        _netif.HwAddr.WriteTo(hdr.Slice(6, 6));
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(12, 2), etherType);

        _stats.Link.Xmit++;
        var frameBytes = payload.ToLinearArray();
        string etName = etherType switch
        {
            ProtocolNumbers.EtherTypeIpv4 => "IPv4",
            ProtocolNumbers.EtherTypeArp => "ARP",
            ProtocolNumbers.EtherTypeIpv6 => "IPv6",
            _ => $"0x{etherType:X4}"
        };

        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.LinkEthernet, LayerId.OsNic,
            "ILinkLayer.SendFrame -> IOsNetworkInterface.TransmitFrame",
            TraceDirection.DownTx,
            "ETHERNET",
            $"Eth TX {_netif.HwAddr} -> {dstMac} [{etName}] ({frameBytes.Length}B) | {summary}",
            $"Prepended 14-byte Ethernet II header (EtherType=0x{etherType:X4}) and handed to OS NIC interface",
            frameBytes,
            "ETHERNET",
            () => _osNic.TransmitFrame(payload, summary));

        return LwipErr.Ok;
    }

    public LwipErr SendLoopbackIpv4(Pbuf ipPacket, string summary)
    {
        if (_ip4 == null) return LwipErr.Rte;
        var bytes = ipPacket.ToLinearArray();
        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.LinkEthernet, LayerId.NetworkIp4,
            "Netif(lo0) Loopback -> IIp4Layer.Input",
            TraceDirection.UpRx,
            "IPV4",
            $"Loopback lo0 (127.0.0.1): {summary}",
            "Packet routed through lwIP loopback netif without leaving host",
            bytes,
            "IPV4",
            () => _ip4.Input(ipPacket, fromLoopback: true));
        return LwipErr.Ok;
    }

    public LwipErr SendLoopbackIpv6(Pbuf ip6Packet, string summary)
    {
        if (_ip6 == null) return LwipErr.Rte;
        var bytes = ip6Packet.ToLinearArray();
        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.LinkEthernet, LayerId.NetworkIp6,
            "Netif(lo0) Loopback -> IIp6Layer.Input",
            TraceDirection.UpRx,
            "IPV6",
            $"Loopback lo0 (::1): {summary}",
            "IPv6 packet routed through lwIP loopback netif",
            bytes,
            "IPV6",
            () => _ip6.Input(ip6Packet, fromLoopback: true));
        return LwipErr.Ok;
    }

    public void OnFrameReceived(Pbuf frame)
    {
        if (frame.Length < 14)
        {
            _stats.Link.LenErr++;
            _stats.Link.Drop++;
            return;
        }

        var span = frame.ReadOnlyPayload;
        var dstMac = MacAddress.FromSpan(span[..6]);
        var srcMac = MacAddress.FromSpan(span.Slice(6, 6));
        ushort etherType = BinaryPrimitives.ReadUInt16BigEndian(span.Slice(12, 2));

        if (!dstMac.IsBroadcast && !dstMac.IsMulticast && dstMac != _netif.HwAddr)
        {
            _stats.Link.Drop++;
            return;
        }

        _stats.Link.Recv++;
        frame.StripHeader(14);
        var payloadBytes = frame.ToLinearArray();

        switch (etherType)
        {
            case ProtocolNumbers.EtherTypeArp when _arp != null:
                _scheduler.ScheduleHop(
                    _nodeId, _nodeLabel,
                    LayerId.LinkEthernet, LayerId.LinkArp,
                    "EthernetLayer -> IArpLayer.Input",
                    TraceDirection.UpRx,
                    "ARP",
                    $"Eth RX [{srcMac}] -> ARP ({payloadBytes.Length}B)",
                    "Stripped 14-byte Ethernet header (EtherType 0x0806), dispatching to ARP layer",
                    payloadBytes,
                    "ARP",
                    () => _arp.Input(frame, srcMac));
                break;

            case ProtocolNumbers.EtherTypeIpv4 when _ip4 != null:
                _scheduler.ScheduleHop(
                    _nodeId, _nodeLabel,
                    LayerId.LinkEthernet, LayerId.NetworkIp4,
                    "EthernetLayer -> IIp4Layer.Input",
                    TraceDirection.UpRx,
                    "IPV4",
                    $"Eth RX [{srcMac}] -> IPv4 ({payloadBytes.Length}B)",
                    "Stripped 14-byte Ethernet header (EtherType 0x0800), dispatching to IPv4 layer",
                    payloadBytes,
                    "IPV4",
                    () => _ip4.Input(frame));
                break;

            case ProtocolNumbers.EtherTypeIpv6 when _ip6 != null:
                _scheduler.ScheduleHop(
                    _nodeId, _nodeLabel,
                    LayerId.LinkEthernet, LayerId.NetworkIp6,
                    "EthernetLayer -> IIp6Layer.Input",
                    TraceDirection.UpRx,
                    "IPV6",
                    $"Eth RX [{srcMac}] -> IPv6 ({payloadBytes.Length}B)",
                    "Stripped 14-byte Ethernet header (EtherType 0x86DD), dispatching to IPv6 layer",
                    payloadBytes,
                    "IPV6",
                    () => _ip6.Input(frame));
                break;

            default:
                _stats.Link.ProtErr++;
                _stats.Link.Drop++;
                break;
        }
    }
}
