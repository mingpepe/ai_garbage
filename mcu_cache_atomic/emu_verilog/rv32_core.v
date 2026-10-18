`include "defines.vh"

/*
 * RV32IA Processor Core with:
 *   - 4-Entry Out-of-Order Reorder Buffer (ROB) / Issue Queue
 *   - Hardware Reservation Register (res_valid, res_addr) for LR.W / SC.W
 *   - 4-Entry Store Buffer (u_sb) with Store-to-Load Forwarding
 *   - 8-Line MESI L1 Data Cache (u_l1)
 *   - 4KB Core-Local Stack DTCM
 */
module rv32_core #(
    parameter [31:0] HARTID = 32'd0
) (
    input  wire        clk,
    input  wire        rst_n,
    input  wire [31:0] snoop_query_addr,
    output wire        snoop_hit,
    output wire        snoop_dirty,
    output wire [1:0]  snoop_line_state,
    output wire [31:0] snoop_line_data
);
    reg [31:0] pc;
    reg [31:0] regs [0:31];
    reg        halted;
    reg [31:0] ooo_enable;
    reg [31:0] phase_tag;

    // Hardware Reservation Register for LR/SC
    reg        res_valid;
    reg [31:0] res_addr;

    // 4-Entry Out-of-Order ROB
    reg [2:0]  rob_count;
    reg        rob_valid          [0:3];
    reg [31:0] rob_pc             [0:3];
    reg [31:0] rob_inst           [0:3];
    reg [2:0]  rob_state          [0:3];
    reg [4:0]  rob_rd             [0:3];
    reg [4:0]  rob_rs1            [0:3];
    reg [4:0]  rob_rs2            [0:3];
    reg [7:0]  rob_wait_reg       [0:3];
    reg [31:0] rob_result         [0:3];
    reg        rob_has_rd         [0:3];
    reg        rob_executed_ooo   [0:3];
    reg        rob_is_branch_stop [0:3];

    // Core-Local Stack DTCM (0x2000..0x2FFF)
    reg [31:0] dtcm [0:1023];

    // Pending L1/Bus Request
    reg [1:0]  pend_src;
    reg [2:0]  pend_cmd;
    reg [31:0] pend_addr;
    reg [31:0] pend_wdata;

    // Hardware Counters
    reg [31:0] cnt_inst_ret;
    reg [31:0] cnt_ooo_exec;
    reg [31:0] cnt_sb_enq;
    reg [31:0] cnt_sb_fwd;
    reg [31:0] cnt_sb_drain;
    reg [31:0] cnt_l1_hit;
    reg [31:0] cnt_l1_miss;
    reg [31:0] cnt_lr;
    reg [31:0] cnt_sc_ok;
    reg [31:0] cnt_sc_fail;
    reg [31:0] cnt_amo;

    // Per-cycle Visual Signals (also visible in VCD waveforms!)
    reg        vis_sb_fwd;
    reg [31:0] vis_sb_fwd_addr;
    reg [31:0] vis_sb_fwd_data;
    reg        vis_sb_drain;
    reg [31:0] vis_sb_drain_addr;
    reg        vis_l1_hit;
    reg [31:0] vis_l1_hit_addr;
    reg        vis_ooo_fire;
    reg [31:0] vis_ooo_pc;
    reg        last_commit_valid;
    reg [31:0] last_commit_pc;
    reg [31:0] last_commit_inst;

    // Query wires for Store Buffer & L1 Cache
    reg  [31:0] sb_lookup_addr;
    wire        sb_fwd_hit;
    wire [31:0] sb_fwd_data;
    wire [2:0]  sb_count;
    wire        sb_head_valid;
    wire [31:0] sb_head_addr;
    wire [31:0] sb_head_data;
    wire [31:0] sb_head_pc;

    reg  [31:0] l1_query_addr;
    wire        l1_cpu_hit;
    wire [1:0]  l1_cpu_state;
    wire [31:0] l1_cpu_data;

    store_buffer u_sb (
        .clk         (clk),
        .rst_n       (rst_n),
        .lookup_addr (sb_lookup_addr),
        .fwd_hit     (sb_fwd_hit),
        .fwd_data    (sb_fwd_data),
        .count       (sb_count),
        .head_valid  (sb_head_valid),
        .head_addr   (sb_head_addr),
        .head_data   (sb_head_data),
        .head_pc     (sb_head_pc)
    );

    l1_cache u_l1 (
        .clk              (clk),
        .rst_n            (rst_n),
        .cpu_query_addr   (l1_query_addr),
        .cpu_hit          (l1_cpu_hit),
        .cpu_line_state   (l1_cpu_state),
        .cpu_line_data    (l1_cpu_data),
        .snoop_query_addr (snoop_query_addr),
        .snoop_hit        (snoop_hit),
        .snoop_dirty      (snoop_dirty),
        .snoop_line_state (snoop_line_state),
        .snoop_line_data  (snoop_line_data)
    );

    integer i;
    always @(negedge rst_n) begin
        if (!rst_n) begin
            pc                <= 32'd0;
            halted            <= 1'b0;
            ooo_enable        <= 32'd1;
            phase_tag         <= 32'd0;
            res_valid         <= 1'b0;
            res_addr          <= 32'd0;
            rob_count         <= 3'd0;
            pend_src          <= `REQ_NONE;
            pend_cmd          <= `BUS_NONE;
            pend_addr         <= 32'd0;
            pend_wdata        <= 32'd0;
            cnt_inst_ret      <= 32'd0;
            cnt_ooo_exec      <= 32'd0;
            cnt_sb_enq        <= 32'd0;
            cnt_sb_fwd        <= 32'd0;
            cnt_sb_drain      <= 32'd0;
            cnt_l1_hit        <= 32'd0;
            cnt_l1_miss       <= 32'd0;
            cnt_lr            <= 32'd0;
            cnt_sc_ok         <= 32'd0;
            cnt_sc_fail       <= 32'd0;
            cnt_amo           <= 32'd0;
            vis_sb_fwd        <= 1'b0;
            vis_sb_fwd_addr   <= 32'd0;
            vis_sb_fwd_data   <= 32'd0;
            vis_sb_drain      <= 1'b0;
            vis_sb_drain_addr <= 32'd0;
            vis_l1_hit        <= 1'b0;
            vis_l1_hit_addr   <= 32'd0;
            vis_ooo_fire      <= 1'b0;
            vis_ooo_pc        <= 32'd0;
            last_commit_valid <= 1'b0;
            last_commit_pc    <= 32'd0;
            last_commit_inst  <= 32'd0;
            sb_lookup_addr    <= 32'd0;
            l1_query_addr     <= 32'd0;

            for (i = 0; i < 32; i = i + 1) regs[i] <= 32'd0;
            for (i = 0; i < 4; i = i + 1) begin
                rob_valid[i]          <= 1'b0;
                rob_pc[i]             <= 32'd0;
                rob_inst[i]           <= 32'd0;
                rob_state[i]          <= `ROB_EMPTY;
                rob_rd[i]             <= 5'd0;
                rob_rs1[i]            <= 5'd0;
                rob_rs2[i]            <= 5'd0;
                rob_wait_reg[i]       <= 8'd0;
                rob_result[i]         <= 32'd0;
                rob_has_rd[i]         <= 1'b0;
                rob_executed_ooo[i]   <= 1'b0;
                rob_is_branch_stop[i] <= 1'b0;
            end
        end
    end

    task pop_rob_head;
        integer j;
        begin
            if (rob_count > 0) begin
                for (j = 0; j < 3; j = j + 1) begin
                    rob_valid[j]          = rob_valid[j + 1];
                    rob_pc[j]             = rob_pc[j + 1];
                    rob_inst[j]           = rob_inst[j + 1];
                    rob_state[j]          = rob_state[j + 1];
                    rob_rd[j]             = rob_rd[j + 1];
                    rob_rs1[j]            = rob_rs1[j + 1];
                    rob_rs2[j]            = rob_rs2[j + 1];
                    rob_wait_reg[j]       = rob_wait_reg[j + 1];
                    rob_result[j]         = rob_result[j + 1];
                    rob_has_rd[j]         = rob_has_rd[j + 1];
                    rob_executed_ooo[j]   = rob_executed_ooo[j + 1];
                    rob_is_branch_stop[j] = rob_is_branch_stop[j + 1];
                end
                rob_valid[rob_count - 1]          = 1'b0;
                rob_state[rob_count - 1]          = `ROB_EMPTY;
                rob_executed_ooo[rob_count - 1]   = 1'b0;
                rob_is_branch_stop[rob_count - 1] = 1'b0;
                rob_count = rob_count - 3'd1;
            end
        end
    endtask

    task decode_and_push_rob(input [31:0] f_pc, input [31:0] f_inst);
        reg [6:0] op;
        reg [4:0] d_rd, d_rs1, d_rs2;
        reg [4:0] f5;
        begin
            op    = f_inst[6:0];
            d_rd  = f_inst[11:7];
            d_rs1 = f_inst[19:15];
            d_rs2 = f_inst[24:20];
            f5    = f_inst[31:27];

            rob_valid[rob_count]          = 1'b1;
            rob_pc[rob_count]             = f_pc;
            rob_inst[rob_count]           = f_inst;
            rob_state[rob_count]          = `ROB_READY;
            rob_wait_reg[rob_count]       = 8'd0;
            rob_result[rob_count]         = 32'd0;
            rob_executed_ooo[rob_count]   = 1'b0;
            rob_has_rd[rob_count]         = 1'b0;
            rob_rd[rob_count]             = 5'd0;
            rob_rs1[rob_count]            = 5'd0;
            rob_rs2[rob_count]            = 5'd0;
            rob_is_branch_stop[rob_count] = 1'b0;

            case (op)
                7'h33: begin
                    rob_has_rd[rob_count] = (d_rd != 5'd0);
                    rob_rd[rob_count]     = d_rd;
                    rob_rs1[rob_count]    = d_rs1;
                    rob_rs2[rob_count]    = d_rs2;
                end
                7'h13, 7'h03: begin
                    rob_has_rd[rob_count] = (d_rd != 5'd0);
                    rob_rd[rob_count]     = d_rd;
                    rob_rs1[rob_count]    = d_rs1;
                end
                7'h23: begin
                    rob_rs1[rob_count] = d_rs1;
                    rob_rs2[rob_count] = d_rs2;
                end
                7'h37, 7'h17: begin
                    rob_has_rd[rob_count] = (d_rd != 5'd0);
                    rob_rd[rob_count]     = d_rd;
                end
                7'h63: begin
                    rob_rs1[rob_count]            = d_rs1;
                    rob_rs2[rob_count]            = d_rs2;
                    rob_is_branch_stop[rob_count] = 1'b1;
                end
                7'h6F: begin
                    rob_has_rd[rob_count]         = (d_rd != 5'd0);
                    rob_rd[rob_count]             = d_rd;
                    rob_is_branch_stop[rob_count] = 1'b1;
                end
                7'h67: begin
                    rob_has_rd[rob_count]         = (d_rd != 5'd0);
                    rob_rd[rob_count]             = d_rd;
                    rob_rs1[rob_count]            = d_rs1;
                    rob_is_branch_stop[rob_count] = 1'b1;
                end
                7'h0F: begin
                    rob_is_branch_stop[rob_count] = 1'b1;
                end
                7'h2F: begin
                    rob_has_rd[rob_count]         = (d_rd != 5'd0);
                    rob_rd[rob_count]             = d_rd;
                    rob_rs1[rob_count]            = d_rs1;
                    rob_rs2[rob_count]            = (f5 == 5'h02) ? 5'd0 : d_rs2;
                    rob_is_branch_stop[rob_count] = 1'b1;
                end
                7'h73: begin
                    rob_has_rd[rob_count]         = (d_rd != 5'd0);
                    rob_rd[rob_count]             = d_rd;
                    rob_rs1[rob_count]            = d_rs1;
                    rob_is_branch_stop[rob_count] = 1'b1;
                end
                default: ;
            endcase
            rob_count = rob_count + 3'd1;
        end
    endtask

endmodule
