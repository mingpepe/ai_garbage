#include <stdint.h>
#include "atomic_spinlock.h"

/*
 * Demo 3: CPU Instruction Reordering (ROB Out-of-Order + Store-Load Reordering)
 * =============================================================================
 * Shared Memory Map:
 *   0x1000 (Line 0): VAR_X          (Litmus test variable X, written by Core 0)
 *   0x1004 (Line 1): VAR_Y          (Litmus test variable Y, written by Core 1)
 *   0x1008 (Line 2): NOFENCE_R0     (Core 0 read of Y without fence -> 0!)
 *   0x100C (Line 3): NOFENCE_R1     (Core 1 read of X without fence -> 0!)
 *   0x1010 (Line 4): FENCED_R0      (Core 0 read of Y with fence)
 *   0x1014 (Line 5): FENCED_R1      (Core 1 read of X with fence    -> 1!)
 *   0x1018 (Line 6): FAST_HIT_VAR   (Pre-cached L1 Hit line for ROB OoO demo)
 *   0x101C (Line 7): SYNC_BARRIER   (Synchronization barrier)
 */

#define VAR_X         SHM_WORD(0)  /* 0x1000 */
#define VAR_Y         SHM_WORD(1)  /* 0x1004 */
#define NOFENCE_R0    SHM_WORD(2)  /* 0x1008 */
#define NOFENCE_R1    SHM_WORD(3)  /* 0x100C */
#define FENCED_R0     SHM_WORD(4)  /* 0x1010 */
#define FENCED_R1     SHM_WORD(5)  /* 0x1014 */
#define FAST_HIT_VAR  SHM_WORD(6)  /* 0x1018 */
#define SYNC_BARRIER  SHM_WORD(7)  /* 0x101C */

int main(uint32_t hartid) {
    set_ooo_enable(1);

    /* ------------------------------------------------------------------------
     * Phase 1: Pipeline Out-of-Order Execution in Reorder Buffer (ROB)
     * Both cores warm FAST_HIT_VAR (0x1018) in L1 cache, leave FENCED_R1
     * (0x1014) cold (L1 Miss), and execute a 4-instruction window:
     *   ROB[0]: lw   t0, 0(0x1014)   -> L1 Miss (Stalls waiting for BusRd)
     *   ROB[1]: addi t1, t0, 5       -> RAW Hazard on t0 (Stalls in ROB_WAIT_DEP)
     *   ROB[2]: addi t2, zero, 0x77  -> Independent ALU! Executes Out-of-Order!
     *   ROB[3]: lw   t3, 0(0x1018)   -> Independent L1 Hit! Executes Out-of-Order!
     * ------------------------------------------------------------------------ */
    mark_phase(1);
    if (hartid == 0) {
        FAST_HIT_VAR = 0xABCD1234u;
        cpu_fence_rw_rw();

        uint32_t slow_val, dep_val, ooo_alu_val, ooo_load_val;
        __asm__ volatile (
            "lw   %0, 0(%4)\n\t"      /* ROB[0]: L1 Miss on 0x1014 -> MEM_WAIT */
            "addi %1, %0, 5\n\t"      /* ROB[1]: Depends on %0 -> WAIT_DEP */
            "addi %2, zero, 0x77\n\t" /* ROB[2]: No dependency -> Executes OoO! */
            "lw   %3, 0(%5)\n\t"      /* ROB[3]: Hits 0x1018 in L1 -> Executes OoO! */
            : "=&r"(slow_val), "=&r"(dep_val), "=&r"(ooo_alu_val), "=&r"(ooo_load_val)
            : "r"(&FENCED_R1), "r"(&FAST_HIT_VAR)
            : "memory"
        );
    }

    /* Synchronize before Phase 2 */
    atomic_fetch_add(&SYNC_BARRIER, 1u);
    while (SYNC_BARRIER < 2u) {}

    /* Symmetric pointers for Core 0 (write X, read Y) and Core 1 (write Y, read X) */
    volatile uint32_t *my_var    = (volatile uint32_t *)(SHM_BASE + (hartid * 4u));
    volatile uint32_t *peer_var  = (volatile uint32_t *)(SHM_BASE + ((1u - hartid) * 4u));
    volatile uint32_t *nofence_r = (volatile uint32_t *)(SHM_BASE + 0x08u + (hartid * 4u));
    volatile uint32_t *fenced_r  = (volatile uint32_t *)(SHM_BASE + 0x10u + (hartid * 4u));

    /* Pre-warm both VAR_X (0) and VAR_Y (0) into MESI 'S' (Shared) state in both L1s */
    (void)VAR_X;
    (void)VAR_Y;

    /* ------------------------------------------------------------------------
     * Phase 2: Store-Load Memory Reordering WITHOUT Fence (Litmus Test)
     * Core 0: X = 1; r0 = Y;
     * Core 1: Y = 1; r1 = X;
     * Both stores sit in each core's Store Buffer while the younger loads
     * bypass the Store Buffer and hit 'S' state (0) in local L1 cache!
     * Result: NOFENCE_R0 == 0 && NOFENCE_R1 == 0!
     * ------------------------------------------------------------------------ */
    mark_phase(2);
    {
        uint32_t r_val;
        __asm__ volatile (
            "li   t0, 1\n\t"
            "sw   t0, 0(%1)\n\t"      /* Enters local Store Buffer (X=1 or Y=1) */
            "lw   %0, 0(%2)\n\t"      /* Bypasses SB, hits peer_var=0 in L1 ('S')! */
            : "=r"(r_val)
            : "r"(my_var), "r"(peer_var)
            : "t0", "memory"
        );
        *nofence_r = r_val;
    }

    cpu_fence_rw_rw();
    atomic_fetch_add(&SYNC_BARRIER, 1u);
    while (SYNC_BARRIER < 4u) {}

    /* Reset X = 0, Y = 0 and pre-warm both into 'S' state */
    if (hartid == 0) {
        VAR_X = 0u;
        VAR_Y = 0u;
        cpu_fence_rw_rw();
    }
    atomic_fetch_add(&SYNC_BARRIER, 1u);
    while (SYNC_BARRIER < 6u) {}

    (void)VAR_X;
    (void)VAR_Y;

    /* ------------------------------------------------------------------------
     * Phase 3: Store-Load Ordering WITH Hardware Fence (fence rw, rw)
     * Core 0: X = 1; fence rw, rw; r0 = Y;
     * Core 1: Y = 1; fence rw, rw; r1 = X;
     * The `fence` stalls the younger `lw` until the Store Buffer drains its
     * write into L1 Cache (invalidating the peer's 'S' copy via BusUpgr).
     * Result: Impossible for both FENCED_R0 and FENCED_R1 to be 0!
     * ------------------------------------------------------------------------ */
    mark_phase(3);
    {
        uint32_t r_val;
        __asm__ volatile (
            "li    t0, 1\n\t"
            "sw    t0, 0(%1)\n\t"     /* Enters local Store Buffer (X=1 or Y=1) */
            "fence rw, rw\n\t"        /* Stalls until Store Buffer drains to L1! */
            "lw    %0, 0(%2)\n\t"     /* Reads peer_var AFTER write is globally visible */
            : "=r"(r_val)
            : "r"(my_var), "r"(peer_var)
            : "t0", "memory"
        );
        *fenced_r = r_val;
    }

    cpu_fence_rw_rw();
    return 0;
}
