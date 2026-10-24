`timescale 1ns / 1ps

// ============================================================================
// Dual-Core RISC-V SoC Top-Level Module
//   - Core 0 (RV32IMA_Zicsr, HART_ID=0) booted by SoC on reset at 0x0000_0000
//   - Core 1 (RV32IMA_Zicsr, HART_ID=1) booted by Core 0 via CORE1_BOOT_CTRL
//   - Core 0 Local SRAM (16 KB @ 0x0000_0000)
//   - Core 1 Local SRAM (16 KB @ 0x0001_0000)
//   - Shared Memory     (16 KB @ 0x1000_0000) with Atomic RMW & LR/SC Spinlock
//   - CLINT / IPI & Boot Controller (@ 0x2000_0000)
//   - UART & Debug Event Port       (@ 0x3000_0000)
//   - Dual Register Bank (2 x 0x7F, 0x7F bank switch), Report Buffer (0x0F port),
//     Host-vs-FW Arbiter & I2C Slave (@ 0x4000_0000 / I2C Slave 0x42)
// ============================================================================
module dual_core_soc #(
    parameter CORE0_HEX_FILE = "fw/build/fw_core0.hex",
    parameter CORE1_HEX_FILE = "fw/build/fw_core1.hex"
)(
    input  wire        clk,
    input  wire        rst_n,

    // External Host I2C Interface (Slave Addr = 0x42)
    input  wire        i2c_scl,
    input  wire        i2c_sda_in,
    output wire        i2c_sda_oe,

    // High-level status & waveform debug outputs
    output wire        core0_boot_active,
    output wire        core1_boot_active,
    output wire [31:0] core0_pc,
    output wire [31:0] core1_pc,
    output wire [31:0] core0_instr,
    output wire [31:0] core1_instr,
    output wire        core0_irq_ipi,
    output wire        core1_irq_ipi,
    output wire        core0_in_trap,
    output wire        core1_in_trap,
    output wire        core0_wfi,
    output wire        core1_wfi,
    output wire [31:0] shm_spinlock,
    output wire [31:0] shm_shared_counter,
    output wire [31:0] shm_core1_booted,
    output wire [31:0] shm_ipi_ping_pong,
    output wire [31:0] sim_done_flags,

    // Register Bank, Report Buffer & Host-vs-FW Arbiter Debug Outputs
    output wire        dbg_host_bank_sel,
    output wire        dbg_fw_bank_sel,
    output wire        dbg_arb_grant_host,
    output wire        dbg_arb_grant_fw,
    output wire        dbg_arb_conflict,
    output wire [7:0]  dbg_rpt_wr_ptr,
    output wire [7:0]  dbg_rpt_rd_ptr,
    output wire [7:0]  dbg_rpt_status,
    output wire [7:0]  dbg_rpt_len,
    output wire [31:0] dbg_arb_conflict_cnt
);

    // Master 0 (Core 0) bus signals
    wire        m0_req, m0_we, m0_is_amo, m0_ready;
    wire [3:0]  m0_wstrb;
    wire [4:0]  m0_amo_op;
    wire [31:0] m0_addr, m0_wdata, m0_rdata;

    // Master 1 (Core 1) bus signals
    wire        m1_req, m1_we, m1_is_amo, m1_ready;
    wire [3:0]  m1_wstrb;
    wire [4:0]  m1_amo_op;
    wire [31:0] m1_addr, m1_wdata, m1_rdata;

    // Slave 0: Core 0 SRAM signals
    wire        sram0_req, sram0_we;
    wire [3:0]  sram0_wstrb;
    wire [11:0] sram0_addr;
    wire [31:0] sram0_wdata, sram0_rdata;

    // Slave 1: Core 1 SRAM signals
    wire        sram1_req, sram1_we;
    wire [3:0]  sram1_wstrb;
    wire [11:0] sram1_addr;
    wire [31:0] sram1_wdata, sram1_rdata;

    // Slave 2: Shared SRAM signals
    wire        shm_req, shm_we;
    wire [3:0]  shm_wstrb;
    wire [11:0] shm_addr;
    wire [31:0] shm_wdata, shm_rdata;

    // Slave 3: CLINT IPI & Boot signals
    wire        clint_req, clint_we;
    wire [3:0]  clint_wstrb;
    wire [7:0]  clint_addr;
    wire [31:0] clint_wdata, clint_rdata;

    // Slave 4: UART / Debug signals
    wire        uart_req, uart_we, uart_core_id;
    wire [7:0]  uart_addr;
    wire [31:0] uart_wdata;
    wire [31:0] uart_rdata = 32'd0;

    // Slave 5: Register Bank (2x0x7F) & Report Buffer signals
    wire        regbank_req, regbank_we, regbank_ready;
    wire [3:0]  regbank_wstrb;
    wire [15:0] regbank_addr;
    wire [31:0] regbank_wdata, regbank_rdata;

    // Boot & IPI control wires
    wire        core0_boot_en;
    wire [31:0] core0_boot_addr;
    wire        core1_boot_en;
    wire [31:0] core1_boot_addr;

    // Waveform debug wires from interconnect
    wire        dbg_shm_grant_c0;
    wire        dbg_shm_grant_c1;
    wire        dbg_amo_active;
    wire        dbg_rsv0_valid;
    wire        dbg_rsv1_valid;

    // ========================================================================
    // Core 0 Instance (Booted by SoC on reset at 0x0000_0000)
    // ========================================================================
    riscv_core #(
        .HART_ID(32'd0)
    ) u_core0 (
        .clk             (clk),
        .rst_n           (rst_n),
        .boot_en         (core0_boot_en),
        .boot_addr       (core0_boot_addr),
        .irq_software    (core0_irq_ipi),
        .bus_req         (m0_req),
        .bus_we          (m0_we),
        .bus_wstrb       (m0_wstrb),
        .bus_addr        (m0_addr),
        .bus_wdata       (m0_wdata),
        .bus_is_amo      (m0_is_amo),
        .bus_amo_op      (m0_amo_op),
        .bus_ready       (m0_ready),
        .bus_rdata       (m0_rdata),
        .dbg_pc          (core0_pc),
        .dbg_instr       (core0_instr),
        .dbg_boot_active (core0_boot_active),
        .dbg_in_trap     (core0_in_trap),
        .dbg_wfi         (core0_wfi)
    );

    // ========================================================================
    // Core 1 Instance (Booted by Core 0 writing to CORE1_BOOT_CTRL)
    // ========================================================================
    riscv_core #(
        .HART_ID(32'd1)
    ) u_core1 (
        .clk             (clk),
        .rst_n           (rst_n),
        .boot_en         (core1_boot_en),
        .boot_addr       (core1_boot_addr),
        .irq_software    (core1_irq_ipi),
        .bus_req         (m1_req),
        .bus_we          (m1_we),
        .bus_wstrb       (m1_wstrb),
        .bus_addr        (m1_addr),
        .bus_wdata       (m1_wdata),
        .bus_is_amo      (m1_is_amo),
        .bus_amo_op      (m1_amo_op),
        .bus_ready       (m1_ready),
        .bus_rdata       (m1_rdata),
        .dbg_pc          (core1_pc),
        .dbg_instr       (core1_instr),
        .dbg_boot_active (core1_boot_active),
        .dbg_in_trap     (core1_in_trap),
        .dbg_wfi         (core1_wfi)
    );

    // ========================================================================
    // Bus Interconnect with Atomic Unit (RV32A) & Arbiter
    // ========================================================================
    soc_interconnect u_interconnect (
        .clk              (clk),
        .rst_n            (rst_n),
        .m0_req           (m0_req),
        .m0_we            (m0_we),
        .m0_wstrb         (m0_wstrb),
        .m0_addr          (m0_addr),
        .m0_wdata         (m0_wdata),
        .m0_is_amo        (m0_is_amo),
        .m0_amo_op        (m0_amo_op),
        .m0_ready         (m0_ready),
        .m0_rdata         (m0_rdata),
        .m1_req           (m1_req),
        .m1_we            (m1_we),
        .m1_wstrb         (m1_wstrb),
        .m1_addr          (m1_addr),
        .m1_wdata         (m1_wdata),
        .m1_is_amo        (m1_is_amo),
        .m1_amo_op        (m1_amo_op),
        .m1_ready         (m1_ready),
        .m1_rdata         (m1_rdata),
        .sram0_req        (sram0_req),
        .sram0_we         (sram0_we),
        .sram0_wstrb      (sram0_wstrb),
        .sram0_addr       (sram0_addr),
        .sram0_wdata      (sram0_wdata),
        .sram0_rdata      (sram0_rdata),
        .sram1_req        (sram1_req),
        .sram1_we         (sram1_we),
        .sram1_wstrb      (sram1_wstrb),
        .sram1_addr       (sram1_addr),
        .sram1_wdata      (sram1_wdata),
        .sram1_rdata      (sram1_rdata),
        .shm_req          (shm_req),
        .shm_we           (shm_we),
        .shm_wstrb        (shm_wstrb),
        .shm_addr         (shm_addr),
        .shm_wdata        (shm_wdata),
        .shm_rdata        (shm_rdata),
        .clint_req        (clint_req),
        .clint_we         (clint_we),
        .clint_wstrb      (clint_wstrb),
        .clint_addr       (clint_addr),
        .clint_wdata      (clint_wdata),
        .clint_rdata      (clint_rdata),
        .uart_req         (uart_req),
        .uart_we          (uart_we),
        .uart_core_id     (uart_core_id),
        .uart_addr        (uart_addr),
        .uart_wdata       (uart_wdata),
        .uart_rdata       (uart_rdata),
        .regbank_req      (regbank_req),
        .regbank_we       (regbank_we),
        .regbank_wstrb    (regbank_wstrb),
        .regbank_addr     (regbank_addr),
        .regbank_wdata    (regbank_wdata),
        .regbank_ready    (regbank_ready),
        .regbank_rdata    (regbank_rdata),
        .dbg_shm_grant_c0 (dbg_shm_grant_c0),
        .dbg_shm_grant_c1 (dbg_shm_grant_c1),
        .dbg_amo_active   (dbg_amo_active),
        .dbg_rsv0_valid   (dbg_rsv0_valid),
        .dbg_rsv1_valid   (dbg_rsv1_valid)
    );

    // ========================================================================
    // Core 0 Dedicated SRAM (16 KB @ 0x0000_0000)
    // ========================================================================
    wire [31:0] sram0_dbg0, sram0_dbg1, sram0_dbg2, sram0_dbg3;
    sram #(
        .ADDR_WIDTH(12),
        .INIT_FILE (CORE0_HEX_FILE)
    ) u_sram_core0 (
        .clk       (clk),
        .req       (sram0_req),
        .we        (sram0_we),
        .wstrb     (sram0_wstrb),
        .addr      (sram0_addr),
        .wdata     (sram0_wdata),
        .rdata     (sram0_rdata),
        .dbg_word0 (sram0_dbg0),
        .dbg_word1 (sram0_dbg1),
        .dbg_word2 (sram0_dbg2),
        .dbg_word3 (sram0_dbg3)
    );

    // ========================================================================
    // Core 1 Dedicated SRAM (16 KB @ 0x0001_0000)
    // ========================================================================
    wire [31:0] sram1_dbg0, sram1_dbg1, sram1_dbg2, sram1_dbg3;
    sram #(
        .ADDR_WIDTH(12),
        .INIT_FILE (CORE1_HEX_FILE)
    ) u_sram_core1 (
        .clk       (clk),
        .req       (sram1_req),
        .we        (sram1_we),
        .wstrb     (sram1_wstrb),
        .addr      (sram1_addr),
        .wdata     (sram1_wdata),
        .rdata     (sram1_rdata),
        .dbg_word0 (sram1_dbg0),
        .dbg_word1 (sram1_dbg1),
        .dbg_word2 (sram1_dbg2),
        .dbg_word3 (sram1_dbg3)
    );

    // ========================================================================
    // Shared Memory SRAM (16 KB @ 0x1000_0000)
    // ========================================================================
    sram #(
        .ADDR_WIDTH(12),
        .INIT_FILE ("")
    ) u_shared_sram (
        .clk       (clk),
        .req       (shm_req),
        .we        (shm_we),
        .wstrb     (shm_wstrb),
        .addr      (shm_addr),
        .wdata     (shm_wdata),
        .rdata     (shm_rdata),
        .dbg_word0 (shm_spinlock),
        .dbg_word1 (shm_shared_counter),
        .dbg_word2 (shm_core1_booted),
        .dbg_word3 (shm_ipi_ping_pong)
    );

    // ========================================================================
    // CLINT IPI & Boot Controller (@ 0x2000_0000)
    // ========================================================================
    clint_ipi_boot u_clint (
        .clk                (clk),
        .rst_n              (rst_n),
        .req                (clint_req),
        .we                 (clint_we),
        .wstrb              (clint_wstrb),
        .addr               (clint_addr),
        .wdata              (clint_wdata),
        .rdata              (clint_rdata),
        .core0_boot_en      (core0_boot_en),
        .core0_boot_addr    (core0_boot_addr),
        .core1_boot_en      (core1_boot_en),
        .core1_boot_addr    (core1_boot_addr),
        .irq_software_core0 (core0_irq_ipi),
        .irq_software_core1 (core1_irq_ipi),
        .sim_done_flags     (sim_done_flags)
    );

    // ========================================================================
    // Dual Register Bank (2 x 0x7F), Report Buffer (0x0F) & I2C Slave (@ 0x4000_0000)
    // ========================================================================
    i2c_regbank_subsys #(
        .I2C_SLAVE_ADDR(7'h42)
    ) u_regbank_subsys (
        .clk                  (clk),
        .rst_n                (rst_n),
        .i2c_scl              (i2c_scl),
        .i2c_sda_in           (i2c_sda_in),
        .i2c_sda_oe           (i2c_sda_oe),
        .fw_req               (regbank_req),
        .fw_we                (regbank_we),
        .fw_wstrb             (regbank_wstrb),
        .fw_addr              (regbank_addr),
        .fw_wdata             (regbank_wdata),
        .fw_ready             (regbank_ready),
        .fw_rdata             (regbank_rdata),
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

    // ========================================================================
    // UART & Debug Event Output (@ 0x3000_0000)
    // ========================================================================
    reg [31:0] dbg_last_event_core0;
    reg [31:0] dbg_last_event_core1;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            dbg_last_event_core0 <= 32'd0;
            dbg_last_event_core1 <= 32'd0;
        end else if (uart_req && uart_we) begin
            case (uart_addr[7:2])
                6'h00: begin
                    $write("%c", uart_wdata[7:0]);
                    $fflush();
                end
                6'h02: begin
                    if (uart_core_id == 1'b0)
                        dbg_last_event_core0 <= uart_wdata;
                    else
                        dbg_last_event_core1 <= uart_wdata;
                end
                default: ;
            endcase
        end
    end

endmodule
