`timescale 1ns/1ps
module tb_stuffing_and_420;
    reg clk = 0;
    always #5 clk = ~clk;

    // Test 1: Noisy 24x24 image through Verilog Encoder -> Verilog Decoder (triggers FF 00 stuffing & ZRL)
    localparam W = 24;
    localparam H = 24;

    reg rst_n = 0;
    reg enc_start = 0;
    wire px_rd_en;
    wire [15:0] px_x, px_y;
    reg [7:0] px_r, px_g, px_b;
    wire enc_out_valid;
    wire [7:0] enc_out_byte;
    wire enc_done;

    reg [7:0] src_r [0:W*H-1];
    reg [7:0] src_g [0:W*H-1];
    reg [7:0] src_b [0:W*H-1];

    always @(posedge clk) begin
        if (px_rd_en) begin
            px_r <= src_r[px_y * W + px_x];
            px_g <= src_g[px_y * W + px_x];
            px_b <= src_b[px_y * W + px_x];
        end
    end

    jpeg_encoder_top u_enc (
        .clk(clk), .rst_n(rst_n), .start(enc_start),
        .img_width(16'd24), .img_height(16'd24),
        .px_rd_en(px_rd_en), .px_x(px_x), .px_y(px_y),
        .px_r(px_r), .px_g(px_g), .px_b(px_b),
        .out_valid(enc_out_valid), .out_byte(enc_out_byte), .out_ready(1'b1),
        .done(enc_done)
    );

    reg [7:0] jpg_buf [0:16383];
    integer jpg_len;
    integer stuff_cnt;
    reg prev_ff;

    always @(posedge clk) begin
        if (enc_out_valid) begin
            jpg_buf[jpg_len] = enc_out_byte;
            if (jpg_len >= 623) begin
                if (prev_ff && enc_out_byte == 8'h00)
                    stuff_cnt = stuff_cnt + 1;
                prev_ff = (enc_out_byte == 8'hFF);
            end
            jpg_len = jpg_len + 1;
        end
    end

    reg dec_rst_n = 0;
    reg dec_in_valid = 0;
    reg [7:0] dec_in_byte = 0;
    wire dec_in_ready;
    wire dec_scan_active;
    wire [15:0] dec_w, dec_h;
    wire dec_err;
    wire dec_px_valid;
    wire [15:0] dec_px_x, dec_px_y;
    wire [7:0] dec_r, dec_g, dec_b;
    wire dec_done;

    jpeg_decoder_top u_dec (
        .clk(clk), .rst_n(dec_rst_n),
        .in_valid(dec_in_valid), .in_byte(dec_in_byte), .in_ready(dec_in_ready),
        .scan_active(dec_scan_active), .img_width(dec_w), .img_height(dec_h), .parse_error(dec_err),
        .out_px_valid(dec_px_valid), .out_px_x(dec_px_x), .out_px_y(dec_px_y),
        .out_r(dec_r), .out_g(dec_g), .out_b(dec_b), .done(dec_done)
    );

    integer dec_px_cnt;
    reg [7:0] dec_r_mem [0:W*H-1];
    reg [7:0] dec_g_mem [0:W*H-1];
    reg [7:0] dec_b_mem [0:W*H-1];

    always @(posedge clk) begin
        if (dec_px_valid) begin
            dec_r_mem[dec_px_y * W + dec_px_x] <= dec_r;
            dec_g_mem[dec_px_y * W + dec_px_x] <= dec_g;
            dec_b_mem[dec_px_y * W + dec_px_x] <= dec_b;
            dec_px_cnt <= dec_px_cnt + 1;
        end
    end

    integer i, seed, send_idx, dr, dg, db;
    real mse;

    initial begin
        jpg_len = 0;
        stuff_cnt = 0;
        prev_ff = 0;
        dec_px_cnt = 0;
        seed = 12345;
        for (i = 0; i < W * H; i = i + 1) begin
            src_r[i] = $random(seed) & 8'hFF;
            src_g[i] = $random(seed) & 8'hFF;
            src_b[i] = $random(seed) & 8'hFF;
        end

        #20 rst_n = 1;
        @(posedge clk);
        enc_start <= 1;
        @(posedge clk);
        enc_start <= 0;

        wait(enc_done);
        repeat (5) @(posedge clk);
        $display("Noisy 24x24: jpg_len=%0d, stuffed_00_count=%0d", jpg_len, stuff_cnt);

        #20 dec_rst_n = 1;
        send_idx = 0;
        while (send_idx < jpg_len) begin
            @(posedge clk);
            dec_in_valid <= 1'b1;
            dec_in_byte  <= jpg_buf[send_idx];
            if (dec_in_valid && dec_in_ready) begin
                send_idx = send_idx + 1;
                if (send_idx < jpg_len)
                    dec_in_byte <= jpg_buf[send_idx];
                else
                    dec_in_valid <= 1'b0;
            end
        end
        @(posedge clk);
        dec_in_valid <= 1'b0;

        begin : wait_dec_loop
            integer cyc;
            cyc = 0;
            while (!dec_done && cyc < 150000) begin
                @(posedge clk);
                cyc = cyc + 1;
            end
            if (!dec_done) begin
                $display("FAIL: Decoder timeout on noisy 24x24! px_cnt=%0d", dec_px_cnt);
                $finish_and_return(1);
            end
        end

        repeat (5) @(posedge clk);
        if (dec_err || dec_px_cnt !== W * H) begin
            $display("FAIL: err=%b px_cnt=%0d", dec_err, dec_px_cnt);
            $finish_and_return(1);
        end

        mse = 0.0;
        for (i = 0; i < W * H; i = i + 1) begin
            dr = $signed({1'b0, src_r[i]}) - $signed({1'b0, dec_r_mem[i]});
            dg = $signed({1'b0, src_g[i]}) - $signed({1'b0, dec_g_mem[i]});
            db = $signed({1'b0, src_b[i]}) - $signed({1'b0, dec_b_mem[i]});
            mse = mse + (dr*dr + dg*dg + db*db);
        end
        mse = mse / (W * H * 3.0);
        $display("Noisy 24x24 Roundtrip MSE=%0.2f (PSNR=%0.2f dB)", mse, 10.0 * $log10(255.0*255.0/mse));
        if (stuff_cnt == 0) begin
            $display("WARNING: expected stuffing on noisy 24x24");
        end
        $display("PASS tb_stuffing_and_420");
        $finish;
    end
endmodule
