// =====================================================================================================
//  Devices/I3CMaster.Transfers.cs  -  Private I3C SDR Transfers & Legacy I2C Compatibility Transfers
// =====================================================================================================
//
//  1. WHY MIPI RECOMMENDS STARTING PRIVATE TRANSFERS WITH "S -> 7E/W -> ACK -> Sr"
//  ================================================================================
//
//  In I3C, you CAN start a private write with a single START:
//
//      Option A (Short form):
//      +---+--------+-----+----------+---+----------+---+-----+
//      | S | DA / W | ACK | DataByte | T | DataByte | T |  P  |
//      +---+--------+-----+----------+---+----------+---+-----+
//            ^-OD-^  ^OD^   ^------------ Push-Pull ---------^
//
//      Option B (MIPI Recommended Broadcast Preamble form):
//      +---+--------+-----+----+--------+-----+----------+---+-----+
//      | S | 7E / W | ACK | Sr | DA / W | ACK | DataByte | T |  P  |
//      +---+--------+-----+----+--------+-----+----------+---+-----+
//            ^-OD-^  ^OD^        ^--PP-^ ^OD^   ^---Push-Pull---^
//
//  Why does MIPI recommend Option B over Option A?
//    1. IMMEDIATE IBI SERVICING: 7'h7E (1111110b) is numerically greater than any valid Target Dynamic
//       Address (0x08..0x77). If any Target has a pending In-Band Interrupt, that Target is
//       GUARANTEED to win Open-Drain arbitration against 7'h7E! The Controller services the interrupt
//       with minimum possible latency.
//    2. FASTER ADDRESS TRANSMISSION: After the Repeated START (Sr), Targets are forbidden from
//       arbitrating. This allows the Controller to drive the Target's address (`DA/W` or `DA/R`) in
//       fast 12.5 MHz PUSH-PULL mode rather than slow Open-Drain mode!
//
//  2. HOW LEGACY I2C COMPATIBILITY WORKS ON THE SAME BUS
//  =====================================================
//
//  When talking to a Legacy I2C Slave:
//    - SCL is switched to `LegacyI2CFastMode` (tLOW = 1300 ns, tHIGH = 600 ns >= 50 ns).
//    - The 50 ns analog spike filter on the I2C chip passes this clock through cleanly.
//    - Every single bit (address, register, data, ACK/NACK) is driven in OPEN-DRAIN mode.
//    - I3C Targets also see these slower clock pulses, but their address does not match so they ignore
//      the frame until STOP.
//
// =====================================================================================================

using I3CEmulator.Physical;
using I3CEmulator.Protocol;

namespace I3CEmulator.Devices;

public sealed partial class I3CMaster
{
    // =================================================================================================
    //  PRIVATE I3C SDR TRANSFERS (12.5 MHz PUSH-PULL WITH PARITY T-BIT)
    // =================================================================================================

