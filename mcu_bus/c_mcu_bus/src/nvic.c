#include "../include/nvic.h"
#include <string.h>

void nvic_init(nvic_t *nvic) {
    if (!nvic) return;
    memset(nvic, 0, sizeof(nvic_t));
    nvic->iser = 0xFFFFFFFFU; /* All interrupts enabled by default */
    for (int i = 0; i < IRQ_COUNT; i++) {
        nvic->priority[i] = (uint8_t)i;
    }
}

void nvic_set_pending(nvic_t *nvic, int irq_num) {
    if (!nvic || irq_num < 0 || irq_num >= IRQ_COUNT) return;
    nvic->ispr |= (1U << irq_num);
}

void nvic_clear_pending(nvic_t *nvic, int irq_num) {
    if (!nvic || irq_num < 0 || irq_num >= IRQ_COUNT) return;
    nvic->ispr &= ~(1U << irq_num);
}

bool nvic_is_pending(const nvic_t *nvic, int irq_num) {
    if (!nvic || irq_num < 0 || irq_num >= IRQ_COUNT) return false;
    return (nvic->ispr & (1U << irq_num)) != 0;
}

int nvic_acknowledge(nvic_t *nvic) {
    if (!nvic) return -1;
    uint32_t active_pending = nvic->ispr & nvic->iser;
    if (active_pending == 0) return -1;
    
    /* Find highest priority (lowest number in our scheme) */
    int selected = -1;
    for (int i = 0; i < IRQ_COUNT; i++) {
        if (active_pending & (1U << i)) {
            selected = i;
            break;
        }
    }
    
    if (selected >= 0) {
        nvic->ispr &= ~(1U << selected);
        nvic->iabr |= (1U << selected);
    }
    return selected;
}

void nvic_complete(nvic_t *nvic, int irq_num) {
    if (!nvic || irq_num < 0 || irq_num >= IRQ_COUNT) return;
    nvic->iabr &= ~(1U << irq_num);
}

uint32_t nvic_read_reg(nvic_t *nvic, uint32_t offset) {
    if (!nvic) return 0;
    switch (offset) {
        case 0x00: return nvic->iser;
        case 0x04: return nvic->iser; /* ICER reads ISER state */
        case 0x08: return nvic->ispr;
        case 0x0C: return nvic->ispr; /* ICPR reads ISPR state */
        case 0x10: return nvic->iabr;
        default:   return 0;
    }
}

void nvic_write_reg(nvic_t *nvic, uint32_t offset, uint32_t value) {
    if (!nvic) return;
    switch (offset) {
        case 0x00: nvic->iser |= value; break;  /* ISER: set bits */
        case 0x04: nvic->iser &= ~value; break; /* ICER: clear bits */
        case 0x08: nvic->ispr |= value; break;  /* ISPR: set bits */
        case 0x0C: nvic->ispr &= ~value; break; /* ICPR: clear bits */
        default: break;
    }
}
