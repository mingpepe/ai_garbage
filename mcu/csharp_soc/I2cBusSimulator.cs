using System;

namespace DualCoreSoC;

/// <summary>
/// Simulates the I2C Bus and Master Controller connecting the Host Application to the SoC I2C Slave.
/// </summary>
public sealed class I2cBusSimulator
{
    private readonly I2cRegBankSubsystem _slave;
    private readonly object _i2cBusLock = new();

    public long TotalI2cTransactions = 0;

    public I2cBusSimulator(I2cRegBankSubsystem slave)
    {
        _slave = slave;
    }

    /// <summary>
    /// Standard I2C Register Write: [START] [Addr+W] [RegAddr] [Value] [STOP]
    /// </summary>
    public bool WriteRegister(byte slaveAddr, byte regAddr, byte value)
    {
        lock (_i2cBusLock)
        {
            TotalI2cTransactions++;
            if (!_slave.I2cSetRegisterPointer(slaveAddr, regAddr)) return false;
            return _slave.I2cHostWriteByte(slaveAddr, value);
        }
    }

    /// <summary>
    /// Standard I2C Register Read: [START] [Addr+W] [RegAddr] [REPEATED-START] [Addr+R] [ReadByte + NACK] [STOP]
    /// </summary>
    public byte ReadRegister(byte slaveAddr, byte regAddr)
    {
        lock (_i2cBusLock)
        {
            TotalI2cTransactions++;
            if (!_slave.I2cSetRegisterPointer(slaveAddr, regAddr)) return 0xFF;
            _slave.I2cHostReadByte(slaveAddr, out byte val);
            return val;
        }
    }

    /// <summary>
    /// Standard I2C Burst Read: [START] [Addr+W] [RegAddr] [REPEATED-START] [Addr+R] [Byte0+ACK .. ByteN-1+NACK] [STOP]
    /// Used by Host to stream the Report Buffer through Bank 0 Special Port 0x0F.
    /// </summary>
    public byte[] BurstRead(byte slaveAddr, byte regAddr, int length)
    {
        lock (_i2cBusLock)
        {
            TotalI2cTransactions++;
            byte[] buf = new byte[length];
            if (!_slave.I2cSetRegisterPointer(slaveAddr, regAddr))
            {
                Array.Fill(buf, (byte)0xFF);
                return buf;
            }
            for (int i = 0; i < length; i++)
            {
                _slave.I2cHostReadByte(slaveAddr, out buf[i]);
            }
            return buf;
        }
    }
}
