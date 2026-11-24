using System.Text;
using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Apps;

/// <summary>
/// Layer 7: High-level HTTP/1.1 Client built strictly on ISocketApi + IDnsClient.
/// Drives DNS -> TCP 3-way handshake -> HTTP Request -> HTTP Response -> TCP 4-way close,
/// tagging every step with its lifecycle phase so the UI can visualize end-to-end HTTP mechanics.
/// </summary>
public sealed class HttpClientLayer : IHttpClient
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly ISocketApi _sockets;
    private readonly IDnsClient _dns;
    private readonly IArpLayer _arp;
    private readonly IStepScheduler _scheduler;

    private HttpTransactionState? _tx;
    private int _fd = -1;
    private readonly StringBuilder _rxAccum = new();
    private bool _requestSent;
    private bool _closeSent;
    private int _txSeq = 1;

    public HttpTransactionState? CurrentTransaction => _tx;

    public HttpClientLayer(
        string nodeId,
        string nodeLabel,
        ISocketApi sockets,
        IDnsClient dns,
        IArpLayer arp,
        IStepScheduler scheduler)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _sockets = sockets;
        _dns = dns;
        _arp = arp;
        _scheduler = scheduler;
    }

    public HttpTransactionState StartRequest(HttpRequestSpec spec)
    {
        if (spec.FlushDnsBefore) _dns.FlushCache();
        if (spec.FlushArpBefore) _arp.FlushCache();

        var uri = ParseUrl(spec.Url);
        string method = string.IsNullOrWhiteSpace(spec.Method) ? "GET" : spec.Method.Trim().ToUpperInvariant();

        var sb = new StringBuilder();
        sb.Append($"{method} {uri.PathAndQuery} HTTP/1.1\r\n");
        sb.Append($"Host: {uri.Host}{(uri.Port != 80 ? ":" + uri.Port : "")}\r\n");
        sb.Append("User-Agent: Win95-LwIP-Explorer/1.0 (C# TCP/IP Stack)\r\n");
        sb.Append("Accept: text/html, application/json, */*\r\n");
        sb.Append("Connection: close\r\n");

        byte[] bodyBytes = string.IsNullOrEmpty(spec.Body) ? [] : Encoding.UTF8.GetBytes(spec.Body);
        if (bodyBytes.Length > 0)
        {
            sb.Append($"Content-Length: {bodyBytes.Length}\r\n");
            if (spec.Headers == null || !spec.Headers.Keys.Any(k => k.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)))
                sb.Append("Content-Type: text/plain; charset=utf-8\r\n");
        }
        if (spec.Headers != null)
        {
            foreach (var kv in spec.Headers)
                sb.Append($"{kv.Key}: {kv.Value}\r\n");
        }
        sb.Append("\r\n");
        if (bodyBytes.Length > 0) sb.Append(spec.Body);

        _tx = new HttpTransactionState
        {
            Id = $"HTTP-{_txSeq++}",
            Method = method,
            Url = spec.Url,
            Host = uri.Host,
            Port = uri.Port,
            Path = uri.PathAndQuery,
            Phase = "DNS_LOOKUP",
            RawRequest = sb.ToString()
        };
        _fd = -1;
        _rxAccum.Clear();
        _requestSent = false;
        _closeSent = false;

        AddMilestone("DNS_LOOKUP", $"Initiating HTTP {method} {spec.Url} -> resolving host '{uri.Host}'");
        _scheduler.ActivePhaseTag = "1. DNS Resolution";

        _dns.Resolve(uri.Host, (host, ip, err) =>
        {
            if (_tx == null) return;
            if (err != LwipErr.Ok || !ip.HasValue)
            {
                _tx.Error = $"DNS resolution failed for {host}: {err}";
                _tx.Phase = "ERROR";
                _tx.Completed = true;
                _scheduler.ActivePhaseTag = null;
                return;
            }

            _tx.ResolvedIp = ip.Value.ToString();
            _tx.Phase = "TCP_HANDSHAKE";
            _scheduler.ActivePhaseTag = "2. TCP 3-Way Handshake";
            AddMilestone("TCP_HANDSHAKE", $"DNS resolved {host} -> {ip.Value}; opening TCP socket & calling connect({ip.Value}:{_tx.Port})");

            _fd = _sockets.Socket(AddressFamilyType.AfInet, SocketTypeKind.SockStream, ProtocolNumbers.IpProtoTcp);
            _sockets.Connect(_fd, new IpAddress(ip.Value), (ushort)_tx.Port);
        }, forceQuery: spec.FlushDnsBefore);

        return _tx;
    }

    public void Poll()
    {
        if (_tx == null || _tx.Completed || _fd < 0) return;

        // 1. Wait for TCP 3-way handshake completion, then send HTTP request
        if (!_requestSent && _sockets.IsConnected(_fd))
        {
            _requestSent = true;
            _tx.Phase = "HTTP_SEND";
            _scheduler.ActivePhaseTag = "3. HTTP Request TX";
            AddMilestone("HTTP_SEND", $"TCP ESTABLISHED (fd={_fd}); sending {_tx.RawRequest.Length}B HTTP/{_tx.Method} request");

            byte[] reqBytes = Encoding.UTF8.GetBytes(_tx.RawRequest);
            _sockets.Send(_fd, reqBytes, $"HTTP {_tx.Method} {_tx.Path}");
            _tx.Phase = "HTTP_RECV";
            _scheduler.ActivePhaseTag = "4. HTTP Response RX";
            return;
        }

        // 2. Drain any received response bytes
        if (_requestSent)
        {
            while (_sockets.HasReadableData(_fd))
            {
                int n = _sockets.Recv(_fd, 4096, out var chunk);
                if (n > 0)
                {
                    _rxAccum.Append(Encoding.UTF8.GetString(chunk));
                    _tx.RawResponse = _rxAccum.ToString();
                    ParseHttpResponse(_tx);
                }
                else if (n == 0)
                {
                    // Peer closed (FIN received)
                    if (!_closeSent)
                    {
                        _closeSent = true;
                        _tx.Phase = "TCP_CLOSE";
                        _scheduler.ActivePhaseTag = "5. TCP 4-Way Teardown";
                        AddMilestone("TCP_CLOSE", $"Received full HTTP {_tx.StatusCode} response ({_tx.RawResponse.Length}B); closing TCP socket");
                        _sockets.Close(_fd);
                    }
                    break;
                }
                else
                {
                    break;
                }
            }

            // Complete when TCP socket has been closed
            if (_closeSent)
            {
                var st = _sockets.GetTcpState(_fd);
                if (st is null or TcpState.Closed or TcpState.TimeWait or TcpState.LastAck)
                {
                    _tx.Phase = "COMPLETED";
                    _tx.Completed = true;
                    _scheduler.ActivePhaseTag = null;
                    AddMilestone("COMPLETED", $"HTTP transaction finished: {_tx.StatusCode} {_tx.StatusText} ({_tx.ResponseBody.Length}B body)");
                }
            }
            else if (_sockets.IsClosedOrError(_fd, out var err) && err != LwipErr.Ok)
            {
                _tx.Error = $"Socket error: {err}";
                _tx.Phase = "ERROR";
                _tx.Completed = true;
                _scheduler.ActivePhaseTag = null;
            }
        }
    }

    private void AddMilestone(string phase, string desc)
    {
        _tx?.Milestones.Add(new HttpPhaseMilestone(_scheduler.NowMs, phase, desc));
    }

    private static void ParseHttpResponse(HttpTransactionState tx)
    {
        int split = tx.RawResponse.IndexOf("\r\n\r\n", StringComparison.Ordinal);
        if (split < 0) return;

        string head = tx.RawResponse[..split];
        string body = tx.RawResponse[(split + 4)..];
        var lines = head.Split("\r\n");
        if (lines.Length > 0)
        {
            var parts = lines[0].Split(' ', 3);
            if (parts.Length >= 2 && int.TryParse(parts[1], out int code))
            {
                tx.StatusCode = code;
                tx.StatusText = parts.Length >= 3 ? parts[2] : "";
            }
        }

        tx.ResponseHeaders.Clear();
        for (int i = 1; i < lines.Length; i++)
        {
            int colon = lines[i].IndexOf(':');
            if (colon > 0)
                tx.ResponseHeaders[lines[i][..colon].Trim()] = lines[i][(colon + 1)..].Trim();
        }

        if (tx.ResponseHeaders.TryGetValue("Transfer-Encoding", out var te) &&
            te.Contains("chunked", StringComparison.OrdinalIgnoreCase))
        {
            tx.ResponseBody = DecodeChunked(body);
        }
        else
        {
            tx.ResponseBody = body;
        }
    }

    private static string DecodeChunked(string raw)
    {
        var sb = new StringBuilder();
        int pos = 0;
        while (pos < raw.Length)
        {
            int crlf = raw.IndexOf("\r\n", pos, StringComparison.Ordinal);
            if (crlf < 0) break;
            string hexLen = raw[pos..crlf].Trim();
            if (!int.TryParse(hexLen, System.Globalization.NumberStyles.HexNumber, null, out int len) || len == 0)
                break;
            pos = crlf + 2;
            if (pos + len > raw.Length) { sb.Append(raw[pos..]); break; }
            sb.Append(raw.AsSpan(pos, len));
            pos += len + 2;
        }
        return sb.ToString();
    }

    private static (string Host, int Port, string PathAndQuery) ParseUrl(string url)
    {
        string normalized = url.Trim();
        if (!normalized.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            normalized = "http://" + normalized;
        var uri = new Uri(normalized);
        return (uri.Host, uri.Port, string.IsNullOrEmpty(uri.PathAndQuery) ? "/" : uri.PathAndQuery);
    }
}
