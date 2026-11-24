using System.Buffers.Binary;
using System.Text;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Apps;

/// <summary>
/// Simulated Gateway services (DNS Server on UDP:53, DHCP Server on UDP:67, LAN TCP/UDP Echo on port 7)
/// running on top of a real TcpIpStackNode instance.
/// </summary>
public sealed class GatewayServices
{
    private readonly TcpIpStackNode _node;
    private readonly Dictionary<string, Ip4Address> _dnsRecords = new(StringComparer.OrdinalIgnoreCase)
    {
        ["example.com"] = new Ip4Address(93, 184, 216, 34),
        ["www.example.com"] = new Ip4Address(93, 184, 216, 34),
        ["retro.local"] = new Ip4Address(93, 184, 216, 34),
        ["win95.net"] = new Ip4Address(93, 184, 216, 34),
        ["gateway.local"] = new Ip4Address(192, 168, 1, 1),
        ["localhost"] = Ip4Address.Loopback
    };

    private readonly int _dnsUdpPcb;
    private readonly int _dhcpUdpPcb;
    private readonly int _udpEchoPcb;
    private readonly int _tcpEchoListenFd;
    private readonly List<int> _echoClients = [];
    private byte _nextLeaseOctet = 100;

    public IReadOnlyDictionary<string, Ip4Address> DnsRecords => _dnsRecords;

    public GatewayServices(TcpIpStackNode node)
    {
        _node = node;

        _dnsUdpPcb = _node.Udp.CreatePcb(OnDnsQuery);
        _node.Udp.Bind(_dnsUdpPcb, IpAddress.AnyV4, 53);

        _dhcpUdpPcb = _node.Udp.CreatePcb(OnDhcpRequest);
        _node.Udp.Bind(_dhcpUdpPcb, IpAddress.AnyV4, 67);

        _udpEchoPcb = _node.Udp.CreatePcb((pcb, srcIp, srcPort, data) =>
        {
            var reply = Encoding.UTF8.GetBytes("ECHO(GW): " + Encoding.UTF8.GetString(data));
            _node.Udp.SendTo(pcb, srcIp, srcPort, reply, "UDP Echo Reply");
        });
        _node.Udp.Bind(_udpEchoPcb, IpAddress.AnyV4, 7);

        _tcpEchoListenFd = _node.Sockets.Socket(AddressFamilyType.AfInet, SocketTypeKind.SockStream, ProtocolNumbers.IpProtoTcp);
        _node.Sockets.Bind(_tcpEchoListenFd, IpAddress.AnyV4, 7);
        _node.Sockets.Listen(_tcpEchoListenFd, 5);
    }

    public void Poll()
    {
        while (_node.Sockets.HasPendingAccept(_tcpEchoListenFd))
        {
            int cfd = _node.Sockets.Accept(_tcpEchoListenFd, out _, out _);
            if (cfd >= 0) _echoClients.Add(cfd);
        }

        for (int i = _echoClients.Count - 1; i >= 0; i--)
        {
            int cfd = _echoClients[i];
            if (_node.Sockets.HasReadableData(cfd))
            {
                int n = _node.Sockets.Recv(cfd, 4096, out var data);
                if (n > 0)
                {
                    var resp = Encoding.UTF8.GetBytes("ECHO: " + Encoding.UTF8.GetString(data));
                    _node.Sockets.Send(cfd, resp, "TCP Echo Reply");
                }
                else if (n == 0)
                {
                    _node.Sockets.Close(cfd);
                    _echoClients.RemoveAt(i);
                }
            }
        }
    }

