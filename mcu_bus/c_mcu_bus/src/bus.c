#include "../include/bus.h"
#include "../include/mcu_system.h"
#include <stdio.h>
#include <string.h>

void bus_init(bus_arbiter_t *bus) {
    if (!bus) return;
    memset(bus, 0, sizeof(bus_arbiter_t));
    bus->last_granted = BUS_MASTER_NONE;
}

void bus_begin_cycle(bus_arbiter_t *bus, int cycle) {
    if (!bus) return;
    bus->cycle = cycle;
    bus->total_cycles++;
    memset(&bus->cpu_req, 0, sizeof(bus->cpu_req));
    memset(&bus->dma_req, 0, sizeof(bus->dma_req));
    memset(&bus->last_trans, 0, sizeof(bus->last_trans));
}

void bus_request_cpu(bus_arbiter_t *bus, uint32_t addr, bool is_write, uint32_t wdata, int priority, const char *op_name) {
    if (!bus) return;
    bus->cpu_req.request = true;
    bus->cpu_req.addr = addr;
    bus->cpu_req.is_write = is_write;
    bus->cpu_req.wdata = wdata;
    bus->cpu_req.size = 1;
    bus->cpu_req.priority = priority;
    bus->cpu_req.operation_name = op_name;
}

void bus_request_dma(bus_arbiter_t *bus, uint32_t addr, bool is_write, uint32_t wdata, int priority, const char *op_name) {
    if (!bus) return;
    bus->dma_req.request = true;
    bus->dma_req.addr = addr;
    bus->dma_req.is_write = is_write;
    bus->dma_req.wdata = wdata;
    bus->dma_req.size = 1;
    bus->dma_req.priority = priority;
    bus->dma_req.operation_name = op_name;
}

bus_transaction_t bus_commit(bus_arbiter_t *bus, struct mcu_system *sys) {
    bus_transaction_t trans;
    memset(&trans, 0, sizeof(trans));
    
    bool cpu_wants = bus->cpu_req.request;
    bool dma_wants = bus->dma_req.request;
    
    if (!cpu_wants && !dma_wants) {
        bus->idle_cycles++;
        trans.granted_master = BUS_MASTER_NONE;
        trans.active = false;
        trans.description = "Idle Cycle";
        bus->last_trans = trans;
        return trans;
    }
    
    bus_master_t winner = BUS_MASTER_NONE;
    bus_request_t *win_req = NULL;
    
    if (cpu_wants && !dma_wants) {
        winner = BUS_MASTER_CPU;
        win_req = &bus->cpu_req;
    } else if (!cpu_wants && dma_wants) {
        winner = BUS_MASTER_DMA;
        win_req = &bus->dma_req;
    } else {
        /* Both requested: Bus Contention! */
        bus->bus_contentions++;
        if (bus->dma_req.priority < bus->cpu_req.priority) {
            winner = BUS_MASTER_DMA;
            win_req = &bus->dma_req;
        } else if (bus->cpu_req.priority < bus->dma_req.priority) {
            winner = BUS_MASTER_CPU;
            win_req = &bus->cpu_req;
        } else {
            /* Equal priority: Round-Robin tie breaker */
            if (bus->last_granted == BUS_MASTER_DMA) {
                winner = BUS_MASTER_CPU;
                win_req = &bus->cpu_req;
            } else {
                winner = BUS_MASTER_DMA;
                win_req = &bus->dma_req;
            }
        }
    }
    
    trans.granted_master = winner;
    trans.active = true;
    trans.addr = win_req->addr;
    trans.is_write = win_req->is_write;
    trans.wdata = win_req->wdata;
    trans.description = win_req->operation_name;
    
    /* Dispatch transaction across MMIO bus */
    if (trans.is_write) {
        mcu_bus_write(sys, trans.addr, trans.wdata);
    } else {
        trans.rdata = mcu_bus_read(sys, trans.addr);
    }
    
    if (winner == BUS_MASTER_DMA) {
        bus->dma_grants++;
    } else if (winner == BUS_MASTER_CPU) {
        bus->cpu_grants++;
    }
    
    bus->last_granted = winner;
    bus->last_trans = trans;
    
    /* Notify masters of arbitration results */
    if (dma_wants) {
        dma_on_bus_granted(&sys->dma, &trans);
    }
    if (cpu_wants) {
        cpu_on_bus_granted(&sys->cpu, &trans);
    }
    
    return trans;
}
