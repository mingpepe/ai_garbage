`include "defines.vh"

/*
 * 4-Entry FIFO Store Buffer with Combinational Store-to-Load Forwarding
 */
module store_buffer (
    input  wire        clk,
    input  wire        rst_n,

    // Combinational Store-to-Load Forwarding Lookup Port
    input  wire [31:0] lookup_addr,
    output reg         fwd_hit,
    output reg  [31:0] fwd_data,

    // Status & Head Entry Outputs (for L1 Drain)
    output reg  [2:0]  count,
    output wire        head_valid,
    output wire [31:0] head_addr,
    output wire [31:0] head_data,
    output wire [31:0] head_pc
);
    reg        valid [0:3];
    reg [31:0] addr  [0:3];
    reg [31:0] data  [0:3];
    reg [31:0] pc    [0:3];

    assign head_valid = (count > 0) && valid[0];
    assign head_addr  = addr[0];
    assign head_data  = data[0];
    assign head_pc    = pc[0];

    integer k;
    // Youngest-to-Oldest associative search for Store-to-Load Forwarding
    always @(*) begin
        fwd_hit  = 1'b0;
        fwd_data = 32'd0;
        for (k = 0; k < 4; k = k + 1) begin
            if (k < count && valid[k] && (addr[k] == lookup_addr)) begin
                fwd_hit  = 1'b1;
                fwd_data = data[k];
            end
        end
    end

    // Reset task / initialization
    integer i;
    always @(negedge rst_n) begin
        if (!rst_n) begin
            count <= 3'd0;
            for (i = 0; i < 4; i = i + 1) begin
                valid[i] <= 1'b0;
                addr[i]  <= 32'd0;
                data[i]  <= 32'd0;
                pc[i]    <= 32'd0;
            end
        end
    end

    // Helper tasks called by core/controller on clock edge
    task push_entry(input [31:0] e_addr, input [31:0] e_data, input [31:0] e_pc);
        begin
            valid[count] = 1'b1;
            addr[count]  = e_addr;
            data[count]  = e_data;
            pc[count]    = e_pc;
            count        = count + 3'd1;
        end
    endtask

    task pop_head;
        integer j;
        begin
            if (count > 0) begin
                for (j = 0; j < 3; j = j + 1) begin
                    valid[j] = valid[j + 1];
                    addr[j]  = addr[j + 1];
                    data[j]  = data[j + 1];
                    pc[j]    = pc[j + 1];
                end
                valid[count - 1] = 1'b0;
                count = count - 3'd1;
            end
        end
    endtask

endmodule
