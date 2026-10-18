`timescale 1ns/1ps
`include "defines.vh"

module tb_soc;
    reg         clk;
    reg         rst_n;
    wire [31:0] cycle;

    dual_core_soc u_soc (
        .clk   (clk),
        .rst_n (rst_n),
        .cycle (cycle)
    );

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    function [8*8-1:0] bus_cmd_name(input [2:0] c);
        begin
            case (c)
                `BUS_NONE: bus_cmd_name = "IDLE";
                `BUS_RD:   bus_cmd_name = "BusRd";
                `BUS_RDX:  bus_cmd_name = "BusRdX";
                `BUS_UPGR: bus_cmd_name = "BusUpgr";
                `BUS_WB:   bus_cmd_name = "BusWB";
                default:   bus_cmd_name = "?";
            endcase
        end
    endfunction

    function [8*10-1:0] rob_state_name(input [2:0] s, input is_head);
        begin
            if (is_head && s == `ROB_DONE) rob_state_name = "DONE";
            else begin
                case (s)
                    `ROB_EMPTY:    rob_state_name = "EMPTY";
                    `ROB_READY:    rob_state_name = "READY";
                    `ROB_WAIT_DEP: rob_state_name = "WAIT_DEP";
                    `ROB_MEM_WAIT: rob_state_name = "MEM_WAIT";
                    `ROB_DONE:     rob_state_name = "OOO_DONE";
                    default:       rob_state_name = "?";
                endcase
            end
        end
    endfunction

    task fwrite_trimmed(input integer fd, input [8*160-1:0] s);
        integer b;
        reg [7:0] ch;
        reg started;
        begin
            started = 1'b0;
            for (b = 159; b >= 0; b = b - 1) begin
                ch = (s >> (b * 8)) & 8'hFF;
                if (ch != 8'h00 && (started || ch != 8'h20)) begin
                    started = 1'b1;
                    $fwrite(fd, "%c", ch);
                end
            end
        end
    endtask

    reg [8*256-1:0] hex_path;
    reg [8*256-1:0] json_path;
    reg [8*256-1:0] vcd_path;
    integer         max_cycles;
    integer         jf;
    reg             has_json;
    reg             first_cycle;
    integer         e, i, r, s, l;

    initial begin
        if (!$value$plusargs("HEX=%s", hex_path)) begin
            $display("ERROR: Missing +HEX=<firmware.hex>");
            $finish;
        end
        has_json = $value$plusargs("JSON=%s", json_path);
        if ($value$plusargs("VCD=%s", vcd_path)) begin
            $dumpfile(vcd_path);
            $dumpvars(0, tb_soc);
        end
        if (!$value$plusargs("MAX_CYCLES=%d", max_cycles)) begin
            max_cycles = 600;
        end

        // Initialize ROM with NOPs then load firmware hex
        for (i = 0; i < 1024; i = i + 1) u_soc.rom[i] = 32'h0000_0013;
        $readmemh(hex_path, u_soc.rom);

        jf = 0;
        if (has_json) begin
            jf = $fopen(json_path, "w");
            if (jf) begin
                $fwrite(jf, "{\n  \"engine\": \"verilog_rtl\",\n  \"firmware\": \"%0s\",\n  \"cycles\": [\n", hex_path);
            end
        end

        $display("================================================================================");
        $display(" [Verilog RTL] Running Dual-Core RV32IA SoC on %0s", hex_path);
        $display("================================================================================");

        rst_n = 1'b1;
        #1;
        rst_n = 1'b0;
        #2;
        rst_n = 1'b1;

        first_cycle = 1'b1;

        while (cycle < max_cycles) begin
            @(posedge clk);
            #1; // Wait for non-blocking / procedural updates to settle

            for (e = 0; e < u_soc.event_count; e = e + 1) begin
                $write("  [Cycle %3d] ", cycle);
                fwrite_trimmed(32'h8000_0001, u_soc.events[e]);
                $write("\n");
            end

            if (jf) begin
                if (!first_cycle) $fwrite(jf, ",\n");
                first_cycle = 1'b0;
                $fwrite(jf, "    {\n");
                $fwrite(jf, "      \"cycle\": %0d,\n", cycle);
                $fwrite(jf, "      \"bus\": {\"busy\": %0s, \"owner\": %0d, \"cmd\": \"%0s\", \"addr\": \"0x%04x\", \"rdata\": \"0x%08x\", \"phase\": %0d, \"snoop_hit\": %0s, \"snoop_dirty\": %0s, \"snoop_inv_res\": %0s},\n",
                        u_soc.u_bus.busy ? "true" : "false",
                        u_soc.u_bus.owner,
                        bus_cmd_name(u_soc.u_bus.cmd),
                        u_soc.u_bus.addr[15:0],
                        u_soc.u_bus.rdata,
                        u_soc.u_bus.timer,
                        u_soc.u_bus.snoop_hit ? "true" : "false",
                        u_soc.u_bus.snoop_dirty ? "true" : "false",
                        u_soc.u_bus.snoop_inv_res ? "true" : "false");

                $fwrite(jf, "      \"shm\": [");
                for (i = 0; i < 8; i = i + 1) begin
                    if (i > 0) $fwrite(jf, ", ");
                    $fwrite(jf, "\"0x%08x\"", u_soc.shm[i]);
                end
                $fwrite(jf, "],\n");

                $fwrite(jf, "      \"cores\": [\n");
                // Core 0 JSON
                $fwrite(jf, "        {\n");
                $fwrite(jf, "          \"hartid\": 0, \"pc\": \"0x%04x\", \"halted\": %0s, \"ooo_enable\": %0d, \"phase\": %0d,\n",
                        u_soc.u_core0.pc[15:0], u_soc.u_core0.halted ? "true" : "false", u_soc.u_core0.ooo_enable, u_soc.u_core0.phase_tag);
                $fwrite(jf, "          \"res_valid\": %0s, \"res_addr\": \"0x%04x\",\n",
                        u_soc.u_core0.res_valid ? "true" : "false", u_soc.u_core0.res_addr[15:0]);
                $fwrite(jf, "          \"last_commit_valid\": %0s, \"last_commit_pc\": \"0x%04x\", \"last_commit_inst\": \"0x%08x\",\n",
                        u_soc.u_core0.last_commit_valid ? "true" : "false", u_soc.u_core0.last_commit_pc[15:0], u_soc.u_core0.last_commit_inst);
                $fwrite(jf, "          \"vis\": {\"sb_fwd\": %0s, \"sb_fwd_addr\": \"0x%04x\", \"sb_fwd_data\": \"0x%08x\", \"sb_drain\": %0s, \"sb_drain_addr\": \"0x%04x\", \"l1_hit\": %0s, \"l1_hit_addr\": \"0x%04x\", \"ooo_fire\": %0s, \"ooo_pc\": \"0x%04x\"},\n",
                        u_soc.u_core0.vis_sb_fwd ? "true" : "false", u_soc.u_core0.vis_sb_fwd_addr[15:0], u_soc.u_core0.vis_sb_fwd_data,
                        u_soc.u_core0.vis_sb_drain ? "true" : "false", u_soc.u_core0.vis_sb_drain_addr[15:0],
                        u_soc.u_core0.vis_l1_hit ? "true" : "false", u_soc.u_core0.vis_l1_hit_addr[15:0],
                        u_soc.u_core0.vis_ooo_fire ? "true" : "false", u_soc.u_core0.vis_ooo_pc[15:0]);
                $fwrite(jf, "          \"stats\": {\"ret\": %0d, \"ooo\": %0d, \"sb_enq\": %0d, \"sb_fwd\": %0d, \"sb_drain\": %0d, \"l1_hit\": %0d, \"l1_miss\": %0d, \"lr\": %0d, \"sc_ok\": %0d, \"sc_fail\": %0d, \"amo\": %0d},\n",
                        u_soc.u_core0.cnt_inst_ret, u_soc.u_core0.cnt_ooo_exec, u_soc.u_core0.cnt_sb_enq, u_soc.u_core0.cnt_sb_fwd,
                        u_soc.u_core0.cnt_sb_drain, u_soc.u_core0.cnt_l1_hit, u_soc.u_core0.cnt_l1_miss,
                        u_soc.u_core0.cnt_lr, u_soc.u_core0.cnt_sc_ok, u_soc.u_core0.cnt_sc_fail, u_soc.u_core0.cnt_amo);
                $fwrite(jf, "          \"regs\": {\"t0\": \"0x%08x\", \"a0\": \"0x%08x\", \"a1\": \"0x%08x\", \"a2\": \"0x%08x\", \"a3\": \"0x%08x\", \"a4\": \"0x%08x\", \"a5\": \"0x%08x\", \"a6\": \"0x%08x\"},\n",
                        u_soc.u_core0.regs[5], u_soc.u_core0.regs[10], u_soc.u_core0.regs[11], u_soc.u_core0.regs[12],
                        u_soc.u_core0.regs[13], u_soc.u_core0.regs[14], u_soc.u_core0.regs[15], u_soc.u_core0.regs[16]);

                $fwrite(jf, "          \"rob\": [");
                for (r = 0; r < u_soc.u_core0.rob_count; r = r + 1) begin
                    if (r > 0) $fwrite(jf, ", ");
                    $fwrite(jf, "{\"pc\": \"0x%04x\", \"inst\": \"0x%08x\", \"state\": \"%0s\", \"rd\": %0d, \"rs1\": %0d, \"rs2\": %0d, \"wait_reg\": %0d, \"result\": \"0x%08x\", \"ooo\": %0s}",
                            u_soc.u_core0.rob_pc[r][15:0], u_soc.u_core0.rob_inst[r],
                            rob_state_name(u_soc.u_core0.rob_state[r], r == 0),
                            u_soc.u_core0.rob_rd[r], u_soc.u_core0.rob_rs1[r], u_soc.u_core0.rob_rs2[r],
                            u_soc.u_core0.rob_wait_reg[r], u_soc.u_core0.rob_result[r],
                            u_soc.u_core0.rob_executed_ooo[r] ? "true" : "false");
                end
                $fwrite(jf, "],\n");

                $fwrite(jf, "          \"sb\": [");
                for (s = 0; s < u_soc.u_core0.u_sb.count; s = s + 1) begin
                    if (s > 0) $fwrite(jf, ", ");
                    $fwrite(jf, "{\"addr\": \"0x%04x\", \"data\": \"0x%08x\", \"pc\": \"0x%04x\"}",
                            u_soc.u_core0.u_sb.addr[s][15:0], u_soc.u_core0.u_sb.data[s], u_soc.u_core0.u_sb.pc[s][15:0]);
                end
                $fwrite(jf, "],\n");

                $fwrite(jf, "          \"l1\": [");
                for (l = 0; l < 8; l = l + 1) begin
                    if (l > 0) $fwrite(jf, ", ");
                    $fwrite(jf, "{\"line\": %0d, \"state\": \"%c\", \"addr\": \"0x%04x\", \"data\": \"0x%08x\"}",
                            l, u_soc.mesi_char(u_soc.u_core0.u_l1.state[l]), u_soc.u_core0.u_l1.addr[l][15:0], u_soc.u_core0.u_l1.data[l]);
                end
                $fwrite(jf, "]\n        },\n");

                // Core 1 JSON
                $fwrite(jf, "        {\n");
                $fwrite(jf, "          \"hartid\": 1, \"pc\": \"0x%04x\", \"halted\": %0s, \"ooo_enable\": %0d, \"phase\": %0d,\n",
                        u_soc.u_core1.pc[15:0], u_soc.u_core1.halted ? "true" : "false", u_soc.u_core1.ooo_enable, u_soc.u_core1.phase_tag);
                $fwrite(jf, "          \"res_valid\": %0s, \"res_addr\": \"0x%04x\",\n",
                        u_soc.u_core1.res_valid ? "true" : "false", u_soc.u_core1.res_addr[15:0]);
                $fwrite(jf, "          \"last_commit_valid\": %0s, \"last_commit_pc\": \"0x%04x\", \"last_commit_inst\": \"0x%08x\",\n",
                        u_soc.u_core1.last_commit_valid ? "true" : "false", u_soc.u_core1.last_commit_pc[15:0], u_soc.u_core1.last_commit_inst);
                $fwrite(jf, "          \"vis\": {\"sb_fwd\": %0s, \"sb_fwd_addr\": \"0x%04x\", \"sb_fwd_data\": \"0x%08x\", \"sb_drain\": %0s, \"sb_drain_addr\": \"0x%04x\", \"l1_hit\": %0s, \"l1_hit_addr\": \"0x%04x\", \"ooo_fire\": %0s, \"ooo_pc\": \"0x%04x\"},\n",
                        u_soc.u_core1.vis_sb_fwd ? "true" : "false", u_soc.u_core1.vis_sb_fwd_addr[15:0], u_soc.u_core1.vis_sb_fwd_data,
                        u_soc.u_core1.vis_sb_drain ? "true" : "false", u_soc.u_core1.vis_sb_drain_addr[15:0],
                        u_soc.u_core1.vis_l1_hit ? "true" : "false", u_soc.u_core1.vis_l1_hit_addr[15:0],
                        u_soc.u_core1.vis_ooo_fire ? "true" : "false", u_soc.u_core1.vis_ooo_pc[15:0]);
                $fwrite(jf, "          \"stats\": {\"ret\": %0d, \"ooo\": %0d, \"sb_enq\": %0d, \"sb_fwd\": %0d, \"sb_drain\": %0d, \"l1_hit\": %0d, \"l1_miss\": %0d, \"lr\": %0d, \"sc_ok\": %0d, \"sc_fail\": %0d, \"amo\": %0d},\n",
                        u_soc.u_core1.cnt_inst_ret, u_soc.u_core1.cnt_ooo_exec, u_soc.u_core1.cnt_sb_enq, u_soc.u_core1.cnt_sb_fwd,
                        u_soc.u_core1.cnt_sb_drain, u_soc.u_core1.cnt_l1_hit, u_soc.u_core1.cnt_l1_miss,
                        u_soc.u_core1.cnt_lr, u_soc.u_core1.cnt_sc_ok, u_soc.u_core1.cnt_sc_fail, u_soc.u_core1.cnt_amo);
                $fwrite(jf, "          \"regs\": {\"t0\": \"0x%08x\", \"a0\": \"0x%08x\", \"a1\": \"0x%08x\", \"a2\": \"0x%08x\", \"a3\": \"0x%08x\", \"a4\": \"0x%08x\", \"a5\": \"0x%08x\", \"a6\": \"0x%08x\"},\n",
                        u_soc.u_core1.regs[5], u_soc.u_core1.regs[10], u_soc.u_core1.regs[11], u_soc.u_core1.regs[12],
                        u_soc.u_core1.regs[13], u_soc.u_core1.regs[14], u_soc.u_core1.regs[15], u_soc.u_core1.regs[16]);

                $fwrite(jf, "          \"rob\": [");
                for (r = 0; r < u_soc.u_core1.rob_count; r = r + 1) begin
                    if (r > 0) $fwrite(jf, ", ");
                    $fwrite(jf, "{\"pc\": \"0x%04x\", \"inst\": \"0x%08x\", \"state\": \"%0s\", \"rd\": %0d, \"rs1\": %0d, \"rs2\": %0d, \"wait_reg\": %0d, \"result\": \"0x%08x\", \"ooo\": %0s}",
                            u_soc.u_core1.rob_pc[r][15:0], u_soc.u_core1.rob_inst[r],
                            rob_state_name(u_soc.u_core1.rob_state[r], r == 0),
                            u_soc.u_core1.rob_rd[r], u_soc.u_core1.rob_rs1[r], u_soc.u_core1.rob_rs2[r],
                            u_soc.u_core1.rob_wait_reg[r], u_soc.u_core1.rob_result[r],
                            u_soc.u_core1.rob_executed_ooo[r] ? "true" : "false");
                end
                $fwrite(jf, "],\n");

                $fwrite(jf, "          \"sb\": [");
                for (s = 0; s < u_soc.u_core1.u_sb.count; s = s + 1) begin
                    if (s > 0) $fwrite(jf, ", ");
                    $fwrite(jf, "{\"addr\": \"0x%04x\", \"data\": \"0x%08x\", \"pc\": \"0x%04x\"}",
                            u_soc.u_core1.u_sb.addr[s][15:0], u_soc.u_core1.u_sb.data[s], u_soc.u_core1.u_sb.pc[s][15:0]);
                end
                $fwrite(jf, "],\n");

                $fwrite(jf, "          \"l1\": [");
                for (l = 0; l < 8; l = l + 1) begin
                    if (l > 0) $fwrite(jf, ", ");
                    $fwrite(jf, "{\"line\": %0d, \"state\": \"%c\", \"addr\": \"0x%04x\", \"data\": \"0x%08x\"}",
                            l, u_soc.mesi_char(u_soc.u_core1.u_l1.state[l]), u_soc.u_core1.u_l1.addr[l][15:0], u_soc.u_core1.u_l1.data[l]);
                end
                $fwrite(jf, "]\n        }\n      ],\n");

                $fwrite(jf, "      \"events\": [");
                for (e = 0; e < u_soc.event_count; e = e + 1) begin
                    if (e > 0) $fwrite(jf, ", ");
                    $fwrite(jf, "\"");
                    fwrite_trimmed(jf, u_soc.events[e]);
                    $fwrite(jf, "\"");
                end
                $fwrite(jf, "]\n    }");
            end

            if (u_soc.u_core0.halted && u_soc.u_core1.halted &&
                u_soc.u_core0.u_sb.count == 0 && u_soc.u_core1.u_sb.count == 0 &&
                !u_soc.u_bus.busy) begin
                max_cycles = 0; // Break loop
            end
        end

        if (jf) begin
            $fwrite(jf, "\n  ]\n}\n");
            $fclose(jf);
        end

        $display("--------------------------------------------------------------------------------");
        $display(" Simulation finished in %0d cycles.", cycle);
        $display(" Core 0 Stats: Retired=%0d, OoO_Exec=%0d, SB_Enq=%0d, SB_Fwd=%0d, SB_Drain=%0d, L1_Hit=%0d, L1_Miss=%0d, LR=%0d, SC_OK=%0d, SC_Fail=%0d, AMO=%0d",
                 u_soc.u_core0.cnt_inst_ret, u_soc.u_core0.cnt_ooo_exec, u_soc.u_core0.cnt_sb_enq,
                 u_soc.u_core0.cnt_sb_fwd, u_soc.u_core0.cnt_sb_drain, u_soc.u_core0.cnt_l1_hit,
                 u_soc.u_core0.cnt_l1_miss, u_soc.u_core0.cnt_lr, u_soc.u_core0.cnt_sc_ok,
                 u_soc.u_core0.cnt_sc_fail, u_soc.u_core0.cnt_amo);
        $display(" Core 1 Stats: Retired=%0d, OoO_Exec=%0d, SB_Enq=%0d, SB_Fwd=%0d, SB_Drain=%0d, L1_Hit=%0d, L1_Miss=%0d, LR=%0d, SC_OK=%0d, SC_Fail=%0d, AMO=%0d",
                 u_soc.u_core1.cnt_inst_ret, u_soc.u_core1.cnt_ooo_exec, u_soc.u_core1.cnt_sb_enq,
                 u_soc.u_core1.cnt_sb_fwd, u_soc.u_core1.cnt_sb_drain, u_soc.u_core1.cnt_l1_hit,
                 u_soc.u_core1.cnt_l1_miss, u_soc.u_core1.cnt_lr, u_soc.u_core1.cnt_sc_ok,
                 u_soc.u_core1.cnt_sc_fail, u_soc.u_core1.cnt_amo);
        $display(" Final L1 Cache & Shared RAM State (0x1000 .. 0x101C):");
        for (i = 0; i < 8; i = i + 1) begin
            $display("   [0x%04x] RAM=0x%08x | Core0_L1=[%c] 0x%08x | Core1_L1=[%c] 0x%08x",
                     32'h1000 + (i * 4), u_soc.shm[i],
                     u_soc.mesi_char(u_soc.u_core0.u_l1.state[i]), u_soc.u_core0.u_l1.data[i],
                     u_soc.mesi_char(u_soc.u_core1.u_l1.state[i]), u_soc.u_core1.u_l1.data[i]);
        end
        $display("================================================================================\n");
        $finish;
    end
endmodule
