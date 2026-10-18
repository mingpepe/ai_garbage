`timescale 1ns / 1ps

module nvic (
    input  wire        clk,
    input  wire        rst_n,

    // MMIO Slave Interface (Base: 0xE000_E100)
    input  wire        sel,
    input  wire [7:0]  addr_offset,
    input  wire        write_en,
    input  wire [31:0] wdata,
    output reg  [31:0] rdata,

    // Hardware Interrupt Input Lines
    input  wire [3:0]  irq_lines,

    // CPU Core Interrupt Handshake
    output reg         cpu_irq_valid,
    output reg  [1:0]  cpu_irq_id,
    input  wire        cpu_irq_ack,
    input  wire        cpu_irq_complete,
    input  wire [1:0]  cpu_irq_complete_id,

    // Debug outputs for waveform
    output reg  [3:0]  iser,
    output reg  [3:0]  ispr,
    output reg  [3:0]  iabr
);

    reg [3:0] prev_irq_lines;
    wire [3:0] rising_edges = irq_lines & ~prev_irq_lines;
    wire [3:0] active_pending = ispr & iser;

    // Priority encoder for pending interrupts
    always @(*) begin
        cpu_irq_valid = 1'b0;
        cpu_irq_id    = 2'd0;
        if (active_pending[0]) begin
            cpu_irq_valid = 1'b1;
            cpu_irq_id    = 2'd0;
        end else if (active_pending[1]) begin
            cpu_irq_valid = 1'b1;
            cpu_irq_id    = 2'd1;
        end else if (active_pending[2]) begin
            cpu_irq_valid = 1'b1;
            cpu_irq_id    = 2'd2;
        end else if (active_pending[3]) begin
            cpu_irq_valid = 1'b1;
            cpu_irq_id    = 2'd3;
        end
    end

    always @(*) begin
        rdata = 32'd0;
        if (sel && !write_en) begin
            case (addr_offset)
                8'h00, 8'h04: rdata = {28'd0, iser};
                8'h08, 8'h0C: rdata = {28'd0, ispr};
                8'h10:        rdata = {28'd0, iabr};
                default:      rdata = 32'd0;
            endcase
        end
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            iser           <= 4'hF;
            ispr           <= 4'h0;
            iabr           <= 4'h0;
            prev_irq_lines <= 4'h0;
        end else begin
            prev_irq_lines <= irq_lines;

            // Latch rising edges into ISPR
            ispr <= (ispr | rising_edges);

            // CPU Acknowledge
            if (cpu_irq_ack && cpu_irq_valid) begin
                ispr[cpu_irq_id] <= 1'b0;
                iabr[cpu_irq_id] <= 1'b1;
            end

            // CPU ISR Exit
            if (cpu_irq_complete) begin
                iabr[cpu_irq_complete_id] <= 1'b0;
            end

            // MMIO Register writes
            if (sel && write_en) begin
                case (addr_offset)
                    8'h00: iser <= iser | wdata[3:0];
                    8'h04: iser <= iser & ~wdata[3:0];
                    8'h08: ispr <= ispr | wdata[3:0];
                    8'h0C: ispr <= ispr & ~wdata[3:0];
                    default: ;
                endcase
            end
        end
    end

endmodule
