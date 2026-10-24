`timescale 1ns / 1ps

// ============================================================================
// Parameterized 32-bit Word-Addressed SRAM with Byte-Enable & Debug Word Tap
// ============================================================================
module sram #(
    parameter ADDR_WIDTH = 12,          // 2^12 words = 4096 words = 16 KB
    parameter INIT_FILE  = ""
)(
    input  wire                  clk,
    input  wire                  req,
    input  wire                  we,
    input  wire [3:0]            wstrb,
    input  wire [ADDR_WIDTH-1:0] addr,
    input  wire [31:0]           wdata,
    output reg  [31:0]           rdata,

    // Debug observation taps for waveform viewing (word 0 = spinlock, word 1 = counter, etc.)
    output wire [31:0]           dbg_word0,
    output wire [31:0]           dbg_word1,
    output wire [31:0]           dbg_word2,
    output wire [31:0]           dbg_word3
);

    localparam DEPTH = (1 << ADDR_WIDTH);
    reg [31:0] mem [0:DEPTH-1];

    integer i;
    initial begin
        for (i = 0; i < DEPTH; i = i + 1) begin
            mem[i] = 32'h0000_0000;
        end
        if (INIT_FILE != "") begin
            $readmemh(INIT_FILE, mem);
        end
    end

    assign dbg_word0 = mem[0];
    assign dbg_word1 = mem[1];
    assign dbg_word2 = mem[2];
    assign dbg_word3 = mem[3];

    // Combinational read for low-latency single-cycle bus response, synchronous write
    always @(*) begin
        if (req)
            rdata = mem[addr];
        else
            rdata = 32'h0000_0000;
    end

    always @(posedge clk) begin
        if (req && we) begin
            if (wstrb[0]) mem[addr][ 7: 0] <= wdata[ 7: 0];
            if (wstrb[1]) mem[addr][15: 8] <= wdata[15: 8];
            if (wstrb[2]) mem[addr][23:16] <= wdata[23:16];
            if (wstrb[3]) mem[addr][31:24] <= wdata[31:24];
        end
    end

endmodule
