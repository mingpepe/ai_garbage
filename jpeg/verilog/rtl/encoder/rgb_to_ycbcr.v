// Fixed-point ITU-R BT.601 RGB888 -> YCbCr888 converter (Q8 arithmetic)
module rgb_to_ycbcr (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       valid_in,
    input  wire [7:0] r_in,
    input  wire [7:0] g_in,
    input  wire [7:0] b_in,
    output reg        valid_out,
    output reg  [7:0] y_out,
    output reg  [7:0] cb_out,
    output reg  [7:0] cr_out
);

    wire signed [17:0] r_s = {10'd0, r_in};
    wire signed [17:0] g_s = {10'd0, g_in};
    wire signed [17:0] b_s = {10'd0, b_in};

    wire signed [17:0] y_acc  = (18'sd77  * r_s + 18'sd150 * g_s + 18'sd29  * b_s + 18'sd128) >>> 8;
    wire signed [17:0] cb_acc = ((-18'sd43 * r_s - 18'sd85 * g_s + 18'sd128 * b_s + 18'sd128) >>> 8) + 18'sd128;
    wire signed [17:0] cr_acc = ((18'sd128 * r_s - 18'sd107 * g_s - 18'sd21 * b_s + 18'sd128) >>> 8) + 18'sd128;

    function [7:0] clamp8;
        input signed [17:0] val;
        begin
            if (val < 18'sd0)
                clamp8 = 8'd0;
            else if (val > 18'sd255)
                clamp8 = 8'd255;
            else
                clamp8 = val[7:0];
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            valid_out <= 1'b0;
            y_out     <= 8'd0;
            cb_out    <= 8'd128;
            cr_out    <= 8'd128;
        end else begin
            valid_out <= valid_in;
            if (valid_in) begin
                y_out  <= clamp8(y_acc);
                cb_out <= clamp8(cb_acc);
                cr_out <= clamp8(cr_acc);
            end
        end
    end

endmodule
