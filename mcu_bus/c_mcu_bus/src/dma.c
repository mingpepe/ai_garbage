#include "../include/dma.h"
#include <stdio.h>
#include <string.h>

const char *dma_state_to_string(dma_state_t state) {
    switch (state) {
        case DMA_STATE_IDLE:         return "IDLE";
        case DMA_STATE_WAIT_REQ:     return "WAIT_REQ";
        case DMA_STATE_REQ_SRC:      return "REQ_SRC_BUS";
        case DMA_STATE_READ_LATCH:   return "READ_LATCH";
        case DMA_STATE_REQ_DST:      return "REQ_DST_BUS";
        case DMA_STATE_WRITE_COMMIT: return "WRITE_COMMIT";
        case DMA_STATE_UPDATE:       return "UPDATE_NDTR";
        case DMA_STATE_COMPLETE:     return "COMPLETE";
        default:                     return "UNKNOWN";
    }
}

void dma_init(dma_controller_t *dma) {
    if (!dma) return;
    memset(dma, 0, sizeof(dma_controller_t));
    dma->state = DMA_STATE_IDLE;
    snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), "DMA Initialized");
}

void dma_configure(dma_controller_t *dma, uint32_t src_addr, uint32_t dst_addr, 
                   uint32_t count, uint32_t dir_mode, bool circ, bool pinc, bool minc, int priority) {
    if (!dma) return;
    
    dma->cpar = src_addr;
    dma->cpar_orig = src_addr;
    dma->cmar = dst_addr;
    dma->cmar_orig = dst_addr;
    dma->cndtr = count;
    dma->cndtr_reload = count;
    
    dma->ccr = DMA_CCR_TCIE | DMA_CCR_TEIE;
    dma->ccr |= (dir_mode & DMA_CCR_DIR_MASK);
    if (circ) dma->ccr |= DMA_CCR_CIRC;
    if (pinc) dma->ccr |= DMA_CCR_PINC;
    if (minc) dma->ccr |= DMA_CCR_MINC;
    dma->ccr |= ((priority & 3) << 9);
    
    dma->state = DMA_STATE_IDLE;
    snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), 
             "Configured: 0x%08X -> 0x%08X (Count: %u, Dir: 0x%02X)", 
             src_addr, dst_addr, count, dir_mode);
}

void dma_start(dma_controller_t *dma) {
    if (!dma) return;
    dma->ccr |= DMA_CCR_EN;
    dma->state = DMA_STATE_WAIT_REQ;
    snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), "DMA Started, CNDTR=%u", dma->cndtr);
}

void dma_stop(dma_controller_t *dma) {
    if (!dma) return;
    dma->ccr &= ~DMA_CCR_EN;
    dma->state = DMA_STATE_IDLE;
    snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), "DMA Stopped by software");
}

void dma_tick_handshake(dma_controller_t *dma, bool rx_req, bool tx_req) {
    if (!dma) return;
    dma->rx_req_line = rx_req;
    dma->tx_req_line = tx_req;
    
    if (!(dma->ccr & DMA_CCR_EN)) {
        if (dma->state != DMA_STATE_COMPLETE) {
            dma->state = DMA_STATE_IDLE;
        }
        return;
    }
    
    if (dma->state == DMA_STATE_WAIT_REQ) {
        uint32_t dir = dma->ccr & DMA_CCR_DIR_MASK;
        bool ready = false;
        
        if (dir == DMA_CCR_DIR_P2P) {
            /* Peripheral to Peripheral: e.g. UART RX -> I2C TX. Requires both ready */
            ready = dma->rx_req_line && dma->tx_req_line;
        } else if (dir == DMA_CCR_DIR_P2M) {
            /* Peripheral to Memory: UART RX -> SRAM. Requires UART RXNE */
            ready = dma->rx_req_line;
        } else if (dir == DMA_CCR_DIR_M2P) {
            /* Memory to Peripheral: SRAM -> I2C TX. Requires I2C TXE */
            ready = dma->tx_req_line;
        }
        
        if (ready) {
            dma->state = DMA_STATE_REQ_SRC;
            snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), 
                     "DREQ Asserted -> Requesting Bus for Source Read");
        }
    }
}

void dma_prepare_bus_request(dma_controller_t *dma, bus_arbiter_t *bus) {
    if (!dma || !bus) return;
    if (!(dma->ccr & DMA_CCR_EN)) return;
    
    int priority = (int)((dma->ccr & DMA_CCR_PL_MASK) >> 9);
    /* In our arbiter, lower number = higher priority; map 3 (very high) to 0, 0 to 3 */
    int mapped_prio = 3 - priority;
    
    if (dma->state == DMA_STATE_REQ_SRC) {
        uint32_t src_addr = ((dma->ccr & DMA_CCR_DIR_MASK) == DMA_CCR_DIR_M2P) ? dma->cmar : dma->cpar;
        bus_request_dma(bus, src_addr, false, 0, mapped_prio, "DMA Read Source");
    } else if (dma->state == DMA_STATE_REQ_DST) {
        uint32_t dst_addr = ((dma->ccr & DMA_CCR_DIR_MASK) == DMA_CCR_DIR_M2P) ? dma->cpar : dma->cmar;
        bus_request_dma(bus, dst_addr, true, dma->data_latch, mapped_prio, "DMA Write Destination");
    }
}

