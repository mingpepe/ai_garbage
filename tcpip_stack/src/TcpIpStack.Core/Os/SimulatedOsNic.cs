using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Os;

/// <summary>
/// Simulated OS NIC driver implementing IOsNetworkInterface.
/// Completely decoupled from Windows/WSL networking; connects to VirtualNetworkSwitch.
/// </summary>
public sealed class SimulatedOsNic : IOsNetworkInterface
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly VirtualNetworkSwitch _vswitch;
    private readonly IStepScheduler _scheduler;
    private IOsRxCallback? _upper;

    public string Name { get; }
    public MacAddress MacAddress { get; }
    public int Mtu { get; set; } = 1500;
    public bool IsLinkUp { get; set; } = true;
    public long TxFrames { get; private set; }
    public long RxFrames { get; private set; }
    public long TxBytes { get; private set; }
    public long RxBytes { get; private set; }

    public SimulatedOsNic(
        string nodeId,
        string nodeLabel,
        string name,
        MacAddress macAddress,
        VirtualNetworkSwitch vswitch,
        IStepScheduler scheduler)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        Name = name;
        MacAddress = macAddress;
        _vswitch = vswitch;
        _scheduler = scheduler;
        _vswitch.AttachNic(this);
    }

    public string NodeId => _nodeId;
    public string NodeLabel => _nodeLabel;

    public void SetRxCallback(IOsRxCallback upper) => _upper = upper;

    public LwipErr TransmitFrame(Pbuf frame, string description)
    {
        if (!IsLinkUp)
        {
            _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.OsNic, LayerId.VirtualWire,
                "IOsNetworkInterface.TransmitFrame", TraceDirection.DownTx, "NIC",
                "Link DOWN - frame dropped", description, frame.ReadOnlyPayload, "ETHERNET",
                dropped: true, dropReason: "NIC link down");
            return LwipErr.If;
        }

        TxFrames++;
        TxBytes += frame.Length;
        var raw = frame.ToLinearArray();

        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.OsNic, LayerId.VirtualWire,
            "IOsNetworkInterface.TransmitFrame -> VirtualSwitch.Forward",
            TraceDirection.Wire,
            "ETHERNET",
            $"NIC TX ({raw.Length}B): {description}",
            $"Simulated NIC {Name} [{MacAddress}] puts Ethernet frame on Virtual Wire",
            raw,
            "ETHERNET",
            () => _vswitch.DeliverFrom(this, raw, description));

        return LwipErr.Ok;
    }

    internal void ReceiveFromWire(byte[] rawFrame, string description)
    {
        if (!IsLinkUp || _upper == null) return;

        RxFrames++;
        RxBytes += rawFrame.Length;
        var pbuf = Pbuf.FromBytes(rawFrame, PbufLayer.Raw);

        _scheduler.ScheduleHop(
            _nodeId, _nodeLabel,
            LayerId.OsNic, LayerId.LinkEthernet,
            "IOsRxCallback.OnFrameReceived",
            TraceDirection.UpRx,
            "ETHERNET",
            $"NIC RX ({rawFrame.Length}B): {description}",
            $"Simulated NIC {Name} DMA-interrupts Link Layer with Ethernet frame",
            rawFrame,
            "ETHERNET",
            () => _upper.OnFrameReceived(pbuf));
    }
}
