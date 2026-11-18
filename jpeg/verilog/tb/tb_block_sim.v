`timescale 1ns/1ps
// Parameterized hex-driven Verilog encoder+decoder runner for live Web App verification
module tb_block_sim;
    reg clk = 0;
    always #5 clk = ~clk;

    reg [15:0] width = 8;
    reg [15:0] height = 8;
    reg [1023:0] hex_in_path;
    reg [1023:0] jpg_out_path;
    reg [1023:0] rgb_out_path;

    reg rst_n = 0;
    reg enc_start = 0;
    wire px_rd_en;
    wire [15:0] px_x, px_y;
    reg [7:0] px_r, px_g, px_b;
    wire enc_out_valid;
    wire [7:0] enc_out_byte;
    wire enc_done;

    reg [7:0] raw_in [0:12287]; // up to 64x64x3

    always @(posedge clk) begin
        if (px_rd_en) begin
            px_r <= raw_in[(px_y * width + px_x) * 3 + 0];
            px_g <= raw_in[(px_y * width + px_x) * 3 + 1];
            px_b <= raw_in[(px_y * width + px_x) * 3 + 2];
        end
    end

    jpeg_encoder_top u_enc (
        .clk(clk), .rst_n(rst_n), .start(enc_start),
        .img_width(width), .img_height(height),
        .px_rd_en(px_rd_en), .px_x(px_x), .px_y(px_y),
        .px_r(px_r), .px_g(px_g), .px_b(px_b),
        .out_valid(enc_out_valid), .out_byte(enc_out_byte), .out_ready(1'b1),
        .done(enc_done)
    );

    reg [7:0] jpg_buf [0:32767];
    integer jpg_len;

    always @(posedge clk) begin
        if (enc_out_valid) begin
            jpg_buf[jpg_len] = enc_out_byte;
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

    reg [7:0] dec_rgb [0:12287];
    integer dec_px_cnt;

    always @(posedge clk) begin
        if (dec_px_valid) begin
            dec_rgb[(dec_px_y * width + dec_px_x) * 3 + 0] <= dec_r;
            dec_rgb[(dec_px_y * width + dec_px_x) * 3 + 1] <= dec_g;
            dec_rgb[(dec_px_y * width + dec_px_x) * 3 + 2] <= dec_b;
            dec_px_cnt <= dec_px_cnt + 1;
        end
    end

    integer i, fd, send_idx;

    initial begin
        jpg_len = 0;
        dec_px_cnt = 0;
        if (!$value$plusargs("W=%d", width)) width = 8;
        if (!$value$plusargs("H=%d", height)) height = 8;
        if (!$value$plusargs("HEX_IN=%s", hex_in_path)) hex_in_path = "/tmp/v_in.hex";
        if (!$value$plusargs("JPG_OUT=%s", jpg_out_path)) jpg_out_path = "/tmp/v_out.jpg";
        if (!$value$plusargs("RGB_OUT=%s", rgb_out_path)) rgb_out_path = "/tmp/v_out.rgb";

        $readmemh(hex_in_path, raw_in);

        #20 rst_n = 1;
        @(posedge clk);
        enc_start <= 1;
        @(posedge clk);
        enc_start <= 0;

        wait(enc_done);
        repeat (4) @(posedge clk);

        fd = $fopen(jpg_out_path, "wb");
        for (i = 0; i < jpg_len; i = i + 1)
            $fwrite(fd, "%c", jpg_buf[i]);
        $fclose(fd);

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

        begin : wait_dec_blk
            integer cyc;
            cyc = 0;
            while (!dec_done && cyc < 500000) begin
                @(posedge clk);
                cyc = cyc + 1;
            end
            if (!dec_done) begin
                $display("FAIL: Decoder timeout");
                $finish_and_return(1);
            end
        end

        repeat (4) @(posedge clk);
        fd = $fopen(rgb_out_path, "wb");
        for (i = 0; i < width * height * 3; i = i + 1)
            $fwrite(fd, "%c", dec_rgb[i]);
        $fclose(fd);

        $display("OK jpg_bytes=%0d dec_w=%0d dec_h=%0d dec_px=%0d err=%b", jpg_len, dec_w, dec_h, dec_px_cnt, dec_err);
        $finish;
    end
endmodule
