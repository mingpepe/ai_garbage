`timescale 1ns / 1ps

module bus_arbiter (
    input  wire        clk,
    input  wire        rst_n,

    // CPU Master Interface
    input  wire        cpu_req,
    input  wire [31:0] cpu_addr,
    input  wire        cpu_write,
    input  wire [31:0] cpu_wdata,
    input  wire [1:0]  cpu_prio,
    output reg         cpu_grant,
    output wire        cpu_stall,

    // DMA Master Interface
    input  wire        dma_req,
    input  wire [31:0] dma_addr,
    input  wire        dma_write,
    input  wire [31:0] dma_wdata,
    input  wire [1:0]  dma_prio,
    output reg         dma_grant,
    output wire        dma_stall,

    // Shared System Bus to Slaves
    output reg         bus_active,
    output reg  [1:0]  bus_master, // 0=NONE, 1=CPU, 2=DMA
    output reg  [31:0] haddr,
    output reg         hwrite,
    output reg  [31:0] hwdata,
    input  wire [31:0] slave_rdata,
    output wire [31:0] hrdata,

    // Performance / Telemetry Counters (visible in VCD / GTKWave)
    output reg  [15:0] stat_dma_grants,
    output reg  [15:0] stat_cpu_grants,
    output reg  [15:0] stat_contentions,
    output reg  [15:0] stat_idle_cycles
);

    localparam MASTER_NONE = 2'd0;
    localparam MASTER_CPU  = 2'd1;
    localparam MASTER_DMA  = 2'd2;

    reg [1:0] last_granted;

    assign hrdata    = slave_rdata;
    assign cpu_stall = cpu_req & ~cpu_grant;
    assign dma_stall = dma_req & ~dma_grant;

    // Combinational arbitration decision for current cycle
    always @(*) begin
        cpu_grant  = 1'b0;
        dma_grant  = 1'b0;
        bus_active = 1'b0;
        bus_master = MASTER_NONE;
        haddr      = 32'h0000_0000;
        hwrite     = 1'b0;
        hwdata     = 32'h0000_0000;

        if (cpu_req && !dma_req) begin
            cpu_grant  = 1'b1;
            bus_active = 1'b1;
            bus_master = MASTER_CPU;
            haddr      = cpu_addr;
            hwrite     = cpu_write;
            hwdata     = cpu_wdata;
        end else if (!cpu_req && dma_req) begin
            dma_grant  = 1'b1;
            bus_active = 1'b1;
            bus_master = MASTER_DMA;
            haddr      = dma_addr;
            hwrite     = dma_write;
            hwdata     = dma_wdata;
        end else if (cpu_req && dma_req) begin
            // Bus Contention: higher priority value wins; tie-break via Round-Robin
            if (dma_prio > cpu_prio) begin
                dma_grant  = 1'b1;
                bus_active = 1'b1;
                bus_master = MASTER_DMA;
                haddr      = dma_addr;
                hwrite     = dma_write;
                hwdata     = dma_wdata;
            end else if (cpu_prio > dma_prio) begin
                cpu_grant  = 1'b1;
                bus_active = 1'b1;
                bus_master = MASTER_CPU;
                haddr      = cpu_addr;
                hwrite     = cpu_write;
                hwdata     = cpu_wdata;
            end else begin
                if (last_granted == MASTER_DMA) begin
                    cpu_grant  = 1'b1;
                    bus_active = 1'b1;
                    bus_master = MASTER_CPU;
                    haddr      = cpu_addr;
                    hwrite     = cpu_write;
                    hwdata     = cpu_wdata;
                end else begin
                    dma_grant  = 1'b1;
                    bus_active = 1'b1;
                    bus_master = MASTER_DMA;
                    haddr      = dma_addr;
                    hwrite     = dma_write;
                    hwdata     = dma_wdata;
                end
            end
        end
    end

    // Sequential state and telemetry update
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            last_granted     <= MASTER_NONE;
            stat_dma_grants  <= 16'd0;
            stat_cpu_grants  <= 16'd0;
            stat_contentions <= 16'd0;
            stat_idle_cycles <= 16'd0;
        end else begin
            if (cpu_req && dma_req)
                stat_contentions <= stat_contentions + 16'd1;

            if (dma_grant) begin
                last_granted    <= MASTER_DMA;
                stat_dma_grants <= stat_dma_grants + 16'd1;
            end else if (cpu_grant) begin
                last_granted    <= MASTER_CPU;
                stat_cpu_grants <= stat_cpu_grants + 16'd1;
            end else begin
                stat_idle_cycles <= stat_idle_cycles + 16'd1;
            end
        end
    end

endmodule
