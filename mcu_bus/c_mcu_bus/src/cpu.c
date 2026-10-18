#include "../include/cpu.h"
#include <stdio.h>
#include <string.h>

void cpu_init(cpu_t *cpu, uint32_t poll_interval) {
    if (!cpu) return;
    memset(cpu, 0, sizeof(cpu_t));
    cpu->state = CPU_STATE_RUNNING;
    cpu->current_irq = -1;
    cpu->poll_interval = (poll_interval > 0) ? poll_interval : 3;
    snprintf(cpu->current_op, sizeof(cpu->current_op), "CPU Running (Background)");
}

void cpu_prepare_bus_request(cpu_t *cpu, bus_arbiter_t *bus, nvic_t *nvic, int cycle) {
    if (!cpu || !bus || !nvic) return;
    
    /* If entering or in ISR, CPU might need bus to service peripheral */
    if (cpu->state == CPU_STATE_ISR) {
        if (cpu->current_irq == IRQ_DMA1_CH1) {
            /* Service DMA TC: Clear DMA TC flag via IFCR */
            bus_request_cpu(bus, DMA1_BASE + DMA_REG_IFCR, true, DMA_FLAG_TCIF | DMA_FLAG_GIF, 1, "CPU ISR: Clear DMA TC Flag");
            return;
        } else if (cpu->current_irq == IRQ_UART_ORE) {
            /* Clear UART ORE */
            bus_request_cpu(bus, UART0_BASE + UART_REG_SR, true, 0, 1, "CPU ISR: Clear UART ORE");
            return;
        }
    }
    
    /* Background periodic bus access (e.g. poll I2C SR every N cycles) */
    if (cycle % cpu->poll_interval == 0) {
        bus_request_cpu(bus, I2C0_BASE + I2C_REG_SR, false, 0, 2, "CPU: Poll I2C Status");
    }
}

void cpu_on_bus_granted(cpu_t *cpu, const bus_transaction_t *trans) {
    if (!cpu || !trans) return;
    
    if (trans->granted_master == BUS_MASTER_CPU) {
        cpu->last_read_val = trans->rdata;
        snprintf(cpu->current_op, sizeof(cpu->current_op), "Bus Op Done: %s (Data=0x%02X)", 
                 trans->description, trans->is_write ? trans->wdata : trans->rdata);
    } else {
        /* CPU requested bus but DMA won */
        cpu->bus_stalls++;
        snprintf(cpu->current_op, sizeof(cpu->current_op), "Bus Stalled (Preempted by DMA)");
    }
}

void cpu_tick(cpu_t *cpu, nvic_t *nvic, int cycle) {
    (void)cycle;
    if (!cpu || !nvic) return;
    
    if (cpu->state == CPU_STATE_ISR) {
        cpu->isr_remaining_cycles--;
        if (cpu->isr_remaining_cycles <= 0) {
            /* Exit ISR */
            printf("  [CPU] <<< EXIT ISR: IRQ %d\n", cpu->current_irq);
            nvic_complete(nvic, cpu->current_irq);
            cpu->current_irq = -1;
            cpu->state = CPU_STATE_RUNNING;
            snprintf(cpu->current_op, sizeof(cpu->current_op), "CPU Running (Background)");
        }
        return;
    }
    
    /* Check for pending interrupts */
    int irq = nvic_acknowledge(nvic);
    if (irq >= 0) {
        cpu->state = CPU_STATE_ISR;
        cpu->current_irq = irq;
        cpu->isr_remaining_cycles = 2; /* 2 cycles for ISR */
        printf("  [CPU] >>> ENTER ISR: IRQ %d (%s)\n", 
               irq, 
               irq == IRQ_DMA1_CH1 ? "DMA TC" :
               irq == IRQ_UART_ORE ? "UART OVERRUN" :
               irq == IRQ_UART_RXNE ? "UART RXNE" : "I2C TXE");
        snprintf(cpu->current_op, sizeof(cpu->current_op), "Executing ISR (IRQ %d)", irq);
    }
}