void dma_on_bus_granted(dma_controller_t *dma, const bus_transaction_t *trans) {
    if (!dma || !trans) return;
    
    if (trans->granted_master == BUS_MASTER_DMA) {
        if (dma->state == DMA_STATE_REQ_SRC) {
            /* Source read completed */
            dma->data_latch = (uint8_t)(trans->rdata & 0xFF);
            dma->state = DMA_STATE_REQ_DST;
            snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), 
                     "Source Read Latched: 0x%02X from 0x%08X", dma->data_latch, trans->addr);
        } else if (dma->state == DMA_STATE_REQ_DST) {
            /* Destination write completed */
            dma->state = DMA_STATE_UPDATE;
            snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), 
                     "Dest Write Done: 0x%02X to 0x%08X", dma->data_latch, trans->addr);
            
            /* Perform Update Phase immediately */
            dma->total_transferred++;
            if (dma->cndtr > 0) {
                dma->cndtr--;
            }
            
            /* Increment addresses if enabled */
            if (dma->ccr & DMA_CCR_PINC) {
                dma->cpar++;
            }
            if (dma->ccr & DMA_CCR_MINC) {
                dma->cmar++;
            }
            
            /* Check Half-Transfer */
            if (dma->cndtr_reload > 1 && dma->cndtr == (dma->cndtr_reload / 2)) {
                dma->isr |= DMA_FLAG_HTIF | DMA_FLAG_GIF;
                if (dma->ccr & DMA_CCR_HTIE) {
                    dma->irq_line = true;
                }
            }
            
            /* Check Transfer Complete */
            if (dma->cndtr == 0) {
                dma->isr |= DMA_FLAG_TCIF | DMA_FLAG_GIF;
                if (dma->ccr & DMA_CCR_TCIE) {
                    dma->irq_line = true;
                }
                
                if (dma->ccr & DMA_CCR_CIRC) {
                    /* Circular reload */
                    dma->cndtr = dma->cndtr_reload;
                    dma->cpar = dma->cpar_orig;
                    dma->cmar = dma->cmar_orig;
                    dma->state = DMA_STATE_WAIT_REQ;
                    snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), 
                             "Circular Reload (NDTR=%u)", dma->cndtr);
                } else {
                    dma->ccr &= ~DMA_CCR_EN;
                    dma->state = DMA_STATE_COMPLETE;
                    snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), 
                             "Transfer Complete! (TCIF asserted, IRQ=%d)", dma->irq_line);
                }
            } else {
                /* Next byte */
                dma->state = DMA_STATE_WAIT_REQ;
            }
        }
    } else {
        /* DMA wanted bus but was not granted (e.g. CPU won arbitration) */
        if (dma->state == DMA_STATE_REQ_SRC || dma->state == DMA_STATE_REQ_DST) {
            dma->bus_stalls++;
            snprintf(dma->last_event_msg, sizeof(dma->last_event_msg), 
                     "Bus Stalled (Contention with Master %d)", trans->granted_master);
        }
    }
}

uint32_t dma_read_reg(dma_controller_t *dma, uint32_t offset) {
    if (!dma) return 0;
    switch (offset) {
        case DMA_REG_ISR:   return dma->isr;
        case DMA_REG_CCR:   return dma->ccr;
        case DMA_REG_CNDTR: return dma->cndtr;
        case DMA_REG_CPAR:  return dma->cpar;
        case DMA_REG_CMAR:  return dma->cmar;
        default:            return 0;
    }
}

void dma_write_reg(dma_controller_t *dma, uint32_t offset, uint32_t value) {
    if (!dma) return;
    switch (offset) {
        case DMA_REG_IFCR:
            /* Write 1 to clear flags (bit 0 CGIF clears all channel flags) */
            if (value & DMA_FLAG_GIF) {
                dma->isr = 0;
                dma->irq_line = false;
            } else {
                dma->isr &= ~(value & 0x0F);
                if (!(dma->isr & (DMA_FLAG_TCIF | DMA_FLAG_HTIF | DMA_FLAG_TEIF))) {
                    dma->isr &= ~DMA_FLAG_GIF;
                    dma->irq_line = false;
                }
            }
            break;
        case DMA_REG_CCR: {
            bool was_en = (dma->ccr & DMA_CCR_EN) != 0;
            dma->ccr = value;
            bool is_en = (dma->ccr & DMA_CCR_EN) != 0;
            if (!was_en && is_en) {
                dma->state = DMA_STATE_WAIT_REQ;
            } else if (was_en && !is_en) {
                dma->state = DMA_STATE_IDLE;
            }
            break;
        }
        case DMA_REG_CNDTR:
            if (!(dma->ccr & DMA_CCR_EN)) {
                dma->cndtr = value;
                dma->cndtr_reload = value;
            }
            break;
        case DMA_REG_CPAR:
            if (!(dma->ccr & DMA_CCR_EN)) {
                dma->cpar = value;
                dma->cpar_orig = value;
            }
            break;
        case DMA_REG_CMAR:
            if (!(dma->ccr & DMA_CCR_EN)) {
                dma->cmar = value;
                dma->cmar_orig = value;
            }
            break;
        default:
            break;
    }
}
