// =====================================================================================================
//  Program.cs  -  Complete MIPI I3C Bus Emulator & Educational Verification Testbench
// =====================================================================================================
//
//  Welcome to the MIPI I3C Specification Emulator!
//  This application is designed specifically for engineers who already understand I2C and want
//  to master every detail of I3C:
//    - Why and when Open-Drain vs Push-Pull is used.
//    - How and when Slave IDs (Dynamic Addresses) are assigned (ENTDAA vs SETDASA).
//    - How and when Slaves interrupt the Master (In-Band Interrupts without extra INT pins).
//    - How Wired-AND arbitration is detected and resolved between Master and Slaves.
//    - How Legacy I2C Slaves survive and communicate on the same two wires without disruption.
//
// =====================================================================================================

using I3CEmulator.Devices;
using I3CEmulator.Physical;
using I3CEmulator.Protocol;

Console.OutputEncoding = System.Text.Encoding.UTF8;
PrintAsciiBanner();

// =====================================================================================================
//  CHAPTER 0: PHYSICAL BUS & HARDWARE TOPOLOGY SETUP
// =====================================================================================================
PrintChapterHeader(0, "PHYSICAL BUS SETUP & DEVICE TOPOLOGY");

Console.WriteLine("""
Attaching 6 physical devices to the two-wire bus (SCL + SDA):
  1. I3C Controller (Master)       : Active bus controller.
  2. Target A (Gyro / IMU)         : Pure I3C, BCR=0x06 (IBI capable + MDB payload), DCR=0x41.
  3. Target B (Temp / Humidity)    : Dual-mode, Static I2C Addr=0x48, BCR=0x06, DCR=0x62.
  4. Target C (High-Priority Alert): Pure I3C, BCR=0x02 (IBI capable, No MDB), DCR=0xC5.
  5. Target D (Hot-Join Sensor)    : Pure I3C, powered off at boot, plugged in later!
  6. Legacy I2C EEPROM (24C02)     : Classic I2C chip at 7-bit Static Addr=0x50, 50ns spike filter.
""");

var bus = new I3CBus { VerboseTrace = true };

var master = new I3CMaster();
bus.Attach(master);

// Target A: Pure I3C (Manufacturer=0x0123, Part=0x4001, Instance=0)
var targetAIdent = new I3CDeviceIdentity(
    I3CDeviceIdentity.BuildProvisionalId(0x0123, 0x4001, instanceId4Bit: 0),
    BcrFlags.IbiRequestCapable | BcrFlags.IbiHasMandatoryDataByte,
    Dcr: 0x41);
var targetA = new I3CSlave("TargetA-Gyro", targetAIdent);
bus.Attach(targetA);

// Target B: Dual I2C/I3C mode (Static Address = 0x48)
var targetBIdent = new I3CDeviceIdentity(
    I3CDeviceIdentity.BuildProvisionalId(0x0123, 0x4002, instanceId4Bit: 1),
    BcrFlags.IbiRequestCapable | BcrFlags.IbiHasMandatoryDataByte,
    Dcr: 0x62);
var targetB = new I3CSlave("TargetB-Temp", targetBIdent, staticAddress7Bit: 0x48);
bus.Attach(targetB);

// Target C: Alert Sensor (Smaller PID to win arbitration over Target A during ENTDAA)
var targetCIdent = new I3CDeviceIdentity(
    I3CDeviceIdentity.BuildProvisionalId(0x0055, 0x1000, instanceId4Bit: 0),
    BcrFlags.IbiRequestCapable,
    Dcr: 0xC5);
var targetC = new I3CSlave("TargetC-Alert", targetCIdent);
bus.Attach(targetC);

// Target D: Hot-Join device (not connected at boot)
var targetDIdent = new I3CDeviceIdentity(
    I3CDeviceIdentity.BuildProvisionalId(0x0789, 0x9999, instanceId4Bit: 0),
    BcrFlags.IbiRequestCapable | BcrFlags.IbiHasMandatoryDataByte,
    Dcr: 0x00);