    /// <summary>
    /// Performs an I3C Private SDR Write transfer to an assigned Target Dynamic Address.
    /// Supports both the recommended Broadcast Preamble form (S -> 7E/W -> Sr -> DA/W) and the short form.
    /// </summary>
    public bool PrivateWrite(byte dynamicAddress, bool useBroadcastPreamble = true, params byte[] data)
    {
        EnsureBusAttached();

        while (true)
        {
            if (useBroadcastPreamble)
            {
                // Recommended form: S -> 7E/W (OD) -> ACK -> Sr -> DA/W (PP)
                SendStart($"Private Write to 0x{dynamicAddress:X2} (via 7E/W preamble)");
                var h1 = SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);

                if (h1.MasterLostArbitration)
                {
                    HandlePotentialTargetInterrupt(h1);
                    continue; // Retry after servicing Target interrupt!
                }

                if (!h1.AckReceived)
                {
                    SendStop();
                    return false;
                }

                SendRepeatedStart();
                var h2 = SendAddressHeader(dynamicAddress, isRead: false, isAfterRepeatedStart: true);
                if (!h2.AckReceived)
                {
                    _bus!.Log($"  [Private Write] Target 0x{dynamicAddress:X2} NACKed address after Sr.");
                    SendStop();
                    return false;
                }
            }
            else
            {
                // Short form: S -> DA/W (OD)
                SendStart($"Private Write to 0x{dynamicAddress:X2} (direct)");
                var h = SendAddressHeader(dynamicAddress, isRead: false, isAfterRepeatedStart: false);

                if (h.MasterLostArbitration)
                {
                    HandlePotentialTargetInterrupt(h);
                    continue;
                }

                if (!h.AckReceived)
                {
                    SendStop();
                    return false;
                }
            }

            // Transmit all write data bytes in Push-Pull + Odd Parity T-Bit at 12.5 MHz!
            foreach (byte b in data)
            {
                WriteByteWithOddParityTBit(b);
            }

            SendStop();
            return true;
        }
    }

    /// <summary>
    /// Performs an I3C Private SDR Read transfer from an assigned Target Dynamic Address, reading
    /// <paramref name="byteCount"/> bytes in Push-Pull mode at 12.5 MHz.
    /// </summary>
    public byte[]? PrivateRead(byte dynamicAddress, int byteCount)
    {
        EnsureBusAttached();

        while (true)
        {
            SendStart($"Private Read from 0x{dynamicAddress:X2} (via 7E/W preamble)");
            var h1 = SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);

            if (h1.MasterLostArbitration)
            {
                HandlePotentialTargetInterrupt(h1);
                continue;
            }

            if (!h1.AckReceived)
            {
                SendStop();
                return null;
            }

            SendRepeatedStart();
            var h2 = SendAddressHeader(dynamicAddress, isRead: true, isAfterRepeatedStart: true);
            if (!h2.AckReceived)
            {
                _bus!.Log($"  [Private Read] Target 0x{dynamicAddress:X2} NACKed address after Sr.");
                SendStop();
                return null;
            }

            var buffer = new byte[byteCount];
            for (int i = 0; i < byteCount; i++)
            {
                bool isLastByte = (i == byteCount - 1);
                var (b, hasMore) = ReadByteWithTBit(Timing.I3CPushPull, abortNow: isLastByte);
                buffer[i] = b;
                if (!hasMore && !isLastByte)
                {
                    _bus!.Log($"  [Private Read] Target signaled End-Of-Data early (T=0) at byte {i + 1}/{byteCount}.");
                    Array.Resize(ref buffer, i + 1);
                    break;
                }
            }

            SendStop();
            return buffer;
        }
    }

    // =================================================================================================
    //  LEGACY I2C COMPATIBILITY TRANSFERS (OPEN-DRAIN, 400 kHz FM, 9th BIT ACK/NACK)
    // =================================================================================================

    /// <summary>
    /// Writes data to a Legacy I2C Slave on the bus using standard I2C Open-Drain signaling and
    /// 400 kHz Fast-Mode timing (tHIGH = 600 ns >= 50 ns).
    /// </summary>
    public bool I2CWrite(byte staticAddress7Bit, byte registerAddress, params byte[] data)
    {
        EnsureBusAttached();
        _bus!.Log($"\n[I2C Write Transfer] Writing to Legacy I2C Slave 0x{staticAddress7Bit:X2} (Reg 0x{registerAddress:X2}, {data.Length} bytes)...");

        SendStart($"Legacy I2C Write -> 0x{staticAddress7Bit:X2}");

        // Address Header: 7-bit Static Address + W (0) in Open-Drain
        byte header = I3CAddresses.PackHeader(staticAddress7Bit, isRead: false);
        bool ack = I2CWriteByte(header);
        if (!ack)
        {
            _bus.Log($"  [I2C Write] Slave 0x{staticAddress7Bit:X2} did not ACK address.");
            SendStop();
            return false;
        }

        // Send register pointer
        ack = I2CWriteByte(registerAddress);
        if (!ack)
        {
            SendStop();
            return false;
        }

        // Send data payload bytes
        foreach (byte b in data)
        {
            ack = I2CWriteByte(b);
            if (!ack)
                break;
        }

        SendStop();
        _bus.Log($"[I2C Write Transfer] Completed successfully.\n");
        return true;
    }

    /// <summary>
    /// Reads data from a Legacy I2C Slave using standard I2C Open-Drain signaling and 400 kHz timing.
    /// Uses the classic I2C Write-Register-Address + Repeated START + Read sequence.
    /// </summary>
    public byte[]? I2CWriteRead(byte staticAddress7Bit, byte registerAddress, int readCount)
    {
        EnsureBusAttached();
        _bus!.Log($"\n[I2C WriteRead Transfer] Reading {readCount} bytes from Legacy I2C Slave 0x{staticAddress7Bit:X2} starting at Reg 0x{registerAddress:X2}...");

        SendStart($"Legacy I2C WriteRead (Phase 1: Set Register Pointer)");

        // Phase 1: Write register pointer
        byte writeHeader = I3CAddresses.PackHeader(staticAddress7Bit, isRead: false);
        if (!I2CWriteByte(writeHeader))
        {
            SendStop();
            return null;
        }

        if (!I2CWriteByte(registerAddress))
        {
            SendStop();
            return null;
        }

        // Phase 2: Repeated START -> Address + Read (1)
        SendRepeatedStart();
        byte readHeader = I3CAddresses.PackHeader(staticAddress7Bit, isRead: true);
        if (!I2CWriteByte(readHeader))
        {
            SendStop();
            return null;
        }

        // Phase 3: Read bytes with classic I2C ACK on byte 0..N-2 and NACK on the last byte
        var result = new byte[readCount];
        for (int i = 0; i < readCount; i++)
        {
            bool isLast = (i == readCount - 1);
            result[i] = I2CReadByte(ackToSlave: !isLast);
        }

        SendStop();
        _bus.Log($"[I2C WriteRead Transfer] Completed successfully. Received: [{string.Join(", ", result.Select(b => $"0x{b:X2}"))}]\n");
        return result;
    }
}
