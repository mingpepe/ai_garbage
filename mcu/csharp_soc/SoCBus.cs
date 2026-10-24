using System;
using System.IO;
using System.Text;
using System.Threading;

namespace DualCoreSoC;

/// <summary>
/// Thread-safe Dual-Core RISC-V SoC Interconnect, Local SRAMs, Shared Memory (with RV32A Atomics & LR/SC),
/// CLINT IPI Controller, Boot Controller, and UART MMIO.
/// Matches the exact hardware behavior of rtl/soc_interconnect.v, rtl/sram.v, and rtl/clint_ipi_boot.v.
/// </summary>
public sealed class SoCBus
{
    public const uint Core0SramBase = 0x0000_0000;
    public const uint Core1SramBase = 0x0001_0000;
    public const uint SharedMemBase = 0x1000_0000;
    public const uint ClintBase     = 0x2000_0000;
    public const uint UartBase      = 0x3000_0000;
    public const uint RegBankBase   = 0x4000_0000;
    public const int  MemSizeBytes  = 16 * 1024; // 16 KB (4096 words)

    private readonly byte[] _sramCore0 = new byte[MemSizeBytes];
    private readonly byte[] _sramCore1 = new byte[MemSizeBytes];
    private readonly byte[] _sharedMem = new byte[MemSizeBytes];

    // Dual Register Bank (2x0x7F), Report Buffer (0x0F Port), Host-vs-FW Arbiter & I2C Slave
    public readonly I2cRegBankSubsystem RegBankSubsys = new();

    // Dedicated locks for thread-safe bus & atomic shared memory access across the 2 core threads
    private readonly object _sram0Lock = new();
    private readonly object _sram1Lock = new();
    private readonly object _shmLock   = new();
    private readonly object _mmioLock  = new();

    // LR.W / SC.W hardware reservation registers per core (matches rtl/soc_interconnect.v)
    private readonly bool[] _rsvValid = new bool[2];
    private readonly uint[] _rsvWordAddr = new uint[2];

    // CLINT IPI & Boot Control registers (0x2000_0000)
    public volatile bool Core0BootEn = true;            // Booted by SoC on reset
    public uint Core0BootAddr        = Core0SramBase;   // 0x0000_0000

    public volatile bool Core1BootEn = false;           // Held in reset until Core 0 writes CORE1_BOOT_CTRL
    public uint Core1BootAddr        = Core1SramBase;   // 0x0001_0000

    public volatile bool IrqSoftwareCore0 = false;
    public volatile bool IrqSoftwareCore1 = false;

    public uint IpiMsg0To1 = 0;
    public uint IpiMsg1To0 = 0;
    public volatile uint SimDoneFlags = 0;
    private uint _cycleCounter = 0;

    public uint LastTraceCore0 = 0;
    public uint LastTraceCore1 = 0;

    // Wakeup events for Core 1 boot and WFI (Wait For Interrupt) across C# threads
    public readonly ManualResetEventSlim Core1BootEvent = new(false);
    public readonly ManualResetEventSlim Core0IrqEvent  = new(false);
    public readonly ManualResetEventSlim Core1IrqEvent  = new(false);

    public readonly StringBuilder UartTranscript = new();

    private string? _core0BinPath;
    private string? _core1BinPath;

    public void LoadBinaryToSram(int coreId, string binPath)
    {
        if (coreId == 0) _core0BinPath = binPath;
        else _core1BinPath = binPath;

        byte[] data = File.ReadAllBytes(binPath);
        byte[] target = (coreId == 0) ? _sramCore0 : _sramCore1;
        Array.Clear(target, 0, target.Length);
        Array.Copy(data, 0, target, 0, Math.Min(data.Length, target.Length));
    }

    public void Reset()
    {
        lock (_sram0Lock)
        lock (_sram1Lock)
        lock (_shmLock)
        lock (_mmioLock)
        {
            if (_core0BinPath != null && File.Exists(_core0BinPath))
                LoadBinaryToSram(0, _core0BinPath);
            if (_core1BinPath != null && File.Exists(_core1BinPath))
                LoadBinaryToSram(1, _core1BinPath);

            Array.Clear(_sharedMem, 0, _sharedMem.Length);
            _rsvValid[0] = _rsvValid[1] = false;
            _rsvWordAddr[0] = _rsvWordAddr[1] = 0;

            Core0BootEn      = true;
            Core0BootAddr    = Core0SramBase;
            Core1BootEn      = false;
            Core1BootAddr    = Core1SramBase;
            IrqSoftwareCore0 = false;
            IrqSoftwareCore1 = false;
            IpiMsg0To1       = 0;
            IpiMsg1To0       = 0;
            SimDoneFlags     = 0;
            _cycleCounter    = 0;
            LastTraceCore0   = 0;
            LastTraceCore1   = 0;

            Core1BootEvent.Reset();
            Core0IrqEvent.Reset();
            Core1IrqEvent.Reset();
            UartTranscript.Clear();
            RegBankSubsys.Reset();
        }
    }

