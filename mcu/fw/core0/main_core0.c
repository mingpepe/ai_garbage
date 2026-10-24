#include <stdint.h>
#include "../common/soc_mmap.h"
#include "../common/spinlock.h"
#include "../common/ipi.h"
#include "../common/uart.h"

// ============================================================================
// Core 0 Machine Software Interrupt (IPI) Handler
// Triggered when Core 1 writes 1 to REG_MSIP_CORE0 (0x2000_0000)
// ============================================================================
void core0_ipi_isr(void) {
    uint32_t msg = REG_IPI_MSG_1_TO_0;

    // Clear Core 0 IPI pending bit
    ipi_clear_core0();

    // Count total IPIs received by Core 0
    atomic_fetch_add(&SHM->core0_ipi_count, 1);

    if (msg == 0xB0070001UL) {
        // Core 1 Boot Acknowledge IPI
        SHM->core1_booted = 1UL;
        REG_DBG_TRACE = 0xC000B007UL;
    } else if ((msg & 0xFFFF0000UL) == 0xCAFE0000UL) {
        // Ping-Pong IPI response from Core 1
        atomic_fetch_add(&SHM->ipi_ping_pong, 1);
        REG_DBG_TRACE = msg;
    }
}

// ============================================================================
// Build 32-byte Report Packet in SoC Report Buffer & Notify Host via Register
// ============================================================================
static void fw_publish_report_to_host(uint32_t hart_id) {
    // 1. Switch to Bank 1 (write 0x01 to 0x7F) to store diagnostics & signature
    REG_BANK_BYTE(REG_BANK_SEL)     = 0x01U;
    REG_BANK_BYTE(B1_DIAG_SPIN_CNT) = (uint8_t)SHM->shared_counter;
    REG_BANK_BYTE(B1_DIAG_IPI_HOPS) = (uint8_t)SHM->ipi_ping_pong;
    REG_BANK_BYTE(B1_SIG_BYTE0)     = 0xB1U;
    REG_BANK_BYTE(B1_SIG_BYTE1)     = 0xCAU;
    REG_BANK_BYTE(B1_SIG_BYTE2)     = 0xFEU;
    REG_BANK_BYTE(B1_SIG_BYTE3)     = 0x01U;
    // Also write 0x0F in Bank 1 (normal register in Bank 1, NOT Report Buffer)
    REG_BANK_BYTE(0x0FU)            = 0xA5U;

    // 2. Switch to Bank 0 (write 0x00 to 0x7F) to prepare Report Buffer & notify Host
    REG_BANK_BYTE(REG_BANK_SEL)     = 0x00U;
    REG_BANK_BYTE(B0_DEV_ID_LO)     = 0x52U; // 'R'
    REG_BANK_BYTE(B0_DEV_ID_HI)     = 0x56U; // 'V'
    REG_BANK_BYTE(B0_FW_STATUS)     = 0x07U; // Core0 + Core1 + Spinlock Ready

    // Reset Report Buffer write/read pointers to 0
    REG_BANK_BYTE(B0_RPT_PTR_CTRL)  = 0x01U;

    // Construct 32-byte Report Payload
    uint8_t pkt[REPORT_PACKET_SIZE];
    pkt[0] = 0x52U; // 'R'
    pkt[1] = 0x50U; // 'P'
    pkt[2] = 0x54U; // 'T'
    pkt[3] = 0x01U; // Version 1
    pkt[4] = (uint8_t)SHM->shared_counter;
    pkt[5] = (uint8_t)SHM->ipi_ping_pong;
    pkt[6] = (uint8_t)SHM->core0_ipi_count;
    pkt[7] = (uint8_t)SHM->core1_ipi_count;

    for (uint32_t i = 0; i < 10; i++) {
        pkt[8 + i]  = (uint8_t)SHM->log_core_id[i];
        pkt[18 + i] = (uint8_t)SHM->log_counter[i];
    }

    pkt[28] = 0xDEU;
    pkt[29] = 0xADU;
    pkt[30] = 0xBEU;
    pkt[31] = 0xEFU;

    // Write all 32 bytes into the SoC Report Buffer & compute 8-bit checksum
    uint8_t checksum = 0U;
    for (uint32_t i = 0; i < REPORT_PACKET_SIZE; i++) {
        REPORT_BUF_MEM(i) = pkt[i];
        checksum = (uint8_t)(checksum + pkt[i]);
    }
    cpu_fence();

    // Configure Report metadata registers in Bank 0
    REG_BANK_BYTE(B0_RPT_LEN_LO)   = (uint8_t)REPORT_PACKET_SIZE;
    REG_BANK_BYTE(B0_RPT_LEN_HI)   = 0x00U;
    REG_BANK_BYTE(B0_RPT_SEQ)      = 0x01U;
    REG_BANK_BYTE(B0_RPT_CHECKSUM) = checksum;
    cpu_fence();

    uart_log_key_val(hart_id, "Report Buffer filled (bytes) = ", REPORT_PACKET_SIZE);
    uart_log_msg(hart_id, "Notifying Host via Bank0 Reg 0x04 (B0_RPT_STATUS = 1)...");

    // 3. Notify Host that Report Buffer data is ready!
    REG_DBG_TRACE = 0xC0200001UL;
    REG_BANK_BYTE(B0_RPT_STATUS) = 0x01U;
    cpu_fence();

    // 4. Wait for Host to finish reading Report Buffer via Bank0 0x0F and write ACK (0x02)
    uint32_t wait_guard = 0;
    while (REG_BANK_BYTE(B0_RPT_STATUS) != 0x02U && wait_guard < 50000UL) {
        wait_guard++;
        cpu_fence();
    }

    if (REG_BANK_BYTE(B0_RPT_STATUS) == 0x02U) {
        uart_log_msg(hart_id, "Host ACK received (B0_RPT_STATUS == 2)! Report transfer complete.");
    }
}

