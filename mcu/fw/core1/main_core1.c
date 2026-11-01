#include <stdint.h>
#include "../common/soc_mmap.h"
#include "../common/spinlock.h"
#include "../common/ipi.h"
#include "../common/uart.h"
#include "../common/i2c.h"

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

    // ------------------------------------------------------------------------
    // 6. Dual-Core I2C Multi-Master Arbitration Test
    // ------------------------------------------------------------------------
    uart_log_msg(hart_id, "Starting Dual-Core I2C Multi-Master Arbitration Test...");
    i2c_init(I2C1_BASE, 4);

    // Wait for Core 0 to write to slave reg 0x10
    while (SHM->i2c_sync_stage != 1UL) {
        cpu_fence();
    }

    // Write test value 0x55 to slave reg 0x20
    i2c_write_slave_reg(I2C1_BASE, 0x50, 0x20, 0x55);
    uart_log_msg(hart_id, "Wrote 0x55 to Slave Reg 0x20 via I2C1");

    // Signal Core 0 that write is done
    SHM->i2c_sync_stage = 2UL;
    cpu_fence();

    // Wait for Core 0 to set target cycle
    while (SHM->i2c_sync_stage != 3UL) {
        cpu_fence();
    }

    // Synchronize to exact target cycle
    while ((int32_t)(SHM->i2c_sync_target - REG_CYCLE_COUNTER) > 0) {
        // tight wait
    }

    // Concurrent access: Core 1 attempts to read reg 0x20: S id write address(0x20) S id read data P
    uint8_t c1_rx = 0;
    int ret1 = i2c_read_slave_reg(I2C1_BASE, 0x50, 0x20, &c1_rx);

    if (ret1 < 0) {
        SHM->i2c_c1_arb_lost_cnt++;

        // Verify: While bus is busy and unowned, FW CANNOT issue START!
        if (i2c_is_bus_busy(I2C1_BASE)) {
            int st_res = i2c_send_start(I2C1_BASE);
            uint32_t st = i2c_get_status(I2C1_BASE);
            if ((st & I2C_STATUS_START_BLOCKED) || st_res < 0) {
                SHM->i2c_c1_blocked_cnt++;
            }
        }

        uart_log_msg(hart_id, ">>> ARBITRATION LOST DETECTED ON I2C BUS! <<<");
        if (SHM->i2c_c1_blocked_cnt > 0) {
            uart_log_msg(hart_id, "Verified: START blocked because bus is busy!");
        }

        // User requirement: "並且發生後 fw 應該要 polling until bus not busy 才能繼續讀寫"
        uart_log_msg(hart_id, "Polling I2C bus until not busy...");
        while (i2c_is_bus_busy(I2C1_BASE)) {
            // Polling until bus not busy!
        }
        uart_log_msg(hart_id, "Bus is now FREE! Retrying I2C transaction...");

        // Retry the read now that bus is free
        i2c_clear_flags(I2C1_BASE);
        ret1 = i2c_read_slave_reg(I2C1_BASE, 0x50, 0x20, &c1_rx);
        if (ret1 == 0) {
            SHM->i2c_c1_data = (uint32_t)c1_rx;
            uart_log_key_hex(hart_id, "I2C read success after retry! Read addr 0x20 = ", c1_rx);
        } else {
            uart_log_msg(hart_id, "Error: Retry failed!");
        }
    } else {
        uart_log_msg(hart_id, "Warning: Core 1 did not lose arbitration!");
        SHM->i2c_c1_data = (uint32_t)c1_rx;
    }

    // 7. Signal Core 1 simulation complete
    REG_SIM_DONE_FLAGS = SIM_CORE1_DONE;
    return 0;
}