var targetD = new I3CSlave("TargetD-HotPlug", targetDIdent, connectedAtPowerOn: false);
bus.Attach(targetD);

// Legacy I2C EEPROM: Static Address 0x50, LVR 0x00 (has 50 ns spike filter, FM+)
var legacyI2C = new I2CSlave("Legacy-EEPROM-24C02", staticAddress7Bit: 0x50, lvr: 0x00);
bus.Attach(legacyI2C);
master.LegacyI2CTable.Add(legacyI2C.GetDescriptor());

// Pre-fill some data in the EEPROM for later verification
legacyI2C.Registers[0x10] = 0xAA;
legacyI2C.Registers[0x11] = 0xBB;
legacyI2C.Registers[0x12] = 0xCC;

Console.WriteLine("All devices wired to SCL & SDA. Bus is currently IDLE (SCL=1, SDA=1).\n");

// =====================================================================================================
//  CHAPTER 1: INITIAL WAKE-UP BROADCAST & 50 ns SPIKE FILTER
// =====================================================================================================
PrintChapterHeader(1, "INITIAL WAKE-UP BROADCAST (7'h7E) & 50 ns SPIKE FILTER");

Console.WriteLine("""
[WHY THIS STEP IS NEEDED]:
  Target B has a Static I2C Address (0x48), so at boot it enables its 50 ns analog spike filter in
  case it was plugged into an old I2C motherboard.
  The Controller now sends the VERY FIRST broadcast (7'h7E/W) with slow timing (tHIGH = 200 ns >= 50 ns).
  - Target B sees 7'h7E, turns OFF its 50 ns filter, and switches into full I3C mode!
  - Legacy EEPROM (0x50) checks the header, sees 7'h7E != 0x50, NACKs, and goes back to sleep.
  - Controller issues RSTDAA (0x06) to ensure all dynamic addresses start completely clean.
""");

master.ExecuteRstdaa();

Assert(targetB.IsI2CSpikeFilterEnabled == false, "Target B must have disabled its 50ns spike filter after seeing 7'h7E.");
Assert(targetA.DynamicAddress == null, "Target A should have no Dynamic Address yet.");
Assert(targetB.DynamicAddress == null, "Target B should have no Dynamic Address yet.");
Assert(targetC.DynamicAddress == null, "Target C should have no Dynamic Address yet.");

// =====================================================================================================
//  CHAPTER 2: STATIC-TO-DYNAMIC ADDRESS ASSIGNMENT (SETDASA)
// =====================================================================================================
PrintChapterHeader(2, "STATIC-TO-DYNAMIC ADDRESS ASSIGNMENT (SETDASA, CCC 0x87)");

Console.WriteLine("""
[WHEN IS SLAVE ID ASSIGNED? METHOD 1: SETDASA]
  Because Target B has a known Static I2C Address (0x48), the Controller does NOT need to run slow
  64-bit arbitration! Instead, the Controller uses Direct CCC SETDASA (0x87):
    S -> 7E/W (OD) -> ACK -> 0x87 + T (PP) -> Sr -> 0x48/W (PP!) -> ACK -> (0x0A << 1) + T (PP) -> P
  Notice: 0x48/W is sent after Repeated START (Sr) in PUSH-PULL mode at 12.5 MHz!
""");

bool setdasaOk = master.ExecuteSetdasa(staticAddress7Bit: 0x48, dynamicAddressToAssign: 0x0A);
Assert(setdasaOk, "SETDASA to Target B must succeed.");
Assert(targetB.DynamicAddress == 0x0A, "Target B Dynamic Address must now be 0x0A.");
master.TargetTable[0x0A] = targetBIdent;

// =====================================================================================================
//  CHAPTER 3: DYNAMIC ADDRESS ASSIGNMENT (ENTDAA) & 64-BIT OPEN-DRAIN ARBITRATION
// =====================================================================================================
PrintChapterHeader(3, "DYNAMIC ADDRESS ASSIGNMENT (ENTDAA, CCC 0x07) & 64-BIT ARBITRATION");

