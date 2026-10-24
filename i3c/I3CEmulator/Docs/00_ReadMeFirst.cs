// =====================================================================================================
//  I3C EMULATOR  -  READ ME FIRST
// =====================================================================================================
//
//  Audience
//  --------
//  You know I2C well: START/STOP, 7-bit address + R/W, ACK/NACK, open-drain + pull-ups, clock
//  stretching, multi-master arbitration. You do NOT know I3C yet. After reading this project
//  (and running it, the console trace is part of the documentation) you should understand every
//  single bit that travels on an I3C SDR bus.
//
//  Suggested reading order
//  -----------------------
//     1. Docs/00_ReadMeFirst.cs          <- this file: the big picture, I2C vs I3C
//     2. Physical/I3CBus.cs              <- electrical model: open-drain vs push-pull, wired-AND
//     3. Physical/Timing.cs              <- why there are several SCL speeds on one bus
//     4. Protocol/*.cs                   <- addresses, parity, CCC codes, PID/BCR/DCR
//     5. Devices/I3CMaster.Bits.cs       <- S / Sr / P, header arbitration, T-bit, parity
//     6. Devices/I3CMaster.Daa.cs        <- dynamic address assignment (ENTDAA, SETDASA)
//     7. Devices/I3CMaster.Ibi.cs        <- in-band interrupts, Hot-Join, arbitration handling
//     8. Devices/I3CMaster.Ccc.cs / .Transfers.cs
//     9. Devices/I3CSlave.cs             <- the very same protocol seen from the target side
//    10. Devices/I2CSlave.cs             <- why a legacy I2C device survives on an I3C bus
//    11. Program.cs                      <- the scenario; run it and read the trace next to it
//
//  Terminology
//  -----------
//  MIPI renamed "Master" -> "Controller" and "Slave" -> "Target" in I3C v1.1. Both words are used
//  here. Class names: I3CMaster, I3CSlave, I2CSlave. The emulator implements I3C SDR mode (the
//  mandatory mode); HDR modes are only mentioned.
//
// =====================================================================================================
//  1. WHAT I3C KEEPS FROM I2C AND WHAT IT CHANGES
// =====================================================================================================
//
//  +----------------------------+-------------------------------+-------------------------------------+
//  | Topic                      | I2C                           | I3C (SDR mode)                      |
//  +----------------------------+-------------------------------+-------------------------------------+
//  | Wires                      | SCL, SDA                      | SCL, SDA (the same two wires)       |
//  | START / STOP               | SDA edge while SCL high       | identical                           |
//  | Who drives SCL             | master, open-drain; slaves    | master ONLY, always PUSH-PULL.      |
//  |                            | may stretch it (hold low)     | No clock stretching, ever.          |
//  | SDA driver                 | always open-drain             | open-drain OR push-pull, chosen     |
//  |                            |                               | field by field (see section 2)      |
//  | Speed                      | 100k/400k/1M (3.4M HS)        | 12.5 MHz SDR (+ HDR modes)          |
//  | Address                    | static, from pins / factory   | DYNAMIC, handed out by the master   |
//  |                            |                               | at run time (ENTDAA / SETDASA)      |
//  | Device identity            | none, just the address        | 48-bit PID + BCR + DCR registers    |
//  | 9th bit of a WRITTEN byte  | ACK/NACK from the receiver    | T-bit = odd PARITY, from the master |
//  | 9th bit of a READ byte     | ACK/NACK from the master      | T-bit = "more data?" from target;   |
//  |                            |                               | the master may abort on it          |
//  | ACK/NACK                   | after every byte              | only after the ADDRESS header       |
//  | Interrupt                  | extra INT pin per device      | In-Band Interrupt (IBI) on SDA      |
//  | Plug-in at run time        | not defined                   | Hot-Join (reserved address 7'h02)   |
//  | Bus management             | General Call 0x00 (rarely)    | CCC = Common Command Codes, sent to |
//  |                            |                               | the broadcast address 7'h7E         |
//  | Who arbitrates             | masters only                  | targets too (IBI, Hot-Join, DAA)    |
//  |                            |                               | using the SAME wired-AND trick      |
//  | Legacy devices             | -                             | I2C slaves allowed on the same bus  |
//  |                            |                               | (50 ns spike filter, no stretching) |
//  +----------------------------+-------------------------------+-------------------------------------+
//
// =====================================================================================================
//  2. OPEN-DRAIN (OD) vs PUSH-PULL (PP)   -- the single most important I3C concept
// =====================================================================================================
//
//  RULE: use OPEN-DRAIN whenever more than one device may LEGITIMATELY drive SDA in the same bit, or
//        when the driver does not know if anybody will answer. Use PUSH-PULL when exactly one device
//        is known to own SDA.  (Physical/I3CBus.cs explains the electrical reason.)
//
//  +--------------------------------------+-------------------+-----------+---------------------------+
//  | Field                                | Driven by         | Mode      | SCL timing (this emulator)|
//  +--------------------------------------+-------------------+-----------+---------------------------+
//  | START (S)                            | master, or a      |  -        |                           |
//  |                                      | target (IBI / HJ  |           |                           |
//  |                                      | "START request")  |           |                           |
//  | Address + RnW right after S          | master AND any    | OD        | OD: tLOW 200ns, tHIGH 40ns|
//  |                                      | target that wants | (arbitr.) | very first one after init:|
//  |                                      | to interrupt      |           | tHIGH_INIT = 200 ns       |
//  | Address + RnW after Sr               | master only       | PP        | 12.5 MHz                  |
//  | ACK/NACK of an address               | addressed target  | OD        | OD                        |
//  | ACK/NACK of an IBI / Hot-Join        | MASTER            | OD        | OD                        |
//  | CCC code, defining byte, write data  | master            | PP        | 12.5 MHz                  |
//  | T-bit of written data (parity)       | master            | PP        | 12.5 MHz                  |
//  | Read data / IBI payload              | target            | PP        | 12.5 MHz                  |
//  | T-bit of read data (end-of-data)     | target, then      | PP, then  | 12.5 MHz                  |
//  |                                      | handed to master  | released  |                           |
//  | ENTDAA: PID+BCR+DCR (64 bits)        | all unassigned    | OD        | OD                        |
//  |                                      | targets at once   | (arbitr.) |                           |
//  | ENTDAA: new address + parity         | master            | OD (*)    | OD                        |
//  | ENTDAA: ACK of the new address       | winning target    | OD        | OD                        |
//  | Sr, P                                | master            |  -        |                           |
//  | Any bit of a legacy I2C transfer     | master / I2C dev  | OD        | I2C FM / FM+              |
//  +--------------------------------------+-------------------+-----------+---------------------------+
//  (*) the whole ENTDAA exchange is run at open-drain timing by this emulator (as most controllers do).
//
// =====================================================================================================
//  3. ADDRESS SPACE
// =====================================================================================================
//
//     7'h00..7'h07  reserved; 7'h02 is the Hot-Join request address
//     7'h7E         BROADCAST address. Every I3C target ACKs "7E/W". CCCs start with it.
//     7'h7F 7'h7C 7'h7A 7'h76 7'h6E 7'h5E 7'h3E
//                   = 7'h7E with exactly one bit flipped. Never used, so that a single bit error can
//                     never turn a broadcast into a valid private address (and vice versa).
//     everything else: free for dynamic addresses, minus the static addresses of the I2C devices.
//
//     LOWER ADDRESS = HIGHER PRIORITY. On a wired-AND bus a '0' beats a '1', and addresses are sent
//     MSB first, so the numerically smallest header wins every arbitration. By choosing the dynamic
//     addresses the master literally chooses the interrupt priority of each target.
//
// =====================================================================================================
//  4. LIFE OF AN I3C BUS (what happens when) -- Program.cs plays exactly this story
// =====================================================================================================
//
//    power-up, all targets have NO dynamic address (they cannot be addressed privately yet)
//       |
//       v
//   [1] master sends the very first 7'h7E with a slow tHIGH_INIT so that targets which also contain an
//       I2C spike filter can see it and switch to I3C mode. Typically: broadcast RSTDAA (forget any old
//       addresses) and maybe DISEC (no interrupts during configuration).
//       |
//   [2] SETDASA  : targets that have a STATIC (I2C-like) address are given a dynamic address directly.
//       |          No arbitration needed: the master addresses them by their static address.
//       |
//   [3] ENTDAA   : ALL remaining targets compete at the same time with their 48-bit PID (open-drain
//       |          arbitration). The winner gets an address and drops out. Repeat until nobody ACKs.
//       |          ==> THIS IS "WHEN THE SLAVE ID IS ASSIGNED".
//       |
//   [4] GETPID / GETBCR / GETDCR ... and ENEC: enable In-Band Interrupts.
//       |
//   [5] normal traffic: private I3C read/write (PP, 12.5 MHz) + legacy I2C transfers (OD, FM+)
//       |      ^
//       |      |   at ANY START (not Sr) header, or when the bus has been free for tAVAL (1 us),
//       +------+   a target with an enabled event can raise an IBI: it puts "its DA + R" on the bus
//       |          and wins arbitration against the master  ==> "WHEN THE SLAVE INTERRUPTS".
//       |
//   [6] a new device is plugged in: it waits until the bus has been idle for tIDLE (200 us), then
//       raises a Hot-Join request ("7'h02 + W"). The master ACKs and runs ENTDAA again; only the
//       newcomer has no address, so only it takes part.
//
// =====================================================================================================
//  5. FRAME FORMATS   (S=START Sr=repeated START P=STOP A=ACK N=NACK T=T-bit, [..]=optional)
// =====================================================================================================
//
//   Private write  S 7E/W A Sr DA/W A D T D T ... P          (recommended: 7E first, see IBI below)
//                    `-OD-'    `PP-' ^  `---PP---'
//                                    `-- ACK always OD
//   Private write  S DA/W A D T ... P                        (short form, DA/W in OD after S)
//   Private read   S 7E/W A Sr DA/R A D T D T ... P          T=1 "more", T=0 "last" (target decides),
//                                                             master may abort while T=1
//   Broadcast CCC  S 7E/W A CCC T [def T] [data T]... P      CCC code 0x00..0x7F
//   Direct CCC     S 7E/W A CCC T Sr DA1/RW A data.. [Sr DA2/RW A data..] P      CCC code 0x80..0xFE
//   ENTDAA         S 7E/W A 07 T  Sr 7E/R A PID BCR DCR DA+par A  Sr 7E/R A ...  Sr 7E/R N P
//   SETDASA        S 7E/W A 87 T  Sr SA/W A (DA<<1) T P      SA = the target's static address
//   IBI            S(by target) DA/R(arbitrated) A(by MASTER) [MDB T [data T]...] P
//   Hot-Join       S(by target) 02/W(arbitrated) A(by MASTER) P   ... then ENTDAA
//   Legacy I2C     S SA/W A D A D A ... P                    exactly I2C, OD, FM/FM+ timing
//
// =====================================================================================================
//  6. IN-BAND INTERRUPT (IBI) AND ARBITRATION IN ONE PAGE
// =====================================================================================================
//
//   WHEN may a target raise an IBI?   All of:
//     (a) it has an event pending,
//     (b) it owns a dynamic address,
//     (c) the master enabled it with ENEC (ENINT); DISEC disables it,
//     (d) BCR[1] = 1 (it is IBI capable)
//   and one of:
//     - the bus has been free (SCL=SDA=1 after a STOP) for tAVAL = 1 us  ("Bus Available"):
//       the target pulls SDA low itself = START request; the master answers by clocking SCL, or
//     - the master just generated a START (NOT a repeated START) for its own transfer: the target
//       drives its own address in that header and competes with whatever the master is sending.
//
//   HOW is arbitration decided?
//     The address header after a START is open-drain: wired-AND, '0' wins. Every competitor (the
//     master included!) sends its 8 header bits MSB first and samples SDA at every SCL rising edge.
//     Anyone who sent '1' but reads '0' has lost: it releases SDA immediately and only listens.
//     The lowest header wins and the bus content is never corrupted: what is on the bus IS the
//     winner's header.
//
//   HOW does the master find out what happened?
//     Its own sampled bits are the winner's header:
//        DA/R  with a known DA        -> In-Band Interrupt from that target
//        7'h02/W                      -> Hot-Join request
//        DA/W  with a known DA        -> Controller-Role request (a secondary master wants the bus)
//        its own header (no loss)     -> nobody interrupted, normal transfer
//
//   HOW does the master handle it?
//     ACK (master drives OD low) = accept. If BCR[2]=1 the target then sends a Mandatory Data Byte
//     (and maybe more) in push-pull with T-bits, then the master sends P. Afterwards the master
//     RETRIES its own transfer, which may lose again to the next interrupter.
//     NACK = refuse; the target keeps the event and retries. To stop the retries the master follows
//     the NACK with Sr + DISEC: after an Sr nobody may arbitrate, so the DISEC cannot be interrupted.
//
//   WHAT does the loser do?
//     Keeps its request pending and tries again at the next START or Bus-Available condition.
//
//   Why do controllers start private transfers with "S 7E/W A Sr"?
//     7'h7E is larger than any valid DA, so any pending IBI wins immediately (interrupt latency is
//     minimal), and after the Sr the real address can be sent in fast push-pull.
//
// =====================================================================================================
//  7. LEGACY I2C SLAVES ON AN I3C BUS
// =====================================================================================================
//
//   - The I2C slave must have a 50 ns spike filter. I3C push-pull/open-drain SCL HIGH pulses are
//     <= ~40 ns, so the filter swallows them: the I2C slave sees START ... STOP with no clocks in
//     between and therefore never answers to I3C traffic. (Devices/I2CSlave.cs simulates this.)
//   - The I2C slave must NOT stretch SCL (SCL is push-pull in I3C, nobody else may touch it).
//   - The master knows the I2C devices statically (address + LVR register value from firmware /
//     device tree). It never gives that address to an I3C target.
//   - 7'h7E is not a valid 7-bit I2C slave address (it falls in the reserved 11110xx range), so an
//     I2C slave that does see a 7E header (e.g. the slow first one) simply does not ACK.
//   - The master talks to I2C slaves with plain I2C frames: open-drain everywhere, FM/FM+ timing,
//     a real ACK/NACK after every byte.
//
// =====================================================================================================
//  8. ERROR DETECTION (targets)    TE0..TE6 in the spec; the ones implemented here:
//     TE1  parity error in a CCC code           -> ignore the frame until Sr/P
//     TE2  parity error in written data         -> ignore the rest of the write
//     TE3  parity error in the address assigned by ENTDAA -> do not ACK, master retries
//     (TE0 = an invalid "broadcast-like" address, TE5 = illegally formatted CCC, TE6 = monitoring.)
// =====================================================================================================

namespace I3CEmulator.Docs;

/// <summary>Documentation-only type. All content is in the comment block above.</summary>
internal static class ReadMeFirst
{
}
