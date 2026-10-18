`timescale 1ns / 1ps

module i2c_tx (
    input  wire        clk,
    input  wire        rst_n,

    // MMIO Slave Interface (Base: 0x4000_1000)
    input  wire        sel,
    input  wire [7:0]  addr_offset,
    input  wire        write_en,
    input  wire [31:0] wdata,
    output reg  [31:0] rdata,

    // Hardware Handshake & Wire Outputs
    output wire        dma_req_tx,
    output wire        irq_txe,
    output reg  [1:0]  fifo_count,
    output reg         is_transmitting,
    output reg  [7:0]  shift_byte,
    output reg  [2:0]  shift_cnt,
    output reg         wire_tx_done,
    output reg  [7:0]  last_wire_byte,
    output reg  [7:0]  total_transmitted,
    output wire        i2c_scl,
    output wire        i2c_sda
);

    localparam REG_CR  = 8'h00;
    localparam REG_SR  = 8'h04;
    localparam REG_DR  = 8'h08;
    localparam REG_CNT = 8'h0C;

    localparam CYCLES_PER_BYTE = 3'd4;

    reg [31:0] reg_cr;
    reg [7:0]  fifo_mem [0:1];
    reg        head;
    reg        tail;

    wire txe_flag   = (fifo_count < 2'd2);
    wire [31:0] reg_sr = {30'd0, is_transmitting, txe_flag};

    assign dma_req_tx = txe_flag & reg_cr[2]; // DMATXEN
    assign irq_txe    = txe_flag & reg_cr[1]; // TXEIE

    // Physical wire representation for waveform visibility
    assign i2c_scl = is_transmitting ? ~clk : 1'b1;
    assign i2c_sda = is_transmitting ? shift_byte[7 - {1'b0, shift_cnt[1:0]}] : 1'b1;

    wire push_req = sel && write_en && (addr_offset == REG_DR) && (fifo_count < 2'd2);

    always @(*) begin
        rdata = 32'd0;
        if (sel && !write_en) begin
            case (addr_offset)
                REG_CR:  rdata = reg_cr;
                REG_SR:  rdata = reg_sr;
                REG_CNT: rdata = {30'd0, fifo_count};
                default: rdata = 32'd0;
            endcase
        end
    end

    // Will the shifter finish its current byte at the end of this cycle?
    wire shift_finishing = is_transmitting && (shift_cnt == (CYCLES_PER_BYTE - 3'd1));
    // Can the shifter load a new byte from FIFO?
    wire can_load_shifter = (!is_transmitting || shift_finishing) && (fifo_count > 2'd0);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            reg_cr            <= 32'h0000_0005; // PE=1, DMATXEN=1
            head              <= 1'b0;
            tail              <= 1'b0;
            fifo_count        <= 2'd0;
            is_transmitting   <= 1'b0;
            shift_byte        <= 8'h00;
            shift_cnt         <= 3'd0;
            wire_tx_done      <= 1'b0;
            last_wire_byte    <= 8'h00;
            total_transmitted <= 8'd0;
            fifo_mem[0]       <= 8'h00;
            fifo_mem[1]       <= 8'h00;
        end else begin
            wire_tx_done <= 1'b0;

            if (sel && write_en && (addr_offset == REG_CR)) begin
                reg_cr <= wdata;
            end

            // Shifter progress
            if (is_transmitting) begin
                if (shift_finishing) begin
                    wire_tx_done      <= 1'b1;
                    last_wire_byte    <= shift_byte;
                    total_transmitted <= total_transmitted + 8'd1;
                    shift_cnt         <= 3'd0;
                    if (!can_load_shifter)
                        is_transmitting <= 1'b0;
                end else begin
                    shift_cnt <= shift_cnt + 3'd1;
                end
            end

            // Load shifter from FIFO vs Push to FIFO
            if (can_load_shifter && push_req) begin
                // Simultaneous pop to shifter and push from bus
                shift_byte      <= fifo_mem[head];
                head            <= ~head;
                is_transmitting <= 1'b1;
                shift_cnt       <= 3'd0;

                fifo_mem[tail]  <= wdata[7:0];
                tail            <= ~tail;
                // fifo_count unchanged
            end else if (can_load_shifter) begin
                shift_byte      <= fifo_mem[head];
                head            <= ~head;
                fifo_count      <= fifo_count - 2'd1;
                is_transmitting <= 1'b1;
                shift_cnt       <= 3'd0;
            end else if (push_req) begin
                fifo_mem[tail]  <= wdata[7:0];
                tail            <= ~tail;
                fifo_count      <= fifo_count + 2'd1;
            end
        end
    end

endmodule
