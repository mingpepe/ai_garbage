using System;
using System.Collections.Generic;
using System.Threading;

namespace DualCoreSoC;

/// <summary>
/// RV32IMA_Zicsr Processor Core Emulator (matches rtl/riscv_core.v).
/// Runs on its own dedicated C# Thread in Dual-Core SoC simulation or under GDB control.
/// </summary>
public sealed class RiscVCore
{
    public int HartId { get; }
    private readonly SoCBus _bus;

    public readonly uint[] Regs = new uint[32];
    public uint Pc;
    public uint LastInstr;
    public bool BootActive;
    public bool InTrap;
    public bool InWfi;

    // CSR Registers (matches rtl/riscv_core.v)
    public uint CsrMstatus;   // 0x300 (bit 3 = MIE, bit 7 = MPIE)
    public uint CsrMie;       // 0x304 (bit 3 = MSIE)
    public uint CsrMtvec;     // 0x305
    public uint CsrMscratch;  // 0x340
    public uint CsrMepc;      // 0x341
    public uint CsrMcause;    // 0x342
    public uint CsrMcycle;    // 0xB00
    public uint CsrMinstret;  // 0xB02

    // GDB Debugging State
    public readonly HashSet<uint> Breakpoints = new();
    public volatile bool GdbHalted = false;

    public RiscVCore(int hartId, SoCBus bus)
    {
        HartId = hartId;
        _bus   = bus;
        Reset();
    }

    public void Reset()
    {
        Array.Clear(Regs, 0, Regs.Length);
        Pc          = (HartId == 0) ? _bus.Core0BootAddr : _bus.Core1BootAddr;
        LastInstr   = 0x0000_0013; // NOP
        BootActive  = (HartId == 0) ? _bus.Core0BootEn   : _bus.Core1BootEn;
        InTrap      = false;
        InWfi       = false;
        CsrMstatus  = 0;
        CsrMie      = 0;
        CsrMtvec    = 0;
        CsrMscratch = 0;
        CsrMepc     = 0;
        CsrMcause   = 0;
        CsrMcycle   = 0;
        CsrMinstret = 0;
    }

    public bool IrqSoftwarePending =>
        (HartId == 0) ? _bus.IrqSoftwareCore0 : _bus.IrqSoftwareCore1;

