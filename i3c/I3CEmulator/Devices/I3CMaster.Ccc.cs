// =====================================================================================================
//  Devices/I3CMaster.Ccc.cs  -  Broadcast and Direct Common Command Codes (CCC) Engine
// =====================================================================================================
//
//  HOW COMMON COMMAND CODES (CCCs) ARE EXECUTED
//  ============================================
//
//  1. BROADCAST CCC (0x00 .. 0x7F):
//     All targets receive and execute the command:
//
//       +---+--------+-----+---------+---+---------------+---+-----+
//       | S | 7E / W | ACK | CCC_cmd | T | Payload Byte  | T |  P  |
//       +---+--------+-----+---------+---+---------------+---+-----+
//         ^    ^-OD-^  ^OD^  ^---------- Push-Pull -----------^  ^
//
//  2. DIRECT CCC (0x80 .. 0xFE):
//     Targets listen to CCC_cmd, then ONE specific Target is addressed after Repeated START (Sr):
//
//       +---+--------+-----+---------+---+----+--------+-----+---------------+---+-----+
//       | S | 7E / W | ACK | CCC_cmd | T | Sr | DA / W | ACK | Data Byte(s)  | T |  P  |
//       +---+--------+-----+---------+---+----+--------+-----+---------------+---+-----+
//              ^-OD-^  ^OD^   ^---PP---^          ^--PP-^ ^OD^  ^-----PP------^
//
//     Notice: `DA/W` after `Sr` is driven in PUSH-PULL mode at 12.5 MHz!
//
//  WHAT IF AN IN-BAND INTERRUPT OCCURS DURING THE INITIAL 7E/W HEADER?
//  -------------------------------------------------------------------
//  The Controller gracefully services the Target's IBI first, issues STOP, and then RETRIES the
//  CCC command. This guarantees that Target interrupts are never lost or locked out!
//
// =====================================================================================================

using I3CEmulator.Physical;
using I3CEmulator.Protocol;

namespace I3CEmulator.Devices;

