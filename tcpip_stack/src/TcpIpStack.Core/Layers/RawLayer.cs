using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

/// <summary>Layer 4: Raw PCB Layer (lwIP raw.c) for direct IP protocol access.</summary>
public sealed class RawLayer : IRawLayer
{
    private sealed record RawPcb(int Id, byte Protocol, Action<IpAddress, byte[]> OnReceive);

    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private readonly Dictionary<int, RawPcb> _pcbs = new();
    private int _nextId = 1;

    private IIp4Layer? _ip4;
    private IIp6Layer? _ip6;

    public RawLayer(string nodeId, string nodeLabel, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _scheduler = scheduler;
        _stats = stats;
    }

    public void SetLowerLayers(IIp4Layer ip4, IIp6Layer ip6)
    {
        _ip4 = ip4;
        _ip6 = ip6;
    }

    public int CreatePcb(byte protocol, Action<IpAddress, byte[]> onReceive)
    {
        int id = _nextId++;
        _pcbs[id] = new RawPcb(id, protocol, onReceive);
        return id;
    }

    public void RemovePcb(int pcbId) => _pcbs.Remove(pcbId);

    public LwipErr SendTo(int pcbId, IpAddress dstIp, byte[] payload)
    {
        if (!_pcbs.TryGetValue(pcbId, out var pcb)) return LwipErr.Arg;
        var p = Pbuf.FromBytes(payload, PbufLayer.Ip);
        _stats.Raw.Xmit++;

        if (!dstIp.IsV6 && _ip4 != null)
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportRaw, LayerId.NetworkIp4,
                "IRawLayer.SendTo -> IIp4Layer.Output", TraceDirection.DownTx, "RAW",
                $"RAW TX proto={pcb.Protocol} -> {dstIp.V4} ({payload.Length}B)",
                "Raw PCB handing payload directly to IPv4 layer", payload, "RAW",
                () => _ip4.Output(Ip4Address.Any, dstIp.V4, pcb.Protocol, 64, p, $"RAW proto={pcb.Protocol}"));
            return LwipErr.Ok;
        }
        if (dstIp.IsV6 && _ip6 != null)
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.TransportRaw, LayerId.NetworkIp6,
                "IRawLayer.SendTo -> IIp6Layer.Output", TraceDirection.DownTx, "RAW",
                $"RAW6 TX nextHdr={pcb.Protocol} -> {dstIp.V6} ({payload.Length}B)",
                "Raw PCB handing payload directly to IPv6 layer", payload, "RAW",
                () => _ip6.Output(Ip6Address.Any, dstIp.V6, pcb.Protocol, 64, p, $"RAW6 nh={pcb.Protocol}"));
            return LwipErr.Ok;
        }
        return LwipErr.Rte;
    }

    public bool InputIpv4(Pbuf ipPacket, Ip4Address srcIp, Ip4Address dstIp, byte protocol)
    {
        bool matched = false;
        var bytes = ipPacket.ToLinearArray();
        foreach (var pcb in _pcbs.Values.ToList())
        {
            if (pcb.Protocol == protocol)
            {
                _stats.Raw.Recv++;
                matched = true;
                pcb.OnReceive(new IpAddress(srcIp), bytes);
            }
        }
        return matched;
    }

    public bool InputIpv6(Pbuf ip6Packet, Ip6Address srcIp, Ip6Address dstIp, byte nextHeader)
    {
        bool matched = false;
        var bytes = ip6Packet.ToLinearArray();
        foreach (var pcb in _pcbs.Values.ToList())
        {
            if (pcb.Protocol == nextHeader)
            {
                _stats.Raw.Recv++;
                matched = true;
                pcb.OnReceive(new IpAddress(srcIp), bytes);
            }
        }
        return matched;
    }
}