    private void OnDnsQuery(int pcbId, IpAddress srcIp, ushort srcPort, byte[] query)
    {
        if (query.Length < 12) return;
        ushort txId = BinaryPrimitives.ReadUInt16BigEndian(query.AsSpan(0, 2));
        string qname = ReadName(query, 12, out int afterName);

        using var ms = new MemoryStream();
        Span<byte> hdr = stackalloc byte[12];
        BinaryPrimitives.WriteUInt16BigEndian(hdr[..2], txId);
        bool found = _dnsRecords.TryGetValue(qname, out var ip);
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(2, 2), found ? (ushort)0x8180 : (ushort)0x8183); // QR=1, RA=1, NXDOMAIN if !found
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(4, 2), 1); // QD=1
        BinaryPrimitives.WriteUInt16BigEndian(hdr.Slice(6, 2), found ? (ushort)1 : (ushort)0); // AN=1 or 0
        ms.Write(hdr);

        // Echo question section
        int qEnd = Math.Min(query.Length, afterName + 4);
        ms.Write(query, 12, qEnd - 12);

        if (found)
        {
            ms.Write([0xC0, 0x0C]); // Name pointer to offset 12
            ms.Write([0x00, 0x01, 0x00, 0x01]); // TYPE A, CLASS IN
            ms.Write([0x00, 0x00, 0x01, 0x2C]); // TTL 300s
            ms.Write([0x00, 0x04]); // RDLENGTH 4
            ms.Write(ip.ToBytes());
        }

        _node.Udp.SendTo(pcbId, srcIp, srcPort, ms.ToArray(),
            found ? $"DNS Reply {qname} -> {ip}" : $"DNS NXDOMAIN {qname}");
    }

    private void OnDhcpRequest(int pcbId, IpAddress srcIp, ushort srcPort, byte[] req)
    {
        if (req.Length < 244) return;
        uint xid = BinaryPrimitives.ReadUInt32BigEndian(req.AsSpan(4, 4));
        var clientMac = MacAddress.FromSpan(req.AsSpan(28, 6));

        byte msgType = 0;
        Ip4Address requested = Ip4Address.Any;
        int i = 240;
        while (i < req.Length)
        {
            byte opt = req[i++];
            if (opt == 255) break;
            if (opt == 0) continue;
            if (i >= req.Length) break;
            byte olen = req[i++];
            if (i + olen > req.Length) break;
            if (opt == 53 && olen >= 1) msgType = req[i];
            else if (opt == 50 && olen == 4) requested = Ip4Address.FromSpan(req.AsSpan(i, 4));
            i += olen;
        }

        if (msgType == 1) // DISCOVER -> OFFER
        {
            var offerIp = new Ip4Address(192, 168, 1, _nextLeaseOctet);
            var reply = BuildDhcpReply(2, xid, clientMac, offerIp);
            _node.Udp.SendTo(pcbId, new IpAddress(Ip4Address.Broadcast), 68, reply, $"DHCP OFFER {offerIp}");
        }
        else if (msgType == 3) // REQUEST -> ACK
        {
            var assigned = requested.IsAny ? new Ip4Address(192, 168, 1, _nextLeaseOctet) : requested;
            var reply = BuildDhcpReply(5, xid, clientMac, assigned);
            _node.Udp.SendTo(pcbId, new IpAddress(Ip4Address.Broadcast), 68, reply, $"DHCP ACK {assigned}");
        }
    }

    private byte[] BuildDhcpReply(byte msgType, uint xid, MacAddress clientMac, Ip4Address offeredIp)
    {
        var buf = new byte[296];
        buf[0] = 2; // BOOTREPLY
        buf[1] = 1;
        buf[2] = 6;
        BinaryPrimitives.WriteUInt32BigEndian(buf.AsSpan(4, 4), xid);
        BinaryPrimitives.WriteUInt16BigEndian(buf.AsSpan(10, 2), 0x8000);
        offeredIp.WriteTo(buf.AsSpan(16, 4)); // yiaddr
        _node.Netif.Ip4Addr.WriteTo(buf.AsSpan(20, 4)); // siaddr
        clientMac.WriteTo(buf.AsSpan(28, 6));
        buf[236] = 99; buf[237] = 130; buf[238] = 83; buf[239] = 99;

        int pos = 240;
        buf[pos++] = 53; buf[pos++] = 1; buf[pos++] = msgType;
        buf[pos++] = 1; buf[pos++] = 4; new Ip4Address(255, 255, 255, 0).WriteTo(buf.AsSpan(pos, 4)); pos += 4;
        buf[pos++] = 3; buf[pos++] = 4; _node.Netif.Ip4Addr.WriteTo(buf.AsSpan(pos, 4)); pos += 4;
        buf[pos++] = 6; buf[pos++] = 4; _node.Netif.Ip4Addr.WriteTo(buf.AsSpan(pos, 4)); pos += 4;
        buf[pos++] = 51; buf[pos++] = 4; BinaryPrimitives.WriteUInt32BigEndian(buf.AsSpan(pos, 4), 3600); pos += 4;
        buf[pos++] = 54; buf[pos++] = 4; _node.Netif.Ip4Addr.WriteTo(buf.AsSpan(pos, 4)); pos += 4;
        buf[pos] = 255;
        return buf;
    }

    private static string ReadName(byte[] buf, int pos, out int nextPos)
    {
        var sb = new StringBuilder();
        while (pos < buf.Length)
        {
            byte len = buf[pos++];
            if (len == 0) break;
            if (pos + len > buf.Length) break;
            if (sb.Length > 0) sb.Append('.');
            sb.Append(Encoding.ASCII.GetString(buf, pos, len));
            pos += len;
        }
        nextPos = pos;
        return sb.ToString();
    }
}

