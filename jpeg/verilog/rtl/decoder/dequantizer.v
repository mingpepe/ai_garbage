// Multiplies quantized DCT coefficients by parsed 8-bit DQT values
module dequantizer (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               quant_tbl_sel,
    input  wire               in_valid,
    input  wire [5:0]         in_raster_addr,
    input  wire signed [11:0] in_qcoeff,
    input  wire               in_done,

    // Read port to jpeg_marker_parser DQT table
    output wire               dqt_rd_sel,
    output wire [5:0]         dqt_rd_idx,
    input  wire [7:0]         dqt_rd_val,

    output reg                out_valid,
    output reg  [5:0]         out_raster_addr,
    output reg  signed [15:0] out_coeff,
    output reg                out_done
);

    assign dqt_rd_sel = quant_tbl_sel;
    assign dqt_rd_idx = in_raster_addr;

    wire signed [19:0] prod = in_qcoeff * $signed({1'b0, dqt_rd_val});

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            out_valid       <= 1'b0;
            out_raster_addr <= 6'd0;
            out_coeff       <= 16'sd0;
            out_done        <= 1'b0;
        end else begin
            out_valid <= in_valid;
            out_done  <= in_done;
            if (in_valid) begin
                out_raster_addr <= in_raster_addr;
                out_coeff       <= prod[15:0];
            end
        end
    end

endmodule
