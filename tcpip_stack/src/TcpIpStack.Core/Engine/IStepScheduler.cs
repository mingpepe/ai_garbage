using TcpIpStack.Core.Common;

namespace TcpIpStack.Core.Engine;

/// <summary>
/// Central discrete-event step dispatcher separating every inter-layer hop so the UI can single-step
/// across every interface boundary in the TCP/IP stack.
/// </summary>
public interface IStepScheduler
{
    long NowMs { get; }
    string? ActivePhaseTag { get; set; }

    void ScheduleHop(
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
        long delayMs = 0);

    void RecordInstantEvent(
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
        string? dropReason = null);
}
