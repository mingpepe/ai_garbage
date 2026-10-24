`timescale 1ns / 1ps

// ============================================================================
// Dual-Bank Register File (2 x 0x7F), Report Buffer, Host-vs-FW Arbiter & I2C Slave
//
// Specification:
//   - Two Register Banks: Bank 0 & Bank 1, each of size 0x7F bytes (0x00 .. 0x7E)
//   - Register 0x7F: Bank Select Register (write 0 -> Bank 0, write 1 -> Bank 1)
//   - Bank 0 Register 0x0F: Special Port redirected to Report Buffer (256 bytes)
//       * FW writing to Bank 0 0x0F (or 0x4000_1000+offset) writes Report Buffer
//       * Host reading Bank 0 0x0F over I2C reads Report Buffer[rpt_rd_ptr++]
//   - Hardware Arbiter between Host (I2C Slave) and FW (SoC Bus @ 0x4000_0000)
//       * Round-robin priority when Host and FW access simultaneously
//       * Stalls FW bus (fw_ready=0) or holds I2C request for 1 cycle on contention
// ============================================================================
module i2c_regbank_subsys #(
    parameter [6:0] I2C_SLAVE_ADDR = 7'h42
)(
    input  wire        clk,
    input  wire        rst_n,

    // -------------------- I2C Slave Physical Interface --------------------
    input  wire        i2c_scl,
    input  wire        i2c_sda_in,
    output reg         i2c_sda_oe,     // 1 = pull SDA low (0), 0 = release SDA high (1)

    // -------------------- FW Bus Interface (0x4000_0000) ------------------
    input  wire        fw_req,
    input  wire        fw_we,
    input  wire [3:0]  fw_wstrb,
    input  wire [15:0] fw_addr,        // 0x0000..0x007F: RegBank, 0x1000..0x10FF: Direct Report Buffer
    input  wire [31:0] fw_wdata,
    output wire        fw_ready,
    output reg  [31:0] fw_rdata,

    // -------------------- Waveform / Debug Observation --------------------
    output reg         dbg_host_bank_sel,
    output reg         dbg_fw_bank_sel,
    output wire        dbg_arb_grant_host,
    output wire        dbg_arb_grant_fw,
    output wire        dbg_arb_conflict,
    output reg  [7:0]  dbg_rpt_wr_ptr,
    output reg  [7:0]  dbg_rpt_rd_ptr,
    output wire [7:0]  dbg_rpt_status,
    output wire [7:0]  dbg_rpt_len,
    output reg  [31:0] dbg_arb_conflict_cnt
);

    // ========================================================================
    // 1. Storage: Two Register Banks (size 0x7F each: 0x00..0x7E) & Report Buffer (256B)
    // ========================================================================
    reg [7:0] bank0_regs    [0:126]; // 0x00 .. 0x7E (127 bytes = 0x7F size)
    reg [7:0] bank1_regs    [0:126]; // 0x00 .. 0x7E (127 bytes = 0x7F size)
    reg [7:0] report_buffer [0:255]; // 256-byte Report Buffer

    assign dbg_rpt_status = bank0_regs[8'h04]; // Bank 0 0x04: Report Ready / ACK status
    assign dbg_rpt_len    = bank0_regs[8'h05]; // Bank 0 0x05: Report Payload Length

    // ========================================================================
    // 2. I2C Slave State Machine (7-bit Addr = 0x42)
    // ========================================================================
    localparam [3:0] I2C_IDLE          = 4'd0,
                     I2C_ADDR          = 4'd1,
                     I2C_ADDR_ACK      = 4'd2,
                     I2C_REG_ADDR      = 4'd3,
                     I2C_REG_ADDR_ACK  = 4'd4,
                     I2C_WRITE_DATA    = 4'd5,
                     I2C_WRITE_ACK     = 4'd6,
                     I2C_READ_DATA     = 4'd7,
                     I2C_READ_ACK      = 4'd8;

    reg [3:0] i2c_state;
    reg       scl_d, sda_d;

    wire scl_rising  =  i2c_scl && !scl_d;
    wire scl_falling = !i2c_scl &&  scl_d;
    wire i2c_start   =  i2c_scl &&  scl_d && !i2c_sda_in &&  sda_d;
    wire i2c_stop    =  i2c_scl &&  scl_d &&  i2c_sda_in && !sda_d;

    reg [3:0] i2c_bit_cnt;     // Counts 8..0
    reg [7:0] i2c_shift;
    reg       i2c_rw;          // 0 = Write, 1 = Read
    reg [7:0] i2c_reg_ptr;     // Current target register offset (0x00..0x7F)
    reg [7:0] i2c_tx_byte;

    // Host Request to Arbiter
    reg       host_req_pending;
    reg       host_req_we;
    reg [7:0] host_req_addr;
    reg [7:0] host_req_wdata;

    // ========================================================================
    // 3. Hardware Arbiter: Host (I2C) vs. FW (RISC-V Cores)
    // ========================================================================
    reg arb_rr_prio; // 0 = FW priority, 1 = Host priority

    assign dbg_arb_conflict   = host_req_pending && fw_req;
    assign dbg_arb_grant_host = host_req_pending && (!fw_req || (arb_rr_prio == 1'b1));
    assign dbg_arb_grant_fw   = fw_req           && (!host_req_pending || (arb_rr_prio == 1'b0));
    assign fw_ready           = dbg_arb_grant_fw;

    wire [7:0] fw_byte_wdata  = fw_wdata[7:0];
    wire       fw_is_rpt_win  = (fw_addr[15:8] == 8'h10); // 0x4000_1000..0x4000_10FF
    wire [7:0] fw_reg_idx     = fw_addr[7:0];

    // Combinational Read Path for FW
    reg [7:0] fw_read_byte;
    always @(*) begin
        fw_read_byte = 8'h00;
        if (fw_is_rpt_win) begin
            fw_read_byte = report_buffer[fw_reg_idx];
        end else if (fw_reg_idx == 8'h7F) begin
            fw_read_byte = {7'd0, dbg_fw_bank_sel};
        end else if (dbg_fw_bank_sel == 1'b0) begin
            if (fw_reg_idx == 8'h0F) begin
                // Special Port 0x0F in Bank 0 -> Redirected to Report Buffer!
                fw_read_byte = report_buffer[dbg_rpt_rd_ptr];
            end else if (fw_reg_idx < 8'h7F) begin
                fw_read_byte = bank0_regs[fw_reg_idx];
            end
        end else begin
            if (fw_reg_idx < 8'h7F) begin
                fw_read_byte = bank1_regs[fw_reg_idx];
            end
        end
        // Replicate across all 4 byte lanes so LBU/LB/LW at any byte offset works seamlessly
        fw_rdata = {4{fw_read_byte}};
    end

    // Combinational Read Path for Host (I2C)
    reg [7:0] host_read_byte;
    always @(*) begin
        host_read_byte = 8'h00;
        if (host_req_addr == 8'h7F) begin
            host_read_byte = {7'd0, dbg_host_bank_sel};
        end else if (dbg_host_bank_sel == 1'b0) begin
            if (host_req_addr == 8'h0F) begin
                // Special Port 0x0F in Bank 0 -> Redirected to Report Buffer!
                host_read_byte = report_buffer[dbg_rpt_rd_ptr];
            end else if (host_req_addr < 8'h7F) begin
                host_read_byte = bank0_regs[host_req_addr];
            end
        end else begin
            if (host_req_addr < 8'h7F) begin
                host_read_byte = bank1_regs[host_req_addr];
            end
        end
    end

    wire [7:0] next_i2c_shift = {i2c_shift[6:0], i2c_sda_in};

    integer i;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            scl_d                <= 1'b1;
            sda_d                <= 1'b1;
            i2c_state            <= I2C_IDLE;
            i2c_sda_oe           <= 1'b0;
            i2c_bit_cnt          <= 4'd8;
            i2c_shift            <= 8'h00;
            i2c_rw               <= 1'b0;
            i2c_reg_ptr          <= 8'h00;
            i2c_tx_byte          <= 8'h00;

            host_req_pending     <= 1'b0;
            host_req_we          <= 1'b0;
            host_req_addr        <= 8'h00;
            host_req_wdata       <= 8'h00;

            arb_rr_prio          <= 1'b0;
            dbg_host_bank_sel    <= 1'b0;
            dbg_fw_bank_sel      <= 1'b0;
            dbg_rpt_wr_ptr       <= 8'h00;
            dbg_rpt_rd_ptr       <= 8'h00;
            dbg_arb_conflict_cnt <= 32'd0;

            for (i = 0; i < 127; i = i + 1) begin
                bank0_regs[i] <= 8'h00;
                bank1_regs[i] <= 8'h00;
            end
            for (i = 0; i < 256; i = i + 1) begin
                report_buffer[i] <= 8'h00;
            end
        end else begin
            scl_d <= i2c_scl;
            sda_d <= i2c_sda_in;

            if (dbg_arb_conflict) begin
                dbg_arb_conflict_cnt <= dbg_arb_conflict_cnt + 32'd1;
            end

            // ----------------------------------------------------------------
            // A. Execute Arbitrated Access (Host I2C vs. FW Bus)
            // ----------------------------------------------------------------
            if (dbg_arb_grant_host) begin
                arb_rr_prio      <= 1'b0; // Next conflict favors FW
                host_req_pending <= 1'b0;

                if (host_req_we) begin
                    if (host_req_addr == 8'h7F) begin
                        // Write 0x7F -> Switch Bank!
                        dbg_host_bank_sel <= host_req_wdata[0];
                    end else if (dbg_host_bank_sel == 1'b0) begin
                        if (host_req_addr == 8'h0F) begin
                            // Bank 0 0x0F Special Port -> Write Report Buffer
                            report_buffer[dbg_rpt_wr_ptr] <= host_req_wdata;
                            dbg_rpt_wr_ptr                <= dbg_rpt_wr_ptr + 8'd1;
                        end else if (host_req_addr == 8'h0E && host_req_wdata[0]) begin
                            dbg_rpt_rd_ptr <= 8'h00;
                            dbg_rpt_wr_ptr <= 8'h00;
                        end else if (host_req_addr < 8'h7F) begin
                            bank0_regs[host_req_addr] <= host_req_wdata;
                        end
                    end else begin
                        if (host_req_addr < 8'h7F) begin
                            bank1_regs[host_req_addr] <= host_req_wdata;
                        end
                    end
                end else begin
                    // Host Read Granted
                    i2c_tx_byte <= host_read_byte;
                    if (dbg_host_bank_sel == 1'b0 && host_req_addr == 8'h0F) begin
                        // Special Port Bank 0 0x0F -> Auto-increment Report Buffer read pointer!
                        dbg_rpt_rd_ptr <= dbg_rpt_rd_ptr + 8'd1;
                    end
                end
            end else if (dbg_arb_grant_fw) begin
                arb_rr_prio <= 1'b1; // Next conflict favors Host

                if (fw_we) begin
                    if (fw_is_rpt_win) begin
                        // Direct Report Buffer Window (0x4000_1000 + offset)
                        report_buffer[fw_reg_idx] <= fw_byte_wdata;
                        dbg_rpt_wr_ptr            <= fw_reg_idx + 8'd1;
                    end else if (fw_reg_idx == 8'h7F) begin
                        // Write 0x7F -> Switch Bank!
                        dbg_fw_bank_sel <= fw_byte_wdata[0];
                    end else if (dbg_fw_bank_sel == 1'b0) begin
                        if (fw_reg_idx == 8'h0F) begin
                            // Special Port Bank 0 0x0F -> Push byte to Report Buffer!
                            report_buffer[dbg_rpt_wr_ptr] <= fw_byte_wdata;
                            dbg_rpt_wr_ptr                <= dbg_rpt_wr_ptr + 8'd1;
                        end else if (fw_reg_idx == 8'h0E && fw_byte_wdata[0]) begin
                            // Reset Report Buffer pointers
                            dbg_rpt_wr_ptr <= 8'h00;
                            dbg_rpt_rd_ptr <= 8'h00;
                        end else if (fw_reg_idx < 8'h7F) begin
                            bank0_regs[fw_reg_idx] <= fw_byte_wdata;
                            // When FW sets B0_RPT_STATUS (0x04) == 1, reset rpt_rd_ptr to 0 for Host
                            if (fw_reg_idx == 8'h04 && fw_byte_wdata == 8'h01) begin
                                dbg_rpt_rd_ptr <= 8'h00;
                            end
                        end
                    end else begin
                        if (fw_reg_idx < 8'h7F) begin
                            bank1_regs[fw_reg_idx] <= fw_byte_wdata;
                        end
                    end
                end else begin
                    // FW Read from Bank 0 0x0F also advances rpt_rd_ptr if used
                    if (!fw_is_rpt_win && dbg_fw_bank_sel == 1'b0 && fw_reg_idx == 8'h0F) begin
                        dbg_rpt_rd_ptr <= dbg_rpt_rd_ptr + 8'd1;
                    end
                end
            end

            // ----------------------------------------------------------------
            // B. I2C Slave Protocol State Machine
            // ----------------------------------------------------------------
            if (i2c_start) begin
                i2c_state   <= I2C_ADDR;
                i2c_bit_cnt <= 4'd8;
                i2c_sda_oe  <= 1'b0;
            end else if (i2c_stop) begin
                i2c_state   <= I2C_IDLE;
                i2c_sda_oe  <= 1'b0;
            end else begin
                case (i2c_state)
                    I2C_IDLE: begin
                        i2c_sda_oe <= 1'b0;
                    end

                    I2C_ADDR: begin
                        if (scl_rising) begin
                            i2c_shift   <= next_i2c_shift;
                            i2c_bit_cnt <= i2c_bit_cnt - 4'd1;
                            if (i2c_bit_cnt == 4'd1) begin
                                i2c_rw <= i2c_sda_in;
                                // If Read transaction, issue read request to Arbiter immediately
                                if (next_i2c_shift[7:1] == I2C_SLAVE_ADDR && i2c_sda_in == 1'b1) begin
                                    host_req_pending <= 1'b1;
                                    host_req_we      <= 1'b0;
                                    host_req_addr    <= i2c_reg_ptr;
                                end
                            end
                        end else if (scl_falling && i2c_bit_cnt == 4'd0) begin
                            if (i2c_shift[7:1] == I2C_SLAVE_ADDR) begin
                                i2c_sda_oe <= 1'b1; // Drive ACK (SDA = 0)
                                i2c_state  <= I2C_ADDR_ACK;
                            end else begin
                                i2c_sda_oe <= 1'b0;
                                i2c_state  <= I2C_IDLE;
                            end
                        end
                    end

                    I2C_ADDR_ACK: begin
                        if (scl_falling) begin
                            if (i2c_rw == 1'b0) begin
                                i2c_bit_cnt <= 4'd8;
                                i2c_sda_oe  <= 1'b0;
                                i2c_state   <= I2C_REG_ADDR;
                            end else begin
                                // Output MSB of read byte (7 bits remaining: 6..0)
                                i2c_bit_cnt <= 4'd7;
                                i2c_sda_oe  <= ~i2c_tx_byte[7];
                                i2c_state   <= I2C_READ_DATA;
                                // Auto-increment register pointer unless reading Special Port Bank 0 0x0F
                                if (!(dbg_host_bank_sel == 1'b0 && i2c_reg_ptr == 8'h0F)) begin
                                    i2c_reg_ptr <= i2c_reg_ptr + 8'd1;
                                end
                            end
                        end
                    end

                    I2C_REG_ADDR: begin
                        if (scl_rising) begin
                            i2c_shift   <= next_i2c_shift;
                            i2c_bit_cnt <= i2c_bit_cnt - 4'd1;
                            if (i2c_bit_cnt == 4'd1) begin
                                i2c_reg_ptr <= next_i2c_shift;
                            end
                        end else if (scl_falling && i2c_bit_cnt == 4'd0) begin
                            i2c_sda_oe <= 1'b1; // ACK register address
                            i2c_state  <= I2C_REG_ADDR_ACK;
                        end
                    end

                    I2C_REG_ADDR_ACK: begin
                        if (scl_falling) begin
                            i2c_sda_oe  <= 1'b0;
                            i2c_bit_cnt <= 4'd8;
                            i2c_state   <= I2C_WRITE_DATA;
                        end
                    end

                    I2C_WRITE_DATA: begin
                        if (scl_rising) begin
                            i2c_shift   <= next_i2c_shift;
                            i2c_bit_cnt <= i2c_bit_cnt - 4'd1;
                            if (i2c_bit_cnt == 4'd1) begin
                                // Issue write request to Arbiter
                                host_req_pending <= 1'b1;
                                host_req_we      <= 1'b1;
                                host_req_addr    <= i2c_reg_ptr;
                                host_req_wdata   <= next_i2c_shift;
                                if (!(dbg_host_bank_sel == 1'b0 && i2c_reg_ptr == 8'h0F) && i2c_reg_ptr != 8'h7F) begin
                                    i2c_reg_ptr <= i2c_reg_ptr + 8'd1;
                                end
                            end
                        end else if (scl_falling && i2c_bit_cnt == 4'd0) begin
                            i2c_sda_oe <= 1'b1; // ACK written byte
                            i2c_state  <= I2C_WRITE_ACK;
                        end
                    end

                    I2C_WRITE_ACK: begin
                        if (scl_falling) begin
                            i2c_sda_oe  <= 1'b0;
                            i2c_bit_cnt <= 4'd8;
                            i2c_state   <= I2C_WRITE_DATA;
                        end
                    end

                    I2C_READ_DATA: begin
                        if (scl_falling) begin
                            if (i2c_bit_cnt == 4'd0) begin
                                i2c_sda_oe <= 1'b0; // Release SDA for Master ACK/NACK
                                i2c_state  <= I2C_READ_ACK;
                            end else begin
                                i2c_bit_cnt <= i2c_bit_cnt - 4'd1;
                                i2c_sda_oe  <= ~i2c_tx_byte[i2c_bit_cnt - 4'd1];
                            end
                        end
                    end

                    I2C_READ_ACK: begin
                        if (scl_rising) begin
                            if (i2c_sda_in == 1'b0) begin
                                // Master ACKed -> Prefetch next byte via Arbiter!
                                host_req_pending <= 1'b1;
                                host_req_we      <= 1'b0;
                                host_req_addr    <= i2c_reg_ptr;
                            end
                        end else if (scl_falling) begin
                            if (sda_d == 1'b0) begin
                                i2c_bit_cnt <= 4'd7;
                                i2c_sda_oe  <= ~i2c_tx_byte[7];
                                i2c_state   <= I2C_READ_DATA;
                                if (!(dbg_host_bank_sel == 1'b0 && i2c_reg_ptr == 8'h0F)) begin
                                    i2c_reg_ptr <= i2c_reg_ptr + 8'd1;
                                end
                            end else begin
                                // Master NACKed -> Done reading
                                i2c_sda_oe <= 1'b0;
                                i2c_state  <= I2C_IDLE;
                            end
                        end
                    end

                    default: i2c_state <= I2C_IDLE;
                endcase
            end
        end
    end

endmodule
