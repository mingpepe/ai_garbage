// Combines Huffman codeword (from huffman_lut_rom) and VLI bits into one MSB-first bit packet
module huffman_encoder (
    input  wire        in_valid,
    input  wire        in_is_dc,
    input  wire        in_is_chroma,
    input  wire [7:0]  in_symbol,
    input  wire [10:0] in_vli_bits,
    input  wire [3:0]  in_vli_len,
    output wire        in_ready,
    output wire        out_valid,
    output wire [26:0] out_bits,
    output wire [4:0]  out_len,
    input  wire        out_ready
);

    wire [15:0] huff_code;
    wire [4:0]  huff_len;

    huffman_lut_rom u_huff_rom (
        .table_class (~in_is_dc),
        .table_sel   (in_is_chroma),
        .symbol      (in_symbol),
        .code_bits   (huff_code),
        .code_len    (huff_len)
    );

    wire [26:0] shifted_huff = {11'd0, huff_code} << in_vli_len;
    wire [26:0] vli_mask     = (27'd1 << in_vli_len) - 27'd1;
    wire [26:0] masked_vli   = {16'd0, in_vli_bits} & vli_mask;

    assign out_valid = in_valid;
    assign in_ready  = out_ready;
    assign out_bits  = shifted_huff | masked_vli;
    assign out_len   = huff_len + {1'b0, in_vli_len};

endmodule
