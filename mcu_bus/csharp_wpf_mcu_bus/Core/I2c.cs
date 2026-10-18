namespace McuBusWpf.Core;

public sealed class I2c
{
    public const uint BaseAddress = 0x40001000U;
    public const uint RegCr = 0x00U;
    public const uint RegSr = 0x04U;
    public const uint RegDr = 0x08U;
    public const uint RegCnt = 0x0CU;

    public const uint CrPe = 1U << 0;
    public const uint CrTxeie = 1U << 1;
    public const uint CrDmatxen = 1U << 2;

    public const uint SrTxe = 1U << 0;
    public const uint SrBusy = 1U << 1;

    private readonly Queue<byte> txFifo = new();

    public int FifoCapacity { get; }
    public int CyclesPerByte { get; }
    public uint CR { get; set; } = CrPe | CrDmatxen;
    public uint SR { get; private set; } = SrTxe;

    public int ShiftCounter { get; private set; }
    public bool IsTransmitting { get; private set; }
    public byte ShiftByte { get; private set; }
    public byte LastWireByte { get; private set; }
    public uint TotalTransmitted { get; private set; }

    public bool DmaReqTx => (txFifo.Count < FifoCapacity) && (CR & CrDmatxen) != 0;
    public bool IrqTxe { get; private set; }
    public int FifoCount => txFifo.Count;
    public IReadOnlyList<byte> FifoSnapshot => txFifo.ToArray();

    public event Action<string>? LogEvent;
    public event Action<byte>? TransmittedOnWire;

    public I2c(int fifoCapacity = 2, int cyclesPerByte = 4)
    {
        FifoCapacity = fifoCapacity;
        CyclesPerByte = cyclesPerByte;
    }

    public void Reset()
    {
        txFifo.Clear();
        CR = CrPe | CrDmatxen;
        SR = SrTxe;
        ShiftCounter = 0;
        IsTransmitting = false;
        ShiftByte = 0;
        LastWireByte = 0;
        TotalTransmitted = 0;
        IrqTxe = false;
    }

    public void Tick()
    {
        if (IsTransmitting)
        {
            ShiftCounter++;
            if (ShiftCounter >= CyclesPerByte)
            {
                IsTransmitting = false;
                ShiftCounter = 0;
                TotalTransmitted++;
                LastWireByte = ShiftByte;
                TransmittedOnWire?.Invoke(ShiftByte);
                LogEvent?.Invoke($"[I2C] >>> WIRE TRANSMIT COMPLETE: 0x{ShiftByte:X2} ('{(ShiftByte >= 32 && ShiftByte <= 126 ? (char)ShiftByte : '.')}') [Total: {TotalTransmitted}]");
            }
        }

        if (!IsTransmitting && txFifo.Count > 0)
        {
            ShiftByte = txFifo.Dequeue();
            IsTransmitting = true;
            ShiftCounter = 0;
        }

        bool canAccept = txFifo.Count < FifoCapacity;
        SR = (canAccept ? SrTxe : 0) | (IsTransmitting ? SrBusy : 0);
        if ((CR & CrTxeie) != 0) IrqTxe = canAccept;
    }

    public uint ReadReg(uint offset)
    {
        return offset switch
        {
            RegCr => CR,
            RegSr => SR,
            RegCnt => (uint)txFifo.Count,
            _ => 0
        };
    }

    public void WriteReg(uint offset, uint value)
    {
        switch (offset)
        {
            case RegCr:
                CR = value;
                break;
            case RegDr:
                if (txFifo.Count >= FifoCapacity)
                {
                    LogEvent?.Invoke($"[I2C] >>> ERROR: TX FIFO Overflow! Dropping 0x{(byte)value:X2}");
                    return;
                }
                byte b = (byte)(value & 0xFF);
                txFifo.Enqueue(b);
                bool canAccept = txFifo.Count < FifoCapacity;
                SR = (canAccept ? SrTxe : 0) | (IsTransmitting ? SrBusy : 0);
                LogEvent?.Invoke($"[I2C] TX FIFO <= 0x{b:X2} (FIFO: {txFifo.Count}/{FifoCapacity}, DMATxReq={DmaReqTx})");
                break;
        }
    }
}
