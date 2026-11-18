// Reconstructs 64 Zig-Zag quantized coefficients per block from Huffman DC/AC tokens
module rle_dc_decoder (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               reset_dc,
    input  wire               start,
    input  wire [1:0]         comp_id,
    input  wire               dc_tbl_id,
    input  wire               ac_tbl_id,

    // Controls huffman_decoder
    output reg                huff_start,
    output reg  [1:0]         huff_tbl_sel,
    input  wire               huff_done,
    input  wire [7:0]         huff_symbol,
    input  wire signed [11:0] huff_coeff,

    // Zig-Zag coefficient buffer read port
    input  wire [5:0]         zz_rd_addr,
    output wire signed [11:0] zz_rd_data,
    output reg                done
);

    localparam [2:0]
        S_IDLE     = 3'd0,
        S_CLEAR    = 3'd1,
        S_WAIT_DC  = 3'd2,
        S_REQ_AC   = 3'd3,
        S_WAIT_AC  = 3'd4,
        S_DONE     = 3'd5;

    reg [2:0]         state;
    reg [5:0]         zz_idx;
    reg [1:0]         active_comp;
    reg               active_ac_tbl;
    reg signed [11:0] prev_dc [0:2];
    reg signed [11:0] zz_mem  [0:63];

    assign zz_rd_data = zz_mem[zz_rd_addr];

    wire [3:0] ac_run  = huff_symbol[7:4];
    wire [6:0] next_zz = {1'b0, zz_idx} + {3'd0, ac_run};

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state         <= S_IDLE;
            zz_idx        <= 6'd0;
            active_comp   <= 2'd0;
            active_ac_tbl <= 1'b0;
            huff_start    <= 1'b0;
            huff_tbl_sel  <= 2'd0;
            done          <= 1'b0;
            prev_dc[0]    <= 12'sd0;
            prev_dc[1]    <= 12'sd0;
            prev_dc[2]    <= 12'sd0;
        end else begin
            huff_start <= 1'b0;
            done       <= 1'b0;

            if (reset_dc) begin
                prev_dc[0] <= 12'sd0;
                prev_dc[1] <= 12'sd0;
                prev_dc[2] <= 12'sd0;
            end

            case (state)
                S_IDLE: begin
                    if (start) begin
                        active_comp   <= comp_id;
                        active_ac_tbl <= ac_tbl_id;
                        zz_idx        <= 6'd0;
                        state         <= S_CLEAR;
                    end
                end
                S_CLEAR: begin
                    zz_mem[zz_idx] <= 12'sd0;
                    if (zz_idx == 6'd63) begin
                        huff_tbl_sel <= {1'b0, dc_tbl_id};
                        huff_start   <= 1'b1;
                        state        <= S_WAIT_DC;
                    end else begin
                        zz_idx <= zz_idx + 6'd1;
                    end
                end
                S_WAIT_DC: begin
                    if (huff_done) begin
                        zz_mem[0]            <= prev_dc[active_comp] + huff_coeff;
                        prev_dc[active_comp] <= prev_dc[active_comp] + huff_coeff;
                        zz_idx               <= 6'd1;
                        state                <= S_REQ_AC;
                    end
                end
                S_REQ_AC: begin
                    huff_tbl_sel <= {1'b1, active_ac_tbl};
                    huff_start   <= 1'b1;
                    state        <= S_WAIT_AC;
                end
                S_WAIT_AC: begin
                    if (huff_done) begin
                        if (huff_symbol == 8'h00) begin
                            // EOB
                            state <= S_DONE;
                        end else if (huff_symbol == 8'hF0) begin
                            // ZRL (16 zeros)
                            if (zz_idx >= 6'd48)
                                state <= S_DONE;
                            else begin
                                zz_idx <= zz_idx + 6'd16;
                                state  <= S_REQ_AC;
                            end
                        end else begin
                            if (next_zz < 7'd64)
                                zz_mem[next_zz[5:0]] <= huff_coeff;
                            if (next_zz >= 7'd63)
                                state <= S_DONE;
                            else begin
                                zz_idx <= next_zz[5:0] + 6'd1;
                                state  <= S_REQ_AC;
                            end
                        end
                    end
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
