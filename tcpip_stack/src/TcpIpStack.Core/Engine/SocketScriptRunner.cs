using System.Text;
using System.Text.RegularExpressions;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Engine;

public sealed class ScriptExecutionState
{
    public string SourceCode { get; set; } = "";
    public string[] Lines { get; set; } = [];
    public int CurrentLine { get; set; } = -1; // 0-based
    public string Status { get; set; } = "IDLE"; // IDLE, RUNNING, WAITING_NETWORK, COMPLETED, ERROR
    public string? WaitReason { get; set; }
    public string? ErrorMessage { get; set; }
    public List<string> ConsoleOutput { get; } = [];
    public Dictionary<string, string> Variables { get; } = new();
}

/// <summary>
/// Single-step C#-style Socket Program interpreter that executes directly against ISocketApi, IDnsClient,
/// IIcmpLayer, IIp6Layer, IDhcpClient, IAutoIpClient, IIgmpLayer so users can step line-by-line
/// AND packet-hop-by-hop simultaneously.
/// </summary>
public sealed class SocketScriptRunner
{
    private readonly TcpIpStackNode _client;
    private readonly IStepScheduler _scheduler;
    private readonly Action<long> _advanceClock;

    private int _pc;
    private string? _waitingOp; // "CONNECT", "RECV", "RECVFROM", "DNS"
    private int _waitFd = -1;
    private int _waitMaxLen = 1024;
    private string? _waitAssignVar;
    private string? _dnsResultIp;
    private bool _dnsDone;
    private ushort _pingSeq = 1;

    public ScriptExecutionState State { get; } = new();

    public SocketScriptRunner(TcpIpStackNode client, IStepScheduler scheduler, Action<long> advanceClock)
    {
        _client = client;
        _scheduler = scheduler;
        _advanceClock = advanceClock;
    }

    public void Load(string code, bool autoActivate = true)
    {
        State.SourceCode = code;
        State.Lines = code.Replace("\r\n", "\n").Split('\n');
        State.CurrentLine = FindNextExecutableLine(0);
        State.Status = State.CurrentLine >= 0 ? (autoActivate ? "RUNNING" : "IDLE") : "COMPLETED";
        State.WaitReason = null;
        State.ErrorMessage = null;
        State.ConsoleOutput.Clear();
        State.Variables.Clear();
        _pc = State.CurrentLine >= 0 ? State.CurrentLine : State.Lines.Length;
        _waitingOp = null;
        _waitFd = -1;
        _waitAssignVar = null;
    }

    public void ActivateIfIdle()
    {
        if (State.Status == "IDLE" && State.CurrentLine >= 0)
            State.Status = "RUNNING";
    }

    public bool IsWaitingForNetwork => _waitingOp != null;

    /// <summary>Checks if a blocking socket call (connect/recv/dns) can now unblock.</summary>
    public bool TryResumeWait()
    {
        if (_waitingOp == null) return false;

        if (_waitingOp == "CONNECT")
        {
            if (_client.Sockets.IsConnected(_waitFd))
            {
                Log($"[Line {_pc + 1}] connect(fd={_waitFd}) -> ESTABLISHED");
                _waitingOp = null;
                AdvancePc();
                return true;
            }
            if (_client.Sockets.IsClosedOrError(_waitFd, out var err) && err != LwipErr.Ok)
            {
                Fail($"connect(fd={_waitFd}) failed: {err}");
                return true;
            }
            return false;
        }

        if (_waitingOp == "RECV")
        {
            if (_client.Sockets.HasReadableData(_waitFd))
            {
                int n = _client.Sockets.Recv(_waitFd, _waitMaxLen, out var data);
                string text = n > 0 ? Encoding.UTF8.GetString(data) : "";
                if (!string.IsNullOrEmpty(_waitAssignVar)) State.Variables[_waitAssignVar] = text;
                Log($"[Line {_pc + 1}] recv(fd={_waitFd}) -> {n} bytes: \"{Escape(text)}\"");
                _waitingOp = null;
                AdvancePc();
                return true;
            }
            return false;
        }

        if (_waitingOp == "RECVFROM")
        {
            if (_client.Sockets.HasReadableData(_waitFd))
            {
                int n = _client.Sockets.RecvFrom(_waitFd, _waitMaxLen, out var data, out var srcIp, out var srcPort);
                string text = n > 0 ? Encoding.UTF8.GetString(data) : "";
                if (!string.IsNullOrEmpty(_waitAssignVar)) State.Variables[_waitAssignVar] = text;
                Log($"[Line {_pc + 1}] recvfrom(fd={_waitFd}) from {srcIp}:{srcPort} -> {n} bytes: \"{Escape(text)}\"");
                _waitingOp = null;
                AdvancePc();
                return true;
            }
            return false;
        }

        if (_waitingOp == "DNS")
        {
            if (_dnsDone)
            {
                if (!string.IsNullOrEmpty(_waitAssignVar)) State.Variables[_waitAssignVar] = _dnsResultIp ?? "";
                Log($"[Line {_pc + 1}] dns_resolve() -> {_dnsResultIp ?? "FAILED"}");
                _waitingOp = null;
                AdvancePc();
                return true;
            }
            return false;
        }

        return false;
    }

