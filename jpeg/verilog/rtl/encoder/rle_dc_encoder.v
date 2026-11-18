// DC DPCM + AC Run-Length Encoding + VLI Amplitude Encoder
module rle_dc_encoder (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               reset_dc,
    input  wire               start,
    input  wire [1:0]         comp_id,     // 0=Y, 1=Cb, 2=Cr
    output wire [5:0]         zz_rd_addr,
    input  wire signed [11:0] zz_rd_data,
    input  wire               out_ready,
    output reg                out_valid,
    output reg                out_is_dc,
    output reg                out_is_chroma,
    output reg  [7:0]         out_symbol,
    output reg  [10:0]        out_vli_bits,
    output reg  [3:0]         out_vli_len,
    output reg                done
);

    localparam [2:0] S_IDLE         = 3'd0;
    localparam [2:0] S_FIND_LAST_NZ = 3'd1;
    localparam [2:0] S_EMIT_DC      = 3'd2;
    localparam [2:0] S_SCAN_AC      = 3'd3;
    localparam [2:0] S_EMIT_EOB     = 3'd4;
    localparam [2:0] S_DONE         = 3'd5;

    reg [2:0] state;
    reg [5:0] idx;
    reg [5:0] last_nz;
    reg [3:0] zero_run;
    reg [1:0] active_comp;
    reg signed [11:0] prev_dc [0:2];

    assign zz_rd_addr = idx;

    // Combinational VLI encoder for signed 13-bit values [-2047..2047]
    function [3:0] calc_vli_size;
        input signed [12:0] val;
        reg [12:0] mag;
        begin
            mag = val[12] ? (~val + 13'd1) : val;
            if      (mag[11]) calc_vli_size = 4'd12;
            else if (mag[10]) calc_vli_size = 4'd11;
            else if (mag[9])  calc_vli_size = 4'd10;
            else if (mag[8])  calc_vli_size = 4'd9;
            else if (mag[7])  calc_vli_size = 4'd8;
            else if (mag[6])  calc_vli_size = 4'd7;
            else if (mag[5])  calc_vli_size = 4'd6;
            else if (mag[4])  calc_vli_size = 4'd5;
            else if (mag[3])  calc_vli_size = 4'd4;
            else if (mag[2])  calc_vli_size = 4'd3;
            else if (mag[1])  calc_vli_size = 4'd2;
            else if (mag[0])  calc_vli_size = 4'd1;
            else              calc_vli_size = 4'd0;
        end
    endfunction

    function [10:0] calc_vli_bits;
        input signed [12:0] val;
        input [3:0]         sz;
        reg [12:0]          raw;
        reg [12:0]          mask;
        begin
            if (sz == 4'd0) begin
                calc_vli_bits = 11'd0;
            end else begin
                raw  = val[12] ? (val - 13'sd1) : val;
                mask = (13'd1 << sz) - 13'd1;
                calc_vli_bits = raw[10:0] & mask[10:0];
            end
        end
    endfunction

    wire signed [12:0] dc_diff   = $signed({zz_rd_data[11], zz_rd_data}) - $signed({prev_dc[active_comp][11], prev_dc[active_comp]});
    wire [3:0]         dc_sz     = calc_vli_size(dc_diff);
    wire [10:0]        dc_vli    = calc_vli_bits(dc_diff, dc_sz);

    wire signed [12:0] ac_val_13 = $signed({zz_rd_data[11], zz_rd_data});
    wire [3:0]         ac_sz     = calc_vli_size(ac_val_13);
    wire [10:0]        ac_vli    = calc_vli_bits(ac_val_13, ac_sz);

    always @(*) begin
        out_valid     = 1'b0;
        out_is_dc     = 1'b0;
        out_is_chroma = (active_comp != 2'd0);
        out_symbol    = 8'h00;
        out_vli_bits  = 11'd0;
        out_vli_len   = 4'd0;

        case (state)
            S_EMIT_DC: begin
                out_valid    = 1'b1;
                out_is_dc    = 1'b1;
                out_symbol   = {4'd0, dc_sz};
                out_vli_bits = dc_vli;
                out_vli_len  = dc_sz;
            end
            S_SCAN_AC: begin
                if (zz_rd_data == 12'sd0) begin
                    if (zero_run == 4'd15) begin
                        out_valid    = 1'b1;
                        out_is_dc    = 1'b0;
                        out_symbol   = 8'hF0;
                        out_vli_bits = 11'd0;
                        out_vli_len  = 4'd0;
                    end
                end else begin
                    out_valid    = 1'b1;
                    out_is_dc    = 1'b0;
                    out_symbol   = {zero_run, ac_sz};
                    out_vli_bits = ac_vli;
                    out_vli_len  = ac_sz;
                end
            end
            S_EMIT_EOB: begin
                out_valid    = 1'b1;
                out_is_dc    = 1'b0;
                out_symbol   = 8'h00;
                out_vli_bits = 11'd0;
                out_vli_len  = 4'd0;
            end
            default: begin
                out_valid = 1'b0;
            end
        endcase
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state       <= S_IDLE;
            idx         <= 6'd0;
            last_nz     <= 6'd0;
            zero_run    <= 4'd0;
            active_comp <= 2'd0;
            prev_dc[0]  <= 12'sd0;
            prev_dc[1]  <= 12'sd0;
            prev_dc[2]  <= 12'sd0;
            done        <= 1'b0;
        end else begin
            done <= 1'b0;
            if (reset_dc) begin
                prev_dc[0] <= 12'sd0;
                prev_dc[1] <= 12'sd0;
                prev_dc[2] <= 12'sd0;
            end

            case (state)
                S_IDLE: begin
                    if (start) begin
                        active_comp <= comp_id;
                        idx         <= 6'd63;
                        last_nz     <= 6'd0;
                        zero_run    <= 4'd0;
                        state       <= S_FIND_LAST_NZ;
                    end
                end
                S_FIND_LAST_NZ: begin
                    if (zz_rd_data != 12'sd0) begin
                        last_nz <= idx;
                        idx     <= 6'd0;
                        state   <= S_EMIT_DC;
                    end else if (idx == 6'd1) begin
                        last_nz <= 6'd0;
                        idx     <= 6'd0;
                        state   <= S_EMIT_DC;
                    end else begin
                        idx <= idx - 6'd1;
                    end
                end
                S_EMIT_DC: begin
                    if (out_ready) begin
                        prev_dc[active_comp] <= zz_rd_data;
                        zero_run             <= 4'd0;
                        if (last_nz == 6'd0) begin
                            state <= S_EMIT_EOB;
                        end else begin
                            idx   <= 6'd1;
                            state <= S_SCAN_AC;
                        end
                    end
                end
                S_SCAN_AC: begin
                    if (zz_rd_data == 12'sd0) begin
                        if (zero_run == 4'd15) begin
                            if (out_ready) begin
                                zero_run <= 4'd0;
                                idx      <= idx + 6'd1;
                            end
                        end else begin
                            zero_run <= zero_run + 4'd1;
                            idx      <= idx + 6'd1;
                        end
                    end else if (out_ready) begin
                        zero_run <= 4'd0;
                        if (idx == last_nz) begin
                            if (last_nz < 6'd63)
                                state <= S_EMIT_EOB;
                            else
                                state <= S_DONE;
                        end else begin
                            idx <= idx + 6'd1;
                        end
                    end
                end
                S_EMIT_EOB: begin
                    if (out_ready)
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
