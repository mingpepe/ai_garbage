// 8-point 1D Forward DCT-II core (Q14 orthonormal cosine basis)
// Computes one frequency component k_idx [0..7] per call; row pass shifts by 11 (Q3 out), col pass by 17.
module dct_1d (
    input  wire               clk,
    input  wire               rst_n,
    input  wire               valid_in,
    input  wire               col_pass,
    input  wire [2:0]         k_idx,
    input  wire signed [15:0] x0,
    input  wire signed [15:0] x1,
    input  wire signed [15:0] x2,
    input  wire signed [15:0] x3,
    input  wire signed [15:0] x4,
    input  wire signed [15:0] x5,
    input  wire signed [15:0] x6,
    input  wire signed [15:0] x7,
    output reg                valid_out,
    output reg  signed [15:0] y_out
);

    reg signed [15:0] c0, c1, c2, c3, c4, c5, c6, c7;

    always @(*) begin
        case (k_idx)
            3'd0: begin
                c0 =  16'sd5793; c1 =  16'sd5793; c2 =  16'sd5793; c3 =  16'sd5793;
                c4 =  16'sd5793; c5 =  16'sd5793; c6 =  16'sd5793; c7 =  16'sd5793;
            end
            3'd1: begin
                c0 =  16'sd8035; c1 =  16'sd6811; c2 =  16'sd4551; c3 =  16'sd1598;
                c4 = -16'sd1598; c5 = -16'sd4551; c6 = -16'sd6811; c7 = -16'sd8035;
            end
            3'd2: begin
                c0 =  16'sd7568; c1 =  16'sd3135; c2 = -16'sd3135; c3 = -16'sd7568;
                c4 = -16'sd7568; c5 = -16'sd3135; c6 =  16'sd3135; c7 =  16'sd7568;
            end
            3'd3: begin
                c0 =  16'sd6811; c1 = -16'sd1598; c2 = -16'sd8035; c3 = -16'sd4551;
                c4 =  16'sd4551; c5 =  16'sd8035; c6 =  16'sd1598; c7 = -16'sd6811;
            end
            3'd4: begin
                c0 =  16'sd5793; c1 = -16'sd5793; c2 = -16'sd5793; c3 =  16'sd5793;
                c4 =  16'sd5793; c5 = -16'sd5793; c6 = -16'sd5793; c7 =  16'sd5793;
            end
            3'd5: begin
                c0 =  16'sd4551; c1 = -16'sd8035; c2 =  16'sd1598; c3 =  16'sd6811;
                c4 = -16'sd6811; c5 = -16'sd1598; c6 =  16'sd8035; c7 = -16'sd4551;
            end
            3'd6: begin
                c0 =  16'sd3135; c1 = -16'sd7568; c2 =  16'sd7568; c3 = -16'sd3135;
                c4 = -16'sd3135; c5 =  16'sd7568; c6 = -16'sd7568; c7 =  16'sd3135;
            end
            default: begin
                c0 =  16'sd1598; c1 = -16'sd4551; c2 =  16'sd6811; c3 = -16'sd8035;
                c4 =  16'sd8035; c5 = -16'sd6811; c6 =  16'sd4551; c7 = -16'sd1598;
            end
        endcase
    end

    wire signed [31:0] p0 = x0 * c0;
    wire signed [31:0] p1 = x1 * c1;
    wire signed [31:0] p2 = x2 * c2;
    wire signed [31:0] p3 = x3 * c3;
    wire signed [31:0] p4 = x4 * c4;
    wire signed [31:0] p5 = x5 * c5;
    wire signed [31:0] p6 = x6 * c6;
    wire signed [31:0] p7 = x7 * c7;

    wire signed [31:0] sum = p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7;
    wire signed [31:0] rounded = col_pass ? ((sum + 32'sd65536) >>> 17) : ((sum + 32'sd1024) >>> 11);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            valid_out <= 1'b0;
            y_out     <= 16'sd0;
        end else begin
            valid_out <= valid_in;
            if (valid_in)
                y_out <= rounded[15:0];
        end
    end

endmodule
