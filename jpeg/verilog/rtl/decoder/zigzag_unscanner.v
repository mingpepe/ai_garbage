// Streams 64 Zig-Zag coefficients into Raster order using zigzag_lut
module zigzag_unscanner (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               start,
    output wire [5:0]         zz_rd_addr,
    input  wire signed [11:0] zz_rd_data,
    output reg                out_valid,
    output reg  [5:0]         out_raster_addr,
    output reg  signed [11:0] out_qcoeff,
    output reg                done
);

    reg        active;
    reg [5:0]  zz_idx;

    wire [5:0] zz_to_raster;
    wire [5:0] raster_to_zz_unused;

    zigzag_lut u_zz_lut (
        .idx_in       (zz_idx),
        .zz_to_raster (zz_to_raster),
        .raster_to_zz (raster_to_zz_unused)
    );

    assign zz_rd_addr = zz_idx;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            active          <= 1'b0;
            zz_idx          <= 6'd0;
            out_valid       <= 1'b0;
            out_raster_addr <= 6'd0;
            out_qcoeff      <= 12'sd0;
            done            <= 1'b0;
        end else begin
            out_valid <= 1'b0;
            done      <= 1'b0;

            if (!active) begin
                if (start) begin
                    active <= 1'b1;
                    zz_idx <= 6'd0;
                end
            end else begin
                out_valid       <= 1'b1;
                out_raster_addr <= zz_to_raster;
                out_qcoeff      <= zz_rd_data;

                if (zz_idx == 6'd63) begin
                    active <= 1'b0;
                    done   <= 1'b1;
                end else begin
                    zz_idx <= zz_idx + 6'd1;
                end
            end
        end
    end

endmodule
