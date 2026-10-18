`timescale 1ns / 1ps

module tb_mcu_top;

    reg         clk;
    reg         rst_n;

    reg         ext_uart_rx_valid;
    reg  [7:0]  ext_uart_rx_data;

    reg         fw_override_req;
    reg  [31:0] fw_override_addr;
    reg         fw_override_write;
    reg  [31:0] fw_override_wdata;

    wire        i2c_scl;
    wire        i2c_sda;
    wire        i2c_wire_tx_done;
    wire [7:0]  i2c_last_wire_byte;
    wire [7:0]  i2c_total_transmitted;

    wire [2:0]  dma_state;
    wire [15:0] dma_cndtr;
    wire [7:0]  dma_data_latch;
    wire        dreq_uart_rx;
    wire        dreq_i2c_tx;
    wire        irq_dma_tc;
    wire [1:0]  bus_master;
    wire [31:0] haddr;
    wire        hwrite;
    wire [31:0] hwdata;
    wire [31:0] hrdata;

    integer cycle_cnt;

    // Instantiate DUT
    mcu_top dut (
        .clk                   (clk),
        .rst_n                 (rst_n),
        .ext_uart_rx_valid     (ext_uart_rx_valid),
        .ext_uart_rx_data      (ext_uart_rx_data),
        .fw_override_req       (fw_override_req),
        .fw_override_addr      (fw_override_addr),
        .fw_override_write     (fw_override_write),
        .fw_override_wdata     (fw_override_wdata),
        .i2c_scl               (i2c_scl),
        .i2c_sda               (i2c_sda),
        .i2c_wire_tx_done      (i2c_wire_tx_done),
        .i2c_last_wire_byte    (i2c_last_wire_byte),
        .i2c_total_transmitted (i2c_total_transmitted),
        .dma_state             (dma_state),
        .dma_cndtr             (dma_cndtr),
        .dma_data_latch        (dma_data_latch),
        .dreq_uart_rx          (dreq_uart_rx),
        .dreq_i2c_tx           (dreq_i2c_tx),
        .irq_dma_tc            (irq_dma_tc),
        .bus_master            (bus_master),
        .haddr                 (haddr),
        .hwrite                (hwrite),
        .hwdata                (hwdata),
        .hrdata                (hrdata)
    );

    // 100 MHz Clock Generation (10 ns period)
    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    // Cycle Counter & Trace Monitor
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            cycle_cnt <= 0;
        end else begin
            cycle_cnt <= cycle_cnt + 1;
            $display("[Cyc %3d | %4d ns] Bus:%s Addr:0x%08X %s Data:0x%02X | DMA:%s CNDTR:%2d Latch:0x%02X | DREQ(RX:%b,TX:%b) IRQ:%b | UART_CNT:%1d I2C_CNT:%1d",
                cycle_cnt,
                $time,
                (bus_master == 2'd2) ? "DMA " : (bus_master == 2'd1) ? "CPU " : "IDLE",
                haddr,
                (bus_master == 2'd0) ? "-" : (hwrite ? "W" : "R"),
                hwrite ? hwdata[7:0] : hrdata[7:0],
                dut.u_dma.dma_state_ascii,
                dma_cndtr,
                dma_data_latch,
                dreq_uart_rx,
                dreq_i2c_tx,
                irq_dma_tc,
                dut.u_uart.fifo_count,
                dut.u_i2c.fifo_count
            );

            if (i2c_wire_tx_done) begin
                $display("  >>> [I2C WIRE] Byte 0x%02X transmitted on physical serial bus! (Total=%0d)",
                    i2c_last_wire_byte, i2c_total_transmitted);
            end
            if (dut.u_nvic.cpu_irq_ack && dut.u_nvic.cpu_irq_valid) begin
                $display("  >>> [CPU ISR] Entering ISR for IRQ #%0d", dut.u_nvic.cpu_irq_id);
            end
            if (dut.u_nvic.cpu_irq_complete) begin
                $display("  <<< [CPU ISR] Exiting ISR for IRQ #%0d", dut.u_nvic.cpu_irq_complete_id);
            end
        end
    end

    // Helper task: Write MMIO register via CPU Bus Master
    task fw_write_mmio(input [31:0] addr, input [31:0] data);
        begin
            @(negedge clk);
            fw_override_req   = 1'b1;
            fw_override_addr  = addr;
            fw_override_write = 1'b1;
            fw_override_wdata = data;
            @(posedge clk);
            while (!dut.u_arbiter.cpu_grant) @(posedge clk);
            @(negedge clk);
            fw_override_req   = 1'b0;
        end
    endtask

    // Helper task: Inject byte into UART RX
    task uart_send_byte(input [7:0] data);
        begin
            @(negedge clk);
            ext_uart_rx_valid = 1'b1;
            ext_uart_rx_data  = data;
            @(posedge clk);
            @(negedge clk);
            ext_uart_rx_valid = 1'b0;
        end
    endtask

    // Main Simulation Stimulus & Verification
    initial begin
        $dumpfile("mcu_bus.vcd");
        $dumpvars(0, tb_mcu_top);

        $display("================================================================================");
        $display("   MCU Bus & DMA Controller Verilog RTL Simulation (Generating mcu_bus.vcd)");
        $display("================================================================================");

        rst_n             = 1'b0;
        ext_uart_rx_valid = 1'b0;
        ext_uart_rx_data  = 8'h00;
        fw_override_req   = 1'b0;
        fw_override_addr  = 32'd0;
        fw_override_write = 1'b0;
        fw_override_wdata = 32'd0;

        repeat (2) @(posedge clk);
        @(negedge clk) rst_n = 1'b1;

        // --------------------------------------------------------------------
        // SCENARIO 1: P2P DMA Transfer (UART0_DR 0x40000008 -> I2C0_DR 0x40001008)
        // --------------------------------------------------------------------
        $display("\n--- [SCENARIO 1] Configuring DMA for P2P (UART RX -> I2C TX, 5 bytes) ---");
        fw_write_mmio(32'h4002_0010, 32'h4000_0008); // DMA_CPAR = UART0_DR
        fw_write_mmio(32'h4002_0014, 32'h4000_1008); // DMA_CMAR = I2C0_DR
        fw_write_mmio(32'h4002_000C, 32'd5);         // DMA_CNDTR = 5
        // CCR: PL=2'b11 (bits 10:9), DIR=2'b10 P2P (bits 5:4), TCIE=1 (bit 1), EN=1 (bit 0) => 0x0623
        fw_write_mmio(32'h4002_0008, 32'h0000_0623);

        // Inject 5 UART bytes across consecutive cycles
        uart_send_byte(8'h11);
        uart_send_byte(8'h22);
        uart_send_byte(8'h33);
        uart_send_byte(8'h44);
        uart_send_byte(8'h55);

        // Wait for all 5 bytes to finish DMA transfer and I2C physical wire shift
        repeat (24) @(posedge clk);

        // --------------------------------------------------------------------
        // SCENARIO 2: P2M DMA Transfer (UART0_DR 0x40000008 -> SRAM 0x20000000)
        // --------------------------------------------------------------------
        $display("\n--- [SCENARIO 2] Configuring DMA for P2M (UART RX -> SRAM, 4 bytes with MINC) ---");
        fw_write_mmio(32'h4002_0010, 32'h4000_0008); // DMA_CPAR = UART0_DR
        fw_write_mmio(32'h4002_0014, 32'h2000_0000); // DMA_CMAR = SRAM_BASE
        fw_write_mmio(32'h4002_000C, 32'd4);         // DMA_CNDTR = 4
        // CCR: PL=2'b11, MINC=1 (bit 8), DIR=2'b00 P2M, TCIE=1, EN=1 => 0x0703
        fw_write_mmio(32'h4002_0008, 32'h0000_0703);

        uart_send_byte(8'hA1);
        uart_send_byte(8'hB2);
        uart_send_byte(8'hC3);
        uart_send_byte(8'hD4);

        repeat (16) @(posedge clk);

        $display("\n================================================================================");
        $display("                     VERILOG RTL SIMULATION SUMMARY");
        $display("================================================================================");
        $display("Total Cycles Executed:     %0d", cycle_cnt);
        $display("DMA Bus Grants:            %0d", dut.u_arbiter.stat_dma_grants);
        $display("CPU Bus Grants:            %0d", dut.u_arbiter.stat_cpu_grants);
        $display("Bus Contentions:           %0d", dut.u_arbiter.stat_contentions);
        $display("Total DMA Bytes Moved:     %0d", dut.u_dma.total_transferred);
        $display("Total I2C Wire Bytes Sent: %0d", i2c_total_transmitted);
        $display("SRAM[0..3] Contents:       0x%02X 0x%02X 0x%02X 0x%02X",
            dut.u_sram.sram_byte0, dut.u_sram.sram_byte1, dut.u_sram.sram_byte2, dut.u_sram.sram_byte3);
        $display("VCD Waveform Saved To:     mcu_bus.vcd");
        $display("================================================================================");

        $finish;
    end

endmodule
