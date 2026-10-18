import {
  UART_CR_UE,
  UART_CR_RXNEIE,
  UART_CR_DMARXEN,
  UART_SR_RXNE,
  UART_SR_ORE,
  UART_REG_CR,
  UART_REG_SR,
  UART_REG_DR,
  UART_REG_CNT
} from "./constants.ts";

export class Uart {
  fifoCapacity: number;
  cr: number = UART_CR_UE | UART_CR_DMARXEN;
  sr = 0;
  rxFifo: number[] = [];
  scheduled: Map<number, number[]> = new Map();

  irqRxne = false;
  irqOre = false;

  onLog?: (msg: string) => void;

  constructor(fifoCapacity = 4) {
    this.fifoCapacity = fifoCapacity;
  }

  get dmaReqRx(): boolean {
    return this.rxFifo.length > 0 && (this.cr & UART_CR_DMARXEN) !== 0;
  }

  get fifoCount(): number {
    return this.rxFifo.length;
  }

  reset(): void {
    this.cr = UART_CR_UE | UART_CR_DMARXEN;
    this.sr = 0;
    this.rxFifo = [];
    this.scheduled.clear();
    this.irqRxne = false;
    this.irqOre = false;
  }

  scheduleReceive(cycle: number, data: number): void {
    const list = this.scheduled.get(cycle) ?? [];
    list.push(data & 0xFF);
    this.scheduled.set(cycle, list);
  }

  injectRx(data: number): void {
    const val = data & 0xFF;
    if (this.rxFifo.length >= this.fifoCapacity) {
      this.sr |= UART_SR_ORE;
      this.irqOre = true;
      this.onLog?.(`[UART] >>> RX OVERRUN! Lost byte 0x${val.toString(16).padStart(2, "0").toUpperCase()} (FIFO full ${this.rxFifo.length}/${this.fifoCapacity})`);
      return;
    }

    this.rxFifo.push(val);
    this.sr |= UART_SR_RXNE;
    if (this.cr & UART_CR_RXNEIE) this.irqRxne = true;

    this.onLog?.(`[UART] RX <= 0x${val.toString(16).padStart(2, "0").toUpperCase()} (FIFO: ${this.rxFifo.length}/${this.fifoCapacity}, DMAReq=${this.dmaReqRx ? 1 : 0})`);
  }

  tick(cycle: number): void {
    const list = this.scheduled.get(cycle);
    if (list) {
      this.scheduled.delete(cycle);
      for (const b of list) {
        this.injectRx(b);
      }
    }

    if (this.rxFifo.length === 0) {
      this.sr &= ~UART_SR_RXNE;
      this.irqRxne = false;
    }
  }

  readReg(offset: number): number {
    switch (offset) {
      case UART_REG_CR:
        return this.cr;
      case UART_REG_SR:
        return this.sr;
      case UART_REG_DR:
        return this.popRx();
      case UART_REG_CNT:
        return this.rxFifo.length;
      default:
        return 0;
    }
  }

  private popRx(): number {
    if (this.rxFifo.length === 0) return 0;
    const b = this.rxFifo.shift()!;
    if (this.rxFifo.length === 0) {
      this.sr &= ~UART_SR_RXNE;
      this.irqRxne = false;
    }
    return b;
  }

  writeReg(offset: number, value: number): void {
    switch (offset) {
      case UART_REG_CR:
        this.cr = value;
        break;
      case UART_REG_SR:
        if ((value & UART_SR_ORE) === 0) {
          this.sr &= ~UART_SR_ORE;
          this.irqOre = false;
        }
        break;
    }
  }
}
