`timescale 1ns / 1ps

// ============================================================================
// CLINT IPI (Inter-Processor Interrupt) & Dual-Core Boot Controller
// Base Address: 0x2000_0000
//   0x00 : MSIP_CORE0      (R/W) Bit 0 triggers Machine Software Interrupt on Core 0
//   0x04 : MSIP_CORE1      (R/W) Bit 0 triggers Machine Software Interrupt on Core 1
//   0x08 : IPI_MSG_0_TO_1  (R/W) 32-bit Mailbox register Core 0 -> Core 1
//   0x0C : IPI_MSG_1_TO_0  (R/W) 32-bit Mailbox register Core 1 -> Core 0
//   0x10 : CORE1_BOOT_ADDR (R/W) Core 1 reset vector address (default 0x0001_0000)
//   0x14 : CORE1_BOOT_CTRL (R/W) Bit 0 releases Core 1 from reset (Core 0 boots Core 1)
//   0x18 : SIM_DONE_FLAGS  (R/W) Bit 0 = Core 0 done, Bit 1 = Core 1 done (OR-latched or direct)
//   0x1C : CYCLE_COUNTER   (R)   32-bit free-running cycle counter
// ============================================================================
module clint_ipi_boot (
    input  wire        clk,
    input  wire        rst_n,

    // Bus Interface
    input  wire        req,
    input  wire        we,
    input  wire [3:0]  wstrb,
    input  wire [7:0]  addr,       // Byte offset [7:0]
    input  wire [31:0] wdata,
    output reg  [31:0] rdata,

    // Core Boot & Interrupt Outputs
    output wire        core0_boot_en,
    output wire [31:0] core0_boot_addr,
    output reg         core1_boot_en,
    output reg  [31:0] core1_boot_addr,

    output reg         irq_software_core0,
    output reg         irq_software_core1,
    output reg  [31:0] sim_done_flags
);

    // Core 0 is always booted directly by the SoC upon reset release
    assign core0_boot_en   = 1'b1;
    assign core0_boot_addr = 32'h0000_0000;

    reg [31:0] ipi_msg_0_to_1;
    reg [31:0] ipi_msg_1_to_0;
    reg [31:0] cycle_counter;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            irq_software_core0 <= 1'b0;
            irq_software_core1 <= 1'b0;
            ipi_msg_0_to_1     <= 32'h0000_0000;
            ipi_msg_1_to_0     <= 32'h0000_0000;
            core1_boot_addr    <= 32'h0001_0000;
            core1_boot_en      <= 1'b0; // Held in reset until Core 0 boots Core 1
            sim_done_flags     <= 32'h0000_0000;
            cycle_counter      <= 32'h0000_0000;
        end else begin
            cycle_counter <= cycle_counter + 32'd1;

            if (req && we) begin
                case (addr[7:2])
                    6'h00: irq_software_core0 <= wdata[0];
                    6'h01: irq_software_core1 <= wdata[0];
                    6'h02: ipi_msg_0_to_1     <= wdata;
                    6'h03: ipi_msg_1_to_0     <= wdata;
                    6'h04: core1_boot_addr    <= wdata;
                    6'h05: core1_boot_en      <= wdata[0];
                    6'h06: sim_done_flags     <= sim_done_flags | wdata;
                    default: ;
                endcase
            end
        end
    end

    always @(*) begin
        rdata = 32'h0000_0000;
        if (req) begin
            case (addr[7:2])
                6'h00: rdata = {31'd0, irq_software_core0};
                6'h01: rdata = {31'd0, irq_software_core1};
                6'h02: rdata = ipi_msg_0_to_1;
                6'h03: rdata = ipi_msg_1_to_0;
                6'h04: rdata = core1_boot_addr;
                6'h05: rdata = {31'd0, core1_boot_en};
                6'h06: rdata = sim_done_flags;
                6'h07: rdata = cycle_counter;
                default: rdata = 32'h0000_0000;
            endcase
        end
    end

endmodule
