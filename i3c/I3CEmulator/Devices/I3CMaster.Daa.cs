// =====================================================================================================
//  Devices/I3CMaster.Daa.cs  -  Dynamic Address Assignment (ENTDAA, SETDASA, SETNEWDA, RSTDAA)
// =====================================================================================================
//
//  WHEN AND HOW ARE SLAVE IDs (DYNAMIC ADDRESSES) ASSIGNED IN I3C?
//  ===============================================================
//
//  If you know I2C: you are used to slave addresses being HARDWIRED in hardware (e.g. 0x48 for a
//  temperature sensor, 0x50 for an EEPROM). You cannot change them at runtime without an external mux.
//
//  In I3C: when the bus powers on (or after a reset), NO I3C Target has a Dynamic Address!
//  Targets CANNOT be addressed with private reads or writes until the Controller assigns them one.
//
//  There are TWO main ways the Controller assigns Slave IDs:
//
//  ===================================================================================================
//  METHOD 1: SETDASA (Set Dynamic Address from Static Address)  -- DIRECT CCC 0x87
//  ===================================================================================================
//  Used when an I3C Target possesses a known factory/pin-strapped Static I2C Address (SA).
//  The Controller addresses that specific target directly using its Static Address, and assigns it
//  a Dynamic Address without any bus arbitration:
//
//      +---+--------+-----+----------+---+----+------+-----+---------------+---+---+
//      | S | 7E / W | ACK | CCC 0x87 | T | Sr | SA/W | ACK | (NewDA << 1) | T | P |
//      +---+--------+-----+----------+---+----+------+-----+---------------+---+---+
//        ^    ^-OD-^  ^OD^   ^---PP---^          ^-PP-^ ^OD^  ^-----PP------^
//
//  ===================================================================================================
//  METHOD 2: ENTDAA (Enter Dynamic Address Assignment)         -- BROADCAST CCC 0x07
//  ===================================================================================================
//  Used for pure I3C targets (or any target that does not have a static address).
//  This is a self-repeating multi-round discovery loop:
//
//  ASCII INTERACTION DIAGRAM FOR ENTDAA:
//
//  Controller                                   Target A (PID=...010)       Target B (PID=...001)
//      |                                                  |                           |
//      |---- S -> 7E/W -> ACK -> ENTDAA (0x07) + T ------>|                           |
//      |                                                  |                           |
//   ===+================= ROUND 1 ========================+===========================+================
//      |---- Sr -> 7E/R --------------------------------->|                           |
//      |<--- ACK (Open-Drain, driven by BOTH A and B) ----+---------------------------+
//      |                                                  |                           |
//      |     64-Bit Open-Drain PID+BCR+DCR Arbitration:   |                           |
//      |     Target A and Target B drive their IDs bit-by-bit onto SDA in Open-Drain...
//      |     At bit 46: Target A drives '1' (Hi-Z), Target B drives '0' (pulls GND).  |
//      |     Target A samples SDA=0 -> A LOSES ARBITRATION! Target A drops out!       |
//      |     Target B survives all 64 bits -> TARGET B WINS ROUND 1!                  |
//      |                                                                              |
//      |---- 8-bit [NewDA_0x08 | OddParity] (Open-Drain) ---------------------------->| (Target B only)
//      |<--- ACK (Target B verifies OddParity and pulls SDA low on 9th bit) ----------|
//      |     Target B now has DynamicAddress = 0x08! Target B will NOT participate in next rounds.
//      |                                                  |
//   ===+================= ROUND 2 ========================+============================================
//      |---- Sr -> 7E/R --------------------------------->| (Only Target A is unassigned now!)
//      |<--- ACK (Driven solely by Target A) -------------|
//      |     64-Bit Arbitration: Target A runs alone and wins round 2!
//      |---- 8-bit [NewDA_0x09 | OddParity] ------------->|
//      |<--- ACK (Target A verifies OddParity and ACKs) --|
//      |     Target A now has DynamicAddress = 0x09!
//      |                                                  |
//   ===+================= ROUND 3 (POLL FOR REMAINING) ===+============================================
//      |---- Sr -> 7E/R --------------------------------->|
//      |<--- NACK (1) (No unassigned targets left to pull SDA low!)
//      |
//      |---- STOP (P) -> ENTDAA COMPLETE! All targets now have unique Dynamic Addresses!
//
// =====================================================================================================

using I3CEmulator.Physical;
using I3CEmulator.Protocol;

namespace I3CEmulator.Devices;

