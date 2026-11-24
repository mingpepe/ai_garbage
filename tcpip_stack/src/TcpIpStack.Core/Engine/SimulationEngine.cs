using System.Text;
using TcpIpStack.Core.Apps;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Interfaces;
using TcpIpStack.Core.Layers;
using TcpIpStack.Core.Os;

namespace TcpIpStack.Core.Engine;

/// <summary>
/// Central Simulation Engine orchestrating the simulated OS layer, virtual Ethernet switch,
/// three full TcpIpStackNode instances (Client, Gateway/DNS/DHCP, Remote Web/Echo Server),
/// single-step hop queue, socket script runner, and HTTP client tracer.
/// </summary>
public sealed class SimulationEngine : IStepScheduler
{
    private readonly Queue<PendingHop> _pendingHops = new();
    private readonly List<TraceRecord> _history = [];
    private int _nextHopId = 1;
    private long _lastFastTimerMs;
    private long _lastSlowTimerMs;
    private long _lastSecTimerMs;

    public SimulatedSysArch SysArch { get; }
    public VirtualNetworkSwitch VirtualSwitch { get; }

    public TcpIpStackNode Client { get; private set; } = null!;
    public TcpIpStackNode Gateway { get; private set; } = null!;
    public TcpIpStackNode RemoteServer { get; private set; } = null!;

    public GatewayServices GatewayApp { get; private set; } = null!;
    public RemoteWebAndEchoServer RemoteApp { get; private set; } = null!;
    public SocketScriptRunner ScriptRunner { get; private set; } = null!;

    public long NowMs => SysArch.NowMs;
    public string? ActivePhaseTag { get; set; }
    public TraceRecord? LastExecutedTrace => _history.Count > 0 ? _history[^1] : null;
    public IReadOnlyList<TraceRecord> History => _history;
    public int PendingHopCount => _pendingHops.Count;

    public SimulationEngine()
    {
        SysArch = new SimulatedSysArch();
        VirtualSwitch = new VirtualNetworkSwitch(this, SysArch);
        InitializeTopology();
    }

    public void Reset()
    {
        _pendingHops.Clear();
        _history.Clear();
        _nextHopId = 1;
        _lastFastTimerMs = 0;
        _lastSlowTimerMs = 0;
        _lastSecTimerMs = 0;
        ActivePhaseTag = null;
        SysArch.Reset();
        VirtualSwitch.ClearNics();
        VirtualSwitch.Faults.DropNextClientTx = false;
        VirtualSwitch.Faults.CorruptNextChecksum = false;
        VirtualSwitch.Faults.DuplicateNextPacket = false;
        VirtualSwitch.Faults.DropPercent = 0;
        InitializeTopology();
    }

    private void InitializeTopology()
    {
        // Recreate fresh switch attachment cleanly by building nodes
        var freshSwitch = VirtualSwitch;

        // 1. Client Host: 192.168.1.100/24, GW 192.168.1.1, DNS 192.168.1.1
        Client = new TcpIpStackNode(
            "client", "Client (192.168.1.100)",
            MacAddress.Parse("02:00:00:00:01:00"),
            new Ip4Address(192, 168, 1, 100),
            new Ip4Address(255, 255, 255, 0),
            new Ip4Address(192, 168, 1, 1),
            Ip6Address.Parse("fe80::100"),
            new Ip4Address(192, 168, 1, 1),
            freshSwitch, SysArch, this);

        // 2. Virtual Gateway / Router / DNS / DHCP: 192.168.1.1/24
        Gateway = new TcpIpStackNode(
            "gateway", "Gateway/DNS/DHCP (192.168.1.1)",
            MacAddress.Parse("02:00:00:00:00:01"),
            new Ip4Address(192, 168, 1, 1),
            new Ip4Address(255, 255, 255, 0),
            Ip4Address.Any,
            Ip6Address.Parse("fe80::1"),
            new Ip4Address(192, 168, 1, 1),
            freshSwitch, SysArch, this);
        Gateway.Ip4.EnableForwarding = true;
        Gateway.Ip4.AddRoute(new RouteEntry(new Ip4Address(93, 184, 216, 0), new Ip4Address(255, 255, 255, 0), Ip4Address.Any, "eth0", 1));

        // 3. Remote Web & Echo Server (example.com): 93.184.216.34/24, GW 192.168.1.1
        RemoteServer = new TcpIpStackNode(
            "server", "WebServer example.com (93.184.216.34)",
            MacAddress.Parse("02:00:00:00:00:50"),
            new Ip4Address(93, 184, 216, 34),
            new Ip4Address(255, 255, 255, 0),
            new Ip4Address(192, 168, 1, 1),
            Ip6Address.Parse("fe80::50"),
            new Ip4Address(192, 168, 1, 1),
            freshSwitch, SysArch, this);

        // Silence boot-time listen traces so initial trace log starts clean
        GatewayApp = new GatewayServices(Gateway);
        RemoteApp = new RemoteWebAndEchoServer(RemoteServer);
        _history.Clear();
        _pendingHops.Clear();
        _nextHopId = 1;

        ScriptRunner = new SocketScriptRunner(Client, this, AdvanceClockMs);
        ScriptRunner.Load(SocketScriptRunner.GetPresets()["tcp_echo"].Code, autoActivate: false);
    }

