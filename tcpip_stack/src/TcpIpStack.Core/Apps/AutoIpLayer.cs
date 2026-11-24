using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;
using TcpIpStack.Core.Layers;

namespace TcpIpStack.Core.Apps;

/// <summary>
/// Layer 7/Control: RFC 3927 AutoIP (lwIP autoip.c) for 169.254.x.x link-local self-configuration.
/// Probes candidate IP via ARP Probes, handles conflict detection, and announces via Gratuitous ARP.
/// </summary>
public sealed class AutoIpLayer : IAutoIpClient
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly Netif _netif;
    private readonly IArpLayer _arp;
    private readonly IStepScheduler _scheduler;
    private Ip4Address _candidateIp;
    private int _probesSent;

    public string StateName { get; private set; } = "OFF";

    public AutoIpLayer(string nodeId, string nodeLabel, Netif netif, IArpLayer arp, IStepScheduler scheduler)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _netif = netif;
        _arp = arp;
        _scheduler = scheduler;
        if (arp is ArpLayer arpImpl)
        {
            arpImpl.OnArpConflictDetected += HandleConflict;
        }
    }

    public LwipErr Start()
    {
        byte b2 = (byte)(1 + (_netif.HwAddr.B4 % 253));
        byte b3 = (byte)(1 + (_netif.HwAddr.B5 % 253));
        _candidateIp = new Ip4Address(169, 254, b2, b3);
        _probesSent = 1;
        StateName = "PROBING";

        _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.Application, LayerId.LinkArp,
            "IAutoIpClient.Start (RFC 3927)", TraceDirection.Control, "ARP",
            $"AutoIP PROBING candidate {_candidateIp} (Probe 1/3)",
            "Sending ARP Probe with SPA=0.0.0.0");
        return _arp.SendProbe(_candidateIp);
    }

    public void TimerTick()
    {
        if (StateName == "PROBING")
        {
            if (_probesSent < 3)
            {
                _probesSent++;
                _arp.SendProbe(_candidateIp);
            }
            else
            {
                _netif.Ip4Addr = _candidateIp;
                _netif.Netmask = new Ip4Address(255, 255, 0, 0);
                StateName = "BOUND";
                _arp.SendGratuitousArp();
                _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.Application, LayerId.LinkArp,
                    "AutoIpLayer [BOUND]", TraceDirection.Control, "ARP",
                    $"AutoIP BOUND {_candidateIp}/16 - sent Gratuitous ARP announcement",
                    "No conflicts detected after 3 ARP probes");
            }
        }
    }

    private void HandleConflict(Ip4Address ip, MacAddress otherMac)
    {
        if (ip == _candidateIp && StateName != "OFF")
        {
            _candidateIp = new Ip4Address(169, 254, _candidateIp.B2, (byte)((_candidateIp.B3 + 7) % 254 + 1));
            _probesSent = 1;
            StateName = "PROBING";
            _arp.SendProbe(_candidateIp);
        }
    }
}
