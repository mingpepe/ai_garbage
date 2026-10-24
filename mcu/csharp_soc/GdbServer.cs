using System;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace DualCoreSoC;

/// <summary>
/// GDB Remote Serial Protocol (RSP) Server for a RISC-V Core (RV32IMA_Zicsr).
/// Allows VSCode (cppdbg + riscv32-unknown-elf-gdb) to set breakpoints, single-step C/ASM lines,
/// inspect registers/CSRs, and inspect/modify local SRAM & Shared Memory.
/// </summary>
public sealed class GdbServer
{
    private readonly RiscVCore _core;
    private readonly RiscVCore _peerCore;
    private readonly SoCBus _bus;
    private readonly HostApplication _hostApp;
    private readonly int _port;
    private readonly object _coreLock;
    private volatile bool _clientConnected = false;

    public bool IsClientConnected => _clientConnected;

    public GdbServer(RiscVCore core, RiscVCore peerCore, SoCBus bus, HostApplication hostApp, int port, object coreLock)
    {
        _core     = core;
        _peerCore = peerCore;
        _bus      = bus;
        _hostApp  = hostApp;
        _port     = port;
        _coreLock = coreLock;
    }

    public void RunServer(CancellationToken ct, GdbServer? peerServer)
    {
        var listener = new TcpListener(IPAddress.Loopback, _port);
        listener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        listener.Start();
        Console.WriteLine($"[GDB-Server Core{_core.HartId}] Listening on 127.0.0.1:{_port} ...");

        try
        {
            while (!ct.IsCancellationRequested)
            {
                if (!listener.Pending())
                {
                    // If no GDB client is attached to this core, but the peer core HAS a GDB client attached,
                    // automatically step this core in the background when booted so peer core single-stepping never stalls!
                    if (peerServer != null && peerServer.IsClientConnected)
                    {
                        StepBackgroundIfBooted();
                    }
                    Thread.Sleep(2);
                    continue;
                }

                using TcpClient client = listener.AcceptTcpClient();
                client.NoDelay = true;

                lock (_coreLock)
                {
                    if (peerServer == null || !peerServer.IsClientConnected)
                    {
                        _bus.Reset();
                        _core.Reset();
                        _peerCore.Reset();
                        _hostApp.PollStarted    = false;
                        _hostApp.ReportVerified = false;
                        _hostApp.PollCount      = 0;
                    }
                    _core.Breakpoints.Clear();
                }

                _clientConnected = true;
                _core.GdbHalted  = true;
                Console.WriteLine($"[GDB-Server Core{_core.HartId}] GDB client connected on port {_port}!");

                // If this is Core 1 and Core 0 has NO GDB client attached, let Core 0 boot Core 1 automatically
                if (_core.HartId == 1 && (peerServer == null || !peerServer.IsClientConnected))
                {
                    EnsureCore1BootedByCore0();
                }

                HandleClientSession(client, peerServer, ct);
                _clientConnected = false;
                _core.GdbHalted  = false;
                Console.WriteLine($"[GDB-Server Core{_core.HartId}] GDB client disconnected.");
            }
        }
        catch (SocketException) when (ct.IsCancellationRequested)
        {
        }
        finally
        {
            listener.Stop();
        }
    }

    private void EnsureCore1BootedByCore0()
    {
        int guard = 0;
        while (!_bus.Core1BootEn && guard < 20000)
        {
            lock (_coreLock)
            {
                _peerCore.Step(out _);
            }
            guard++;
        }
        lock (_coreLock)
        {
            if (_bus.Core1BootEn && !_core.BootActive)
            {
                _core.Pc = _bus.Core1BootAddr;
                _core.BootActive = true;
            }
        }
    }

    private void StepBackgroundIfBooted()
    {
        uint doneBit = (1u << _core.HartId);
        if ((_bus.SimDoneFlags & doneBit) != 0) return;

        lock (_coreLock)
        {
            for (int i = 0; i < 8; i++)
            {
                if ((_bus.SimDoneFlags & doneBit) != 0) break;
                _core.Step(out _);
            }
        }
    }

    private void AdvancePeerIfFree(GdbServer? peerServer)
    {
        if (_bus.RegBankSubsys.RptStatus == 0x01 && !_hostApp.ReportVerified)
        {
            _hostApp.StepHostPollAndRead(silent: true);
        }

        if (peerServer != null && peerServer.IsClientConnected) return;
        uint peerDoneBit = (1u << _peerCore.HartId);
        if ((_bus.SimDoneFlags & peerDoneBit) != 0) return;

        for (int i = 0; i < 16; i++)
        {
            if ((_bus.SimDoneFlags & peerDoneBit) != 0) break;
            _peerCore.Step(out _);
        }
    }