Console.WriteLine("""
[WHEN IS SLAVE ID ASSIGNED? METHOD 2: ENTDAA]
  Target A and Target C do not have static addresses. They must be discovered via ENTDAA (0x07).
  In each round:
    1. Sr -> 7E/R: All unassigned targets ACK (OD:0) together.
    2. 64-Bit Open-Drain Arbitration: All unassigned targets clock out {PID[47:0], BCR[7:0], DCR[7:0]}.
       - Target C (PID=0x0055_1000...) has smaller Manufacturer ID than Target A (PID=0x0123_4001...).
       - At bit 18, Target A drives '1' (Hi-Z), but Target C drives '0' (pulls GND).
       - Target A samples SDA=0, LOSES ARBITRATION, and drops out!
       - Target C survives all 64 bits and WINS Round 1!
    3. Controller assigns Dynamic Address 0x08 with Odd Parity to Target C.
    4. Target C verifies parity and ACKs on bit 9!
    5. In Round 2, only Target A is unassigned; Target A wins and receives Dynamic Address 0x09!
    6. In Round 3, nobody ACKs Sr -> 7E/R. Controller sends STOP (P) to conclude ENTDAA!
""");

int entdaaAssigned = master.ExecuteEntdaa();
Assert(entdaaAssigned == 2, $"ENTDAA should have assigned exactly 2 targets (assigned: {entdaaAssigned}).");
Assert(targetC.DynamicAddress == 0x08, $"Target C (smaller PID) must have won round 1 and gotten DA=0x08 (was 0x{targetC.DynamicAddress:X2}).");
Assert(targetA.DynamicAddress == 0x09, $"Target A must have won round 2 and gotten DA=0x09 (was 0x{targetA.DynamicAddress:X2}).");

Console.WriteLine("\nDEVICE ADDRESS TABLE (DAT) IN CONTROLLER AFTER DAA:");
foreach (var (da, ident) in master.TargetTable.OrderBy(kv => kv.Key))
{
    Console.WriteLine($"  * Dynamic Address 0x{da:X2} : {ident}");
}

// =====================================================================================================
//  CHAPTER 4: DIRECT CCCs & ENABLING IN-BAND INTERRUPTS
// =====================================================================================================
PrintChapterHeader(4, "DIRECT CCCs (GETPID, GETBCR, GETDCR, GETSTATUS) & ENEC");

Console.WriteLine("""
The Controller now verifies Target A's identity using Direct Read CCCs:
  - GETPID (0x8D) -> Reads 6 bytes (48-bit PID) in Push-Pull.
  - GETBCR (0x8E) -> Reads 1 byte (BCR).
  - GETDCR (0x8F) -> Reads 1 byte (DCR).
Then the Controller enables In-Band Interrupts (IBIs) across all targets using Broadcast ENEC (0x00).
""");

ulong? pidA = master.GetProvisionalId(0x09);
BcrFlags? bcrA = master.GetBcr(0x09);
byte? dcrA = master.GetDcr(0x09);

Console.WriteLine($"\nQueried Target A (0x09) via Direct CCCs:");
Console.WriteLine($"  - Provisional ID : 0x{pidA:X12} (Expected: 0x{targetAIdent.ProvisionalId48:X12})");
Console.WriteLine($"  - BCR            : 0x{(byte)bcrA!:X2} ({bcrA})");
Console.WriteLine($"  - DCR            : 0x{dcrA:X2}");

Assert(pidA == targetAIdent.ProvisionalId48, "GETPID must match Target A's PID.");
Assert(bcrA == targetAIdent.Bcr, "GETBCR must match Target A's BCR.");
Assert(dcrA == targetAIdent.Dcr, "GETDCR must match Target A's DCR.");

// Enable IBIs on all targets
master.EnableEvents(TargetEventMask.InBandInterrupt);
Assert(targetA.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt), "Target A IBI must be enabled.");
Assert(targetB.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt), "Target B IBI must be enabled.");
Assert(targetC.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt), "Target C IBI must be enabled.");