/// <summary>
/// Simulated Remote Web Server (HTTP/1.1 on TCP:80) + TCP Echo (TCP:7) + UDP Echo (UDP:7)
/// running on its own full TcpIpStackNode instance (93.184.216.34).
/// </summary>
public sealed class RemoteWebAndEchoServer
{
    private readonly TcpIpStackNode _node;
    private readonly int _httpListenFd;
    private readonly int _echoListenFd;
    private readonly int _udpEchoPcb;
    private readonly Dictionary<int, StringBuilder> _httpClients = new();
    private readonly List<int> _echoClients = [];

    public RemoteWebAndEchoServer(TcpIpStackNode node)
    {
        _node = node;

        _httpListenFd = _node.Sockets.Socket(AddressFamilyType.AfInet, SocketTypeKind.SockStream, ProtocolNumbers.IpProtoTcp);
        _node.Sockets.Bind(_httpListenFd, IpAddress.AnyV4, 80);
        _node.Sockets.Listen(_httpListenFd, 10);

        _echoListenFd = _node.Sockets.Socket(AddressFamilyType.AfInet, SocketTypeKind.SockStream, ProtocolNumbers.IpProtoTcp);
        _node.Sockets.Bind(_echoListenFd, IpAddress.AnyV4, 7);
        _node.Sockets.Listen(_echoListenFd, 10);

        _udpEchoPcb = _node.Udp.CreatePcb((pcb, srcIp, srcPort, data) =>
        {
            var resp = Encoding.UTF8.GetBytes("REMOTE UDP ECHO: " + Encoding.UTF8.GetString(data));
            _node.Udp.SendTo(pcb, srcIp, srcPort, resp, "Remote UDP Echo");
        });
        _node.Udp.Bind(_udpEchoPcb, IpAddress.AnyV4, 7);
    }

    public void Poll()
    {
        // Accept new HTTP connections
        while (_node.Sockets.HasPendingAccept(_httpListenFd))
        {
            int cfd = _node.Sockets.Accept(_httpListenFd, out _, out _);
            if (cfd >= 0) _httpClients[cfd] = new StringBuilder();
        }

        // Process HTTP requests
        foreach (var cfd in _httpClients.Keys.ToList())
        {
            if (!_node.Sockets.HasReadableData(cfd)) continue;
            int n = _node.Sockets.Recv(cfd, 4096, out var data);
            if (n > 0)
            {
                _httpClients[cfd].Append(Encoding.UTF8.GetString(data));
                string req = _httpClients[cfd].ToString();
                if (req.Contains("\r\n\r\n", StringComparison.Ordinal))
                {
                    string response = BuildHttpResponse(req);
                    _node.Sockets.Send(cfd, Encoding.UTF8.GetBytes(response), "HTTP/1.1 200 OK");
                    _node.Sockets.Close(cfd);
                    _httpClients.Remove(cfd);
                }
            }
            else if (n == 0)
            {
                _node.Sockets.Close(cfd);
                _httpClients.Remove(cfd);
            }
        }

        // Accept new TCP Echo connections
        while (_node.Sockets.HasPendingAccept(_echoListenFd))
        {
            int cfd = _node.Sockets.Accept(_echoListenFd, out _, out _);
            if (cfd >= 0) _echoClients.Add(cfd);
        }

        for (int i = _echoClients.Count - 1; i >= 0; i--)
        {
            int cfd = _echoClients[i];
            if (_node.Sockets.HasReadableData(cfd))
            {
                int n = _node.Sockets.Recv(cfd, 4096, out var data);
                if (n > 0)
                {
                    var resp = Encoding.UTF8.GetBytes("SERVER ECHO: " + Encoding.UTF8.GetString(data));
                    _node.Sockets.Send(cfd, resp, "TCP Echo Reply");
                }
                else if (n == 0)
                {
                    _node.Sockets.Close(cfd);
                    _echoClients.RemoveAt(i);
                }
            }
        }
    }

