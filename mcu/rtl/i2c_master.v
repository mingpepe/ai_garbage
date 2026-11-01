`timescale 1ns / 1ps

// ============================================================================
// Multi-Master I2C Master Controller with Hardware Arbitration & Bus-Busy Interlock
//
// Features:
//   - Multi-Master Arbitration: Detects when another master pulls SDA low
//     while this master is releasing SDA (bit-level arbitration lost detection).
//   - Bus Busy & Ownership Tracking:
//       * Continuously monitors START and STOP conditions on the I2C bus.
//       * If bus is busy and NOT owned by this master: Blocks FW START command
//         and sets STATUS_START_BLOCKED / STATUS_ARB_LOST.
//       * If bus is busy BUT owned by this master: Allows REPEATED START.
//   - Clock Synchronization: SCL Wired-AND detection (waits for scl_in==1).
//   - MMIO Register Map:
//       0x00: CTRL (W)   - [0]=START, [1]=STOP, [2]=WRITE, [3]=READ_ACK, [4]=READ_NACK
//       0x04: STATUS (R) - [0]=TIP (busy), [1]=BUS_BUSY, [2]=BUS_OWNED,
//                          [3]=ARB_LOST,   [4]=RX_NACK,   [5]=START_BLOCKED
//             STATUS (W) - Write 1 to bit 3/5 to clear ARB_LOST / START_BLOCKED
//       0x08: TX_DATA(RW)- [7:0]=Transmit data byte
//       0x0C: RX_DATA(R) - [7:0]=Received data byte
//       0x10: CLK_DIV(RW)- [7:0]=Quarter-bit period divider (default 4)
// ============================================================================
module i2c_master #(
    parameter DEFAULT_CLK_DIV = 8'd4
)(
    input  wire        clk,
    input  wire        rst_n,

    // MMIO Bus Interface
    input  wire        req,
    input  wire        we,
    input  wire [3:0]  wstrb,
    input  wire [7:0]  addr,
    input  wire [31:0] wdata,
    output wire        ready,
    output reg  [31:0] rdata,

    // I2C Physical Open-Drain Interface
    input  wire        scl_in,
    output reg         scl_oe,      // 1 = pull low (0), 0 = release (1)
    input  wire        sda_in,
    output reg         sda_oe,      // 1 = pull low (0), 0 = release (1)

    // Debug / Observation Signals
    output wire [3:0]  dbg_state,
    output wire        dbg_tip,
    output wire        dbg_bus_busy,
    output wire        dbg_bus_owned,
    output wire        dbg_arb_lost,
    output wire        dbg_start_blocked
);

    assign ready = req; // Single cycle MMIO response

    // ------------------------------------------------------------------------
    // 1. Bus Activity Snooping: START / STOP & Busy Detection
    // ------------------------------------------------------------------------
    reg scl_prev, sda_prev;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            scl_prev <= 1'b1;
            sda_prev <= 1'b1;
        end else begin
            scl_prev <= scl_in;
            sda_prev <= sda_in;
        end
    end

    wire bus_start_det = scl_in && scl_prev && (!sda_in && sda_prev);  // SDA falling with SCL high
    wire bus_stop_det  = scl_in && scl_prev && (sda_in && !sda_prev);   // SDA rising with SCL high

    reg bus_busy;
    reg bus_owned;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            bus_busy <= 1'b0;
        end else begin
            if (bus_start_det)
                bus_busy <= 1'b1;
            else if (bus_stop_det)
                bus_busy <= 1'b0;
        end
    end

    // ------------------------------------------------------------------------
    // 2. Registers
    // ------------------------------------------------------------------------
    reg [7:0] clk_div_reg;
    reg [7:0] tx_data_reg;
    reg [7:0] rx_data_reg;
    reg       status_tip;
    reg       status_arb_lost;
    reg       status_rx_nack;
    reg       status_start_blocked;

    assign dbg_tip           = status_tip;
    assign dbg_bus_busy      = bus_busy;
    assign dbg_bus_owned     = bus_owned;
    assign dbg_arb_lost      = status_arb_lost;
    assign dbg_start_blocked = status_start_blocked;

    // ------------------------------------------------------------------------
    // 3. Command Decoding
    // ------------------------------------------------------------------------
    reg cmd_start_pulse;
    reg cmd_stop_pulse;
    reg cmd_write_pulse;
    reg cmd_read_ack_pulse;
    reg cmd_read_nack_pulse;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            cmd_start_pulse     <= 1'b0;
            cmd_stop_pulse      <= 1'b0;
            cmd_write_pulse     <= 1'b0;
            cmd_read_ack_pulse  <= 1'b0;
            cmd_read_nack_pulse <= 1'b0;
        end else begin
            cmd_start_pulse     <= 1'b0;
            cmd_stop_pulse      <= 1'b0;
            cmd_write_pulse     <= 1'b0;
            cmd_read_ack_pulse  <= 1'b0;
            cmd_read_nack_pulse <= 1'b0;

            if (req && we && (addr[7:2] == 6'h00) && !status_tip) begin
                if (wdata[0]) cmd_start_pulse     <= 1'b1;
                if (wdata[1]) cmd_stop_pulse      <= 1'b1;
                if (wdata[2]) cmd_write_pulse     <= 1'b1;
                if (wdata[3]) cmd_read_ack_pulse  <= 1'b1;
                if (wdata[4]) cmd_read_nack_pulse <= 1'b1;
            end
        end
    end

    // MMIO Read
    always @(*) begin
        case (addr[7:2])
            6'h00: rdata = 32'd0;
            6'h01: rdata = {26'd0, status_start_blocked, status_rx_nack, status_arb_lost, bus_owned, bus_busy, status_tip};
            6'h02: rdata = {24'd0, tx_data_reg};
            6'h03: rdata = {24'd0, rx_data_reg};
            6'h04: rdata = {24'd0, clk_div_reg};
            default: rdata = 32'd0;
        endcase
    end

    // ------------------------------------------------------------------------
    // 4. Timing / Quarter-Cycle Divider
    // ------------------------------------------------------------------------
    reg [7:0] div_cnt;
    wire tick = (div_cnt == clk_div_reg - 1);
    reg  scl_wait_high;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            div_cnt <= 8'd0;
        end else if (!status_tip) begin
            div_cnt <= 8'd0;
        end else if (scl_wait_high && !scl_in) begin
            // Clock stretching / multi-master clock synchronization
            div_cnt <= div_cnt;
        end else if (tick) begin
            div_cnt <= 8'd0;
        end else begin
            div_cnt <= div_cnt + 1;
        end
    end

    // ------------------------------------------------------------------------
    // 5. State Machine
    // ------------------------------------------------------------------------
    localparam [3:0] M_IDLE      = 4'd0,
                     M_START     = 4'd1,
                     M_REP_START = 4'd2,
                     M_WRITE     = 4'd3,
                     M_READ      = 4'd4,
                     M_STOP      = 4'd5;

    reg [3:0] state;
    assign dbg_state = state;

    reg [1:0] phase;
    reg [3:0] bit_cnt;
    reg [7:0] shift_reg;
    reg [7:0] rx_shift;
    reg       read_ack_bit;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state                <= M_IDLE;
            phase                <= 2'd0;
            bit_cnt              <= 4'd0;
            shift_reg            <= 8'd0;
            rx_shift             <= 8'd0;
            read_ack_bit         <= 1'b0;
            scl_oe               <= 1'b0;
            sda_oe               <= 1'b0;
            scl_wait_high        <= 1'b0;
            bus_owned            <= 1'b0;
            status_tip           <= 1'b0;
            status_arb_lost      <= 1'b0;
            status_rx_nack       <= 1'b0;
            status_start_blocked <= 1'b0;
            clk_div_reg          <= DEFAULT_CLK_DIV;
            tx_data_reg          <= 8'd0;
            rx_data_reg          <= 8'd0;
        end else begin
            // Write handling for MMIO registers
            if (req && we) begin
                case (addr[7:2])
                    6'h01: begin
                        // W1C for status flags
                        if (wdata[3]) status_arb_lost      <= 1'b0;
                        if (wdata[5]) status_start_blocked <= 1'b0;
                    end
                    6'h02: tx_data_reg <= wdata[7:0];
                    6'h04: clk_div_reg <= (wdata[7:0] == 8'd0) ? 8'd1 : wdata[7:0];
                    default: ;
                endcase
            end

            case (state)
                // ------------------------------------------------------------
                // IDLE: Wait for FW Command
                // ------------------------------------------------------------
                M_IDLE: begin
                    scl_wait_high <= 1'b0;
                    phase         <= 2'd0;

                    if (cmd_start_pulse) begin
                        // Check Bus Busy vs Bus Owned
                        if (bus_busy && !bus_owned) begin
                            // BUS IS BUSY AND NOT OWNED: BLOCK FW START!
                            status_start_blocked <= 1'b1;
                            status_arb_lost      <= 1'b1;
                            status_tip           <= 1'b0;
                            // Keep lines released
                            scl_oe               <= 1'b0;
                            sda_oe               <= 1'b0;
                        end else if (bus_busy && bus_owned) begin
                            // BUS IS BUSY BUT WE OWN IT: REPEATED START ALLOWED!
                            status_tip      <= 1'b1;
                            status_arb_lost <= 1'b0;
                            state           <= M_REP_START;
                            phase           <= 2'd0;
                        end else begin
                            // BUS IS FREE: NORMAL START
                            status_tip      <= 1'b1;
                            status_arb_lost <= 1'b0;
                            state           <= M_START;
                            phase           <= 2'd0;
                        end
                    end else if (cmd_stop_pulse) begin
                        status_tip <= 1'b1;
                        state      <= M_STOP;
                        phase      <= 2'd0;
                    end else if (cmd_write_pulse) begin
                        status_tip <= 1'b1;
                        shift_reg  <= tx_data_reg;
                        bit_cnt    <= 4'd0;
                        state      <= M_WRITE;
                        phase      <= 2'd0;
                    end else if (cmd_read_ack_pulse || cmd_read_nack_pulse) begin
                        status_tip   <= 1'b1;
                        read_ack_bit <= cmd_read_nack_pulse ? 1'b1 : 1'b0;
                        bit_cnt      <= 4'd0;
                        rx_shift     <= 8'd0;
                        state        <= M_READ;
                        phase        <= 2'd0;
                    end
                end

                // ------------------------------------------------------------
                // NORMAL START: Generate Start Condition from Bus Free
                // ------------------------------------------------------------
                M_START: begin
                    if (tick) begin
                        case (phase)
                            2'd0: begin
                                // Release both lines
                                scl_oe <= 1'b0;
                                sda_oe <= 1'b0;
                                phase  <= 2'd1;
                            end
                            2'd1: begin
                                // Pull SDA low while SCL is high (START condition!)
                                sda_oe <= 1'b1;
                                scl_oe <= 1'b0;
                                phase  <= 2'd2;
                            end
                            2'd2: begin
                                // Hold SDA low
                                phase <= 2'd3;
                            end
                            2'd3: begin
                                // Pull SCL low to finish start condition
                                scl_oe     <= 1'b1;
                                bus_owned  <= 1'b1;
                                status_tip <= 1'b0;
                                state      <= M_IDLE;
                            end
                        endcase
                    end
                end

                // ------------------------------------------------------------
                // REPEATED START: Generate Start Condition while Bus is Owned
                // ------------------------------------------------------------
                M_REP_START: begin
                    if (scl_wait_high && !scl_in) begin
                        // Wait for clock to rise
                    end else if (tick) begin
                        case (phase)
                            2'd0: begin
                                // SCL is low, release SDA
                                scl_oe <= 1'b1;
                                sda_oe <= 1'b0;
                                phase  <= 2'd1;
                            end
                            2'd1: begin
                                // Release SCL high
                                scl_oe        <= 1'b0;
                                scl_wait_high <= 1'b1;
                                phase         <= 2'd2;
                            end
                            2'd2: begin
                                scl_wait_high <= 1'b0;
                                // Pull SDA low while SCL is high (Repeated START!)
                                sda_oe <= 1'b1;
                                phase  <= 2'd3;
                            end
                            2'd3: begin
                                // Pull SCL low
                                scl_oe     <= 1'b1;
                                bus_owned  <= 1'b1;
                                status_tip <= 1'b0;
                                state      <= M_IDLE;
                            end
                        endcase
                    end
                end

                // ------------------------------------------------------------
                // WRITE: 8 Bits of Data + 1 Bit Slave ACK + Arbitration Check
                // ------------------------------------------------------------
                M_WRITE: begin
                    if (scl_wait_high && !scl_in) begin
                        // Clock stretching / clock synchronization
                    end else if (tick) begin
                        case (phase)
                            2'd0: begin
                                // SCL is low. Setup SDA bit.
                                scl_oe <= 1'b1;
                                if (bit_cnt < 8) begin
                                    // Send MSB
                                    sda_oe <= (shift_reg[7] == 1'b0) ? 1'b1 : 1'b0;
                                end else begin
                                    // Release SDA for Slave ACK
                                    sda_oe <= 1'b0;
                                end
                                phase <= 2'd1;
                            end

                            2'd1: begin
                                // Release SCL high
                                scl_oe        <= 1'b0;
                                scl_wait_high <= 1'b1;
                                phase         <= 2'd2;
                            end

                            2'd2: begin
                                scl_wait_high <= 1'b0;
                                if (bit_cnt < 8) begin
                                    // ARBITRATION DETECTION:
                                    // If we released SDA (wanted 1) but line is driven 0:
                                    if (sda_oe == 1'b0 && sda_in == 1'b0) begin
                                        // LOST ARBITRATION!
                                        status_arb_lost <= 1'b1;
                                        bus_owned       <= 1'b0;
                                        status_tip      <= 1'b0;
                                        // Immediately release lines
                                        sda_oe          <= 1'b0;
                                        scl_oe          <= 1'b0;
                                        state           <= M_IDLE;
                                    end else begin
                                        phase <= 2'd3;
                                    end
                                end else begin
                                    // Sample Slave ACK
                                    status_rx_nack <= sda_in;
                                    phase          <= 2'd3;
                                end
                            end

                            2'd3: begin
                                // Pull SCL low
                                scl_oe <= 1'b1;
                                if (bit_cnt < 8) begin
                                    shift_reg <= {shift_reg[6:0], 1'b0};
                                    bit_cnt   <= bit_cnt + 1;
                                    phase     <= 2'd0;
                                end else begin
                                    // Finished 8 data bits + ACK
                                    status_tip <= 1'b0;
                                    state      <= M_IDLE;
                                end
                            end
                        endcase
                    end
                end

                // ------------------------------------------------------------
                // READ: 8 Bits from Slave + 1 Master ACK/NACK
                // ------------------------------------------------------------
                M_READ: begin
                    if (scl_wait_high && !scl_in) begin
                        // Clock stretching
                    end else if (tick) begin
                        case (phase)
                            2'd0: begin
                                scl_oe <= 1'b1;
                                if (bit_cnt < 8) begin
                                    // Release SDA to receive bit from slave
                                    sda_oe <= 1'b0;
                                end else begin
                                    // Drive Master ACK (pull low) or NACK (release high)
                                    sda_oe <= (read_ack_bit == 1'b0) ? 1'b1 : 1'b0;
                                end
                                phase <= 2'd1;
                            end

                            2'd1: begin
                                // Release SCL high
                                scl_oe        <= 1'b0;
                                scl_wait_high <= 1'b1;
                                phase         <= 2'd2;
                            end

                            2'd2: begin
                                scl_wait_high <= 1'b0;
                                if (bit_cnt < 8) begin
                                    rx_shift <= {rx_shift[6:0], sda_in};
                                end
                                phase <= 2'd3;
                            end

                            2'd3: begin
                                scl_oe <= 1'b1;
                                if (bit_cnt < 8) begin
                                    bit_cnt <= bit_cnt + 1;
                                    phase   <= 2'd0;
                                end else begin
                                    // Finished read
                                    sda_oe      <= 1'b0;
                                    rx_data_reg <= rx_shift;
                                    status_tip  <= 1'b0;
                                    state       <= M_IDLE;
                                end
                            end
                        endcase
                    end
                end

                // ------------------------------------------------------------
                // STOP: Pull SDA Low, Release SCL, Release SDA High
                // ------------------------------------------------------------
                M_STOP: begin
                    if (scl_wait_high && !scl_in) begin
                        // Clock stretching
                    end else if (tick) begin
                        case (phase)
                            2'd0: begin
                                // SCL low, pull SDA low
                                scl_oe <= 1'b1;
                                sda_oe <= 1'b1;
                                phase  <= 2'd1;
                            end
                            2'd1: begin
                                // Release SCL high
                                scl_oe        <= 1'b0;
                                scl_wait_high <= 1'b1;
                                phase         <= 2'd2;
                            end
                            2'd2: begin
                                scl_wait_high <= 1'b0;
                                // Release SDA high while SCL is high (STOP condition!)
                                sda_oe <= 1'b0;
                                phase  <= 2'd3;
                            end
                            2'd3: begin
                                bus_owned  <= 1'b0;
                                status_tip <= 1'b0;
                                state      <= M_IDLE;
                            end
                        endcase
                    end
                end

                default: state <= M_IDLE;
            endcase
        end
    end

endmodule