// ============================================================================
// Core 0 Main Entry (Booted automatically by SoC on reset at 0x0000_0000)
// ============================================================================
int main(void) {
    uint32_t hart_id = read_mhartid();
    REG_DBG_TRACE = 0xC0000001UL;

    // Initialize Bank 0 status registers before booting Core 1
    REG_BANK_BYTE(REG_BANK_SEL)  = 0x00U;
    REG_BANK_BYTE(B0_RPT_STATUS) = 0x00U;
    REG_BANK_BYTE(B0_FW_STATUS)  = 0x01U;

    // 1. Initialize Shared Memory (@ 0x1000_0000) before booting Core 1
    SHM->spinlock        = 0UL;
    SHM->shared_counter  = 0UL;
    SHM->core1_booted    = 0UL;
    SHM->ipi_ping_pong   = 0UL;
    SHM->uart_lock       = 0UL;
    SHM->core0_ipi_count = 0UL;
    SHM->core1_ipi_count = 0UL;
    SHM->phase_ready     = 0UL;

    for (uint32_t i = 0; i < 16; i++) {
        SHM->log_core_id[i] = 0xFFUL;
        SHM->log_counter[i] = 0UL;
    }
    cpu_fence();

    // 2. Enable Machine Software Interrupts (IPI) on Core 0
    ipi_enable_irq();

    uart_log_msg(hart_id, "Booted by SoC at 0x00000000. Initializing & booting Core 1...");

    // 3. Boot Core 1 at 0x00010000 (Core 1 Local SRAM)
    soc_boot_core1(CORE1_SRAM_BASE);

    // 4. Wait for Core 1 to boot and send Boot-Ack IPI to Core 0
    ipi_wait_eq(&SHM->core1_booted, 1UL);
    uart_log_msg(hart_id, "Received Boot-Ack IPI from Core 1!");

    // 5. Notify Core 1 via IPI to start Concurrent Atomic Spinlock Test
    SHM->phase_ready = 1UL;
    cpu_fence();
    ipi_send_to_core1(0x10000001UL);

    // 6. Execute 5 Critical Sections on Core 0 using Atomic Spinlock + Shared Memory
    for (uint32_t iter = 0; iter < SPINLOCK_ITERATIONS_PER_CORE; iter++) {
        if ((iter & 1UL) == 0UL) {
            spin_lock(&SHM->spinlock);
        } else {
            spin_lock_lrsc(&SHM->spinlock);
        }

        // ---- Critical Section Start (Protected by Spinlock in Shared Memory) ----
        uint32_t cur = SHM->shared_counter;
        REG_DBG_TRACE = 0xC0100000UL | (cur + 1UL);

        for (volatile int delay = 0; delay < 4; delay++) { }

        SHM->log_core_id[cur] = hart_id;
        SHM->log_counter[cur] = cur + 1UL;
        SHM->shared_counter   = cur + 1UL;
        cpu_fence();
        // ---- Critical Section End ----

        spin_unlock(&SHM->spinlock);

        uart_log_key_val(hart_id, "Spinlock critical section updated shared_counter = ", cur + 1UL);
    }

    // Wait until both Core 0 and Core 1 finish all spinlock iterations (total = 10)
    while (SHM->shared_counter < TOTAL_EXPECTED_COUNTER) {
        cpu_fence();
    }

    // 7. Bidirectional IPI Ping-Pong Communication Test (2 rounds = 4 IPI hops)
    uart_log_msg(hart_id, "Starting IPI Ping-Pong with Core 1...");

    ipi_send_to_core1(0xCAFE0001UL);
    ipi_wait_eq(&SHM->ipi_ping_pong, 2UL);

    ipi_send_to_core1(0xCAFE0003UL);
    ipi_wait_eq(&SHM->ipi_ping_pong, 4UL);

    // Send completion wake-up IPI to Core 1 so Core 1 wakes from WFI
    ipi_send_to_core1(0xCAFEFFFFUL);

    uart_log_key_val(hart_id, "IPI Ping-Pong complete! Total hops = ", SHM->ipi_ping_pong);
    uart_log_key_val(hart_id, "Final Shared Counter = ", SHM->shared_counter);

    // 8. Populate Register Banks (Bank 0 & Bank 1), fill Report Buffer & notify Host!
    fw_publish_report_to_host(hart_id);

    // 9. Signal Core 0 simulation complete
    REG_SIM_DONE_FLAGS = SIM_CORE0_DONE;
    return 0;
}
