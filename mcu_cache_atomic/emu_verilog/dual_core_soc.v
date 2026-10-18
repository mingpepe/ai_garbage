`include "defines.vh"

/*
 * Dual-Core RV32IA SoC Top Module
 * Connects:
 *   - Core 0 (u_core0: RV32IA + ROB + Store Buffer + L1 Cache)
 *   - Core 1 (u_core1: RV32IA + ROB + Store Buffer + L1 Cache)
 *   - MESI Snooping Coherence Bus (u_bus)
 *   - Instruction ROM (rom[0:1023]) & Shared Cacheable Memory (shm[0:63])
 */
module dual_core_soc (
    input  wire        clk,
    input  wire        rst_n,
    output reg  [31:0] cycle
);
    reg [31:0] rom [0:1023];
    reg [31:0] shm [0:63];

    // Event log storage for current cycle (up to 16 events)
    reg [8*160-1:0] events [0:15];
    integer         event_count;

    wire        c0_snoop_hit, c0_snoop_dirty;
    wire [1:0]  c0_snoop_state;
    wire [31:0] c0_snoop_data;

    wire        c1_snoop_hit, c1_snoop_dirty;
    wire [1:0]  c1_snoop_state;
    wire [31:0] c1_snoop_data;

    mesi_bus u_bus (
        .clk   (clk),
        .rst_n (rst_n)
    );

    rv32_core #(.HARTID(32'd0)) u_core0 (
        .clk              (clk),
        .rst_n            (rst_n),
        .snoop_query_addr (u_bus.addr),
        .snoop_hit        (c0_snoop_hit),
        .snoop_dirty      (c0_snoop_dirty),
        .snoop_line_state (c0_snoop_state),
        .snoop_line_data  (c0_snoop_data)
    );

    rv32_core #(.HARTID(32'd1)) u_core1 (
        .clk              (clk),
        .rst_n            (rst_n),
        .snoop_query_addr (u_bus.addr),
        .snoop_hit        (c1_snoop_hit),
        .snoop_dirty      (c1_snoop_dirty),
        .snoop_line_state (c1_snoop_state),
        .snoop_line_data  (c1_snoop_data)
    );

    integer k;
    always @(negedge rst_n) begin
        if (!rst_n) begin
            cycle       <= 32'd0;
            event_count <= 0;
            for (k = 0; k < 64; k = k + 1) shm[k] <= 32'd0;
        end
    end

    // Helper functions matching C emulator
    function [7:0] mesi_char(input [1:0] st);
        begin
            case (st)
                `MESI_I: mesi_char = "I";
                `MESI_S: mesi_char = "S";
                `MESI_E: mesi_char = "E";
                `MESI_M: mesi_char = "M";
                default: mesi_char = "?";
            endcase
        end
    endfunction

    function [31:0] sign_ext12(input [11:0] imm);
        begin
            sign_ext12 = {{20{imm[11]}}, imm};
        end
    endfunction

    function [31:0] eval_alu(input [31:0] inst, input [31:0] v1, input [31:0] v2);
        reg [6:0]  op;
        reg [2:0]  f3;
        reg [6:0]  f7;
        reg [31:0] b;
        begin
            op = inst[6:0];
            f3 = inst[14:12];
            f7 = inst[31:25];
            b  = (op == 7'h13) ? sign_ext12(inst[31:20]) : v2;
            case (f3)
                3'h0: eval_alu = (op == 7'h33 && f7[5]) ? (v1 - b) : (v1 + b);
                3'h1: eval_alu = v1 << b[4:0];
                3'h2: eval_alu = ($signed(v1) < $signed(b)) ? 32'd1 : 32'd0;
                3'h3: eval_alu = (v1 < b) ? 32'd1 : 32'd0;
                3'h4: eval_alu = v1 ^ b;
                3'h5: eval_alu = f7[5] ? ($signed(v1) >>> b[4:0]) : (v1 >> b[4:0]);
                3'h6: eval_alu = v1 | b;
                3'h7: eval_alu = v1 & b;
                default: eval_alu = 32'd0;
            endcase
        end
    endfunction

    function [31:0] eval_amo(input [4:0] f5, input [31:0] old_v, input [31:0] src_v);
        begin
            case (f5)
                5'h01: eval_amo = src_v;
                5'h00: eval_amo = old_v + src_v;
                5'h04: eval_amo = old_v ^ src_v;
                5'h0C: eval_amo = old_v & src_v;
                5'h08: eval_amo = old_v | src_v;
                default: eval_amo = src_v;
            endcase
        end
    endfunction

    task log_ev(input [8*160-1:0] msg);
        begin
            if (event_count < 16) begin
                events[event_count] = msg;
                event_count = event_count + 1;
            end
        end
    endtask

    // Per-core execution helper task (parameterized by core index 0 or 1)
    task step_core_0;
        reg [31:0] sb_addr, sb_data;
        reg [2:0]  idx;
        reg [26:0] tag;
        reg        hit;
        reg [1:0]  prev_s;
        integer    i, j, f;
        reg        r1_ok, r2_ok, ord_haz, older_store, sb_f_hit, cond;
        reg [7:0]  wait_r;
        reg [31:0] v1, v2, inst, addr, fwd_val, old_v, new_v, imm_u, fetch_pc, fetch_inst;
        reg [6:0]  opcode, op_j;
        reg [2:0]  funct3;
        reg [4:0]  funct5, my_rd;
        reg [11:0] csr;
        reg signed [31:0] offset;
        reg [8*160-1:0] sbuf;
        begin
            // 2A: Store Buffer Autonomous Drain to L1 Cache
            if (u_core0.u_sb.count > 0 && u_core0.pend_src == `REQ_NONE) begin
                sb_addr = u_core0.u_sb.addr[0];
                sb_data = u_core0.u_sb.data[0];
                idx     = sb_addr[4:2];
                tag     = sb_addr[31:5];
                hit     = (u_core0.u_l1.state[idx] != `MESI_I) && (u_core0.u_l1.tag[idx] == tag);

                if (hit && (u_core0.u_l1.state[idx] == `MESI_M || u_core0.u_l1.state[idx] == `MESI_E)) begin
                    prev_s = u_core0.u_l1.state[idx];
                    u_core0.u_l1.state[idx] = `MESI_M;
                    u_core0.u_l1.data[idx]  = sb_data;
                    u_core0.u_l1.addr[idx]  = sb_addr;
                    u_core0.vis_sb_drain      = 1'b1;
                    u_core0.vis_sb_drain_addr = sb_addr;
                    u_core0.cnt_sb_drain      = u_core0.cnt_sb_drain + 32'd1;
                    $sformat(sbuf, "SB DRAIN Core 0: [0x%04x] <= 0x%08x (L1 Hit %s->M)", sb_addr, sb_data, mesi_char(prev_s));
                    log_ev(sbuf);
                    u_core0.u_sb.pop_head();
                end else begin
                    u_core0.pend_src   = `REQ_SB;
                    u_core0.pend_cmd   = (hit && u_core0.u_l1.state[idx] == `MESI_S) ? `BUS_UPGR : `BUS_RDX;
                    u_core0.pend_addr  = sb_addr;
                    u_core0.pend_wdata = sb_data;
                end
            end

            // 2B: Execute / Issue ROB Entries
            for (i = 0; i < u_core0.rob_count; i = i + 1) begin
                if (u_core0.rob_valid[i] && u_core0.rob_state[i] != `ROB_DONE) begin
                    if (i > 0 && u_core0.ooo_enable == 32'd0) begin
                        u_core0.rob_state[i] = `ROB_READY;
                    end else begin
                        wait_r = 8'd0;
                        // Operand 1 lookup
                        if (u_core0.rob_rs1[i] == 5'd0) begin
                            v1 = 32'd0; r1_ok = 1'b1;
                        end else begin
                            v1 = u_core0.regs[u_core0.rob_rs1[i]]; r1_ok = 1'b1;
                            for (j = 0; j < i; j = j + 1) begin
                                if (u_core0.rob_valid[j] && u_core0.rob_has_rd[j] && u_core0.rob_rd[j] == u_core0.rob_rs1[i]) begin
                                    if (u_core0.rob_state[j] == `ROB_DONE) begin v1 = u_core0.rob_result[j]; r1_ok = 1'b1; end
                                    else begin r1_ok = 1'b0; wait_r = {3'd0, u_core0.rob_rs1[i]}; end
                                end
                            end
                        end
                        // Operand 2 lookup
                        if (u_core0.rob_rs2[i] == 5'd0) begin
                            v2 = 32'd0; r2_ok = 1'b1;
                        end else begin
                            v2 = u_core0.regs[u_core0.rob_rs2[i]]; r2_ok = 1'b1;
                            for (j = 0; j < i; j = j + 1) begin
                                if (u_core0.rob_valid[j] && u_core0.rob_has_rd[j] && u_core0.rob_rd[j] == u_core0.rob_rs2[i]) begin
                                    if (u_core0.rob_state[j] == `ROB_DONE) begin v2 = u_core0.rob_result[j]; r2_ok = 1'b1; end
                                    else if (r1_ok) begin r2_ok = 1'b0; wait_r = {3'd0, u_core0.rob_rs2[i]}; end
                                end
                            end
                        end
                        // Order hazard check
                        ord_haz = 1'b0;
                        my_rd   = u_core0.rob_has_rd[i] ? u_core0.rob_rd[i] : 5'd0;
                        if (i > 0 && r1_ok && r2_ok) begin
                            for (j = 0; j < i; j = j + 1) begin
                                if (u_core0.rob_valid[j]) begin
                                    op_j = u_core0.rob_inst[j][6:0];
                                    if (op_j == 7'h0F || op_j == 7'h2F || op_j == 7'h63 || op_j == 7'h6F || op_j == 7'h67 || op_j == 7'h73) begin
                                        if (!ord_haz) begin ord_haz = 1'b1; wait_r = 8'hFF; end
                                    end else if (my_rd != 5'd0 && u_core0.rob_has_rd[j] && u_core0.rob_rd[j] == my_rd && u_core0.rob_state[j] != `ROB_DONE) begin
                                        if (!ord_haz) begin ord_haz = 1'b1; wait_r = {3'd0, my_rd}; end
                                    end
                                end
                            end
                        end

                        if (!r1_ok || !r2_ok || ord_haz) begin
                            u_core0.rob_state[i]    = `ROB_WAIT_DEP;
                            u_core0.rob_wait_reg[i] = wait_r;
                        end else begin
                            inst   = u_core0.rob_inst[i];
                            opcode = inst[6:0];
                            funct3 = inst[14:12];
                            funct5 = inst[31:27];

                            if (opcode == 7'h33 || opcode == 7'h13) begin
                                u_core0.rob_result[i] = eval_alu(inst, v1, v2);
                                u_core0.rob_state[i]  = `ROB_DONE;
                                if (i > 0) begin
                                    u_core0.rob_executed_ooo[i] = 1'b1;
                                    u_core0.cnt_ooo_exec        = u_core0.cnt_ooo_exec + 32'd1;
                                    u_core0.vis_ooo_fire        = 1'b1;
                                    u_core0.vis_ooo_pc          = u_core0.rob_pc[i];
                                    $sformat(sbuf, "OoO EXEC Core 0: ROB[%0d] (PC=0x%02x) ALU completed ahead of stalled ROB[0]!", i, u_core0.rob_pc[i]);
                                    log_ev(sbuf);
                                end
                            end else if (opcode == 7'h37) begin
                                u_core0.rob_result[i] = {inst[31:12], 12'd0};
                                u_core0.rob_state[i]  = `ROB_DONE;
                                if (i > 0) begin u_core0.rob_executed_ooo[i] = 1'b1; u_core0.cnt_ooo_exec = u_core0.cnt_ooo_exec + 32'd1; end
                            end else if (opcode == 7'h17) begin
                                u_core0.rob_result[i] = u_core0.rob_pc[i] + {inst[31:12], 12'd0};
                                u_core0.rob_state[i]  = `ROB_DONE;
                                if (i > 0) begin u_core0.rob_executed_ooo[i] = 1'b1; u_core0.cnt_ooo_exec = u_core0.cnt_ooo_exec + 32'd1; end
                            end else if (opcode == 7'h03) begin
                                addr = v1 + sign_ext12(inst[31:20]);
                                if (addr >= 32'h2000 && addr < 32'h3000) begin
                                    if (i == 0) begin
                                        u_core0.rob_result[i] = u_core0.dtcm[(addr - 32'h2000) >> 2];
                                        u_core0.rob_state[i]  = `ROB_DONE;
                                    end
                                end else begin
                                    older_store = 1'b0;
                                    for (j = 0; j < i; j = j + 1) begin
                                        if (u_core0.rob_inst[j][6:0] == 7'h23 && u_core0.rob_state[j] != `ROB_DONE) older_store = 1'b1;
                                    end
                                    if (older_store || (u_core0.ooo_enable == 32'd0 && u_core0.u_sb.count > 0)) begin
                                        u_core0.rob_state[i] = `ROB_MEM_WAIT;
                                    end else begin
                                        // 1. Store Buffer Forwarding Check
                                        sb_f_hit = 1'b0; fwd_val = 32'd0;
                                        for (j = 0; j < u_core0.u_sb.count; j = j + 1) begin
                                            if (u_core0.u_sb.valid[j] && u_core0.u_sb.addr[j] == addr) begin
                                                sb_f_hit = 1'b1; fwd_val = u_core0.u_sb.data[j];
                                            end
                                        end
                                        if (sb_f_hit) begin
                                            u_core0.rob_result[i]   = fwd_val;
                                            u_core0.rob_state[i]    = `ROB_DONE;
                                            u_core0.cnt_sb_fwd      = u_core0.cnt_sb_fwd + 32'd1;
                                            u_core0.vis_sb_fwd      = 1'b1;
                                            u_core0.vis_sb_fwd_addr = addr;
                                            u_core0.vis_sb_fwd_data = fwd_val;
                                            $sformat(sbuf, "SB FORWARD Core 0: lw [0x%04x] -> 0x%08x directly from Store Buffer!", addr, fwd_val);
                                            log_ev(sbuf);
                                            if (i > 0) begin u_core0.rob_executed_ooo[i] = 1'b1; u_core0.cnt_ooo_exec = u_core0.cnt_ooo_exec + 32'd1; end
                                        end else begin
                                            // 2. L1 Cache Hit Check
                                            idx = addr[4:2]; tag = addr[31:5];
                                            if (u_core0.u_l1.state[idx] != `MESI_I && u_core0.u_l1.tag[idx] == tag) begin
                                                u_core0.rob_result[i]   = u_core0.u_l1.data[idx];
                                                u_core0.rob_state[i]    = `ROB_DONE;
                                                u_core0.cnt_l1_hit      = u_core0.cnt_l1_hit + 32'd1;
                                                u_core0.vis_l1_hit      = 1'b1;
                                                u_core0.vis_l1_hit_addr = addr;
                                                if (i > 0) begin
                                                    u_core0.rob_executed_ooo[i] = 1'b1;
                                                    u_core0.cnt_ooo_exec        = u_core0.cnt_ooo_exec + 32'd1;
                                                    u_core0.vis_ooo_fire        = 1'b1;
                                                    u_core0.vis_ooo_pc          = u_core0.rob_pc[i];
                                                    $sformat(sbuf, "OoO LOAD HIT Core 0: ROB[%0d] lw [0x%04x] -> 0x%08x hit L1 (%s) out-of-order!", i, addr, u_core0.rob_result[i], mesi_char(u_core0.u_l1.state[idx]));
                                                    log_ev(sbuf);
                                                end else if (u_core0.u_sb.count > 0) begin
                                                    $sformat(sbuf, "LOAD BYPASS SB Core 0: lw [0x%04x] -> 0x%08x hit L1 (%s) while SB has %0d pending store(s)!", addr, u_core0.rob_result[i], mesi_char(u_core0.u_l1.state[idx]), u_core0.u_sb.count);
                                                    log_ev(sbuf);
                                                end
                                            end else begin
                                                // 3. L1 Read Miss
                                                u_core0.rob_state[i] = `ROB_MEM_WAIT;
                                                if (i == 0 && u_core0.pend_src == `REQ_NONE && u_core0.u_sb.count == 0) begin
                                                    u_core0.pend_src    = `REQ_CPU;
                                                    u_core0.pend_cmd    = `BUS_RD;
                                                    u_core0.pend_addr   = addr;
                                                    u_core0.cnt_l1_miss = u_core0.cnt_l1_miss + 32'd1;
                                                end
                                            end
                                        end
                                    end
                                end
                            end else if (i == 0) begin
                                if (opcode == 7'h23) begin
                                    addr = v1 + sign_ext12({inst[31:25], inst[11:7]});
                                    if (addr >= 32'h2000 && addr < 32'h3000) begin
                                        u_core0.dtcm[(addr - 32'h2000) >> 2] = v2;
                                        u_core0.rob_state[0] = `ROB_DONE;
                                    end else if (u_core0.u_sb.count < 4) begin
                                        u_core0.u_sb.push_entry(addr, v2, u_core0.rob_pc[0]);
                                        u_core0.cnt_sb_enq   = u_core0.cnt_sb_enq + 32'd1;
                                        u_core0.rob_state[0] = `ROB_DONE;
                                        $sformat(sbuf, "SB ENQUEUE Core 0: sw [0x%04x] <= 0x%08x (SB count=%0d)", addr, v2, u_core0.u_sb.count);
                                        log_ev(sbuf);
                                    end else begin
                                        u_core0.rob_state[0] = `ROB_MEM_WAIT;
                                    end
                                end else if (opcode == 7'h0F) begin
                                    if (u_core0.u_sb.count == 0 && u_core0.pend_src == `REQ_NONE) begin
                                        u_core0.rob_state[0] = `ROB_DONE;
                                        $sformat(sbuf, "FENCE COMPLETE Core 0: Store Buffer drained (sb_count=0)");
                                        log_ev(sbuf);
                                    end else begin
                                        u_core0.rob_state[0] = `ROB_MEM_WAIT;
                                    end
                                end else if (opcode == 7'h2F) begin
                                    addr = v1; idx = addr[4:2]; tag = addr[31:5];
                                    hit  = (u_core0.u_l1.state[idx] != `MESI_I) && (u_core0.u_l1.tag[idx] == tag);
                                    if (u_core0.u_sb.count > 0) begin
                                        u_core0.rob_state[0] = `ROB_MEM_WAIT;
                                    end else if (funct5 == 5'h02) begin
                                        if (u_core0.pend_src == `REQ_NONE) begin
                                            u_core0.cnt_lr = u_core0.cnt_lr + 32'd1;
                                            if (hit) begin
                                                u_core0.res_valid     = 1'b1;
                                                u_core0.res_addr      = addr;
                                                u_core0.rob_result[0] = u_core0.u_l1.data[idx];
                                                u_core0.rob_state[0]  = `ROB_DONE;
                                                $sformat(sbuf, "LR.W HIT Core 0: Reserved 0x%04x (val=0x%08x, L1=%s)", addr, u_core0.rob_result[0], mesi_char(u_core0.u_l1.state[idx]));
                                                log_ev(sbuf);
                                            end else begin
                                                u_core0.pend_src      = `REQ_CPU;
                                                u_core0.pend_cmd      = `BUS_RD;
                                                u_core0.pend_addr     = addr;
                                                u_core0.cnt_l1_miss   = u_core0.cnt_l1_miss + 32'd1;
                                                u_core0.rob_state[0]  = `ROB_MEM_WAIT;
                                            end
                                        end else u_core0.rob_state[0] = `ROB_MEM_WAIT;
                                    end else if (funct5 == 5'h03) begin
                                        if (!u_core0.res_valid || u_core0.res_addr != addr) begin
                                            u_core0.res_valid     = 1'b0;
                                            if (u_core0.pend_src == `REQ_CPU) u_core0.pend_src = `REQ_NONE;
                                            u_core0.rob_result[0] = 32'd1;
                                            u_core0.rob_state[0]  = `ROB_DONE;
                                            u_core0.cnt_sc_fail   = u_core0.cnt_sc_fail + 32'd1;
                                            $sformat(sbuf, "SC.W FAILED Core 0: Reservation on 0x%04x was invalidated! (rd=1)", addr);
                                            log_ev(sbuf);
                                        end else if (hit && (u_core0.u_l1.state[idx] == `MESI_M || u_core0.u_l1.state[idx] == `MESI_E)) begin
                                            u_core0.u_l1.state[idx] = `MESI_M;
                                            u_core0.u_l1.data[idx]  = v2;
                                            u_core0.res_valid       = 1'b0;
                                            u_core0.rob_result[0]   = 32'd0;
                                            u_core0.rob_state[0]    = `ROB_DONE;
                                            u_core0.cnt_sc_ok       = u_core0.cnt_sc_ok + 32'd1;
                                            $sformat(sbuf, "SC.W SUCCESS Core 0: [0x%04x] <= 0x%08x (L1=M, rd=0)", addr, v2);
                                            log_ev(sbuf);
                                        end else if (u_core0.pend_src == `REQ_NONE) begin
                                            u_core0.pend_src      = `REQ_CPU;
                                            u_core0.pend_cmd      = (hit && u_core0.u_l1.state[idx] == `MESI_S) ? `BUS_UPGR : `BUS_RDX;
                                            u_core0.pend_addr     = addr;
                                            u_core0.pend_wdata    = v2;
                                            u_core0.rob_state[0]  = `ROB_MEM_WAIT;
                                        end else u_core0.rob_state[0] = `ROB_MEM_WAIT;
                                    end else begin
                                        if (hit && (u_core0.u_l1.state[idx] == `MESI_M || u_core0.u_l1.state[idx] == `MESI_E)) begin
                                            old_v = u_core0.u_l1.data[idx];
                                            new_v = eval_amo(funct5, old_v, v2);
                                            u_core0.u_l1.state[idx] = `MESI_M;
                                            u_core0.u_l1.data[idx]  = new_v;
                                            u_core0.rob_result[0]   = old_v;
                                            u_core0.rob_state[0]    = `ROB_DONE;
                                            u_core0.cnt_amo         = u_core0.cnt_amo + 32'd1;
                                            $sformat(sbuf, "AMO HIT Core 0: [0x%04x] old=0x%08x -> new=0x%08x (L1=M)", addr, old_v, new_v);
                                            log_ev(sbuf);
                                        end else if (u_core0.pend_src == `REQ_NONE) begin
                                            u_core0.pend_src      = `REQ_CPU;
                                            u_core0.pend_cmd      = (hit && u_core0.u_l1.state[idx] == `MESI_S) ? `BUS_UPGR : `BUS_RDX;
                                            u_core0.pend_addr     = addr;
                                            u_core0.pend_wdata    = v2;
                                            u_core0.rob_state[0]  = `ROB_MEM_WAIT;
                                        end else u_core0.rob_state[0] = `ROB_MEM_WAIT;
                                    end
                                end else if (opcode == 7'h63) begin
                                    offset = {{20{inst[31]}}, inst[7], inst[30:25], inst[11:8], 1'b0};
                                    case (funct3)
                                        3'h0: cond = (v1 == v2);
                                        3'h1: cond = (v1 != v2);
                                        3'h4: cond = ($signed(v1) < $signed(v2));
                                        3'h5: cond = ($signed(v1) >= $signed(v2));
                                        3'h6: cond = (v1 < v2);
                                        3'h7: cond = (v1 >= v2);
                                        default: cond = 1'b0;
                                    endcase
                                    if (cond) u_core0.pc = u_core0.rob_pc[0] + offset;
                                    u_core0.rob_state[0] = `ROB_DONE;
                                end else if (opcode == 7'h6F) begin
                                    offset = {{12{inst[31]}}, inst[19:12], inst[20], inst[30:21], 1'b0};
                                    u_core0.rob_result[0] = u_core0.rob_pc[0] + 32'd4;
                                    u_core0.pc            = u_core0.rob_pc[0] + offset;
                                    u_core0.rob_state[0]  = `ROB_DONE;
                                end else if (opcode == 7'h67) begin
                                    offset = sign_ext12(inst[31:20]);
                                    u_core0.rob_result[0] = u_core0.rob_pc[0] + 32'd4;
                                    u_core0.pc            = (v1 + offset) & ~32'd1;
                                    u_core0.rob_state[0]  = `ROB_DONE;
                                end else if (opcode == 7'h73) begin
                                    csr = inst[31:20];
                                    if (funct3 == 3'd0) begin
                                        u_core0.halted       = 1'b1;
                                        u_core0.rob_state[0] = `ROB_DONE;
                                    end else begin
                                        old_v = (csr == 12'hF14) ? 32'd0 : (csr == 12'h7C0) ? u_core0.ooo_enable : (csr == 12'h7C1) ? u_core0.phase_tag : 32'd0;
                                        imm_u = funct3[2] ? {27'd0, u_core0.rob_rs1[0]} : v1;
                                        new_v = (funct3[1:0] == 2'd1) ? imm_u : (funct3[1:0] == 2'd2) ? (old_v | imm_u) : (old_v & ~imm_u);
                                        if (csr == 12'h7C0) u_core0.ooo_enable = new_v & 32'd1;
                                        else if (csr == 12'h7C1) begin
                                            u_core0.phase_tag = new_v;
                                            $sformat(sbuf, "=== PHASE %0d START (Core 0) ===", new_v);
                                            log_ev(sbuf);
                                        end
                                        u_core0.rob_result[0] = old_v;
                                        u_core0.rob_state[0]  = `ROB_DONE;
                                    end
                                end
                            end
                        end
                    end
                end
            end

            // 2C: Commit Head of ROB
            if (u_core0.rob_count > 0 && u_core0.rob_valid[0] && u_core0.rob_state[0] == `ROB_DONE) begin
                if (u_core0.rob_has_rd[0] && u_core0.rob_rd[0] != 5'd0) begin
                    u_core0.regs[u_core0.rob_rd[0]] = u_core0.rob_result[0];
                end
                u_core0.regs[0]           = 32'd0;
                u_core0.last_commit_valid = 1'b1;
                u_core0.last_commit_pc    = u_core0.rob_pc[0];
                u_core0.last_commit_inst  = u_core0.rob_inst[0];
                u_core0.cnt_inst_ret      = u_core0.cnt_inst_ret + 32'd1;
                u_core0.pop_rob_head();
            end

            // 2D: Fetch up to 2 instructions into ROB Window
            for (f = 0; f < 2; f = f + 1) begin
                if (!u_core0.halted && u_core0.rob_count < 4) begin
                    if (u_core0.rob_count == 0 || !u_core0.rob_is_branch_stop[u_core0.rob_count - 1]) begin
                        fetch_pc   = u_core0.pc;
                        fetch_inst = ((fetch_pc >> 2) < 1024) ? rom[fetch_pc >> 2] : 32'h0000_0013;
                        u_core0.decode_and_push_rob(fetch_pc, fetch_inst);
                        u_core0.pc = fetch_pc + 32'd4;
                    end
                end
            end
        end
    endtask

    task step_core_1;
        reg [31:0] sb_addr, sb_data;
        reg [2:0]  idx;
        reg [26:0] tag;
        reg        hit;
        reg [1:0]  prev_s;
        integer    i, j, f;
        reg        r1_ok, r2_ok, ord_haz, older_store, sb_f_hit, cond;
        reg [7:0]  wait_r;
        reg [31:0] v1, v2, inst, addr, fwd_val, old_v, new_v, imm_u, fetch_pc, fetch_inst;
        reg [6:0]  opcode, op_j;
        reg [2:0]  funct3;
        reg [4:0]  funct5, my_rd;
        reg [11:0] csr;
        reg signed [31:0] offset;
        reg [8*160-1:0] sbuf;
        begin
            // 2A: Store Buffer Autonomous Drain to L1 Cache
            if (u_core1.u_sb.count > 0 && u_core1.pend_src == `REQ_NONE) begin
                sb_addr = u_core1.u_sb.addr[0];
                sb_data = u_core1.u_sb.data[0];
                idx     = sb_addr[4:2];
                tag     = sb_addr[31:5];
                hit     = (u_core1.u_l1.state[idx] != `MESI_I) && (u_core1.u_l1.tag[idx] == tag);

                if (hit && (u_core1.u_l1.state[idx] == `MESI_M || u_core1.u_l1.state[idx] == `MESI_E)) begin
                    prev_s = u_core1.u_l1.state[idx];
                    u_core1.u_l1.state[idx] = `MESI_M;
                    u_core1.u_l1.data[idx]  = sb_data;
                    u_core1.u_l1.addr[idx]  = sb_addr;
                    u_core1.vis_sb_drain      = 1'b1;
                    u_core1.vis_sb_drain_addr = sb_addr;
                    u_core1.cnt_sb_drain      = u_core1.cnt_sb_drain + 32'd1;
                    $sformat(sbuf, "SB DRAIN Core 1: [0x%04x] <= 0x%08x (L1 Hit %s->M)", sb_addr, sb_data, mesi_char(prev_s));
                    log_ev(sbuf);
                    u_core1.u_sb.pop_head();
                end else begin
                    u_core1.pend_src   = `REQ_SB;
                    u_core1.pend_cmd   = (hit && u_core1.u_l1.state[idx] == `MESI_S) ? `BUS_UPGR : `BUS_RDX;
                    u_core1.pend_addr  = sb_addr;
                    u_core1.pend_wdata = sb_data;
                end
            end

            // 2B: Execute / Issue ROB Entries
            for (i = 0; i < u_core1.rob_count; i = i + 1) begin
                if (u_core1.rob_valid[i] && u_core1.rob_state[i] != `ROB_DONE) begin
                    if (i > 0 && u_core1.ooo_enable == 32'd0) begin
                        u_core1.rob_state[i] = `ROB_READY;
                    end else begin
                        wait_r = 8'd0;
                        if (u_core1.rob_rs1[i] == 5'd0) begin
                            v1 = 32'd0; r1_ok = 1'b1;
                        end else begin
                            v1 = u_core1.regs[u_core1.rob_rs1[i]]; r1_ok = 1'b1;
                            for (j = 0; j < i; j = j + 1) begin
                                if (u_core1.rob_valid[j] && u_core1.rob_has_rd[j] && u_core1.rob_rd[j] == u_core1.rob_rs1[i]) begin
                                    if (u_core1.rob_state[j] == `ROB_DONE) begin v1 = u_core1.rob_result[j]; r1_ok = 1'b1; end
                                    else begin r1_ok = 1'b0; wait_r = {3'd0, u_core1.rob_rs1[i]}; end
                                end
                            end
                        end
                        if (u_core1.rob_rs2[i] == 5'd0) begin
                            v2 = 32'd0; r2_ok = 1'b1;
                        end else begin
                            v2 = u_core1.regs[u_core1.rob_rs2[i]]; r2_ok = 1'b1;
                            for (j = 0; j < i; j = j + 1) begin
                                if (u_core1.rob_valid[j] && u_core1.rob_has_rd[j] && u_core1.rob_rd[j] == u_core1.rob_rs2[i]) begin
                                    if (u_core1.rob_state[j] == `ROB_DONE) begin v2 = u_core1.rob_result[j]; r2_ok = 1'b1; end
                                    else if (r1_ok) begin r2_ok = 1'b0; wait_r = {3'd0, u_core1.rob_rs2[i]}; end
                                end
                            end
                        end
                        ord_haz = 1'b0;
                        my_rd   = u_core1.rob_has_rd[i] ? u_core1.rob_rd[i] : 5'd0;
                        if (i > 0 && r1_ok && r2_ok) begin
                            for (j = 0; j < i; j = j + 1) begin
                                if (u_core1.rob_valid[j]) begin
                                    op_j = u_core1.rob_inst[j][6:0];
                                    if (op_j == 7'h0F || op_j == 7'h2F || op_j == 7'h63 || op_j == 7'h6F || op_j == 7'h67 || op_j == 7'h73) begin
                                        if (!ord_haz) begin ord_haz = 1'b1; wait_r = 8'hFF; end
                                    end else if (my_rd != 5'd0 && u_core1.rob_has_rd[j] && u_core1.rob_rd[j] == my_rd && u_core1.rob_state[j] != `ROB_DONE) begin
                                        if (!ord_haz) begin ord_haz = 1'b1; wait_r = {3'd0, my_rd}; end
                                    end
                                end
                            end
                        end

                        if (!r1_ok || !r2_ok || ord_haz) begin
                            u_core1.rob_state[i]    = `ROB_WAIT_DEP;
                            u_core1.rob_wait_reg[i] = wait_r;
                        end else begin
                            inst   = u_core1.rob_inst[i];
                            opcode = inst[6:0];
                            funct3 = inst[14:12];
                            funct5 = inst[31:27];

                            if (opcode == 7'h33 || opcode == 7'h13) begin
                                u_core1.rob_result[i] = eval_alu(inst, v1, v2);
                                u_core1.rob_state[i]  = `ROB_DONE;
                                if (i > 0) begin
                                    u_core1.rob_executed_ooo[i] = 1'b1;
                                    u_core1.cnt_ooo_exec        = u_core1.cnt_ooo_exec + 32'd1;
                                    u_core1.vis_ooo_fire        = 1'b1;
                                    u_core1.vis_ooo_pc          = u_core1.rob_pc[i];
                                    $sformat(sbuf, "OoO EXEC Core 1: ROB[%0d] (PC=0x%02x) ALU completed ahead of stalled ROB[0]!", i, u_core1.rob_pc[i]);
                                    log_ev(sbuf);
                                end
                            end else if (opcode == 7'h37) begin
                                u_core1.rob_result[i] = {inst[31:12], 12'd0};
                                u_core1.rob_state[i]  = `ROB_DONE;
                                if (i > 0) begin u_core1.rob_executed_ooo[i] = 1'b1; u_core1.cnt_ooo_exec = u_core1.cnt_ooo_exec + 32'd1; end
                            end else if (opcode == 7'h17) begin
                                u_core1.rob_result[i] = u_core1.rob_pc[i] + {inst[31:12], 12'd0};
                                u_core1.rob_state[i]  = `ROB_DONE;
                                if (i > 0) begin u_core1.rob_executed_ooo[i] = 1'b1; u_core1.cnt_ooo_exec = u_core1.cnt_ooo_exec + 32'd1; end
                            end else if (opcode == 7'h03) begin
                                addr = v1 + sign_ext12(inst[31:20]);
                                if (addr >= 32'h2000 && addr < 32'h3000) begin
                                    if (i == 0) begin
                                        u_core1.rob_result[i] = u_core1.dtcm[(addr - 32'h2000) >> 2];
                                        u_core1.rob_state[i]  = `ROB_DONE;
                                    end
                                end else begin
                                    older_store = 1'b0;
                                    for (j = 0; j < i; j = j + 1) begin
                                        if (u_core1.rob_inst[j][6:0] == 7'h23 && u_core1.rob_state[j] != `ROB_DONE) older_store = 1'b1;
                                    end
                                    if (older_store || (u_core1.ooo_enable == 32'd0 && u_core1.u_sb.count > 0)) begin
                                        u_core1.rob_state[i] = `ROB_MEM_WAIT;
                                    end else begin
                                        sb_f_hit = 1'b0; fwd_val = 32'd0;
                                        for (j = 0; j < u_core1.u_sb.count; j = j + 1) begin
                                            if (u_core1.u_sb.valid[j] && u_core1.u_sb.addr[j] == addr) begin
                                                sb_f_hit = 1'b1; fwd_val = u_core1.u_sb.data[j];
                                            end
                                        end
                                        if (sb_f_hit) begin
                                            u_core1.rob_result[i]   = fwd_val;
                                            u_core1.rob_state[i]    = `ROB_DONE;
                                            u_core1.cnt_sb_fwd      = u_core1.cnt_sb_fwd + 32'd1;
                                            u_core1.vis_sb_fwd      = 1'b1;
                                            u_core1.vis_sb_fwd_addr = addr;
                                            u_core1.vis_sb_fwd_data = fwd_val;
                                            $sformat(sbuf, "SB FORWARD Core 1: lw [0x%04x] -> 0x%08x directly from Store Buffer!", addr, fwd_val);
                                            log_ev(sbuf);
                                            if (i > 0) begin u_core1.rob_executed_ooo[i] = 1'b1; u_core1.cnt_ooo_exec = u_core1.cnt_ooo_exec + 32'd1; end
                                        end else begin
                                            idx = addr[4:2]; tag = addr[31:5];
                                            if (u_core1.u_l1.state[idx] != `MESI_I && u_core1.u_l1.tag[idx] == tag) begin
                                                u_core1.rob_result[i]   = u_core1.u_l1.data[idx];
                                                u_core1.rob_state[i]    = `ROB_DONE;
                                                u_core1.cnt_l1_hit      = u_core1.cnt_l1_hit + 32'd1;
                                                u_core1.vis_l1_hit      = 1'b1;
                                                u_core1.vis_l1_hit_addr = addr;
                                                if (i > 0) begin
                                                    u_core1.rob_executed_ooo[i] = 1'b1;
                                                    u_core1.cnt_ooo_exec        = u_core1.cnt_ooo_exec + 32'd1;
                                                    u_core1.vis_ooo_fire        = 1'b1;
                                                    u_core1.vis_ooo_pc          = u_core1.rob_pc[i];
                                                    $sformat(sbuf, "OoO LOAD HIT Core 1: ROB[%0d] lw [0x%04x] -> 0x%08x hit L1 (%s) out-of-order!", i, addr, u_core1.rob_result[i], mesi_char(u_core1.u_l1.state[idx]));
                                                    log_ev(sbuf);
                                                end else if (u_core1.u_sb.count > 0) begin
                                                    $sformat(sbuf, "LOAD BYPASS SB Core 1: lw [0x%04x] -> 0x%08x hit L1 (%s) while SB has %0d pending store(s)!", addr, u_core1.rob_result[i], mesi_char(u_core1.u_l1.state[idx]), u_core1.u_sb.count);
                                                    log_ev(sbuf);
                                                end
                                            end else begin
                                                u_core1.rob_state[i] = `ROB_MEM_WAIT;
                                                if (i == 0 && u_core1.pend_src == `REQ_NONE && u_core1.u_sb.count == 0) begin
                                                    u_core1.pend_src    = `REQ_CPU;
                                                    u_core1.pend_cmd    = `BUS_RD;
                                                    u_core1.pend_addr   = addr;
                                                    u_core1.cnt_l1_miss = u_core1.cnt_l1_miss + 32'd1;
                                                end
                                            end
                                        end
                                    end
                                end
                            end else if (i == 0) begin
                                if (opcode == 7'h23) begin
                                    addr = v1 + sign_ext12({inst[31:25], inst[11:7]});
                                    if (addr >= 32'h2000 && addr < 32'h3000) begin
                                        u_core1.dtcm[(addr - 32'h2000) >> 2] = v2;
                                        u_core1.rob_state[0] = `ROB_DONE;
                                    end else if (u_core1.u_sb.count < 4) begin
                                        u_core1.u_sb.push_entry(addr, v2, u_core1.rob_pc[0]);
                                        u_core1.cnt_sb_enq   = u_core1.cnt_sb_enq + 32'd1;
                                        u_core1.rob_state[0] = `ROB_DONE;
                                        $sformat(sbuf, "SB ENQUEUE Core 1: sw [0x%04x] <= 0x%08x (SB count=%0d)", addr, v2, u_core1.u_sb.count);
                                        log_ev(sbuf);
                                    end else begin
                                        u_core1.rob_state[0] = `ROB_MEM_WAIT;
                                    end
                                end else if (opcode == 7'h0F) begin
                                    if (u_core1.u_sb.count == 0 && u_core1.pend_src == `REQ_NONE) begin
                                        u_core1.rob_state[0] = `ROB_DONE;
                                        $sformat(sbuf, "FENCE COMPLETE Core 1: Store Buffer drained (sb_count=0)");
                                        log_ev(sbuf);
                                    end else begin
                                        u_core1.rob_state[0] = `ROB_MEM_WAIT;
                                    end
                                end else if (opcode == 7'h2F) begin
                                    addr = v1; idx = addr[4:2]; tag = addr[31:5];
                                    hit  = (u_core1.u_l1.state[idx] != `MESI_I) && (u_core1.u_l1.tag[idx] == tag);
                                    if (u_core1.u_sb.count > 0) begin
                                        u_core1.rob_state[0] = `ROB_MEM_WAIT;
                                    end else if (funct5 == 5'h02) begin
                                        if (u_core1.pend_src == `REQ_NONE) begin
                                            u_core1.cnt_lr = u_core1.cnt_lr + 32'd1;
                                            if (hit) begin
                                                u_core1.res_valid     = 1'b1;
                                                u_core1.res_addr      = addr;
                                                u_core1.rob_result[0] = u_core1.u_l1.data[idx];
                                                u_core1.rob_state[0]  = `ROB_DONE;
                                                $sformat(sbuf, "LR.W HIT Core 1: Reserved 0x%04x (val=0x%08x, L1=%s)", addr, u_core1.rob_result[0], mesi_char(u_core1.u_l1.state[idx]));
                                                log_ev(sbuf);
                                            end else begin
                                                u_core1.pend_src      = `REQ_CPU;
                                                u_core1.pend_cmd      = `BUS_RD;
                                                u_core1.pend_addr     = addr;
                                                u_core1.cnt_l1_miss   = u_core1.cnt_l1_miss + 32'd1;
                                                u_core1.rob_state[0]  = `ROB_MEM_WAIT;
                                            end
                                        end else u_core1.rob_state[0] = `ROB_MEM_WAIT;
                                    end else if (funct5 == 5'h03) begin
                                        if (!u_core1.res_valid || u_core1.res_addr != addr) begin
                                            u_core1.res_valid     = 1'b0;
                                            if (u_core1.pend_src == `REQ_CPU) u_core1.pend_src = `REQ_NONE;
                                            u_core1.rob_result[0] = 32'd1;
                                            u_core1.rob_state[0]  = `ROB_DONE;
                                            u_core1.cnt_sc_fail   = u_core1.cnt_sc_fail + 32'd1;
                                            $sformat(sbuf, "SC.W FAILED Core 1: Reservation on 0x%04x was invalidated! (rd=1)", addr);
                                            log_ev(sbuf);
                                        end else if (hit && (u_core1.u_l1.state[idx] == `MESI_M || u_core1.u_l1.state[idx] == `MESI_E)) begin
                                            u_core1.u_l1.state[idx] = `MESI_M;
                                            u_core1.u_l1.data[idx]  = v2;
                                            u_core1.res_valid       = 1'b0;
                                            u_core1.rob_result[0]   = 32'd0;
                                            u_core1.rob_state[0]    = `ROB_DONE;
                                            u_core1.cnt_sc_ok       = u_core1.cnt_sc_ok + 32'd1;
                                            $sformat(sbuf, "SC.W SUCCESS Core 1: [0x%04x] <= 0x%08x (L1=M, rd=0)", addr, v2);
                                            log_ev(sbuf);
                                        end else if (u_core1.pend_src == `REQ_NONE) begin
                                            u_core1.pend_src      = `REQ_CPU;
                                            u_core1.pend_cmd      = (hit && u_core1.u_l1.state[idx] == `MESI_S) ? `BUS_UPGR : `BUS_RDX;
                                            u_core1.pend_addr     = addr;
                                            u_core1.pend_wdata    = v2;
                                            u_core1.rob_state[0]  = `ROB_MEM_WAIT;
                                        end else u_core1.rob_state[0] = `ROB_MEM_WAIT;
                                    end else begin
                                        if (hit && (u_core1.u_l1.state[idx] == `MESI_M || u_core1.u_l1.state[idx] == `MESI_E)) begin
                                            old_v = u_core1.u_l1.data[idx];
                                            new_v = eval_amo(funct5, old_v, v2);
                                            u_core1.u_l1.state[idx] = `MESI_M;
                                            u_core1.u_l1.data[idx]  = new_v;
                                            u_core1.rob_result[0]   = old_v;
                                            u_core1.rob_state[0]    = `ROB_DONE;
                                            u_core1.cnt_amo         = u_core1.cnt_amo + 32'd1;
                                            $sformat(sbuf, "AMO HIT Core 1: [0x%04x] old=0x%08x -> new=0x%08x (L1=M)", addr, old_v, new_v);
                                            log_ev(sbuf);
                                        end else if (u_core1.pend_src == `REQ_NONE) begin
                                            u_core1.pend_src      = `REQ_CPU;
                                            u_core1.pend_cmd      = (hit && u_core1.u_l1.state[idx] == `MESI_S) ? `BUS_UPGR : `BUS_RDX;
                                            u_core1.pend_addr     = addr;
                                            u_core1.pend_wdata    = v2;
                                            u_core1.rob_state[0]  = `ROB_MEM_WAIT;
                                        end else u_core1.rob_state[0] = `ROB_MEM_WAIT;
                                    end
                                end else if (opcode == 7'h63) begin
                                    offset = {{20{inst[31]}}, inst[7], inst[30:25], inst[11:8], 1'b0};
                                    case (funct3)
                                        3'h0: cond = (v1 == v2);
                                        3'h1: cond = (v1 != v2);
                                        3'h4: cond = ($signed(v1) < $signed(v2));
                                        3'h5: cond = ($signed(v1) >= $signed(v2));
                                        3'h6: cond = (v1 < v2);
                                        3'h7: cond = (v1 >= v2);
                                        default: cond = 1'b0;
                                    endcase
                                    if (cond) u_core1.pc = u_core1.rob_pc[0] + offset;
                                    u_core1.rob_state[0] = `ROB_DONE;
                                end else if (opcode == 7'h6F) begin
                                    offset = {{12{inst[31]}}, inst[19:12], inst[20], inst[30:21], 1'b0};
                                    u_core1.rob_result[0] = u_core1.rob_pc[0] + 32'd4;
                                    u_core1.pc            = u_core1.rob_pc[0] + offset;
                                    u_core1.rob_state[0]  = `ROB_DONE;
                                end else if (opcode == 7'h67) begin
                                    offset = sign_ext12(inst[31:20]);
                                    u_core1.rob_result[0] = u_core1.rob_pc[0] + 32'd4;
                                    u_core1.pc            = (v1 + offset) & ~32'd1;
                                    u_core1.rob_state[0]  = `ROB_DONE;
                                end else if (opcode == 7'h73) begin
                                    csr = inst[31:20];
                                    if (funct3 == 3'd0) begin
                                        u_core1.halted       = 1'b1;
                                        u_core1.rob_state[0] = `ROB_DONE;
                                    end else begin
                                        old_v = (csr == 12'hF14) ? 32'd1 : (csr == 12'h7C0) ? u_core1.ooo_enable : (csr == 12'h7C1) ? u_core1.phase_tag : 32'd0;
                                        imm_u = funct3[2] ? {27'd0, u_core1.rob_rs1[0]} : v1;
                                        new_v = (funct3[1:0] == 2'd1) ? imm_u : (funct3[1:0] == 2'd2) ? (old_v | imm_u) : (old_v & ~imm_u);
                                        if (csr == 12'h7C0) u_core1.ooo_enable = new_v & 32'd1;
                                        else if (csr == 12'h7C1) begin
                                            u_core1.phase_tag = new_v;
                                            $sformat(sbuf, "=== PHASE %0d START (Core 1) ===", new_v);
                                            log_ev(sbuf);
                                        end
                                        u_core1.rob_result[0] = old_v;
                                        u_core1.rob_state[0]  = `ROB_DONE;
                                    end
                                end
                            end
                        end
                    end
                end
            end

            // 2C: Commit Head of ROB
            if (u_core1.rob_count > 0 && u_core1.rob_valid[0] && u_core1.rob_state[0] == `ROB_DONE) begin
                if (u_core1.rob_has_rd[0] && u_core1.rob_rd[0] != 5'd0) begin
                    u_core1.regs[u_core1.rob_rd[0]] = u_core1.rob_result[0];
                end
                u_core1.regs[0]           = 32'd0;
                u_core1.last_commit_valid = 1'b1;
                u_core1.last_commit_pc    = u_core1.rob_pc[0];
                u_core1.last_commit_inst  = u_core1.rob_inst[0];
                u_core1.cnt_inst_ret      = u_core1.cnt_inst_ret + 32'd1;
                u_core1.pop_rob_head();
            end

            // 2D: Fetch up to 2 instructions into ROB Window
            for (f = 0; f < 2; f = f + 1) begin
                if (!u_core1.halted && u_core1.rob_count < 4) begin
                    if (u_core1.rob_count == 0 || !u_core1.rob_is_branch_stop[u_core1.rob_count - 1]) begin
                        fetch_pc   = u_core1.pc;
                        fetch_inst = ((fetch_pc >> 2) < 1024) ? rom[fetch_pc >> 2] : 32'h0000_0013;
                        u_core1.decode_and_push_rob(fetch_pc, fetch_inst);
                        u_core1.pc = fetch_pc + 32'd4;
                    end
                end
            end
        end
    endtask

    // Main Synchronous Clock Step
    always @(posedge clk) begin
        if (rst_n) begin : main_cycle_block
            reg [31:0] b_addr, data_val, old_v, new_v;
            reg [2:0]  b_idx;
            reg [26:0] b_tag;
            reg [5:0]  shm_idx;
            reg        p_hit, p_dirty;
            reg [1:0]  old_s, new_s;
            reg [6:0]  op0;
            reg [4:0]  f5;
            reg [8*160-1:0] sbuf;
            reg [8*8-1:0]   cmd_name;
            integer    winner;

            cycle       = cycle + 32'd1;
            event_count = 0;

            u_core0.vis_sb_fwd        = 1'b0;
            u_core0.vis_sb_drain      = 1'b0;
            u_core0.vis_l1_hit        = 1'b0;
            u_core0.vis_ooo_fire      = 1'b0;
            u_core0.last_commit_valid = 1'b0;

            u_core1.vis_sb_fwd        = 1'b0;
            u_core1.vis_sb_drain      = 1'b0;
            u_core1.vis_l1_hit        = 1'b0;
            u_core1.vis_ooo_fire      = 1'b0;
            u_core1.last_commit_valid = 1'b0;

            // ================================================================
            // STAGE 1: MESI Snooping Bus Progress
            // ================================================================
            if (u_bus.busy) begin
                b_addr  = u_bus.addr;
                b_idx   = b_addr[4:2];
                b_tag   = b_addr[31:5];
                shm_idx = (b_addr - 32'h1000) >> 2;
                cmd_name = (u_bus.cmd == `BUS_RD) ? "BusRd" : (u_bus.cmd == `BUS_RDX) ? "BusRdX" : (u_bus.cmd == `BUS_UPGR) ? "BusUpgr" : "BusWB";

                if (u_bus.owner == 1'b0) begin
                    p_hit    = (u_core1.u_l1.state[b_idx] != `MESI_I) && (u_core1.u_l1.tag[b_idx] == b_tag);
                    p_dirty  = p_hit && (u_core1.u_l1.state[b_idx] == `MESI_M);
                    data_val = p_dirty ? u_core1.u_l1.data[b_idx] : shm[shm_idx];
                end else begin
                    p_hit    = (u_core0.u_l1.state[b_idx] != `MESI_I) && (u_core0.u_l1.tag[b_idx] == b_tag);
                    p_dirty  = p_hit && (u_core0.u_l1.state[b_idx] == `MESI_M);
                    data_val = p_dirty ? u_core0.u_l1.data[b_idx] : shm[shm_idx];
                end

                if (u_bus.timer > 1'b0) begin
                    u_bus.timer         = 1'b0;
                    u_bus.snoop_hit     = p_hit;
                    u_bus.snoop_dirty   = p_dirty;
                    u_bus.snoop_inv_res = 1'b0;
                    u_bus.rdata         = data_val;

                    if (u_bus.owner == 1'b0) begin
                        if ((u_bus.cmd == `BUS_RDX || u_bus.cmd == `BUS_UPGR) && u_core1.res_valid && u_core1.res_addr == b_addr)
                            u_bus.snoop_inv_res = 1'b1;
                        $sformat(sbuf, "BUS [%0s] Core 0 -> 0x%04x (Peer Core 1 Snoop: %0s%0s)",
                                 cmd_name, b_addr, p_hit ? mesi_char(u_core1.u_l1.state[b_idx]) : "MISS", p_dirty ? " DIRTY-FLUSH" : "");
                    end else begin
                        if ((u_bus.cmd == `BUS_RDX || u_bus.cmd == `BUS_UPGR) && u_core0.res_valid && u_core0.res_addr == b_addr)
                            u_bus.snoop_inv_res = 1'b1;
                        $sformat(sbuf, "BUS [%0s] Core 1 -> 0x%04x (Peer Core 0 Snoop: %0s%0s)",
                                 cmd_name, b_addr, p_hit ? mesi_char(u_core0.u_l1.state[b_idx]) : "MISS", p_dirty ? " DIRTY-FLUSH" : "");
                    end
                    log_ev(sbuf);
                end else begin
                    u_bus.rdata = data_val;
                    if (u_bus.owner == 1'b0) begin
                        // Owner = Core 0, Peer = Core 1
                        if (p_hit) begin
                            if (u_bus.cmd == `BUS_RD) begin
                                if (u_core1.u_l1.state[b_idx] == `MESI_M) begin
                                    shm[shm_idx] = u_core1.u_l1.data[b_idx];
                                    u_core1.u_l1.state[b_idx] = `MESI_S;
                                    $sformat(sbuf, "MESI Core 1 Line[%0d] (0x%04x): M -> S (Flushed 0x%08x to Bus/RAM)", b_idx, b_addr, u_core1.u_l1.data[b_idx]);
                                    log_ev(sbuf);
                                end else if (u_core1.u_l1.state[b_idx] == `MESI_E) begin
                                    u_core1.u_l1.state[b_idx] = `MESI_S;
                                    $sformat(sbuf, "MESI Core 1 Line[%0d] (0x%04x): E -> S (Shared with Core 0)", b_idx, b_addr);
                                    log_ev(sbuf);
                                end
                            end else if (u_bus.cmd == `BUS_RDX || u_bus.cmd == `BUS_UPGR) begin
                                old_s = u_core1.u_l1.state[b_idx];
                                if (old_s == `MESI_M) shm[shm_idx] = u_core1.u_l1.data[b_idx];
                                u_core1.u_l1.state[b_idx] = `MESI_I;
                                $sformat(sbuf, "MESI Core 1 Line[%0d] (0x%04x): %s -> I (Invalidated by Core 0 %0s)", b_idx, b_addr, mesi_char(old_s), cmd_name);
                                log_ev(sbuf);
                            end
                        end
                        if ((u_bus.cmd == `BUS_RDX || u_bus.cmd == `BUS_UPGR) && u_core1.res_valid && u_core1.res_addr == b_addr) begin
                            u_core1.res_valid   = 1'b0;
                            u_bus.snoop_inv_res = 1'b1;
                            $sformat(sbuf, "LR/SC SNOOP: Core 1 reservation on 0x%04x CLEARED by Core 0!", b_addr);
                            log_ev(sbuf);
                        end
                        // Complete Core 0 Request
                        if (u_core0.pend_src == `REQ_SB) begin
                            u_core0.u_l1.state[b_idx] = `MESI_M;
                            u_core0.u_l1.tag[b_idx]   = b_tag;
                            u_core0.u_l1.addr[b_idx]  = b_addr;
                            u_core0.u_l1.data[b_idx]  = u_core0.u_sb.data[0];
                            u_core0.vis_sb_drain      = 1'b1;
                            u_core0.vis_sb_drain_addr = b_addr;
                            u_core0.cnt_sb_drain      = u_core0.cnt_sb_drain + 32'd1;
                            $sformat(sbuf, "SB DRAIN Core 0: [0x%04x] <= 0x%08x -> L1 Line[%0d] = M", b_addr, u_core0.u_sb.data[0], b_idx);
                            log_ev(sbuf);
                            u_core0.u_sb.pop_head();
                            u_core0.pend_src = `REQ_NONE;
                        end else if (u_core0.pend_src == `REQ_CPU && u_core0.rob_count > 0) begin
                            op0 = u_core0.rob_inst[0][6:0];
                            f5  = u_core0.rob_inst[0][31:27];
                            if (op0 == 7'h03) begin
                                new_s = p_hit ? `MESI_S : `MESI_E;
                                u_core0.u_l1.state[b_idx] = new_s;
                                u_core0.u_l1.tag[b_idx]   = b_tag;
                                u_core0.u_l1.addr[b_idx]  = b_addr;
                                u_core0.u_l1.data[b_idx]  = data_val;
                                u_core0.rob_result[0]     = data_val;
                                u_core0.rob_state[0]      = `ROB_DONE;
                                $sformat(sbuf, "L1 FILL Core 0: Line[%0d] (0x%04x) = 0x%08x [%s]", b_idx, b_addr, data_val, mesi_char(new_s));
                                log_ev(sbuf);
                            end else if (op0 == 7'h2F && f5 == 5'h02) begin
                                new_s = p_hit ? `MESI_S : `MESI_E;
                                u_core0.u_l1.state[b_idx] = new_s;
                                u_core0.u_l1.tag[b_idx]   = b_tag;
                                u_core0.u_l1.addr[b_idx]  = b_addr;
                                u_core0.u_l1.data[b_idx]  = data_val;
                                u_core0.res_valid         = 1'b1;
                                u_core0.res_addr          = b_addr;
                                u_core0.rob_result[0]     = data_val;
                                u_core0.rob_state[0]      = `ROB_DONE;
                                $sformat(sbuf, "LR.W Core 0: Reserved 0x%04x (val=0x%08x, L1=%s)", b_addr, data_val, mesi_char(new_s));
                                log_ev(sbuf);
                            end else if (op0 == 7'h2F && f5 == 5'h03) begin
                                u_core0.u_l1.state[b_idx] = `MESI_M;
                                u_core0.u_l1.tag[b_idx]   = b_tag;
                                u_core0.u_l1.addr[b_idx]  = b_addr;
                                u_core0.u_l1.data[b_idx]  = u_core0.pend_wdata;
                                u_core0.res_valid         = 1'b0;
                                u_core0.rob_result[0]     = 32'd0;
                                u_core0.rob_state[0]      = `ROB_DONE;
                                u_core0.cnt_sc_ok         = u_core0.cnt_sc_ok + 32'd1;
                                $sformat(sbuf, "SC.W SUCCESS Core 0: [0x%04x] <= 0x%08x (L1=M)", b_addr, u_core0.pend_wdata);
                                log_ev(sbuf);
                            end else if (op0 == 7'h2F) begin
                                old_v = (u_bus.cmd == `BUS_UPGR) ? u_core0.u_l1.data[b_idx] : data_val;
                                new_v = eval_amo(f5, old_v, u_core0.pend_wdata);
                                u_core0.u_l1.state[b_idx] = `MESI_M;
                                u_core0.u_l1.tag[b_idx]   = b_tag;
                                u_core0.u_l1.addr[b_idx]  = b_addr;
                                u_core0.u_l1.data[b_idx]  = new_v;
                                u_core0.rob_result[0]     = old_v;
                                u_core0.rob_state[0]      = `ROB_DONE;
                                u_core0.cnt_amo           = u_core0.cnt_amo + 32'd1;
                                $sformat(sbuf, "AMO Core 0: [0x%04x] old=0x%08x -> new=0x%08x (L1=M)", b_addr, old_v, new_v);
                                log_ev(sbuf);
                            end
                            u_core0.pend_src = `REQ_NONE;
                        end
                    end else begin
                        // Owner = Core 1, Peer = Core 0
                        if (p_hit) begin
                            if (u_bus.cmd == `BUS_RD) begin
                                if (u_core0.u_l1.state[b_idx] == `MESI_M) begin
                                    shm[shm_idx] = u_core0.u_l1.data[b_idx];
                                    u_core0.u_l1.state[b_idx] = `MESI_S;
                                    $sformat(sbuf, "MESI Core 0 Line[%0d] (0x%04x): M -> S (Flushed 0x%08x to Bus/RAM)", b_idx, b_addr, u_core0.u_l1.data[b_idx]);
                                    log_ev(sbuf);
                                end else if (u_core0.u_l1.state[b_idx] == `MESI_E) begin
                                    u_core0.u_l1.state[b_idx] = `MESI_S;
                                    $sformat(sbuf, "MESI Core 0 Line[%0d] (0x%04x): E -> S (Shared with Core 1)", b_idx, b_addr);
                                    log_ev(sbuf);
                                end
                            end else if (u_bus.cmd == `BUS_RDX || u_bus.cmd == `BUS_UPGR) begin
                                old_s = u_core0.u_l1.state[b_idx];
                                if (old_s == `MESI_M) shm[shm_idx] = u_core0.u_l1.data[b_idx];
                                u_core0.u_l1.state[b_idx] = `MESI_I;
                                $sformat(sbuf, "MESI Core 0 Line[%0d] (0x%04x): %s -> I (Invalidated by Core 1 %0s)", b_idx, b_addr, mesi_char(old_s), cmd_name);
                                log_ev(sbuf);
                            end
                        end
                        if ((u_bus.cmd == `BUS_RDX || u_bus.cmd == `BUS_UPGR) && u_core0.res_valid && u_core0.res_addr == b_addr) begin
                            u_core0.res_valid   = 1'b0;
                            u_bus.snoop_inv_res = 1'b1;
                            $sformat(sbuf, "LR/SC SNOOP: Core 0 reservation on 0x%04x CLEARED by Core 1!", b_addr);
                            log_ev(sbuf);
                        end
                        // Complete Core 1 Request
                        if (u_core1.pend_src == `REQ_SB) begin
                            u_core1.u_l1.state[b_idx] = `MESI_M;
                            u_core1.u_l1.tag[b_idx]   = b_tag;
                            u_core1.u_l1.addr[b_idx]  = b_addr;
                            u_core1.u_l1.data[b_idx]  = u_core1.u_sb.data[0];
                            u_core1.vis_sb_drain      = 1'b1;
                            u_core1.vis_sb_drain_addr = b_addr;
                            u_core1.cnt_sb_drain      = u_core1.cnt_sb_drain + 32'd1;
                            $sformat(sbuf, "SB DRAIN Core 1: [0x%04x] <= 0x%08x -> L1 Line[%0d] = M", b_addr, u_core1.u_sb.data[0], b_idx);
                            log_ev(sbuf);
                            u_core1.u_sb.pop_head();
                            u_core1.pend_src = `REQ_NONE;
                        end else if (u_core1.pend_src == `REQ_CPU && u_core1.rob_count > 0) begin
                            op0 = u_core1.rob_inst[0][6:0];
                            f5  = u_core1.rob_inst[0][31:27];
                            if (op0 == 7'h03) begin
                                new_s = p_hit ? `MESI_S : `MESI_E;
                                u_core1.u_l1.state[b_idx] = new_s;
                                u_core1.u_l1.tag[b_idx]   = b_tag;
                                u_core1.u_l1.addr[b_idx]  = b_addr;
                                u_core1.u_l1.data[b_idx]  = data_val;
                                u_core1.rob_result[0]     = data_val;
                                u_core1.rob_state[0]      = `ROB_DONE;
                                $sformat(sbuf, "L1 FILL Core 1: Line[%0d] (0x%04x) = 0x%08x [%s]", b_idx, b_addr, data_val, mesi_char(new_s));
                                log_ev(sbuf);
                            end else if (op0 == 7'h2F && f5 == 5'h02) begin
                                new_s = p_hit ? `MESI_S : `MESI_E;
                                u_core1.u_l1.state[b_idx] = new_s;
                                u_core1.u_l1.tag[b_idx]   = b_tag;
                                u_core1.u_l1.addr[b_idx]  = b_addr;
                                u_core1.u_l1.data[b_idx]  = data_val;
                                u_core1.res_valid         = 1'b1;
                                u_core1.res_addr          = b_addr;
                                u_core1.rob_result[0]     = data_val;
                                u_core1.rob_state[0]      = `ROB_DONE;
                                $sformat(sbuf, "LR.W Core 1: Reserved 0x%04x (val=0x%08x, L1=%s)", b_addr, data_val, mesi_char(new_s));
                                log_ev(sbuf);
                            end else if (op0 == 7'h2F && f5 == 5'h03) begin
                                u_core1.u_l1.state[b_idx] = `MESI_M;
                                u_core1.u_l1.tag[b_idx]   = b_tag;
                                u_core1.u_l1.addr[b_idx]  = b_addr;
                                u_core1.u_l1.data[b_idx]  = u_core1.pend_wdata;
                                u_core1.res_valid         = 1'b0;
                                u_core1.rob_result[0]     = 32'd0;
                                u_core1.rob_state[0]      = `ROB_DONE;
                                u_core1.cnt_sc_ok         = u_core1.cnt_sc_ok + 32'd1;
                                $sformat(sbuf, "SC.W SUCCESS Core 1: [0x%04x] <= 0x%08x (L1=M)", b_addr, u_core1.pend_wdata);
                                log_ev(sbuf);
                            end else if (op0 == 7'h2F) begin
                                old_v = (u_bus.cmd == `BUS_UPGR) ? u_core1.u_l1.data[b_idx] : data_val;
                                new_v = eval_amo(f5, old_v, u_core1.pend_wdata);
                                u_core1.u_l1.state[b_idx] = `MESI_M;
                                u_core1.u_l1.tag[b_idx]   = b_tag;
                                u_core1.u_l1.addr[b_idx]  = b_addr;
                                u_core1.u_l1.data[b_idx]  = new_v;
                                u_core1.rob_result[0]     = old_v;
                                u_core1.rob_state[0]      = `ROB_DONE;
                                u_core1.cnt_amo           = u_core1.cnt_amo + 32'd1;
                                $sformat(sbuf, "AMO Core 1: [0x%04x] old=0x%08x -> new=0x%08x (L1=M)", b_addr, old_v, new_v);
                                log_ev(sbuf);
                            end
                            u_core1.pend_src = `REQ_NONE;
                        end
                    end
                    u_bus.busy       = 1'b0;
                    u_bus.last_grant = u_bus.owner;
                end
            end

            // ================================================================
            // STAGE 2: Per-Core Store Buffer Drain & ROB Execution
            // ================================================================
            step_core_0();
            step_core_1();

            // ================================================================
            // STAGE 3: Coherence Bus Arbiter
            // ================================================================
            if (!u_bus.busy) begin
                // Check if any waiting SC.W lost its reservation before winning the bus
                if (u_core0.pend_src == `REQ_CPU && u_core0.rob_count > 0 &&
                    u_core0.rob_inst[0][6:0] == 7'h2F && u_core0.rob_inst[0][31:27] == 5'h03 &&
                    (!u_core0.res_valid || u_core0.res_addr != u_core0.pend_addr)) begin
                    u_core0.pend_src      = `REQ_NONE;
                    u_core0.res_valid     = 1'b0;
                    u_core0.rob_result[0] = 32'd1;
                    u_core0.rob_state[0]  = `ROB_DONE;
                    u_core0.cnt_sc_fail   = u_core0.cnt_sc_fail + 32'd1;
                    $sformat(sbuf, "SC.W ABORTED Core 0: Reservation on 0x%04x lost before Bus grant! (rd=1)", u_core0.pend_addr);
                    log_ev(sbuf);
                end
                if (u_core1.pend_src == `REQ_CPU && u_core1.rob_count > 0 &&
                    u_core1.rob_inst[0][6:0] == 7'h2F && u_core1.rob_inst[0][31:27] == 5'h03 &&
                    (!u_core1.res_valid || u_core1.res_addr != u_core1.pend_addr)) begin
                    u_core1.pend_src      = `REQ_NONE;
                    u_core1.res_valid     = 1'b0;
                    u_core1.rob_result[0] = 32'd1;
                    u_core1.rob_state[0]  = `ROB_DONE;
                    u_core1.cnt_sc_fail   = u_core1.cnt_sc_fail + 32'd1;
                    $sformat(sbuf, "SC.W ABORTED Core 1: Reservation on 0x%04x lost before Bus grant! (rd=1)", u_core1.pend_addr);
                    log_ev(sbuf);
                end

                if (u_core0.pend_src != `REQ_NONE && u_core0.pend_cmd == `BUS_UPGR) begin
                    if (u_core0.u_l1.state[u_core0.pend_addr[4:2]] == `MESI_I)
                        u_core0.pend_cmd = `BUS_RDX;
                end
                if (u_core1.pend_src != `REQ_NONE && u_core1.pend_cmd == `BUS_UPGR) begin
                    if (u_core1.u_l1.state[u_core1.pend_addr[4:2]] == `MESI_I)
                        u_core1.pend_cmd = `BUS_RDX;
                end

                winner = -1;
                if (u_bus.last_grant == 1'b0) begin
                    if (u_core1.pend_src != `REQ_NONE) winner = 1;
                    else if (u_core0.pend_src != `REQ_NONE) winner = 0;
                end else begin
                    if (u_core0.pend_src != `REQ_NONE) winner = 0;
                    else if (u_core1.pend_src != `REQ_NONE) winner = 1;
                end

                if (winner == 0) begin
                    u_bus.busy          = 1'b1;
                    u_bus.owner         = 1'b0;
                    u_bus.cmd           = u_core0.pend_cmd;
                    u_bus.addr          = u_core0.pend_addr;
                    u_bus.wdata         = u_core0.pend_wdata;
                    u_bus.timer         = 1'b1;
                    u_bus.snoop_hit     = 1'b0;
                    u_bus.snoop_dirty   = 1'b0;
                    u_bus.snoop_inv_res = 1'b0;
                end else if (winner == 1) begin
                    u_bus.busy          = 1'b1;
                    u_bus.owner         = 1'b1;
                    u_bus.cmd           = u_core1.pend_cmd;
                    u_bus.addr          = u_core1.pend_addr;
                    u_bus.wdata         = u_core1.pend_wdata;
                    u_bus.timer         = 1'b1;
                    u_bus.snoop_hit     = 1'b0;
                    u_bus.snoop_dirty   = 1'b0;
                    u_bus.snoop_inv_res = 1'b0;
                end
            end
        end
    end

endmodule
