namespace McuBusWpf.Core;

public sealed class Nvic
{
    public const uint BaseAddress = 0xE000E100U;
    public const int IrqUartRxne = 0;
    public const int IrqUartOre = 1;
    public const int IrqI2cTxe = 2;
    public const int IrqDma1Ch1 = 3;
    public const int IrqCount = 4;

    public uint ISER { get; private set; } = 0xFFFFFFFFU;
    public uint ISPR { get; private set; }
    public uint IABR { get; private set; }

    public void Reset()
    {
        ISER = 0xFFFFFFFFU;
        ISPR = 0;
        IABR = 0;
    }

    public void SetPending(int irq)
    {
        if (irq is >= 0 and < IrqCount)
        {
            ISPR |= (1U << irq);
        }
    }

    public void ClearPending(int irq)
    {
        if (irq is >= 0 and < IrqCount)
        {
            ISPR &= ~(1U << irq);
        }
    }

    public int Acknowledge()
    {
        uint activePending = ISPR & ISER;
        if (activePending == 0) return -1;

        for (int i = 0; i < IrqCount; i++)
        {
            if ((activePending & (1U << i)) != 0)
            {
                ISPR &= ~(1U << i);
                IABR |= (1U << i);
                return i;
            }
        }
        return -1;
    }

    public void Complete(int irq)
    {
        if (irq is >= 0 and < IrqCount)
        {
            IABR &= ~(1U << irq);
        }
    }

    public uint ReadReg(uint offset)
    {
        return offset switch
        {
            0x00 => ISER,
            0x04 => ISER,
            0x08 => ISPR,
            0x0C => ISPR,
            0x10 => IABR,
            _ => 0
        };
    }

    public void WriteReg(uint offset, uint value)
    {
        switch (offset)
        {
            case 0x00: ISER |= value; break;
            case 0x04: ISER &= ~value; break;
            case 0x08: ISPR |= value; break;
            case 0x0C: ISPR &= ~value; break;
        }
    }
}
