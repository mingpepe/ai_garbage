#include <stdint.h>
#include "atomic_spinlock.h"

/*
 * Demo 1: Store Buffer Forwarding, Drain & MESI Cache Coherence Protocol
 * ======================================================================
 * Shared Memory Map:
 *   0x1000 (Line 0): shared_data     (Target of MESI I -> E -> M -> S -> I transitions)
 *   0x1004 (Line 1): sync_step       (Coordination flag between Core 0 and Core 1)
 *   0x1008 (Line 2): core0_obs       (Value observed by Core 0)
 *   0x100C (Line 3): core1_obs       (Value observed by Core 1)
 */

#define SHARED_DATA   SHM_WORD(0)  /* 0x1000 */
#define SYNC_STEP     SHM_WORD(1)  /* 0x1004 */
#define CORE0_OBS     SHM_WORD(2)  /* 0x1008 */
#define CORE1_OBS     SHM_WORD(3)  /* 0x100C */

int main(uint32_t hartid) {
    if (hartid == 0) {
        /* ==================== CORE 0 ==================== */
        /* Phase 1: Cold Read Miss -> MESI 'E' (Exclusive), then Store + Store-to-Load Forwarding */
        mark_phase(1);
        uint32_t init_val;
        uint32_t fwd_val;
        __asm__ volatile (
            "lw   %0, 0(%2)\n\t"          /* Read 0x1000: Peer doesn't have it -> I to E (Exclusive) */
            "li   t0, 0x11110001\n\t"
            "sw   t0, 0(%2)\n\t"          /* Enters Store Buffer! */
            "lw   %1, 0(%2)\n\t"          /* Immediate Load to same addr -> Store Buffer Forwarding! */
            : "=&r"(init_val), "=&r"(fwd_val)
            : "r"(&SHARED_DATA)
            : "t0", "memory"
        );

        /* Phase 2: Burst Stores into Store Buffer + Silent E->M upgrade + Fence Drain */
        mark_phase(2);
        SHARED_DATA = 0x11110002u;        /* Queued in Store Buffer -> Drains to L1 (M) */
        CORE0_OBS   = fwd_val;            /* Queued in Store Buffer -> BusRdX on 0x1008 */
        SYNC_STEP   = 1u;                 /* Signal Core 1 to read SHARED_DATA */
        cpu_fence_rw_rw();                /* Wait for Store Buffer to completely drain to L1 */

        /* Wait until Core 1 finishes reading & upgrading SHARED_DATA to 0x9999CAFE */
        while (SYNC_STEP != 2u) {
            /* Spin waiting for Core 1 */
        }

        /* Phase 5: Core 0 reads SHARED_DATA after Core 1 modified it (S->I then I->S) */
        mark_phase(5);
        CORE0_OBS = SHARED_DATA;          /* BusRd snoops Core 1's 'M' line -> both become 'S' */
        cpu_fence_rw_rw();

    } else {
        /* ==================== CORE 1 ==================== */
        /* Wait for Core 0 to populate SHARED_DATA in 'M' state */
        while (SYNC_STEP != 1u) {
            /* Core 1 polls SYNC_STEP (0x1004) */
        }

        /* Phase 3: Core 1 reads SHARED_DATA (0x1000) while Core 0 holds it in 'M' state
         * -> BusRd triggers Snoop Hit (Dirty) on Core 0!
         * -> Core 0 flushes 0x11110002 to Bus/RAM and transitions M -> S
         * -> Core 1 receives 0x11110002 and transitions I -> S */
        mark_phase(3);
        uint32_t val_from_c0 = SHARED_DATA;
        CORE1_OBS = val_from_c0;

        /* Phase 4: Core 1 writes new value to SHARED_DATA while both cores hold 'S'
         * -> Store drains from Core 1 Store Buffer to L1
         * -> Core 1 issues BusUpgr(0x1000): Core 0 snoops and invalidates S -> I!
         * -> Core 1 transitions S -> M with value 0x9999CAFE */
        mark_phase(4);
        SHARED_DATA = 0x9999CAFEu;
        cpu_fence_w_w();
        SYNC_STEP = 2u;
        cpu_fence_rw_rw();
    }

    return 0;
}
