namespace McuBusWpf.Core;

public sealed class McuSystem
{
    public int Cycle { get; private set; } = 1;
    public BusArbiter Bus { get; } = new();
    public Sram Sram { get; } = new();
    public Uart Uart { get; } = new(4);
    public I2c I2c { get; } = new(2, 4);
    public Nvic Nvic { get; } = new();
    public DmaController Dma { get; } = new();
    public Cpu Cpu { get; } = new(3);

    private bool prevOre;
    private bool prevDmaIrq;

    public event Action<string>? SystemLog;

    public McuSystem()
    {
        Uart.LogEvent += msg => SystemLog?.Invoke(msg);
        I2c.LogEvent += msg => SystemLog?.Invoke(msg);
        Dma.LogEvent += msg => SystemLog?.Invoke(msg);
        Cpu.LogEvent += msg => SystemLog?.Invoke(msg);
    }

    public void Reset()
    {
        Cycle = 1;
        Bus.Reset();
        Sram.Reset();
        Uart.Reset();
        I2c.Reset();
        Nvic.Reset();
        Dma.Reset();
        Cpu.Reset();
        prevOre = false;
        prevDmaIrq = false;
        SystemLog?.Invoke("[SYSTEM] MCU System reset to cycle 1.");
    }

    public uint BusRead(uint addr)
    {
        if (addr is >= Sram.BaseAddress and < (Sram.BaseAddress + Sram.Size))
            return Sram.Read(addr);

        if (addr is >= Uart.BaseAddress and < (Uart.BaseAddress + 0x100))
            return Uart.ReadReg(addr - Uart.BaseAddress);

        if (addr is >= I2c.BaseAddress and < (I2c.BaseAddress + 0x100))
            return I2c.ReadReg(addr - I2c.BaseAddress);

        if (addr is >= DmaController.BaseAddress and < (DmaController.BaseAddress + 0x100))
            return Dma.ReadReg(addr - DmaController.BaseAddress);

        if (addr is >= Nvic.BaseAddress and < (Nvic.BaseAddress + 0x100))
            return Nvic.ReadReg(addr - Nvic.BaseAddress);

        return 0;
    }

    public void BusWrite(uint addr, uint data)
    {
        if (addr is >= Sram.BaseAddress and < (Sram.BaseAddress + Sram.Size))
        {
            Sram.Write(addr, data);
            return;
        }

        if (addr is >= Uart.BaseAddress and < (Uart.BaseAddress + 0x100))
        {
            Uart.WriteReg(addr - Uart.BaseAddress, data);
            return;
        }

        if (addr is >= I2c.BaseAddress and < (I2c.BaseAddress + 0x100))
        {
            I2c.WriteReg(addr - I2c.BaseAddress, data);
            return;
        }

        if (addr is >= DmaController.BaseAddress and < (DmaController.BaseAddress + 0x100))
        {
            Dma.WriteReg(addr - DmaController.BaseAddress, data);
            return;
        }

        if (addr is >= Nvic.BaseAddress and < (Nvic.BaseAddress + 0x100))
        {
            Nvic.WriteReg(addr - Nvic.BaseAddress, data);
            return;
        }
    }

    public BusTransaction Step()
    {
        int currentCycle = Cycle;

        /* 1. Bus start */
        Bus.BeginCycle(currentCycle);

        /* 2. Clock peripherals */
        Uart.Tick(currentCycle);
        I2c.Tick();

        /* 3. Interrupt edge detection */
        if (Uart.IrqOre && !prevOre)
        {
            Nvic.SetPending(Nvic.IrqUartOre);
        }
        prevOre = Uart.IrqOre;

        if (Dma.IrqLine && !prevDmaIrq)
        {
            Nvic.SetPending(Nvic.IrqDma1Ch1);
        }
        prevDmaIrq = Dma.IrqLine;

        /* 4. DMA Handshake synchronization */
        Dma.TickHandshake(Uart.DmaReqRx, I2c.DmaReqTx);

        /* 5. Prepare master bus requests */
        Cpu.PrepareBusRequest(Bus, Nvic, currentCycle);
        Dma.PrepareBusRequest(Bus);

        /* 6. Commit bus */
        var trans = Bus.Commit(this);

        /* 7. CPU executes ISR / instructions */
        Cpu.Tick(Nvic, currentCycle);

        Cycle++;
        return trans;
    }
}
