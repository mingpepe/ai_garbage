`timescale 1ns/1ps
module tb_encoder_decoder;
    localparam W = 16;
    localparam H = 16;

    reg clk = 0;
    always #5 clk = ~clk;

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

    // 1-cycle synchronous frame buffer read
    always @(posedge clk) begin
        if (px_rd_en) begin
            px_r <= src_r[px_y * W + px_x];
            px_g <= src_g[px_y * W + px_x];
            px_b <= src_b[px_y * W + px_x];
        end
    end

    jpeg_encoder_top u_enc (
        .clk(clk), .rst_n(rst_n), .start(enc_start),
        .img_width(16'd16), .img_height(16'd16),
        .px_rd_en(px_rd_en), .px_x(px_x), .px_y(px_y),
        .px_r(px_r), .px_g(px_g), .px_b(px_b),
        .out_valid(enc_out_valid), .out_byte(enc_out_byte), .out_ready(1'b1),
        .done(enc_done)
    );

    reg [7:0] jpg_buf [0:8191];
    integer jpg_len;

    always @(posedge clk) begin
        if (enc_out_valid) begin
            jpg_buf[jpg_len] = enc_out_byte;
            jpg_len = jpg_len + 1;
        end
    end

    // Decoder instance
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

    reg [7:0] dec_img_r [0:W*H-1];
    reg [7:0] dec_img_g [0:W*H-1];
    reg [7:0] dec_img_b [0:W*H-1];
    integer dec_px_cnt;

    always @(posedge clk) begin
        if (dec_px_valid) begin
            dec_img_r[dec_px_y * W + dec_px_x] <= dec_r;
            dec_img_g[dec_px_y * W + dec_px_x] <= dec_g;
            dec_img_b[dec_px_y * W + dec_px_x] <= dec_b;
            dec_px_cnt <= dec_px_cnt + 1;
        end
    end

    integer x, y, i, fd, send_idx, dr, dg, db;
    real mse;

    initial begin
        jpg_len = 0;
        dec_px_cnt = 0;
        for (y = 0; y < H; y = y + 1) begin
            for (x = 0; x < W; x = x + 1) begin
                src_r[y * W + x] = (x * 15 + y * 2);
                src_g[y * W + x] = (y * 15 + 10);
                src_b[y * W + x] = ((15 - x) * 14 + 20);
            end
        end

        // 1. Run Verilog Encoder
        #20 rst_n = 1;
        @(posedge clk);
        enc_start <= 1;
        @(posedge clk);
        enc_start <= 0;

        wait(enc_done);
        repeat (5) @(posedge clk);

        $display("Verilog Encoder produced %0d JPEG bytes (SOI=%02X%02X, EOI=%02X%02X)",
            jpg_len, jpg_buf[0], jpg_buf[1], jpg_buf[jpg_len-2], jpg_buf[jpg_len-1]);

        if (jpg_buf[0] !== 8'hFF || jpg_buf[1] !== 8'hD8 ||
            jpg_buf[jpg_len-2] !== 8'hFF || jpg_buf[jpg_len-1] !== 8'hD9) begin
            $display("FAIL: Missing SOI/EOI markers");
            $finish_and_return(1);
        end

        fd = $fopen("/tmp/verilog_test_16x16.jpg", "wb");
        for (i = 0; i < jpg_len; i = i + 1)
            $fwrite(fd, "%c", jpg_buf[i]);
        $fclose(fd);

        // 2. Feed JPEG bitstream into Verilog Decoder
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

        begin : wait_dec
            integer cycles;
            cycles = 0;
            while (!dec_done && cycles < 50000) begin
                @(posedge clk);
                cycles = cycles + 1;
            end
            if (!dec_done) begin
                $display("FAIL: Decoder timeout! scan_active=%b err=%b px_cnt=%0d", dec_scan_active, dec_err, dec_px_cnt);
                $finish_and_return(1);
            end
        end

        repeat (5) @(posedge clk);
        $display("Verilog Decoder finished: w=%0d h=%0d px_cnt=%0d err=%b", dec_w, dec_h, dec_px_cnt, dec_err);

        if (dec_err || dec_w !== 16'd16 || dec_h !== 16'd16 || dec_px_cnt !== W * H) begin
            $display("FAIL: Dimension/pixel count mismatch");
            $finish_and_return(1);
        end

        mse = 0.0;
        for (i = 0; i < W * H; i = i + 1) begin
            dr = $signed({1'b0, src_r[i]}) - $signed({1'b0, dec_img_r[i]});
            dg = $signed({1'b0, src_g[i]}) - $signed({1'b0, dec_img_g[i]});
            db = $signed({1'b0, src_b[i]}) - $signed({1'b0, dec_img_b[i]});
            mse = mse + (dr*dr + dg*dg + db*db);
        end
        mse = mse / (W * H * 3.0);
        $display("Verilog Encode->Decode Roundtrip MSE=%0.2f (PSNR=%0.2f dB)", mse, 10.0 * $log10(255.0*255.0/mse));
        if (mse > 80.0) begin
            $display("FAIL: Excessive roundtrip MSE");
            $finish_and_return(1);
        end
        $display("PASS tb_encoder_decoder");
        $finish;
    end
endmodule
