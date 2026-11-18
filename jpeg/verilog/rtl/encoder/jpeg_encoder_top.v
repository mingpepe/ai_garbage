// Top-level 4:4:4 Baseline JPEG Hardware Encoder
// Integrates: jpeg_header_gen, rgb_to_ycbcr, fdct_2d, quantizer, zigzag_scanner,
//             rle_dc_encoder, huffman_encoder, bit_packer_stuffer
module jpeg_encoder_top (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        start,
    input  wire [15:0] img_width,
    input  wire [15:0] img_height,

    // Synchronous 1-cycle-latency pixel frame buffer read port
    output wire        px_rd_en,
    output wire [15:0] px_x,
    output wire [15:0] px_y,
    input  wire [7:0]  px_r,
    input  wire [7:0]  px_g,
    input  wire [7:0]  px_b,

    // Output JPEG bitstream
    output wire        out_valid,
    output wire [7:0]  out_byte,
    input  wire        out_ready,
    output reg         done
);

    localparam [3:0]
        S_IDLE      = 4'd0,
        S_HDR       = 4'd1,
        S_FETCH_MCU = 4'd2,
        S_LOAD_BLK  = 4'd3,
        S_WAIT_FDCT = 4'd4,
        S_RUN_RLE   = 4'd5,
        S_FLUSH     = 4'd6,
        S_EOI       = 4'd7,
        S_DONE      = 4'd8;

    reg [3:0]  state;
    reg [15:0] mcu_cols;
    reg [15:0] mcu_rows;
    reg [15:0] mcu_x;
    reg [15:0] mcu_y;
    reg [1:0]  comp_id;      // 0=Y, 1=Cb, 2=Cr
    reg [6:0]  step;
    reg [5:0]  fetch_idx_d1;
    reg [5:0]  fetch_idx_d2;
    reg        px_rd_d1;
    reg        reset_dc_pulse;

    reg [7:0] mcu_y_buf  [0:63];
    reg [7:0] mcu_cb_buf [0:63];
    reg [7:0] mcu_cr_buf [0:63];

    // Pixel fetch coordinates with edge replication
    wire [15:0] raw_px_x = (mcu_x << 3) + {13'd0, step[2:0]};
    wire [15:0] raw_px_y = (mcu_y << 3) + {13'd0, step[5:3]};
    assign px_rd_en = (state == S_FETCH_MCU) && (step < 7'd64);
    assign px_x     = (raw_px_x >= img_width)  ? (img_width  - 16'd1) : raw_px_x;
    assign px_y     = (raw_px_y >= img_height) ? (img_height - 16'd1) : raw_px_y;

    // 1. Color space conversion
    wire       ycc_valid;
    wire [7:0] ycc_y, ycc_cb, ycc_cr;

    rgb_to_ycbcr u_rgb2ycc (
        .clk       (clk),
        .rst_n     (rst_n),
        .valid_in  (px_rd_d1),
        .r_in      (px_r),
        .g_in      (px_g),
        .b_in      (px_b),
        .valid_out (ycc_valid),
        .y_out     (ycc_y),
        .cb_out    (ycc_cb),
        .cr_out    (ycc_cr)
    );

    // 2. 2D FDCT
    wire               fdct_wr_en   = (state == S_LOAD_BLK) && (step < 7'd64);
    wire [5:0]         fdct_wr_addr = step[5:0];
    wire [7:0]         fdct_wr_pix  = (comp_id == 2'd0) ? mcu_y_buf[step[5:0]] :
                                      (comp_id == 2'd1) ? mcu_cb_buf[step[5:0]] :
                                                          mcu_cr_buf[step[5:0]];
    reg                fdct_start;
    wire               fdct_out_valid;
    wire [5:0]         fdct_out_addr;
    wire signed [11:0] fdct_out_coeff;
    wire               fdct_done;

    fdct_2d u_fdct_2d (
        .clk        (clk),
        .rst_n      (rst_n),
        .in_wr_en   (fdct_wr_en),
        .in_wr_addr (fdct_wr_addr),
        .in_pixel   (fdct_wr_pix),
        .start      (fdct_start),
        .out_valid  (fdct_out_valid),
        .out_addr   (fdct_out_addr),
        .out_coeff  (fdct_out_coeff),
        .done       (fdct_done)
    );

    // 3. Quantizer
    wire               quant_out_valid;
    wire [5:0]         quant_out_addr;
    wire signed [11:0] quant_out_coeff;

    quantizer u_quantizer (
        .clk        (clk),
        .rst_n      (rst_n),
        .is_chroma  (comp_id != 2'd0),
        .in_valid   (fdct_out_valid),
        .in_addr    (fdct_out_addr),
        .in_coeff   (fdct_out_coeff),
        .out_valid  (quant_out_valid),
        .out_addr   (quant_out_addr),
        .out_qcoeff (quant_out_coeff)
    );

    // 4. Zig-Zag Scanner
    wire               zz_block_ready;
    wire [5:0]         rle_zz_addr;
    wire signed [11:0] rle_zz_data;

    zigzag_scanner u_zigzag (
        .clk         (clk),
        .rst_n       (rst_n),
        .in_valid    (quant_out_valid),
        .in_addr     (quant_out_addr),
        .in_qcoeff   (quant_out_coeff),
        .in_done     (fdct_done),
        .block_ready (zz_block_ready),
        .rd_addr     (rle_zz_addr),
        .rd_data     (rle_zz_data)
    );

    // 5. DC DPCM + AC RLE + VLI
    reg         rle_start;
    wire        rle_out_valid;
    wire        rle_out_is_dc;
    wire        rle_out_is_chroma;
    wire [7:0]  rle_out_symbol;
    wire [10:0] rle_out_vli_bits;
    wire [3:0]  rle_out_vli_len;
    wire        rle_out_ready;
    wire        rle_done;

    rle_dc_encoder u_rle_dc (
        .clk           (clk),
        .rst_n         (rst_n),
        .reset_dc      (reset_dc_pulse),
        .start         (rle_start),
        .comp_id       (comp_id),
        .zz_rd_addr    (rle_zz_addr),
        .zz_rd_data    (rle_zz_data),
        .out_ready     (rle_out_ready),
        .out_valid     (rle_out_valid),
        .out_is_dc     (rle_out_is_dc),
        .out_is_chroma (rle_out_is_chroma),
        .out_symbol    (rle_out_symbol),
        .out_vli_bits  (rle_out_vli_bits),
        .out_vli_len   (rle_out_vli_len),
        .done          (rle_done)
    );

    // 6. Huffman Encoder
    wire        huff_out_valid;
    wire [26:0] huff_out_bits;
    wire [4:0]  huff_out_len;
    wire        huff_out_ready;

    huffman_encoder u_huff_enc (
        .in_valid     (rle_out_valid),
        .in_is_dc     (rle_out_is_dc),
        .in_is_chroma (rle_out_is_chroma),
        .in_symbol    (rle_out_symbol),
        .in_vli_bits  (rle_out_vli_bits),
        .in_vli_len   (rle_out_vli_len),
        .in_ready     (rle_out_ready),
        .out_valid    (huff_out_valid),
        .out_bits     (huff_out_bits),
        .out_len      (huff_out_len),
        .out_ready    (huff_out_ready)
    );

    // 7. Bit Packer & Byte Stuffer
    reg        packer_flush;
    wire       packer_out_valid;
    wire [7:0] packer_out_byte;
    wire       packer_flush_done;

    bit_packer_stuffer u_bit_packer (
        .clk        (clk),
        .rst_n      (rst_n),
        .in_valid   (huff_out_valid),
        .in_bits    (huff_out_bits),
        .in_len     (huff_out_len),
        .in_ready   (huff_out_ready),
        .flush      (packer_flush),
        .out_valid  (packer_out_valid),
        .out_byte   (packer_out_byte),
        .out_ready  (out_ready),
        .flush_done (packer_flush_done)
    );

    // 8. JFIF Header & EOI Generator
    reg        hdr_start;
    reg        eoi_start;
    wire       hdr_out_valid;
    wire [7:0] hdr_out_byte;
    wire       hdr_done;
    wire       eoi_done;

    jpeg_header_gen u_hdr_gen (
        .clk          (clk),
        .rst_n        (rst_n),
        .start_header (hdr_start),
        .start_eoi    (eoi_start),
        .img_width    (img_width),
        .img_height   (img_height),
        .out_ready    (out_ready),
        .out_valid    (hdr_out_valid),
        .out_byte     (hdr_out_byte),
        .header_done  (hdr_done),
        .eoi_done     (eoi_done)
    );

    wire hdr_active = (state == S_HDR) || (state == S_EOI);
    assign out_valid = hdr_active ? hdr_out_valid : packer_out_valid;
    assign out_byte  = hdr_active ? hdr_out_byte  : packer_out_byte;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state          <= S_IDLE;
            mcu_cols       <= 16'd0;
            mcu_rows       <= 16'd0;
            mcu_x          <= 16'd0;
            mcu_y          <= 16'd0;
            comp_id        <= 2'd0;
            step           <= 7'd0;
            fetch_idx_d1   <= 6'd0;
            fetch_idx_d2   <= 6'd0;
            px_rd_d1       <= 1'b0;
            reset_dc_pulse <= 1'b0;
            fdct_start     <= 1'b0;
            rle_start      <= 1'b0;
            packer_flush   <= 1'b0;
            hdr_start      <= 1'b0;
            eoi_start      <= 1'b0;
            done           <= 1'b0;
        end else begin
            px_rd_d1       <= px_rd_en;
            fetch_idx_d1   <= step[5:0];
            fetch_idx_d2   <= fetch_idx_d1;
            reset_dc_pulse <= 1'b0;
            fdct_start     <= 1'b0;
            rle_start      <= 1'b0;
            packer_flush   <= 1'b0;
            hdr_start      <= 1'b0;
            eoi_start      <= 1'b0;
            done           <= 1'b0;

            if (ycc_valid) begin
                mcu_y_buf[fetch_idx_d2]  <= ycc_y;
                mcu_cb_buf[fetch_idx_d2] <= ycc_cb;
                mcu_cr_buf[fetch_idx_d2] <= ycc_cr;
            end

            case (state)
                S_IDLE: begin
                    if (start) begin
                        mcu_cols       <= (img_width  + 16'd7) >> 3;
                        mcu_rows       <= (img_height + 16'd7) >> 3;
                        mcu_x          <= 16'd0;
                        mcu_y          <= 16'd0;
                        comp_id        <= 2'd0;
                        reset_dc_pulse <= 1'b1;
                        hdr_start      <= 1'b1;
                        state          <= S_HDR;
                    end
                end
                S_HDR: begin
                    if (hdr_done) begin
                        step  <= 7'd0;
                        state <= S_FETCH_MCU;
                    end
                end
                S_FETCH_MCU: begin
                    if (step < 7'd66) begin
                        step <= step + 7'd1;
                    end else begin
                        step    <= 7'd0;
                        comp_id <= 2'd0;
                        state   <= S_LOAD_BLK;
                    end
                end
                S_LOAD_BLK: begin
                    if (step < 7'd63) begin
                        step <= step + 7'd1;
                    end else begin
                        step       <= 7'd0;
                        fdct_start <= 1'b1;
                        state      <= S_WAIT_FDCT;
                    end
                end
                S_WAIT_FDCT: begin
                    if (zz_block_ready) begin
                        rle_start <= 1'b1;
                        state     <= S_RUN_RLE;
                    end
                end
                S_RUN_RLE: begin
                    if (rle_done) begin
                        if (comp_id < 2'd2) begin
                            comp_id <= comp_id + 2'd1;
                            step    <= 7'd0;
                            state   <= S_LOAD_BLK;
                        end else if (mcu_x + 16'd1 < mcu_cols) begin
                            mcu_x <= mcu_x + 16'd1;
                            step  <= 7'd0;
                            state <= S_FETCH_MCU;
                        end else if (mcu_y + 16'd1 < mcu_rows) begin
                            mcu_x <= 16'd0;
                            mcu_y <= mcu_y + 16'd1;
                            step  <= 7'd0;
                            state <= S_FETCH_MCU;
                        end else begin
                            packer_flush <= 1'b1;
                            state        <= S_FLUSH;
                        end
                    end
                end
                S_FLUSH: begin
                    if (packer_flush_done) begin
                        eoi_start <= 1'b1;
                        state     <= S_EOI;
                    end
                end
                S_EOI: begin
                    if (eoi_done)
                        state <= S_DONE;
                end
                S_DONE: begin
                    done  <= 1'b1;
                    state <= S_IDLE;
                end
                default: state <= S_IDLE;
            endcase
        end
    end

endmodule
