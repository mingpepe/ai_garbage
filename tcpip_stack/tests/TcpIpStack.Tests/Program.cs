using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

int passed = 0;
int failed = 0;

void Assert(bool cond, string name, string? detail = null)
{
    if (cond) { passed++; Console.WriteLine($"[PASS] {name}"); }
    else { failed++; Console.WriteLine($"[FAIL] {name} {(detail != null ? "- " + detail : "")}"); }
}

// Test 1: ICMPv4 Ping + ARP + Gateway Router Forwarding
{
    var sim = new SimulationEngine();
    sim.TriggerPing("93.184.216.34", 40);
    sim.RunUntilIdle(300);
    Assert(sim.Client.Icmp.RecentReplies.Count == 1, "ICMPv4 Ping routed through Gateway -> RemoteServer");
    Assert(sim.Gateway.Stats.Ip4.Fw >= 2, "Gateway performed IPv4 forwarding with TTL decrement");
    Assert(sim.Client.Arp.GetCacheEntries().Any(a => a.Ip == Ip4Address.Parse("192.168.1.1") && a.State == TcpIpStack.Core.Layers.ArpEntryState.Stable), "Client ARP resolved Gateway MAC");
}

// Test 2: IPv4 Fragmentation & Reassembly (MTU = 100, Ping payload = 240)
{
    var sim = new SimulationEngine();
    sim.SetClientMtu(100);
    sim.TriggerPing("192.168.1.1", 240);
    sim.RunUntilIdle(400);
    Assert(sim.Client.Stats.Ip4Frag.Xmit >= 3, $"IPv4 fragmented outgoing datagram ({sim.Client.Stats.Ip4Frag.Xmit} frags)");
    Assert(sim.Gateway.Stats.Ip4Frag.Recv >= 3, $"Gateway received & reassembled fragments ({sim.Gateway.Stats.Ip4Frag.Recv})");
    Assert(sim.Client.Icmp.RecentReplies.Count == 1 && sim.Client.Icmp.RecentReplies[0].Bytes == 240, "Ping reply matches full 240B reassembled payload");
}

// Test 3: End-to-end HTTP/1.1 GET (DNS -> ARP -> TCP 3-Way -> HTTP GET -> 200 OK -> TCP FIN)
{
    var sim = new SimulationEngine();
    var tx = sim.Client.Http.StartRequest(new HttpRequestSpec("GET", "http://example.com/", FlushDnsBefore: true, FlushArpBefore: true));
    sim.RunUntilIdle(500);
    Assert(tx.Completed && tx.StatusCode == 200, $"HTTP/1.1 GET http://example.com/ -> {tx.StatusCode} {tx.StatusText}");
    Assert(tx.ResolvedIp == "93.184.216.34", $"HTTP resolved DNS example.com -> {tx.ResolvedIp}");
    Assert(tx.ResponseBody.Contains("Welcome to Example.com"), "HTTP response HTML body received intact");
    Assert(tx.Milestones.Count >= 5, $"HTTP recorded full lifecycle milestones ({tx.Milestones.Count})");
}

// Test 4: Multi-Segment TCP Transfer (/large > 3000 bytes across MSS=1460)
{
    var sim = new SimulationEngine();
    var tx = sim.Client.Http.StartRequest(new HttpRequestSpec("GET", "http://example.com/large"));
    sim.RunUntilIdle(600);
    Assert(tx.Completed && tx.StatusCode == 200 && tx.ResponseBody.Length > 2500,
        $"Multi-segment HTTP /large transferred {tx.ResponseBody.Length}B cleanly across TCP segments");
}

