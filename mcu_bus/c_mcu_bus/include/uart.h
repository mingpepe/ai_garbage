#ifndef MCU_UART_H
#define MCU_UART_H

#include "common.h"

#define UART_MAX_SCHEDULED 64

typedef struct {
    int cycle;
    uint8_t data;
} uart_scheduled_item_t;

typedef struct {
    uint32_t cr;
    uint32_t sr;
    
    uint8_t rx_fifo[16];
    uint32_t fifo_head;
    uint32_t fifo_tail;
    uint32_t fifo_count;
    uint32_t fifo_capacity;
    
    /* Hardware handshake lines */
    bool dma_req_rx;  /* DREQ to DMA */
    bool irq_rxne;    /* IRQ line to NVIC */
    bool irq_ore;     /* Overrun IRQ line to NVIC */
    
    /* Scheduled inputs */
    uart_scheduled_item_t scheduled[UART_MAX_SCHEDULED];
    int scheduled_count;
} uart_t;

void uart_init(uart_t *uart, uint32_t fifo_capacity);
void uart_schedule_receive(uart_t *uart, int cycle, uint8_t data);
void uart_inject_rx(uart_t *uart, uint8_t data);
void uart_tick(uart_t *uart, int cycle);

uint32_t uart_read_reg(uart_t *uart, uint32_t offset);
void uart_write_reg(uart_t *uart, uint32_t offset, uint32_t value);

#endif /* MCU_UART_H */