    private void HandleClientSession(TcpClient client, GdbServer? peerServer, CancellationToken ct)
    {
        using NetworkStream stream = client.GetStream();
        while (client.Connected && !ct.IsCancellationRequested)
        {
            string? packet = ReadPacket(stream);
            if (packet == null) break;

            // Send '+' ACK immediately
            stream.WriteByte((byte)'+');

            string? response = ProcessCommand(packet, stream, peerServer, ct);
            if (response == "KILL")
            {
                SendPacket(stream, "OK");
                break;
            }
            if (response != null)
            {
                SendPacket(stream, response);
            }
        }
    }

    private string? ProcessCommand(string cmd, NetworkStream stream, GdbServer? peerServer, CancellationToken ct)
    {
        if (cmd.StartsWith("qSupported"))
        {
            return "PacketSize=4000;swbreak+;hwbreak+";
        }
        if (cmd == "vMustReplyEmpty" || cmd == "qTStatus" || cmd == "qfThreadInfo" && false)
        {
            return "";
        }
        if (cmd == "?")
        {
            return "S05"; // SIGTRAP
        }
        if (cmd.StartsWith("Hg") || cmd.StartsWith("Hc"))
        {
            return "OK";
        }
        if (cmd == "qC")
        {
            return $"QC{_core.HartId + 1}";
        }
        if (cmd == "qfThreadInfo")
        {
            return $"m{_core.HartId + 1}";
        }
        if (cmd == "qsThreadInfo")
        {
            return "l";
        }
        if (cmd.StartsWith("qAttached"))
        {
            return "1";
        }
        if (cmd == "qOffsets")
        {
            return "Text=0;Data=0;Bss=0";
        }
        if (cmd.StartsWith("qSymbol"))
        {
            return "OK";
        }
        if (cmd == "g")
        {
            // Return 32 general registers (x0..x31) + PC (reg 32)
            lock (_coreLock)
            {
                var sb = new StringBuilder(33 * 8);
                for (int i = 0; i < 32; i++)
                {
                    sb.Append(ToLittleEndianHex32(_core.Regs[i]));
                }
                sb.Append(ToLittleEndianHex32(_core.Pc));
                return sb.ToString();
            }
        }
        if (cmd.StartsWith("G"))
        {
            string hex = cmd.Substring(1);
            lock (_coreLock)
            {
                for (int i = 0; i < 32 && (i * 8 + 8) <= hex.Length; i++)
                {
                    _core.Regs[i] = FromLittleEndianHex32(hex.Substring(i * 8, 8));
                }
                _core.Regs[0] = 0;
                if (hex.Length >= 33 * 8)
                {
                    _core.Pc = FromLittleEndianHex32(hex.Substring(32 * 8, 8));
                }
            }
            return "OK";
        }
        if (cmd.StartsWith("p"))
        {
            int regNum = int.Parse(cmd.Substring(1), NumberStyles.HexNumber);
            lock (_coreLock)
            {
                if (regNum >= 0 && regNum < 32)
                    return ToLittleEndianHex32(_core.Regs[regNum]);
                if (regNum == 32)
                    return ToLittleEndianHex32(_core.Pc);
                if (regNum >= 65 && regNum < 65 + 4096)
                    return ToLittleEndianHex32(_core.ReadCsr((uint)(regNum - 65)));
                return ToLittleEndianHex32(0);
            }
        }
        if (cmd.StartsWith("P"))
        {
            string[] parts = cmd.Substring(1).Split('=');
            int regNum = int.Parse(parts[0], NumberStyles.HexNumber);
            uint val   = FromLittleEndianHex32(parts[1]);
            lock (_coreLock)
            {
                if (regNum > 0 && regNum < 32)
                    _core.Regs[regNum] = val;
                else if (regNum == 32)
                    _core.Pc = val;
                else if (regNum >= 65 && regNum < 65 + 4096)
                    _core.WriteCsr((uint)(regNum - 65), val);
            }
            return "OK";
        }
        if (cmd.StartsWith("m"))
        {
            string[] parts = cmd.Substring(1).Split(',');
            uint addr = uint.Parse(parts[0], NumberStyles.HexNumber);
            int len   = int.Parse(parts[1], NumberStyles.HexNumber);
            var sb = new StringBuilder(len * 2);
            lock (_coreLock)
            {
                for (int i = 0; i < len; i++)
                {
                    byte b = (byte)_bus.Load(_core.HartId, addr + (uint)i, 1, false);
                    sb.Append(b.ToString("x2"));
                }
            }
            return sb.ToString();
        }
        if (cmd.StartsWith("M"))
        {
            int colon = cmd.IndexOf(':');
            string[] header = cmd.Substring(1, colon - 1).Split(',');
            uint addr = uint.Parse(header[0], NumberStyles.HexNumber);
            int len   = int.Parse(header[1], NumberStyles.HexNumber);
            string hex = cmd.Substring(colon + 1);
            lock (_coreLock)
            {
                for (int i = 0; i < len; i++)
                {
                    byte b = byte.Parse(hex.Substring(i * 2, 2), NumberStyles.HexNumber);
                    _bus.Store(_core.HartId, addr + (uint)i, b, 1);
                }
            }
            return "OK";
        }
        if (cmd.StartsWith("Z0,") || cmd.StartsWith("Z1,"))
        {
            string[] parts = cmd.Substring(3).Split(',');
            uint addr = uint.Parse(parts[0], NumberStyles.HexNumber);
            lock (_coreLock)
            {
                _core.Breakpoints.Add(addr);
            }
            return "OK";
        }
        if (cmd.StartsWith("z0,") || cmd.StartsWith("z1,"))
        {
            string[] parts = cmd.Substring(3).Split(',');
            uint addr = uint.Parse(parts[0], NumberStyles.HexNumber);
            lock (_coreLock)
            {
                _core.Breakpoints.Remove(addr);
            }
            return "OK";
        }
        if (cmd == "vCont?")
        {
            return "vCont;c;C;s;S";
        }
        if (cmd == "s" || cmd.StartsWith("vCont;s") || cmd.StartsWith("vCont;S"))
        {
            StepOneInstruction(peerServer);
            return "S05";
        }
        if (cmd == "c" || cmd.StartsWith("vCont;c") || cmd.StartsWith("vCont;C"))
        {
            ContinueUntilBreak(stream, peerServer, ct);
            return "S05";
        }
        if (cmd == "D" || cmd == "k" || cmd.StartsWith("vKill"))
        {
            return "KILL";
        }

        // Unknown command -> empty response per GDB RSP spec
        return "";
    }