    /// <summary>
    /// Executes a single architectural cycle/step of the core (matches rtl/riscv_core.v FSM).
    /// Returns true if an instruction or interrupt was executed, false if halted or waiting in WFI.
    /// </summary>
    public bool Step(out bool hitTrapOrBreak)
    {
        hitTrapOrBreak = false;
        Regs[0] = 0;

        // 1. Check Boot State (S_HALT in Verilog)
        if (!BootActive)
        {
            bool bootEn = (HartId == 0) ? _bus.Core0BootEn : _bus.Core1BootEn;
            if (!bootEn)
            {
                Pc = (HartId == 0) ? _bus.Core0BootAddr : _bus.Core1BootAddr;
                return false;
            }
            Pc = (HartId == 0) ? _bus.Core0BootAddr : _bus.Core1BootAddr;
            BootActive = true;
        }

        CsrMcycle++;
        _bus.IncrementCycle();

        bool irqSw   = IrqSoftwarePending;
        bool msie    = (CsrMie & (1u << 3)) != 0;
        bool mie     = (CsrMstatus & (1u << 3)) != 0;

        // 2. Check WFI Wakeup condition (S_WFI in Verilog: ignores mstatus.MIE)
        if (InWfi)
        {
            if (irqSw && msie)
            {
                InWfi = false;
                Pc += 4;
                CsrMinstret++;
            }
            else
            {
                return false;
            }
        }

        // 3. Check pending Machine Software Interrupt (IPI) before fetching next instruction
        if (irqSw && msie && mie)
        {
            CsrMepc    = Pc;
            CsrMcause  = 0x8000_0003u; // Machine Software Interrupt
            // MPIE (bit 7) <= MIE (bit 3); MIE (bit 3) <= 0
            CsrMstatus = (CsrMstatus & ~((1u << 7) | (1u << 3))) | ((mie ? 1u : 0u) << 7);
            Pc         = CsrMtvec & ~3u;
            InTrap     = true;
        }

        // 4. Fetch 32-bit instruction from bus
        uint instr = _bus.Load(HartId, Pc, 4, false);
        LastInstr  = instr;

        uint opcode = instr & 0x7Fu;
        uint rd     = (instr >> 7)  & 0x1Fu;
        uint funct3 = (instr >> 12) & 0x07u;
        uint rs1    = (instr >> 15) & 0x1Fu;
        uint rs2    = (instr >> 20) & 0x1Fu;
        uint funct7 = (instr >> 25) & 0x7Fu;
        uint funct5 = (instr >> 27) & 0x1Fu;
        uint csrId  = (instr >> 20) & 0xFFFu;

        uint rs1Val = (rs1 == 0) ? 0u : Regs[rs1];
        uint rs2Val = (rs2 == 0) ? 0u : Regs[rs2];

        uint immI = (uint)((int)instr >> 20);
        uint immS = (uint)(((int)(instr & 0xFE000000u) >> 20) | (int)((instr >> 7) & 0x1Fu));
        uint immB = (uint)(((int)(instr & 0x80000000u) >> 19)
                         | ((int)(instr & 0x80u) << 4)
                         | (int)((instr >> 20) & 0x7E0u)
                         | (int)((instr >> 7)  & 0x1Eu));
        uint immU = instr & 0xFFFFF000u;
        uint immJ = (uint)(((int)(instr & 0x80000000u) >> 11)
                         | (int)(instr & 0xFF000u)
                         | (int)((instr >> 9)  & 0x800u)
                         | (int)((instr >> 20) & 0x7FEu));

        uint nextPc = Pc + 4;

        switch (opcode)
        {
            case 0b0110111: // LUI
                if (rd != 0) Regs[rd] = immU;
                break;

            case 0b0010111: // AUIPC
                if (rd != 0) Regs[rd] = Pc + immU;
                break;

            case 0b1101111: // JAL
                if (rd != 0) Regs[rd] = Pc + 4;
                nextPc = Pc + immJ;
                break;

            case 0b1100111: // JALR
                if (rd != 0) Regs[rd] = Pc + 4;
                nextPc = (rs1Val + immI) & ~1u;
                break;

            case 0b1100011: // BRANCH
            {
                bool taken = funct3 switch
                {
                    0b000 => rs1Val == rs2Val,
                    0b001 => rs1Val != rs2Val,
                    0b100 => (int)rs1Val <  (int)rs2Val,
                    0b101 => (int)rs1Val >= (int)rs2Val,
                    0b110 => rs1Val <  rs2Val,
                    0b111 => rs1Val >= rs2Val,
                    _     => false
                };
                if (taken) nextPc = Pc + immB;
                break;
            }

            case 0b0000011: // LOAD
            {
                uint addr = rs1Val + immI;
                uint val = funct3 switch
                {
                    0b000 => _bus.Load(HartId, addr, 1, true),  // LB
                    0b001 => _bus.Load(HartId, addr, 2, true),  // LH
                    0b010 => _bus.Load(HartId, addr, 4, false), // LW
                    0b100 => _bus.Load(HartId, addr, 1, false), // LBU
                    0b101 => _bus.Load(HartId, addr, 2, false), // LHU
                    _     => _bus.Load(HartId, addr, 4, false)
                };
                if (rd != 0) Regs[rd] = val;
                break;
            }

            case 0b0100011: // STORE
            {
                uint addr = rs1Val + immS;
                int size = funct3 switch
                {
                    0b000 => 1, // SB
                    0b001 => 2, // SH
                    _     => 4  // SW
                };
                _bus.Store(HartId, addr, rs2Val, size);
                break;
            }

            case 0b0010011: // OP-IMM
            case 0b0110011: // OP & RV32M
            {
                uint aluB = (opcode == 0b0110011) ? rs2Val : immI;
                uint res  = ExecuteAlu(opcode, funct3, funct7, rs1Val, aluB);
                if (rd != 0) Regs[rd] = res;
                break;
            }

            case 0b0101111: // AMO (RV32A Atomic Instructions)
            {
                uint oldVal = _bus.AtomicOp(HartId, rs1Val, rs2Val, funct5);
                if (rd != 0) Regs[rd] = oldVal;
                break;
            }

            case 0b0001111: // FENCE / FENCE.I
                Thread.MemoryBarrier();
                Thread.Yield();
                break;

            case 0b1110011: // SYSTEM / CSR
            {
                if (funct3 == 0)
                {
                    if (instr == 0x3020_0073u) // MRET
                    {
                        nextPc = CsrMepc;
                        uint mpie = (CsrMstatus >> 7) & 1u;
                        CsrMstatus = (CsrMstatus & ~((1u << 7) | (1u << 3))) | (1u << 7) | (mpie << 3);
                        InTrap = false;
                    }
                    else if (instr == 0x1050_0073u) // WFI
                    {
                        if (IrqSoftwarePending && ((CsrMie & (1u << 3)) != 0))
                        {
                            nextPc = Pc + 4;
                        }
                        else
                        {
                            InWfi = true;
                            return false;
                        }
                    }
                    else if (instr == 0x0010_0073u) // EBREAK
                    {
                        hitTrapOrBreak = true;
                        return true;
                    }
                }
                else
                {
                    uint oldCsr = ReadCsr(csrId);
                    uint src    = ((funct3 & 0b100) != 0) ? rs1 : rs1Val;
                    uint newCsr = (funct3 & 0b011) switch
                    {
                        0b01 => src,
                        0b10 => oldCsr | src,
                        0b11 => oldCsr & ~src,
                        _    => oldCsr
                    };
                    if (rd != 0) Regs[rd] = oldCsr;
                    WriteCsr(csrId, newCsr);
                }
                break;
            }
        }

        Regs[0] = 0;
        Pc = nextPc;
        CsrMinstret++;
        return true;
    }