public sealed partial class I3CMaster
{
    /// <summary>
    /// Executes the full ENTDAA (Enter Dynamic Address Assignment) discovery loop, discovering all
    /// unassigned I3C Targets on the bus, resolving their 64-bit PID+BCR+DCR arbitration, assigning
    /// each a unique 7-bit Dynamic Address with verified Odd Parity, and recording them in <see cref="TargetTable"/>.
    /// </summary>
    public int ExecuteEntdaa()
    {
        EnsureBusAttached();
        _bus!.Log("\n=========================================================================================");
        _bus.Log("  [ENTDAA] Starting Dynamic Address Assignment procedure (Broadcast CCC 0x07)...");
        _bus.Log("=========================================================================================");

        // Step 1: Issue START -> Broadcast 7E/W -> ACK -> ENTDAA (0x07) + Odd Parity T-Bit
        SendStart("Beginning ENTDAA Broadcast CCC");
        var headerResult = SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);
        if (!headerResult.AckReceived)
        {
            _bus.Log("  [ENTDAA] Error: No I3C target ACKed 7'h7E/W header. Aborting ENTDAA.");
            SendStop();
            return 0;
        }

        WriteByteWithOddParityTBit((byte)CccCode.ENTDAA);

        int assignedCount = 0;
        int roundNumber = 1;

        // Step 2: Discovery Loop (Repeated START -> 7E/R -> 64-bit arbitration -> DA assignment)
        while (true)
        {
            _bus.Log($"\n  --- [ENTDAA Round #{roundNumber}] Polling for unassigned targets via Sr -> 7E/R ---");
            SendRepeatedStart();

            // Clocks 7'h7E/R header in Open-Drain mode:
            // Every unassigned I3C Target on the bus will pull SDA LOW to ACK on the 9th bit!
            var readHeader = SendAddressHeader(I3CAddresses.Broadcast, isRead: true, isAfterRepeatedStart: false);

            if (!readHeader.AckReceived)
            {
                // NACK (wire stayed HIGH): No unassigned I3C targets answered! We are done!
                _bus.Log($"  [ENTDAA Round #{roundNumber}] NACK received on 7'h7E/R -> All I3C targets have been assigned!");
                break;
            }

            _bus.Log($"  [ENTDAA Round #{roundNumber}] Unassigned target(s) ACKed 7'h7E/R! Starting 64-bit Open-Drain arbitration...");

            // Step 3: Clock 64 bits in Open-Drain mode for {PID[47:0], BCR[7:0], DCR[7:0]}
            ulong winning64Word = 0;
            var odProfile = Timing.I3COpenDrain;
            _bus.ReleaseSda(this); // Master only clocks SCL; unassigned targets drive SDA in Open-Drain

            for (int bit = 63; bit >= 0; bit--)
            {
                _bus.ClockFallingEdge(odProfile);
                bool wireBit = _bus.ClockRisingEdge(odProfile);
                winning64Word = (winning64Word << 1) | (wireBit ? 1UL : 0UL);
            }

            var identity = I3CDeviceIdentity.FromEntdaa64BitWord(winning64Word);
            _bus.Log($"  [ENTDAA Round #{roundNumber}] 64-bit Arbitration Winner: {identity}");

            // Step 4: Allocate a new unique 7-bit Dynamic Address
            byte newDynamicAddress = AllocateNextDynamicAddress();

            // Step 5: Pack the 7-bit DA + 1-bit Odd Parity into 8 bits and send in Open-Drain
            byte daWithParity = Parity.PackEntdaaAddressWithParity(newDynamicAddress);
            bool expectedParityBit = (daWithParity & 0x01) != 0;
            _bus.Log($"  [ENTDAA Round #{roundNumber}] Assigning DynamicAddress=0x{newDynamicAddress:X2} (Byte: 0x{daWithParity:X2}, ParityBit={expectedParityBit})...");

            for (int bit = 7; bit >= 0; bit--)
            {
                _bus.ClockFallingEdge(odProfile);
                bool b = ((daWithParity >> bit) & 0x01) != 0;
                _bus.DriveSdaOpenDrain(this, b);
                _bus.ClockRisingEdge(odProfile);
            }

            // Step 6: 9th bit = ACK from the winning target (verifying that target accepted the address)
            _bus.ReleaseSda(this);
            _bus.ClockFallingEdge(odProfile);
            bool ackWire = _bus.ClockRisingEdge(odProfile);
            bool targetAcked = !ackWire;

            if (targetAcked)
            {
                _bus.Log($"  [ENTDAA Round #{roundNumber}] SUCCESS: Target ACKed DynamicAddress=0x{newDynamicAddress:X2}!");
                TargetTable[newDynamicAddress] = identity;
                assignedCount++;
            }
            else
            {
                _bus.Log($"  [ENTDAA Round #{roundNumber}] ERROR: Target NACKed DynamicAddress=0x{newDynamicAddress:X2} (Parity error or reject)!");
            }

            roundNumber++;
        }