    private void StepOneInstruction(GdbServer? peerServer)
    {
        lock (_coreLock)
        {
            // If this core is in WFI or waiting for peer, advance peer so WFI wakes smoothly
            for (int wait = 0; wait < 500; wait++)
            {
                bool stepped = _core.Step(out _);
                AdvancePeerIfFree(peerServer);
                if (stepped) break;
            }
        }
    }

    private void ContinueUntilBreak(NetworkStream stream, GdbServer? peerServer, CancellationToken ct)
    {
        _core.GdbHalted = false;
        int steps = 0;
        uint doneBit = (1u << _core.HartId);

        while (!ct.IsCancellationRequested)
        {
            // Check if GDB user pressed Pause (sent 0x03)
            if (stream.DataAvailable)
            {
                int b = stream.ReadByte();
                if (b == 0x03)
                {
                    break;
                }
            }

            bool hitBreak = false;
            lock (_coreLock)
            {
                _core.Step(out bool hitEbreak);
                AdvancePeerIfFree(peerServer);
                steps++;

                if (hitEbreak || _core.Breakpoints.Contains(_core.Pc))
                {
                    hitBreak = true;
                }
                else if ((_bus.SimDoneFlags & doneBit) != 0 && _core.InWfi)
                {
                    // Core finished main() and parked in post-main WFI loop
                    hitBreak = true;
                }
            }

            if (hitBreak || steps > 200000)
            {
                break;
            }
        }

        _core.GdbHalted = true;
    }

    private static string? ReadPacket(NetworkStream stream)
    {
        int b;
        while ((b = stream.ReadByte()) != -1)
        {
            if (b == '$')
            {
                var sb = new StringBuilder();
                while ((b = stream.ReadByte()) != -1 && b != '#')
                {
                    sb.Append((char)b);
                }
                // Consume 2-char checksum
                stream.ReadByte();
                stream.ReadByte();
                return sb.ToString();
            }
            if (b == 0x03)
            {
                return "?";
            }
        }
        return null;
    }

    private static void SendPacket(NetworkStream stream, string payload)
    {
        byte sum = 0;
        foreach (char c in payload)
        {
            sum += (byte)c;
        }
        string frame = $"${payload}#{sum:x2}";
        byte[] bytes = Encoding.ASCII.GetBytes(frame);
        stream.Write(bytes, 0, bytes.Length);
        stream.Flush();
    }

    private static string ToLittleEndianHex32(uint val)
    {
        byte b0 = (byte)(val & 0xFF);
        byte b1 = (byte)((val >> 8) & 0xFF);
        byte b2 = (byte)((val >> 16) & 0xFF);
        byte b3 = (byte)((val >> 24) & 0xFF);
        return $"{b0:x2}{b1:x2}{b2:x2}{b3:x2}";
    }

    private static uint FromLittleEndianHex32(string hex)
    {
        while (hex.Length < 8) hex += "0";
        byte b0 = byte.Parse(hex.Substring(0, 2), NumberStyles.HexNumber);
        byte b1 = byte.Parse(hex.Substring(2, 2), NumberStyles.HexNumber);
        byte b2 = byte.Parse(hex.Substring(4, 2), NumberStyles.HexNumber);
        byte b3 = byte.Parse(hex.Substring(6, 2), NumberStyles.HexNumber);
        return (uint)(b0 | (b1 << 8) | (b2 << 16) | (b3 << 24));
    }
}
