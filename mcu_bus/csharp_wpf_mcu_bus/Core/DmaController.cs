namespace McuBusWpf.Core;

public enum DmaState
{
    Idle = 0,
    WaitReq,
    ReqSrc,
    ReadLatch,
    ReqDst,
    WriteCommit,
    Update,
    Complete
}

public sealed class DmaController
{
    public const uint BaseAddress = 0x40020000U;
    public const uint RegIsr = 0x00U;
    public const uint RegIfcr = 0x04U;
    public const uint RegCcr = 0x08U;
    public const uint RegCndtr = 0x0CU;
    public const uint RegCpar = 0x10U;
    public const uint RegCmar = 0x14U;

    public const uint CcrEn = 1U << 0;
    public const uint CcrTcie = 1U << 1;
    public const uint CcrHtie = 1U << 2;
    public const uint CcrTeie = 1U << 3;
    public const uint CcrDirMask = 3U << 4;
    public const uint CcrDirP2M = 0U << 4;
    public const uint CcrDirM2P = 1U << 4;
    public const uint CcrDirP2P = 2U << 4;
    public const uint CcrCirc = 1U << 6;
    public const uint CcrPinc = 1U << 7;
    public const uint CcrMinc = 1U << 8;
    public const uint CcrPlMask = 3U << 9;

    public const uint FlagGif = 1U << 0;
    public const uint FlagTcif = 1U << 1;
    public const uint FlagHtif = 1U << 2;
    public const uint FlagTeif = 1U << 3;

    public uint ISR { get; private set; }
    public uint CCR { get; private set; }
    public uint CNDTR { get; private set; }
    public uint CPAR { get; private set; }
    public uint CMAR { get; private set; }

    public uint CndtrReload { get; private set; }
    public uint CparOrig { get; private set; }
    public uint CmarOrig { get; private set; }
    public byte DataLatch { get; private set; }
    public DmaState State { get; private set; } = DmaState.Idle;

    public bool RxReqLine { get; set; }
    public bool TxReqLine { get; set; }
    public bool IrqLine { get; private set; }

    public uint TotalTransferred { get; private set; }
    public uint BusStalls { get; private set; }
    public string LastEventMsg { get; private set; } = "DMA Initialized";

    public event Action<string>? LogEvent;

    public void Reset()
    {
        ISR = 0;
        CCR = 0;
        CNDTR = 0;
        CPAR = 0;
        CMAR = 0;
        CndtrReload = 0;
        CparOrig = 0;
        CmarOrig = 0;
        DataLatch = 0;
        State = DmaState.Idle;
        RxReqLine = false;
        TxReqLine = false;
        IrqLine = false;
        TotalTransferred = 0;
        BusStalls = 0;
        LastEventMsg = "DMA Reset";
    }

    public void Configure(uint srcAddr, uint dstAddr, uint count, uint dirMode,
                          bool circ, bool pinc, bool minc, int priority)
    {
        CPAR = srcAddr;
        CparOrig = srcAddr;
        CMAR = dstAddr;
        CmarOrig = dstAddr;
        CNDTR = count;
        CndtrReload = count;

        CCR = CcrTcie | CcrTeie | (dirMode & CcrDirMask);
        if (circ) CCR |= CcrCirc;
        if (pinc) CCR |= CcrPinc;
        if (minc) CCR |= CcrMinc;
        CCR |= ((uint)(priority & 3) << 9);

        State = DmaState.Idle;
        LastEventMsg = $"Configured: 0x{srcAddr:X8} -> 0x{dstAddr:X8} ({count} items)";
        LogEvent?.Invoke($"[DMA] {LastEventMsg}");
    }

    public void Start()
    {
        CCR |= CcrEn;
        State = DmaState.WaitReq;
        LastEventMsg = $"DMA Started, CNDTR={CNDTR}";
        LogEvent?.Invoke($"[DMA] {LastEventMsg}");
    }

    public void Stop()
    {
        CCR &= ~CcrEn;
        State = DmaState.Idle;
        LastEventMsg = "DMA Stopped";
        LogEvent?.Invoke($"[DMA] {LastEventMsg}");
    }

    public void TickHandshake(bool rxReq, bool txReq)
    {
        RxReqLine = rxReq;
        TxReqLine = txReq;

        if ((CCR & CcrEn) == 0)
        {
            if (State != DmaState.Complete) State = DmaState.Idle;
            return;
        }

        if (State == DmaState.WaitReq)
        {
            uint dir = CCR & CcrDirMask;
            bool ready = dir switch
            {
                CcrDirP2P => RxReqLine && TxReqLine,
                CcrDirP2M => RxReqLine,
                CcrDirM2P => TxReqLine,
                _ => false
            };

            if (ready)
            {
                State = DmaState.ReqSrc;
                LastEventMsg = "DREQ Trigger Active -> Requesting Bus for Source Read";
            }
        }
    }

