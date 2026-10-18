import { SRAM_BASE, SRAM_SIZE } from "./constants.ts";

export class Sram {
  memory = new Uint8Array(SRAM_SIZE);

  reset(): void {
    this.memory.fill(0);
  }

  read(addr: number): number {
    const offset = addr - SRAM_BASE;
    if (offset >= 0 && offset < SRAM_SIZE) {
      return this.memory[offset];
    }
    return 0;
  }

  write(addr: number, data: number): void {
    const offset = addr - SRAM_BASE;
    if (offset >= 0 && offset < SRAM_SIZE) {
      this.memory[offset] = data & 0xFF;
    }
  }
}
