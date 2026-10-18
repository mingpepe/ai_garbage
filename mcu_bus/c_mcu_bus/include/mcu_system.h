#ifndef MCU_SYSTEM_H
#define MCU_SYSTEM_H

#include <stdio.h>
#include "common.h"
#include "bus.h"
#include "sram.h"
#include "uart.h"
#include "i2c.h"
#include "nvic.h"
#include "dma.h"
#include "cpu.h"

typedef struct mcu_system {
    int cycle;
    bus_arbiter_t bus;
    sram_t sram;
    uart_t uart;
    i2c_t i2c;
    nvic_t nvic;
    dma_controller_t dma;
    cpu_t cpu;
    
    /* Config & Logging */
    bool verbose;
    FILE *vcd_fp;
} mcu_system_t;

void mcu_system_init(mcu_system_t *sys);
bool mcu_system_open_vcd(mcu_system_t *sys, const char *filename);
void mcu_system_close_vcd(mcu_system_t *sys);
void mcu_system_step(mcu_system_t *sys);

/* MMIO Bus read/write dispatch */
uint32_t mcu_bus_read(mcu_system_t *sys, uint32_t addr);
void mcu_bus_write(mcu_system_t *sys, uint32_t addr, uint32_t data);

#endif /* MCU_SYSTEM_H */
