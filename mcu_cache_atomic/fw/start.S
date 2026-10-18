.section .text.init
.global _start

_start:
    /* Read hardware thread ID (mhartid = CSR 0xF14): 0 for Core 0, 1 for Core 1 */
    csrr a0, 0xF14

    /* Set per-core local stack in DTCM (0x2000..0x2FFF) so stack accesses
       do not pollute the Shared L1 Cache & Store Buffer demo traces */
    li   sp, 0x2400
    slli t0, a0, 10        /* t0 = hartid * 0x400 */
    add  sp, sp, t0        /* Core 0 SP = 0x2400, Core 1 SP = 0x2800 */

    /* Call C entry point: main(uint32_t hartid) */
    jal  ra, main

halt_loop:
    ebreak
    j    halt_loop
