`timescale 1ns/1ps
module tb_dct_idct;
    reg clk = 0;
    always #5 clk = ~clk;

    reg rst_n = 0;
    reg fdct_wr_en = 0;
    reg [5:0] fdct_wr_addr = 0;
    reg [7:0] fdct_wr_pix = 0;
    reg fdct_start = 0;

    wire fdct_out_valid;
    wire [5:0] fdct_out_addr;
    wire signed [11:0] fdct_out_coeff;
    wire fdct_done;

    fdct_2d u_fdct (
        .clk(clk), .rst_n(rst_n),
        .in_wr_en(fdct_wr_en), .in_wr_addr(fdct_wr_addr), .in_pixel(fdct_wr_pix),
        .start(fdct_start),
        .out_valid(fdct_out_valid), .out_addr(fdct_out_addr), .out_coeff(fdct_out_coeff),
        .done(fdct_done)
    );

    wire signed [15:0] idct_in_coeff = {{4{fdct_out_coeff[11]}}, fdct_out_coeff};
    wire idct_out_valid;
    wire [5:0] idct_out_addr;
    wire [7:0] idct_out_pixel;
    wire idct_done;

    idct_2d u_idct (
        .clk(clk), .rst_n(rst_n),
        .in_wr_en(fdct_out_valid), .in_wr_addr(fdct_out_addr), .in_coeff(idct_in_coeff),
        .start(fdct_done),
        .out_valid(idct_out_valid), .out_addr(idct_out_addr), .out_pixel(idct_out_pixel),
        .done(idct_done)
    );

    reg [7:0] src_blk [0:63];
    reg [7:0] rec_blk [0:63];
    integer i, errs, diff;

    always @(posedge clk) begin
        if (idct_out_valid)
            rec_blk[idct_out_addr] <= idct_out_pixel;
    end

    initial begin
        errs = 0;
        for (i = 0; i < 64; i = i + 1)
            src_blk[i] = ((i / 8) * 20 + (i % 8) * 15 + 10) & 8'hFF;

        #20 rst_n = 1;
        for (i = 0; i < 64; i = i + 1) begin
            @(posedge clk);
            fdct_wr_en <= 1;
            fdct_wr_addr <= i[5:0];
            fdct_wr_pix <= src_blk[i];
        end
        @(posedge clk);
        fdct_wr_en <= 0;
        fdct_start <= 1;
        @(posedge clk);
        fdct_start <= 0;

        wait(idct_done);
        @(posedge clk);

        for (i = 0; i < 64; i = i + 1) begin
            diff = $signed({1'b0, rec_blk[i]}) - $signed({1'b0, src_blk[i]});
            if (diff > 2 || diff < -2) begin
                $display("Mismatch at idx %0d: src=%0d rec=%0d", i, src_blk[i], rec_blk[i]);
                errs = errs + 1;
            end
        end

        if (errs != 0) begin
            $display("FAIL tb_dct_idct: errs=%0d", errs);
            $finish_and_return(1);
        end
        $display("PASS tb_dct_idct: 64/64 pixels within +-2 LSB");
        $finish;
    end
endmodule
