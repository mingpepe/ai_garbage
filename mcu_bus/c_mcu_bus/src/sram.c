#include "../include/sram.h"
#include <string.h>

void sram_init(sram_t *sram) {
    if (!sram) return;
    memset(sram->data, 0, sizeof(sram->data));
}

uint32_t sram_read(sram_t *sram, uint32_t addr) {
    uint32_t offset = addr - SRAM_BASE;
    if (offset < SRAM_SIZE) {
        return sram->data[offset];
    }
    return 0;
}

void sram_write(sram_t *sram, uint32_t addr, uint32_t data) {
    uint32_t offset = addr - SRAM_BASE;
    if (offset < SRAM_SIZE) {
        sram->data[offset] = (uint8_t)(data & 0xFF);
    }
}
