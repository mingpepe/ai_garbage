`timescale 1ns/1ps
// Decodes an external Baseline JPEG hex byte file (supports 4:2:0, 4:4:4, Grayscale)
module tb_real_jpeg_decode;
    reg clk = 0;
    always #5 clk = ~clk;

    reg [1023:0] jpg_hex_path;
    reg [1023:0] rgb_out_path;
    integer jpg_len = 0;

    reg [7:0] jpg_mem [0:65535];
    reg rst_n = 0;
    reg in_valid = 0;
    reg [7:0] in_byte = 0;
    wire in_ready;
    wire scan_active;
    wire [15:0] img_w, img_h;
    wire parse_error;
    wire out_px_valid;
    wire [15:0] out_px_x, out_px_y;
    wire [7:0] out_r, out_g, out_b;
    wire done;

    jpeg_decoder_top u_dec (
        .clk(clk), .rst_n(rst_n),
        .in_valid(in_valid), .in_byte(in_byte), .in_ready(in_ready),
        .scan_active(scan_active), .img_width(img_w), .img_height(img_h), .parse_error(parse_error),
        .out_px_valid(out_px_valid), .out_px_x(out_px_x), .out_px_y(out_px_y),
        .out_r(out_r), .out_g(out_g), .out_b(out_b), .done(done)
    );

    reg [7:0] rgb_buf [0:12287];
    integer px_cnt;

    always @(posedge clk) begin
        if (out_px_valid) begin
            rgb_buf[(out_px_y * img_w + out_px_x) * 3 + 0] <= out_r;
            rgb_buf[(out_px_y * img_w + out_px_x) * 3 + 1] <= out_g;
            rgb_buf[(out_px_y * img_w + out_px_x) * 3 + 2] <= out_b;
            px_cnt <= px_cnt + 1;
        end
    end

    integer i, fd, send_idx;

    initial begin
        px_cnt = 0;
        for (i = 0; i < 65536; i = i + 1) jpg_mem[i] = 8'h00;
        if (!$value$plusargs("JPG_HEX=%s", jpg_hex_path)) jpg_hex_path = "/tmp/real_in.hex";
        if (!$value$plusargs("JPG_LEN=%d", jpg_len)) jpg_len = 0;
        if (!$value$plusargs("RGB_OUT=%s", rgb_out_path)) rgb_out_path = "/tmp/real_dec.rgb";

        $readmemh(jpg_hex_path, jpg_mem);

        #20 rst_n = 1;
        send_idx = 0;
        while (send_idx < jpg_len) begin
            @(posedge clk);
            in_valid <= 1'b1;
            in_byte  <= jpg_mem[send_idx];
            if (in_valid && in_ready) begin
                send_idx = send_idx + 1;
                if (send_idx < jpg_len)
                    in_byte <= jpg_mem[send_idx];
                else
                    in_valid <= 1'b0;
            end
        end
        @(posedge clk);
        in_valid <= 1'b0;

        begin : wait_loop
            integer cyc;
            cyc = 0;
            while (!done && cyc < 500000) begin
                @(posedge clk);
                cyc = cyc + 1;
            end
            if (!done) begin
                $display("FAIL tb_real_jpeg_decode: timeout scan_active=%b err=%b px_cnt=%0d", scan_active, parse_error, px_cnt);
                $finish_and_return(1);
            end
        end

        repeat (4) @(posedge clk);
        fd = $fopen(rgb_out_path, "wb");
        for (i = 0; i < img_w * img_h * 3; i = i + 1)
            $fwrite(fd, "%c", rgb_buf[i]);
        $fclose(fd);

        $display("PASS tb_real_jpeg_decode: w=%0d h=%0d px_cnt=%0d err=%b", img_w, img_h, px_cnt, parse_error);
        $finish;
    end
endmodule
