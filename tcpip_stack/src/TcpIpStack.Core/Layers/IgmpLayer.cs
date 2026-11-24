using System.Buffers.Binary;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

/// <summary>
/// Layer 3: IGMPv2 Layer (lwIP igmp.c).
/// Supports joining/leaving IPv4 multicast groups with V2 Membership Report (0x16) and Leave Group (0x17).
/// </summary>
public sealed class IgmpLayer : IIgmpLayer
{
    private static readonly Ip4Address AllRoutersMulticast = new(224, 0, 0, 2);

    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly IStepScheduler _scheduler;
    private readonly LwipStats _stats;
    private readonly HashSet<Ip4Address> _groups = [];
    private IIp4Layer? _ip4;

    public IReadOnlyCollection<Ip4Address> JoinedGroups => _groups.ToList();

    public IgmpLayer(string nodeId, string nodeLabel, IStepScheduler scheduler, LwipStats stats)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _scheduler = scheduler;
        _stats = stats;
    }

    public void SetLowerLayer(IIp4Layer ip4) => _ip4 = ip4;

    public LwipErr JoinGroup(Ip4Address groupAddr)
    {
        if (!groupAddr.IsMulticast) return LwipErr.Val;
        _groups.Add(groupAddr);
        return SendIgmp(0x16, groupAddr, groupAddr, $"IGMPv2 Join Report ({groupAddr})");
    }

    public LwipErr LeaveGroup(Ip4Address groupAddr)
    {
        if (!_groups.Remove(groupAddr)) return LwipErr.Val;
        return SendIgmp(0x17, groupAddr, AllRoutersMulticast, $"IGMPv2 Leave Group ({groupAddr})");
    }

    private LwipErr SendIgmp(byte type, Ip4Address groupAddr, Ip4Address dstIp, string summary)
    {
        if (_ip4 == null) return LwipErr.Rte;
        var p = Pbuf.Alloc(PbufLayer.Ip, 8);
        var s = p.PayloadSpan;
        s[0] = type;
        s[1] = 0;
        groupAddr.WriteTo(s.Slice(4, 4));
        ushort csum = Checksum.Compute(s);
        BinaryPrimitives.WriteUInt16BigEndian(s.Slice(2, 2), csum);

        _stats.Igmp.Xmit++;
        var bytes = p.ToLinearArray();
        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.NetworkIgmp, LayerId.NetworkIp4,
            "IIgmpLayer -> IIp4Layer.Output",
            TraceDirection.DownTx,
            "IGMP",
            summary,
            $"IGMPv2 message type=0x{type:X2} for multicast group {groupAddr}",
            bytes, "IGMP",
            () => _ip4.Output(Ip4Address.Any, dstIp, ProtocolNumbers.IpProtoIgmp, 1, p, summary));
        return LwipErr.Ok;
    }

    public void Input(Pbuf igmpPayload, Ip4Address srcIp, Ip4Address dstIp)
    {
        if (igmpPayload.Length < 8) { _stats.Igmp.LenErr++; return; }
        var s = igmpPayload.ReadOnlyPayload;
        if (Checksum.Compute(s) != 0) { _stats.Igmp.ChkErr++; return; }
        _stats.Igmp.Recv++;

        byte type = s[0];
        var group = Ip4Address.FromSpan(s.Slice(4, 4));
        if (type == 0x11) // Membership Query
        {
            foreach (var g in _groups)
            {
                if (group.IsAny || group == g)
                    SendIgmp(0x16, g, g, $"IGMPv2 Report (reply to query) {g}");
            }
        }
    }
}
