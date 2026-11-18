// Removes 0x00 byte-stuffing after 0xFF in JPEG entropy scan and detects EOI (0xFF 0xD9)
module byte_destuffer (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       enable,
    input  wire       in_valid,
    input  wire [7:0] in_byte,
    output wire       in_ready,
    output reg        out_valid,
    output reg  [7:0] out_byte,
    input  wire       out_ready,
    output reg        eoi_seen
);

    reg saw_ff;

    wire out_free = !out_valid || out_ready;
    assign in_ready = enable && !eoi_seen && out_free;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            saw_ff    <= 1'b0;
            out_valid <= 1'b0;
            out_byte  <= 8'd0;
            eoi_seen  <= 1'b0;
        end else begin
            if (out_valid && out_ready)
                out_valid <= 1'b0;

            if (enable && !eoi_seen && in_valid && in_ready) begin
                if (saw_ff) begin
                    if (in_byte == 8'h00) begin
                        saw_ff    <= 1'b0;
                        out_valid <= 1'b1;
                        out_byte  <= 8'hFF;
                    end else if (in_byte == 8'hFF) begin
                        saw_ff <= 1'b1;
                    end else if (in_byte == 8'hD9) begin
                        saw_ff   <= 1'b0;
                        eoi_seen <= 1'b1;
                    end else begin
                        saw_ff <= 1'b0;
                    end
                end else begin
                    if (in_byte == 8'hFF) begin
                        saw_ff <= 1'b1;
                    end else begin
                        out_valid <= 1'b1;
                        out_byte  <= in_byte;
                    end
                end
            end
        end
    end

endmodule
