// =====================================================================================================
//  Protocol/CccCode.cs  -  MIPI I3C Common Command Codes (CCC): Standardized Bus Management
// =====================================================================================================
//
//  WHY I3C HAS COMMON COMMAND CODES (AND I2C DOES NOT)
//  ===================================================
//
//  In I2C, the specification only defines how bytes move on the wire; it says almost nothing about
//  register maps! Every sensor vendor invents their own "WHO_AM_I" register, their own soft-reset
//  register, and their own interrupt-enable register.
//
//  In I3C, MIPI standardized all bus-level management into "Common Command Codes" (CCCs). Every CCC
//  starts with the Broadcast Address `7'h7E + Write (0)`:
//
//      S -> 7'h7E/W (Open-Drain) -> ACK (Open-Drain) -> CCC_Code + T-bit (Push-Pull, 12.5 MHz) -> ...
//
//  HOW TO TELL A BROADCAST CCC FROM A DIRECT CCC BY LOOKING AT BIT 7:
//  ==================================================================
//
//  * Bit 7 == 0 (0x00 .. 0x7F): BROADCAST CCC
//    Addressed to ALL I3C Targets on the bus simultaneously! Any payload bytes immediately follow the
//    CCC command byte before Sr or P:
//
//      +---+--------+-----+----------+---+-------------+---+-----+
//      | S | 7E / W | ACK | CCC_Code | T | Payload ... | T |  P  |
//      +---+--------+-----+----------+---+-------------+---+-----+
//        ^    ^-OD-^  ^OD^  ^----------- Push-Pull -------^
//
//  * Bit 7 == 1 (0x80 .. 0xFE): DIRECT CCC
//    Even though it starts with `7'h7E/W + CCC_Code` (so every target knows a Direct CCC is happening),
//    the actual action/read/write is directed to ONE OR MORE SPECIFIC TARGETS selected after a
//    Repeated START (Sr):
//
//      +---+--------+-----+----------+---+----+--------+-----+-------------+---+----+--------+-----+-----+
//      | S | 7E / W | ACK | CCC_Code | T | Sr | DA1/RW | ACK | Data Bytes  | T | Sr | DA2/RW | ... |  P  |
//      +---+--------+-----+----------+---+----+--------+-----+-------------+---+----+--------+-----+-----+
//            ^-OD-^  ^OD^   ^---PP---^          ^--PP--^ ^OD^  ^----PP----^
//
//    Notice how `DA1/RW` after `Sr` is driven in PUSH-PULL! That is because all targets already saw
//    the `7E/W + CCC_Code` preamble and no target may arbitrate after `Sr`.
//
// =====================================================================================================

namespace I3CEmulator.Protocol;

/// <summary>
/// Standard MIPI I3C Common Command Codes (CCCs) implemented by this emulator.
/// </summary>
public enum CccCode : byte
{
    // -------------------------------------------------------------------------------------------------
    //  BROADCAST CCCs (0x00 .. 0x7F)  -- Bit 7 is 0; applies to ALL I3C Targets on the bus at once
    // -------------------------------------------------------------------------------------------------

    /// <summary>
    /// Enable Events Command (Broadcast, 0x00).Followed by 1 byte (<see cref="TargetEventMask"/>).
    /// Enables Target-initiated events (In-Band Interrupts, Controller-Role Requests, or Hot-Join)
    /// across all targets on the bus.
    /// </summary>
    ENEC_Broadcast = 0x00,

    /// <summary>
    /// Disable Events Command (Broadcast, 0x01). Followed by 1 byte (<see cref="TargetEventMask"/>).
    /// Used by the Controller during initialization (or during an interrupt storm) to silence IBIs
    /// or Hot-Join requests across all targets.
    /// </summary>
    DISEC_Broadcast = 0x01,

    /// <summary>
    /// Enter Activity State 0..3 (Broadcast, 0x02..0x05). Power management hint for targets.
    /// </summary>
    ENTAS0_Broadcast = 0x02,

    /// <summary>
    /// Reset Dynamic Address Assignment (Broadcast, 0x06). No payload bytes.
    /// Instructs EVERY I3C Target on the bus to immediately forget its current Dynamic Address and
    /// revert to the unassigned state (ready for a fresh ENTDAA or SETDASA).
    /// </summary>
    RSTDAA_Broadcast = 0x06,

    /// <summary>
    /// Enter Dynamic Address Assignment (Broadcast, 0x07).
    /// Triggers the multi-round 64-bit Open-Drain PID+BCR+DCR arbitration loop where every unassigned
    /// I3C Target competes for a Dynamic Address one by one until all have been assigned.
    /// </summary>
    ENTDAA = 0x07,

    /// <summary>
    /// Set Max Write Length (Broadcast, 0x09). Followed by 2 bytes (MSB, LSB).
    /// </summary>
    SETMWL_Broadcast = 0x09,

    /// <summary>
    /// Set Max Read Length (Broadcast, 0x0A). Followed by 2 bytes (MSB, LSB).
    /// </summary>
    SETMRL_Broadcast = 0x0A,

    /// <summary>
    /// Reset Target Action (Broadcast, 0x2A). Configures or triggers target reset behavior.
    /// </summary>
    RSTACT_Broadcast = 0x2A,

