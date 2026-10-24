#include <stdint.h>
#include "../common/soc_mmap.h"
#include "../common/spinlock.h"
#include "../common/ipi.h"
#include "../common/uart.h"

// ============================================================================
// Core 1 Machine Software Interrupt (IPI) Handler
// Triggered when Core 0 writes 1 to REG_MSIP_CORE1 (0x2000_0004)
// ============================================================================
void core1_ipi_isr(void) {
    uint32_t msg = REG_IPI_MSG_0_TO_1;

    // Clear Core 1 IPI pending bit
    ipi_clear_core1();

    // Count total IPIs received by Core 1
    atomic_fetch_add(&SHM->core1_ipi_count, 1);

    if (msg == 0x10000001UL) {
        // Start spinlock test phase notification
        REG_DBG_TRACE = 0xC1001001UL;
    } else if (msg == 0xCAFE0001UL || msg == 0xCAFE0003UL) {
        // Ping IPI from Core 0 -> increment ping_pong counter & send Pong IPI to Core 0
        atomic_fetch_add(&SHM->ipi_ping_pong, 1);
        REG_DBG_TRACE = msg;
        ipi_send_to_core0(msg + 1UL);
    } else if (msg == 0xCAFEFFFFUL) {
        // Final completion notification IPI from Core 0
        REG_DBG_TRACE = msg;
    }
}

// ============================================================================
// Core 1 Main Entry (Booted by Core 0 writing to REG_CORE1_BOOT_CTRL)
// ============================================================================
int main(void) {
    uint32_t hart_id = read_mhartid();
    REG_DBG_TRACE = 0xC1000001UL;

    // 1. Enable Machine Software Interrupts (IPI) on Core 1
    ipi_enable_irq();

    uart_log_msg(hart_id, "Booted by Core 0 at 0x00010000! Sending Boot-Ack IPI...");

    // 2. Send Boot-Ack IPI to Core 0
    ipi_send_to_core0(0xB0070001UL);

    // 3. Wait for Core 0 to start Spinlock Test Phase via IPI
    ipi_wait_eq(&SHM->phase_ready, 1UL);

    // 4. Execute 5 Critical Sections on Core 1 using Atomic Spinlock + Shared Memory
    for (uint32_t iter = 0; iter < SPINLOCK_ITERATIONS_PER_CORE; iter++) {
        // Alternate between LR.W/SC.W spinlock and AMOSWAP spinlock
        if ((iter & 1UL) == 0UL) {
            spin_lock_lrsc(&SHM->spinlock);
        } else {
            spin_lock(&SHM->spinlock);
        }

        // ---- Critical Section Start (Protected by Spinlock in Shared Memory) ----
        uint32_t cur = SHM->shared_counter;
        REG_DBG_TRACE = 0xC1100000UL | (cur + 1UL);

        // Hold lock briefly so Core 0 contentions are clearly visible in VCD waveform
        for (volatile int delay = 0; delay < 4; delay++) { }

        SHM->log_core_id[cur] = hart_id;
        SHM->log_counter[cur] = cur + 1UL;
        SHM->shared_counter   = cur + 1UL;
        cpu_fence();
        // ---- Critical Section End ----

        spin_unlock(&SHM->spinlock);

        uart_log_key_val(hart_id, "Spinlock critical section updated shared_counter = ", cur + 1UL);
    }

    // 5. Wait for both IPI Ping-Pong rounds to complete (4 hops total)
    ipi_wait_eq(&SHM->ipi_ping_pong, EXPECTED_IPI_PING_PONG);

    uart_log_msg(hart_id, "All Spinlock & IPI tasks finished!");

    // 6. Signal Core 1 simulation complete
    REG_SIM_DONE_FLAGS = SIM_CORE1_DONE;
    return 0;
}
