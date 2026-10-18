#include <stdint.h>
#include "atomic_spinlock.h"

/*
 * Demo 2: Naive Lock Failure vs. Hardware Spinlocks (LR/SC & AMOSWAP)
 * ====================================================================
 * Shared Memory Map:
 *   0x1000 (Line 0): LOCK_VAR        (Spinlock word: 0 = unlocked, 1 = locked)
 *   0x1004 (Line 1): NAIVE_COUNTER   (Protected by broken naive lw/sw lock -> loses update!)
 *   0x1008 (Line 2): LRSC_COUNTER    (Protected by lr.w / sc.w spinlock -> exact = 2)
 *   0x100C (Line 3): AMO_COUNTER     (Protected by amoswap.w spinlock   -> exact = 2)
 *   0x1010 (Line 4): SHARED_BALANCE  (Multi-step critical section data  -> exact = 400)
 *   0x1014 (Line 5): BARRIER_SYNC    (Atomic barrier counter via amoadd.w)
 */

#define LOCK_VAR        SHM_WORD(0)  /* 0x1000 */
#define NAIVE_COUNTER   SHM_WORD(1)  /* 0x1004 */
#define LRSC_COUNTER    SHM_WORD(2)  /* 0x1008 */
#define AMO_COUNTER     SHM_WORD(3)  /* 0x100C */
#define SHARED_BALANCE  SHM_WORD(4)  /* 0x1010 */
#define BARRIER_SYNC    SHM_WORD(5)  /* 0x1014 */

int main(uint32_t hartid) {
    (void)hartid;
    /* ------------------------------------------------------------------------
     * Phase 1: Naive (Non-Atomic) Lock Failure Demo
     * Both cores read LOCK_VAR == 0 in MESI 'S' state before either Store Buffer
     * drains LOCK_VAR = 1. Both enter the critical section simultaneously!
     * ------------------------------------------------------------------------ */
    mark_phase(1);
    naive_lock_acquire(&LOCK_VAR);
    {
        uint32_t cur = NAIVE_COUNTER;
        /* Deliberate small delay in critical section so both cores overlap */
        __asm__ volatile ("nop\n\tnop\n\t");
        NAIVE_COUNTER = cur + 1u;
    }
    naive_lock_release(&LOCK_VAR);

    /* Synchronize both cores before Phase 2 using atomic fetch-add */
    atomic_fetch_add(&BARRIER_SYNC, 1u);
    while (BARRIER_SYNC < 2u) {}

    /* ------------------------------------------------------------------------
     * Phase 2: LR/SC (Load-Reserved / Store-Conditional) Spinlock Demo
     * - Both cores execute `lr.w.aq` -> sets Reservation Register (0x1000)
     * - Winner's `sc.w.aqrl` issues BusUpgr(0x1000), invalidating loser's
     *   L1 line AND clearing loser's Reservation Register (`res_valid = 0`)!
     * - Loser's `sc.w.aqrl` returns 1 (fail) and retries until winner unlocks.
     * ------------------------------------------------------------------------ */
    mark_phase(2);
    spinlock_lrsc_acquire(&LOCK_VAR);
    {
        uint32_t c = LRSC_COUNTER;
        uint32_t b = SHARED_BALANCE;
        LRSC_COUNTER   = c + 1u;
        SHARED_BALANCE = b + 100u;
    }
    spinlock_lrsc_release(&LOCK_VAR);

    /* Synchronize both cores before Phase 3 */
    atomic_fetch_add(&BARRIER_SYNC, 1u);
    while (BARRIER_SYNC < 4u) {}

    /* ------------------------------------------------------------------------
     * Phase 3: AMOSWAP (Atomic Read-Modify-Write) Spinlock Demo
     * - `amoswap.w.aq` drains Store Buffer, acquires line in 'M' state, and
     *   indivisibly swaps 1 with old value in L1 cache.
     * - Winner gets old_val == 0; Loser gets old_val == 1 and spins.
     * ------------------------------------------------------------------------ */
    mark_phase(3);
    spinlock_amo_acquire(&LOCK_VAR);
    {
        uint32_t c = AMO_COUNTER;
        uint32_t b = SHARED_BALANCE;
        AMO_COUNTER    = c + 1u;
        SHARED_BALANCE = b + 100u;
    }
    spinlock_amo_release(&LOCK_VAR);

    cpu_fence_rw_rw();
    return 0;
}
