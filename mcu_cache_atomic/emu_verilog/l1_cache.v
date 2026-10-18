`include "defines.vh"

/*
 * 8-Line Direct-Mapped L1 Data Cache with MESI Coherence State Machine
 */
module l1_cache (
    input  wire        clk,
    input  wire        rst_n,

    // Combinational CPU Lookup Port
    input  wire [31:0] cpu_query_addr,
    output wire        cpu_hit,
    output wire [1:0]  cpu_line_state,
    output wire [31:0] cpu_line_data,

    // Combinational Coherence Bus Snoop Port
    input  wire [31:0] snoop_query_addr,
    output wire        snoop_hit,
    output wire        snoop_dirty,
    output wire [1:0]  snoop_line_state,
    output wire [31:0] snoop_line_data
);
    reg [1:0]  state [0:7];
    reg [26:0] tag   [0:7];
    reg [31:0] addr  [0:7];
    reg [31:0] data  [0:7];

    wire [2:0]  cpu_idx = cpu_query_addr[4:2];
    wire [26:0] cpu_tag = cpu_query_addr[31:5];
    assign cpu_hit        = (state[cpu_idx] != `MESI_I) && (tag[cpu_idx] == cpu_tag);
    assign cpu_line_state = state[cpu_idx];
    assign cpu_line_data  = data[cpu_idx];

    wire [2:0]  snp_idx = snoop_query_addr[4:2];
    wire [26:0] snp_tag = snoop_query_addr[31:5];
    assign snoop_hit        = (state[snp_idx] != `MESI_I) && (tag[snp_idx] == snp_tag);
    assign snoop_dirty      = snoop_hit && (state[snp_idx] == `MESI_M);
    assign snoop_line_state = state[snp_idx];
    assign snoop_line_data  = data[snp_idx];

    integer i;
    always @(negedge rst_n) begin
        if (!rst_n) begin
            for (i = 0; i < 8; i = i + 1) begin
                state[i] <= `MESI_I;
                addr[i]  <= 32'h0000_1000 + (i * 4);
                tag[i]   <= (32'h0000_1000 + (i * 4)) >> 5;
                data[i]  <= 32'd0;
            end
        end
    end

endmodule
