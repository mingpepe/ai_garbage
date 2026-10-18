#ifndef MCU_SRAM_H
#define MCU_SRAM_H

#include "common.h"

typedef struct {
    uint8_t data[SRAM_SIZE];
} sram_t;

void sram_init(sram_t *sram);
uint32_t sram_read(sram_t *sram, uint32_t addr);
void sram_write(sram_t *sram, uint32_t addr, uint32_t data);

#endif /* MCU_SRAM_H */
