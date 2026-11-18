// =====================================================================================================
//  Devices/I3CMaster.Ibi.cs  -  In-Band Interrupt (IBI) and Hot-Join Handling & Arbitration
// =====================================================================================================
//
//  HOW AN I3C SLAVE INTERRUPTS WITHOUT A DEDICATED INT# PIN
//  ========================================================
//
//  In I2C, if you want an interrupt from an accelerometer or gyro, you MUST route an extra physical
//  GPIO wire (INT1 / INT2) from the sensor chip all the way across the PCB back to the host CPU!
//  If you have 10 sensors, you need 10 separate interrupt pins on your microcontroller.
//
//  In I3C, ALL interrupts travel IN-BAND over the SAME two wires (SDA and SCL):
//
//  ASCII INTERACTION DIAGRAM: HOW AN IN-BAND INTERRUPT OCCURS AND IS SERVICED
//
//  Target (Sensor)                              Controller (Host)
//        |                                             |
//        | (Internal sensor event occurs)              |
//        |                                             |
//  CASE 1: BUS IS FREE (SCL=1, SDA=1)                  |
//        |                                             |
//        |-- Waits tAVAL (1 us) ---------------------->|
//        |-- Target pulls SDA LOW (OD:0) ------------->| (Target-Initiated START!)
//        |                                             | Controller detects SDA falling edge!
//        |                                             | Controller wakes up & begins clocking SCL!
//        |                                             |
//        |<-- SCL clocks 8 bits (Open-Drain) ----------|
//        |-- Target drives DynamicAddress + R (DA/R) ->| (Header arbitration: Target wins!)
//        |                                             |
//        |<-- Controller drives ACK (OD:0) on bit 9 ---| (Controller accepts the IBI!)
//        |                                             |
//        | (Does Target have BCR[2] IbiHasMDB = 1?)    |
//        | YES -> Target switches to PUSH-PULL (12.5M) |
//        |-- Mandatory Data Byte (MDB) + T-Bit (PP) -->|
//        |-- [Optional extra sensor data bytes + T] -->|
//        |                                             |
//        |<-- Controller issues STOP (P) --------------|
//        |                                             |
//        | Interrupt serviced! SDA/SCL return to Free. |
//
//  CASE 2: CONTROLLER WAS ABOUT TO DO A NORMAL TRANSFER (COLLISION / ARBITRATION)
//        |                                             |
//        |                                             |-- Controller issues START (S)
//        |                                             |   (wants to send 7'h7E/W = 1111110_0b)
//        |-- Target simultaneously drives DA/R ------->|   (e.g. DA 0x09 = 0001001_1b)
//        |                                             |
//        | Both drive SDA in Open-Drain. Bit 5:        |
//        | Controller drives '1' (Hi-Z), Target drives |
//        | '0' (pulls GND). Controller samples SDA=0!  |
//        | Controller LOSES ARBITRATION!               | Controller yields SDA to Target!
//        | Target wins the header!                     | Controller reads winning header = 0x09/R!
//        |                                             | Controller drives ACK on bit 9!
//        |-- Target sends MDB in Push-Pull ----------->|
//        |<-- Controller issues STOP (P) --------------|
//        |                                             |
//        | Now Controller RETRIES its own transfer! -->| (Zero data loss, priority respected!)
//
//  WHAT HAPPENS IF THE CONTROLLER NACKs (REFUSES) AN IBI?
//  ------------------------------------------------------
//  If the Controller is busy (e.g. high-priority audio stream), it drives NACK (1) on bit 9:
//    - The Target keeps its interrupt pending and will retry at the next START / tAVAL.
//    - If the Controller wants to PREVENT the Target from retrying repeatedly (interrupt storm),
//      the Controller immediately issues:
//        `Repeated START (Sr) -> 7'h7E/W -> DISEC (0x81) -> Sr -> TargetDA/W -> 0x01 (DISINT) -> P`
//      Because Targets are forbidden from arbitrating after an Sr, the DISEC command is GUARANTEED
//      to succeed without being interrupted!
//
// =====================================================================================================

using I3CEmulator.Physical;
using I3CEmulator.Protocol;

namespace I3CEmulator.Devices;

