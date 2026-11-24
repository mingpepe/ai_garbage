using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

public sealed class UdpPcb
{
    public int Id { get; init; }
    public IpAddress LocalIp { get; set; } = IpAddress.AnyV4;
    public ushort LocalPort { get; set; }
    public IpAddress RemoteIp { get; set; } = IpAddress.AnyV4;
    public ushort RemotePort { get; set; }
    public bool IsConnected { get; set; }
    public Action<int, IpAddress, ushort, byte[]> OnReceive { get; init; } = null!;
}

/// <summary>
/// Layer 4: UDP Layer (lwIP udp.c).
/// Lower boundaries: IIp4Layer, IIp6Layer, IIcmpLayer.
/// Upper boundary: UDP PCB callbacks / SocketApiLayer / DNS / DHCP.
/// </summary>
public sealed class UdpLayer : IUdpLayer
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private readonly Dictionary<int, UdpPcb> _pcbs = new();
    private int _nextId = 1;
    private ushort _nextEphemeralPort = 49152;

    private IIp4Layer? _ip4;
    private IIp6Layer? _ip6;
    private IIcmpLayer? _icmp;

    public UdpLayer(string nodeId, string nodeLabel, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _scheduler = scheduler;
        _stats = stats;
    }

    public void SetLowerLayers(IIp4Layer ip4, IIp6Layer ip6, IIcmpLayer icmp)
    {
        _ip4 = ip4;
        _ip6 = ip6;
        _icmp = icmp;
    }

    public IReadOnlyCollection<UdpPcb> GetPcbs() => _pcbs.Values.ToList();

    public int CreatePcb(Action<int, IpAddress, ushort, byte[]> onReceive)
    {
        int id = _nextId++;
        _pcbs[id] = new UdpPcb { Id = id, OnReceive = onReceive };
        return id;
    }

    public void RemovePcb(int pcbId) => _pcbs.Remove(pcbId);

    public LwipErr Bind(int pcbId, IpAddress localIp, ushort port)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return LwipErr.Arg;
        if (port == 0) port = AllocEphemeralPort();
        pcb.LocalIp = localIp;
        pcb.LocalPort = port;
        return LwipErr.Ok;
    }

    public LwipErr Connect(int pcbId, IpAddress remoteIp, ushort remotePort)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return LwipErr.Arg;
        if (pcb.LocalPort == 0) pcb.LocalPort = AllocEphemeralPort();
        pcb.RemoteIp = remoteIp;
        pcb.RemotePort = remotePort;
        pcb.IsConnected = true;
        return LwipErr.Ok;
    }

    public LwipErr Send(int pcbId, byte[] data, string? appSummary = null)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb) || !pcb.IsConnected) return LwipErr.Conn;
        return SendTo(pcbId, pcb.RemoteIp, pcb.RemotePort, data, appSummary);
    }

    public LwipErr SendTo(int pcbId, IpAddress dstIp, ushort dstPort, byte[] data, string? appSummary = null)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return LwipErr.Arg;
        if (pcb.LocalPort == 0) pcb.LocalPort = AllocEphemeralPort();

        var p = Pbuf.Alloc(PbufLayer.Transport, 8 + data.Length);
        var s = p.PayloadSpan;
        BinaryPrimitives.WriteUInt16BigEndian(s[..2], pcb.LocalPort);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), dstPort);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(4, 2), (ushort)(8 + data.Length));
        s[6] = 0; s[7] = 0;
        data.CopyTo(s[8..]);

        string label = appSummary ?? $"UDP {pcb.LocalPort} -> {dstPort} ({data.Length}B)";

        if (!dstIp.IsV6 && _ip4 != null)
        {
            var srcIp = pcb.LocalIp.IsAny ? _ip4.LocalIp : pcb.LocalIp.V4;
            ushort csum = Checksum.ComputePseudoIpv4(srcIp, dstIp.V4, ProtocolNumbers.IpProtoUdp, s);
            if (csum == 0) csum = 0xFFFF;
            BinaryPrimitives.WriteUInt16BigEndian(s.Slice(6, 2), csum);

            _stats.Udp.Xmit++;
            var bytes = p.ToLinearArray();
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportUdp, LayerId.NetworkIp4,
                "IUdpLayer.SendTo -> IIp4Layer.Output", TraceDirection.DownTx, "UDP",
                $"UDP TX :{pcb.LocalPort} -> {dstIp.V4}:{dstPort} ({data.Length}B) | {label}",
                $"Prepended 8-byte UDP header (pseudo-hdr csum=0x{csum:X4}), handing to IPv4",
                bytes, "UDP",
                () => _ip4.Output(srcIp, dstIp.V4, ProtocolNumbers.IpProtoUdp, 64, p, label));
            return LwipErr.Ok;
        }
        if (dstIp.IsV6 && _ip6 != null)
        {
            var src6 = pcb.LocalIp.IsAny ? _ip6.LinkLocalIp : pcb.LocalIp.V6;
            ushort csum = Checksum.ComputePseudoIpv6(src6, dstIp.V6, ProtocolNumbers.IpProtoUdp, s);
            if (csum == 0) csum = 0xFFFF;
            BinaryPrimitives.WriteUInt16BigEndian(s.Slice(6, 2), csum);

            _stats.Udp.Xmit++;
            var bytes = p.ToLinearArray();
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportUdp, LayerId.NetworkIp6,
                "IUdpLayer.SendTo -> IIp6Layer.Output", TraceDirection.DownTx, "UDP",
                $"UDP6 TX :{pcb.LocalPort} -> [{dstIp.V6}]:{dstPort} ({data.Length}B)",
                $"Prepended 8-byte UDP header (IPv6 csum=0x{csum:X4}), handing to IPv6",
                bytes, "UDP",
                () => _ip6.Output(src6, dstIp.V6, ProtocolNumbers.IpProtoUdp, 64, p, label));
            return LwipErr.Ok;
        }
        return LwipErr.Rte;
    }

    public void InputIpv4(Pbuf udpPayload, Ip4Address srcIp, Ip4Address dstIp)
    {
        if (udpPayload.Length < 8) { _stats.Udp.LenErr++; _stats.Udp.Drop++; return; }
        var s = udpPayload.ReadOnlyPayload;
        ushort csumField = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2));
        if (csumField != 0 && Checksum.ComputePseudoIpv4(srcIp, dstIp, ProtocolNumbers.IpProtoUdp, s) != 0)
        {
            _stats.Udp.ChkErr++;
            _stats.Udp.Drop++;
            _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.TransportUdp, LayerId.TransportUdp,
                "UdpLayer.InputIpv4 [CHECKSUM FAIL]", TraceDirection.UpRx, "UDP",
                "UDP Checksum INVALID - datagram dropped!", "Pseudo-header checksum verification failed",
                s, "UDP", dropped: true, dropReason: "UDP Checksum Error");
            return;
        }

        ushort srcPort = BinaryPrimitives.ReadUInt16BigEndian(s[..2]);
        ushort dstPort = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        ushort len = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        if (len < 8 || len > s.Length) { _stats.Udp.LenErr++; _stats.Udp.Drop++; return; }

        _stats.Udp.Recv++;
        var payload = s.Slice(8, len - 8).ToArray();
        DeliverToPcb(new IpAddress(srcIp), srcPort, dstPort, payload, dstIp.IsBroadcast || dstIp.IsMulticast);
    }

    public void InputIpv6(Pbuf udpPayload, Ip6Address srcIp, Ip6Address dstIp)
    {
        if (udpPayload.Length < 8) { _stats.Udp.LenErr++; _stats.Udp.Drop++; return; }
        var s = udpPayload.ReadOnlyPayload;
        if (Checksum.ComputePseudoIpv6(srcIp, dstIp, ProtocolNumbers.IpProtoUdp, s) != 0)
        {
            _stats.Udp.ChkErr++;
            _stats.Udp.Drop++;
            return;
        }
        ushort srcPort = BinaryPrimitives.ReadUInt16BigEndian(s[..2]);
        ushort dstPort = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        ushort len = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        if (len < 8 || len > s.Length) { _stats.Udp.LenErr++; _stats.Udp.Drop++; return; }

        _stats.Udp.Recv++;
        DeliverToPcb(new IpAddress(srcIp), srcPort, dstPort, s.Slice(8, len - 8).ToArray(), dstIp.IsMulticast);
    }

    private void DeliverToPcb(IpAddress srcIp, ushort srcPort, ushort dstPort, byte[] payload, bool isBroadcastOrMcast)
    {
        UdpPcb? matched = null;
        foreach (var pcb in _pcbs.Values)
        {
            if (pcb.LocalPort == dstPort)
            {
                if (!pcb.IsConnected || (pcb.RemoteIp == srcIp && pcb.RemotePort == srcPort))
                {
                    matched = pcb;
                    break;
                }
            }
        }

        if (matched == null)
        {
            _stats.Udp.Drop++;
            if (!isBroadcastOrMcast && !srcIp.IsV6)
            {
                // RFC 1122: Send ICMP Port Unreachable (code=3)
                _icmp?.SendDestUnreachable(3, srcIp.V4, payload);
            }
            return;
        }

        string appProto = (srcPort == 53 || dstPort == 53) ? "DNS"
            : (srcPort is 67 or 68 && dstPort is 67 or 68) ? "DHCP" : "RAW";
        LayerId targetLayer = (appProto is "DNS" or "DHCP") ? LayerId.Application : LayerId.SocketApi;

        _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportUdp, targetLayer,
            $"UdpLayer -> UpperCallback(port={dstPort})", TraceDirection.UpRx, appProto,
            $"UDP RX {srcIp}:{srcPort} -> :{dstPort} ({payload.Length}B)",
            $"Stripped 8-byte UDP header, delivering {payload.Length}B to PCB #{matched.Id}",
            payload, appProto,
            () => matched.OnReceive(matched.Id, srcIp, srcPort, payload));
    }

    private ushort AllocEphemeralPort()
    {
        for (int tries = 0; tries < 1000; tries++)
        {
            ushort p = _nextEphemeralPort++;
            if (_nextEphemeralPort >= 65000) _nextEphemeralPort = 49152;
            if (_pcbs.Values.All(x => x.LocalPort != p)) return p;
        }
        return _nextEphemeralPort++;
    }
}