    /// <summary>Executes exactly one statement from the socket script.</summary>
    public bool StepStatement()
    {
        if (State.Status is "IDLE" or "COMPLETED" or "ERROR") return false;
        if (_waitingOp != null)
        {
            return TryResumeWait();
        }
        if (_pc < 0 || _pc >= State.Lines.Length)
        {
            State.Status = "COMPLETED";
            State.CurrentLine = -1;
            return false;
        }

        string rawLine = StripComment(State.Lines[_pc]).Trim();
        if (string.IsNullOrEmpty(rawLine))
        {
            AdvancePc();
            return true;
        }

        try
        {
            ExecuteLine(rawLine);
            if (_waitingOp == null && State.Status != "ERROR")
                AdvancePc();
            return true;
        }
        catch (Exception ex)
        {
            Fail($"Line {_pc + 1}: {ex.Message}");
            return false;
        }
    }

    private void ExecuteLine(string line)
    {
        string stmt = line.TrimEnd(';').Trim();
        string? assignVar = null;

        // Parse optional "int x = ..." / "string s = ..." / "var x = ..." / "x = ..."
        var declMatch = Regex.Match(stmt, @"^(?:(?:int|string|var)\s+)?([A-Za-z_]\w*)\s*=\s*(.+)$");
        if (declMatch.Success)
        {
            assignVar = declMatch.Groups[1].Value;
            stmt = declMatch.Groups[2].Value.Trim();
        }

        var callMatch = Regex.Match(stmt, @"^([A-Za-z_]\w*)\s*\((.*)\)$");
        if (!callMatch.Success)
        {
            if (assignVar != null)
            {
                State.Variables[assignVar] = EvalExpr(stmt);
                Log($"[Line {_pc + 1}] {assignVar} = \"{State.Variables[assignVar]}\"");
                return;
            }
            throw new InvalidOperationException($"Unrecognized statement: {stmt}");
        }

        string fn = callMatch.Groups[1].Value.ToLowerInvariant();
        var args = SplitArgs(callMatch.Groups[2].Value);

        switch (fn)
        {
            case "socket":
            {
                var fam = args.Count > 0 && args[0].Contains("INET6", StringComparison.OrdinalIgnoreCase)
                    ? AddressFamilyType.AfInet6 : AddressFamilyType.AfInet;
                var typ = args.Count > 1 && args[1].Contains("DGRAM", StringComparison.OrdinalIgnoreCase)
                    ? SocketTypeKind.SockDgram
                    : args.Count > 1 && args[1].Contains("RAW", StringComparison.OrdinalIgnoreCase)
                        ? SocketTypeKind.SockRaw : SocketTypeKind.SockStream;
                byte proto = typ == SocketTypeKind.SockStream ? ProtocolNumbers.IpProtoTcp
                    : typ == SocketTypeKind.SockDgram ? ProtocolNumbers.IpProtoUdp : ProtocolNumbers.IpProtoIcmp;
                int fd = _client.Sockets.Socket(fam, typ, proto);
                if (assignVar != null) State.Variables[assignVar] = fd.ToString();
                Log($"[Line {_pc + 1}] socket({fam}, {typ}) => fd={fd}");
                break;
            }

            case "bind":
            {
                int fd = EvalInt(args[0]);
                var ip = IpAddress.Parse(EvalExpr(args[1]));
                ushort port = (ushort)EvalInt(args[2]);
                var err = _client.Sockets.Bind(fd, ip, port);
                Log($"[Line {_pc + 1}] bind(fd={fd}, {ip}:{port}) => {err}");
                break;
            }

            case "connect":
            {
                int fd = EvalInt(args[0]);
                var ip = IpAddress.Parse(EvalExpr(args[1]));
                ushort port = (ushort)EvalInt(args[2]);
                _client.Sockets.Connect(fd, ip, port);
                _waitingOp = "CONNECT";
                _waitFd = fd;
                State.Status = "WAITING_NETWORK";
                State.WaitReason = $"Waiting for TCP 3-way handshake on fd={fd} ({ip}:{port})";
                Log($"[Line {_pc + 1}] connect(fd={fd}, {ip}:{port}) -> SYN queued (waiting ESTABLISHED)");
                break;
            }

            case "send":
            {
                int fd = EvalInt(args[0]);
                string payload = EvalExpr(args[1]);
                int n = _client.Sockets.Send(fd, Encoding.UTF8.GetBytes(payload), $"Socket send: \"{Escape(payload, 40)}\"");
                if (assignVar != null) State.Variables[assignVar] = n.ToString();
                Log($"[Line {_pc + 1}] send(fd={fd}, {n}B) -> \"{Escape(payload, 60)}\"");
                break;
            }

            case "recv":
            {
                int fd = EvalInt(args[0]);
                int maxLen = args.Count > 1 ? EvalInt(args[1]) : 1024;
                if (_client.Sockets.HasReadableData(fd))
                {
                    int n = _client.Sockets.Recv(fd, maxLen, out var data);
                    string text = n > 0 ? Encoding.UTF8.GetString(data) : "";
                    if (assignVar != null) State.Variables[assignVar] = text;
                    Log($"[Line {_pc + 1}] recv(fd={fd}) => {n}B: \"{Escape(text)}\"");
                }
                else
                {
                    _waitingOp = "RECV";
                    _waitFd = fd;
                    _waitMaxLen = maxLen;
                    _waitAssignVar = assignVar;
                    State.Status = "WAITING_NETWORK";
                    State.WaitReason = $"Waiting for incoming TCP data on fd={fd}";
                    Log($"[Line {_pc + 1}] recv(fd={fd}) -> blocked waiting for segment");
                }
                break;
            }

            case "sendto":
            {
                int fd = EvalInt(args[0]);
                string payload = EvalExpr(args[1]);
                var ip = IpAddress.Parse(EvalExpr(args[2]));
                ushort port = (ushort)EvalInt(args[3]);
                int n = _client.Sockets.SendTo(fd, Encoding.UTF8.GetBytes(payload), ip, port);
                if (assignVar != null) State.Variables[assignVar] = n.ToString();
                Log($"[Line {_pc + 1}] sendto(fd={fd}, {ip}:{port}, {n}B)");
                break;
            }

            case "recvfrom":
            {
                int fd = EvalInt(args[0]);
                int maxLen = args.Count > 1 ? EvalInt(args[1]) : 1024;
                if (_client.Sockets.HasReadableData(fd))
                {
                    int n = _client.Sockets.RecvFrom(fd, maxLen, out var data, out var src, out var port);
                    string text = n > 0 ? Encoding.UTF8.GetString(data) : "";
                    if (assignVar != null) State.Variables[assignVar] = text;
                    Log($"[Line {_pc + 1}] recvfrom(fd={fd}) from {src}:{port} => \"{Escape(text)}\"");
                }
                else
                {
                    _waitingOp = "RECVFROM";
                    _waitFd = fd;
                    _waitMaxLen = maxLen;
                    _waitAssignVar = assignVar;
                    State.Status = "WAITING_NETWORK";
                    State.WaitReason = $"Waiting for UDP datagram on fd={fd}";
                }
                break;
            }

            case "close":
            {
                int fd = EvalInt(args[0]);
                _client.Sockets.Close(fd);
                Log($"[Line {_pc + 1}] close(fd={fd}) -> FIN sent");
                break;
            }

            case "setsockopt":
            {
                int fd = EvalInt(args[0]);
                string opt = EvalExpr(args[1]);
                int val = EvalInt(args[2]);
                var err = _client.Sockets.SetSockOpt(fd, opt, val);
                Log($"[Line {_pc + 1}] setsockopt(fd={fd}, {opt}={val}) => {err}");
                break;
            }

            case "dns_resolve":
            {
                string host = EvalExpr(args[0]);
                bool force = args.Count > 1 && EvalInt(args[1]) != 0;
                _dnsDone = false;
                _dnsResultIp = null;
                var err = _client.Dns.Resolve(host, (_, ip, _) =>
                {
                    _dnsResultIp = ip?.ToString();
                    _dnsDone = true;
                }, forceQuery: force);
                if (err == LwipErr.Ok && _dnsDone)
                {
                    if (assignVar != null) State.Variables[assignVar] = _dnsResultIp ?? "";
                    Log($"[Line {_pc + 1}] dns_resolve(\"{host}\") => {_dnsResultIp} (cache)");
                }
                else
                {
                    _waitingOp = "DNS";
                    _waitAssignVar = assignVar;
                    State.Status = "WAITING_NETWORK";
                    State.WaitReason = $"Waiting for DNS response for '{host}'";
                    Log($"[Line {_pc + 1}] dns_resolve(\"{host}\") -> UDP:53 query sent");
                }
                break;
            }

            case "ping":
            {
                var ip = Ip4Address.Parse(EvalExpr(args[0]));
                string msg = args.Count > 1 ? EvalExpr(args[1]) : "lwIP-C#-Ping-Payload-1995";
                _client.Icmp.SendEchoRequest(ip, 0x1995, _pingSeq++, Encoding.ASCII.GetBytes(msg));
                Log($"[Line {_pc + 1}] ping({ip}, {msg.Length}B) -> ICMP Echo Request");
                break;
            }

            case "ping6":
            {
                var ip6 = Ip6Address.Parse(EvalExpr(args[0]));
                string msg = args.Count > 1 ? EvalExpr(args[1]) : "IPv6-NDP-Echo";
                _client.Ip6.SendEchoRequest(ip6, 0x1996, _pingSeq++, Encoding.ASCII.GetBytes(msg));
                Log($"[Line {_pc + 1}] ping6({ip6}) -> ICMPv6 Echo Request (with NDP)");
                break;
            }

            case "dhcp_start":
            {
                _client.Dhcp.Start();
                Log($"[Line {_pc + 1}] dhcp_start() -> DHCP DISCOVER broadcast");
                break;
            }

            case "autoip_start":
            {
                _client.AutoIp.Start();
                Log($"[Line {_pc + 1}] autoip_start() -> RFC 3927 ARP Probe");
                break;
            }

            case "igmp_join":
            {
                var grp = Ip4Address.Parse(EvalExpr(args[0]));
                _client.Igmp.JoinGroup(grp);
                Log($"[Line {_pc + 1}] igmp_join({grp}) -> IGMPv2 Membership Report");
                break;
            }

            case "igmp_leave":
            {
                var grp = Ip4Address.Parse(EvalExpr(args[0]));
                _client.Igmp.LeaveGroup(grp);
                Log($"[Line {_pc + 1}] igmp_leave({grp}) -> IGMPv2 Leave Group");
                break;
            }

            case "sleep_ms":
            {
                long ms = EvalInt(args[0]);
                _advanceClock(ms);
                Log($"[Line {_pc + 1}] sleep_ms({ms}) -> virtual clock now {_scheduler.NowMs}ms");
                break;
            }

            case "print":
            {
                string text = EvalExpr(args[0]);
                Log($"STDOUT> {text}");
                break;
            }

            default:
                throw new InvalidOperationException($"Unknown socket function: {fn}()");
        }
    }

