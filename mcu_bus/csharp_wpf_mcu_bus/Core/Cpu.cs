namespace McuBusWpf.Core;

public enum CpuState
{
    Running = 0,
    Isr,
    Stalled
}

public sealed class Cpu
{
    public CpuState State { get; private set; } = CpuState.Running;
    public int CurrentIrq { get; private set; } = -1;
    public int IsrRemainingCycles { get; private set; }
    public uint PollInterval { get; }
    public uint BusStalls { get; private set; }
    public string CurrentOp { get; private set; } = "Running (Background)";
    public uint LastReadVal { get; private set; }

    public event Action<string>? LogEvent;

    public Cpu(uint pollInterval = 3)
    {
        PollInterval = pollInterval;
    }

    public void Reset()
    {
        State = CpuState.Running;
        CurrentIrq = -1;
        IsrRemainingCycles = 0;
        BusStalls = 0;
        CurrentOp = "Running (Background)";
        LastReadVal = 0;
    }

    public void PrepareBusRequest(BusArbiter bus, Nvic nvic, int cycle)
    {
        if (State == CpuState.Isr)
        {
            if (CurrentIrq == Nvic.IrqDma1Ch1)
            {
                bus.RequestCpu(DmaController.BaseAddress + DmaController.RegIfcr, true,
                               DmaController.FlagTcif | DmaController.FlagGif, 1, "CPU ISR: Clear DMA TC Flag");
                return;
            }
            if (CurrentIrq == Nvic.IrqUartOre)
            {
                bus.RequestCpu(Uart.BaseAddress + Uart.RegSr, true, 0, 1, "CPU ISR: Clear UART ORE");
                return;
            }
        }

        if (cycle % PollInterval == 0)
        {
            bus.RequestCpu(I2c.BaseAddress + I2c.RegSr, false, 0, 2, "CPU: Poll I2C Status");
        }
    }

    public void OnBusGranted(BusTransaction trans)
    {
        if (trans.GrantedMaster == BusMaster.Cpu)
        {
            LastReadVal = trans.RData;
            CurrentOp = $"Op Done: {trans.Description} (Data=0x{(trans.IsWrite ? trans.WData : trans.RData):X2})";
            LogEvent?.Invoke($"[CPU] {CurrentOp}");
        }
        else
        {
            BusStalls++;
            CurrentOp = "Bus Stalled (DMA Preempted)";
            LogEvent?.Invoke($"[CPU] Bus stalled by DMA");
        }
    }

    public void Tick(Nvic nvic, int cycle)
    {
        if (State == CpuState.Isr)
        {
            IsrRemainingCycles--;
            if (IsrRemainingCycles <= 0)
            {
                LogEvent?.Invoke($"[CPU] <<< EXIT ISR: IRQ {CurrentIrq}");
                nvic.Complete(CurrentIrq);
                CurrentIrq = -1;
                State = CpuState.Running;
                CurrentOp = "Running (Background)";
            }
            return;
        }

        int irq = nvic.Acknowledge();
        if (irq >= 0)
        {
            State = CpuState.Isr;
            CurrentIrq = irq;
            IsrRemainingCycles = 2;
            string irqName = irq switch
            {
                Nvic.IrqDma1Ch1 => "DMA1 TC",
                Nvic.IrqUartOre => "UART Overrun",
                Nvic.IrqUartRxne => "UART RXNE",
                _ => "I2C TXE"
            };
            LogEvent?.Invoke($"[CPU] >>> ENTER ISR: IRQ {irq} ({irqName})");
            CurrentOp = $"Executing ISR (IRQ {irq})";
        }
    }
}
