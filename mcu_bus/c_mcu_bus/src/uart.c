#include "../include/uart.h"
#include <stdio.h>
#include <string.h>

void uart_init(uart_t *uart, uint32_t fifo_capacity) {
    if (!uart) return;
    memset(uart, 0, sizeof(uart_t));
    uart->fifo_capacity = (fifo_capacity > 0 && fifo_capacity <= 16) ? fifo_capacity : 8;
    uart->cr = UART_CR_UE | UART_CR_DMARXEN; /* Enabled, DMA RX enabled */
    uart->sr = 0;
    uart->dma_req_rx = false;
    uart->irq_rxne = false;
    uart->irq_ore = false;
}

void uart_schedule_receive(uart_t *uart, int cycle, uint8_t data) {
    if (!uart || uart->scheduled_count >= UART_MAX_SCHEDULED) return;
    uart->scheduled[uart->scheduled_count].cycle = cycle;
    uart->scheduled[uart->scheduled_count].data = data;
    uart->scheduled_count++;
}

void uart_inject_rx(uart_t *uart, uint8_t data) {
    if (!uart) return;
    if (uart->fifo_count >= uart->fifo_capacity) {
        /* Overrun */
        uart->sr |= UART_SR_ORE;
        uart->irq_ore = true;
        printf("  [UART] >>> RX OVERRUN! Byte 0x%02X dropped (FIFO full %u/%u)\n", 
               data, uart->fifo_count, uart->fifo_capacity);
        return;
    }
    
    uart->rx_fifo[uart->fifo_tail] = data;
    uart->fifo_tail = (uart->fifo_tail + 1) % uart->fifo_capacity;
    uart->fifo_count++;
    
    uart->sr |= UART_SR_RXNE;
    if (uart->cr & UART_CR_RXNEIE) {
        uart->irq_rxne = true;
    }
    if (uart->cr & UART_CR_DMARXEN) {
        uart->dma_req_rx = true;
    }
    printf("  [UART] RX <= 0x%02X (FIFO: %u/%u, DMAReq=%d)\n", 
           data, uart->fifo_count, uart->fifo_capacity, uart->dma_req_rx);
}

void uart_tick(uart_t *uart, int cycle) {
    if (!uart) return;
    for (int i = 0; i < uart->scheduled_count; i++) {
        if (uart->scheduled[i].cycle == cycle) {
            uart_inject_rx(uart, uart->scheduled[i].data);
            /* remove item */
            for (int j = i; j < uart->scheduled_count - 1; j++) {
                uart->scheduled[j] = uart->scheduled[j + 1];
            }
            uart->scheduled_count--;
            i--;
        }
    }
    
    /* Keep hardware handshake line in sync */
    uart->dma_req_rx = (uart->fifo_count > 0) && (uart->cr & UART_CR_DMARXEN);
    uart->sr = (uart->fifo_count > 0 ? UART_SR_RXNE : 0) | (uart->sr & UART_SR_ORE);
}

uint32_t uart_read_reg(uart_t *uart, uint32_t offset) {
    if (!uart) return 0;
    switch (offset) {
        case UART_REG_CR:
            return uart->cr;
        case UART_REG_SR:
            return uart->sr;
        case UART_REG_DR: {
            if (uart->fifo_count == 0) {
                return 0;
            }
            uint8_t byte = uart->rx_fifo[uart->fifo_head];
            uart->fifo_head = (uart->fifo_head + 1) % uart->fifo_capacity;
            uart->fifo_count--;
            if (uart->fifo_count == 0) {
                uart->sr &= ~UART_SR_RXNE;
                uart->dma_req_rx = false;
                uart->irq_rxne = false;
            }
            return byte;
        }
        case UART_REG_CNT:
            return uart->fifo_count;
        default:
            return 0;
    }
}

void uart_write_reg(uart_t *uart, uint32_t offset, uint32_t value) {
    if (!uart) return;
    switch (offset) {
        case UART_REG_CR:
            uart->cr = value;
            uart->dma_req_rx = (uart->fifo_count > 0) && (uart->cr & UART_CR_DMARXEN);
            break;
        case UART_REG_SR:
            /* Write to clear ORE */
            if (!(value & UART_SR_ORE)) {
                uart->sr &= ~UART_SR_ORE;
                uart->irq_ore = false;
            }
            break;
        default:
            break;
    }
}