        SendStop();
        _bus.Log($"[ENTDAA] Finished. Total dynamic addresses assigned: {assignedCount}\n");
        return assignedCount;
    }

    /// <summary>
    /// Executes the Direct SETDASA (Set Dynamic Address from Static Address, CCC 0x87) command,
    /// assigning a Dynamic Address directly to an I3C Target that has a known hardware Static Address.
    /// </summary>
    public bool ExecuteSetdasa(byte staticAddress7Bit, byte dynamicAddressToAssign)
    {
        EnsureBusAttached();
        if (!I3CAddresses.IsValidDynamicAddress(dynamicAddressToAssign))
            throw new ArgumentException($"Address 0x{dynamicAddressToAssign:X2} is not a valid I3C Dynamic Address.");

        _bus!.Log($"\n[SETDASA] Assigning DynamicAddress 0x{dynamicAddressToAssign:X2} to StaticAddress 0x{staticAddress7Bit:X2}...");

        // S -> 7E/W -> ACK -> 0x87 (SETDASA) + T
        SendStart("Beginning SETDASA CCC");
        var h1 = SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);
        if (!h1.AckReceived)
        {
            SendStop();
            return false;
        }

        WriteByteWithOddParityTBit((byte)CccCode.SETDASA);

        // Sr -> StaticAddress/W (Driven in Push-Pull after Sr!) -> ACK -> (DynamicAddress << 1) + T -> P
        SendRepeatedStart();
        var h2 = SendAddressHeader(staticAddress7Bit, isRead: false, isAfterRepeatedStart: true);
        if (!h2.AckReceived)
        {
            _bus.Log($"  [SETDASA] Error: Target with StaticAddress 0x{staticAddress7Bit:X2} did not ACK.");
            SendStop();
            return false;
        }

        byte payload = (byte)(dynamicAddressToAssign << 1);
        WriteByteWithOddParityTBit(payload);
        SendStop();

        _bus.Log($"[SETDASA] Success: Target at Static 0x{staticAddress7Bit:X2} adopted DynamicAddress 0x{dynamicAddressToAssign:X2}.\n");
        return true;
    }

    /// <summary>
    /// Executes the Direct SETNEWDA (Set New Dynamic Address, CCC 0x88) command to change an existing
    /// Dynamic Address (for example, to raise its interrupt priority by giving it a smaller address!).
    /// </summary>
    public bool ExecuteSetnewda(byte currentDynamicAddress, byte newDynamicAddress)
    {
        EnsureBusAttached();
        if (!I3CAddresses.IsValidDynamicAddress(newDynamicAddress))
            throw new ArgumentException($"Address 0x{newDynamicAddress:X2} is not a valid I3C Dynamic Address.");

        _bus!.Log($"\n[SETNEWDA] Changing Target DynamicAddress 0x{currentDynamicAddress:X2} -> 0x{newDynamicAddress:X2}...");

        SendStart("Beginning SETNEWDA CCC");
        var h1 = SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);
        if (!h1.AckReceived)
        {
            SendStop();
            return false;
        }

        WriteByteWithOddParityTBit((byte)CccCode.SETNEWDA);

        SendRepeatedStart();
        var h2 = SendAddressHeader(currentDynamicAddress, isRead: false, isAfterRepeatedStart: true);
        if (!h2.AckReceived)
        {
            SendStop();
            return false;
        }

        byte payload = (byte)(newDynamicAddress << 1);
        WriteByteWithOddParityTBit(payload);
        SendStop();

        if (TargetTable.Remove(currentDynamicAddress, out var ident))
        {
            TargetTable[newDynamicAddress] = ident;
        }

        _bus.Log($"[SETNEWDA] Success: DynamicAddress updated to 0x{newDynamicAddress:X2}.\n");
        return true;
    }

    /// <summary>
    /// Broadcasts RSTDAA (Reset Dynamic Address Assignment, CCC 0x06), clearing all dynamic addresses
    /// across all targets on the bus.
    /// </summary>
    public void ExecuteRstdaa()
    {
        EnsureBusAttached();
        _bus!.Log("\n[RSTDAA] Resetting Dynamic Address Assignment across all targets...");
        SendStart("RSTDAA Broadcast CCC");
        SendAddressHeader(I3CAddresses.Broadcast, isRead: false, isAfterRepeatedStart: false);
        WriteByteWithOddParityTBit((byte)CccCode.RSTDAA_Broadcast);
        SendStop();
        TargetTable.Clear();
        _nextDynamicAddressToAssign = 0x08;
    }

    /// <summary>
    /// Allocates the next available 7-bit Dynamic Address, skipping reserved addresses and any
    /// static addresses reserved by Legacy I2C slaves.
    /// </summary>
    public byte AllocateNextDynamicAddress()
    {
        while (true)
        {
            byte candidate = _nextDynamicAddressToAssign++;
            if (!I3CAddresses.IsValidDynamicAddress(candidate))
                continue;

            // Make sure candidate doesn't collide with a known Legacy I2C Slave's static address!
            if (LegacyI2CTable.Any(i2c => i2c.StaticAddress7Bit == candidate))
                continue;

            if (TargetTable.ContainsKey(candidate))
                continue;

            return candidate;
        }
    }
}
