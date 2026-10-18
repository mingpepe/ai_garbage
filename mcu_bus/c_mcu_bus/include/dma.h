#ifndef MCU_DMA_H
#define MCU_DMA_H

#include "common.h"
#include "bus.h"

typedef enum {
    DMA_STATE_IDLE = 0,
    DMA_STATE_WAIT_REQ,
    DMA_STATE_REQ_SRC,
    DMA_STATE_READ_LATCH,
    DMA_STATE_REQ_DST,
    DMA_STATE_WRITE_COMMIT,
    DMA_STATE_UPDATE,
    DMA_STATE_COMPLETE
} dma_state_t;

const char *dma_state_to_string(dma_state_t state);

typedef struct {
    /* Architectural Registers (Memory Mapped) */
    uint32_t isr;    /* Interrupt Status: GIF, TCIF, HTIF, TEIF */
    uint32_t ccr;    /* Control Register */
    uint32_t cndtr;  /* Number of Data to Transfer */
    uint32_t cpar;   /* Peripheral / Source Address */
    uint32_t cmar;   /* Memory / Destination Address */
    
    /* Internal Shadow / Hardware Pipeline Registers */
    uint32_t cndtr_reload;
    uint32_t cpar_orig;
    uint32_t cmar_orig;
    uint8_t  data_latch;      /* Internal holding latch */
    dma_state_t state;
    
    /* Hardware Handshake Inputs */
    bool rx_req_line;        /* DREQ from UART RX */
    bool tx_req_line;        /* DREQ from I2C TX */
    
    /* Hardware Handshake Output */
    bool irq_line;           /* IRQ to NVIC */
    
    /* Telemetry / UI Inspection */
    uint32_t total_transferred;
    uint32_t bus_stalls;
    char last_event_msg[128];
} dma_controller_t;

void dma_init(dma_controller_t *dma);
void dma_configure(dma_controller_t *dma, uint32_t src_addr, uint32_t dst_addr, 
                   uint32_t count, uint32_t dir_mode, bool circ, bool pinc, bool minc, int priority);
void dma_start(dma_controller_t *dma);
void dma_stop(dma_controller_t *dma);

/* Bus cycle phase 1: DMA requests bus if needed */
void dma_prepare_bus_request(dma_controller_t *dma, bus_arbiter_t *bus);

/* Bus cycle phase 2: DMA processes granted transaction */
void dma_on_bus_granted(dma_controller_t *dma, const bus_transaction_t *trans);

/* Bus cycle phase 3: DMA updates internal state and handshakes */
void dma_tick_handshake(dma_controller_t *dma, bool rx_req, bool tx_req);

uint32_t dma_read_reg(dma_controller_t *dma, uint32_t offset);
void dma_write_reg(dma_controller_t *dma, uint32_t offset, uint32_t value);

#endif /* MCU_DMA_H */
