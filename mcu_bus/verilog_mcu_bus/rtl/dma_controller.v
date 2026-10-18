`timescale 1ns / 1ps

module dma_controller (
    input  wire        clk,
    input  wire        rst_n,

    // MMIO Slave Interface for Register Configuration (Base: 0x4002_0000)
    input  wire        sel,
    input  wire [7:0]  addr_offset,
    input  wire        write_en,
    input  wire [31:0] wdata,
    output reg  [31:0] rdata,

    // AHB Bus Master Interface
    output reg         dma_bus_req,
    output reg  [31:0] dma_bus_addr,
    output reg         dma_bus_write,
    output reg  [31:0] dma_bus_wdata,
    output wire [1:0]  dma_bus_prio,
    input  wire        dma_bus_grant,
    input  wire [31:0] hrdata,

    // Peripheral Hardware Handshake Lines (DREQ)
    input  wire        dreq_uart_rx,
    input  wire        dreq_i2c_tx,

    // Interrupt Output to NVIC
    output reg         irq_dma,

    // Waveform / Debug Observation Ports
    output reg  [2:0]  dma_state,
    output reg  [95:0] dma_state_ascii,
    output reg  [7:0]  data_latch,
    output reg  [15:0] reg_cndtr,
    output reg  [15:0] reg_ccr,
    output reg  [31:0] reg_cpar,
    output reg  [31:0] reg_cmar,
    output reg  [3:0]  reg_isr,
    output reg  [15:0] total_transferred,
    output reg  [15:0] bus_stalls
);

    // Register Offsets
    localparam REG_ISR   = 8'h00;
    localparam REG_IFCR  = 8'h04;
    localparam REG_CCR   = 8'h08;
    localparam REG_CNDTR = 8'h0C;
    localparam REG_CPAR  = 8'h10;
    localparam REG_CMAR  = 8'h14;

    // DMA States
    localparam STATE_IDLE         = 3'd0;
    localparam STATE_WAIT_REQ     = 3'd1;
    localparam STATE_REQ_SRC      = 3'd2;
    localparam STATE_READ_LATCH   = 3'd3;
    localparam STATE_REQ_DST      = 3'd4;
    localparam STATE_WRITE_COMMIT = 3'd5;
    localparam STATE_UPDATE       = 3'd6;
    localparam STATE_COMPLETE     = 3'd7;

    // CCR Bit Decode
    wire        ccr_en   = reg_ccr[0];
    wire        ccr_tcie = reg_ccr[1];
    wire        ccr_htie = reg_ccr[2];
    wire [1:0]  ccr_dir  = reg_ccr[5:4]; // 00=P2M, 01=M2P, 10=P2P
    wire        ccr_circ = reg_ccr[6];
    wire        ccr_pinc = reg_ccr[7];
    wire        ccr_minc = reg_ccr[8];
    assign dma_bus_prio  = reg_ccr[10:9];

    // Shadow Registers for Circular Mode
    reg [15:0] cndtr_reload;
    reg [31:0] cpar_orig;
    reg [31:0] cmar_orig;

    // Hardware Handshake Trigger Evaluation
    reg dreq_ready;
    always @(*) begin
        case (ccr_dir)
            2'b00:   dreq_ready = dreq_uart_rx;                // P2M (UART -> SRAM)
            2'b01:   dreq_ready = dreq_i2c_tx;                 // M2P (SRAM -> I2C)
            2'b10:   dreq_ready = dreq_uart_rx & dreq_i2c_tx;  // P2P (UART -> I2C)
            default: dreq_ready = 1'b0;
        endcase
    end

    // ASCII State Name for GTKWave Waveform Display
    always @(*) begin
        case (dma_state)
            STATE_IDLE:         dma_state_ascii = "IDLE        ";
            STATE_WAIT_REQ:     dma_state_ascii = "WAIT_REQ    ";
            STATE_REQ_SRC:      dma_state_ascii = "REQ_SRC     ";
            STATE_READ_LATCH:   dma_state_ascii = "READ_LATCH  ";
            STATE_REQ_DST:      dma_state_ascii = "REQ_DST     ";
            STATE_WRITE_COMMIT: dma_state_ascii = "WRITE_COMMIT";
            STATE_UPDATE:       dma_state_ascii = "UPDATE      ";
            STATE_COMPLETE:     dma_state_ascii = "COMPLETE    ";
            default:            dma_state_ascii = "UNKNOWN     ";
        endcase
    end

    // Combinational Bus Master Request Signals
    always @(*) begin
        dma_bus_req   = 1'b0;
        dma_bus_addr  = 32'd0;
        dma_bus_write = 1'b0;
        dma_bus_wdata = 32'd0;

        if (ccr_en) begin
            if (dma_state == STATE_REQ_SRC) begin
                dma_bus_req   = 1'b1;
                dma_bus_write = 1'b0;
                dma_bus_addr  = (ccr_dir == 2'b01) ? reg_cmar : reg_cpar;
            end else if (dma_state == STATE_REQ_DST) begin
                dma_bus_req   = 1'b1;
                dma_bus_write = 1'b1;
                dma_bus_addr  = (ccr_dir == 2'b01) ? reg_cpar : reg_cmar;
                dma_bus_wdata = {24'd0, data_latch};
            end
        end
    end

    // MMIO Slave Read Mux
    always @(*) begin
        rdata = 32'd0;
        if (sel && !write_en) begin
            case (addr_offset)
                REG_ISR:   rdata = {28'd0, reg_isr};
                REG_CCR:   rdata = {16'd0, reg_ccr};
                REG_CNDTR: rdata = {16'd0, reg_cndtr};
                REG_CPAR:  rdata = reg_cpar;
                REG_CMAR:  rdata = reg_cmar;
                default:   rdata = 32'd0;
            endcase
        end
    end

    // Sequential DMA Engine & Register Logic
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            reg_isr           <= 4'h0;
            reg_ccr           <= 16'h0000;
            reg_cndtr         <= 16'd0;
            reg_cpar          <= 32'd0;
            reg_cmar          <= 32'd0;
            cndtr_reload      <= 16'd0;
            cpar_orig         <= 32'd0;
            cmar_orig         <= 32'd0;
            data_latch        <= 8'h00;
            dma_state         <= STATE_IDLE;
            irq_dma           <= 1'b0;
            total_transferred <= 16'd0;
            bus_stalls        <= 16'd0;
        end else begin
            // 1. MMIO Register Writes from CPU / Testbench
            if (sel && write_en) begin
                case (addr_offset)
                    REG_IFCR: begin
                        if (wdata[0]) begin
                            // CGIF: Clear Global Interrupt Flag clears GIF, TCIF, HTIF, TEIF
                            reg_isr <= 4'h0;
                            irq_dma <= 1'b0;
                        end else begin
                            reg_isr <= reg_isr & ~wdata[3:0];
                            if ((((reg_isr & ~wdata[3:0]) & {1'b0, ccr_htie, ccr_tcie, 1'b0})) == 4'b0000) begin
                                irq_dma <= 1'b0;
                            end
                        end
                    end
                    REG_CCR: begin
                        reg_ccr <= wdata[15:0];
                        if (!reg_ccr[0] && wdata[0]) begin
                            dma_state <= STATE_WAIT_REQ;
                        end else if (reg_ccr[0] && !wdata[0]) begin
                            dma_state <= STATE_IDLE;
                        end
                    end
                    REG_CNDTR: begin
                        if (!ccr_en) begin
                            reg_cndtr    <= wdata[15:0];
                            cndtr_reload <= wdata[15:0];
                        end
                    end
                    REG_CPAR: begin
                        if (!ccr_en) begin
                            reg_cpar  <= wdata;
                            cpar_orig <= wdata;
                        end
                    end
                    REG_CMAR: begin
                        if (!ccr_en) begin
                            reg_cmar  <= wdata;
                            cmar_orig <= wdata;
                        end
                    end
                    default: ;
                endcase
            end

            // 2. DMA Hardware State Machine
            if (ccr_en) begin
                case (dma_state)
                    STATE_IDLE: begin
                        dma_state <= STATE_WAIT_REQ;
                    end

                    STATE_WAIT_REQ: begin
                        if (dreq_ready && (reg_cndtr > 16'd0)) begin
                            dma_state <= STATE_REQ_SRC;
                        end
                    end

                    STATE_REQ_SRC: begin
                        if (dma_bus_grant) begin
                            // Bus granted! Latch read data from source peripheral/memory
                            data_latch <= hrdata[7:0];
                            dma_state  <= STATE_REQ_DST;
                        end else begin
                            bus_stalls <= bus_stalls + 16'd1;
                        end
                    end

                    STATE_REQ_DST: begin
                        if (dma_bus_grant) begin
                            // Bus granted! Destination write committed
                            total_transferred <= total_transferred + 16'd1;

                            if (ccr_pinc) reg_cpar <= reg_cpar + 32'd1;
                            if (ccr_minc) reg_cmar <= reg_cmar + 32'd1;

                            // Half-Transfer check
                            if ((cndtr_reload > 16'd1) && ((reg_cndtr - 16'd1) == (cndtr_reload >> 1))) begin
                                reg_isr[2] <= 1'b1; // HTIF
                                reg_isr[0] <= 1'b1; // GIF
                                if (ccr_htie) irq_dma <= 1'b1;
                            end

                            // Transfer Complete check
                            if (reg_cndtr == 16'd1) begin
                                reg_isr[1] <= 1'b1; // TCIF
                                reg_isr[0] <= 1'b1; // GIF
                                if (ccr_tcie) irq_dma <= 1'b1;

                                if (ccr_circ) begin
                                    reg_cndtr <= cndtr_reload;
                                    reg_cpar  <= cpar_orig;
                                    reg_cmar  <= cmar_orig;
                                    dma_state <= STATE_WAIT_REQ;
                                end else begin
                                    reg_cndtr  <= 16'd0;
                                    reg_ccr[0] <= 1'b0; // Auto-disable EN
                                    dma_state  <= STATE_COMPLETE;
                                end
                            end else begin
                                reg_cndtr <= reg_cndtr - 16'd1;
                                dma_state <= STATE_WAIT_REQ;
                            end
                        end else begin
                            bus_stalls <= bus_stalls + 16'd1;
                        end
                    end

                    default: ;
                endcase
            end
        end
    end

endmodule
