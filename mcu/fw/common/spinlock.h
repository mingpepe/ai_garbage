#ifndef SPINLOCK_H
#define SPINLOCK_H

#include <stdint.h>

// ============================================================================
// Spinlock Implementation using RISC-V RV32A Atomic Instructions & Shared Memory
// ============================================================================

// Acquire spinlock using AMOSWAP.W.AQ
// Atomically swaps 1 into *lock and spins while previous value was 1 (already locked)
static inline void spin_lock(volatile uint32_t *lock) {
    uint32_t prev;
    uint32_t one = 1;
    do {
        __asm__ volatile (
            "amoswap.w.aq %0, %2, (%1)"
            : "=r"(prev)
            : "r"(lock), "r"(one)
            : "memory"
        );
    } while (prev != 0);
}

// Release spinlock using AMOSWAP.W.RL
static inline void spin_unlock(volatile uint32_t *lock) {
    __asm__ volatile (
        "amoswap.w.rl zero, zero, (%0)"
        :
        : "r"(lock)
        : "memory"
    );
}

// Acquire spinlock using LR.W (Load-Reserved) & SC.W (Store-Conditional)
// Demonstrates hardware reservation tracking & conditional store on Shared Memory
static inline void spin_lock_lrsc(volatile uint32_t *lock) {
    uint32_t tmp, status;
    uint32_t one = 1;
    __asm__ volatile (
        "1:\n\t"
        "lr.w    %0, (%2)\n\t"       // Load-Reserved current lock word
        "bnez    %0, 1b\n\t"         // Spin if lock != 0
        "sc.w.aq %1, %3, (%2)\n\t"   // Store-Conditional 1 to lock
        "bnez    %1, 1b\n\t"         // Retry if reservation was lost
        : "=&r"(tmp), "=&r"(status)
        : "r"(lock), "r"(one)
        : "memory"
    );
}

// Atomic Fetch-and-Add on Shared Memory using AMOADD.W
static inline uint32_t atomic_fetch_add(volatile uint32_t *addr, uint32_t val) {
    uint32_t old;
    __asm__ volatile (
        "amoadd.w %0, %2, (%1)"
        : "=r"(old)
        : "r"(addr), "r"(val)
        : "memory"
    );
    return old;
}

#endif // SPINLOCK_H
