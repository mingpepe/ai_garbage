#ifndef I2C_H
#define I2C_H

#include <stdint.h>
#include "soc_mmap.h"

// ============================================================================
// I2C Controller MMIO Register Offsets
// ============================================================================
#define I2C_OFFSET_CTRL         0x00UL
#define I2C_OFFSET_STATUS       0x04UL
#define I2C_OFFSET_TX           0x08UL
#define I2C_OFFSET_RX           0x0CUL
#define I2C_OFFSET_DIV          0x10UL

#define I2C_REG_CTRL(base)      (*(volatile uint32_t *)((base) + I2C_OFFSET_CTRL))
#define I2C_REG_STATUS(base)    (*(volatile uint32_t *)((base) + I2C_OFFSET_STATUS))
#define I2C_REG_TX(base)        (*(volatile uint32_t *)((base) + I2C_OFFSET_TX))
#define I2C_REG_RX(base)        (*(volatile uint32_t *)((base) + I2C_OFFSET_RX))
#define I2C_REG_DIV(base)       (*(volatile uint32_t *)((base) + I2C_OFFSET_DIV))

// Command bits (written to I2C_REG_CTRL)
#define I2C_CMD_START           (1UL << 0)
#define I2C_CMD_STOP            (1UL << 1)
#define I2C_CMD_WRITE           (1UL << 2)
#define I2C_CMD_READ_ACK        (1UL << 3)
#define I2C_CMD_READ_NACK       (1UL << 4)

// Status bits (read from I2C_REG_STATUS)
#define I2C_STATUS_TIP           (1UL << 0) // Transfer in progress
#define I2C_STATUS_BUS_BUSY      (1UL << 1) // I2C Bus is busy (START without STOP)
#define I2C_STATUS_BUS_OWNED     (1UL << 2) // This master owns the bus
#define I2C_STATUS_ARB_LOST      (1UL << 3) // Arbitration lost
#define I2C_STATUS_RX_NACK       (1UL << 4) // NACK received from slave
#define I2C_STATUS_START_BLOCKED (1UL << 5) // START blocked due to bus busy and unowned

// Default Slave Address
#define I2C_SLAVE_ADDR_DEFAULT  0x50U

static inline void i2c_init(uint32_t base, uint8_t clk_div) {
    I2C_REG_DIV(base) = (uint32_t)clk_div;
}

static inline uint32_t i2c_get_status(uint32_t base) {
    return I2C_REG_STATUS(base);
}

static inline void i2c_wait_ready(uint32_t base) {
    while (I2C_REG_STATUS(base) & I2C_STATUS_TIP) {
        // Wait for controller command to complete
    }
}

static inline int i2c_is_bus_busy(uint32_t base) {
    return (I2C_REG_STATUS(base) & I2C_STATUS_BUS_BUSY) ? 1 : 0;
}

static inline void i2c_clear_flags(uint32_t base) {
    I2C_REG_STATUS(base) = (I2C_STATUS_ARB_LOST | I2C_STATUS_START_BLOCKED);
}

// Send START condition (or Repeated START if bus is owned)
// Returns 0 on success, -1 on arbitration lost or start blocked
static inline int i2c_send_start(uint32_t base) {
    I2C_REG_CTRL(base) = I2C_CMD_START;
    i2c_wait_ready(base);
    uint32_t st = I2C_REG_STATUS(base);
    if (st & (I2C_STATUS_ARB_LOST | I2C_STATUS_START_BLOCKED)) {
        return -1;
    }
    return 0;
}

// Send STOP condition
static inline void i2c_send_stop(uint32_t base) {
    I2C_REG_CTRL(base) = I2C_CMD_STOP;
    i2c_wait_ready(base);
}

// Transmit 1 byte and receive ACK/NACK
// Returns: 0 on ACK, 1 on NACK, -1 on arbitration lost
static inline int i2c_write_byte(uint32_t base, uint8_t byte) {
    I2C_REG_TX(base) = (uint32_t)byte;
    I2C_REG_CTRL(base) = I2C_CMD_WRITE;
    i2c_wait_ready(base);
    uint32_t st = I2C_REG_STATUS(base);
    if (st & I2C_STATUS_ARB_LOST) {
        return -1; // Lost arbitration during address or data transmission
    }
    return (st & I2C_STATUS_RX_NACK) ? 1 : 0;
}

// Read 1 byte and send ACK (send_ack=1) or NACK (send_ack=0)
static inline uint8_t i2c_read_byte(uint32_t base, int send_ack) {
    I2C_REG_CTRL(base) = send_ack ? I2C_CMD_READ_ACK : I2C_CMD_READ_NACK;
    i2c_wait_ready(base);
    return (uint8_t)(I2C_REG_RX(base) & 0xFFUL);
}

// Protocol required by user:
// S id write address(7 bit) S id read data(8bit) P
// Returns 0 on success, -1 on arbitration lost or bus busy block
static inline int i2c_read_slave_reg(uint32_t base, uint8_t slave_id, uint8_t reg_addr, uint8_t *val) {
    // 1. S (START)
    if (i2c_send_start(base) < 0) {
        return -1;
    }

    // 2. id write (7-bit slave address + write bit 0)
    int ack = i2c_write_byte(base, (uint8_t)((slave_id << 1) | 0x00));
    if (ack < 0) {
        return -1; // Arbitration lost!
    }

    // 3. address (7 bit)
    ack = i2c_write_byte(base, (uint8_t)(reg_addr & 0x7F));
    if (ack < 0) {
        return -1; // Arbitration lost!
    }

    // 4. S (Repeated START) - Allowed because bus is owned!
    if (i2c_send_start(base) < 0) {
        return -1;
    }

    // 5. id read (7-bit slave address + read bit 1)
    ack = i2c_write_byte(base, (uint8_t)((slave_id << 1) | 0x01));
    if (ack < 0) {
        return -1; // Arbitration lost!
    }

    // 6. data (8 bit) - send NACK to terminate 1-byte read
    *val = i2c_read_byte(base, 0);

    // 7. P (STOP)
    i2c_send_stop(base);

    return 0;
}

// Write to slave register:
// S id write address(7 bit) data(8bit) P
static inline int i2c_write_slave_reg(uint32_t base, uint8_t slave_id, uint8_t reg_addr, uint8_t val) {
    if (i2c_send_start(base) < 0) {
        return -1;
    }
    if (i2c_write_byte(base, (uint8_t)((slave_id << 1) | 0x00)) < 0) {
        return -1;
    }
    if (i2c_write_byte(base, (uint8_t)(reg_addr & 0x7F)) < 0) {
        return -1;
    }
    if (i2c_write_byte(base, val) < 0) {
        return -1;
    }
    i2c_send_stop(base);
    return 0;
}

#endif // I2C_H