    public void IncrementCycle()
    {
        Interlocked.Increment(ref _cycleCounter);
    }

    /// <summary>
    /// Read 32-bit word from Shared Memory for testbench inspection.
    /// </summary>
    public uint ReadSharedWord(uint byteOffset)
    {
        lock (_shmLock)
        {
            return BitConverter.ToUInt32(_sharedMem, (int)(byteOffset & 0x3FFC));
        }
    }

    /// <summary>
    /// Bus Load (1, 2, or 4 bytes) from Core 0 or Core 1 thread.
    /// </summary>
    public uint Load(int coreId, uint addr, int sizeBytes, bool signedExtend)
    {
        uint region = addr >> 16;
        uint offset = addr & 0x3FFF;

        switch (region)
        {
            case 0x0000: // Core 0 Local SRAM
                lock (_sram0Lock)
                {
                    return ReadFromArray(_sramCore0, (int)offset, sizeBytes, signedExtend);
                }

            case 0x0001: // Core 1 Local SRAM
                lock (_sram1Lock)
                {
                    return ReadFromArray(_sramCore1, (int)offset, sizeBytes, signedExtend);
                }

            case 0x1000: // Shared Memory
                lock (_shmLock)
                {
                    return ReadFromArray(_sharedMem, (int)offset, sizeBytes, signedExtend);
                }

            case 0x2000: // CLINT IPI & Boot Controller
                lock (_mmioLock)
                {
                    uint word = ReadClint(addr & 0xFCu);
                    if (sizeBytes == 4) return word;
                    int shift = (int)(addr & 3u) * 8;
                    return sizeBytes == 1 ? ((word >> shift) & 0xFFu) : ((word >> shift) & 0xFFFFu);
                }

            case 0x3000: // UART MMIO
                return 0;

            case 0x4000: // Dual Register Bank (2x0x7F) & Report Buffer (arbitrated with Host I2C)
                return RegBankSubsys.FwRead((ushort)(addr & 0xFFFFu), sizeBytes);

            default:
                return 0;
        }
    }

    /// <summary>
    /// Bus Store (1, 2, or 4 bytes) from Core 0 or Core 1 thread.
    /// </summary>
    public void Store(int coreId, uint addr, uint value, int sizeBytes)
    {
        uint region = addr >> 16;
        uint offset = addr & 0x3FFF;

        switch (region)
        {
            case 0x0000: // Core 0 Local SRAM
                lock (_sram0Lock)
                {
                    WriteToArray(_sramCore0, (int)offset, value, sizeBytes);
                }
                break;

            case 0x0001: // Core 1 Local SRAM
                lock (_sram1Lock)
                {
                    WriteToArray(_sramCore1, (int)offset, value, sizeBytes);
                }
                break;

            case 0x1000: // Shared Memory (also invalidates matching LR/SC reservations on both cores)
                lock (_shmLock)
                {
                    WriteToArray(_sharedMem, (int)offset, value, sizeBytes);
                    uint wordAddr = offset >> 2;
                    if (_rsvValid[0] && _rsvWordAddr[0] == wordAddr) _rsvValid[0] = false;
                    if (_rsvValid[1] && _rsvWordAddr[1] == wordAddr) _rsvValid[1] = false;
                }
                break;

            case 0x2000: // CLINT IPI & Boot Controller
                lock (_mmioLock)
                {
                    WriteClint(addr & 0xFF, value);
                }
                break;

            case 0x3000: // UART & Debug Trace MMIO
                lock (_mmioLock)
                {
                    WriteUart(coreId, addr & 0xFF, value);
                }
                break;

            case 0x4000: // Dual Register Bank (2x0x7F) & Report Buffer (arbitrated with Host I2C)
                RegBankSubsys.FwWrite((ushort)(addr & 0xFFFFu), value);
                break;
        }
    }

