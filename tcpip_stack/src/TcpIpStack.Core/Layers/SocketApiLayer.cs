using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

namespace TcpIpStack.Core.Layers;

public sealed class SocketEntry
{
    public int Fd { get; init; }
    public AddressFamilyType Family { get; init; }
    public SocketTypeKind Type { get; init; }
    public byte Protocol { get; init; }
    public int PcbId { get; set; }
    public bool IsConnected { get; set; }
    public bool IsClosedByPeer { get; set; }
    public bool IsClosed { get; set; }
    public LwipErr LastError { get; set; } = LwipErr.Ok;
    public Queue<byte> StreamRxBuffer { get; } = new();
    public Queue<(IpAddress SrcIp, ushort SrcPort, byte[] Data)> DgramRxQueue { get; } = new();
    public Queue<(int ChildFd, IpAddress RemoteIp, ushort RemotePort)> AcceptQueue { get; } = new();
}

/// <summary>
/// Layer 5: BSD Sockets / Netconn API Layer (lwIP sockets.c + api_lib.c).
/// Lower boundaries: ITcpLayer, IUdpLayer, IRawLayer.
/// Upper boundary: ISocketApi (used by SocketScriptRunner, HttpClientLayer, SimulatedServers).
/// </summary>
public sealed class SocketApiLayer : ISocketApi, ITcpCallbacks
{
    private readonly string _nodeId;
    private readonly string _nodeLabel;
    private readonly ITcpLayer _tcp;
    private readonly IUdpLayer _udp;
    private readonly IRawLayer _raw;
    private readonly IStepScheduler _scheduler;

    private readonly Dictionary<int, SocketEntry> _sockets = new();
    private readonly Dictionary<int, SocketEntry> _tcpPcbToSocket = new();
    private readonly Dictionary<int, SocketEntry> _udpPcbToSocket = new();
    private int _nextFd = 3; // 0,1,2 reserved for stdin/stdout/stderr convention

    public SocketApiLayer(
        string nodeId,
        string nodeLabel,
        ITcpLayer tcp,
        IUdpLayer udp,
        IRawLayer raw,
        IStepScheduler scheduler)
    {
        _nodeId = nodeId;
        _nodeLabel = nodeLabel;
        _tcp = tcp;
        _udp = udp;
        _raw = raw;
        _scheduler = scheduler;
    }

    public IReadOnlyCollection<SocketEntry> GetSockets() => _sockets.Values.ToList();

