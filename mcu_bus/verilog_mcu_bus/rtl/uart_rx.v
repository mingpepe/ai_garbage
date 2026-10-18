`timescale 1ns / 1ps

module uart_rx (
    input  wire        clk,
    input  wire        rst_n,

    // MMIO Slave Interface (Base: 0x4000_0000)
    input  wire        sel,
    input  wire [7:0]  addr_offset,
    input  wire        write_en,
    input  wire [31:0] wdata,
    output reg  [31:0] rdata,

    // External Serial RX Stimulus (Byte-level)
    input  wire        ext_rx_valid,
    input  wire [7:0]  ext_rx_data,

    // Hardware Handshake & Interrupt Lines
    output wire        dma_req_rx,
    output wire        irq_rxne,
    output wire        irq_ore,
    output reg  [2:0]  fifo_count,
    output reg  [7:0]  last_popped_byte
);

    // Register Offsets
    localparam REG_CR  = 8'h00;
    localparam REG_SR  = 8'h04;
    localparam REG_DR  = 8'h08;
    localparam REG_CNT = 8'h0C;

    reg [31:0] reg_cr;
    reg        ore_flag;

    reg [7:0]  fifo_mem [0:3];
    reg [1:0]  head;
    reg [1:0]  tail;

    wire rxne_flag = (fifo_count > 3'd0);
    wire [31:0] reg_sr = {30'd0, ore_flag, rxne_flag};

    assign dma_req_rx = rxne_flag & reg_cr[2]; // DMARXEN
    assign irq_rxne   = rxne_flag & reg_cr[1]; // RXNEIE
    assign irq_ore    = ore_flag;

    wire pop_req  = sel && !write_en && (addr_offset == REG_DR) && (fifo_count > 3'd0);
    wire push_req = ext_rx_valid && reg_cr[0]; // UE enabled

    // Combinational Read Data Mux
    always @(*) begin
        rdata = 32'd0;
        if (sel && !write_en) begin
            case (addr_offset)
                REG_CR:  rdata = reg_cr;
                REG_SR:  rdata = reg_sr;
                REG_DR:  rdata = (fifo_count > 3'd0) ? {24'd0, fifo_mem[head]} : 32'd0;
                REG_CNT: rdata = {29'd0, fifo_count};
                default: rdata = 32'd0;
            endcase
        end
    end

    // Sequential FIFO & Register Logic
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            reg_cr           <= 32'h0000_0005; // UE=1, DMARXEN=1
            ore_flag         <= 1'b0;
            head             <= 2'd0;
            tail             <= 2'd0;
            fifo_count       <= 3'd0;
            last_popped_byte <= 8'h00;
            fifo_mem[0]      <= 8'h00;
            fifo_mem[1]      <= 8'h00;
            fifo_mem[2]      <= 8'h00;
            fifo_mem[3]      <= 8'h00;
        end else begin
            // MMIO Register Writes
            if (sel && write_en) begin
                case (addr_offset)
                    REG_CR: reg_cr <= wdata;
                    REG_SR: begin
                        if (!wdata[1])
                            ore_flag <= 1'b0;
                    end
                    default: ;
                endcase
            end

            // FIFO Push / Pop handling
            if (push_req && pop_req) begin
                // Simultaneous push and pop
                fifo_mem[tail]   <= ext_rx_data;
                tail             <= tail + 2'd1;
                last_popped_byte <= fifo_mem[head];
                head             <= head + 2'd1;
                // fifo_count unchanged
            end else if (push_req) begin
                if (fifo_count < 3'd4) begin
                    fifo_mem[tail] <= ext_rx_data;
                    tail           <= tail + 2'd1;
                    fifo_count     <= fifo_count + 3'd1;
                end else begin
                    // RX Overrun!
                    ore_flag <= 1'b1;
                end
            end else if (pop_req) begin
                last_popped_byte <= fifo_mem[head];
                head             <= head + 2'd1;
                fifo_count       <= fifo_count - 3'd1;
            end
        end
    end

endmodule