    private string BuildHttpResponse(string rawRequest)
    {
        var lines = rawRequest.Split("\r\n");
        var first = lines.Length > 0 ? lines[0].Split(' ') : ["GET", "/"];
        string method = first.Length > 0 ? first[0] : "GET";
        string path = first.Length > 1 ? first[1] : "/";
        int bodyIdx = rawRequest.IndexOf("\r\n\r\n", StringComparison.Ordinal);
        string reqBody = bodyIdx >= 0 ? rawRequest[(bodyIdx + 4)..] : "";

        if (path.Equals("/api/info", StringComparison.OrdinalIgnoreCase))
        {
            string json = $"{{\"server\":\"C# lwIP Simulated HTTP/1.1\",\"ip\":\"{_node.Netif.Ip4Addr}\",\"method\":\"{method}\",\"path\":\"{path}\",\"stack\":\"Ethernet->IPv4->TCP->HTTP\"}}";
            return FormatResp("200 OK", "application/json", json);
        }

        if (path.Equals("/large", StringComparison.OrdinalIgnoreCase))
        {
            // Multi-segment TCP payload (> 2 * MSS) to demonstrate TCP segmentation & sliding window!
            var sb = new StringBuilder();
            sb.Append("<html><body><h2>Multi-Segment TCP Transfer Demo (3,400+ bytes)</h2><pre>");
            for (int i = 1; i <= 40; i++)
                sb.AppendLine($"Line {i:D2}: [TCP Segmentation & Sliding Window Payload Block - lwIP C# Stack 1995]");
            sb.Append("</pre></body></html>");
            return FormatResp("200 OK", "text/html; charset=utf-8", sb.ToString());
        }

        if (path.Equals("/echo", StringComparison.OrdinalIgnoreCase))
        {
            string body = $"Echoed {method} payload ({reqBody.Length} bytes):\n{reqBody}";
            return FormatResp("200 OK", "text/plain; charset=utf-8", body);
        }

        if (path.Equals("/404", StringComparison.OrdinalIgnoreCase))
        {
            return FormatResp("404 Not Found", "text/html; charset=utf-8",
                "<html><body><h1>404 Not Found</h1><p>The requested document does not exist on retro.local.</p></body></html>");
        }

        string html =
            "<html><head><title>Welcome to Example.com (1995)</title></head>" +
            "<body bgcolor=\"#c0c0c0\">" +
            "<h1>Welcome to Example.com!</h1>" +
            "<hr>" +
            "<p>Served via <b>pure C# lwIP-parity TCP/IP Stack</b> over Simulated OS NIC &amp; Virtual Ethernet Switch.</p>" +
            "<ul>" +
            $"<li>Request: <code>{method} {path}</code></li>" +
            $"<li>Server IP: <code>{_node.Netif.Ip4Addr}</code> (routed via Gateway 192.168.1.1)</li>" +
            "<li>Protocol Chain: HTTP/1.1 &rarr; BSD Socket &rarr; TCP &rarr; IPv4 &rarr; ARP &rarr; Ethernet II &rarr; Simulated NIC</li>" +
            "</ul>" +
            "<p><i>Best viewed in Netscape Navigator 2.0 at 800x600!</i></p>" +
            "</body></html>";

        return FormatResp("200 OK", "text/html; charset=utf-8", html);
    }

    private static string FormatResp(string status, string contentType, string body)
    {
        int len = Encoding.UTF8.GetByteCount(body);
        return $"HTTP/1.1 {status}\r\n" +
               "Server: RetroHttpd/1.0 (C#-lwIP)\r\n" +
               $"Content-Type: {contentType}\r\n" +
               $"Content-Length: {len}\r\n" +
               "Connection: close\r\n" +
               "\r\n" +
               body;
    }
}
