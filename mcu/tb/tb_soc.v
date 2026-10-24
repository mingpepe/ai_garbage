`timescale 1ns / 1ps

// ============================================================================
// Dual-Core RISC-V SoC + Host I2C Master Testbench
//   - Dumps VCD waveform to "soc_wave.vcd" for GTKWave inspection
//   - Simulates SoC booting Core 0, Core 0 booting Core 1, Atomic Spinlock,
//     Shared Memory state, IPI interrupts, AND Host I2C Master:
//       * Bank switching via 0x7F (Bank 0 <-> Bank 1)
//       * Host-vs-FW Register Bank Arbitration
//       * Host polling Bank 0 Reg 0x04 (B0_RPT_STATUS)
//       * Host reading 32-byte Report Buffer via Special Port Bank 0 Reg 0x0F
// ============================================================================
module tb_soc;

    reg clk;
    reg rst_n;

    // Open-drain I2C bus signals
    reg  host_scl;
    reg  host_sda_drive_low;
    wire i2c_sda_oe;
    wire i2c_sda = (host_sda_drive_low || i2c_sda_oe) ? 1'b0 : 1'b1;

    wire        core0_boot_active;
    wire        core1_boot_active;
    wire [31:0] core0_pc;
    wire [31:0] core1_pc;
    wire [31:0] core0_instr;
    wire [31:0] core1_instr;
    wire        core0_irq_ipi;
    wire        core1_irq_ipi;
    wire        core0_in_trap;
    wire        core1_in_trap;
    wire        core0_wfi;
    wire        core1_wfi;
    wire [31:0] shm_spinlock;
    wire [31:0] shm_shared_counter;
    wire [31:0] shm_core1_booted;
    wire [31:0] shm_ipi_ping_pong;
    wire [31:0] sim_done_flags;

    wire        dbg_host_bank_sel;
    wire        dbg_fw_bank_sel;
    wire        dbg_arb_grant_host;
    wire        dbg_arb_grant_fw;
    wire        dbg_arb_conflict;
    wire [7:0]  dbg_rpt_wr_ptr;
    wire [7:0]  dbg_rpt_rd_ptr;
    wire [7:0]  dbg_rpt_status;
    wire [7:0]  dbg_rpt_len;
    wire [31:0] dbg_arb_conflict_cnt;

    dual_core_soc #(
        .CORE0_HEX_FILE("fw/build/fw_core0.hex"),
        .CORE1_HEX_FILE("fw/build/fw_core1.hex")
    ) u_soc (
        .clk                  (clk),
        .rst_n                (rst_n),
        .i2c_scl              (host_scl),
        .i2c_sda_in           (i2c_sda),
        .i2c_sda_oe           (i2c_sda_oe),
        .core0_boot_active    (core0_boot_active),
        .core1_boot_active    (core1_boot_active),
        .core0_pc             (core0_pc),
        .core1_pc             (core1_pc),
        .core0_instr          (core0_instr),
        .core1_instr          (core1_instr),
        .core0_irq_ipi        (core0_irq_ipi),
        .core1_irq_ipi        (core1_irq_ipi),
        .core0_in_trap        (core0_in_trap),
        .core1_in_trap        (core1_in_trap),
        .core0_wfi            (core0_wfi),
        .core1_wfi            (core1_wfi),
        .shm_spinlock         (shm_spinlock),
        .shm_shared_counter   (shm_shared_counter),
        .shm_core1_booted     (shm_core1_booted),
        .shm_ipi_ping_pong    (shm_ipi_ping_pong),
        .sim_done_flags       (sim_done_flags),
        .dbg_host_bank_sel    (dbg_host_bank_sel),
        .dbg_fw_bank_sel      (dbg_fw_bank_sel),
        .dbg_arb_grant_host   (dbg_arb_grant_host),
        .dbg_arb_grant_fw     (dbg_arb_grant_fw),
        .dbg_arb_conflict     (dbg_arb_conflict),
        .dbg_rpt_wr_ptr       (dbg_rpt_wr_ptr),
        .dbg_rpt_rd_ptr       (dbg_rpt_rd_ptr),
        .dbg_rpt_status       (dbg_rpt_status),
        .dbg_rpt_len          (dbg_rpt_len),
        .dbg_arb_conflict_cnt (dbg_arb_conflict_cnt)
    );

    // 100 MHz clock (10 ns period)
    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    // VCD Waveform Dump
    initial begin
        $dumpfile("soc_wave.vcd");
        $dumpvars(0, tb_soc);
    end

    // ========================================================================
    // Host I2C Master Bus Tasks (7-bit Slave Address = 0x42)
    // ========================================================================
    localparam [6:0] SLAVE_ADDR = 7'h42;

    task i2c_wait_half_bit;
        begin
            repeat (3) @(negedge clk);
        end
    endtask

    task i2c_start;
        begin
            host_sda_drive_low = 1'b0;
            i2c_wait_half_bit();
            host_scl           = 1'b1;
            i2c_wait_half_bit();
            host_sda_drive_low = 1'b1; // SDA falls while SCL is high
            i2c_wait_half_bit();
            host_scl           = 1'b0;
            i2c_wait_half_bit();
        end
    endtask

    task i2c_stop;
        begin
            host_scl           = 1'b0;
            i2c_wait_half_bit();
            host_sda_drive_low = 1'b1;
            i2c_wait_half_bit();
            host_scl           = 1'b1;
            i2c_wait_half_bit();
            host_sda_drive_low = 1'b0; // SDA rises while SCL is high
            i2c_wait_half_bit();
        end
    endtask

    task i2c_write_byte(
        input  [7:0] tx_b,
        output       ack_ok
    );
        integer b;
        begin
            for (b = 7; b >= 0; b = b - 1) begin
                host_sda_drive_low = ~tx_b[b];
                i2c_wait_half_bit();
                host_scl = 1'b1;
                i2c_wait_half_bit();
                host_scl = 1'b0;
                i2c_wait_half_bit();
            end
            // Release SDA for Slave ACK
            host_sda_drive_low = 1'b0;
            i2c_wait_half_bit();
            host_scl = 1'b1;
            i2c_wait_half_bit();
            ack_ok   = (i2c_sda == 1'b0);
            host_scl = 1'b0;
            i2c_wait_half_bit();
        end
    endtask

    task i2c_read_byte(
        input        send_ack, // 1 = drive ACK (continue), 0 = NACK (last byte)
        output [7:0] rx_b
    );
        integer b;
        begin
            host_sda_drive_low = 1'b0;
            i2c_wait_half_bit();
            for (b = 7; b >= 0; b = b - 1) begin
                host_scl = 1'b1;
                i2c_wait_half_bit();
                rx_b[b]  = i2c_sda;
                host_scl = 1'b0;
                i2c_wait_half_bit();
            end
            // Drive Master ACK (low) or NACK (high)
            host_sda_drive_low = send_ack ? 1'b1 : 1'b0;
            i2c_wait_half_bit();
            host_scl = 1'b1;
            i2c_wait_half_bit();
            host_scl           = 1'b0;
            i2c_wait_half_bit();
            host_sda_drive_low = 1'b0;
            i2c_wait_half_bit();
        end
    endtask

    task host_i2c_write_reg(
        input [7:0] reg_addr,
        input [7:0] val
    );
        reg ack;
        begin
            i2c_start();
            i2c_write_byte({SLAVE_ADDR, 1'b0}, ack);
            i2c_write_byte(reg_addr, ack);
            i2c_write_byte(val, ack);
            i2c_stop();
        end
    endtask

    task host_i2c_read_reg(
        input  [7:0] reg_addr,
        output [7:0] val
    );
        reg ack;
        begin
            i2c_start();
            i2c_write_byte({SLAVE_ADDR, 1'b0}, ack);
            i2c_write_byte(reg_addr, ack);
            i2c_start(); // Repeated START
            i2c_write_byte({SLAVE_ADDR, 1'b1}, ack);
            i2c_read_byte(1'b0, val); // NACK after 1 byte
            i2c_stop();
        end
    endtask

    // ========================================================================
    // Host Application Simulation Process (I2C Polling + Bank Switch + 0x0F Read)
    // ========================================================================
    reg [7:0] host_rx_buf [0:31];
    reg [7:0] poll_status;
    reg [7:0] rpt_len;
    reg [7:0] rpt_expected_csum;
    reg [7:0] rpt_calc_csum;
    reg [7:0] b1_spin_cnt, b1_ipi_hops, b1_sig0, b1_sig1, b1_sig2, b1_sig3, b1_reg0f;
    reg [7:0] cur_bank;
    reg       ack_tmp;
    integer   poll_cnt;
    integer   k;

    initial begin
        host_scl           = 1'b1;
        host_sda_drive_low = 1'b0;
        poll_status        = 8'h00;
        poll_cnt           = 0;

        wait (rst_n == 1'b1);
        repeat (50) @(posedge clk);

        $display("[Host I2C App] Selecting Bank 0 (write 0x7F = 0x00) & polling Reg 0x04 (B0_RPT_STATUS)...");
        host_i2c_write_reg(8'h7F, 8'h00);

        while (poll_status != 8'h01 && poll_cnt < 200) begin
            host_i2c_read_reg(8'h04, poll_status);
            poll_cnt = poll_cnt + 1;
        end

        $display("[Host I2C App] Detected B0_RPT_STATUS == 0x%02x after %0d I2C polls!", poll_status, poll_cnt);

        // 1. Switch to Bank 1 (write 0x7F = 0x01) and verify Bank 1 registers
        $display("[Host I2C App] Switching to Bank 1 (write 0x7F = 0x01) to read diagnostics...");
        host_i2c_write_reg(8'h7F, 8'h01);
        host_i2c_read_reg(8'h7F, cur_bank);
        host_i2c_read_reg(8'h02, b1_spin_cnt);
        host_i2c_read_reg(8'h03, b1_ipi_hops);
        host_i2c_read_reg(8'h10, b1_sig0);
        host_i2c_read_reg(8'h11, b1_sig1);
        host_i2c_read_reg(8'h12, b1_sig2);
        host_i2c_read_reg(8'h13, b1_sig3);
        host_i2c_read_reg(8'h0F, b1_reg0f);
        $display("[Host I2C App] Bank %0d Read: SpinCnt=%0d, IpiHops=%0d, Sig=%02x%02x%02x%02x, Bank1_Reg0x0F=0x%02x",
                 cur_bank, b1_spin_cnt, b1_ipi_hops, b1_sig0, b1_sig1, b1_sig2, b1_sig3, b1_reg0f);

        // 2. Switch back to Bank 0 (write 0x7F = 0x00)
        $display("[Host I2C App] Switching to Bank 0 (write 0x7F = 0x00) to read Report Buffer via Special Port 0x0F...");
        host_i2c_write_reg(8'h7F, 8'h00);
        host_i2c_read_reg(8'h05, rpt_len);
        host_i2c_read_reg(8'h08, rpt_expected_csum);

        // 3. Burst-read all 32 bytes of Report Buffer from Bank 0 Special Port 0x0F
        i2c_start();
        i2c_write_byte({SLAVE_ADDR, 1'b0}, ack_tmp);
        i2c_write_byte(8'h0F, ack_tmp); // Special Port 0x0F in Bank 0!
        i2c_start();
        i2c_write_byte({SLAVE_ADDR, 1'b1}, ack_tmp);

        rpt_calc_csum = 8'h00;
        for (k = 0; k < 32; k = k + 1) begin
            i2c_read_byte((k < 31) ? 1'b1 : 1'b0, host_rx_buf[k]);
            rpt_calc_csum = rpt_calc_csum + host_rx_buf[k];
        end
        i2c_stop();

        $display("[Host I2C App] Read %0d bytes from Bank 0 Port 0x0F (Report Buffer):", rpt_len);
        $display("  Header   : %c%c%c v%0d", host_rx_buf[0], host_rx_buf[1], host_rx_buf[2], host_rx_buf[3]);
        $display("  Stats    : SharedCnt=%0d, IpiPingPong=%0d, Core0Ipi=%0d, Core1Ipi=%0d",
                 host_rx_buf[4], host_rx_buf[5], host_rx_buf[6], host_rx_buf[7]);
        $display("  Trailer  : 0x%02x%02x%02x%02x", host_rx_buf[28], host_rx_buf[29], host_rx_buf[30], host_rx_buf[31]);
        $display("  Checksum : Calc=0x%02x, Expected=0x%02x", rpt_calc_csum, rpt_expected_csum);

        // 4. Write ACK (0x02) to Bank 0 Reg 0x04 (B0_RPT_STATUS) to notify FW
        $display("[Host I2C App] Sending ACK (0x02) to Bank 0 Reg 0x04...");
        host_i2c_write_reg(8'h04, 8'h02);
    end

    // ========================================================================
    // Main Simulation Reset & Verification Monitor
    // ========================================================================
    integer cycle_cnt;
    initial begin
        rst_n     = 1'b0;
        cycle_cnt = 0;
        $display("==================================================================");
        $display("[Verilog TB] Starting Dual-Core RISC-V SoC + I2C Host Simulation...");
        $display("[Verilog TB] VCD Waveform output: soc_wave.vcd");
        $display("==================================================================");

        #25;
        rst_n = 1'b1;

        while (sim_done_flags != 32'h0000_0003 && cycle_cnt < 100000) begin
            @(posedge clk);
            cycle_cnt = cycle_cnt + 1;
        end

        repeat (20) @(posedge clk);

        $display("==================================================================");
        $display("[Verilog TB] Simulation Finished at cycle %0d", cycle_cnt);
        $display("  sim_done_flags     = 0x%08x (Expected: 0x00000003)", sim_done_flags);
        $display("  shm_spinlock       = %0d          (Expected: 0)", shm_spinlock);
        $display("  shm_shared_counter = %0d         (Expected: 10)", shm_shared_counter);
        $display("  shm_core1_booted   = %0d          (Expected: 1)", shm_core1_booted);
        $display("  shm_ipi_ping_pong  = %0d          (Expected: 4)", shm_ipi_ping_pong);
        $display("  rpt_wr_ptr / rd_ptr= %0d / %0d    (Expected: 32 / 32)", dbg_rpt_wr_ptr, dbg_rpt_rd_ptr);
        $display("  rpt_checksum_match = 0x%02x == 0x%02x", rpt_calc_csum, rpt_expected_csum);
        $display("==================================================================");

        if (sim_done_flags == 32'h0000_0003 &&
            shm_spinlock == 32'd0 &&
            shm_shared_counter == 32'd10 &&
            shm_core1_booted == 32'd1 &&
            shm_ipi_ping_pong == 32'd4 &&
            dbg_rpt_rd_ptr == 8'd32 &&
            rpt_calc_csum == rpt_expected_csum &&
            b1_sig0 == 8'hB1 && b1_reg0f == 8'hA5) begin
            $display("[Verilog TB] >>> ALL VERILOG SOC + I2C REGBANK + REPORT BUFFER CHECKS PASSED! <<<");
        end else begin
            $display("[Verilog TB] >>> ERROR: VERILOG SOC CHECK FAILED! <<<");
            $fatal(1);
        end

        $finish;
    end

endmodule