public sealed partial class I3CMaster
{
    /// <summary>
    /// Checks whether an address header resulted in a Target-initiated event (In-Band Interrupt or
    /// Hot-Join request), and if so, services the event immediately.
    /// Returns true if a Target event was handled, or false if the header was a normal transfer.
    /// </summary>
    public bool HandlePotentialTargetInterrupt(HeaderResult headerResult)
    {
        if (!headerResult.MasterLostArbitration)
            return false;

        EnsureBusAttached();
        byte winnerHeader = headerResult.WinningHeaderByte;
        var (addr7, isRead) = I3CAddresses.UnpackHeader(winnerHeader);

        // ---------------------------------------------------------------------------------------------
        //  SCENARIO 1: HOT-JOIN REQUEST (7'h02 / Write = 0x04)
        // ---------------------------------------------------------------------------------------------
        if (addr7 == I3CAddresses.HotJoin && !isRead)
        {
            _bus!.Log("\n  >>> [HOT-JOIN DETECTED] A newly connected Target requested bus admission via 7'h02/W!");
            if (headerResult.AckReceived)
            {
                // Controller ACKed the Hot-Join request. Complete the header with a STOP condition.
                SendStop();
                OnHotJoinDetected?.Invoke();

                _bus.Log("  >>> [HOT-JOIN] Launching ENTDAA discovery to assign the new Target a Dynamic Address...");
                ExecuteEntdaa();
            }
            else
            {
                _bus.Log("  >>> [HOT-JOIN] Controller NACKed the Hot-Join request.");
                SendStop();
            }
            return true;
        }

        // ---------------------------------------------------------------------------------------------
        //  SCENARIO 2: IN-BAND INTERRUPT (Target Dynamic Address + Read = DA/R)
        // ---------------------------------------------------------------------------------------------
        if (isRead && TargetTable.TryGetValue(addr7, out var identity))
        {
            _bus!.Log($"\n  >>> [IN-BAND INTERRUPT (IBI)] Received IBI from Target at DynamicAddress 0x{addr7:X2} ({identity})");

            if (!headerResult.AckReceived)
            {
                // Controller NACKed the IBI!
                _bus.Log($"  >>> [IBI NACKed] Controller refused IBI from 0x{addr7:X2}. Issuing STOP.");
                SendStop();
                return true;
            }

            // Controller ACKed the IBI!
            // Check Target's BCR[2] (IbiHasMandatoryDataByte):
            byte mdb = 0;
            var extraBytes = new List<byte>();

            if (identity.Bcr.HasFlag(BcrFlags.IbiHasMandatoryDataByte))
            {
                _bus.Log($"  >>> [IBI Payload] Target has BCR.IbiHasMandatoryDataByte=1. Reading MDB and payload in Push-Pull...");

                // Read first byte = Mandatory Data Byte (MDB) in Push-Pull with T-bit
                var (firstByte, hasMore) = ReadByteWithTBit(Timing.I3CPushPull);
                mdb = firstByte;
                _bus.Log($"  >>> [IBI Payload] Mandatory Data Byte (MDB) = 0x{mdb:X2}");

                // Continue reading any additional payload bytes until Target drives T=0 (End-Of-Data)
                while (hasMore && extraBytes.Count < 32)
                {
                    var (payloadByte, more) = ReadByteWithTBit(Timing.I3CPushPull);
                    extraBytes.Add(payloadByte);
                    hasMore = more;
                }
            }
            else
            {
                _bus.Log($"  >>> [IBI No Payload] Target BCR.IbiHasMandatoryDataByte=0. No data bytes follow.");
            }

            // End the IBI servicing with a STOP condition
            SendStop();
            _bus.Log($"  >>> [IBI Complete] Successfully serviced IBI from Target 0x{addr7:X2} (MDB=0x{mdb:X2}, ExtraBytes={extraBytes.Count})\n");

            OnInBandInterruptReceived?.Invoke(addr7, mdb, extraBytes.ToArray());
            return true;
        }

        _bus!.Log($"  [Header Anomaly] Unrecognized winning header: {I3CAddresses.FormatHeader(winnerHeader)}. Issuing STOP.");
        SendStop();
        return true;
    }

    /// <summary>
    /// Simulates the Controller idle monitoring loop: advances bus idle time and checks if any Target
    /// pulled SDA LOW (Target-initiated START) to request an In-Band Interrupt or Hot-Join.
    /// If detected, the Controller starts clocking SCL, services the request, and returns true.
    /// </summary>
    public bool CheckAndServiceTargetInterrupts(int idleTimeStepNs = 1_000)
    {
        EnsureBusAttached();
        _bus!.AdvanceIdleTimeNs(idleTimeStepNs);

        if (_bus.IsTargetPullingSdaLowForStart)
        {
            _bus.Log($"\n[Host Wakeup] Detected SDA pulled LOW by Target! Controller beginning clock generation...");
            SendStart("Servicing Target-initiated START request");

            // Controller transmits 7'h7E/W in Open-Drain. Because 7'h7E is the highest possible header
            // (1111110_0b), ANY target with a pending IBI (DA/R) or Hot-Join (7'h02/W) will ALWAYS win!
            var result = SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);
            return HandlePotentialTargetInterrupt(result);
        }

        return false;
    }
}