// Test 5: TCP Retransmission Recovery under Fault Injection (Drop SYN -> RTO -> Retransmit -> Succeed!)
{
    var sim = new SimulationEngine();
    // Prime ARP first so the dropped packet is specifically the TCP SYN
    sim.TriggerPing("192.168.1.1", 16);
    sim.RunUntilIdle(200);

    sim.ScriptRunner.Load("""
        int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        connect(fd, "192.168.1.1", 7);
        send(fd, "Resilient TCP!");
        string r = recv(fd, 512);
        close(fd);
    """);

    sim.VirtualSwitch.Faults.DropNextClientTx = true;
    sim.RunUntilIdle(200); // SYN dropped, script waiting on connect
    Assert(sim.ScriptRunner.State.Status == "WAITING_NETWORK", "Script paused waiting for dropped TCP SYN");

    // Advance virtual clock past RTO (1000ms) -> triggers tcp_slowtmr retransmission
    sim.AdvanceClockMs(1500);
    sim.RunUntilIdle(400);
    Assert(sim.ScriptRunner.State.Status == "COMPLETED", $"TCP recovered via RTO retransmission (status={sim.ScriptRunner.State.Status})");
    Assert(sim.ScriptRunner.State.Variables.GetValueOrDefault("r") == "ECHO: Resilient TCP!", "Echo payload received after RTO recovery");
}

// Test 6: DHCP DORA Lease Acquisition
{
    var sim = new SimulationEngine();
    sim.TriggerDhcp();
    sim.RunUntilIdle(300);
    Assert(sim.Client.Dhcp.StateName == "BOUND", $"DHCP completed DORA -> {sim.Client.Dhcp.StateName} ({sim.Client.Netif.Ip4Addr})");
}

// Test 7: IPv6 + NDP Neighbor Discovery + ICMPv6 Ping
{
    var sim = new SimulationEngine();
    sim.TriggerPing6("fe80::1");
    sim.RunUntilIdle(300);
    Assert(sim.Client.Ndp.GetCacheEntries().Any(e => e.Ip6 == Ip6Address.Parse("fe80::1") && e.State == "REACHABLE"), "IPv6 NDP resolved fe80::1");
    Assert(sim.Client.Stats.Icmp6.Recv >= 1, "Client received ICMPv6 Echo Reply");
}

// Test 8: Checksum Corruption Detection
{
    var sim = new SimulationEngine();
    sim.TriggerPing("192.168.1.1", 16);
    sim.RunUntilIdle(100);
    sim.VirtualSwitch.Faults.CorruptNextChecksum = true;
    sim.TriggerPing("192.168.1.1", 16);
    sim.RunUntilIdle(200);
    Assert(sim.Gateway.Stats.Ip4.ChkErr >= 1, $"Corrupted frame rejected by IPv4 header checksum (ChkErr={sim.Gateway.Stats.Ip4.ChkErr})");
}

// Test 9: IGMPv2 Multicast Join & Leave + AutoIP
{
    var sim = new SimulationEngine();
    sim.TriggerIgmpJoin("224.0.1.100");
    sim.RunUntilIdle(100);
    Assert(sim.Client.Igmp.JoinedGroups.Contains(Ip4Address.Parse("224.0.1.100")), "IGMPv2 joined 224.0.1.100");
    sim.TriggerAutoIp();
    sim.RunUntilIdle(50);
    sim.AdvanceClockMs(3500);
    sim.RunUntilIdle(100);
    Assert(sim.Client.AutoIp.StateName == "BOUND" && sim.Client.Netif.Ip4Addr.IsLinkLocal, $"AutoIP RFC 3927 bound link-local {sim.Client.Netif.Ip4Addr}");
}

// Test 10: Loopback 127.0.0.1
{
    var sim = new SimulationEngine();
    sim.TriggerPing("127.0.0.1", 16);
    sim.RunUntilIdle(100);
    Assert(sim.Client.Icmp.RecentReplies.Any(r => r.From == Ip4Address.Loopback), "Loopback 127.0.0.1 ICMP Echo succeeded");
}

Console.WriteLine($"\n=== Test Summary: {passed} passed, {failed} failed ===");
return failed == 0 ? 0 : 1;
