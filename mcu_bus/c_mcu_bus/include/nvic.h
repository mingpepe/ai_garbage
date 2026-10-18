#ifndef MCU_NVIC_H
#define MCU_NVIC_H

#include "common.h"

typedef struct {
    uint32_t iser; /* Interrupt Set Enable */
    uint32_t ispr; /* Interrupt Set Pending */
    uint32_t iabr; /* Interrupt Active Bit */
    uint8_t  priority[IRQ_COUNT];
} nvic_t;

void nvic_init(nvic_t *nvic);
void nvic_set_pending(nvic_t *nvic, int irq_num);
void nvic_clear_pending(nvic_t *nvic, int irq_num);
bool nvic_is_pending(const nvic_t *nvic, int irq_num);
int  nvic_acknowledge(nvic_t *nvic); /* Returns IRQ number or -1 */
void nvic_complete(nvic_t *nvic, int irq_num);

uint32_t nvic_read_reg(nvic_t *nvic, uint32_t offset);
void nvic_write_reg(nvic_t *nvic, uint32_t offset, uint32_t value);

#endif /* MCU_NVIC_H */