    private static uint ExecuteAlu(uint opcode, uint funct3, uint funct7, uint a, uint b)
    {
        if (opcode == 0b0110011 && funct7 == 0b0000001)
        {
            // RV32M Extension
            return funct3 switch
            {
                0b000 => (uint)((int)a * (int)b),                                               // MUL
                0b001 => (uint)(((long)(int)a * (long)(int)b) >> 32),                           // MULH
                0b010 => (uint)(((long)(int)a * (long)(ulong)b) >> 32),                         // MULHSU
                0b011 => (uint)(((ulong)a * (ulong)b) >> 32),                                   // MULHU
                0b100 => (b == 0) ? 0xFFFF_FFFFu :
                         (a == 0x8000_0000u && b == 0xFFFF_FFFFu) ? 0x8000_0000u :
                         (uint)((int)a / (int)b),                                               // DIV
                0b101 => (b == 0) ? 0xFFFF_FFFFu : (a / b),                                     // DIVU
                0b110 => (b == 0) ? a :
                         (a == 0x8000_0000u && b == 0xFFFF_FFFFu) ? 0u :
                         (uint)((int)a % (int)b),                                               // REM
                0b111 => (b == 0) ? a : (a % b),                                                // REMU
                _     => 0u
            };
        }

        int shamt = (int)(b & 0x1Fu);
        return funct3 switch
        {
            0b000 => (opcode == 0b0110011 && (funct7 & 0x20) != 0) ? (a - b) : (a + b), // ADD / SUB
            0b001 => a << shamt,                                                        // SLL
            0b010 => ((int)a < (int)b) ? 1u : 0u,                                       // SLT
            0b011 => (a < b) ? 1u : 0u,                                                 // SLTU
            0b100 => a ^ b,                                                             // XOR
            0b101 => ((funct7 & 0x20) != 0) ? (uint)((int)a >> shamt) : (a >> shamt),   // SRA / SRL
            0b110 => a | b,                                                             // OR
            0b111 => a & b,                                                             // AND
            _     => 0u
        };
    }

    public uint ReadCsr(uint csrId)
    {
        return csrId switch
        {
            0x300 => CsrMstatus,
            0x304 => CsrMie,
            0x305 => CsrMtvec,
            0x340 => CsrMscratch,
            0x341 => CsrMepc,
            0x342 => CsrMcause,
            0x344 => IrqSoftwarePending ? (1u << 3) : 0u,
            0xB00 => CsrMcycle,
            0xB02 => CsrMinstret,
            0xF14 => (uint)HartId,
            _     => 0u
        };
    }

    public void WriteCsr(uint csrId, uint val)
    {
        switch (csrId)
        {
            case 0x300: CsrMstatus  = val; break;
            case 0x304: CsrMie      = val; break;
            case 0x305: CsrMtvec    = val; break;
            case 0x340: CsrMscratch = val; break;
            case 0x341: CsrMepc     = val; break;
            case 0x342: CsrMcause   = val; break;
        }
    }
}
