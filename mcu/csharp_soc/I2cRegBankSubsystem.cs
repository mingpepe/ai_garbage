using System;
using System.Threading;

namespace DualCoreSoC;

/// <summary>
/// Models the SoC Dual-Bank Register File (Bank 0 & Bank 1, size 0x7F each),
/// 0x7F Bank Switch Register, 256-byte Report Buffer, Bank 0 0x0F Special Port,
/// Host-vs-FW Arbiter, and I2C Slave Engine (matches rtl/i2c_regbank_subsys.v).
/// </summary>
public sealed class I2cRegBankSubsystem
{
    public const byte SlaveAddress7Bit = 0x42;
    public const int  BankSize         = 0x7F; // 0x00 .. 0x7E (127 bytes per bank)
    public const byte RegBankSelOffset = 0x7F; // Write 0 -> Bank 0, Write 1 -> Bank 1
    public const byte SpecialReportPort = 0x0F; // In Bank 0, 0x0F redirects to Report Buffer!
    public const int  ReportBufferSize = 256;

    private readonly byte[] _bank0Regs    = new byte[BankSize];
    private readonly byte[] _bank1Regs    = new byte[BankSize];
    private readonly byte[] _reportBuffer = new byte[ReportBufferSize];

    // Arbiter lock & contention tracking between Host (I2C) and FW (SoC Bus)
    private readonly object _arbiterLock = new();
    private int _activeRequestors = 0;
    public volatile bool ArbRrPrio = false; // false = FW priority, true = Host priority

    public volatile byte HostBankSel = 0;
    public volatile byte FwBankSel   = 0;
    public volatile byte RptWrPtr    = 0;
    public volatile byte RptRdPtr    = 0;

    public long HostAccessCount   = 0;
    public long FwAccessCount     = 0;
    public long ArbConflictCount  = 0;

    // I2C Slave internal register pointer
    private byte _i2cRegPtr = 0;

    public void Reset()
    {
        lock (_arbiterLock)
        {
            Array.Clear(_bank0Regs, 0, _bank0Regs.Length);
            Array.Clear(_bank1Regs, 0, _bank1Regs.Length);
            Array.Clear(_reportBuffer, 0, _reportBuffer.Length);
            HostBankSel      = 0;
            FwBankSel        = 0;
            RptWrPtr         = 0;
            RptRdPtr         = 0;
            _i2cRegPtr       = 0;
            ArbRrPrio        = false;
            HostAccessCount  = 0;
            FwAccessCount    = 0;
            ArbConflictCount = 0;
        }
    }

    public byte RptStatus => _bank0Regs[0x04];
    public byte RptLength => _bank0Regs[0x05];

    // ========================================================================
    // 1. FW Bus Access Port (0x4000_0000 .. 0x4000_10FF)
    //    Arbitrated against Host I2C Access Port
    // ========================================================================
    public uint FwRead( ushort addrOffset, int sizeBytes)
    {
        if (Interlocked.Increment(ref _activeRequestors) > 1)
        {
            Interlocked.Increment(ref ArbConflictCount);
        }

        try
        {
            lock (_arbiterLock)
            {
                FwAccessCount++;
                ArbRrPrio = true; // Next conflict favors Host

                bool isRptWin = (addrOffset >> 8) == 0x10; // 0x4000_1000..0x4000_10FF
                byte regIdx   = (byte)(addrOffset & 0xFF);
                byte val      = 0;

                if (isRptWin)
                {
                    val = _reportBuffer[regIdx];
                }
                else if (regIdx == RegBankSelOffset)
                {
                    val = FwBankSel;
                }
                else if (FwBankSel == 0)
                {
                    if (regIdx == SpecialReportPort)
                    {
                        // Special Port Bank 0 0x0F -> Redirected to Report Buffer!
                        val = _reportBuffer[RptRdPtr];
                        RptRdPtr++;
                    }
                    else if (regIdx < BankSize)
                    {
                        val = _bank0Regs[regIdx];
                    }
                }
                else
                {
                    if (regIdx < BankSize)
                    {
                        val = _bank1Regs[regIdx];
                    }
                }

                return sizeBytes switch
                {
                    1 => val,
                    2 => (uint)(val | (val << 8)),
                    _ => (uint)(val | (val << 8) | (val << 16) | (val << 24))
                };
            }
        }
        finally
        {
            Interlocked.Decrement(ref _activeRequestors);
        }
    }

