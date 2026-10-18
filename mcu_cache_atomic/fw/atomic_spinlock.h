#ifndef ATOMIC_SPINLOCK_H
#define ATOMIC_SPINLOCK_H

#include <stdint.h>

/* ============================================================================
 * Shared Cacheable Memory Layout (0x00001000 - 0x000010FF)
 * Every 32-bit word maps to an L1 Cache Line (Index = addr[4:2], 8 lines total)
 * ============================================================================ */
#define SHM_BASE        0x00001000u
#define SHM_WORD(idx)   (*(volatile uint32_t *)(SHM_BASE + ((idx) * 4u)))

/* ============================================================================
 * Hardware Control & Trace Marker CSRs
 * ============================================================================ */
static inline void set_ooo_enable(uint32_t enable) {
    __asm__ volatile ("csrw 0x7C0, %0" :: "r"(enable) : "memory");
}

static inline void mark_phase(uint32_t phase_id) {
    __asm__ volatile ("csrw 0x7C1, %0" :: "r"(phase_id) : "memory");
}

/* ============================================================================
 * Memory Barrier / Fence Instructions
 * - Drains local Store Buffer to L1 Cache before allowing subsequent mem ops
 * - Enforces in-order completion in the Reorder Buffer (ROB)
 * ============================================================================ */
static inline void cpu_fence_rw_rw(void) {
    __asm__ volatile ("fence rw, rw" ::: "memory");
}

static inline void cpu_fence_w_w(void) {
    __asm__ volatile ("fence w, w" ::: "memory");
}

/* ============================================================================
 * 1. Naive (BROKEN) Lock using regular Load (lw) & Store (sw)
 *    Why it fails on multi-core hardware:
 *    - Core 0 and Core 1 both execute `lw` and hit `lock == 0` in MESI 'S' state.
 *    - Both cores issue `sw 1, (lock)` into their respective Store Buffers.
 *    - Neither core knows the other also read 0 -> BOTH enter critical section!
 * ============================================================================ */
static inline void naive_lock_acquire(volatile uint32_t *lock) {
    uint32_t tmp;
    __asm__ volatile (
        "1:\n\t"
        "lw   %0, 0(%1)\n\t"      /* Regular Load: may hit 'S' state in both cores */
        "bnez %0, 1b\n\t"         /* Wait until lock == 0 */
        "li   %0, 1\n\t"
        "sw   %0, 0(%1)\n\t"      /* Regular Store: enters Store Buffer asynchronously! */
        : "=&r"(tmp)
        : "r"(lock)
        : "memory"
    );
}

static inline void naive_lock_release(volatile uint32_t *lock) {
    *lock = 0;
}

/* ============================================================================
 * 2. Spinlock using RISC-V LR/SC (Load-Reserved / Store-Conditional)
 *    Hardware mechanism:
 *    - `lr.w.aq`: Drains Store Buffer, reads word from L1 Cache, and sets
 *      the core's hardware Reservation Register (res_valid = 1, res_addr = lock).
 *    - If the peer core modifies/upgrades this cache line (BusRdX / BusUpgr)
 *      before our `sc.w`, hardware snoop logic clears our `res_valid = 0`!
 *    - `sc.w.aqrl`: Checks if `res_valid == 1 && res_addr == lock`.
 *      If valid: upgrades L1 line to 'M' (invalidating peer), writes 1, sets rd=0.
 *      If invalid: aborts write, sets rd=1, and loops back to `lr.w`!
 * ============================================================================ */
static inline void spinlock_lrsc_acquire(volatile uint32_t *lock) {
    uint32_t tmp, status;
    __asm__ volatile (
        "1:\n\t"
        "lr.w.aq   %0, (%2)\n\t"         /* Load-Reserved + set reservation */
        "bnez      %0, 1b\n\t"           /* If lock != 0, spin */
        "li        %1, 1\n\t"
        "sc.w.aqrl %1, %1, (%2)\n\t"     /* Store-Conditional: 0=success, 1=fail */
        "bnez      %1, 1b\n\t"           /* Retry if reservation was lost! */
        : "=&r"(tmp), "=&r"(status)
        : "r"(lock)
        : "memory"
    );
}

static inline void spinlock_lrsc_release(volatile uint32_t *lock) {
    /* Ensure all critical section stores drain from Store Buffer before unlock */
    __asm__ volatile (
        "fence rw, w\n\t"
        "sw    zero, 0(%0)\n\t"
        "fence w, rw\n\t"
        :: "r"(lock)
        : "memory"
    );
}

/* ============================================================================
 * 3. Spinlock using RISC-V AMO (Atomic Memory Operation: amoswap.w)
 *    Hardware mechanism:
 *    - `amoswap.w.aq`: Drains local Store Buffer, acquires exclusive ownership
 *      of the cache line in 'M' state (via BusRdX/BusUpgr), locks the cache line
 *      against snoops for an indivisible Read-Modify-Write cycle, returns old
 *      value in rd, and writes 1 into the L1 cache line.
 *    - If old value was 0, we won the lock! If old value was 1, keep spinning.
 * ============================================================================ */
static inline void spinlock_amo_acquire(volatile uint32_t *lock) {
    uint32_t old_val, one = 1;
    __asm__ volatile (
        "1:\n\t"
        "amoswap.w.aq %0, %1, (%2)\n\t"  /* Atomically swap 1 into *lock, return old */
        "bnez         %0, 1b\n\t"        /* If old_val != 0, lock was already held */
        : "=&r"(old_val)
        : "r"(one), "r"(lock)
        : "memory"
    );
}

static inline void spinlock_amo_release(volatile uint32_t *lock) {
    __asm__ volatile (
        "amoswap.w.rl zero, zero, (%0)\n\t" /* Release semantics: drains SB then writes 0 */
        :: "r"(lock)
        : "memory"
    );
}

/* ============================================================================
 * 4. Atomic Fetch-and-Add (amoadd.w)
 * ============================================================================ */
static inline uint32_t atomic_fetch_add(volatile uint32_t *ptr, uint32_t val) {
    uint32_t old_val;
    __asm__ volatile (
        "amoadd.w.aqrl %0, %1, (%2)\n\t"
        : "=r"(old_val)
        : "r"(val), "r"(ptr)
        : "memory"
    );
    return old_val;
}

#endif /* ATOMIC_SPINLOCK_H */
