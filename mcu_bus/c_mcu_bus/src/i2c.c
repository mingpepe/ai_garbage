#include "../include/i2c.h"
#include <stdio.h>
#include <string.h>

void i2c_init(i2c_t *i2c, uint32_t fifo_capacity, int cycles_per_byte) {
    if (!i2c) return;
    memset(i2c, 0, sizeof(i2c_t));
    i2c->fifo_capacity = (fifo_capacity > 0 && fifo_capacity <= 16) ? fifo_capacity : 4;
    i2c->cycles_per_byte = (cycles_per_byte > 0) ? cycles_per_byte : 4;
    i2c->cr = I2C_CR_PE | I2C_CR_DMATXEN;
    i2c->sr = I2C_SR_TXE;
    i2c->dma_req_tx = true; /* FIFO is empty initially, ready for TX */
    i2c->irq_txe = false;
    i2c->shift_counter = 0;
    i2c->is_transmitting = false;
}

void i2c_tick(i2c_t *i2c) {
    if (!i2c) return;
    
    /* Simulate hardware serial transmission engine */
    if (i2c->is_transmitting) {
        i2c->shift_counter++;
        if (i2c->shift_counter >= i2c->cycles_per_byte) {
            /* Completed sending 1 byte over the wire */
            i2c->is_transmitting = false;
            i2c->shift_counter = 0;
            i2c->total_transmitted++;
            i2c->last_wire_byte = i2c->shift_byte;
            i2c->wire_active = false;
            printf("  [I2C] >>> WIRE TRANSMIT COMPLETE: 0x%02X ('%c') [Total: %u]\n",
                   i2c->shift_byte, 
                   (i2c->shift_byte >= 32 && i2c->shift_byte <= 126) ? i2c->shift_byte : '.',
                   i2c->total_transmitted);
        }
    }
    
    /* If transmitter is idle and FIFO has pending data, load shifter */
    if (!i2c->is_transmitting && i2c->fifo_count > 0) {
        i2c->shift_byte = i2c->tx_fifo[i2c->fifo_head];
        i2c->fifo_head = (i2c->fifo_head + 1) % i2c->fifo_capacity;
        i2c->fifo_count--;
        i2c->is_transmitting = true;
        i2c->shift_counter = 0;
        i2c->wire_active = true;
    }
    
    /* Update status flags */
    bool can_accept = (i2c->fifo_count < i2c->fifo_capacity);
    i2c->sr = (can_accept ? I2C_SR_TXE : 0) | (i2c->is_transmitting ? I2C_SR_BUSY : 0);
    i2c->dma_req_tx = can_accept && (i2c->cr & I2C_CR_DMATXEN);
    
    if (i2c->cr & I2C_CR_TXEIE) {
        i2c->irq_txe = can_accept;
    }
}

uint32_t i2c_read_reg(i2c_t *i2c, uint32_t offset) {
    if (!i2c) return 0;
    switch (offset) {
        case I2C_REG_CR:
            return i2c->cr;
        case I2C_REG_SR:
            return i2c->sr;
        case I2C_REG_CNT:
            return i2c->fifo_count;
        default:
            return 0;
    }
}

void i2c_write_reg(i2c_t *i2c, uint32_t offset, uint32_t value) {
    if (!i2c) return;
    switch (offset) {
        case I2C_REG_CR:
            i2c->cr = value;
            i2c->dma_req_tx = (i2c->fifo_count < i2c->fifo_capacity) && (i2c->cr & I2C_CR_DMATXEN);
            break;
        case I2C_REG_DR: {
            if (i2c->fifo_count >= i2c->fifo_capacity) {
                printf("  [I2C] >>> ERROR: TX FIFO OVERFLOW! Dropping byte 0x%02X\n", (uint8_t)value);
                return;
            }
            uint8_t byte = (uint8_t)(value & 0xFF);
            i2c->tx_fifo[i2c->fifo_tail] = byte;
            i2c->fifo_tail = (i2c->fifo_tail + 1) % i2c->fifo_capacity;
            i2c->fifo_count++;
            
            bool can_accept = (i2c->fifo_count < i2c->fifo_capacity);
            i2c->sr = (can_accept ? I2C_SR_TXE : 0) | (i2c->is_transmitting ? I2C_SR_BUSY : 0);
            i2c->dma_req_tx = can_accept && (i2c->cr & I2C_CR_DMATXEN);
            printf("  [I2C] TX FIFO <= 0x%02X (FIFO: %u/%u, DMATxReq=%d)\n",
                   byte, i2c->fifo_count, i2c->fifo_capacity, i2c->dma_req_tx);
            break;
        }
        default:
            break;
    }
}