    private void AdvancePc()
    {
        _pc = FindNextExecutableLine(_pc + 1);
        if (_pc < 0)
        {
            State.CurrentLine = -1;
            State.Status = "COMPLETED";
            State.WaitReason = null;
        }
        else
        {
            State.CurrentLine = _pc;
            State.Status = "RUNNING";
            State.WaitReason = null;
        }
    }

    private int FindNextExecutableLine(int start)
    {
        for (int i = start; i < State.Lines.Length; i++)
        {
            if (!string.IsNullOrWhiteSpace(StripComment(State.Lines[i])))
                return i;
        }
        return -1;
    }

    private void Fail(string msg)
    {
        State.Status = "ERROR";
        State.ErrorMessage = msg;
        _waitingOp = null;
        Log($"ERROR: {msg}");
    }

    private void Log(string msg) => State.ConsoleOutput.Add(msg);

    private string EvalExpr(string expr)
    {
        expr = expr.Trim();
        // Support string concatenation with '+' outside quotes
        var parts = SplitOutsideQuotes(expr, '+');
        if (parts.Count > 1)
        {
            var sb = new StringBuilder();
            foreach (var p in parts) sb.Append(EvalAtom(p.Trim()));
            return sb.ToString();
        }
        return EvalAtom(expr);
    }

