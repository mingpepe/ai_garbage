namespace McuBusWpf.Core;

public enum BusMaster
{
    None = 0,
    Cpu = 1,
    Dma = 2
}

public sealed class BusRequest
{
    public BusMaster Master { get; set; }
    public uint Addr { get; set; }
    public bool IsWrite { get; set; }
    public uint WData { get; set; }
    public int Priority { get; set; } /* Lower number = higher priority */
    public string OperationName { get; set; } = string.Empty;
}

public sealed class BusTransaction
{
    public BusMaster GrantedMaster { get; set; } = BusMaster.None;
    public uint Addr { get; set; }
    public bool IsWrite { get; set; }
    public uint WData { get; set; }
    public uint RData { get; set; }
    public bool Active { get; set; }
    public string Description { get; set; } = "Idle";
}

public sealed class BusArbiter
{
    public int Cycle { get; private set; }
    public BusMaster LastGranted { get; private set; } = BusMaster.None;
    public BusRequest? CpuReq { get; private set; }
    public BusRequest? DmaReq { get; private set; }
    public BusTransaction LastTransaction { get; private set; } = new();

    public uint TotalCycles { get; private set; }
    public uint IdleCycles { get; private set; }
    public uint CpuGrants { get; private set; }
    public uint DmaGrants { get; private set; }
    public uint BusContentions { get; private set; }

    public void Reset()
    {
        Cycle = 0;
        LastGranted = BusMaster.None;
        CpuReq = null;
        DmaReq = null;
        LastTransaction = new();
        TotalCycles = 0;
        IdleCycles = 0;
        CpuGrants = 0;
        DmaGrants = 0;
        BusContentions = 0;
    }

    public void BeginCycle(int cycle)
    {
        Cycle = cycle;
        TotalCycles++;
        CpuReq = null;
        DmaReq = null;
        LastTransaction = new();
    }

    public void RequestCpu(uint addr, bool isWrite, uint wdata, int priority, string opName)
    {
        CpuReq = new BusRequest
        {
            Master = BusMaster.Cpu,
            Addr = addr,
            IsWrite = isWrite,
            WData = wdata,
            Priority = priority,
            OperationName = opName
        };
    }

    public void RequestDma(uint addr, bool isWrite, uint wdata, int priority, string opName)
    {
        DmaReq = new BusRequest
        {
            Master = BusMaster.Dma,
            Addr = addr,
            IsWrite = isWrite,
            WData = wdata,
            Priority = priority,
            OperationName = opName
        };
    }

    public BusTransaction Commit(McuSystem sys)
    {
        var trans = new BusTransaction();
        bool cpuWants = CpuReq != null;
        bool dmaWants = DmaReq != null;

        if (!cpuWants && !dmaWants)
        {
            IdleCycles++;
            trans.GrantedMaster = BusMaster.None;
            trans.Active = false;
            trans.Description = "Bus Idle";
            LastTransaction = trans;
            return trans;
        }

        BusMaster winner;
        BusRequest winReq;

        if (cpuWants && !dmaWants)
        {
            winner = BusMaster.Cpu;
            winReq = CpuReq!;
        }
        else if (!cpuWants && dmaWants)
        {
            winner = BusMaster.Dma;
            winReq = DmaReq!;
        }
        else
        {
            /* Contention */
            BusContentions++;
            if (DmaReq!.Priority < CpuReq!.Priority)
            {
                winner = BusMaster.Dma;
                winReq = DmaReq;
            }
            else if (CpuReq.Priority < DmaReq.Priority)
            {
                winner = BusMaster.Cpu;
                winReq = CpuReq;
            }
            else
            {
                /* Round-Robin */
                if (LastGranted == BusMaster.Dma)
                {
                    winner = BusMaster.Cpu;
                    winReq = CpuReq;
                }
                else
                {
                    winner = BusMaster.Dma;
                    winReq = DmaReq;
                }
            }
        }

        trans.GrantedMaster = winner;
        trans.Active = true;
        trans.Addr = winReq.Addr;
        trans.IsWrite = winReq.IsWrite;
        trans.WData = winReq.WData;
        trans.Description = winReq.OperationName;

        if (trans.IsWrite)
        {
            sys.BusWrite(trans.Addr, trans.WData);
        }
        else
        {
            trans.RData = sys.BusRead(trans.Addr);
        }

        if (winner == BusMaster.Dma) DmaGrants++;
        else if (winner == BusMaster.Cpu) CpuGrants++;

        LastGranted = winner;
        LastTransaction = trans;

        if (dmaWants) sys.Dma.OnBusGranted(trans);
        if (cpuWants) sys.Cpu.OnBusGranted(trans);

        return trans;
    }
}