    public void FwWrite(ushort addrOffset, uint wdata)
    {
        if (Interlocked.Increment(ref _activeRequestors) > 1)
        {
            Interlocked.Increment(ref ArbConflictCount);
        }

        try
        {
            lock (_arbiterLock)
            {
                FwAccessCount++;
                ArbRrPrio = true; // Next conflict favors Host

                bool isRptWin = (addrOffset >> 8) == 0x10; // 0x4000_1000..0x4000_10FF
                byte regIdx   = (byte)(addrOffset & 0xFF);
                byte byteVal  = (byte)(wdata & 0xFF);

                if (isRptWin)
                {
                    _reportBuffer[regIdx] = byteVal;
                    RptWrPtr = (byte)(regIdx + 1);
                }
                else if (regIdx == RegBankSelOffset)
                {
                    // Write 0x7F -> Switch FW active bank (0 or 1)
                    FwBankSel = (byte)(byteVal & 0x01);
                }
                else if (FwBankSel == 0)
                {
                    if (regIdx == SpecialReportPort)
                    {
                        // Special Port Bank 0 0x0F -> Push to Report Buffer!
                        _reportBuffer[RptWrPtr] = byteVal;
                        RptWrPtr++;
                    }
                    else if (regIdx == 0x0E && (byteVal & 0x01) != 0)
                    {
                        // Reset Report Buffer pointers
                        RptWrPtr = 0;
                        RptRdPtr = 0;
                    }
                    else if (regIdx < BankSize)
                    {
                        _bank0Regs[regIdx] = byteVal;
                        // When FW sets B0_RPT_STATUS (0x04) == 1, reset RptRdPtr to 0 for Host
                        if (regIdx == 0x04 && byteVal == 0x01)
                        {
                            RptRdPtr = 0;
                        }
                    }
                }
                else
                {
                    if (regIdx < BankSize)
                    {
                        _bank1Regs[regIdx] = byteVal;
                    }
                }
            }
        }
        finally
        {
            Interlocked.Decrement(ref _activeRequestors);
        }
    }

    // ========================================================================
    // 2. Host I2C Slave Port (7-bit Slave Address = 0x42)
    //    Arbitrated against FW Bus Access Port
    // ========================================================================
    public bool I2cSetRegisterPointer(byte slaveAddr, byte regAddr)
    {
        if (slaveAddr != SlaveAddress7Bit) return false;
        _i2cRegPtr = regAddr;
        return true;
    }

    public bool I2cHostWriteByte(byte slaveAddr, byte val)
    {
        if (slaveAddr != SlaveAddress7Bit) return false;

        if (Interlocked.Increment(ref _activeRequestors) > 1)
        {
            Interlocked.Increment(ref ArbConflictCount);
        }

        try
        {
            lock (_arbiterLock)
            {
                HostAccessCount++;
                ArbRrPrio = false; // Next conflict favors FW

                byte addr = _i2cRegPtr;
                if (addr == RegBankSelOffset)
                {
                    // Write 0x7F -> Switch Host active bank (0 or 1)!
                    HostBankSel = (byte)(val & 0x01);
                }
                else if (HostBankSel == 0)
                {
                    if (addr == SpecialReportPort)
                    {
                        // Special Port Bank 0 0x0F -> Write Report Buffer
                        _reportBuffer[RptWrPtr] = val;
                        RptWrPtr++;
                    }
                    else if (addr == 0x0E && (val & 0x01) != 0)
                    {
                        RptWrPtr = 0;
                        RptRdPtr = 0;
                    }
                    else if (addr < BankSize)
                    {
                        _bank0Regs[addr] = val;
                        _i2cRegPtr++;
                    }
                }
                else
                {
                    if (addr < BankSize)
                    {
                        _bank1Regs[addr] = val;
                        _i2cRegPtr++;
                    }
                }
                return true;
            }
        }
        finally
        {
            Interlocked.Decrement(ref _activeRequestors);
        }
    }

    public bool I2cHostReadByte(byte slaveAddr, out byte val)
    {
        val = 0xFF;
        if (slaveAddr != SlaveAddress7Bit) return false;

        if (Interlocked.Increment(ref _activeRequestors) > 1)
        {
            Interlocked.Increment(ref ArbConflictCount);
        }

        try
        {
            lock (_arbiterLock)
            {
                HostAccessCount++;
                ArbRrPrio = false; // Next conflict favors FW

                byte addr = _i2cRegPtr;
                if (addr == RegBankSelOffset)
                {
                    val = HostBankSel;
                    _i2cRegPtr++;
                }
                else if (HostBankSel == 0)
                {
                    if (addr == SpecialReportPort)
                    {
                        // SPECIAL PORT: Bank 0 Reg 0x0F redirects to Report Buffer!
                        // Does NOT read _bank0Regs[0x0F], and keeps _i2cRegPtr at 0x0F for burst reads!
                        val = _reportBuffer[RptRdPtr];
                        RptRdPtr++;
                    }
                    else if (addr < BankSize)
                    {
                        val = _bank0Regs[addr];
                        _i2cRegPtr++;
                    }
                }
                else
                {
                    if (addr < BankSize)
                    {
                        val = _bank1Regs[addr];
                        _i2cRegPtr++;
                    }
                }
                return true;
            }
        }
        finally
        {
            Interlocked.Decrement(ref _activeRequestors);
        }
    }
}
