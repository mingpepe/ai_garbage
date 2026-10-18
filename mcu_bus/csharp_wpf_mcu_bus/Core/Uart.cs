namespace McuBusWpf.Core;

public sealed class Uart
{
    public const uint BaseAddress = 0x40000000U;
    public const uint RegCr = 0x00U;
    public const uint RegSr = 0x04U;
    public const uint RegDr = 0x08U;
    public const uint RegCnt = 0x0CU;

    public const uint CrUe = 1U << 0;
    public const uint CrRxneie = 1U << 1;
    public const uint CrDmarxen = 1U << 2;

    public const uint SrRxne = 1U << 0;
    public const uint SrOre = 1U << 1;

    private readonly Queue<byte> rxFifo = new();
    private readonly Dictionary<int, List<byte>> scheduled = new();

    public int FifoCapacity { get; }
    public uint CR { get; set; } = CrUe | CrDmarxen;
    public uint SR { get; private set; }

    public bool DmaReqRx => rxFifo.Count > 0 && (CR & CrDmarxen) != 0;
    public bool IrqRxne { get; private set; }
    public bool IrqOre { get; private set; }

    public int FifoCount => rxFifo.Count;
    public IReadOnlyList<byte> FifoSnapshot => rxFifo.ToArray();

    public event Action<string>? LogEvent;

    public Uart(int fifoCapacity = 4)
    {
        FifoCapacity = fifoCapacity;
    }

    public void Reset()
    {
        rxFifo.Clear();
        scheduled.Clear();
        CR = CrUe | CrDmarxen;
        SR = 0;
        IrqRxne = false;
        IrqOre = false;
    }

    public void ScheduleReceive(int cycle, byte data)
    {
        if (!scheduled.TryGetValue(cycle, out var list))
        {
            list = new List<byte>();
            scheduled[cycle] = list;
        }
        list.Add(data);
    }

    public void InjectRx(byte data)
    {
        if (rxFifo.Count >= FifoCapacity)
        {
            SR |= SrOre;
            IrqOre = true;
            LogEvent?.Invoke($"[UART] >>> RX OVERRUN! Lost byte 0x{data:X2} (FIFO full {rxFifo.Count}/{FifoCapacity})");
            return;
        }

        rxFifo.Enqueue(data);
        SR |= SrRxne;
        if ((CR & CrRxneie) != 0) IrqRxne = true;

        LogEvent?.Invoke($"[UART] RX <= 0x{data:X2} (FIFO: {rxFifo.Count}/{FifoCapacity}, DMAReq={DmaReqRx})");
    }

    public void Tick(int cycle)
    {
        if (scheduled.TryGetValue(cycle, out var list))
        {
            scheduled.Remove(cycle);
            foreach (var b in list)
            {
                InjectRx(b);
            }
        }

        if (rxFifo.Count == 0)
        {
            SR &= ~SrRxne;
            IrqRxne = false;
        }
    }

    public uint ReadReg(uint offset)
    {
        return offset switch
        {
            RegCr => CR,
            RegSr => SR,
            RegDr => PopRx(),
            RegCnt => (uint)rxFifo.Count,
            _ => 0
        };
    }

    private uint PopRx()
    {
        if (rxFifo.Count == 0) return 0;
        byte b = rxFifo.Dequeue();
        if (rxFifo.Count == 0)
        {
            SR &= ~SrRxne;
            IrqRxne = false;
        }
        return b;
    }

    public void WriteReg(uint offset, uint value)
    {
        switch (offset)
        {
            case RegCr:
                CR = value;
                break;
            case RegSr:
                if ((value & SrOre) == 0)
                {
                    SR &= ~SrOre;
                    IrqOre = false;
                }
                break;
        }
    }
}
