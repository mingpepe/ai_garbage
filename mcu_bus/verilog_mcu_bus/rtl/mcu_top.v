`timescale 1ns / 1ps

module mcu_top (
    input  wire        clk,
    input  wire        rst_n,

    // External UART RX Stimulus
    input  wire        ext_uart_rx_valid,
    input  wire [7:0]  ext_uart_rx_data,

    // Firmware Override Port (for Testbench Register Setup via CPU Port)
    input  wire        fw_override_req,
    input  wire [31:0] fw_override_addr,
    input  wire        fw_override_write,
    input  wire [31:0] fw_override_wdata,

    // External I2C Physical Wire & Status
    output wire        i2c_scl,
    output wire        i2c_sda,
    output wire        i2c_wire_tx_done,
    output wire [7:0]  i2c_last_wire_byte,
    output wire [7:0]  i2c_total_transmitted,

    // Top-level Debug & Telemetry Outputs
    output wire [2:0]  dma_state,
    output wire [15:0] dma_cndtr,
    output wire [7:0]  dma_data_latch,
    output wire        dreq_uart_rx,
    output wire        dreq_i2c_tx,
    output wire        irq_dma_tc,
    output wire [1:0]  bus_master,
    output wire [31:0] haddr,
    output wire        hwrite,
    output wire [31:0] hwdata,
    output wire [31:0] hrdata
);

    // Master <-> Arbiter wires
    wire        cpu_req;
    wire [31:0] cpu_addr;
    wire        cpu_write;
    wire [31:0] cpu_wdata;
    wire [1:0]  cpu_prio;
    wire        cpu_grant;
    wire        cpu_stall;

    wire        dma_req;
    wire [31:0] dma_addr;
    wire        dma_write;
    wire [31:0] dma_wdata;
    wire [1:0]  dma_prio;
    wire        dma_grant;
    wire        dma_stall;

    wire        bus_active;

    // MMIO Address Decoder
    wire sel_sram = bus_active && (haddr[31:8] == 24'h2000_00);
    wire sel_uart = bus_active && (haddr[31:8] == 24'h4000_00);
    wire sel_i2c  = bus_active && (haddr[31:8] == 24'h4000_10);
    wire sel_dma  = bus_active && (haddr[31:8] == 24'h4002_00);
    wire sel_nvic = bus_active && (haddr[31:8] == 24'hE000_E1);

    wire [31:0] rdata_sram;
    wire [31:0] rdata_uart;
    wire [31:0] rdata_i2c;
    wire [31:0] rdata_dma;
    wire [31:0] rdata_nvic;

    wire [31:0] slave_rdata = sel_sram ? rdata_sram :
                              sel_uart ? rdata_uart :
                              sel_i2c  ? rdata_i2c  :
                              sel_dma  ? rdata_dma  :
                              sel_nvic ? rdata_nvic : 32'd0;

    // Interrupt & Handshake wires
    wire        irq_uart_rxne;
    wire        irq_uart_ore;
    wire        irq_i2c_txe;
    wire [3:0]  irq_lines = {irq_dma_tc, irq_i2c_txe, irq_uart_ore, irq_uart_rxne};

    wire        nvic_irq_valid;
    wire [1:0]  nvic_irq_id;
    wire        nvic_irq_ack;
    wire        nvic_irq_complete;
    wire [1:0]  nvic_irq_complete_id;

    // Telemetry wires (exposed for VCD waveform)
    wire [15:0] stat_dma_grants;
    wire [15:0] stat_cpu_grants;
    wire [15:0] stat_contentions;
    wire [15:0] stat_idle_cycles;
    wire [95:0] dma_state_ascii;
    wire [15:0] dma_ccr;
    wire [31:0] dma_cpar;
    wire [31:0] dma_cmar;
    wire [3:0]  dma_isr;
    wire [15:0] dma_total_transferred;
    wire [15:0] dma_bus_stalls;
    wire [2:0]  uart_fifo_count;
    wire [7:0]  uart_last_popped;
    wire [1:0]  i2c_fifo_count;
    wire        i2c_is_transmitting;
    wire [7:0]  i2c_shift_byte;
    wire [2:0]  i2c_shift_cnt;
    wire [1:0]  cpu_state;
    wire [63:0] cpu_state_ascii;
    wire [1:0]  cpu_active_irq;
    wire [7:0]  cpu_last_read;
    wire [15:0] cpu_bus_stalls;
    wire [3:0]  nvic_iser;
    wire [3:0]  nvic_ispr;
    wire [3:0]  nvic_iabr;
    wire [7:0]  sram_b0, sram_b1, sram_b2, sram_b3, sram_b4, sram_b5, sram_b6, sram_b7;

    // 1. AHB System Bus Arbiter
    bus_arbiter u_arbiter (
        .clk              (clk),
        .rst_n            (rst_n),
        .cpu_req          (cpu_req),
        .cpu_addr         (cpu_addr),
        .cpu_write        (cpu_write),
        .cpu_wdata        (cpu_wdata),
        .cpu_prio         (cpu_prio),
        .cpu_grant        (cpu_grant),
        .cpu_stall        (cpu_stall),
        .dma_req          (dma_req),
        .dma_addr         (dma_addr),
        .dma_write        (dma_write),
        .dma_wdata        (dma_wdata),
        .dma_prio         (dma_prio),
        .dma_grant        (dma_grant),
        .dma_stall        (dma_stall),
        .bus_active       (bus_active),
        .bus_master       (bus_master),
        .haddr            (haddr),
        .hwrite           (hwrite),
        .hwdata           (hwdata),
        .slave_rdata      (slave_rdata),
        .hrdata           (hrdata),
        .stat_dma_grants  (stat_dma_grants),
        .stat_cpu_grants  (stat_cpu_grants),
        .stat_contentions (stat_contentions),
        .stat_idle_cycles (stat_idle_cycles)
    );

    // 2. CPU Core
    cpu_core u_cpu (
        .clk                  (clk),
        .rst_n                (rst_n),
        .cpu_bus_req          (cpu_req),
        .cpu_bus_addr         (cpu_addr),
        .cpu_bus_write        (cpu_write),
        .cpu_bus_wdata        (cpu_wdata),
        .cpu_bus_prio         (cpu_prio),
        .cpu_bus_grant        (cpu_grant),
        .hrdata               (hrdata),
        .nvic_irq_valid       (nvic_irq_valid),
        .nvic_irq_id          (nvic_irq_id),
        .nvic_irq_ack         (nvic_irq_ack),
        .nvic_irq_complete    (nvic_irq_complete),
        .nvic_irq_complete_id (nvic_irq_complete_id),
        .fw_override_req      (fw_override_req),
        .fw_override_addr     (fw_override_addr),
        .fw_override_write    (fw_override_write),
        .fw_override_wdata    (fw_override_wdata),
        .cpu_state            (cpu_state),
        .cpu_state_ascii      (cpu_state_ascii),
        .active_irq_id        (cpu_active_irq),
        .last_read_val        (cpu_last_read),
        .cpu_bus_stalls       (cpu_bus_stalls)
    );

    // 3. DMA1 Controller (Channel 1)
    dma_controller u_dma (
        .clk               (clk),
        .rst_n             (rst_n),
        .sel               (sel_dma),
        .addr_offset       (haddr[7:0]),
        .write_en          (hwrite),
        .wdata             (hwdata),
        .rdata             (rdata_dma),
        .dma_bus_req       (dma_req),
        .dma_bus_addr      (dma_addr),
        .dma_bus_write     (dma_write),
        .dma_bus_wdata     (dma_wdata),
        .dma_bus_prio      (dma_prio),
        .dma_bus_grant     (dma_grant),
        .hrdata            (hrdata),
        .dreq_uart_rx      (dreq_uart_rx),
        .dreq_i2c_tx       (dreq_i2c_tx),
        .irq_dma           (irq_dma_tc),
        .dma_state         (dma_state),
        .dma_state_ascii   (dma_state_ascii),
        .data_latch        (dma_data_latch),
        .reg_cndtr         (dma_cndtr),
        .reg_ccr           (dma_ccr),
        .reg_cpar          (dma_cpar),
        .reg_cmar          (dma_cmar),
        .reg_isr           (dma_isr),
        .total_transferred (dma_total_transferred),
        .bus_stalls        (dma_bus_stalls)
    );

    // 4. UART0 Peripheral
    uart_rx u_uart (
        .clk              (clk),
        .rst_n            (rst_n),
        .sel              (sel_uart),
        .addr_offset      (haddr[7:0]),
        .write_en         (hwrite),
        .wdata            (hwdata),
        .rdata            (rdata_uart),
        .ext_rx_valid     (ext_uart_rx_valid),
        .ext_rx_data      (ext_uart_rx_data),
        .dma_req_rx       (dreq_uart_rx),
        .irq_rxne         (irq_uart_rxne),
        .irq_ore          (irq_uart_ore),
        .fifo_count       (uart_fifo_count),
        .last_popped_byte (uart_last_popped)
    );

    // 5. I2C0 Peripheral
    i2c_tx u_i2c (
        .clk               (clk),
        .rst_n             (rst_n),
        .sel               (sel_i2c),
        .addr_offset       (haddr[7:0]),
        .write_en          (hwrite),
        .wdata             (hwdata),
        .rdata             (rdata_i2c),
        .dma_req_tx        (dreq_i2c_tx),
        .irq_txe           (irq_i2c_txe),
        .fifo_count        (i2c_fifo_count),
        .is_transmitting   (i2c_is_transmitting),
        .shift_byte        (i2c_shift_byte),
        .shift_cnt         (i2c_shift_cnt),
        .wire_tx_done      (i2c_wire_tx_done),
        .last_wire_byte    (i2c_last_wire_byte),
        .total_transmitted (i2c_total_transmitted),
        .i2c_scl           (i2c_scl),
        .i2c_sda           (i2c_sda)
    );

    // 6. SRAM Memory
    sram u_sram (
        .clk         (clk),
        .rst_n       (rst_n),
        .sel         (sel_sram),
        .addr_offset (haddr[7:0]),
        .write_en    (hwrite),
        .wdata       (hwdata),
        .rdata       (rdata_sram),
        .sram_byte0  (sram_b0),
        .sram_byte1  (sram_b1),
        .sram_byte2  (sram_b2),
        .sram_byte3  (sram_b3),
        .sram_byte4  (sram_b4),
        .sram_byte5  (sram_b5),
        .sram_byte6  (sram_b6),
        .sram_byte7  (sram_b7)
    );

    // 7. NVIC Interrupt Controller
    nvic u_nvic (
        .clk                 (clk),
        .rst_n               (rst_n),
        .sel                 (sel_nvic),
        .addr_offset         (haddr[7:0]),
        .write_en            (hwrite),
        .wdata               (hwdata),
        .rdata               (rdata_nvic),
        .irq_lines           (irq_lines),
        .cpu_irq_valid       (nvic_irq_valid),
        .cpu_irq_id          (nvic_irq_id),
        .cpu_irq_ack         (nvic_irq_ack),
        .cpu_irq_complete    (nvic_irq_complete),
        .cpu_irq_complete_id (nvic_irq_complete_id),
        .iser                (nvic_iser),
        .ispr                (nvic_ispr),
        .iabr                (nvic_iabr)
    );

endmodule