    private string EvalAtom(string token)
    {
        if (token.Length >= 2 && token[0] == '"' && token[^1] == '"')
            return token[1..^1].Replace("\\r", "\r").Replace("\\n", "\n");
        if (State.Variables.TryGetValue(token, out var val))
            return val;
        return token;
    }

    private int EvalInt(string expr)
    {
        string val = EvalExpr(expr);
        return int.TryParse(val, out int n) ? n : 0;
    }

    private static string StripComment(string line)
    {
        bool inStr = false;
        for (int i = 0; i < line.Length - 1; i++)
        {
            if (line[i] == '"') inStr = !inStr;
            if (!inStr && line[i] == '/' && line[i + 1] == '/') return line[..i];
        }
        return line;
    }

    private static List<string> SplitArgs(string raw) => SplitOutsideQuotes(raw, ',');

    private static List<string> SplitOutsideQuotes(string s, char sep)
    {
        var list = new List<string>();
        if (string.IsNullOrWhiteSpace(s)) return list;
        var cur = new StringBuilder();
        bool inStr = false;
        foreach (char c in s)
        {
            if (c == '"') inStr = !inStr;
            if (!inStr && c == sep)
            {
                list.Add(cur.ToString().Trim());
                cur.Clear();
            }
            else cur.Append(c);
        }
        if (cur.Length > 0) list.Add(cur.ToString().Trim());
        return list;
    }

