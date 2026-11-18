// Top-level Baseline JPEG Hardware Decoder (supports Grayscale, 4:4:4, and 4:2:0)
// Integrates: jpeg_marker_parser, byte_destuffer, bit_reader, huffman_decoder,
//             rle_dc_decoder, zigzag_unscanner, dequantizer, idct_2d, ycbcr_to_rgb
module jpeg_decoder_top (
    input  wire        clk,
    input  wire        rst_n,

    // Input JPEG byte stream
    input  wire        in_valid,
    input  wire [7:0]  in_byte,
    output wire        in_ready,

    // Decoded image metadata (valid once scan_active goes high)
    output wire        scan_active,
    output wire [15:0] img_width,
    output wire [15:0] img_height,
    output wire        parse_error,

    // Output decoded RGB888 pixel stream
    output wire        out_px_valid,
    output reg  [15:0] out_px_x,
    output reg  [15:0] out_px_y,
    output wire [7:0]  out_r,
    output wire [7:0]  out_g,
    output wire [7:0]  out_b,
    output reg         done
);

    localparam [2:0]
        S_WAIT_SCAN = 3'd0,
        S_RUN_RLE   = 3'd1,
        S_WAIT_RLE  = 3'd2,
        S_WAIT_IDCT = 3'd3,
        S_EMIT_MCU  = 3'd4,
        S_DONE      = 3'd5;

    reg [2:0]  state;
    reg [15:0] mcu_x;
    reg [15:0] mcu_y;
    reg [2:0]  blk_in_mcu;
    reg [8:0]  emit_step;
    reg        emit_in_bounds_d1;
    reg        reset_dc_pulse;

    // 1. Marker Parser
    wire        parser_scan_valid;
    wire [7:0]  parser_scan_byte;
    wire        parser_scan_ready;
    wire [1:0]  num_comps;
    wire [1:0]  comp_h0, comp_v0, comp_q0, comp_dc0, comp_ac0;
    wire [1:0]  comp_h1, comp_v1, comp_q1, comp_dc1, comp_ac1;
    wire [1:0]  comp_h2, comp_v2, comp_q2, comp_dc2, comp_ac2;
    wire [15:0] restart_interval_unused;

    wire        dqt_rd_sel;
    wire [5:0]  dqt_rd_idx;
    wire [7:0]  dqt_rd_val;
    wire [1:0]  dht_rd_tbl;
    wire [3:0]  dht_rd_len_idx;
    wire [7:0]  dht_rd_val_idx;
    wire signed [16:0] dht_mincode;
    wire signed [16:0] dht_maxcode;
    wire [7:0]  dht_valptr;
    wire [7:0]  dht_huffval;

    jpeg_marker_parser u_parser (
        .clk              (clk),
        .rst_n            (rst_n),
        .in_valid         (in_valid),
        .in_byte          (in_byte),
        .in_ready         (in_ready),
        .scan_active      (scan_active),
        .parse_error      (parse_error),
        .scan_byte_valid  (parser_scan_valid),
        .scan_byte        (parser_scan_byte),
        .scan_byte_ready  (parser_scan_ready),
        .img_width        (img_width),
        .img_height       (img_height),
        .num_comps        (num_comps),
        .comp_h0(comp_h0), .comp_v0(comp_v0), .comp_q0(comp_q0), .comp_dc0(comp_dc0), .comp_ac0(comp_ac0),
        .comp_h1(comp_h1), .comp_v1(comp_v1), .comp_q1(comp_q1), .comp_dc1(comp_dc1), .comp_ac1(comp_ac1),
        .comp_h2(comp_h2), .comp_v2(comp_v2), .comp_q2(comp_q2), .comp_dc2(comp_dc2), .comp_ac2(comp_ac2),
        .restart_interval (restart_interval_unused),
        .dqt_rd_sel       (dqt_rd_sel),
        .dqt_rd_idx       (dqt_rd_idx),
        .dqt_rd_val       (dqt_rd_val),
        .dht_rd_tbl       (dht_rd_tbl),
        .dht_rd_len_idx   (dht_rd_len_idx),
        .dht_rd_val_idx   (dht_rd_val_idx),
        .dht_mincode      (dht_mincode),
        .dht_maxcode      (dht_maxcode),
        .dht_valptr       (dht_valptr),
        .dht_huffval      (dht_huffval)
    );

    // 2. Byte Destuffer
    wire       destuff_valid;
    wire [7:0] destuff_byte;
    wire       destuff_ready;
    wire       eoi_seen;

    byte_destuffer u_destuffer (
        .clk       (clk),
        .rst_n     (rst_n),
        .enable    (scan_active),
        .in_valid  (parser_scan_valid),
        .in_byte   (parser_scan_byte),
        .in_ready  (parser_scan_ready),
        .out_valid (destuff_valid),
        .out_byte  (destuff_byte),
        .out_ready (destuff_ready),
        .eoi_seen  (eoi_seen)
    );

    // 3. Bit Reader
    wire        br_consume_en;
    wire [4:0]  br_consume_len;
    wire [15:0] br_peek_16;
    wire [5:0]  br_avail_bits;

    bit_reader u_bit_reader (
        .clk         (clk),
        .rst_n       (rst_n),
        .in_valid    (destuff_valid),
        .in_byte     (destuff_byte),
        .in_ready    (destuff_ready),
        .consume_en  (br_consume_en),
        .consume_len (br_consume_len),
        .peek_16     (br_peek_16),
        .avail_bits  (br_avail_bits)
    );

    // 4. Huffman Decoder
    wire        huff_start;
    wire [1:0]  huff_tbl_sel;
    wire        huff_done;
    wire [7:0]  huff_symbol;
    wire signed [11:0] huff_coeff;

    huffman_decoder u_huff_dec (
        .clk            (clk),
        .rst_n          (rst_n),
        .start          (huff_start),
        .tbl_sel        (huff_tbl_sel),
        .peek_16        (br_peek_16),
        .avail_bits     (br_avail_bits),
        .eoi_seen       (eoi_seen),
        .consume_en     (br_consume_en),
        .consume_len    (br_consume_len),
        .dht_rd_tbl     (dht_rd_tbl),
        .dht_rd_len_idx (dht_rd_len_idx),
        .dht_rd_val_idx (dht_rd_val_idx),
        .dht_mincode    (dht_mincode),
        .dht_maxcode    (dht_maxcode),
        .dht_valptr     (dht_valptr),
        .dht_huffval    (dht_huffval),
        .done           (huff_done),
        .out_symbol     (huff_symbol),
        .out_coeff      (huff_coeff)
    );

    // Determine MCU geometry & current block mapping
    wire is_420      = (num_comps == 2'd3) && (comp_h0 == 2'd2) && (comp_v0 == 2'd2);
    wire [15:0] mcu_w = is_420 ? 16'd16 : 16'd8;
    wire [15:0] mcu_h = is_420 ? 16'd16 : 16'd8;
    wire [15:0] mcu_cols = (img_width  + mcu_w - 16'd1) >> (is_420 ? 4 : 3);
    wire [15:0] mcu_rows = (img_height + mcu_h - 16'd1) >> (is_420 ? 4 : 3);
    wire [2:0]  total_blks_in_mcu = (num_comps == 2'd1) ? 3'd1 : (is_420 ? 3'd6 : 3'd3);

    wire [1:0] cur_comp = is_420
        ? ((blk_in_mcu < 3'd4) ? 2'd0 : (blk_in_mcu == 3'd4 ? 2'd1 : 2'd2))
        : blk_in_mcu[1:0];

    wire cur_dc_tbl = (cur_comp == 2'd0) ? comp_dc0[0] : (cur_comp == 2'd1 ? comp_dc1[0] : comp_dc2[0]);
    wire cur_ac_tbl = (cur_comp == 2'd0) ? comp_ac0[0] : (cur_comp == 2'd1 ? comp_ac1[0] : comp_ac2[0]);
    wire cur_q_tbl  = (cur_comp == 2'd0) ? comp_q0[0]  : (cur_comp == 2'd1 ? comp_q1[0]  : comp_q2[0]);

    // 5. RLE + DC Decoder
    reg                rle_start;
    wire [5:0]         zz_rd_addr;
    wire signed [11:0] zz_rd_data;
    wire               rle_done;

    rle_dc_decoder u_rle_dec (
        .clk         (clk),
        .rst_n       (rst_n),
        .reset_dc    (reset_dc_pulse),
        .start       (rle_start),
        .comp_id     (cur_comp),
        .dc_tbl_id   (cur_dc_tbl),
        .ac_tbl_id   (cur_ac_tbl),
        .huff_start  (huff_start),
        .huff_tbl_sel(huff_tbl_sel),
        .huff_done   (huff_done),
        .huff_symbol (huff_symbol),
        .huff_coeff  (huff_coeff),
        .zz_rd_addr  (zz_rd_addr),
        .zz_rd_data  (zz_rd_data),
        .done        (rle_done)
    );

    // 6. Zig-Zag Unscanner
    wire               unzz_valid;
    wire [5:0]         unzz_addr;
    wire signed [11:0] unzz_qcoeff;
    wire               unzz_done;

    zigzag_unscanner u_zigzag_unscan (
        .clk             (clk),
        .rst_n           (rst_n),
        .start           (rle_done),
        .zz_rd_addr      (zz_rd_addr),
        .zz_rd_data      (zz_rd_data),
        .out_valid       (unzz_valid),
        .out_raster_addr (unzz_addr),
        .out_qcoeff      (unzz_qcoeff),
        .done            (unzz_done)
    );

    // 7. Dequantizer
    wire               deq_valid;
    wire [5:0]         deq_addr;
    wire signed [15:0] deq_coeff;
    wire               deq_done;

    dequantizer u_dequant (
        .clk             (clk),
        .rst_n           (rst_n),
        .quant_tbl_sel   (cur_q_tbl),
        .in_valid        (unzz_valid),
        .in_raster_addr  (unzz_addr),
        .in_qcoeff       (unzz_qcoeff),
        .in_done         (unzz_done),
        .dqt_rd_sel      (dqt_rd_sel),
        .dqt_rd_idx      (dqt_rd_idx),
        .dqt_rd_val      (dqt_rd_val),
        .out_valid       (deq_valid),
        .out_raster_addr (deq_addr),
        .out_coeff       (deq_coeff),
        .out_done        (deq_done)
    );

    // 8. 2D IDCT
    wire       idct_out_valid;
    wire [5:0] idct_out_addr;
    wire [7:0] idct_out_pixel;
    wire       idct_done;

    idct_2d u_idct_2d (
        .clk        (clk),
        .rst_n      (rst_n),
        .in_wr_en   (deq_valid),
        .in_wr_addr (deq_addr),
        .in_coeff   (deq_coeff),
        .start      (deq_done),
        .out_valid  (idct_out_valid),
        .out_addr   (idct_out_addr),
        .out_pixel  (idct_out_pixel),
        .done       (idct_done)
    );

    // MCU Plane Buffers
    reg [7:0] mcu_y_buf  [0:255];
    reg [7:0] mcu_cb_buf [0:63];
    reg [7:0] mcu_cr_buf [0:63];

    wire [7:0] y_wr_idx_420 = {blk_in_mcu[1], idct_out_addr[5:3], blk_in_mcu[0], idct_out_addr[2:0]};
    wire [7:0] y_wr_idx     = is_420 ? y_wr_idx_420 : {2'd0, idct_out_addr};

    // 9. YCbCr -> RGB Output Converter
    wire [3:0] emit_px = is_420 ? emit_step[3:0] : {1'b0, emit_step[2:0]};
    wire [3:0] emit_py = is_420 ? emit_step[7:4] : {1'b0, emit_step[5:3]};
    wire [15:0] abs_px = (mcu_x << (is_420 ? 4 : 3)) + {12'd0, emit_px};
    wire [15:0] abs_py = (mcu_y << (is_420 ? 4 : 3)) + {12'd0, emit_py};
    wire [8:0]  emit_total = is_420 ? 9'd256 : 9'd64;
    wire        emit_active = (state == S_EMIT_MCU) && (emit_step < emit_total);
    wire        emit_in_bounds = (abs_px < img_width) && (abs_py < img_height);

    wire [7:0] y_rd_val  = mcu_y_buf[is_420 ? {emit_py, emit_px} : {2'd0, emit_py[2:0], emit_px[2:0]}];
    wire [7:0] cb_rd_val = (num_comps == 2'd1) ? 8'd128 :
                           is_420 ? mcu_cb_buf[{emit_py[3:1], emit_px[3:1]}] : mcu_cb_buf[{emit_py[2:0], emit_px[2:0]}];
    wire [7:0] cr_rd_val = (num_comps == 2'd1) ? 8'd128 :
                           is_420 ? mcu_cr_buf[{emit_py[3:1], emit_px[3:1]}] : mcu_cr_buf[{emit_py[2:0], emit_px[2:0]}];

    wire ycc2rgb_valid_out;

    ycbcr_to_rgb u_ycc2rgb (
        .clk       (clk),
        .rst_n     (rst_n),
        .valid_in  (emit_active && emit_in_bounds),
        .y_in      (y_rd_val),
        .cb_in     (cb_rd_val),
        .cr_in     (cr_rd_val),
        .valid_out (ycc2rgb_valid_out),
        .r_out     (out_r),
        .g_out     (out_g),
        .b_out     (out_b)
    );

    assign out_px_valid = ycc2rgb_valid_out && emit_in_bounds_d1;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state             <= S_WAIT_SCAN;
            mcu_x             <= 16'd0;
            mcu_y             <= 16'd0;
            blk_in_mcu        <= 3'd0;
            emit_step         <= 9'd0;
            emit_in_bounds_d1 <= 1'b0;
            out_px_x          <= 16'd0;
            out_px_y          <= 16'd0;
            rle_start         <= 1'b0;
            reset_dc_pulse    <= 1'b0;
            done              <= 1'b0;
        end else begin
            rle_start         <= 1'b0;
            reset_dc_pulse    <= 1'b0;
            done              <= 1'b0;
            emit_in_bounds_d1 <= emit_active && emit_in_bounds;
            out_px_x          <= abs_px;
            out_px_y          <= abs_py;

            if (idct_out_valid) begin
                if (cur_comp == 2'd0)      mcu_y_buf[y_wr_idx]       <= idct_out_pixel;
                else if (cur_comp == 2'd1) mcu_cb_buf[idct_out_addr] <= idct_out_pixel;
                else                       mcu_cr_buf[idct_out_addr] <= idct_out_pixel;
            end

            case (state)
                S_WAIT_SCAN: begin
                    if (scan_active) begin
                        mcu_x          <= 16'd0;
                        mcu_y          <= 16'd0;
                        blk_in_mcu     <= 3'd0;
                        reset_dc_pulse <= 1'b1;
                        state          <= S_RUN_RLE;
                    end
                end
                S_RUN_RLE: begin
                    rle_start <= 1'b1;
                    state     <= S_WAIT_RLE;
                end
                S_WAIT_RLE: begin
                    if (rle_done)
                        state <= S_WAIT_IDCT;
                end
                S_WAIT_IDCT: begin
                    if (idct_done) begin
                        if (blk_in_mcu + 3'd1 < total_blks_in_mcu) begin
                            blk_in_mcu <= blk_in_mcu + 3'd1;
                            state      <= S_RUN_RLE;
                        end else begin
                            emit_step <= 9'd0;
                            state     <= S_EMIT_MCU;
                        end
                    end
                end
                S_EMIT_MCU: begin
                    if (emit_step < emit_total) begin
                        emit_step <= emit_step + 9'd1;
                    end else begin
                        blk_in_mcu <= 3'd0;
                        if (mcu_x + 16'd1 < mcu_cols) begin
                            mcu_x <= mcu_x + 16'd1;
                            state <= S_RUN_RLE;
                        end else if (mcu_y + 16'd1 < mcu_rows) begin
                            mcu_x <= 16'd0;
                            mcu_y <= mcu_y + 16'd1;
                            state <= S_RUN_RLE;
                        end else begin
                            state <= S_DONE;
                        end
                    end
                end
                S_DONE: begin
                    done  <= 1'b1;
                    state <= S_DONE;
                end
                default: state <= S_WAIT_SCAN;
            endcase
        end
    end

endmodule