public sealed partial class I3CMaster
{
    /// <summary>
    /// Executes a Broadcast Common Command Code (CCC 0x00..0x7F) with optional payload bytes.
    /// If an IBI interrupts the initial 7'h7E header, the IBI is serviced and the CCC is retried.
    /// </summary>
    public bool BroadcastCcc(CccCode ccc, params byte[] payload)
    {
        if (ccc.IsDirect())
            throw new ArgumentException($"CCC 0x{(byte)ccc:X2} is a Direct CCC, not Broadcast.");

        EnsureBusAttached();

        while (true)
        {
            SendStart($"Broadcast CCC 0x{(byte)ccc:X2} ({ccc})");
            var header = SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);

            if (header.MasterLostArbitration)
            {
                // Target IBI or Hot-Join won arbitration! Service the interrupt and retry!
                HandlePotentialTargetInterrupt(header);
                continue;
            }

            if (!header.AckReceived)
            {
                _bus!.Log($"  [Broadcast CCC] Error: No target ACKed 7'h7E/W. Aborting.");
                SendStop();
                return false;
            }

            // Command byte in Push-Pull + Parity T-Bit
            WriteByteWithOddParityTBit((byte)ccc);

            // Payload bytes in Push-Pull + Parity T-Bit
            foreach (byte b in payload)
            {
                WriteByteWithOddParityTBit(b);
            }

            SendStop();
            return true;
        }
    }

    /// <summary>
    /// Executes a Direct Common Command Code Write (CCC 0x80..0xFE) to a specific Target.
    /// </summary>
    public bool DirectCccWrite(CccCode ccc, byte targetDynamicAddress, params byte[] payload)
    {
        if (!ccc.IsDirect())
            throw new ArgumentException($"CCC 0x{(byte)ccc:X2} is a Broadcast CCC, not Direct.");

        EnsureBusAttached();

        while (true)
        {
            SendStart($"Direct CCC Write 0x{(byte)ccc:X2} ({ccc}) -> Target 0x{targetDynamicAddress:X2}");
            var header = SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);

            if (header.MasterLostArbitration)
            {
                HandlePotentialTargetInterrupt(header);
                continue;
            }

            if (!header.AckReceived)
            {
                SendStop();
                return false;
            }

            WriteByteWithOddParityTBit((byte)ccc);

            // Repeated START -> Target DA/W (Push-Pull!) -> ACK -> Payload bytes
            SendRepeatedStart();
            var targetHeader = SendAddressHeader(targetDynamicAddress, isRead: false, isAfterRepeatedStart: true);

            if (!targetHeader.AckReceived)
            {
                _bus!.Log($"  [Direct CCC] Target 0x{targetDynamicAddress:X2} did not ACK.");
                SendStop();
                return false;
            }

            foreach (byte b in payload)
            {
                WriteByteWithOddParityTBit(b);
            }

            SendStop();
            return true;
        }
    }

    /// <summary>
    /// Executes a Direct Common Command Code Read (CCC 0x80..0xFE) from a specific Target.
    /// Reads <paramref name="byteCount"/> bytes in Push-Pull mode.
    /// </summary>
    public byte[]? DirectCccRead(CccCode ccc, byte targetDynamicAddress, int byteCount)
    {
        if (!ccc.IsDirect())
            throw new ArgumentException($"CCC 0x{(byte)ccc:X2} is a Broadcast CCC, not Direct.");

        EnsureBusAttached();

        while (true)
        {
            SendStart($"Direct CCC Read 0x{(byte)ccc:X2} ({ccc}) <- Target 0x{targetDynamicAddress:X2}");
            var header = SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);

            if (header.MasterLostArbitration)
            {
                HandlePotentialTargetInterrupt(header);
                continue;
            }

            if (!header.AckReceived)
            {
                SendStop();
                return null;
            }

            WriteByteWithOddParityTBit((byte)ccc);

            // Repeated START -> Target DA/R (Push-Pull!) -> Target ACK -> Push-Pull Read
            SendRepeatedStart();
            var targetHeader = SendAddressHeader(targetDynamicAddress, isRead: true, isAfterRepeatedStart: true);

            if (!targetHeader.AckReceived)
            {
                _bus!.Log($"  [Direct CCC Read] Target 0x{targetDynamicAddress:X2} did not ACK.");
                SendStop();
                return null;
            }

            var result = new byte[byteCount];
            for (int i = 0; i < byteCount; i++)
            {
                bool isLastByte = (i == byteCount - 1);
                var (data, _) = ReadByteWithTBit(Timing.I3CPushPull, abortNow: isLastByte);
                result[i] = data;
            }

            SendStop();
            return result;
        }
    }

    // =================================================================================================
    //  STANDARDIZED CONVENIENCE HELPERS FOR COMMON BUS OPERATIONS
    // =================================================================================================

    /// <summary>Enables target events (In-Band Interrupts, Controller-Role, Hot-Join) via ENEC.</summary>
    public void EnableEvents(TargetEventMask mask, byte? targetDynamicAddress = null)
    {
        if (targetDynamicAddress.HasValue)
        {
            _bus!.Log($"\n[ENEC Direct] Enabling [{mask}] on Target 0x{targetDynamicAddress:X2}...");
            DirectCccWrite(CccCode.ENEC_Direct, targetDynamicAddress.Value, (byte)mask);
        }
        else
        {
            _bus!.Log($"\n[ENEC Broadcast] Enabling [{mask}] across all targets on bus...");
            BroadcastCcc(CccCode.ENEC_Broadcast, (byte)mask);
        }
    }

    /// <summary>Disables target events (In-Band Interrupts, Controller-Role, Hot-Join) via DISEC.</summary>
    public void DisableEvents(TargetEventMask mask, byte? targetDynamicAddress = null)
    {
        if (targetDynamicAddress.HasValue)
        {
            _bus!.Log($"\n[DISEC Direct] Disabling [{mask}] on Target 0x{targetDynamicAddress:X2}...");
            DirectCccWrite(CccCode.DISEC_Direct, targetDynamicAddress.Value, (byte)mask);
        }
        else
        {
            _bus!.Log($"\n[DISEC Broadcast] Disabling [{mask}] across all targets on bus...");
            BroadcastCcc(CccCode.DISEC_Broadcast, (byte)mask);
        }
    }

    /// <summary>Queries the 48-bit Provisional ID (PID) from an assigned Target via GETPID (0x8D).</summary>
    public ulong? GetProvisionalId(byte targetDynamicAddress)
    {
        byte[]? bytes = DirectCccRead(CccCode.GETPID, targetDynamicAddress, 6);
        if (bytes is null || bytes.Length < 6)
            return null;

        ulong pid = 0;
        foreach (byte b in bytes)
            pid = (pid << 8) | b;

        return pid;
    }

    /// <summary>Queries the 8-bit Bus Characteristics Register (BCR) from a Target via GETBCR (0x8E).</summary>
    public BcrFlags? GetBcr(byte targetDynamicAddress)
    {
        byte[]? bytes = DirectCccRead(CccCode.GETBCR, targetDynamicAddress, 1);
        return bytes is not null && bytes.Length > 0 ? (BcrFlags)bytes[0] : null;
    }

    /// <summary>Queries the 8-bit Device Characteristics Register (DCR) from a Target via GETDCR (0x8F).</summary>
    public byte? GetDcr(byte targetDynamicAddress)
    {
        byte[]? bytes = DirectCccRead(CccCode.GETDCR, targetDynamicAddress, 1);
        return bytes is not null && bytes.Length > 0 ? bytes[0] : null;
    }

    /// <summary>Queries the 16-bit status word from a Target via GETSTATUS (0x90).</summary>
    public ushort? GetDeviceStatus(byte targetDynamicAddress)
    {
        byte[]? bytes = DirectCccRead(CccCode.GETSTATUS, targetDynamicAddress, 2);
        return bytes is not null && bytes.Length >= 2 ? (ushort)((bytes[0] << 8) | bytes[1]) : null;
    }
}