    public void PrepareBusRequest(BusArbiter bus)
    {
        if ((CCR & CcrEn) == 0) return;

        int priority = (int)((CCR & CcrPlMask) >> 9);
        int mappedPrio = 3 - priority; /* Lower number = higher priority */

        if (State == DmaState.ReqSrc)
        {
            uint srcAddr = ((CCR & CcrDirMask) == CcrDirM2P) ? CMAR : CPAR;
            bus.RequestDma(srcAddr, false, 0, mappedPrio, "DMA Read Source");
        }
        else if (State == DmaState.ReqDst)
        {
            uint dstAddr = ((CCR & CcrDirMask) == CcrDirM2P) ? CPAR : CMAR;
            bus.RequestDma(dstAddr, true, DataLatch, mappedPrio, "DMA Write Destination");
        }
    }

    public void OnBusGranted(BusTransaction trans)
    {
        if (trans.GrantedMaster == BusMaster.Dma)
        {
            if (State == DmaState.ReqSrc)
            {
                DataLatch = (byte)(trans.RData & 0xFF);
                State = DmaState.ReqDst;
                LastEventMsg = $"Latched byte 0x{DataLatch:X2} from 0x{trans.Addr:X8}";
                LogEvent?.Invoke($"[DMA] Read Source: 0x{DataLatch:X2} (from 0x{trans.Addr:X8})");
            }
            else if (State == DmaState.ReqDst)
            {
                State = DmaState.Update;
                LastEventMsg = $"Committed 0x{DataLatch:X2} to 0x{trans.Addr:X8}";
                LogEvent?.Invoke($"[DMA] Write Dest: 0x{DataLatch:X2} (to 0x{trans.Addr:X8})");

                TotalTransferred++;
                if (CNDTR > 0) CNDTR--;

                if ((CCR & CcrPinc) != 0) CPAR++;
                if ((CCR & CcrMinc) != 0) CMAR++;

                if (CndtrReload > 1 && CNDTR == (CndtrReload / 2))
                {
                    ISR |= FlagHtif | FlagGif;
                    if ((CCR & CcrHtie) != 0) IrqLine = true;
                }

                if (CNDTR == 0)
                {
                    ISR |= FlagTcif | FlagGif;
                    if ((CCR & CcrTcie) != 0) IrqLine = true;

                    if ((CCR & CcrCirc) != 0)
                    {
                        CNDTR = CndtrReload;
                        CPAR = CparOrig;
                        CMAR = CmarOrig;
                        State = DmaState.WaitReq;
                        LastEventMsg = $"Circular Reload (CNDTR={CNDTR})";
                        LogEvent?.Invoke($"[DMA] {LastEventMsg}");
                    }
                    else
                    {
                        CCR &= ~CcrEn;
                        State = DmaState.Complete;
                        LastEventMsg = "Transfer Complete (TCIF asserted)";
                        LogEvent?.Invoke($"[DMA] >>> TRANSFER COMPLETE! (IRQ Asserted: {IrqLine})");
                    }
                }
                else
                {
                    State = DmaState.WaitReq;
                }
            }
        }
        else
        {
            if (State is DmaState.ReqSrc or DmaState.ReqDst)
            {
                BusStalls++;
                LastEventMsg = $"Bus Stalled (Arbiter granted {trans.GrantedMaster})";
                LogEvent?.Invoke($"[DMA] Stalled by bus arbiter");
            }
        }
    }

    public uint ReadReg(uint offset)
    {
        return offset switch
        {
            RegIsr => ISR,
            RegCcr => CCR,
            RegCndtr => CNDTR,
            RegCpar => CPAR,
            RegCmar => CMAR,
            _ => 0
        };
    }

    public void WriteReg(uint offset, uint value)
    {
        switch (offset)
        {
            case RegIfcr:
                if ((value & FlagGif) != 0)
                {
                    ISR = 0;
                    IrqLine = false;
                }
                else
                {
                    ISR &= ~(value & 0x0F);
                    if ((ISR & (FlagTcif | FlagHtif | FlagTeif)) == 0)
                    {
                        ISR &= ~FlagGif;
                        IrqLine = false;
                    }
                }
                break;
            case RegCcr:
                bool wasEn = (CCR & CcrEn) != 0;
                CCR = value;
                bool isEn = (CCR & CcrEn) != 0;
                if (!wasEn && isEn) State = DmaState.WaitReq;
                else if (wasEn && !isEn) State = DmaState.Idle;
                break;
            case RegCndtr:
                if ((CCR & CcrEn) == 0)
                {
                    CNDTR = value;
                    CndtrReload = value;
                }
                break;
            case RegCpar:
                if ((CCR & CcrEn) == 0)
                {
                    CPAR = value;
                    CparOrig = value;
                }
                break;
            case RegCmar:
                if ((CCR & CcrEn) == 0)
                {
                    CMAR = value;
                    CmarOrig = value;
                }
                break;
        }
    }
}
