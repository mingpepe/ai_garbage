using System;
using System.Threading;

namespace DualCoreSoC;

/// <summary>
/// C# Host Application that communicates with the Dual-Core RISC-V SoC over I2C:
///   1. Switches Register Banks by writing 0x7F (Bank 0 <-> Bank 1)
///   2. Polls Bank 0 Reg 0x04 (B0_RPT_STATUS) to check when FW has filled the Report Buffer
///   3. Reads Bank 1 diagnostics (0x02, 0x03, 0x10..0x13, and normal Bank1 Reg 0x0F)
///   4. Reads the 32-byte Report Buffer via Bank 0 Special Port 0x0F
///   5. Verifies payload & checksum, then writes ACK (0x02) to Bank 0 Reg 0x04
/// </summary>
public sealed class HostApplication
{
    public const byte SlaveAddr = I2cRegBankSubsystem.SlaveAddress7Bit; // 0x42

    private readonly I2cBusSimulator _i2c;

    public bool PollStarted    = false;
    public bool ReportVerified = false;
    public int  PollCount      = 0;
    public byte CalculatedChecksum = 0;
    public byte ExpectedChecksum   = 0;
    public byte Bank1Sig0          = 0;
    public byte Bank1Reg0F         = 0;
    public byte[] ReceivedReport   = Array.Empty<byte>();

    public HostApplication(I2cBusSimulator i2c)
    {
        _i2c = i2c;
    }

    /// <summary>
    /// Executes one polling/processing step of the Host Application (for cycle-synchronized stepping)
    /// or can be called in a loop on the Host Thread.
    /// Returns true once the full Report Buffer has been read, verified, and ACKed.
    /// </summary>
    public bool StepHostPollAndRead(bool silent = false)
    {
        if (ReportVerified) return true;

        if (!PollStarted)
        {
            PollStarted = true;
            if (!silent)
            {
                Console.WriteLine("[Host I2C App] Selecting Bank 0 (write 0x7F = 0x00) & polling Reg 0x04 (B0_RPT_STATUS)...");
            }
            _i2c.WriteRegister(SlaveAddr, 0x7F, 0x00);
        }

        // Poll Bank 0 Reg 0x04 (B0_RPT_STATUS)
        byte status = _i2c.ReadRegister(SlaveAddr, 0x04);
        PollCount++;

        if (status != 0x01)
        {
            return false; // Report not ready yet
        }

        if (!silent)
        {
            Console.WriteLine($"[Host I2C App] Detected B0_RPT_STATUS == 0x{status:x2} after {PollCount} I2C polls!");
            Console.WriteLine("[Host I2C App] Switching to Bank 1 (write 0x7F = 0x01) to read diagnostics...");
        }

        // 1. Switch to Bank 1 (write 0x7F = 0x01) and verify Bank 1 registers
        _i2c.WriteRegister(SlaveAddr, 0x7F, 0x01);
        byte curBank    = _i2c.ReadRegister(SlaveAddr, 0x7F);
        byte b1SpinCnt  = _i2c.ReadRegister(SlaveAddr, 0x02);
        byte b1IpiHops  = _i2c.ReadRegister(SlaveAddr, 0x03);
        byte b1Sig0     = _i2c.ReadRegister(SlaveAddr, 0x10);
        byte b1Sig1     = _i2c.ReadRegister(SlaveAddr, 0x11);
        byte b1Sig2     = _i2c.ReadRegister(SlaveAddr, 0x12);
        byte b1Sig3     = _i2c.ReadRegister(SlaveAddr, 0x13);
        byte b1Reg0F    = _i2c.ReadRegister(SlaveAddr, 0x0F);

        Bank1Sig0  = b1Sig0;
        Bank1Reg0F = b1Reg0F;

        if (!silent)
        {
            Console.WriteLine($"[Host I2C App] Bank {curBank} Read: SpinCnt={b1SpinCnt}, IpiHops={b1IpiHops}, Sig={b1Sig0:x2}{b1Sig1:x2}{b1Sig2:x2}{b1Sig3:x2}, Bank1_Reg0x0F=0x{b1Reg0F:x2}");
            Console.WriteLine("[Host I2C App] Switching to Bank 0 (write 0x7F = 0x00) to read Report Buffer via Special Port 0x0F...");
        }

        // 2. Switch back to Bank 0 (write 0x7F = 0x00)
        _i2c.WriteRegister(SlaveAddr, 0x7F, 0x00);
        byte rptLen  = _i2c.ReadRegister(SlaveAddr, 0x05);
        byte expCsum = _i2c.ReadRegister(SlaveAddr, 0x08);
        ExpectedChecksum = expCsum;

        // 3. Burst-read all 32 bytes from Bank 0 Special Port 0x0F (redirected to Report Buffer!)
        ReceivedReport = _i2c.BurstRead(SlaveAddr, 0x0F, rptLen);

        byte calcCsum = 0;
        for (int i = 0; i < ReceivedReport.Length; i++)
        {
            calcCsum = (byte)(calcCsum + ReceivedReport[i]);
        }
        CalculatedChecksum = calcCsum;

        if (!silent && ReceivedReport.Length >= 32)
        {
            char h0 = (char)ReceivedReport[0];
            char h1 = (char)ReceivedReport[1];
            char h2 = (char)ReceivedReport[2];
            byte ver = ReceivedReport[3];
            Console.WriteLine($"[Host I2C App] Read {rptLen} bytes from Bank 0 Port 0x0F (Report Buffer):");
            Console.WriteLine($"  Header   : {h0}{h1}{h2} v{ver}");
            Console.WriteLine($"  Stats    : SharedCnt={ReceivedReport[4]}, IpiPingPong={ReceivedReport[5]}, Core0Ipi={ReceivedReport[6]}, Core1Ipi={ReceivedReport[7]}");
            Console.WriteLine($"  Trailer  : 0x{ReceivedReport[28]:x2}{ReceivedReport[29]:x2}{ReceivedReport[30]:x2}{ReceivedReport[31]:x2}");
            Console.WriteLine($"  Checksum : Calc=0x{calcCsum:x2}, Expected=0x{expCsum:x2}");
            Console.WriteLine("[Host I2C App] Sending ACK (0x02) to Bank 0 Reg 0x04...");
        }

        // 4. Write ACK (0x02) to Bank 0 Reg 0x04 (B0_RPT_STATUS) to notify FW
        _i2c.WriteRegister(SlaveAddr, 0x04, 0x02);

        ReportVerified = (rptLen == 32) &&
                         (calcCsum == expCsum) &&
                         (b1Sig0 == 0xB1) &&
                         (b1Reg0F == 0xA5);
        return true;
    }
}
