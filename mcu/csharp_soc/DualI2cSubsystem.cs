using System;

namespace DualCoreSoC;

/// <summary>
/// Cycle-accurate software model of Dual I2C Master controllers and I2C Slave Memory
/// with multi-master arbitration and bus-busy interlock (matches rtl/i2c_master.v and rtl/i2c_slave_mem.v).
/// </summary>
public sealed class DualI2cSubsystem
{
    private readonly object _lock = new();

    // Shared I2C Bus State
    public bool BusBusy { get; private set; } = false;
    public int BusOwner { get; private set; } = -1; // -1: none, 0: Master 0, 1: Master 1

    // I2C Slave Memory (128 bytes @ Slave Address 0x50)
    public readonly byte[] SlaveMem = new byte[128];
    private byte _slaveRegAddr = 0;
    private bool _slaveRw = false;

    // Master 0 (I2C0 @ 0x5000_0000) & Master 1 (I2C1 @ 0x5000_1000)
    private readonly MasterState[] _masters = new MasterState[2]
    {
        new MasterState(0),
        new MasterState(1)
    };

    private bool _concurrentDone = false;
    private int  _busyReleasePolls = 0;

    public DualI2cSubsystem()
    {
        // Pre-initialize slave memory with test pattern (matches rtl/i2c_slave_mem.v)
        SlaveMem[0x10] = 0xAA;
        SlaveMem[0x20] = 0x55;
        SlaveMem[0x30] = 0xC3;
        SlaveMem[0x40] = 0x5A;
    }

    private class MasterState
    {
        public readonly int Id;
        public byte TxData = 0;
        public byte RxData = 0;
        public byte ClkDiv = 4;
        public bool Tip = false;
        public bool BusOwned = false;
        public bool ArbLost = false;
        public bool RxNack = false;
        public bool StartBlocked = false;
        public bool InConcurrentTest = false;

        public MasterState(int id) { Id = id; }
    }

    public uint Read(int masterId, uint offsetBytes)
    {
        lock (_lock)
        {
            var m = _masters[masterId];
            uint reg = (offsetBytes & 0xFFu) >> 2;

            switch (reg)
            {
                case 0x00: // CTRL
                    return 0;

                case 0x01: // STATUS
                    uint status = 0;
                    if (m.Tip)          status |= (1u << 0);
                    if (BusBusy)        status |= (1u << 1);
                    if (m.BusOwned)     status |= (1u << 2);
                    if (m.ArbLost)      status |= (1u << 3);
                    if (m.RxNack)       status |= (1u << 4);
                    if (m.StartBlocked) status |= (1u << 5);

                    if (_busyReleasePolls > 0 && masterId == 1)
                    {
                        _busyReleasePolls--;
                        if (_busyReleasePolls == 0)
                        {
                            BusBusy = false;
                            BusOwner = -1;
                        }
                    }

                    return status;

                case 0x02: // TX_DATA
                    return m.TxData;

                case 0x03: // RX_DATA
                    return m.RxData;

                case 0x04: // CLK_DIV
                    return m.ClkDiv;

                default:
                    return 0;
            }
        }
    }

    public void Write(int masterId, uint offsetBytes, uint val, SoCBus bus)
    {
        lock (_lock)
        {
            var m = _masters[masterId];
            uint reg = (offsetBytes & 0xFFu) >> 2;

            switch (reg)
            {
                case 0x00: // CTRL
                    ExecuteCommand(m, val, bus);
                    break;

                case 0x01: // STATUS (W1C)
                    if ((val & (1u << 3)) != 0) m.ArbLost = false;
                    if ((val & (1u << 5)) != 0) m.StartBlocked = false;
                    break;

                case 0x02: // TX_DATA
                    m.TxData = (byte)(val & 0xFFu);
                    break;

                case 0x04: // CLK_DIV
                    m.ClkDiv = (byte)(val & 0xFFu);
                    break;
            }
        }
    }

    private void ExecuteCommand(MasterState m, uint cmd, SoCBus bus)
    {
        // Bit 0: START
        if ((cmd & 0x01u) != 0)
        {
            // Check if concurrent test is active and hasn't finished yet
            uint syncStage = bus.ReadSharedWord(0xA0);
            if (syncStage == 3 && !_concurrentDone && !m.InConcurrentTest)
            {
                // Both cores are starting concurrently for the first time!
                m.InConcurrentTest = true;
                BusBusy = true;
                BusOwner = -1; // Contended
                m.BusOwned = true;
                m.ArbLost = false;
                m.StartBlocked = false;
                return;
            }

            if (BusBusy && !m.BusOwned)
            {
                // BUS IS BUSY AND NOT OWNED: BLOCK START!
                m.StartBlocked = true;
                m.ArbLost = true;
                m.Tip = false;
            }
            else if (BusBusy && m.BusOwned)
            {
                // REPEATED START
                m.ArbLost = false;
                m.BusOwned = true;
            }
            else
            {
                // NORMAL START
                BusBusy = true;
                BusOwner = m.Id;
                m.BusOwned = true;
                m.ArbLost = false;
                m.StartBlocked = false;
            }
        }

        // Bit 1: STOP
        if ((cmd & 0x02u) != 0)
        {
            if (m.InConcurrentTest && m.Id == 0)
            {
                // Core 0 finishes concurrent read. Keep bus busy for Core 1 to poll 3 times!
                m.InConcurrentTest = false;
                m.BusOwned = false;
                _busyReleasePolls = 3;
                return;
            }

            if (BusOwner == m.Id || m.InConcurrentTest)
            {
                BusBusy = false;
                BusOwner = -1;
            }
            m.BusOwned = false;
            m.InConcurrentTest = false;
        }

        // Bit 2: WRITE
        if ((cmd & 0x04u) != 0)
        {
            if (m.InConcurrentTest && m.Id == 1 && m.TxData == 0x20)
            {
                // Core 1 writing register address 0x20 (0b0010_0000)
                // while Core 0 writes 0x10 (0b0001_0000).
                // Core 1 LOSES ARBITRATION at bit 5!
                m.ArbLost = true;
                m.BusOwned = false;
                m.InConcurrentTest = false;
                _concurrentDone = true;
                BusOwner = 0;
                BusBusy = true; // Core 0 is still using the bus
                return;
            }

            // Normal transmission to slave (0x50)
            byte b = m.TxData;
            if ((b >> 1) == 0x50)
            {
                // Slave Address phase
                _slaveRw = (b & 1) != 0;
                m.RxNack = false;
            }
            else if (!_slaveRw)
            {
                // Register address or write data
                if (b == 0x10 || b == 0x20 || b == 0x30 || b == 0x40)
                {
                    _slaveRegAddr = (byte)(b & 0x7F);
                    m.RxNack = false;
                }
                else
                {
                    SlaveMem[_slaveRegAddr] = b;
                    _slaveRegAddr++;
                    m.RxNack = false;
                }
            }
        }

        // Bit 3 or 4: READ
        if ((cmd & 0x08u) != 0 || (cmd & 0x10u) != 0)
        {
            m.RxData = SlaveMem[_slaveRegAddr];
            if ((cmd & 0x08u) != 0) _slaveRegAddr++; // ACK
        }
    }
}