// =====================================================================================================
//  CHAPTER 5: PRIVATE HIGH-SPEED I3C SDR READ & WRITE (12.5 MHz PUSH-PULL)
// =====================================================================================================
PrintChapterHeader(5, "PRIVATE HIGH-SPEED I3C SDR READ & WRITE (12.5 MHz PUSH-PULL)");

Console.WriteLine("""
[WHEN TO USE PUSH-PULL?]:
  Private data bytes are transferred in PUSH-PULL mode at 12.5 MHz (tLOW=40ns, tHIGH=40ns).
  - S -> 7E/W (OD) -> ACK -> Sr -> DA/W (PP) -> ACK -> RegAddr + T (PP) -> Data + T (PP) -> P.
  - Every written byte has an Odd Parity T-Bit generated by the Controller.
  - Every read byte has a T-Bit driven by the Target (T=1: more data, T=0: last byte).
""");

byte[] writePayload = { 0x20, 0x11, 0x22, 0x33, 0x44 }; // Reg 0x20, then 4 data bytes
bool writeOk = master.PrivateWrite(dynamicAddress: 0x09, useBroadcastPreamble: true, writePayload);
Assert(writeOk, "Private write to Target A must succeed.");
Assert(targetA.Registers[0x20] == 0x11, "Target A Reg 0x20 must be 0x11.");
Assert(targetA.Registers[0x21] == 0x22, "Target A Reg 0x21 must be 0x22.");
Assert(targetA.Registers[0x22] == 0x33, "Target A Reg 0x22 must be 0x33.");
Assert(targetA.Registers[0x23] == 0x44, "Target A Reg 0x23 must be 0x44.");

targetA.RegisterPointer = 0x20;
byte[]? readBack = master.PrivateRead(dynamicAddress: 0x09, byteCount: 4);
Assert(readBack is not null && readBack.Length == 4, "Private read must return 4 bytes.");
Console.WriteLine($"\nRead back from Target A Reg 0x20..0x23: [{string.Join(", ", readBack!.Select(b => $"0x{b:X2}"))}]");
Assert(readBack.SequenceEqual(new byte[] { 0x11, 0x22, 0x33, 0x44 }), "Read back bytes must match written data.");

Console.WriteLine($"\nChecking Legacy I2C EEPROM spike filter status:");
Console.WriteLine($"  - Total 12.5 MHz clock pulses suppressed by EEPROM's 50ns spike filter: {legacyI2C.FilteredOutI3CClockPulses}");
Assert(legacyI2C.FilteredOutI3CClockPulses > 0, "Legacy EEPROM must have suppressed narrow I3C clock pulses!");

// =====================================================================================================
//  CHAPTER 6: LEGACY I2C SLAVE COMPATIBILITY ON THE SAME I3C BUS
// =====================================================================================================
PrintChapterHeader(6, "LEGACY I2C SLAVE COMPATIBILITY ON THE ACTIVE I3C BUS");

Console.WriteLine("""
The Controller now talks to the Legacy 24C02 EEPROM at 7-bit Static Address 0x50:
  - SCL runs at 400 kHz Fast-Mode (tLOW=1300ns, tHIGH=600ns >= 50ns).
  - Both SCL and SDA use pure OPEN-DRAIN signaling.
  - Every 9th bit is a classic I2C ACK/NACK!
  - I3C Targets see the slow clocks, but ignore the frame because 0x50 != any dynamic address.
""");

// Read pre-filled bytes from EEPROM Reg 0x10..0x12
byte[]? eepromRead = master.I2CWriteRead(staticAddress7Bit: 0x50, registerAddress: 0x10, readCount: 3);
Assert(eepromRead is not null && eepromRead.SequenceEqual(new byte[] { 0xAA, 0xBB, 0xCC }),
    "I2C EEPROM must return pre-filled bytes [0xAA, 0xBB, 0xCC].");