    public void ScheduleHop(
        string nodeId,
        string nodeLabel,
        LayerId fromLayer,
        LayerId toLayer,
        string interfaceCall,
        TraceDirection direction,
        string protocol,
        string summary,
        string detail,
        ReadOnlySpan<byte> packetBytes,
        string dissectStartProtocol,
        Action execute,
        long delayMs = 0)
    {
        int id = _nextHopId++;
        var trace = new TraceRecord
        {
            Id = id,
            TimestampMs = NowMs + delayMs,
            NodeId = nodeId,
            NodeLabel = nodeLabel,
            FromLayer = fromLayer,
            ToLayer = toLayer,
            InterfaceCall = interfaceCall,
            Direction = direction,
            Protocol = protocol,
            Summary = summary,
            Detail = detail,
            PhaseTag = ActivePhaseTag,
            ByteLength = packetBytes.Length,
            HexDump = PacketDissector.FormatHexDump(packetBytes),
            AsciiPreview = PacketDissector.FormatAsciiPreview(packetBytes),
            Headers = PacketDissector.Dissect(packetBytes, dissectStartProtocol)
        };

        _pendingHops.Enqueue(new PendingHop
        {
            Id = id,
            ScheduledAtMs = NowMs + delayMs,
            Trace = trace,
            Execute = execute
        });
    }

    public void RecordInstantEvent(
        string nodeId,
        string nodeLabel,
        LayerId fromLayer,
        LayerId toLayer,
        string interfaceCall,
        TraceDirection direction,
        string protocol,
        string summary,
        string detail,
        ReadOnlySpan<byte> packetBytes = default,
        string dissectStartProtocol = "RAW",
        bool dropped = false,
        string? dropReason = null)
    {
        var trace = new TraceRecord
        {
            Id = _nextHopId++,
            TimestampMs = NowMs,
            NodeId = nodeId,
            NodeLabel = nodeLabel,
            FromLayer = fromLayer,
            ToLayer = toLayer,
            InterfaceCall = interfaceCall,
            Direction = direction,
            Protocol = protocol,
            Summary = summary,
            Detail = detail,
            PhaseTag = ActivePhaseTag,
            ByteLength = packetBytes.Length,
            HexDump = packetBytes.Length > 0 ? PacketDissector.FormatHexDump(packetBytes) : "",
            AsciiPreview = packetBytes.Length > 0 ? PacketDissector.FormatAsciiPreview(packetBytes) : "",
            Headers = packetBytes.Length > 0 ? PacketDissector.Dissect(packetBytes, dissectStartProtocol) : [],
            Dropped = dropped,
            DropReason = dropReason
        };
        AddHistory(trace);
    }

    private void AddHistory(TraceRecord rec)
    {
        _history.Add(rec);
        if (_history.Count > 600) _history.RemoveAt(0);
    }

    /// <summary>Executes exactly ONE inter-layer hop (or one socket script line if queue is empty).</summary>
    public bool StepOneHop()
    {
        if (_pendingHops.Count > 0)
        {
            var hop = _pendingHops.Dequeue();
            if (hop.ScheduledAtMs > NowMs) SysArch.SetNowMs(hop.ScheduledAtMs);
            AddHistory(hop.Trace);
            hop.Execute();
            PollAllApplications();
            return true;
        }

        // If no packet hops are pending, try advancing active socket script or HTTP client
        PollAllApplications();
        if (_pendingHops.Count > 0) return true;

        if (ScriptRunner.State.Status is "RUNNING" or "WAITING_NETWORK")
        {
            bool progressed = ScriptRunner.StepStatement();
            PollAllApplications();
            return progressed || _pendingHops.Count > 0;
        }

        return false;
    }

    /// <summary>Runs up to maxSteps hops until idle (or until socket script completes).</summary>
    public int RunUntilIdle(int maxSteps = 500)
    {
        int executed = 0;
        while (executed < maxSteps)
        {
            if (_pendingHops.Count > 0)
            {
                StepOneHop();
                executed++;
                continue;
            }
            PollAllApplications();
            if (_pendingHops.Count > 0) continue;

            if (ScriptRunner.State.Status == "RUNNING")
            {
                if (ScriptRunner.StepStatement()) { executed++; continue; }
            }
            break;
        }
        return executed;
    }

