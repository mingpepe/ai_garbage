// Fixed-point Q20 reciprocal quantizer (matches ITU-T T.81 Q50 tables)
module quantizer (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               is_chroma,
    input  wire               in_valid,
    input  wire [5:0]         in_addr,
    input  wire signed [11:0] in_coeff,
    output reg                out_valid,
    output reg  [5:0]         out_addr,
    output reg  signed [11:0] out_qcoeff
);

    wire [7:0]  q_val_unused;
    wire [20:0] inv_q_q20;

    quant_table_rom u_qrom (
        .table_sel (is_chroma),
        .raster_idx(in_addr),
        .q_val     (q_val_unused),
        .inv_q_q20 (inv_q_q20)
    );

    wire        neg   = in_coeff[11];
    wire [11:0] abs_c = neg ? (~in_coeff + 12'd1) : in_coeff;
    wire [32:0] prod  = ({21'd0, abs_c} * {12'd0, inv_q_q20}) + 33'd524288;
    wire [11:0] mag_q = prod[31:20];
    wire signed [11:0] q_signed = neg ? -$signed({1'b0, mag_q[10:0]}) : $signed({1'b0, mag_q[10:0]});

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            out_valid  <= 1'b0;
            out_addr   <= 6'd0;
            out_qcoeff <= 12'sd0;
        end else begin
            out_valid  <= in_valid;
            if (in_valid) begin
                out_addr   <= in_addr;
                out_qcoeff <= q_signed;
            end
        end
    end

endmodule