    private static string Escape(string s, int max = 80)
    {
        string e = s.Replace("\r", "\\r").Replace("\n", "\\n");
        return e.Length > max ? e[..max] + "..." : e;
    }

    public static Dictionary<string, (string Title, string Description, string Code)> GetPresets() => new()
    {
        ["tcp_echo"] = (
            "1. TCP Echo Client (3-Way Handshake + Send/Recv + Close)",
            "Connects to remote server 93.184.216.34:7 via Gateway router, exchanges TCP data, and performs 4-way FIN teardown.",
            """
            // Resolve example.com via DNS (UDP:53)
            string serverIp = dns_resolve("example.com", 1);
            print("Resolved example.com => " + serverIp);

            // Open TCP stream socket & connect (SYN -> SYN+ACK -> ACK)
            int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
            connect(fd, serverIp, 7);

            // Send payload & receive echo response
            send(fd, "Hello from C# lwIP TCP/IP Stack!");
            string reply = recv(fd, 1024);
            print("Received: " + reply);

            // 4-Way TCP Close (FIN -> ACK -> FIN -> ACK)
            close(fd);
            print("Connection closed cleanly.");
            """),
        ["tcp_http_raw"] = (
            "2. Manual HTTP/1.1 over Raw TCP Socket",
            "Constructs a raw HTTP/1.1 GET request directly using BSD socket calls so you can step through every TCP/IP layer.",
            """
            string ip = dns_resolve("example.com", 1);
            int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
            connect(fd, ip, 80);
            send(fd, "GET /api/info HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n");
            string resp = recv(fd, 4096);
            print(resp);
            close(fd);
            """),
        ["udp_echo"] = (
            "3. UDP Datagram Client (Connectionless)",
            "Sends a UDP datagram to Gateway echo service (192.168.1.1:7) and receives the echoed datagram.",
            """
            int fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
            sendto(fd, "Win95 UDP Packet Test", "192.168.1.1", 7);
            string resp = recvfrom(fd, 1024);
            print("UDP Reply: " + resp);
            close(fd);
            """),
        ["dhcp_dora"] = (
            "4. DHCP DORA Lease Acquisition",
            "Runs full RFC 2131 DHCP DISCOVER -> OFFER -> REQUEST -> ACK handshake over UDP 68<->67.",
            """
            print("Starting DHCP DORA handshake...");
            dhcp_start();
            print("Step through DISCOVER, OFFER, REQUEST, ACK frames!");
            """),
        ["ipv6_ndp_ping"] = (
            "5. IPv6 + NDP Neighbor Discovery + ICMPv6 Ping",
            "Triggers ICMPv6 Neighbor Solicitation/Advertisement (NDP) followed by ICMPv6 Echo Request/Reply.",
            """
            print("Pinging Gateway IPv6 Link-Local fe80::1...");
            ping6("fe80::1", "Hello IPv6 NDP!");
            """),
        ["igmp_multicast"] = (
            "6. IGMPv2 Multicast Join & Leave",
            "Sends IGMPv2 Membership Report (0x16) and Leave Group (0x17) using Ethernet multicast MAC 01:00:5E:xx.",
            """
            igmp_join("224.0.1.100");
            igmp_leave("224.0.1.100");
            print("IGMPv2 Join & Leave completed.");
            """)
    };
}
