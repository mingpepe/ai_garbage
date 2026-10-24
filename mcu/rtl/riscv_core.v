`timescale 1ns / 1ps

// ============================================================================
// RV32IMA_Zicsr Processor Core with Machine-Mode Software Interrupt (IPI)
// Supports:
//   - RV32I Base Integer Instructions
//   - RV32M Integer Multiply/Divide Extension
//   - RV32A Atomic Extension (LR.W, SC.W, AMOSWAP.W, AMOADD.W, AMOXOR.W,
//     AMOAND.W, AMOOR.W, AMOMIN.W, AMOMAX.W, AMOMINU.W, AMOMAXU.W)
//   - Zicsr & Machine Trap Architecture (CSRRW/S/C/I, MRET, WFI, MSIP IPI)
// ============================================================================
module riscv_core #(
    parameter [31:0] HART_ID = 32'd0
)(
    input  wire        clk,
    input  wire        rst_n,

    // Boot Control
    input  wire        boot_en,
    input  wire [31:0] boot_addr,

    // Inter-Processor Interrupt (CLINT MSIP)
    input  wire        irq_software,

    // Unified Bus Master Interface
    output reg         bus_req,
    output reg         bus_we,
    output reg  [3:0]  bus_wstrb,
    output reg  [31:0] bus_addr,
    output reg  [31:0] bus_wdata,
    output reg         bus_is_amo,
    output reg  [4:0]  bus_amo_op,
    input  wire        bus_ready,
    input  wire [31:0] bus_rdata,

    // Debug / Waveform Observation Ports
    output reg  [31:0] dbg_pc,
    output reg  [31:0] dbg_instr,
    output wire        dbg_boot_active,
    output reg         dbg_in_trap,
    output wire        dbg_wfi
);

    localparam [2:0] S_HALT  = 3'd0,
                     S_FETCH = 3'd1,
                     S_EXEC  = 3'd2,
                     S_MEM   = 3'd3,
                     S_WFI   = 3'd4;

    reg [2:0]  state;
    reg [31:0] pc;
    reg [31:0] instr;
    reg [31:0] regs [0:31];

    // Latched memory request registers for S_MEM
    reg [31:0] mem_addr_r;
    reg [31:0] mem_wdata_r;
    reg [3:0]  mem_wstrb_r;
    reg        mem_we_r;
    reg        mem_is_amo_r;
    reg [4:0]  mem_amo_op_r;
    reg [4:0]  mem_rd_r;
    reg [2:0]  mem_funct3_r;

    // CSR Registers
    reg [31:0] csr_mstatus;   // 0x300: bit 3 = MIE, bit 7 = MPIE
    reg [31:0] csr_mie;       // 0x304: bit 3 = MSIE
    reg [31:0] csr_mtvec;     // 0x305: Trap vector base address
    reg [31:0] csr_mscratch;  // 0x340
    reg [31:0] csr_mepc;      // 0x341
    reg [31:0] csr_mcause;    // 0x342
    reg [31:0] csr_mcycle;    // 0xB00
    reg [31:0] csr_minstret;  // 0xB02

    assign dbg_boot_active = (state != S_HALT);
    assign dbg_wfi         = (state == S_WFI);

    // Instruction Fields
    wire [6:0] opcode = instr[6:0];
    wire [4:0] rd     = instr[11:7];
    wire [2:0] funct3 = instr[14:12];
    wire [4:0] rs1    = instr[19:15];
    wire [4:0] rs2    = instr[24:20];
    wire [6:0] funct7 = instr[31:25];
    wire [4:0] funct5 = instr[31:27];
    wire [11:0] csr_id = instr[31:20];

    wire [31:0] rs1_val = (rs1 == 5'd0) ? 32'd0 : regs[rs1];
    wire [31:0] rs2_val = (rs2 == 5'd0) ? 32'd0 : regs[rs2];

    // Immediate Generators
    wire [31:0] imm_i = {{20{instr[31]}}, instr[31:20]};
    wire [31:0] imm_s = {{20{instr[31]}}, instr[31:25], instr[11:7]};
    wire [31:0] imm_b = {{19{instr[31]}}, instr[31], instr[7], instr[30:25], instr[11:8], 1'b0};
    wire [31:0] imm_u = {instr[31:12], 12'b0};
    wire [31:0] imm_j = {{11{instr[31]}}, instr[31], instr[19:12], instr[20], instr[30:21], 1'b0};

    // Pending interrupt check
    wire irq_pending = irq_software && csr_mie[3] && csr_mstatus[3];

    // Branch comparator
    reg branch_taken;
    always @(*) begin
        case (funct3)
            3'b000: branch_taken = (rs1_val == rs2_val);
            3'b001: branch_taken = (rs1_val != rs2_val);
            3'b100: branch_taken = ($signed(rs1_val) <  $signed(rs2_val));
            3'b101: branch_taken = ($signed(rs1_val) >= $signed(rs2_val));
            3'b110: branch_taken = (rs1_val <  rs2_val);
            3'b111: branch_taken = (rs1_val >= rs2_val);
            default: branch_taken = 1'b0;
        endcase
    end

    // ALU & RV32M computation
    wire [31:0] alu_b = (opcode == 7'b0110011) ? rs2_val : imm_i;
    wire [4:0]  shamt = alu_b[4:0];
    wire        is_m_ext = (opcode == 7'b0110011) && (funct7 == 7'b0000001);

    wire signed [63:0] mul_ss = $signed(rs1_val) * $signed(rs2_val);
    wire signed [63:0] mul_su = $signed({rs1_val[31], rs1_val}) * $signed({1'b0, rs2_val});
    wire        [63:0] mul_uu = {32'd0, rs1_val} * {32'd0, rs2_val};

    reg [31:0] alu_res;
    always @(*) begin
        if (is_m_ext) begin
            case (funct3)
                3'b000: alu_res = mul_ss[31:0];  // MUL
                3'b001: alu_res = mul_ss[63:32]; // MULH
                3'b010: alu_res = mul_su[63:32]; // MULHSU
                3'b011: alu_res = mul_uu[63:32]; // MULHU
                3'b100: alu_res = (rs2_val == 32'd0) ? 32'hFFFF_FFFF :
                                  ((rs1_val == 32'h8000_0000 && rs2_val == 32'hFFFF_FFFF) ? 32'h8000_0000 :
                                   $signed(rs1_val) / $signed(rs2_val)); // DIV
                3'b101: alu_res = (rs2_val == 32'd0) ? 32'hFFFF_FFFF : (rs1_val / rs2_val); // DIVU
                3'b110: alu_res = (rs2_val == 32'd0) ? rs1_val :
                                  ((rs1_val == 32'h8000_0000 && rs2_val == 32'hFFFF_FFFF) ? 32'd0 :
                                   $signed(rs1_val) % $signed(rs2_val)); // REM
                3'b111: alu_res = (rs2_val == 32'd0) ? rs1_val : (rs1_val % rs2_val); // REMU
            endcase
        end else begin
            case (funct3)
                3'b000: begin
                    if (opcode == 7'b0110011 && funct7[5])
                        alu_res = rs1_val - rs2_val; // SUB
                    else
                        alu_res = rs1_val + alu_b;   // ADD / ADDI
                end
                3'b001: alu_res = rs1_val << shamt;  // SLL / SLLI
                3'b010: alu_res = ($signed(rs1_val) < $signed(alu_b)) ? 32'd1 : 32'd0; // SLT / SLTI
                3'b011: alu_res = (rs1_val < alu_b) ? 32'd1 : 32'd0;                   // SLTU / SLTIU
                3'b100: alu_res = rs1_val ^ alu_b;   // XOR / XORI
                3'b101: begin
                    if (funct7[5])
                        alu_res = $signed(rs1_val) >>> shamt; // SRA / SRAI
                    else
                        alu_res = rs1_val >> shamt;           // SRL / SRLI
                end
                3'b110: alu_res = rs1_val | alu_b;   // OR / ORI
                3'b111: alu_res = rs1_val & alu_b;   // AND / ANDI
            endcase
        end
    end

    // CSR Read Multiplexer
    reg [31:0] csr_rdata;
    always @(*) begin
        case (csr_id)
            12'h300: csr_rdata = csr_mstatus;
            12'h304: csr_rdata = csr_mie;
            12'h305: csr_rdata = csr_mtvec;
            12'h340: csr_rdata = csr_mscratch;
            12'h341: csr_rdata = csr_mepc;
            12'h342: csr_rdata = csr_mcause;
            12'h344: csr_rdata = {28'd0, irq_software, 3'd0}; // mip.MSIP at bit 3
            12'hB00: csr_rdata = csr_mcycle;
            12'hB02: csr_rdata = csr_minstret;
            12'hF14: csr_rdata = HART_ID;
            default: csr_rdata = 32'd0;
        endcase
    end

    wire [31:0] csr_src = funct3[2] ? {27'd0, rs1} : rs1_val;
    reg  [31:0] csr_wdata;
    always @(*) begin
        case (funct3[1:0])
            2'b01: csr_wdata = csr_src;             // CSRRW / CSRRWI
            2'b10: csr_wdata = csr_rdata | csr_src; // CSRRS / CSRRSI
            2'b11: csr_wdata = csr_rdata & ~csr_src;// CSRRC / CSRRCI
            default: csr_wdata = csr_rdata;
        endcase
    end

    // Load data alignment & sign extension
    reg [31:0] load_val;
    wire [7:0]  load_byte = (mem_addr_r[1:0] == 2'd0) ? bus_rdata[ 7: 0] :
                            (mem_addr_r[1:0] == 2'd1) ? bus_rdata[15: 8] :
                            (mem_addr_r[1:0] == 2'd2) ? bus_rdata[23:16] :
                                                        bus_rdata[31:24];
    wire [15:0] load_half = mem_addr_r[1] ? bus_rdata[31:16] : bus_rdata[15:0];

    always @(*) begin
        case (mem_funct3_r)
            3'b000: load_val = {{24{load_byte[7]}}, load_byte}; // LB
            3'b001: load_val = {{16{load_half[15]}}, load_half};// LH
            3'b010: load_val = bus_rdata;                       // LW
            3'b100: load_val = {24'd0, load_byte};              // LBU
            3'b101: load_val = {16'd0, load_half};              // LHU
            default: load_val = bus_rdata;
        endcase
    end

    // Store data lane alignment
    wire [31:0] calc_store_addr = rs1_val + imm_s;
    reg  [3:0]  calc_store_wstrb;
    reg  [31:0] calc_store_wdata;
    always @(*) begin
        case (funct3)
            3'b000: begin // SB
                calc_store_wstrb = 4'b0001 << calc_store_addr[1:0];
                calc_store_wdata = {4{rs2_val[7:0]}};
            end
            3'b001: begin // SH
                calc_store_wstrb = calc_store_addr[1] ? 4'b1100 : 4'b0011;
                calc_store_wdata = {2{rs2_val[15:0]}};
            end
            default: begin // SW
                calc_store_wstrb = 4'b1111;
                calc_store_wdata = rs2_val;
            end
        endcase
    end

    // Bus output control based on current state
    always @(*) begin
        bus_req    = 1'b0;
        bus_we     = 1'b0;
        bus_wstrb  = 4'b0000;
        bus_addr   = 32'd0;
        bus_wdata  = 32'd0;
        bus_is_amo = 1'b0;
        bus_amo_op = 5'd0;

        if (state == S_FETCH && !irq_pending) begin
            bus_req   = 1'b1;
            bus_addr  = pc;
        end else if (state == S_MEM) begin
            bus_req    = 1'b1;
            bus_we     = mem_we_r;
            bus_wstrb  = mem_wstrb_r;
            bus_addr   = mem_addr_r;
            bus_wdata  = mem_wdata_r;
            bus_is_amo = mem_is_amo_r;
            bus_amo_op = mem_amo_op_r;
        end
    end

    integer i;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state        <= S_HALT;
            pc           <= 32'd0;
            instr        <= 32'h0000_0013; // NOP
            dbg_pc       <= 32'd0;
            dbg_instr    <= 32'h0000_0013;
            dbg_in_trap  <= 1'b0;

            mem_addr_r   <= 32'd0;
            mem_wdata_r  <= 32'd0;
            mem_wstrb_r  <= 4'd0;
            mem_we_r     <= 1'b0;
            mem_is_amo_r <= 1'b0;
            mem_amo_op_r <= 5'd0;
            mem_rd_r     <= 5'd0;
            mem_funct3_r <= 3'd0;

            csr_mstatus  <= 32'd0;
            csr_mie      <= 32'd0;
            csr_mtvec    <= 32'd0;
            csr_mscratch <= 32'd0;
            csr_mepc     <= 32'd0;
            csr_mcause   <= 32'd0;
            csr_mcycle   <= 32'd0;
            csr_minstret <= 32'd0;

            for (i = 0; i < 32; i = i + 1) begin
                regs[i] <= 32'd0;
            end
        end else begin
            if (state != S_HALT) begin
                csr_mcycle <= csr_mcycle + 32'd1;
            end

            case (state)
                // ------------------------------------------------------------
                // S_HALT: Wait until boot_en is asserted (SoC boots Core0 immediately;
                //         Core0 boots Core1 by setting CORE1_BOOT_CTRL = 1)
                // ------------------------------------------------------------
                S_HALT: begin
                    pc     <= boot_addr;
                    dbg_pc <= boot_addr;
                    if (boot_en) begin
                        state <= S_FETCH;
                    end
                end

                // ------------------------------------------------------------
                // S_FETCH: Check pending IPI interrupt or fetch instruction
                // ------------------------------------------------------------
                S_FETCH: begin
                    if (!boot_en) begin
                        state <= S_HALT;
                    end else if (irq_pending) begin
                        // Take Machine Software Interrupt (IPI)
                        csr_mepc       <= pc;
                        csr_mcause     <= 32'h8000_0003;
                        csr_mstatus[7] <= csr_mstatus[3]; // MPIE <= MIE
                        csr_mstatus[3] <= 1'b0;           // MIE  <= 0
                        pc             <= {csr_mtvec[31:2], 2'b00};
                        dbg_pc         <= {csr_mtvec[31:2], 2'b00};
                        dbg_in_trap    <= 1'b1;
                        state          <= S_FETCH;
                    end else if (bus_ready) begin
                        instr     <= bus_rdata;
                        dbg_pc    <= pc;
                        dbg_instr <= bus_rdata;
                        state     <= S_EXEC;
                    end
                end

                // ------------------------------------------------------------
                // S_EXEC: Decode & execute instruction
                // ------------------------------------------------------------
                S_EXEC: begin
                    case (opcode)
                        7'b0110111: begin // LUI
                            if (rd != 5'd0) regs[rd] <= imm_u;
                            pc           <= pc + 32'd4;
                            csr_minstret <= csr_minstret + 32'd1;
                            state        <= S_FETCH;
                        end

                        7'b0010111: begin // AUIPC
                            if (rd != 5'd0) regs[rd] <= pc + imm_u;
                            pc           <= pc + 32'd4;
                            csr_minstret <= csr_minstret + 32'd1;
                            state        <= S_FETCH;
                        end

                        7'b1101111: begin // JAL
                            if (rd != 5'd0) regs[rd] <= pc + 32'd4;
                            pc           <= pc + imm_j;
                            csr_minstret <= csr_minstret + 32'd1;
                            state        <= S_FETCH;
                        end

                        7'b1100111: begin // JALR
                            if (rd != 5'd0) regs[rd] <= pc + 32'd4;
                            pc           <= (rs1_val + imm_i) & ~32'd1;
                            csr_minstret <= csr_minstret + 32'd1;
                            state        <= S_FETCH;
                        end

                        7'b1100011: begin // BRANCH
                            if (branch_taken)
                                pc <= pc + imm_b;
                            else
                                pc <= pc + 32'd4;
                            csr_minstret <= csr_minstret + 32'd1;
                            state        <= S_FETCH;
                        end

                        7'b0010011,       // OP-IMM
                        7'b0110011: begin // OP (includes RV32M)
                            if (rd != 5'd0) regs[rd] <= alu_res;
                            pc           <= pc + 32'd4;
                            csr_minstret <= csr_minstret + 32'd1;
                            state        <= S_FETCH;
                        end

                        7'b0000011: begin // LOAD
                            mem_addr_r   <= rs1_val + imm_i;
                            mem_wdata_r  <= 32'd0;
                            mem_wstrb_r  <= 4'b0000;
                            mem_we_r     <= 1'b0;
                            mem_is_amo_r <= 1'b0;
                            mem_amo_op_r <= 5'd0;
                            mem_rd_r     <= rd;
                            mem_funct3_r <= funct3;
                            state        <= S_MEM;
                        end

                        7'b0100011: begin // STORE
                            mem_addr_r   <= calc_store_addr;
                            mem_wdata_r  <= calc_store_wdata;
                            mem_wstrb_r  <= calc_store_wstrb;
                            mem_we_r     <= 1'b1;
                            mem_is_amo_r <= 1'b0;
                            mem_amo_op_r <= 5'd0;
                            mem_rd_r     <= 5'd0;
                            mem_funct3_r <= funct3;
                            state        <= S_MEM;
                        end

                        7'b0101111: begin // AMO (RV32A Atomic Memory Operations)
                            mem_addr_r   <= rs1_val;
                            mem_wdata_r  <= rs2_val;
                            mem_wstrb_r  <= 4'b1111;
                            mem_we_r     <= (funct5 != 5'b00010); // All AMOs except LR.W write
                            mem_is_amo_r <= 1'b1;
                            mem_amo_op_r <= funct5;
                            mem_rd_r     <= rd;
                            mem_funct3_r <= funct3;
                            state        <= S_MEM;
                        end

                        7'b0001111: begin // FENCE / FENCE.I
                            pc           <= pc + 32'd4;
                            csr_minstret <= csr_minstret + 32'd1;
                            state        <= S_FETCH;
                        end

                        7'b1110011: begin // SYSTEM / CSR
                            if (funct3 == 3'b000) begin
                                if (instr == 32'h3020_0073) begin // MRET
                                    pc             <= csr_mepc;
                                    csr_mstatus[3] <= csr_mstatus[7]; // MIE <= MPIE
                                    csr_mstatus[7] <= 1'b1;           // MPIE <= 1
                                    dbg_in_trap    <= 1'b0;
                                    csr_minstret   <= csr_minstret + 32'd1;
                                    state          <= S_FETCH;
                                end else if (instr == 32'h1050_0073) begin // WFI
                                    if (irq_software && csr_mie[3]) begin
                                        pc           <= pc + 32'd4;
                                        csr_minstret <= csr_minstret + 32'd1;
                                        state        <= S_FETCH;
                                    end else begin
                                        state        <= S_WFI;
                                    end
                                end else begin // ECALL / EBREAK -> advance PC
                                    pc           <= pc + 32'd4;
                                    csr_minstret <= csr_minstret + 32'd1;
                                    state        <= S_FETCH;
                                end
                            end else begin
                                // CSRRW / CSRRS / CSRRC / CSRRWI / CSRRSI / CSRRCI
                                if (rd != 5'd0) regs[rd] <= csr_rdata;
                                case (csr_id)
                                    12'h300: csr_mstatus  <= csr_wdata;
                                    12'h304: csr_mie      <= csr_wdata;
                                    12'h305: csr_mtvec    <= csr_wdata;
                                    12'h340: csr_mscratch <= csr_wdata;
                                    12'h341: csr_mepc     <= csr_wdata;
                                    12'h342: csr_mcause   <= csr_wdata;
                                    default: ;
                                endcase
                                pc           <= pc + 32'd4;
                                csr_minstret <= csr_minstret + 32'd1;
                                state        <= S_FETCH;
                            end
                        end

                        default: begin
                            pc           <= pc + 32'd4;
                            csr_minstret <= csr_minstret + 32'd1;
                            state        <= S_FETCH;
                        end
                    endcase
                end

                // ------------------------------------------------------------
                // S_MEM: Complete Load, Store, or Atomic Memory Operation
                // ------------------------------------------------------------
                S_MEM: begin
                    if (bus_ready) begin
                        if (mem_is_amo_r) begin
                            if (mem_rd_r != 5'd0) regs[mem_rd_r] <= bus_rdata;
                        end else if (!mem_we_r) begin
                            if (mem_rd_r != 5'd0) regs[mem_rd_r] <= load_val;
                        end
                        pc           <= pc + 32'd4;
                        csr_minstret <= csr_minstret + 32'd1;
                        state        <= S_FETCH;
                    end
                end

                // ------------------------------------------------------------
                // S_WFI: Wait For Interrupt (wakes when IPI arrives)
                // ------------------------------------------------------------
                S_WFI: begin
                    if (irq_software && csr_mie[3]) begin
                        pc           <= pc + 32'd4;
                        csr_minstret <= csr_minstret + 32'd1;
                        state        <= S_FETCH;
                    end
                end

                default: state <= S_HALT;
            endcase
        end
    end

endmodule