// Write new bytes to EEPROM Reg 0x10..0x12
bool i2cWriteOk = master.I2CWrite(staticAddress7Bit: 0x50, registerAddress: 0x10, 0xDE, 0xAD, 0xBE, 0xEF);
Assert(i2cWriteOk, "I2C Write to EEPROM must succeed.");
Assert(legacyI2C.Registers[0x10] == 0xDE, "EEPROM 0x10 must be 0xDE.");
Assert(legacyI2C.Registers[0x11] == 0xAD, "EEPROM 0x11 must be 0xAD.");

// Read back the updated bytes
eepromRead = master.I2CWriteRead(staticAddress7Bit: 0x50, registerAddress: 0x10, readCount: 4);
Assert(eepromRead is not null && eepromRead.SequenceEqual(new byte[] { 0xDE, 0xAD, 0xBE, 0xEF }),
    "I2C EEPROM must return updated bytes [0xDE, 0xAD, 0xBE, 0xEF].");

Console.WriteLine($"Legacy I2C transactions completed successfully: {legacyI2C.CompletedI2CTransactions}\n");

// =====================================================================================================
//  CHAPTER 7: IN-BAND INTERRUPT (IBI) ARBITRATION & SERVICING
// =====================================================================================================
PrintChapterHeader(7, "IN-BAND INTERRUPT (IBI) ARBITRATION & SERVICING");

Console.WriteLine("""
[WHEN DOES SLAVE INTERRUPT? HOW IS ARBITRATION HANDLED?]
  SCENARIO 7A: Target-Initiated START during Bus Available (tAVAL = 1 us).
    1. Target A (Gyro) generates an internal event (e.g. motion threshold crossed).
    2. Bus is Free for 1 us -> Target A pulls SDA LOW (OD:0).
    3. Controller detects SDA LOW, wakes up, and clocks SCL.
    4. Target A drives DA/R = (0x09 << 1) | 1 = 0x13 in Open-Drain.
    5. Controller drives ACK (0) on bit 9!
    6. Because Target A has BCR[2]=1, Target A switches to PUSH-PULL and transmits:
       Mandatory Data Byte (MDB = 0x88) + Extra payload bytes [0x01, 0x02] + T-Bit.
    7. Controller issues STOP (P). Interrupt complete!
""");

byte receivedMdb = 0;
byte[] receivedIbiPayload = Array.Empty<byte>();
byte receivedIbiDa = 0;

master.OnInBandInterruptReceived += (da, mdb, payload) =>
{
    receivedIbiDa = da;
    receivedMdb = mdb;
    receivedIbiPayload = payload;
};

// Queue IBI inside Target A
targetA.QueueInBandInterrupt(mandatoryDataByte: 0x88, 0x01, 0x02);
Assert(targetA.HasPendingIbi, "Target A must have pending IBI.");

// Controller idle loop checks bus after 1 us of Free time
bool serviced = master.CheckAndServiceTargetInterrupts(idleTimeStepNs: 1_200);
Assert(serviced, "Controller must service Target A's IBI.");
Assert(receivedIbiDa == 0x09, "IBI must be from Target A (DA=0x09).");
Assert(receivedMdb == 0x88, "IBI Mandatory Data Byte must be 0x88.");
Assert(receivedIbiPayload.SequenceEqual(new byte[] { 0x01, 0x02 }), "IBI payload must match.");
Assert(!targetA.HasPendingIbi, "Target A pending IBI must be cleared after ACK.");

Console.WriteLine("""
  SCENARIO 7B: Collision & Arbitration during Controller Private Write!
    Suppose Target A (DA=0x09) and Target C (DA=0x08) BOTH queue an interrupt at the same time,
    AND the Controller simultaneously issues START (S) to begin a Private Write:
      - Controller wants to send Broadcast 7'h7E/W = 1111110_0b
      - Target A wants to send 0x09/R            = 0001001_1b
      - Target C wants to send 0x08/R            = 0001000_1b
    All three drive SDA in Open-Drain on the first header!
      - At bit 6: Controller drives '1', both targets drive '0' -> Controller LOSES ARBITRATION!
      - At bit 1: Target A drives '1', Target C drives '0'     -> Target A LOSES ARBITRATION!
      - Target C WINS the header! Controller services Target C's IBI!
      - Target A kept its interrupt pending! When Controller retries, Target A wins next!
      - Finally, Controller retries again and its Private Write succeeds!
""");

