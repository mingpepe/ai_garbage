`timescale 1ns/1ps
module tb_color_space;
    reg clk = 0;
    always #5 clk = ~clk;

    reg rst_n = 0;
    reg valid_in = 0;
    reg [7:0] r_in, g_in, b_in;

    wire ycc_valid;
    wire [7:0] y_mid, cb_mid, cr_mid;
    wire rgb_valid;
    wire [7:0] r_out, g_out, b_out;

    rgb_to_ycbcr u_fwd (
        .clk(clk), .rst_n(rst_n), .valid_in(valid_in),
        .r_in(r_in), .g_in(g_in), .b_in(b_in),
        .valid_out(ycc_valid), .y_out(y_mid), .cb_out(cb_mid), .cr_out(cr_mid)
    );

    ycbcr_to_rgb u_inv (
        .clk(clk), .rst_n(rst_n), .valid_in(ycc_valid),
        .y_in(y_mid), .cb_in(cb_mid), .cr_in(cr_mid),
        .valid_out(rgb_valid), .r_out(r_out), .g_out(g_out), .b_out(b_out)
    );

    integer i, errs;
    reg [7:0] exp_r [0:7];
    reg [7:0] exp_g [0:7];
    reg [7:0] exp_b [0:7];

    integer out_idx;

    initial begin
        errs = 0;
        out_idx = 0;
        exp_r[0]=0;   exp_g[0]=0;   exp_b[0]=0;
        exp_r[1]=255; exp_g[1]=255; exp_b[1]=255;
        exp_r[2]=255; exp_g[2]=0;   exp_b[2]=0;
        exp_r[3]=0;   exp_g[3]=255; exp_b[3]=0;
        exp_r[4]=0;   exp_g[4]=0;   exp_b[4]=255;
        exp_r[5]=200; exp_g[5]=120; exp_b[5]=45;
        exp_r[6]=40;  exp_g[6]=180; exp_b[6]=210;
        exp_r[7]=128; exp_g[7]=128; exp_b[7]=128;

        #20 rst_n = 1;
        for (i = 0; i < 8; i = i + 1) begin
            @(posedge clk);
            valid_in <= 1;
            r_in <= exp_r[i];
            g_in <= exp_g[i];
            b_in <= exp_b[i];
        end
        @(posedge clk);
        valid_in <= 0;

        repeat (10) @(posedge clk);
        if (out_idx != 8 || errs != 0) begin
            $display("FAIL tb_color_space: out_idx=%0d errs=%0d", out_idx, errs);
            $finish_and_return(1);
        end
        $display("PASS tb_color_space: all 8 vectors within +-3 LSB");
        $finish;
    end

    always @(posedge clk) begin
        if (rgb_valid) begin
            if (($signed({1'b0, r_out}) - $signed({1'b0, exp_r[out_idx]}) > 3) ||
                ($signed({1'b0, r_out}) - $signed({1'b0, exp_r[out_idx]}) < -3) ||
                ($signed({1'b0, g_out}) - $signed({1'b0, exp_g[out_idx]}) > 3) ||
                ($signed({1'b0, g_out}) - $signed({1'b0, exp_g[out_idx]}) < -3) ||
                ($signed({1'b0, b_out}) - $signed({1'b0, exp_b[out_idx]}) > 3) ||
                ($signed({1'b0, b_out}) - $signed({1'b0, exp_b[out_idx]}) < -3)) begin
                $display("Mismatch idx=%0d in=(%0d,%0d,%0d) out=(%0d,%0d,%0d)",
                    out_idx, exp_r[out_idx], exp_g[out_idx], exp_b[out_idx], r_out, g_out, b_out);
                errs = errs + 1;
            end
            out_idx = out_idx + 1;
        end
    end
endmodule
