#ifndef MCU_I2C_H
#define MCU_I2C_H

#include "common.h"

typedef struct {
    uint32_t cr;
    uint32_t sr;
    
    uint8_t tx_fifo[16];
    uint32_t fifo_head;
    uint32_t fifo_tail;
    uint32_t fifo_count;
    uint32_t fifo_capacity;
    
    int cycles_per_byte;
    int shift_counter;
    bool is_transmitting;
    uint8_t shift_byte;
    
    /* Hardware handshake lines */
    bool dma_req_tx;  /* DREQ to DMA */
    bool irq_txe;     /* IRQ line to NVIC */
    
    /* Wire output history */
    uint8_t last_wire_byte;
    bool wire_active;
    uint32_t total_transmitted;
} i2c_t;

void i2c_init(i2c_t *i2c, uint32_t fifo_capacity, int cycles_per_byte);
void i2c_tick(i2c_t *i2c);

uint32_t i2c_read_reg(i2c_t *i2c, uint32_t offset);
void i2c_write_reg(i2c_t *i2c, uint32_t offset, uint32_t value);

#endif /* MCU_I2C_H */