targetA.QueueInBandInterrupt(mandatoryDataByte: 0xA1);
targetC.QueueInBandInterrupt(mandatoryDataByte: 0xC1); // Note: Target C has no MDB payload

// Controller initiates Private Write to Target B; the collision occurs automatically!
Console.WriteLine("\n[Master] Starting Private Write to Target B (DA=0x0A)...");
bool writeWithCollisionsOk = master.PrivateWrite(dynamicAddress: 0x0A, useBroadcastPreamble: true, 0x55, 0x66);

Assert(writeWithCollisionsOk, "Private Write must ultimately succeed after servicing both interrupting targets!");
Assert(!targetC.HasPendingIbi, "Target C pending IBI must have been serviced first (higher priority).");
Assert(!targetA.HasPendingIbi, "Target A pending IBI must have been serviced second.");

// =====================================================================================================
//  CHAPTER 8: NACKing AN IBI & DISABLING RUNAWAY INTERRUPTS (DISEC)
// =====================================================================================================
PrintChapterHeader(8, "CONTROLLER NACKing AN IBI & DISABLING RUNAWAY INTERRUPTS (DISEC)");

Console.WriteLine("""
What happens if the Controller is too busy to accept an IBI?
  1. Target A queues an IBI.
  2. Controller intentionally drives NACK (1) on bit 9 of the header.
  3. Target A receives NACK -> Keeps its interrupt pending!
  4. To stop Target A from repeatedly retrying (interrupt storm), the Controller issues DISEC (0x81):
     Sr -> 7E/W -> DISEC (0x81) -> Sr -> TargetA/W -> 0x01 (DISINT) -> P
  5. Target A's IBI is now disabled! It will no longer arbitrate on the bus.
""");

targetA.QueueInBandInterrupt(mandatoryDataByte: 0xFF);
master.RejectNextIbiWithNack = true; // Tell Controller to drive NACK on next IBI header

master.CheckAndServiceTargetInterrupts(idleTimeStepNs: 1_200);
Assert(targetA.HasPendingIbi, "Target A must still have pending IBI because Controller NACKed it!");

// Controller disables IBIs on Target A using Direct DISEC
master.DisableEvents(TargetEventMask.InBandInterrupt, targetDynamicAddress: 0x09);
Assert(!targetA.EnabledEvents.HasFlag(TargetEventMask.InBandInterrupt), "Target A IBI must now be disabled.");

// Re-enable IBIs on Target A for remaining tests
master.EnableEvents(TargetEventMask.InBandInterrupt, targetDynamicAddress: 0x09);

// =====================================================================================================
//  CHAPTER 9: HOT-JOIN (CONNECTING A NEW DEVICE AT RUN-TIME)
// =====================================================================================================
PrintChapterHeader(9, "HOT-JOIN (CONNECTING A NEW DEVICE AT RUN-TIME, 7'h02/W)");

Console.WriteLine("""
[HOT-JOIN FLOW]:
  1. Target D (Sensor) is hot-plugged onto the bus while the bus is already operating!
  2. Target D has NO Dynamic Address yet. It waits for the bus to be Idle for tIDLE (200 us).
  3. Target D pulls SDA LOW to request a Hot-Join START, and drives 7'h02/W (0x04) in Open-Drain.
  4. Controller ACKs (0) the Hot-Join request and issues STOP.
  5. Controller automatically runs ENTDAA! Target A, B, and C already have addresses so they stay quiet.
  6. Target D enters ENTDAA 64-bit arbitration, wins, and receives Dynamic Address 0x0B!
""");

bool hotJoinDetected = false;
master.OnHotJoinDetected += () => hotJoinDetected = true;

