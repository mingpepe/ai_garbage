`timescale 1ns / 1ps

module sram (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        sel,
    input  wire [7:0]  addr_offset,
    input  wire        write_en,
    input  wire [31:0] wdata,
    output wire [31:0] rdata,

    // Debug / Waveform observation ports for first 8 bytes of SRAM
    output wire [7:0]  sram_byte0,
    output wire [7:0]  sram_byte1,
    output wire [7:0]  sram_byte2,
    output wire [7:0]  sram_byte3,
    output wire [7:0]  sram_byte4,
    output wire [7:0]  sram_byte5,
    output wire [7:0]  sram_byte6,
    output wire [7:0]  sram_byte7
);

    reg [7:0] mem [0:255];
    integer i;

    assign rdata = (sel && !write_en) ? {24'd0, mem[addr_offset]} : 32'd0;

    assign sram_byte0 = mem[0];
    assign sram_byte1 = mem[1];
    assign sram_byte2 = mem[2];
    assign sram_byte3 = mem[3];
    assign sram_byte4 = mem[4];
    assign sram_byte5 = mem[5];
    assign sram_byte6 = mem[6];
    assign sram_byte7 = mem[7];

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            for (i = 0; i < 256; i = i + 1)
                mem[i] <= 8'h00;
        end else if (sel && write_en) begin
            mem[addr_offset] <= wdata[7:0];
        end
    end

endmodule
