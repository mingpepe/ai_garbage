// 32-bit left-aligned MSB-first bit reader for JPEG entropy decoding
module bit_reader (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        in_valid,
    input  wire [7:0]  in_byte,
    output wire        in_ready,
    input  wire        consume_en,
    input  wire [4:0]  consume_len,
    output wire [15:0] peek_16,
    output reg  [5:0]  avail_bits
);

    reg [31:0] bit_buf;

    assign in_ready = (avail_bits <= 6'd24) && !consume_en;
    assign peek_16  = bit_buf[31:16];

    wire [5:0]  shift_pos  = 6'd24 - avail_bits;
    wire [31:0] placed_byte = {24'd0, in_byte} << shift_pos;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            bit_buf    <= 32'd0;
            avail_bits <= 6'd0;
        end else if (consume_en) begin
            bit_buf <= bit_buf << consume_len;
            if (avail_bits >= {1'b0, consume_len})
                avail_bits <= avail_bits - {1'b0, consume_len};
            else
                avail_bits <= 6'd0;
        end else if (in_valid && in_ready) begin
            bit_buf    <= bit_buf | placed_byte;
            avail_bits <= avail_bits + 6'd8;
        end
    end

endmodule