targetD.PlugInForHotJoin();
Assert(targetD.HasPendingHotJoin, "Target D must have pending Hot-Join request.");

// Controller idle loop advances time by 200 us (tIDLE)
master.CheckAndServiceTargetInterrupts(idleTimeStepNs: Timing.BusIdleNs + 5_000);

Assert(hotJoinDetected, "Controller must detect and ACK Target D's Hot-Join request.");
Assert(targetD.DynamicAddress.HasValue, "Target D must have been assigned a Dynamic Address by ENTDAA.");
Console.WriteLine($"\nTarget D successfully Hot-Joined and was assigned DynamicAddress = 0x{targetD.DynamicAddress:X2}!");

// =====================================================================================================
//  CHAPTER 10: BUS STATISTICS & SUMMARY
// =====================================================================================================
PrintChapterHeader(10, "BUS SIMULATION METRICS & SUMMARY TABLE");

Console.WriteLine($"""
+------------------------------------------------------+-------------------------+
| Metric                                               | Value                   |
+------------------------------------------------------+-------------------------+
| Simulated Wall-Clock Time Elapsed                    | {bus.SimulatedTimeNs,12:N0} ns        |
| Total SCL Clock Bits in Open-Drain Mode              | {bus.OpenDrainBitCount,12:N0} bits      |
| Total SCL Clock Bits in 12.5 MHz Push-Pull Mode      | {bus.PushPullBitCount,12:N0} bits      |
| Clock Pulses Blocked by Legacy I2C 50ns Spike Filter | {legacyI2C.FilteredOutI3CClockPulses,12:N0} pulses    |
| Successful Legacy I2C Transactions                  | {legacyI2C.CompletedI2CTransactions,12:N0} transfers |
| I3C Targets Actively Registered in DAT               | {master.TargetTable.Count,12:N0} devices   |
+------------------------------------------------------+-------------------------+
""");

Console.ForegroundColor = ConsoleColor.Green;
Console.WriteLine("=========================================================================================");
Console.WriteLine("  ALL I3C & I2C SPECIFICATION TESTS AND VERIFICATION ASSERTIONS PASSED SUCCESSFULLY!   ");
Console.WriteLine("=========================================================================================\n");
Console.ResetColor();

// =====================================================================================================
//  HELPER FUNCTIONS
// =====================================================================================================

static void PrintAsciiBanner()
{
    Console.ForegroundColor = ConsoleColor.Cyan;
    Console.WriteLine("""
=========================================================================================================
  ███   ██████    ██████    ███████  ███    ███  ██    ██  ██          █████   ████████   ██████  ██████  
  ███  ████████  ████████   ███████  ████  ████  ██    ██  ██         ███████  ████████  ████████ ███████ 
  ███       ███  ██         ██       ██████████  ██    ██  ██         ██   ██     ██     ██    ██ ██   ██ 
  ███   ██████   ██         █████    ██ ████ ██  ██    ██  ██         ███████     ██     ██    ██ ███████ 
  ███      ████  ██         ██       ██  ██  ██  ██    ██  ██         ███████     ██     ██    ██ ██████  
  ███  ████████  ████████   ███████  ██      ██  ████████  █████████  ██   ██     ██     ████████ ██   ██ 
  ███   ██████    ██████    ███████  ██      ██   ██████   █████████  ██   ██     ██      ██████  ██   ██ 
=========================================================================================================
      Comprehensive MIPI I3C v1.1.1 SDR & Legacy I2C Coexistence Emulator in C# (.NET 10)
=========================================================================================================
""");
    Console.ResetColor();
}

static void PrintChapterHeader(int number, string title)
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine($"\n#########################################################################################");
    Console.WriteLine($"  CHAPTER {number}: {title}");
    Console.WriteLine($"#########################################################################################\n");
    Console.ResetColor();
}

static void Assert(bool condition, string message)
{
    if (!condition)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"\n[ASSERTION FAILED]: {message}\n");
        Console.ResetColor();
        Environment.Exit(1);
    }
}