    /// <summary>
    /// Set All Addresses to Static Addresses (Broadcast, 0x29).
    /// Every I3C Target that possesses a factory Static Address adopts that Static Address as its
    /// Dynamic Address in a single broadcast command!
    /// </summary>
    SETAASA = 0x29,

    // -------------------------------------------------------------------------------------------------
    //  DIRECT CCCs (0x80 .. 0xFE)     -- Bit 7 is 1; addresses specific Target(s) after Repeated START
    // -------------------------------------------------------------------------------------------------

    /// <summary>
    /// Enable Events Command (Direct, 0x80). Enables IBI / CR / HJ on a specific Target.
    /// </summary>
    ENEC_Direct = 0x80,

    /// <summary>
    /// Disable Events Command (Direct, 0x81). Disables IBI / CR / HJ on a specific Target.
    /// Very commonly sent right after NACKing an unwanted IBI: `NACK -> Sr -> 7E/W -> DISEC(0x81) -> Sr -> DA/W -> 0x01 -> P`.
    /// </summary>
    DISEC_Direct = 0x81,

    /// <summary>
    /// Reset Dynamic Address Assignment (Direct, 0x86). Deprecated in v1.1 in favor of Broadcast
    /// RSTDAA or SETNEWDA, but still supported by many devices to clear a single Target's DA.
    /// </summary>
    RSTDAA_Direct = 0x86,

    /// <summary>
    /// Set Dynamic Address from Static Address (Direct, 0x87).
    /// Used BEFORE ENTDAA for an I3C Target that has a known hardware Static Address (SA):
    ///   `S -> 7E/W -> ACK -> 0x87 + T -> Sr -> SA/W -> ACK -> (NewDA &lt;&lt; 1) + T -> P`
    /// Fast, deterministic, and requires zero Open-Drain PID arbitration!
    /// </summary>
    SETDASA = 0x87,

    /// <summary>
    /// Set New Dynamic Address (Direct, 0x88).
    /// Allows the Controller to change the Dynamic Address of a Target that ALREADY has a Dynamic
    /// Address (for example, to boost or lower that Target's IBI priority at runtime!):
    ///   `S -> 7E/W -> ACK -> 0x88 + T -> Sr -> OldDA/W -> ACK -> (NewDA &lt;&lt; 1) + T -> P`
    /// </summary>
    SETNEWDA = 0x88,

    /// <summary>
    /// Set Max Write Length (Direct, 0x89). Writes 2 bytes (MSB, LSB) to a specific Target.
    /// </summary>
    SETMWL_Direct = 0x89,

    /// <summary>
    /// Set Max Read Length (Direct, 0x8A). Writes 2 bytes (MSB, LSB) to a specific Target.
    /// </summary>
    SETMRL_Direct = 0x8A,

    /// <summary>
    /// Get Max Write Length (Direct Read, 0x8B). Reads 2 bytes (MSB, LSB) from a specific Target.
    /// </summary>
    GETMWL = 0x8B,

    /// <summary>
    /// Get Max Read Length (Direct Read, 0x8C). Reads 2 bytes (MSB, LSB) from a specific Target.
    /// </summary>
    GETMRL = 0x8C,

    /// <summary>
    /// Get Provisional ID (Direct Read, 0x8D). Reads the 6-byte (48-bit) PID from a specific Target.
    /// </summary>
    GETPID = 0x8D,

    /// <summary>
    /// Get Bus Characteristics Register (Direct Read, 0x8E). Reads 1 byte (BCR) from a specific Target.
    /// </summary>
    GETBCR = 0x8E,

    /// <summary>
    /// Get Device Characteristics Register (Direct Read, 0x8F). Reads 1 byte (DCR) from a specific Target.
    /// </summary>
    GETDCR = 0x8F,

    /// <summary>
    /// Get Device Status (Direct Read, 0x90). Reads 2 bytes (16-bit status, including pending IBI info
    /// and protocol error counters) from a specific Target.
    /// </summary>
    GETSTATUS = 0x90
}

/// <summary>
/// Bitmask payload byte for the <see cref="CccCode.ENEC_Broadcast"/>, <see cref="CccCode.ENEC_Direct"/>,
/// <see cref="CccCode.DISEC_Broadcast"/>, and <see cref="CccCode.DISEC_Direct"/> commands.
/// </summary>
[Flags]
public enum TargetEventMask : byte
{
    None = 0x00,

    /// <summary>Bit 0 (ENINT / DISINT): Target In-Band Interrupt (IBI) requests.</summary>
    InBandInterrupt = 1 << 0,

    /// <summary>Bit 1 (ENCR / DISCR): Secondary Controller Role requests.</summary>
    ControllerRoleRequest = 1 << 1,

    /// <summary>Bit 3 (ENHJ / DISHJ): Target Hot-Join requests (7'h02/W).</summary>
    HotJoin = 1 << 3,

    /// <summary>Convenience mask for all standard Target-initiated events (IBI + CR + HJ = 0x0B).</summary>
    All = InBandInterrupt | ControllerRoleRequest | HotJoin
}

public static class CccCodeExtensions
{
    /// <summary>
    /// In the MIPI I3C specification, bit 7 of any CCC command byte indicates whether it is a
    /// Direct CCC (1) or a Broadcast CCC (0).
    /// </summary>
    public static bool IsDirect(this CccCode code) => ((byte)code & 0x80) != 0;
}
