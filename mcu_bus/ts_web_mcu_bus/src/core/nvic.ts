import { IRQ_COUNT } from "./constants.ts";

export class Nvic {
  iser = 0xFFFFFFFF;
  ispr = 0;
  iabr = 0;

  reset(): void {
    this.iser = 0xFFFFFFFF;
    this.ispr = 0;
    this.iabr = 0;
  }

  setPending(irq: number): void {
    if (irq >= 0 && irq < IRQ_COUNT) {
      this.ispr |= (1 << irq);
    }
  }

  clearPending(irq: number): void {
    if (irq >= 0 && irq < IRQ_COUNT) {
      this.ispr &= ~(1 << irq);
    }
  }

  acknowledge(): number {
    const activePending = this.ispr & this.iser;
    if (activePending === 0) return -1;

    for (let i = 0; i < IRQ_COUNT; i++) {
      if ((activePending & (1 << i)) !== 0) {
        this.ispr &= ~(1 << i);
        this.iabr |= (1 << i);
        return i;
      }
    }
    return -1;
  }

  complete(irq: number): void {
    if (irq >= 0 && irq < IRQ_COUNT) {
      this.iabr &= ~(1 << irq);
    }
  }

  readReg(offset: number): number {
    switch (offset) {
      case 0x00: return this.iser;
      case 0x04: return this.iser;
      case 0x08: return this.ispr;
      case 0x0C: return this.ispr;
      case 0x10: return this.iabr;
      default: return 0;
    }
  }

  writeReg(offset: number, value: number): void {
    switch (offset) {
      case 0x00: this.iser |= value; break;
      case 0x04: this.iser &= ~value; break;
      case 0x08: this.ispr |= value; break;
      case 0x0C: this.ispr &= ~value; break;
    }
  }
}