    public int Socket(AddressFamilyType family, SocketTypeKind type, byte protocol)
    {
        int fd = _nextFd++;
        var entry = new SocketEntry { Fd = fd, Family = family, Type = type, Protocol = protocol };

        if (type == SocketTypeKind.SockStream)
        {
            entry.PcbId = _tcp.CreatePcb(this);
            _tcpPcbToSocket[entry.PcbId] = entry;
        }
        else if (type == SocketTypeKind.SockDgram)
        {
            entry.PcbId = _udp.CreatePcb(OnUdpReceived);
            _udpPcbToSocket[entry.PcbId] = entry;
        }
        else
        {
            entry.PcbId = _raw.CreatePcb(protocol, (src, data) => entry.DgramRxQueue.Enqueue((src, 0, data)));
        }

        _sockets[fd] = entry;
        _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.Application, LayerId.SocketApi,
            $"ISocketApi.Socket({family}, {type}, {protocol})", TraceDirection.Control, "SOCKET",
            $"Created socket fd={fd} ({type}, PCB#{entry.PcbId})",
            $"Allocated BSD socket descriptor fd={fd} backed by transport PCB#{entry.PcbId}");
        return fd;
    }

    public LwipErr Bind(int fd, IpAddress addr, ushort port)
    {
        if (!_sockets.TryGetValue(fd, out var s)) return LwipErr.Arg;
        _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.Application, LayerId.SocketApi,
            $"ISocketApi.Bind(fd={fd}, {addr}:{port})", TraceDirection.Control, "SOCKET",
            $"bind(fd={fd}, {addr}:{port})", $"Binding socket fd={fd} to local endpoint");
        return s.Type == SocketTypeKind.SockStream ? _tcp.Bind(s.PcbId, addr, port)
            : s.Type == SocketTypeKind.SockDgram ? _udp.Bind(s.PcbId, addr, port) : LwipErr.Ok;
    }

    public LwipErr Listen(int fd, int backlog = 5)
    {
        if (!_sockets.TryGetValue(fd, out var s) || s.Type != SocketTypeKind.SockStream) return LwipErr.Arg;
        _scheduler.RecordInstantEvent(_nodeId, _nodeLabel, LayerId.Application, LayerId.SocketApi,
            $"ISocketApi.Listen(fd={fd}, backlog={backlog})", TraceDirection.Control, "SOCKET",
            $"listen(fd={fd}, backlog={backlog})", "Transitioning TCP socket to LISTEN state");
        return _tcp.Listen(s.PcbId, backlog);
    }

    public int Accept(int fd, out IpAddress remoteIp, out ushort remotePort)
    {
        remoteIp = IpAddress.AnyV4;
        remotePort = 0;
        if (!_sockets.TryGetValue(fd, out var s) || s.AcceptQueue.Count == 0) return -1;
        var item = s.AcceptQueue.Dequeue();
        remoteIp = item.RemoteIp;
        remotePort = item.RemotePort;
        return item.ChildFd;
    }

    public LwipErr Connect(int fd, IpAddress remoteIp, ushort remotePort)
    {
        if (!_sockets.TryGetValue(fd, out var s)) return LwipErr.Arg;
        if (s.Type == SocketTypeKind.SockStream)
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.SocketApi, LayerId.TransportTcp,
                $"ISocketApi.Connect(fd={fd}) -> ITcpLayer.Connect", TraceDirection.DownTx, "TCP",
                $"connect(fd={fd}, {remoteIp}:{remotePort}) -> TCP SYN",
                "Initiating TCP active open (3-way handshake)",
                ReadOnlySpan<byte>.Empty, "RAW",
                () => _tcp.Connect(s.PcbId, remoteIp, remotePort));
            return LwipErr.InProgress;
        }
        if (s.Type == SocketTypeKind.SockDgram)
        {
            s.IsConnected = true;
            return _udp.Connect(s.PcbId, remoteIp, remotePort);
        }
        return LwipErr.Arg;
    }

    public int Send(int fd, byte[] data, string? appSummary = null)
    {
        if (!_sockets.TryGetValue(fd, out var s) || s.IsClosed) return -1;
        if (s.Type == SocketTypeKind.SockStream)
        {
            string proto = (appSummary?.StartsWith("HTTP") == true) ? "HTTP" : "RAW";
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.SocketApi, LayerId.TransportTcp,
                $"ISocketApi.Send(fd={fd}, {data.Length}B) -> ITcpLayer.Write", TraceDirection.DownTx, proto,
                $"send(fd={fd}, {data.Length}B) | {appSummary ?? "TCP Stream Data"}",
                "Application payload passed across Socket API -> TCP layer",
                data, proto,
                () => _tcp.Write(s.PcbId, data, appSummary));
            return data.Length;
        }
        if (s.Type == SocketTypeKind.SockDgram)
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.SocketApi, LayerId.TransportUdp,
                $"ISocketApi.Send(fd={fd}) -> IUdpLayer.Send", TraceDirection.DownTx, "RAW",
                $"send(fd={fd}, {data.Length}B) -> UDP", "Connected UDP datagram send",
                data, "RAW", () => _udp.Send(s.PcbId, data, appSummary));
            return data.Length;
        }
        return -1;
    }

    public int Recv(int fd, int maxLen, out byte[] data)
    {
        data = [];
        if (!_sockets.TryGetValue(fd, out var s)) return -1;
        if (s.Type == SocketTypeKind.SockStream)
        {
            if (s.StreamRxBuffer.Count == 0)
                return s.IsClosedByPeer ? 0 : -1; // -1 = would block

            int take = Math.Min(maxLen, s.StreamRxBuffer.Count);
            data = new byte[take];
            for (int i = 0; i < take; i++) data[i] = s.StreamRxBuffer.Dequeue();
            return take;
        }
        if (s.DgramRxQueue.Count == 0) return -1;
        var item = s.DgramRxQueue.Dequeue();
        data = item.Data.Length <= maxLen ? item.Data : item.Data[..maxLen];
        return data.Length;
    }

    public int SendTo(int fd, byte[] data, IpAddress dstIp, ushort dstPort, string? appSummary = null)
    {
        if (!_sockets.TryGetValue(fd, out var s)) return -1;
        if (s.Type == SocketTypeKind.SockDgram)
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.SocketApi, LayerId.TransportUdp,
                $"ISocketApi.SendTo(fd={fd}) -> IUdpLayer.SendTo", TraceDirection.DownTx, "RAW",
                $"sendto(fd={fd}, {dstIp}:{dstPort}, {data.Length}B)",
                "Datagram passed across Socket API -> UDP layer",
                data, "RAW",
                () => _udp.SendTo(s.PcbId, dstIp, dstPort, data, appSummary));
            return data.Length;
        }
        if (s.Type == SocketTypeKind.SockRaw)
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.SocketApi, LayerId.TransportRaw,
                $"ISocketApi.SendTo(fd={fd}) -> IRawLayer.SendTo", TraceDirection.DownTx, "RAW",
                $"raw sendto(fd={fd}, {dstIp}, {data.Length}B)",
                "Raw payload passed across Socket API -> Raw layer",
                data, "RAW",
                () => _raw.SendTo(s.PcbId, dstIp, data));
            return data.Length;
        }
        return -1;
    }

    public int RecvFrom(int fd, int maxLen, out byte[] data, out IpAddress srcIp, out ushort srcPort)
    {
        data = [];
        srcIp = IpAddress.AnyV4;
        srcPort = 0;
        if (!_sockets.TryGetValue(fd, out var s) || s.DgramRxQueue.Count == 0) return -1;
        var item = s.DgramRxQueue.Dequeue();
        srcIp = item.SrcIp;
        srcPort = item.SrcPort;
        data = item.Data.Length <= maxLen ? item.Data : item.Data[..maxLen];
        return data.Length;
    }

    public LwipErr Close(int fd)
    {
        if (!_sockets.TryGetValue(fd, out var s)) return LwipErr.Arg;
        s.IsClosed = true;
        if (s.Type == SocketTypeKind.SockStream)
        {
            _scheduler.ScheduleHop(_nodeId, _nodeLabel, LayerId.SocketApi, LayerId.TransportTcp,
                $"ISocketApi.Close(fd={fd}) -> ITcpLayer.Close", TraceDirection.DownTx, "TCP",
                $"close(fd={fd}) -> TCP FIN", "Closing TCP socket via ITcpLayer.Close",
                ReadOnlySpan<byte>.Empty, "RAW",
                () => _tcp.Close(s.PcbId));
        }
        else if (s.Type == SocketTypeKind.SockDgram)
        {
            _udp.RemovePcb(s.PcbId);
            _udpPcbToSocket.Remove(s.PcbId);
        }
        else
        {
            _raw.RemovePcb(s.PcbId);
        }
        return LwipErr.Ok;
    }

    public LwipErr SetSockOpt(int fd, string optionName, int value)
    {
        if (!_sockets.TryGetValue(fd, out var s)) return LwipErr.Arg;
        if (s.Type == SocketTypeKind.SockStream)
        {
            switch (optionName.ToUpperInvariant())
            {
                case "TCP_NODELAY": _tcp.SetNoDelay(s.PcbId, value != 0); return LwipErr.Ok;
                case "SO_KEEPALIVE": _tcp.SetKeepAlive(s.PcbId, value != 0); return LwipErr.Ok;
                case "SO_RCVBUF": _tcp.SetReceiveWindow(s.PcbId, (ushort)Math.Clamp(value, 0, 65535)); return LwipErr.Ok;
            }
        }
        return LwipErr.Val;
    }

    public bool IsConnected(int fd) => _sockets.TryGetValue(fd, out var s) && s.IsConnected;

    public bool IsClosedOrError(int fd, out LwipErr err)
    {
        err = LwipErr.Ok;
        if (!_sockets.TryGetValue(fd, out var s)) return true;
        err = s.LastError;
        return s.IsClosedByPeer || s.LastError != LwipErr.Ok;
    }

    public bool HasReadableData(int fd) =>
        _sockets.TryGetValue(fd, out var s) && (s.StreamRxBuffer.Count > 0 || s.DgramRxQueue.Count > 0 || s.IsClosedByPeer);

    public bool HasPendingAccept(int fd) =>
        _sockets.TryGetValue(fd, out var s) && s.AcceptQueue.Count > 0;

    public TcpState? GetTcpState(int fd)
    {
        if (!_sockets.TryGetValue(fd, out var s) || s.Type != SocketTypeKind.SockStream) return null;
        return (_tcp as TcpLayer)?.GetPcb(s.PcbId)?.State ?? TcpState.Closed;
    }

    // ITcpCallbacks implementation (upward from TCP Layer)
    public void OnConnected(int pcbId)
    {
        if (_tcpPcbToSocket.TryGetValue(pcbId, out var s)) s.IsConnected = true;
    }

    public void OnAccepted(int listenPcbId, int newPcbId, IpAddress remoteIp, ushort remotePort)
    {
        if (!_tcpPcbToSocket.TryGetValue(listenPcbId, out var listenSock)) return;
        int childFd = _nextFd++;
        var child = new SocketEntry
        {
            Fd = childFd,
            Family = listenSock.Family,
            Type = SocketTypeKind.SockStream,
            Protocol = ProtocolNumbers.IpProtoTcp,
            PcbId = newPcbId,
            IsConnected = true
        };
        _sockets[childFd] = child;
        _tcpPcbToSocket[newPcbId] = child;
        listenSock.AcceptQueue.Enqueue((childFd, remoteIp, remotePort));
    }

    public void OnReceived(int pcbId, byte[] data)
    {
        if (!_tcpPcbToSocket.TryGetValue(pcbId, out var s)) return;
        foreach (byte b in data) s.StreamRxBuffer.Enqueue(b);
    }

    public void OnSent(int pcbId, int ackedBytes) { }

    public void OnClosed(int pcbId)
    {
        if (_tcpPcbToSocket.TryGetValue(pcbId, out var s)) s.IsClosedByPeer = true;
    }

    public void OnError(int pcbId, LwipErr err)
    {
        if (_tcpPcbToSocket.TryGetValue(pcbId, out var s))
        {
            s.LastError = err;
            s.IsClosedByPeer = true;
        }
    }

    private void OnUdpReceived(int pcbId, IpAddress srcIp, ushort srcPort, byte[] data)
    {
        if (_udpPcbToSocket.TryGetValue(pcbId, out var s))
            s.DgramRxQueue.Enqueue((srcIp, srcPort, data));
    }
}
