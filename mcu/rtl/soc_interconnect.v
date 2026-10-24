`timescale 1ns / 1ps

// ============================================================================
// Dual-Core RISC-V SoC Bus Interconnect with Atomic Unit (RV32A) & Arbiter
//
// Address Map:
//   0x0000_0000 .. 0x0000_3FFF : Core 0 Local SRAM (16 KB)
//   0x0001_0000 .. 0x0001_3FFF : Core 1 Local SRAM (16 KB)
//   0x1000_0000 .. 0x1000_3FFF : Shared Memory     (16 KB, Atomic RMW + LR/SC)
//   0x2000_0000 .. 0x2000_0FFF : CLINT IPI & Boot Controller
//   0x3000_0000 .. 0x3000_0FFF : UART / Debug Console MMIO
//   0x4000_0000 .. 0x4000_FFFF : Dual Register Bank (2x0x7F) & Report Buffer
// ============================================================================
module soc_interconnect (
    input  wire        clk,
    input  wire        rst_n,

    // ------------------------ Master 0 (Core 0) ------------------------
    input  wire        m0_req,
    input  wire        m0_we,
    input  wire [3:0]  m0_wstrb,
    input  wire [31:0] m0_addr,
    input  wire [31:0] m0_wdata,
    input  wire        m0_is_amo,
    input  wire [4:0]  m0_amo_op,
    output reg         m0_ready,
    output reg  [31:0] m0_rdata,

    // ------------------------ Master 1 (Core 1) ------------------------
    input  wire        m1_req,
    input  wire        m1_we,
    input  wire [3:0]  m1_wstrb,
    input  wire [31:0] m1_addr,
    input  wire [31:0] m1_wdata,
    input  wire        m1_is_amo,
    input  wire [4:0]  m1_amo_op,
    output reg         m1_ready,
    output reg  [31:0] m1_rdata,

    // ------------------------ Slave 0: Core 0 SRAM ---------------------
    output reg         sram0_req,
    output reg         sram0_we,
    output reg  [3:0]  sram0_wstrb,
    output reg  [11:0] sram0_addr,
    output reg  [31:0] sram0_wdata,
    input  wire [31:0] sram0_rdata,

    // ------------------------ Slave 1: Core 1 SRAM ---------------------
    output reg         sram1_req,
    output reg         sram1_we,
    output reg  [3:0]  sram1_wstrb,
    output reg  [11:0] sram1_addr,
    output reg  [31:0] sram1_wdata,
    input  wire [31:0] sram1_rdata,

    // ------------------------ Slave 2: Shared SRAM ---------------------
    output reg         shm_req,
    output reg         shm_we,
    output reg  [3:0]  shm_wstrb,
    output reg  [11:0] shm_addr,
    output reg  [31:0] shm_wdata,
    input  wire [31:0] shm_rdata,

    // ------------------------ Slave 3: CLINT / IPI / Boot --------------
    output reg         clint_req,
    output reg         clint_we,
    output reg  [3:0]  clint_wstrb,
    output reg  [7:0]  clint_addr,
    output reg  [31:0] clint_wdata,
    input  wire [31:0] clint_rdata,

    // ------------------------ Slave 4: UART / Debug MMIO ---------------
    output reg         uart_req,
    output reg         uart_we,
    output reg         uart_core_id,
    output reg  [7:0]  uart_addr,
    output reg  [31:0] uart_wdata,
    input  wire [31:0] uart_rdata,

    // ------------------------ Slave 5: Register Bank & Report Buffer ---
    output reg         regbank_req,
    output reg         regbank_we,
    output reg  [3:0]  regbank_wstrb,
    output reg  [15:0] regbank_addr,
    output reg  [31:0] regbank_wdata,
    input  wire        regbank_ready,
    input  wire [31:0] regbank_rdata,

    // ------------------------ Waveform Debug Signals -------------------
    output wire        dbg_shm_grant_c0,
    output wire        dbg_shm_grant_c1,
    output wire        dbg_amo_active,
    output wire        dbg_rsv0_valid,
    output wire        dbg_rsv1_valid
);

    // Address decoding for Master 0
    wire m0_sel_sram0   = m0_req && (m0_addr[31:16] == 16'h0000);
    wire m0_sel_sram1   = m0_req && (m0_addr[31:16] == 16'h0001);
    wire m0_sel_shm     = m0_req && (m0_addr[31:16] == 16'h1000);
    wire m0_sel_clint   = m0_req && (m0_addr[31:16] == 16'h2000);
    wire m0_sel_uart    = m0_req && (m0_addr[31:16] == 16'h3000);
    wire m0_sel_regbank = m0_req && (m0_addr[31:16] == 16'h4000);
    wire m0_sel_shared_bus = m0_sel_shm || m0_sel_clint || m0_sel_uart || m0_sel_regbank;

    // Address decoding for Master 1
    wire m1_sel_sram0   = m1_req && (m1_addr[31:16] == 16'h0000);
    wire m1_sel_sram1   = m1_req && (m1_addr[31:16] == 16'h0001);
    wire m1_sel_shm     = m1_req && (m1_addr[31:16] == 16'h1000);
    wire m1_sel_clint   = m1_req && (m1_addr[31:16] == 16'h2000);
    wire m1_sel_uart    = m1_req && (m1_addr[31:16] == 16'h3000);
    wire m1_sel_regbank = m1_req && (m1_addr[31:16] == 16'h4000);
    wire m1_sel_shared_bus = m1_sel_shm || m1_sel_clint || m1_sel_uart || m1_sel_regbank;

    // Round-robin priority bit for shared bus resources (0 = Core 0 priority, 1 = Core 1 priority)
    reg rr_prio;

    wire grant_shared_m0 = m0_sel_shared_bus && (!m1_sel_shared_bus || (rr_prio == 1'b0));
    wire grant_shared_m1 = m1_sel_shared_bus && (!m0_sel_shared_bus || (rr_prio == 1'b1));

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            rr_prio <= 1'b0;
        end else begin
            if (grant_shared_m0 && (!m0_sel_regbank || regbank_ready))
                rr_prio <= 1'b1;
            else if (grant_shared_m1 && (!m1_sel_regbank || regbank_ready))
                rr_prio <= 1'b0;
        end
    end

    // LR/SC reservation registers (per core)
    reg        rsv_valid [0:1];
    reg [11:0] rsv_addr  [0:1];

    assign dbg_shm_grant_c0 = grant_shared_m0 && m0_sel_shm;
    assign dbg_shm_grant_c1 = grant_shared_m1 && m1_sel_shm;
    assign dbg_amo_active   = (dbg_shm_grant_c0 && m0_is_amo) || (dbg_shm_grant_c1 && m1_is_amo);
    assign dbg_rsv0_valid   = rsv_valid[0];
    assign dbg_rsv1_valid   = rsv_valid[1];

    // Atomic ALU helper signals for Shared Memory
    wire        shm_master_id = grant_shared_m1 ? 1'b1 : 1'b0;
    wire        shm_is_amo    = grant_shared_m1 ? m1_is_amo : m0_is_amo;
    wire [4:0]  shm_amo_op    = grant_shared_m1 ? m1_amo_op : m0_amo_op;
    wire [31:0] shm_req_wdata = grant_shared_m1 ? m1_wdata  : m0_wdata;
    wire [11:0] shm_req_waddr = grant_shared_m1 ? m1_addr[13:2] : m0_addr[13:2];
    wire        shm_req_we    = grant_shared_m1 ? m1_we     : m0_we;
    wire [3:0]  shm_req_wstrb = grant_shared_m1 ? m1_wstrb  : m0_wstrb;

    wire        sc_success    = rsv_valid[shm_master_id] && (rsv_addr[shm_master_id] == shm_req_waddr);

    reg  [31:0] shm_resp_rdata;
    reg         shm_actual_we;
    reg  [3:0]  shm_actual_wstrb;
    reg  [31:0] shm_actual_wdata;

    always @(*) begin
        shm_resp_rdata   = shm_rdata;
        shm_actual_we    = shm_req_we;
        shm_actual_wstrb = shm_req_wstrb;
        shm_actual_wdata = shm_req_wdata;

        if (shm_is_amo) begin
            shm_actual_wstrb = 4'b1111;
            case (shm_amo_op)
                5'b00010: begin // LR.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b0;
                end
                5'b00011: begin // SC.W
                    shm_resp_rdata   = sc_success ? 32'd0 : 32'd1;
                    shm_actual_we    = sc_success;
                    shm_actual_wdata = shm_req_wdata;
                end
                5'b00001: begin // AMOSWAP.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b1;
                    shm_actual_wdata = shm_req_wdata;
                end
                5'b00000: begin // AMOADD.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b1;
                    shm_actual_wdata = shm_rdata + shm_req_wdata;
                end
                5'b00100: begin // AMOXOR.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b1;
                    shm_actual_wdata = shm_rdata ^ shm_req_wdata;
                end
                5'b01100: begin // AMOAND.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b1;
                    shm_actual_wdata = shm_rdata & shm_req_wdata;
                end
                5'b01000: begin // AMOOR.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b1;
                    shm_actual_wdata = shm_rdata | shm_req_wdata;
                end
                5'b10000: begin // AMOMIN.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b1;
                    shm_actual_wdata = ($signed(shm_rdata) < $signed(shm_req_wdata)) ? shm_rdata : shm_req_wdata;
                end
                5'b10100: begin // AMOMAX.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b1;
                    shm_actual_wdata = ($signed(shm_rdata) > $signed(shm_req_wdata)) ? shm_rdata : shm_req_wdata;
                end
                5'b11000: begin // AMOMINU.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b1;
                    shm_actual_wdata = (shm_rdata < shm_req_wdata) ? shm_rdata : shm_req_wdata;
                end
                5'b11100: begin // AMOMAXU.W
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b1;
                    shm_actual_wdata = (shm_rdata > shm_req_wdata) ? shm_rdata : shm_req_wdata;
                end
                default: begin
                    shm_resp_rdata   = shm_rdata;
                    shm_actual_we    = 1'b0;
                end
            endcase
        end
    end

    // Update LR/SC reservations on clock edge
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            rsv_valid[0] <= 1'b0;
            rsv_addr[0]  <= 12'd0;
            rsv_valid[1] <= 1'b0;
            rsv_addr[1]  <= 12'd0;
        end else if (shm_req) begin
            if (shm_is_amo && (shm_amo_op == 5'b00010)) begin
                rsv_valid[shm_master_id] <= 1'b1;
                rsv_addr[shm_master_id]  <= shm_req_waddr;
            end else if (shm_is_amo && (shm_amo_op == 5'b00011)) begin
                rsv_valid[shm_master_id] <= 1'b0;
                if (sc_success && rsv_valid[~shm_master_id] && (rsv_addr[~shm_master_id] == shm_req_waddr)) begin
                    rsv_valid[~shm_master_id] <= 1'b0;
                end
            end else if (shm_actual_we) begin
                if (rsv_valid[0] && (rsv_addr[0] == shm_req_waddr))
                    rsv_valid[0] <= 1'b0;
                if (rsv_valid[1] && (rsv_addr[1] == shm_req_waddr))
                    rsv_valid[1] <= 1'b0;
            end
        end
    end

    // Slave 0 (SRAM0) muxing: Core 0 has priority over Core 1
    wire grant_sram0_m0 = m0_sel_sram0;
    wire grant_sram0_m1 = m1_sel_sram0 && !m0_sel_sram0;

    // Slave 1 (SRAM1) muxing: Core 1 has priority over Core 0
    wire grant_sram1_m1 = m1_sel_sram1;
    wire grant_sram1_m0 = m0_sel_sram1 && !m1_sel_sram1;

    always @(*) begin
        // Slave 0: Core 0 Local SRAM
        sram0_req   = grant_sram0_m0 || grant_sram0_m1;
        sram0_we    = grant_sram0_m0 ? m0_we          : m1_we;
        sram0_wstrb = grant_sram0_m0 ? m0_wstrb       : m1_wstrb;
        sram0_addr  = grant_sram0_m0 ? m0_addr[13:2]  : m1_addr[13:2];
        sram0_wdata = grant_sram0_m0 ? m0_wdata       : m1_wdata;

        // Slave 1: Core 1 Local SRAM
        sram1_req   = grant_sram1_m1 || grant_sram1_m0;
        sram1_we    = grant_sram1_m1 ? m1_we          : m0_we;
        sram1_wstrb = grant_sram1_m1 ? m1_wstrb       : m0_wstrb;
        sram1_addr  = grant_sram1_m1 ? m1_addr[13:2]  : m0_addr[13:2];
        sram1_wdata = grant_sram1_m1 ? m1_wdata       : m0_wdata;

        // Slave 2: Shared Memory
        shm_req     = (grant_shared_m0 && m0_sel_shm) || (grant_shared_m1 && m1_sel_shm);
        shm_we      = shm_req ? shm_actual_we    : 1'b0;
        shm_wstrb   = shm_req ? shm_actual_wstrb : 4'b0000;
        shm_addr    = shm_req_waddr;
        shm_wdata   = shm_actual_wdata;

        // Slave 3: CLINT IPI & Boot
        clint_req   = (grant_shared_m0 && m0_sel_clint) || (grant_shared_m1 && m1_sel_clint);
        clint_we    = grant_shared_m1 ? m1_we         : m0_we;
        clint_wstrb = grant_shared_m1 ? m1_wstrb      : m0_wstrb;
        clint_addr  = grant_shared_m1 ? m1_addr[7:0]  : m0_addr[7:0];
        clint_wdata = grant_shared_m1 ? m1_wdata      : m0_wdata;

        // Slave 4: UART / Debug MMIO
        uart_req     = (grant_shared_m0 && m0_sel_uart) || (grant_shared_m1 && m1_sel_uart);
        uart_we      = grant_shared_m1 ? m1_we        : m0_we;
        uart_core_id = grant_shared_m1 ? 1'b1         : 1'b0;
        uart_addr    = grant_shared_m1 ? m1_addr[7:0] : m0_addr[7:0];
        uart_wdata   = grant_shared_m1 ? m1_wdata     : m0_wdata;

        // Slave 5: Register Bank (2x0x7F) & Report Buffer (arbitrated with Host I2C)
        regbank_req   = (grant_shared_m0 && m0_sel_regbank) || (grant_shared_m1 && m1_sel_regbank);
        regbank_we    = grant_shared_m1 ? m1_we          : m0_we;
        regbank_wstrb = grant_shared_m1 ? m1_wstrb       : m0_wstrb;
        regbank_addr  = grant_shared_m1 ? m1_addr[15:0]  : m0_addr[15:0];
        regbank_wdata = grant_shared_m1 ? m1_wdata       : m0_wdata;

        // Master 0 response
        m0_ready = 1'b0;
        m0_rdata = 32'h0000_0000;
        if (m0_sel_sram0 && grant_sram0_m0) begin
            m0_ready = 1'b1;
            m0_rdata = sram0_rdata;
        end else if (m0_sel_sram1 && grant_sram1_m0) begin
            m0_ready = 1'b1;
            m0_rdata = sram1_rdata;
        end else if (grant_shared_m0) begin
            if (m0_sel_shm) begin
                m0_ready = 1'b1;
                m0_rdata = shm_resp_rdata;
            end else if (m0_sel_clint) begin
                m0_ready = 1'b1;
                m0_rdata = clint_rdata;
            end else if (m0_sel_uart) begin
                m0_ready = 1'b1;
                m0_rdata = uart_rdata;
            end else if (m0_sel_regbank) begin
                m0_ready = regbank_ready;
                m0_rdata = regbank_rdata;
            end
        end

        // Master 1 response
        m1_ready = 1'b0;
        m1_rdata = 32'h0000_0000;
        if (m1_sel_sram1 && grant_sram1_m1) begin
            m1_ready = 1'b1;
            m1_rdata = sram1_rdata;
        end else if (m1_sel_sram0 && grant_sram0_m1) begin
            m1_ready = 1'b1;
            m1_rdata = sram0_rdata;
        end else if (grant_shared_m1) begin
            if (m1_sel_shm) begin
                m1_ready = 1'b1;
                m1_rdata = shm_resp_rdata;
            end else if (m1_sel_clint) begin
                m1_ready = 1'b1;
                m1_rdata = clint_rdata;
            end else if (m1_sel_uart) begin
                m1_ready = 1'b1;
                m1_rdata = uart_rdata;
            end else if (m1_sel_regbank) begin
                m1_ready = regbank_ready;
                m1_rdata = regbank_rdata;
            end
        end
    end

endmodule
