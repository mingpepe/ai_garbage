`timescale 1ns / 1ps

// ============================================================================
// I2C Slave Memory
//
// Protocol Supported:
//   Random Read:
//     S -> [ID + W] -> ACK -> [Reg Addr (7-bit)] -> ACK ->
//     S -> [ID + R] -> ACK -> [Data (8-bit)] -> NACK/ACK -> P
//
//   Normal Write:
//     S -> [ID + W] -> ACK -> [Reg Addr (7-bit)] -> ACK ->
//     [Data (8-bit)] -> ACK -> P
//
// Internal Memory:
//   128 bytes (indexed by 7-bit address 0x00 .. 0x7F).
// ============================================================================
module i2c_slave_mem #(
    parameter [6:0] SLAVE_ADDR = 7'h50,
    parameter       MEM_SIZE   = 128
)(
    input  wire        clk,
    input  wire        rst_n,

    // I2C Open-Drain Bus Interface
    input  wire        scl_in,
    output wire        scl_oe,      // 0 = no clock stretching
    input  wire        sda_in,
    output reg         sda_oe,      // 1 = pull low (0), 0 = release (1)

    // Waveform Debug Outputs
    output wire [3:0]  dbg_slave_state,
    output wire [6:0]  dbg_slave_reg_addr,
    output wire [7:0]  dbg_slave_data
);

    assign scl_oe = 1'b0; // No clock stretching needed

    // ------------------------------------------------------------------------
    // 1. Bus Edge Detection
    // ------------------------------------------------------------------------
    reg scl_d, sda_d;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            scl_d <= 1'b1;
            sda_d <= 1'b1;
        end else begin
            scl_d <= scl_in;
            sda_d <= sda_in;
        end
    end

    wire scl_rising  =  scl_in && !scl_d;
    wire scl_falling = !scl_in &&  scl_d;
    wire bus_start   =  scl_in &&  scl_d && (!sda_in &&  sda_d);
    wire bus_stop    =  scl_in &&  scl_d && ( sda_in && !sda_d);

    // ------------------------------------------------------------------------
    // 2. Internal Memory (128 bytes)
    // ------------------------------------------------------------------------
    reg [7:0] mem [0:MEM_SIZE-1];
    reg [6:0] reg_addr;

    integer i;
    initial begin
        for (i = 0; i < MEM_SIZE; i = i + 1) begin
            mem[i] = 8'h00;
        end
        // Initial test pattern
        mem[7'h10] = 8'hAA;
        mem[7'h20] = 8'h55;
        mem[7'h30] = 8'hC3;
        mem[7'h40] = 8'h5A;
    end

    assign dbg_slave_reg_addr = reg_addr;
    assign dbg_slave_data     = mem[reg_addr];

    // ------------------------------------------------------------------------
    // 3. Slave State Machine
    // ------------------------------------------------------------------------
    localparam [3:0] S_IDLE       = 4'd0,
                     S_ADDR       = 4'd1,
                     S_ADDR_ACK   = 4'd2,
                     S_REG_ADDR   = 4'd3,
                     S_REG_ACK    = 4'd4,
                     S_WRITE_DATA = 4'd5,
                     S_WRITE_ACK  = 4'd6,
                     S_READ_DATA  = 4'd7,
                     S_READ_ACK   = 4'd8;

    reg [3:0] state;
    assign dbg_slave_state = state;

    reg [3:0] bit_cnt;
    reg [7:0] rx_shift;
    reg [7:0] tx_shift;
    reg       rw_bit;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state    <= S_IDLE;
            bit_cnt  <= 4'd0;
            rx_shift <= 8'd0;
            tx_shift <= 8'd0;
            sda_oe   <= 1'b0;
            rw_bit   <= 1'b0;
            reg_addr <= 7'd0;
        end else if (bus_start) begin
            // START or REPEATED START
            state    <= S_ADDR;
            bit_cnt  <= 4'd0;
            sda_oe   <= 1'b0;
        end else if (bus_stop) begin
            state    <= S_IDLE;
            bit_cnt  <= 4'd0;
            sda_oe   <= 1'b0;
        end else begin
            case (state)
                S_IDLE: begin
                    sda_oe <= 1'b0;
                end

                // ------------------------------------------------------------
                // S_ADDR: Receive 7-bit Slave Address + 1-bit R/W
                // ------------------------------------------------------------
                S_ADDR: begin
                    if (scl_rising) begin
                        rx_shift <= {rx_shift[6:0], sda_in};
                        bit_cnt  <= bit_cnt + 1;
                    end else if (scl_falling && bit_cnt == 4'd8) begin
                        // 8 bits received: check if matches SLAVE_ADDR
                        if (rx_shift[7:1] == SLAVE_ADDR) begin
                            rw_bit  <= rx_shift[0];
                            sda_oe  <= 1'b1; // Send ACK (pull low)
                            state   <= S_ADDR_ACK;
                        end else begin
                            state   <= S_IDLE;
                        end
                        bit_cnt <= 4'd0;
                    end
                end

                // ------------------------------------------------------------
                // S_ADDR_ACK: Complete ACK for address phase
                // ------------------------------------------------------------
                S_ADDR_ACK: begin
                    if (scl_falling) begin
                        sda_oe  <= 1'b0; // Release ACK
                        bit_cnt <= 4'd0;
                        if (rw_bit == 1'b0) begin
                            // Write: next byte is Register Address
                            state <= S_REG_ADDR;
                        end else begin
                            // Read: load data from memory and begin sending
                            tx_shift <= mem[reg_addr];
                            sda_oe   <= (mem[reg_addr][7] == 1'b0) ? 1'b1 : 1'b0;
                            state    <= S_READ_DATA;
                        end
                    end
                end

                // ------------------------------------------------------------
                // S_REG_ADDR: Receive 7-bit Register Address
                // ------------------------------------------------------------
                S_REG_ADDR: begin
                    if (scl_rising) begin
                        rx_shift <= {rx_shift[6:0], sda_in};
                        bit_cnt  <= bit_cnt + 1;
                    end else if (scl_falling && bit_cnt == 4'd8) begin
                        reg_addr <= rx_shift[6:0];
                        sda_oe   <= 1'b1; // Send ACK
                        bit_cnt  <= 4'd0;
                        state    <= S_REG_ACK;
                    end
                end

                // ------------------------------------------------------------
                // S_REG_ACK: Complete ACK for register address
                // ------------------------------------------------------------
                S_REG_ACK: begin
                    if (scl_falling) begin
                        sda_oe  <= 1'b0; // Release ACK
                        bit_cnt <= 4'd0;
                        // Master can either write data or issue Repeated START
                        state   <= S_WRITE_DATA;
                    end
                end

                // ------------------------------------------------------------
                // S_WRITE_DATA: Receive data byte to write into memory
                // ------------------------------------------------------------
                S_WRITE_DATA: begin
                    if (scl_rising) begin
                        rx_shift <= {rx_shift[6:0], sda_in};
                        bit_cnt  <= bit_cnt + 1;
                    end else if (scl_falling && bit_cnt == 4'd8) begin
                        mem[reg_addr] <= rx_shift;
                        reg_addr      <= reg_addr + 1;
                        sda_oe        <= 1'b1; // Send ACK
                        bit_cnt       <= 4'd0;
                        state         <= S_WRITE_ACK;
                    end
                end

                // ------------------------------------------------------------
                // S_WRITE_ACK: Release ACK after write data byte
                // ------------------------------------------------------------
                S_WRITE_ACK: begin
                    if (scl_falling) begin
                        sda_oe  <= 1'b0;
                        bit_cnt <= 4'd0;
                        state   <= S_WRITE_DATA; // Ready for next byte or STOP
                    end
                end

                // ------------------------------------------------------------
                // S_READ_DATA: Transmit 8 bits of memory data to Master
                // ------------------------------------------------------------
                S_READ_DATA: begin
                    if (scl_falling) begin
                        if (bit_cnt < 4'd7) begin
                            sda_oe   <= (tx_shift[6] == 1'b0) ? 1'b1 : 1'b0;
                            tx_shift <= {tx_shift[6:0], 1'b0};
                            bit_cnt  <= bit_cnt + 1;
                        end else begin
                            // Release SDA for Master ACK/NACK
                            sda_oe  <= 1'b0;
                            bit_cnt <= 4'd0;
                            state   <= S_READ_ACK;
                        end
                    end
                end

                // ------------------------------------------------------------
                // S_READ_ACK: Sample Master ACK/NACK
                // ------------------------------------------------------------
                S_READ_ACK: begin
                    if (scl_rising) begin
                        // Master sampled data; if SDA is high -> NACK (end of read)
                        if (sda_in == 1'b1) begin
                            // NACK: master wants to stop
                            state <= S_IDLE;
                        end else begin
                            // ACK: master wants more bytes
                            reg_addr <= reg_addr + 1;
                            state    <= S_READ_DATA;
                            tx_shift <= mem[reg_addr + 1];
                        end
                    end
                end

                default: state <= S_IDLE;
            endcase
        end
    end

endmodule
