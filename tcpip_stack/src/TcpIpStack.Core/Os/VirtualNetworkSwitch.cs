using TcpIpStack.Core.Common;
using TcpIpStack.Core.Engine;

namespace TcpIpStack.Core.Os;

public sealed class FaultInjectionConfig
{
    public bool DropNextClientTx { get; set; }
    public bool CorruptNextChecksum { get; set; }
    public bool DuplicateNextPacket { get; set; }
    public int DropPercent { get; set; }
    public int WireLatencyMs { get; set; } = 5;
}

/// <summary>
/// Simulated Layer-2 Ethernet Switch & Virtual Wire connecting all simulated OS NICs.
/// Supports deterministic fault injection (drop, bit-flip corruption, duplicate) to test TCP retransmission & checksum verification.
/// </summary>
public sealed class VirtualNetworkSwitch
{
    private readonly List<SimulatedOsNic> _nics = [];
    private readonly IStepScheduler _scheduler;
    private readonly SimulatedSysArch _sysArch;

    public FaultInjectionConfig Faults { get; } = new();
    public long FramesForwarded { get; private set; }
    public long FramesDropped { get; private set; }
    public long FramesCorrupted { get; private set; }

    public VirtualNetworkSwitch(IStepScheduler scheduler, SimulatedSysArch sysArch)
    {
        _scheduler = scheduler;
        _sysArch = sysArch;
    }

    public void AttachNic(SimulatedOsNic nic)
    {
        if (!_nics.Contains(nic)) _nics.Add(nic);
    }

    public void ClearNics()
    {
        _nics.Clear();
        FramesForwarded = 0;
        FramesDropped = 0;
        FramesCorrupted = 0;
    }

    public void DeliverFrom(SimulatedOsNic sender, byte[] frame, string description)
    {
        if (frame.Length < 14) return;

        // Fault injection: one-shot drop of client outbound packet
        if (Faults.DropNextClientTx && sender.NodeId == "client")
        {
            Faults.DropNextClientTx = false;
            FramesDropped++;
            _scheduler.RecordInstantEvent("wire", "Virtual Wire", LayerId.VirtualWire, LayerId.VirtualWire,
                "VirtualSwitch.FaultInject(DROP)", TraceDirection.Wire, "FAULT",
                $"DROPPED (injected): {description}",
                "Packet dropped on virtual wire to demonstrate TCP retransmission / timeout recovery",
                frame, "ETHERNET", dropped: true, dropReason: "Injected Packet Loss");
            return;
        }

        if (Faults.DropPercent > 0 && (_sysArch.NextRandomUInt32() % 100) < Faults.DropPercent)
        {
            FramesDropped++;
            _scheduler.RecordInstantEvent("wire", "Virtual Wire", LayerId.VirtualWire, LayerId.VirtualWire,
                "VirtualSwitch.RandomDrop", TraceDirection.Wire, "FAULT",
                $"DROPPED ({Faults.DropPercent}% loss): {description}",
                "Simulated random wire packet loss",
                frame, "ETHERNET", dropped: true, dropReason: $"Random Drop ({Faults.DropPercent}%)");
            return;
        }

        byte[] wireFrame = frame.ToArray();
        if (Faults.CorruptNextChecksum)
        {
            Faults.CorruptNextChecksum = false;
            FramesCorrupted++;
            int bitPos = Math.Min(wireFrame.Length - 1, 24);
            wireFrame[bitPos] ^= 0xFF;
            _scheduler.RecordInstantEvent("wire", "Virtual Wire", LayerId.VirtualWire, LayerId.VirtualWire,
                "VirtualSwitch.FaultInject(CORRUPT)", TraceDirection.Wire, "FAULT",
                $"CORRUPTED byte[{bitPos}]: {description}",
                "Bit-flip injected on virtual wire to trigger IP/TCP/UDP checksum error detection",
                wireFrame, "ETHERNET");
        }

        bool duplicate = false;
        if (Faults.DuplicateNextPacket)
        {
            Faults.DuplicateNextPacket = false;
            duplicate = true;
        }

        var dstMac = MacAddress.FromSpan(wireFrame.AsSpan(0, 6));
        int delivered = 0;

        foreach (var target in _nics)
        {
            if (ReferenceEquals(target, sender)) continue;
            if (dstMac.IsBroadcast || dstMac.IsMulticast || target.MacAddress == dstMac)
            {
                delivered++;
                FramesForwarded++;
                var copy = wireFrame.ToArray();
                _scheduler.ScheduleHop(
                    target.NodeId, target.NodeLabel,
                    LayerId.VirtualWire, LayerId.OsNic,
                    $"VirtualWire -> {target.NodeLabel}.NIC({target.MacAddress})",
                    TraceDirection.Wire,
                    "ETHERNET",
                    $"Wire -> {target.NodeLabel}: {description}",
                    $"Ethernet frame arrives at {target.NodeLabel} NIC ({target.MacAddress})",
                    copy,
                    "ETHERNET",
                    () => target.ReceiveFromWire(copy, description),
                    delayMs: Faults.WireLatencyMs);

                if (duplicate)
                {
                    var dupCopy = wireFrame.ToArray();
                    _scheduler.ScheduleHop(
                        target.NodeId, target.NodeLabel,
                        LayerId.VirtualWire, LayerId.OsNic,
                        $"VirtualWire [DUP] -> {target.NodeLabel}.NIC",
                        TraceDirection.Wire,
                        "FAULT",
                        $"Wire [DUPLICATE] -> {target.NodeLabel}: {description}",
                        "Injected duplicate frame delivery",
                        dupCopy,
                        "ETHERNET",
                        () => target.ReceiveFromWire(dupCopy, "[DUP] " + description),
                        delayMs: Faults.WireLatencyMs + 2);
                }
            }
        }

        if (delivered == 0)
        {
            _scheduler.RecordInstantEvent("wire", "Virtual Wire", LayerId.VirtualWire, LayerId.VirtualWire,
                "VirtualSwitch.Forward", TraceDirection.Wire, "ETHERNET",
                $"No host matched Dst MAC {dstMac}",
                description, wireFrame, "ETHERNET", dropped: true, dropReason: "Unknown Dst MAC");
        }
    }
}