    /// <summary>Advances the virtual OS clock (sys_arch), triggering lwIP fast/slow/1s timers (RTO retransmission, TIME_WAIT, ARP aging).</summary>
    public void AdvanceClockMs(long deltaMs)
    {
        long target = NowMs + Math.Max(1, deltaMs);
        while (NowMs < target)
        {
            long step = Math.Min(250, target - NowMs);
            SysArch.AdvanceTime(step);

            if (NowMs - _lastFastTimerMs >= 250)
            {
                _lastFastTimerMs = NowMs;
                Client.FastTimerTick();
                Gateway.FastTimerTick();
                RemoteServer.FastTimerTick();
            }
            if (NowMs - _lastSlowTimerMs >= 500)
            {
                _lastSlowTimerMs = NowMs;
                Client.SlowTimerTick();
                Gateway.SlowTimerTick();
                RemoteServer.SlowTimerTick();
            }
            if (NowMs - _lastSecTimerMs >= 1000)
            {
                _lastSecTimerMs = NowMs;
                Client.OneSecondTimerTick();
                Gateway.OneSecondTimerTick();
                RemoteServer.OneSecondTimerTick();
            }
            PollAllApplications();
        }
    }

    private void PollAllApplications()
    {
        GatewayApp.Poll();
        RemoteApp.Poll();
        Client.Http.Poll();
        ScriptRunner.TryResumeWait();
    }

    // Quick Protocol Actions for UI toolbar
    public void TriggerPing(string ipStr, int payloadSize = 32)
    {
        var ip = Ip4Address.Parse(ipStr);
        var data = new byte[Math.Clamp(payloadSize, 8, 4000)];
        var pattern = Encoding.ASCII.GetBytes("WIN95-LWIP-PING!");
        for (int i = 0; i < data.Length; i++) data[i] = pattern[i % pattern.Length];
        Client.Icmp.SendEchoRequest(ip, 0x1995, (ushort)(_nextHopId & 0xFFFF), data);
    }

    public void TriggerPing6(string ip6Str)
    {
        var ip6 = Ip6Address.Parse(ip6Str);
        Client.Ip6.SendEchoRequest(ip6, 0x1996, (ushort)(_nextHopId & 0xFFFF), Encoding.ASCII.GetBytes("IPv6-NDP-PING"));
    }

    public void TriggerDnsLookup(string hostname)
    {
        Client.Dns.Resolve(hostname, (_, _, _) => { }, forceQuery: true);
    }

    public void TriggerDhcp() => Client.Dhcp.Start();
    public void TriggerAutoIp() => Client.AutoIp.Start();
    public void TriggerIgmpJoin(string group) => Client.Igmp.JoinGroup(Ip4Address.Parse(group));
    public void TriggerIgmpLeave(string group) => Client.Igmp.LeaveGroup(Ip4Address.Parse(group));
    public void TriggerGratuitousArp() => Client.Arp.SendGratuitousArp();

    public void SetClientMtu(int mtu)
    {
        int clamped = Math.Clamp(mtu, 68, 1500);
        Client.Netif.Mtu = clamped;
        Client.OsNic.Mtu = clamped;
    }

    public void ClearTraces()
    {
        _history.Clear();
    }

    public object BuildSnapshot()
    {
        return new
        {
            nowMs = NowMs,
            pendingCount = _pendingHops.Count,
            nextPending = _pendingHops.Take(8).Select(h => new
            {
                id = h.Id,
                nodeId = h.Trace.NodeId,
                nodeLabel = h.Trace.NodeLabel,
                fromLayer = h.Trace.FromLayer.ToString(),
                toLayer = h.Trace.ToLayer.ToString(),
                interfaceCall = h.Trace.InterfaceCall,
                direction = h.Trace.Direction.ToString(),
                protocol = h.Trace.Protocol,
                summary = h.Trace.Summary
            }),
            activePhaseTag = ActivePhaseTag,
            lastTrace = LastExecutedTrace,
            traces = _history.TakeLast(250).Select(t => new
            {
                t.Id,
                t.TimestampMs,
                t.NodeId,
                t.NodeLabel,
                fromLayer = t.FromLayer.ToString(),
                toLayer = t.ToLayer.ToString(),
                t.InterfaceCall,
                direction = t.Direction.ToString(),
                t.Protocol,
                t.Summary,
                t.Detail,
                t.PhaseTag,
                t.ByteLength,
                t.HexDump,
                t.AsciiPreview,
                t.Headers,
                t.Dropped,
                t.DropReason
            }),
            faults = new
            {
                VirtualSwitch.Faults.DropNextClientTx,
                VirtualSwitch.Faults.CorruptNextChecksum,
                VirtualSwitch.Faults.DuplicateNextPacket,
                VirtualSwitch.Faults.DropPercent,
                VirtualSwitch.Faults.WireLatencyMs,
                VirtualSwitch.FramesForwarded,
                VirtualSwitch.FramesDropped,
                VirtualSwitch.FramesCorrupted
            },
            client = BuildNodeSummary(Client),
            gateway = BuildNodeSummary(Gateway),
            server = BuildNodeSummary(RemoteServer),
            script = new
            {
                ScriptRunner.State.SourceCode,
                ScriptRunner.State.Lines,
                ScriptRunner.State.CurrentLine,
                ScriptRunner.State.Status,
                ScriptRunner.State.WaitReason,
                ScriptRunner.State.ErrorMessage,
                ScriptRunner.State.ConsoleOutput,
                ScriptRunner.State.Variables
            },
            http = Client.Http.CurrentTransaction
        };
    }

