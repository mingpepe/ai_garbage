`include "defines.vh"

/*
 * Snooping MESI Coherence Bus State & Signals
 */
module mesi_bus (
    input  wire clk,
    input  wire rst_n
);
    reg        busy;
    reg        owner;
    reg [2:0]  cmd;
    reg [31:0] addr;
    reg [31:0] wdata;
    reg [31:0] rdata;
    reg        timer;
    reg        last_grant;
    reg        snoop_hit;
    reg        snoop_dirty;
    reg        snoop_inv_res;

    always @(negedge rst_n) begin
        if (!rst_n) begin
            busy          <= 1'b0;
            owner         <= 1'b0;
            cmd           <= `BUS_NONE;
            addr          <= 32'd0;
            wdata         <= 32'd0;
            rdata         <= 32'd0;
            timer         <= 1'b0;
            last_grant    <= 1'b0;
            snoop_hit     <= 1'b0;
            snoop_dirty   <= 1'b0;
            snoop_inv_res <= 1'b0;
        end
    end

endmodule
