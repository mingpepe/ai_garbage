// Fixed-point ITU-R BT.601 YCbCr888 -> RGB888 converter (Q8 arithmetic)
module ycbcr_to_rgb (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       valid_in,
    input  wire [7:0] y_in,
    input  wire [7:0] cb_in,
    input  wire [7:0] cr_in,
    output reg        valid_out,
    output reg  [7:0] r_out,
    output reg  [7:0] g_out,
    output reg  [7:0] b_out
);

    wire signed [19:0] y_q8   = $signed({12'd0, y_in}) <<< 8;
    wire signed [19:0] cb_off = $signed({12'd0, cb_in}) - 20'sd128;
    wire signed [19:0] cr_off = $signed({12'd0, cr_in}) - 20'sd128;

    wire signed [19:0] r_acc = (y_q8 + 20'sd359 * cr_off + 20'sd128) >>> 8;
    wire signed [19:0] g_acc = (y_q8 - 20'sd88 * cb_off - 20'sd183 * cr_off + 20'sd128) >>> 8;
    wire signed [19:0] b_acc = (y_q8 + 20'sd454 * cb_off + 20'sd128) >>> 8;

    function [7:0] clamp8;
        input signed [19:0] val;
        begin
            if (val < 20'sd0)
                clamp8 = 8'd0;
            else if (val > 20'sd255)
                clamp8 = 8'd255;
            else
                clamp8 = val[7:0];
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            valid_out <= 1'b0;
            r_out     <= 8'd0;
            g_out     <= 8'd0;
            b_out     <= 8'd0;
        end else begin
            valid_out <= valid_in;
            if (valid_in) begin
                r_out <= clamp8(r_acc);
                g_out <= clamp8(g_acc);
                b_out <= clamp8(b_acc);
            end
        end
    end

endmodule
