#ifndef MCU_BUS_H
#define MCU_BUS_H

#include "common.h"

typedef enum {
    BUS_MASTER_NONE = 0,
    BUS_MASTER_CPU  = 1,
    BUS_MASTER_DMA  = 2
} bus_master_t;

typedef struct {
    bool request;
    uint32_t addr;
    bool is_write;
    uint32_t wdata;
    uint8_t size; /* 1=byte, 2=halfword, 4=word */
    int priority; /* Lower number = higher priority, or 0..3 */
    const char *operation_name;
} bus_request_t;

typedef struct {
    bus_master_t granted_master;
    uint32_t addr;
    bool is_write;
    uint32_t wdata;
    uint32_t rdata;
    bool error;
    bool active;
    const char *description;
} bus_transaction_t;

struct mcu_system;

typedef struct {
    int cycle;
    bus_master_t last_granted;
    bus_request_t cpu_req;
    bus_request_t dma_req;
    bus_transaction_t last_trans;
    
    /* Stats */
    uint32_t total_cycles;
    uint32_t idle_cycles;
    uint32_t cpu_grants;
    uint32_t dma_grants;
    uint32_t bus_contentions;
} bus_arbiter_t;

void bus_init(bus_arbiter_t *bus);
void bus_begin_cycle(bus_arbiter_t *bus, int cycle);
void bus_request_cpu(bus_arbiter_t *bus, uint32_t addr, bool is_write, uint32_t wdata, int priority, const char *op_name);
void bus_request_dma(bus_arbiter_t *bus, uint32_t addr, bool is_write, uint32_t wdata, int priority, const char *op_name);
bus_transaction_t bus_commit(bus_arbiter_t *bus, struct mcu_system *sys);

#endif /* MCU_BUS_H */