    private static object BuildNodeSummary(TcpIpStackNode n) => new
    {
        nodeId = n.NodeId,
        nodeLabel = n.NodeLabel,
        netif = new
        {
            name = n.Netif.Name,
            mac = n.Netif.HwAddr.ToString(),
            ip4 = n.Netif.Ip4Addr.ToString(),
            netmask = n.Netif.Netmask.ToString(),
            gateway = n.Netif.Gateway.ToString(),
            ip6LinkLocal = n.Netif.Ip6LinkLocal.ToString(),
            mtu = n.Netif.Mtu,
            isUp = n.Netif.IsUp,
            flags = n.Netif.Flags.ToString(),
            forwarding = n.Ip4.EnableForwarding,
            nicTxFrames = n.OsNic.TxFrames,
            nicRxFrames = n.OsNic.RxFrames
        },
        tcpPcbs = n.Tcp.GetPcbs().Select(p => new
        {
            p.Id,
            state = p.State.ToString(),
            local = $"{p.LocalIp}:{p.LocalPort}",
            remote = $"{p.RemoteIp}:{p.RemotePort}",
            p.SndUna,
            p.SndNxt,
            p.SndWnd,
            p.RcvNxt,
            p.RcvWnd,
            p.Cwnd,
            p.SsThresh,
            p.RtoMs,
            p.Mss,
            p.NoDelay,
            p.KeepAlive,
            unackedCount = p.Unacked.Count,
            ooseqCount = p.OutOfOrderQueue.Count
        }),
        udpPcbs = n.Udp.GetPcbs().Select(p => new
        {
            p.Id,
            local = $"{p.LocalIp}:{p.LocalPort}",
            remote = p.IsConnected ? $"{p.RemoteIp}:{p.RemotePort}" : "*:*"
        }),
        sockets = n.Sockets.GetSockets().Select(s => new
        {
            s.Fd,
            family = s.Family.ToString(),
            type = s.Type.ToString(),
            s.PcbId,
            s.IsConnected,
            s.IsClosed,
            s.IsClosedByPeer,
            rxBuffered = s.StreamRxBuffer.Count + s.DgramRxQueue.Count,
            tcpState = n.Sockets.GetTcpState(s.Fd)?.ToString()
        }),
        arpCache = n.Arp.GetCacheEntries().Select(a => new
        {
            ip = a.Ip.ToString(),
            mac = a.Mac.ToString(),
            state = a.State.ToString(),
            a.AgeSeconds,
            pending = a.PendingQueue.Count
        }),
        ndpCache = n.Ndp.GetCacheEntries().Select(d => new
        {
            ip6 = d.Ip6.ToString(),
            mac = d.Mac.ToString(),
            d.State,
            d.AgeSeconds
        }),
        routes = n.Ip4.GetRoutingTable().Select(r => new
        {
            network = r.Network.ToString(),
            netmask = r.Netmask.ToString(),
            nextHop = r.NextHop.IsAny ? "Direct" : r.NextHop.ToString(),
            r.InterfaceName,
            r.Metric
        }),
        dnsCache = n.Dns.GetCache().Select(c => new
        {
            c.Hostname,
            ip = c.Address.ToString(),
            c.TtlSeconds
        }),
        dhcp = new
        {
            n.Dhcp.StateName,
            offeredIp = n.Dhcp.OfferedIp.ToString(),
            serverIp = n.Dhcp.ServerIp.ToString(),
            n.Dhcp.LeaseTimeSeconds
        },
        autoIp = new { n.AutoIp.StateName },
        igmpGroups = n.Igmp.JoinedGroups.Select(g => g.ToString()),
        reassActive = n.Ip4.ActiveReassemblyCount,
        stats = n.Stats.AsDictionary(),
        pbufPool = new
        {
            n.PbufPool.TotalAllocated,
            n.PbufPool.CurrentlyInUse,
            n.PbufPool.PeakInUse
        }
    };
}
