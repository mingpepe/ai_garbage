// Reorders incoming raster-order 8x8 quantized coefficients into Zig-Zag array zz_mem[0..63]
module zigzag_scanner (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               in_valid,
    input  wire [5:0]         in_addr,
    input  wire signed [11:0] in_qcoeff,
    input  wire               in_done,
    output reg                block_ready,
    input  wire [5:0]         rd_addr,
    output wire signed [11:0] rd_data
);

    wire [5:0] zz_to_raster_unused;
    wire [5:0] raster_to_zz;

    zigzag_lut u_zz_lut (
        .idx_in       (in_addr),
        .zz_to_raster (zz_to_raster_unused),
        .raster_to_zz (raster_to_zz)
    );

    reg signed [11:0] zz_mem [0:63];

    assign rd_data = zz_mem[rd_addr];

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            block_ready <= 1'b0;
        end else begin
            block_ready <= in_done;
            if (in_valid)
                zz_mem[raster_to_zz] <= in_qcoeff;
        end
    end

endmodule
