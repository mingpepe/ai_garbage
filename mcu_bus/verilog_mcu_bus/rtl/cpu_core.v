`timescale 1ns / 1ps

module cpu_core (
    input  wire        clk,
    input  wire        rst_n,

    // Bus Master Interface
    output reg         cpu_bus_req,
    output reg  [31:0] cpu_bus_addr,
    output reg         cpu_bus_write,
    output reg  [31:0] cpu_bus_wdata,
    output reg  [1:0]  cpu_bus_prio,
    input  wire        cpu_bus_grant,
    input  wire [31:0] hrdata,

    // NVIC Interrupt Interface
    input  wire        nvic_irq_valid,
    input  wire [1:0]  nvic_irq_id,
    output reg         nvic_irq_ack,
    output reg         nvic_irq_complete,
    output reg  [1:0]  nvic_irq_complete_id,

    // Optional Testbench Firmware Override (for initial DMA setup)
    input  wire        fw_override_req,
    input  wire [31:0] fw_override_addr,
    input  wire        fw_override_write,
    input  wire [31:0] fw_override_wdata,

    // Debug / Waveform Outputs
    output reg  [1:0]  cpu_state,
    output reg  [63:0] cpu_state_ascii,
    output reg  [1:0]  active_irq_id,
    output reg  [7:0]  last_read_val,
    output reg  [15:0] cpu_bus_stalls
);

    localparam CPU_RUNNING     = 2'd0;
    localparam CPU_ISR_SERVICE = 2'd1;
    localparam CPU_ISR_EXIT    = 2'd2;

    reg [1:0] poll_timer;

    always @(*) begin
        case (cpu_state)
            CPU_RUNNING:     cpu_state_ascii = "RUNNING ";
            CPU_ISR_SERVICE: cpu_state_ascii = "ISR_EXEC";
            CPU_ISR_EXIT:    cpu_state_ascii = "ISR_EXIT";
            default:         cpu_state_ascii = "UNKNOWN ";
        endcase
    end

    // Combinational Bus Request Logic
    always @(*) begin
        cpu_bus_req   = 1'b0;
        cpu_bus_addr  = 32'd0;
        cpu_bus_write = 1'b0;
        cpu_bus_wdata = 32'd0;
        cpu_bus_prio  = 2'd1; // Normal priority (lower than DMA's Very High=3)

        if (fw_override_req) begin
            cpu_bus_req   = 1'b1;
            cpu_bus_addr  = fw_override_addr;
            cpu_bus_write = fw_override_write;
            cpu_bus_wdata = fw_override_wdata;
            cpu_bus_prio  = 2'd3;
        end else if (cpu_state == CPU_ISR_SERVICE) begin
            cpu_bus_req   = 1'b1;
            cpu_bus_write = 1'b1;
            cpu_bus_prio  = 2'd2; // Elevated priority for ISR
            if (active_irq_id == 2'd3) begin
                // Clear DMA TCIF + GIF via DMA_IFCR (0x4002_0004)
                cpu_bus_addr  = 32'h4002_0004;
                cpu_bus_wdata = 32'h0000_0003;
            end else if (active_irq_id == 2'd1) begin
                // Clear UART ORE via UART_SR (0x4000_0004)
                cpu_bus_addr  = 32'h4000_0004;
                cpu_bus_wdata = 32'h0000_0000;
            end else begin
                cpu_bus_addr  = 32'h4000_1004;
                cpu_bus_write = 1'b0;
            end
        end else if ((cpu_state == CPU_RUNNING) && (poll_timer == 2'd2)) begin
            // Periodic background poll of I2C Status Register (0x4000_1004)
            cpu_bus_req   = 1'b1;
            cpu_bus_addr  = 32'h4000_1004;
            cpu_bus_write = 1'b0;
            cpu_bus_wdata = 32'd0;
            cpu_bus_prio  = 2'd1;
        end
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            cpu_state            <= CPU_RUNNING;
            active_irq_id        <= 2'd0;
            nvic_irq_ack         <= 1'b0;
            nvic_irq_complete    <= 1'b0;
            nvic_irq_complete_id <= 2'd0;
            poll_timer           <= 2'd0;
            last_read_val        <= 8'h00;
            cpu_bus_stalls       <= 16'd0;
        end else begin
            nvic_irq_ack      <= 1'b0;
            nvic_irq_complete <= 1'b0;

            if (cpu_bus_req && !cpu_bus_grant) begin
                cpu_bus_stalls <= cpu_bus_stalls + 16'd1;
            end

            if (cpu_bus_req && cpu_bus_grant && !cpu_bus_write) begin
                last_read_val <= hrdata[7:0];
            end

            case (cpu_state)
                CPU_RUNNING: begin
                    if (nvic_irq_valid && !fw_override_req) begin
                        nvic_irq_ack  <= 1'b1;
                        active_irq_id <= nvic_irq_id;
                        cpu_state     <= CPU_ISR_SERVICE;
                    end else begin
                        if (poll_timer == 2'd2) begin
                            if (cpu_bus_grant)
                                poll_timer <= 2'd0;
                            // If stalled by DMA, keep poll_timer at 2 to retry next cycle!
                        end else begin
                            poll_timer <= poll_timer + 2'd1;
                        end
                    end
                end

                CPU_ISR_SERVICE: begin
                    if (cpu_bus_grant) begin
                        cpu_state <= CPU_ISR_EXIT;
                    end
                end

                CPU_ISR_EXIT: begin
                    nvic_irq_complete    <= 1'b1;
                    nvic_irq_complete_id <= active_irq_id;
                    cpu_state            <= CPU_RUNNING;
                end

                default: cpu_state <= CPU_RUNNING;
            endcase
        end
    end

endmodule
