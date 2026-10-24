#ifndef UART_H
#define UART_H

#include <stdint.h>
#include "soc_mmap.h"
#include "spinlock.h"

static inline void uart_putc(char c) {
    REG_UART_TX = (uint32_t)(uint8_t)c;
}

static inline void uart_puts(const char *s) {
    while (*s) {
        uart_putc(*s++);
    }
}

static inline void uart_put_dec(uint32_t val) {
    char buf[12];
    int i = 0;
    if (val == 0) {
        uart_putc('0');
        return;
    }
    while (val > 0) {
        buf[i++] = (char)('0' + (val % 10));
        val /= 10;
    }
    while (i > 0) {
        uart_putc(buf[--i]);
    }
}

static inline void uart_put_hex(uint32_t val) {
    const char *hex = "0123456789ABCDEF";
    uart_puts("0x");
    for (int i = 28; i >= 0; i -= 4) {
        uart_putc(hex[(val >> i) & 0xF]);
    }
}

// Thread/Core-safe print helper using Shared Memory uart_lock spinlock
static inline void uart_log_msg(uint32_t core_id, const char *msg) {
    spin_lock(&SHM->uart_lock);
    uart_puts("[Core");
    uart_putc((char)('0' + core_id));
    uart_puts("] ");
    uart_puts(msg);
    uart_putc('\n');
    spin_unlock(&SHM->uart_lock);
}

static inline void uart_log_key_val(uint32_t core_id, const char *msg, uint32_t val) {
    spin_lock(&SHM->uart_lock);
    uart_puts("[Core");
    uart_putc((char)('0' + core_id));
    uart_puts("] ");
    uart_puts(msg);
    uart_put_dec(val);
    uart_putc('\n');
    spin_unlock(&SHM->uart_lock);
}

#endif // UART_H
