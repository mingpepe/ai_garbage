// Canonical ITU-T T.81 Huffman + VLI Symbol Decoder
module huffman_decoder (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               start,
    input  wire [1:0]         tbl_sel,       // {is_ac, tbl_id}

    // Bit reader interface
    input  wire [15:0]        peek_16,
    input  wire [5:0]         avail_bits,
    input  wire               eoi_seen,
    output reg                consume_en,
    output reg  [4:0]         consume_len,

    // DHT table read interface (from jpeg_marker_parser)
    output wire [1:0]         dht_rd_tbl,
    output wire [3:0]         dht_rd_len_idx,
    output wire [7:0]         dht_rd_val_idx,
    input  wire signed [16:0] dht_mincode,
    input  wire signed [16:0] dht_maxcode,
    input  wire [7:0]         dht_valptr,
    input  wire [7:0]         dht_huffval,

    output reg                done,
    output reg  [7:0]         out_symbol,
    output reg  signed [11:0] out_coeff
);

    localparam [1:0]
        S_IDLE      = 2'd0,
        S_HUFF_STEP = 2'd1,
        S_FETCH_SYM = 2'd2,
        S_READ_VLI  = 2'd3;

    reg [1:0]  state;
    reg [1:0]  active_tbl;
    reg [3:0]  len_idx;
    reg [15:0] code_acc;
    reg [7:0]  sym_val_idx;
    reg [3:0]  need_bits;

    assign dht_rd_tbl     = active_tbl;
    assign dht_rd_len_idx = len_idx;
    assign dht_rd_val_idx = sym_val_idx;

    wire [15:0] next_code    = {code_acc[14:0], peek_16[15]};
    wire signed [16:0] s_next_code = {1'b0, next_code};
    wire huff_hit            = (s_next_code <= dht_maxcode);
    wire signed [16:0] val_offset_s = $signed({9'd0, dht_valptr}) + (s_next_code - dht_mincode);

    wire [4:0]  vli_shift = 5'd16 - {1'b0, need_bits};
    wire [11:0] raw_vli   = peek_16 >> vli_shift;
    wire [11:0] vt        = (need_bits > 4'd0) ? (12'd1 << (need_bits - 4'd1)) : 12'd0;
    wire signed [12:0] ext_neg = $signed({1'b0, raw_vli}) - $signed((13'd1 << need_bits) - 13'd1);
    wire signed [12:0] ext_val = (raw_vli < vt) ? ext_neg : $signed({1'b0, raw_vli});

    always @(*) begin
        consume_en  = 1'b0;
        consume_len = 5'd0;
        if (state == S_HUFF_STEP && (avail_bits >= 6'd1 || eoi_seen)) begin
            consume_en  = 1'b1;
            consume_len = 5'd1;
        end else if (state == S_READ_VLI && (avail_bits >= {2'd0, need_bits} || eoi_seen)) begin
            consume_en  = 1'b1;
            consume_len = {1'b0, need_bits};
        end
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state       <= S_IDLE;
            active_tbl  <= 2'd0;
            len_idx     <= 4'd0;
            code_acc    <= 16'd0;
            sym_val_idx <= 8'd0;
            need_bits   <= 4'd0;
            done        <= 1'b0;
            out_symbol  <= 8'd0;
            out_coeff   <= 12'sd0;
        end else begin
            done <= 1'b0;

            case (state)
                S_IDLE: begin
                    if (start) begin
                        active_tbl <= tbl_sel;
                        len_idx    <= 4'd0;
                        code_acc   <= 16'd0;
                        state      <= S_HUFF_STEP;
                    end
                end
                S_HUFF_STEP: begin
                    if (avail_bits >= 6'd1 || eoi_seen) begin
                        if (huff_hit) begin
                            sym_val_idx <= val_offset_s[7:0];
                            state       <= S_FETCH_SYM;
                        end else if (len_idx == 4'd15) begin
                            out_symbol <= 8'h00;
                            out_coeff  <= 12'sd0;
                            done       <= 1'b1;
                            state      <= S_IDLE;
                        end else begin
                            code_acc <= next_code;
                            len_idx  <= len_idx + 4'd1;
                        end
                    end
                end
                S_FETCH_SYM: begin
                    out_symbol <= dht_huffval;
                    if (dht_huffval[3:0] == 4'd0) begin
                        out_coeff <= 12'sd0;
                        done      <= 1'b1;
                        state     <= S_IDLE;
                    end else begin
                        need_bits <= dht_huffval[3:0];
                        state     <= S_READ_VLI;
                    end
                end
                S_READ_VLI: begin
                    if (avail_bits >= {2'd0, need_bits} || eoi_seen) begin
                        out_coeff <= ext_val[11:0];
                        done      <= 1'b1;
                        state     <= S_IDLE;
                    end
                end
                default: state <= S_IDLE;
            endcase
        end
    end

endmodule
