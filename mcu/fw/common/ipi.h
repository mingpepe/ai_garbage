#ifndef IPI_H
#define IPI_H

#include <stdint.h>
#include "soc_mmap.h"

// Read Hardware Thread ID (mhartid CSR 0xF14)
static inline uint32_t read_mhartid(void) {
    uint32_t id;
    __asm__ volatile ("csrr %0, mhartid" : "=r"(id));
    return id;
}

// Enable Machine Software Interrupt (MSIE in mie, MIE in mstatus)
static inline void ipi_enable_irq(void) {
    uint32_t msie = (1UL << 3);
    uint32_t mie  = (1UL << 3);
    __asm__ volatile ("csrs mie, %0"     : : "r"(msie) : "memory");
    __asm__ volatile ("csrs mstatus, %0" : : "r"(mie)  : "memory");
}

static inline void ipi_disable_mie(void) {
    uint32_t mie = (1UL << 3);
    __asm__ volatile ("csrc mstatus, %0" : : "r"(mie) : "memory");
}

static inline void ipi_enable_mie(void) {
    uint32_t mie = (1UL << 3);
    __asm__ volatile ("csrs mstatus, %0" : : "r"(mie) : "memory");
}

// Wait For Interrupt instruction
static inline void cpu_wfi(void) {
    __asm__ volatile ("wfi" : : : "memory");
}

// Race-free wait until (*addr == expected_val) using WFI
static inline void ipi_wait_eq(volatile uint32_t *addr, uint32_t expected_val) {
    while (1) {
        ipi_disable_mie();
        if (*addr == expected_val) {
            ipi_enable_mie();
            break;
        }
        cpu_wfi();
        ipi_enable_mie();
    }
}

// Memory barrier fence
static inline void cpu_fence(void) {
    __asm__ volatile ("fence" : : : "memory");
}

// Core 0 boots Core 1 by setting CORE1_BOOT_ADDR and asserting CORE1_BOOT_CTRL
static inline void soc_boot_core1(uint32_t boot_addr) {
    REG_CORE1_BOOT_ADDR = boot_addr;
    cpu_fence();
    REG_CORE1_BOOT_CTRL = 1UL;
    cpu_fence();
}

// Send IPI from Core 1 -> Core 0 with 32-bit message payload
static inline void ipi_send_to_core0(uint32_t msg) {
    REG_IPI_MSG_1_TO_0 = msg;
    cpu_fence();
    REG_MSIP_CORE0 = 1UL;
}

// Send IPI from Core 0 -> Core 1 with 32-bit message payload
static inline void ipi_send_to_core1(uint32_t msg) {
    REG_IPI_MSG_0_TO_1 = msg;
    cpu_fence();
    REG_MSIP_CORE1 = 1UL;
}

// Clear pending IPI on Core 0 (called inside Core 0 ISR)
static inline void ipi_clear_core0(void) {
    REG_MSIP_CORE0 = 0UL;
    cpu_fence();
}

// Clear pending IPI on Core 1 (called inside Core 1 ISR)
static inline void ipi_clear_core1(void) {
    REG_MSIP_CORE1 = 0UL;
    cpu_fence();
}

#endif // IPI_H
