#ifndef MCU_CPU_H
#define MCU_CPU_H

#include "common.h"
#include "bus.h"
#include "nvic.h"

typedef enum {
    CPU_STATE_RUNNING = 0,
    CPU_STATE_ISR,
    CPU_STATE_STALLED
} cpu_state_t;

typedef struct {
    cpu_state_t state;
    int current_irq;
    int isr_remaining_cycles;
    uint32_t pc;
    uint32_t last_read_val;
    uint32_t poll_interval;
    uint32_t bus_stalls;
    char current_op[64];
} cpu_t;

void cpu_init(cpu_t *cpu, uint32_t poll_interval);
void cpu_prepare_bus_request(cpu_t *cpu, bus_arbiter_t *bus, nvic_t *nvic, int cycle);
void cpu_on_bus_granted(cpu_t *cpu, const bus_transaction_t *trans);
void cpu_tick(cpu_t *cpu, nvic_t *nvic, int cycle);

#endif /* MCU_CPU_H */
