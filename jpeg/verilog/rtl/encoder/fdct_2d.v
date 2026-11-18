// 2D Forward DCT (8x8 block): Level-shift (-128) -> Row 1D DCT -> Transpose RAM -> Col 1D DCT
module fdct_2d (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               in_wr_en,
    input  wire [5:0]         in_wr_addr,
    input  wire [7:0]         in_pixel,
    input  wire               start,
    output wire               out_valid,
    output wire [5:0]         out_addr,
    output wire signed [11:0] out_coeff,
    output reg                done
);

    localparam [1:0] S_IDLE = 2'd0;
    localparam [1:0] S_ROW  = 2'd1;
    localparam [1:0] S_COL  = 2'd2;

    reg [1:0] state;
    reg [6:0] step;
    reg [5:0] step_d1;
    reg       row_cap_d1;
    reg       col_cap_d1;

    reg [7:0]         pix_mem [0:63];
    reg signed [15:0] row_mem [0:63];

    always @(posedge clk) begin
        if (in_wr_en)
            pix_mem[in_wr_addr] <= in_pixel;
    end

    wire [2:0] row_r = step[5:3];
    wire [2:0] row_u = step[2:0];
    wire [2:0] col_v = step[5:3];
    wire [2:0] col_u = step[2:0];

    wire dct_in_valid = (state == S_ROW || state == S_COL) && (step < 7'd64);
    wire dct_col_pass = (state == S_COL);
    wire [2:0] dct_k  = dct_col_pass ? col_v : row_u;

    function signed [15:0] lvl_shift;
        input [7:0] p;
        begin
            lvl_shift = $signed({8'd0, p}) - 16'sd128;
        end
    endfunction

    wire signed [15:0] x0 = dct_col_pass ? row_mem[{3'd0, col_u}] : lvl_shift(pix_mem[{row_r, 3'd0}]);
    wire signed [15:0] x1 = dct_col_pass ? row_mem[{3'd1, col_u}] : lvl_shift(pix_mem[{row_r, 3'd1}]);
    wire signed [15:0] x2 = dct_col_pass ? row_mem[{3'd2, col_u}] : lvl_shift(pix_mem[{row_r, 3'd2}]);
    wire signed [15:0] x3 = dct_col_pass ? row_mem[{3'd3, col_u}] : lvl_shift(pix_mem[{row_r, 3'd3}]);
    wire signed [15:0] x4 = dct_col_pass ? row_mem[{3'd4, col_u}] : lvl_shift(pix_mem[{row_r, 3'd4}]);
    wire signed [15:0] x5 = dct_col_pass ? row_mem[{3'd5, col_u}] : lvl_shift(pix_mem[{row_r, 3'd5}]);
    wire signed [15:0] x6 = dct_col_pass ? row_mem[{3'd6, col_u}] : lvl_shift(pix_mem[{row_r, 3'd6}]);
    wire signed [15:0] x7 = dct_col_pass ? row_mem[{3'd7, col_u}] : lvl_shift(pix_mem[{row_r, 3'd7}]);

    wire               dct_out_valid;
    wire signed [15:0] dct_y_out;

    dct_1d u_dct_1d (
        .clk       (clk),
        .rst_n     (rst_n),
        .valid_in  (dct_in_valid),
        .col_pass  (dct_col_pass),
        .k_idx     (dct_k),
        .x0(x0), .x1(x1), .x2(x2), .x3(x3),
        .x4(x4), .x5(x5), .x6(x6), .x7(x7),
        .valid_out (dct_out_valid),
        .y_out     (dct_y_out)
    );

    assign out_valid = col_cap_d1 && dct_out_valid;
    assign out_addr  = step_d1;
    assign out_coeff = dct_y_out[11:0];

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state      <= S_IDLE;
            step       <= 7'd0;
            step_d1    <= 6'd0;
            row_cap_d1 <= 1'b0;
            col_cap_d1 <= 1'b0;
            done       <= 1'b0;
        end else begin
            done       <= 1'b0;
            row_cap_d1 <= (state == S_ROW) && (step < 7'd64);
            col_cap_d1 <= (state == S_COL) && (step < 7'd64);
            step_d1    <= step[5:0];

            if (row_cap_d1 && dct_out_valid)
                row_mem[step_d1] <= dct_y_out;

            case (state)
                S_IDLE: begin
                    step <= 7'd0;
                    if (start)
                        state <= S_ROW;
                end
                S_ROW: begin
                    if (step < 7'd64) begin
                        step <= step + 7'd1;
                    end else begin
                        state <= S_COL;
                        step  <= 7'd0;
                    end
                end
                S_COL: begin
                    if (step < 7'd64) begin
                        step <= step + 7'd1;
                    end else begin
                        state <= S_IDLE;
                        step  <= 7'd0;
                        done  <= 1'b1;
                    end
                end
                default: state <= S_IDLE;
            endcase
        end
    end

endmodule
