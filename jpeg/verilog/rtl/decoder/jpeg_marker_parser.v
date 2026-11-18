// JPEG Baseline Marker Parser (SOI, APPn/COM, DQT, SOF0, DHT, DRI, SOS)
// Stores parsed Quantization tables (raster order) and Canonical Huffman decoder tables
module jpeg_marker_parser (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        in_valid,
    input  wire [7:0]  in_byte,
    output wire        in_ready,

    output reg         scan_active,
    output reg         parse_error,
    output wire        scan_byte_valid,
    output wire [7:0]  scan_byte,
    input  wire        scan_byte_ready,

    // Frame & scan parameters
    output reg  [15:0] img_width,
    output reg  [15:0] img_height,
    output reg  [1:0]  num_comps,      // 1 or 3
    output reg  [1:0]  comp_h0, comp_v0, comp_q0, comp_dc0, comp_ac0,
    output reg  [1:0]  comp_h1, comp_v1, comp_q1, comp_dc1, comp_ac1,
    output reg  [1:0]  comp_h2, comp_v2, comp_q2, comp_dc2, comp_ac2,
    output reg  [15:0] restart_interval,

    // DQT read port (raster index 0..63)
    input  wire        dqt_rd_sel,
    input  wire [5:0]  dqt_rd_idx,
    output wire [7:0]  dqt_rd_val,

    // DHT read port (tbl_sel = {class(0=DC,1=AC), id(0 or 1)}, len_idx = 0..15 for lengths 1..16)
    input  wire [1:0]  dht_rd_tbl,
    input  wire [3:0]  dht_rd_len_idx,
    input  wire [7:0]  dht_rd_val_idx,
    output wire signed [16:0] dht_mincode,
    output wire signed [16:0] dht_maxcode,
    output wire [7:0]  dht_valptr,
    output wire [7:0]  dht_huffval
);

    localparam [4:0]
        ST_SOI_FF      = 5'd0,
        ST_SOI_D8      = 5'd1,
        ST_FIND_FF     = 5'd2,
        ST_MARKER      = 5'd3,
        ST_LEN_HI      = 5'd4,
        ST_LEN_LO      = 5'd5,
        ST_SKIP        = 5'd6,
        ST_DQT_INFO    = 5'd7,
        ST_DQT_DATA    = 5'd8,
        ST_SOF_PREC    = 5'd9,
        ST_SOF_H_HI    = 5'd10,
        ST_SOF_H_LO    = 5'd11,
        ST_SOF_W_HI    = 5'd12,
        ST_SOF_W_LO    = 5'd13,
        ST_SOF_NF      = 5'd14,
        ST_SOF_COMP    = 5'd15,
        ST_DHT_INFO    = 5'd16,
        ST_DHT_BITS    = 5'd17,
        ST_DHT_VALS    = 5'd18,
        ST_SOS_NS      = 5'd19,
        ST_SOS_COMP    = 5'd20,
        ST_SOS_TAIL    = 5'd21,
        ST_DRI_HI      = 5'd22,
        ST_DRI_LO      = 5'd23,
        ST_SCAN        = 5'd24;

    reg [4:0]  state;
    reg [7:0]  cur_marker;
    reg [15:0] seg_rem;
    reg [5:0]  cnt;
    reg [2:0]  sub_step;
    reg [7:0]  comp_ids [0:2];

    // DQT storage: 2 tables * 64 entries (stored in raster order)
    reg [7:0]  dqt_mem [0:127];
    reg        dqt_cur_id;
    wire [5:0] zz_to_raster;
    wire [5:0] raster_to_zz_unused;

    zigzag_lut u_parser_zz (
        .idx_in       (cnt),
        .zz_to_raster (zz_to_raster),
        .raster_to_zz (raster_to_zz_unused)
    );

    assign dqt_rd_val = dqt_mem[{dqt_rd_sel, dqt_rd_idx}];

    // DHT storage: 4 tables (0=DC0, 1=DC1, 2=AC0, 3=AC1)
    reg signed [16:0] mincode_mem [0:63];
    reg signed [16:0] maxcode_mem [0:63];
    reg [7:0]         valptr_mem  [0:63];
    reg [7:0]         huffval_mem [0:1023];

    assign dht_mincode = mincode_mem[{dht_rd_tbl, dht_rd_len_idx}];
    assign dht_maxcode = maxcode_mem[{dht_rd_tbl, dht_rd_len_idx}];
    assign dht_valptr  = valptr_mem[{dht_rd_tbl, dht_rd_len_idx}];
    assign dht_huffval = huffval_mem[{dht_rd_tbl, dht_rd_val_idx}];

    reg [1:0]  dht_cur_tbl;
    reg [16:0] dht_code;
    reg [8:0]  dht_val_total;
    reg [8:0]  dht_val_idx;
    reg [1:0]  sos_target_comp;

    assign in_ready        = (state == ST_SCAN) ? scan_byte_ready : 1'b1;
    assign scan_byte_valid = (state == ST_SCAN) && in_valid;
    assign scan_byte       = in_byte;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state            <= ST_SOI_FF;
            scan_active      <= 1'b0;
            parse_error      <= 1'b0;
            cur_marker       <= 8'd0;
            seg_rem          <= 16'd0;
            cnt              <= 6'd0;
            sub_step         <= 3'd0;
            img_width        <= 16'd0;
            img_height       <= 16'd0;
            num_comps        <= 2'd0;
            restart_interval <= 16'd0;
            dqt_cur_id       <= 1'b0;
            dht_cur_tbl      <= 2'd0;
            dht_code         <= 17'd0;
            dht_val_total    <= 9'd0;
            dht_val_idx      <= 9'd0;
            comp_h0 <= 2'd1; comp_v0 <= 2'd1; comp_q0 <= 2'd0; comp_dc0 <= 2'd0; comp_ac0 <= 2'd0;
            comp_h1 <= 2'd1; comp_v1 <= 2'd1; comp_q1 <= 2'd1; comp_dc1 <= 2'd1; comp_ac1 <= 2'd1;
            comp_h2 <= 2'd1; comp_v2 <= 2'd1; comp_q2 <= 2'd1; comp_dc2 <= 2'd1; comp_ac2 <= 2'd1;
            comp_ids[0] <= 8'd1; comp_ids[1] <= 8'd2; comp_ids[2] <= 8'd3;
        end else if (in_valid && in_ready && (state != ST_SCAN)) begin
            case (state)
                ST_SOI_FF: begin
                    if (in_byte == 8'hFF) state <= ST_SOI_D8;
                    else parse_error <= 1'b1;
                end
                ST_SOI_D8: begin
                    if (in_byte == 8'hD8) state <= ST_FIND_FF;
                    else parse_error <= 1'b1;
                end
                ST_FIND_FF: begin
                    if (in_byte == 8'hFF) state <= ST_MARKER;
                end
                ST_MARKER: begin
                    if (in_byte == 8'hFF) begin
                        state <= ST_MARKER; // skip fill 0xFF
                    end else if (in_byte == 8'h00) begin
                        state <= ST_FIND_FF;
                    end else if (in_byte == 8'hD9) begin
                        state <= ST_FIND_FF;
                    end else begin
                        cur_marker <= in_byte;
                        state      <= ST_LEN_HI;
                    end
                end
                ST_LEN_HI: begin
                    seg_rem[15:8] <= in_byte;
                    state         <= ST_LEN_LO;
                end
                ST_LEN_LO: begin
                    seg_rem <= {seg_rem[15:8], in_byte} - 16'd2;
                    case (cur_marker)
                        8'hDB: state <= ST_DQT_INFO;
                        8'hC0: state <= ST_SOF_PREC;
                        8'hC4: state <= ST_DHT_INFO;
                        8'hDA: state <= ST_SOS_NS;
                        8'hDD: state <= ST_DRI_HI;
                        default: begin
                            if ({seg_rem[15:8], in_byte} <= 16'd2)
                                state <= ST_FIND_FF;
                            else
                                state <= ST_SKIP;
                        end
                    endcase
                end
                ST_SKIP: begin
                    if (seg_rem <= 16'd1)
                        state <= ST_FIND_FF;
                    else
                        seg_rem <= seg_rem - 16'd1;
                end
                ST_DRI_HI: begin
                    restart_interval[15:8] <= in_byte;
                    seg_rem                <= seg_rem - 16'd1;
                    state                  <= ST_DRI_LO;
                end
                ST_DRI_LO: begin
                    restart_interval[7:0] <= in_byte;
                    state                 <= ST_FIND_FF;
                end
                // DQT (supports multiple tables per segment, 8-bit Pq=0)
                ST_DQT_INFO: begin
                    dqt_cur_id <= in_byte[0];
                    cnt        <= 6'd0;
                    seg_rem    <= seg_rem - 16'd1;
                    state      <= ST_DQT_DATA;
                end
                ST_DQT_DATA: begin
                    dqt_mem[{dqt_cur_id, zz_to_raster}] <= in_byte;
                    seg_rem <= seg_rem - 16'd1;
                    if (cnt == 6'd63) begin
                        if (seg_rem <= 16'd1)
                            state <= ST_FIND_FF;
                        else
                            state <= ST_DQT_INFO;
                    end else begin
                        cnt <= cnt + 6'd1;
                    end
                end
                // SOF0
                ST_SOF_PREC: begin
                    if (in_byte != 8'd8) parse_error <= 1'b1;
                    state <= ST_SOF_H_HI;
                end
                ST_SOF_H_HI: begin img_height[15:8] <= in_byte; state <= ST_SOF_H_LO; end
                ST_SOF_H_LO: begin img_height[7:0]  <= in_byte; state <= ST_SOF_W_HI; end
                ST_SOF_W_HI: begin img_width[15:8]  <= in_byte; state <= ST_SOF_W_LO; end
                ST_SOF_W_LO: begin img_width[7:0]   <= in_byte; state <= ST_SOF_NF; end
                ST_SOF_NF: begin
                    num_comps <= in_byte[1:0];
                    cnt       <= 6'd0;
                    sub_step  <= 3'd0;
                    state     <= ST_SOF_COMP;
                end
                ST_SOF_COMP: begin
                    case (sub_step)
                        3'd0: begin
                            comp_ids[cnt[1:0]] <= in_byte;
                            sub_step           <= 3'd1;
                        end
                        3'd1: begin
                            if (cnt == 6'd0)      begin comp_h0 <= in_byte[5:4]; comp_v0 <= in_byte[1:0]; end
                            else if (cnt == 6'd1) begin comp_h1 <= in_byte[5:4]; comp_v1 <= in_byte[1:0]; end
                            else if (cnt == 6'd2) begin comp_h2 <= in_byte[5:4]; comp_v2 <= in_byte[1:0]; end
                            sub_step <= 3'd2;
                        end
                        default: begin
                            if (cnt == 6'd0)      comp_q0 <= in_byte[1:0];
                            else if (cnt == 6'd1) comp_q1 <= in_byte[1:0];
                            else if (cnt == 6'd2) comp_q2 <= in_byte[1:0];
                            sub_step <= 3'd0;
                            if (cnt[1:0] + 2'd1 >= num_comps)
                                state <= ST_FIND_FF;
                            else
                                cnt <= cnt + 6'd1;
                        end
                    endcase
                end
                // DHT (supports multiple tables per segment)
                ST_DHT_INFO: begin
                    dht_cur_tbl   <= {in_byte[4], in_byte[0]};
                    cnt           <= 6'd0;
                    dht_code      <= 17'd0;
                    dht_val_total <= 9'd0;
                    dht_val_idx   <= 9'd0;
                    seg_rem       <= seg_rem - 16'd1;
                    state         <= ST_DHT_BITS;
                end
                ST_DHT_BITS: begin
                    seg_rem <= seg_rem - 16'd1;
                    if (in_byte == 8'd0) begin
                        mincode_mem[{dht_cur_tbl, cnt[3:0]}] <= 17'sd0;
                        maxcode_mem[{dht_cur_tbl, cnt[3:0]}] <= -17'sd1;
                        valptr_mem[{dht_cur_tbl, cnt[3:0]}]  <= 8'd0;
                        dht_code <= dht_code << 1;
                    end else begin
                        mincode_mem[{dht_cur_tbl, cnt[3:0]}] <= $signed(dht_code);
                        maxcode_mem[{dht_cur_tbl, cnt[3:0]}] <= $signed(dht_code + {9'd0, in_byte} - 17'd1);
                        valptr_mem[{dht_cur_tbl, cnt[3:0]}]  <= dht_val_total[7:0];
                        dht_code      <= (dht_code + {9'd0, in_byte}) << 1;
                        dht_val_total <= dht_val_total + {1'b0, in_byte};
                    end
                    if (cnt == 6'd15) begin
                        if ((dht_val_total + {1'b0, in_byte}) == 9'd0) begin
                            if (seg_rem <= 16'd1) state <= ST_FIND_FF;
                            else state <= ST_DHT_INFO;
                        end else begin
                            dht_val_idx <= 9'd0;
                            state       <= ST_DHT_VALS;
                        end
                    end else begin
                        cnt <= cnt + 6'd1;
                    end
                end
                ST_DHT_VALS: begin
                    huffval_mem[{dht_cur_tbl, dht_val_idx[7:0]}] <= in_byte;
                    seg_rem <= seg_rem - 16'd1;
                    if (dht_val_idx + 9'd1 >= dht_val_total) begin
                        if (seg_rem <= 16'd1) state <= ST_FIND_FF;
                        else state <= ST_DHT_INFO;
                    end else begin
                        dht_val_idx <= dht_val_idx + 9'd1;
                    end
                end
                // SOS
                ST_SOS_NS: begin
                    cnt      <= 6'd0;
                    sub_step <= 3'd0;
                    state    <= ST_SOS_COMP;
                end
                ST_SOS_COMP: begin
                    if (sub_step == 3'd0) begin
                        if (in_byte == comp_ids[0])      sos_target_comp <= 2'd0;
                        else if (in_byte == comp_ids[1]) sos_target_comp <= 2'd1;
                        else                             sos_target_comp <= 2'd2;
                        sub_step <= 3'd1;
                    end else begin
                        if (sos_target_comp == 2'd0)      begin comp_dc0 <= in_byte[5:4]; comp_ac0 <= in_byte[1:0]; end
                        else if (sos_target_comp == 2'd1) begin comp_dc1 <= in_byte[5:4]; comp_ac1 <= in_byte[1:0]; end
                        else                              begin comp_dc2 <= in_byte[5:4]; comp_ac2 <= in_byte[1:0]; end
                        sub_step <= 3'd0;
                        if (cnt[1:0] + 2'd1 >= num_comps) begin
                            cnt   <= 6'd0;
                            state <= ST_SOS_TAIL;
                        end else begin
                            cnt <= cnt + 6'd1;
                        end
                    end
                end
                ST_SOS_TAIL: begin
                    if (cnt == 6'd2) begin
                        scan_active <= 1'b1;
                        state       <= ST_SCAN;
                    end else begin
                        cnt <= cnt + 6'd1;
                    end
                end
                default: state <= ST_FIND_FF;
            endcase
        end
    end

endmodule
