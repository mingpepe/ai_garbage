// Variable-width MSB-first bit accumulator with automatic 0xFF -> 0x00 byte stuffing and EOI 1-bit padding
module bit_packer_stuffer (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        in_valid,
    input  wire [26:0] in_bits,
    input  wire [4:0]  in_len,
    output wire        in_ready,
    input  wire        flush,
    output reg         out_valid,
    output reg  [7:0]  out_byte,
    input  wire        out_ready,
    output reg         flush_done
);

    reg [47:0] bit_buf;
    reg [5:0]  bit_cnt;
    reg        stuff_pending;
    reg        flush_req;

    wire [27:0] len_mask  = (28'd1 << in_len) - 28'd1;
    wire [26:0] clean_in  = in_bits & len_mask[26:0];
    wire [5:0]  shift_amt = 6'd48 - bit_cnt - {1'b0, in_len};
    wire [47:0] placed_in = {21'd0, clean_in} << shift_amt;

    wire can_accept = (!stuff_pending) && (bit_cnt < 6'd8) && (!flush_req) && (!out_valid || out_ready);
    assign in_ready = can_accept;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            bit_buf       <= 48'd0;
            bit_cnt       <= 6'd0;
            stuff_pending <= 1'b0;
            flush_req     <= 1'b0;
            out_valid     <= 1'b0;
            out_byte      <= 8'd0;
            flush_done    <= 1'b0;
        end else begin
            flush_done <= 1'b0;
            if (flush)
                flush_req <= 1'b1;

            if (out_valid && !out_ready) begin
                // Hold current output byte until downstream accepts
                out_valid <= 1'b1;
            end else begin
                out_valid <= 1'b0;

                if (stuff_pending) begin
                    out_valid     <= 1'b1;
                    out_byte      <= 8'h00;
                    stuff_pending <= 1'b0;
                end else if (bit_cnt >= 6'd8) begin
                    out_valid <= 1'b1;
                    out_byte  <= bit_buf[47:40];
                    if (bit_buf[47:40] == 8'hFF)
                        stuff_pending <= 1'b1;
                    bit_buf <= bit_buf << 8;
                    bit_cnt <= bit_cnt - 6'd8;
                end else if (flush_req) begin
                    if (bit_cnt > 6'd0) begin
                        out_valid <= 1'b1;
                        out_byte  <= bit_buf[47:40] | (8'hFF >> bit_cnt);
                        if ((bit_buf[47:40] | (8'hFF >> bit_cnt)) == 8'hFF)
                            stuff_pending <= 1'b1;
                        bit_buf <= 48'd0;
                        bit_cnt <= 6'd0;
                    end else begin
                        flush_req  <= 1'b0;
                        flush_done <= 1'b1;
                    end
                end else if (in_valid && can_accept && (in_len != 5'd0)) begin
                    bit_buf <= bit_buf | placed_in;
                    bit_cnt <= bit_cnt + {1'b0, in_len};
                end
            end
        end
    end

endmodule