    /// <summary>
    /// Execute RV32A Atomic Memory Operation (LR.W, SC.W, AMOSWAP.W, AMOADD.W, etc.)
    /// indivisibly on Shared Memory (or SRAM), matching rtl/soc_interconnect.v.
    /// </summary>
    public uint AtomicOp(int coreId, uint addr, uint srcVal, uint funct5)
    {
        uint offset = addr & 0x3FFC;
        uint wordAddr = offset >> 2;
        int otherCore = 1 - coreId;

        lock (_shmLock)
        {
            uint oldVal = BitConverter.ToUInt32(_sharedMem, (int)offset);

            switch (funct5)
            {
                case 0b00010: // LR.W (Load-Reserved Word)
                    _rsvValid[coreId] = true;
                    _rsvWordAddr[coreId] = wordAddr;
                    return oldVal;

                case 0b00011: // SC.W (Store-Conditional Word)
                {
                    bool success = _rsvValid[coreId] && (_rsvWordAddr[coreId] == wordAddr);
                    _rsvValid[coreId] = false;
                    if (success)
                    {
                        WriteToArray(_sharedMem, (int)offset, srcVal, 4);
                        if (_rsvValid[otherCore] && _rsvWordAddr[otherCore] == wordAddr)
                        {
                            _rsvValid[otherCore] = false;
                        }
                        return 0u; // 0 = SC.W succeeded
                    }
                    return 1u;     // 1 = SC.W failed
                }

                default:
                {
                    uint newVal = funct5 switch
                    {
                        0b00001 => srcVal,                                                    // AMOSWAP.W
                        0b00000 => oldVal + srcVal,                                           // AMOADD.W
                        0b00100 => oldVal ^ srcVal,                                           // AMOXOR.W
                        0b01100 => oldVal & srcVal,                                           // AMOAND.W
                        0b01000 => oldVal | srcVal,                                           // AMOOR.W
                        0b10000 => ((int)oldVal < (int)srcVal) ? oldVal : srcVal,             // AMOMIN.W
                        0b10100 => ((int)oldVal > (int)srcVal) ? oldVal : srcVal,             // AMOMAX.W
                        0b11000 => (oldVal < srcVal) ? oldVal : srcVal,                       // AMOMINU.W
                        0b11100 => (oldVal > srcVal) ? oldVal : srcVal,                       // AMOMAXU.W
                        _       => oldVal
                    };

                    WriteToArray(_sharedMem, (int)offset, newVal, 4);

                    // Invalidate any matching reservation on both cores
                    if (_rsvValid[0] && _rsvWordAddr[0] == wordAddr) _rsvValid[0] = false;
                    if (_rsvValid[1] && _rsvWordAddr[1] == wordAddr) _rsvValid[1] = false;

                    return oldVal;
                }
            }
        }
    }

    private uint ReadClint(uint offset)
    {
        return (offset >> 2) switch
        {
            0x00 => IrqSoftwareCore0 ? 1u : 0u,
            0x01 => IrqSoftwareCore1 ? 1u : 0u,
            0x02 => IpiMsg0To1,
            0x03 => IpiMsg1To0,
            0x04 => Core1BootAddr,
            0x05 => Core1BootEn ? 1u : 0u,
            0x06 => SimDoneFlags,
            0x07 => _cycleCounter,
            _    => 0u
        };
    }

    private void WriteClint(uint offset, uint val)
    {
        switch (offset >> 2)
        {
            case 0x00: // REG_MSIP_CORE0
                IrqSoftwareCore0 = (val & 1u) != 0;
                if (IrqSoftwareCore0) Core0IrqEvent.Set();
                else Core0IrqEvent.Reset();
                break;

            case 0x01: // REG_MSIP_CORE1
                IrqSoftwareCore1 = (val & 1u) != 0;
                if (IrqSoftwareCore1) Core1IrqEvent.Set();
                else Core1IrqEvent.Reset();
                break;

            case 0x02: // REG_IPI_MSG_0_TO_1
                IpiMsg0To1 = val;
                break;

            case 0x03: // REG_IPI_MSG_1_TO_0
                IpiMsg1To0 = val;
                break;

            case 0x04: // REG_CORE1_BOOT_ADDR
                Core1BootAddr = val;
                break;

            case 0x05: // REG_CORE1_BOOT_CTRL
                Core1BootEn = (val & 1u) != 0;
                if (Core1BootEn)
                {
                    Core1BootEvent.Set();
                }
                break;

            case 0x06: // REG_SIM_DONE_FLAGS
                SimDoneFlags |= val;
                break;
        }
    }

    private void WriteUart(int coreId, uint offset, uint val)
    {
        switch (offset >> 2)
        {
            case 0x00: // REG_UART_TX
                char c = (char)(val & 0xFF);
                Console.Write(c);
                UartTranscript.Append(c);
                break;

            case 0x02: // REG_DBG_TRACE
                if (coreId == 0) LastTraceCore0 = val;
                else LastTraceCore1 = val;
                break;
        }
    }

    private static uint ReadFromArray(byte[] buf, int offset, int sizeBytes, bool signedExtend)
    {
        if (offset < 0 || offset + sizeBytes > buf.Length) return 0;
        return sizeBytes switch
        {
            1 => signedExtend ? (uint)(int)(sbyte)buf[offset] : buf[offset],
            2 => signedExtend ? (uint)(int)BitConverter.ToInt16(buf, offset) : BitConverter.ToUInt16(buf, offset),
            4 => BitConverter.ToUInt32(buf, offset),
            _ => 0u
        };
    }

    private static void WriteToArray(byte[] buf, int offset, uint val, int sizeBytes)
    {
        if (offset < 0 || offset + sizeBytes > buf.Length) return;
        switch (sizeBytes)
        {
            case 1:
                buf[offset] = (byte)(val & 0xFF);
                break;
            case 2:
                buf[offset]     = (byte)(val & 0xFF);
                buf[offset + 1] = (byte)((val >> 8) & 0xFF);
                break;
            case 4:
                buf[offset]     = (byte)(val & 0xFF);
                buf[offset + 1] = (byte)((val >> 8) & 0xFF);
                buf[offset + 2] = (byte)((val >> 16) & 0xFF);
                buf[offset + 3] = (byte)((val >> 24) & 0xFF);
                break;
        }
    }
}
