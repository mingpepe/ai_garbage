// 2D Inverse DCT (8x8 block): Row 1D IDCT -> Transpose RAM -> Col 1D IDCT -> +128 & clamp [0..255]
module idct_2d (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               in_wr_en,
    input  wire [5:0]         in_wr_addr,
    input  wire signed [15:0] in_coeff,
    input  wire               start,
    output wire               out_valid,
    output wire [5:0]         out_addr,
    output wire [7:0]         out_pixel,
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

    reg signed [15:0] coeff_mem [0:63];
    reg signed [15:0] row_mem   [0:63];

    always @(posedge clk) begin
        if (in_wr_en)
            coeff_mem[in_wr_addr] <= in_coeff;
    end

    wire [2:0] row_v = step[5:3];
    wire [2:0] row_x = step[2:0];
    wire [2:0] col_y = step[5:3];
    wire [2:0] col_x = step[2:0];

    wire idct_in_valid = (state == S_ROW || state == S_COL) && (step < 7'd64);
    wire idct_col_pass = (state == S_COL);
    wire [2:0] idct_k  = idct_col_pass ? col_y : row_x;

    wire signed [15:0] x0 = idct_col_pass ? row_mem[{3'd0, col_x}] : coeff_mem[{row_v, 3'd0}];
    wire signed [15:0] x1 = idct_col_pass ? row_mem[{3'd1, col_x}] : coeff_mem[{row_v, 3'd1}];
    wire signed [15:0] x2 = idct_col_pass ? row_mem[{3'd2, col_x}] : coeff_mem[{row_v, 3'd2}];
    wire signed [15:0] x3 = idct_col_pass ? row_mem[{3'd3, col_x}] : coeff_mem[{row_v, 3'd3}];
    wire signed [15:0] x4 = idct_col_pass ? row_mem[{3'd4, col_x}] : coeff_mem[{row_v, 3'd4}];
    wire signed [15:0] x5 = idct_col_pass ? row_mem[{3'd5, col_x}] : coeff_mem[{row_v, 3'd5}];
    wire signed [15:0] x6 = idct_col_pass ? row_mem[{3'd6, col_x}] : coeff_mem[{row_v, 3'd6}];
    wire signed [15:0] x7 = idct_col_pass ? row_mem[{3'd7, col_x}] : coeff_mem[{row_v, 3'd7}];

    wire               idct_out_valid;
    wire signed [15:0] idct_y_out;

    idct_1d u_idct_1d (
        .clk       (clk),
        .rst_n     (rst_n),
        .valid_in  (idct_in_valid),
        .col_pass  (idct_col_pass),
        .k_idx     (idct_k),
        .x0(x0), .x1(x1), .x2(x2), .x3(x3),
        .x4(x4), .x5(x5), .x6(x6), .x7(x7),
        .valid_out (idct_out_valid),
        .y_out     (idct_y_out)
    );

    wire signed [15:0] shifted_px = idct_y_out + 16'sd128;
    assign out_valid = col_cap_d1 && idct_out_valid;
    assign out_addr  = step_d1;
    assign out_pixel = (shifted_px < 16'sd0)   ? 8'd0 :
                       (shifted_px > 16'sd255) ? 8'd255 :
                                                 shifted_px[7:0];

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

            if (row_cap_d1 && idct_out_valid)
                row_mem[step_d1] <= idct_y_out;

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
