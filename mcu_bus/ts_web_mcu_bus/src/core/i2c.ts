import {
  I2C_CR_PE,
  I2C_CR_TXEIE,
  I2C_CR_DMATXEN,
  I2C_SR_TXE,
  I2C_SR_BUSY,
  I2C_REG_CR,
  I2C_REG_SR,
  I2C_REG_DR,
  I2C_REG_CNT
} from "./constants.ts";

export class I2c {
  fifoCapacity: number;
  cyclesPerByte: number;

  cr: number = I2C_CR_PE | I2C_CR_DMATXEN;
  sr: number = I2C_SR_TXE;
  txFifo: number[] = [];

  shiftCounter = 0;
  isTransmitting = false;
  shiftByte = 0;
  lastWireByte = 0;
  totalTransmitted = 0;
  irqTxe = false;

  onLog?: (msg: string) => void;
  onTransmitted?: (byte: number) => void;

  constructor(fifoCapacity = 2, cyclesPerByte = 4) {
    this.fifoCapacity = fifoCapacity;
    this.cyclesPerByte = cyclesPerByte;
  }

  get dmaReqTx(): boolean {
    return this.txFifo.length < this.fifoCapacity && (this.cr & I2C_CR_DMATXEN) !== 0;
  }

  get fifoCount(): number {
    return this.txFifo.length;
  }

  reset(): void {
    this.cr = I2C_CR_PE | I2C_CR_DMATXEN;
    this.sr = I2C_SR_TXE;
    this.txFifo = [];
    this.shiftCounter = 0;
    this.isTransmitting = false;
    this.shiftByte = 0;
    this.lastWireByte = 0;
    this.totalTransmitted = 0;
    this.irqTxe = false;
  }

  tick(): void {
    if (this.isTransmitting) {
      this.shiftCounter++;
      if (this.shiftCounter >= this.cyclesPerByte) {
        this.isTransmitting = false;
        this.shiftCounter = 0;
        this.totalTransmitted++;
        this.lastWireByte = this.shiftByte;
        this.onTransmitted?.(this.shiftByte);
        const char = this.shiftByte >= 32 && this.shiftByte <= 126 ? String.fromCharCode(this.shiftByte) : ".";
        this.onLog?.(`[I2C] >>> WIRE TRANSMIT COMPLETE: 0x${this.shiftByte.toString(16).padStart(2, "0").toUpperCase()} ('${char}') [Total: ${this.totalTransmitted}]`);
      }
    }

    if (!this.isTransmitting && this.txFifo.length > 0) {
      this.shiftByte = this.txFifo.shift()!;
      this.isTransmitting = true;
      this.shiftCounter = 0;
    }

    const canAccept = this.txFifo.length < this.fifoCapacity;
    this.sr = (canAccept ? I2C_SR_TXE : 0) | (this.isTransmitting ? I2C_SR_BUSY : 0);
    if (this.cr & I2C_CR_TXEIE) this.irqTxe = canAccept;
  }

  readReg(offset: number): number {
    switch (offset) {
      case I2C_REG_CR:
        return this.cr;
      case I2C_REG_SR:
        return this.sr;
      case I2C_REG_CNT:
        return this.txFifo.length;
      default:
        return 0;
    }
  }

  writeReg(offset: number, value: number): void {
    switch (offset) {
      case I2C_REG_CR:
        this.cr = value;
        break;
      case I2C_REG_DR: {
        const val = value & 0xFF;
        if (this.txFifo.length >= this.fifoCapacity) {
          this.onLog?.(`[I2C] >>> ERROR: TX FIFO Overflow! Dropping 0x${val.toString(16).padStart(2, "0").toUpperCase()}`);
          return;
        }
        this.txFifo.push(val);
        const canAccept = this.txFifo.length < this.fifoCapacity;
        this.sr = (canAccept ? I2C_SR_TXE : 0) | (this.isTransmitting ? I2C_SR_BUSY : 0);
        this.onLog?.(`[I2C] TX FIFO <= 0x${val.toString(16).padStart(2, "0").toUpperCase()} (FIFO: ${this.txFifo.length}/${this.fifoCapacity}, DMATxReq=${this.dmaReqTx ? 1 : 0})`);
        break;
      }
    }
  }
}
