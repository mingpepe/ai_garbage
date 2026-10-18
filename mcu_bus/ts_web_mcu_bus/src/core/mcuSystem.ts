import {
  SRAM_BASE,
  SRAM_SIZE,
  UART0_BASE,
  I2C0_BASE,
  DMA1_BASE,
  NVIC_BASE,
  IRQ_UART_ORE,
  IRQ_DMA1_CH1
} from "./constants.ts";
import { BusArbiter, type BusTransaction } from "./bus.ts";
import { Sram } from "./sram.ts";
import { Uart } from "./uart.ts";
import { I2c } from "./i2c.ts";
import { Nvic } from "./nvic.ts";
import { DmaController } from "./dma.ts";
import { Cpu } from "./cpu.ts";

export class McuSystem {
  cycle = 1;
  bus = new BusArbiter();
  sram = new Sram();
  uart = new Uart(4);
  i2c = new I2c(2, 4);
  nvic = new Nvic();
  dma = new DmaController();
  cpu = new Cpu(3);

  private prevOre = false;
  private prevDmaIrq = false;

  onSystemLog?: (msg: string) => void;

  constructor() {
    this.uart.onLog = (msg) => this.log(msg);
    this.i2c.onLog = (msg) => this.log(msg);
    this.dma.onLog = (msg) => this.log(msg);
    this.cpu.onLog = (msg) => this.log(msg);
  }

  private log(msg: string): void {
    this.onSystemLog?.(`[Cyc ${this.cycle.toString().padStart(3, "0")}] ${msg}`);
  }

  reset(): void {
    this.cycle = 1;
    this.bus.reset();
    this.sram.reset();
    this.uart.reset();
    this.i2c.reset();
    this.nvic.reset();
    this.dma.reset();
    this.cpu.reset();
    this.prevOre = false;
    this.prevDmaIrq = false;
    this.log("[SYSTEM] MCU SoC Reset to cycle 1.");
  }

  busRead(addr: number): number {
    if (addr >= SRAM_BASE && addr < SRAM_BASE + SRAM_SIZE) {
      return this.sram.read(addr);
    }
    if (addr >= UART0_BASE && addr < UART0_BASE + 0x100) {
      return this.uart.readReg(addr - UART0_BASE);
    }
    if (addr >= I2C0_BASE && addr < I2C0_BASE + 0x100) {
      return this.i2c.readReg(addr - I2C0_BASE);
    }
    if (addr >= DMA1_BASE && addr < DMA1_BASE + 0x100) {
      return this.dma.readReg(addr - DMA1_BASE);
    }
    if (addr >= NVIC_BASE && addr < NVIC_BASE + 0x100) {
      return this.nvic.readReg(addr - NVIC_BASE);
    }
    return 0;
  }

  busWrite(addr: number, data: number): void {
    if (addr >= SRAM_BASE && addr < SRAM_BASE + SRAM_SIZE) {
      this.sram.write(addr, data);
      return;
    }
    if (addr >= UART0_BASE && addr < UART0_BASE + 0x100) {
      this.uart.writeReg(addr - UART0_BASE, data);
      return;
    }
    if (addr >= I2C0_BASE && addr < I2C0_BASE + 0x100) {
      this.i2c.writeReg(addr - I2C0_BASE, data);
      return;
    }
    if (addr >= DMA1_BASE && addr < DMA1_BASE + 0x100) {
      this.dma.writeReg(addr - DMA1_BASE, data);
      return;
    }
    if (addr >= NVIC_BASE && addr < NVIC_BASE + 0x100) {
      this.nvic.writeReg(addr - NVIC_BASE, data);
      return;
    }
  }

  step(): BusTransaction {
    const curCycle = this.cycle;

    /* 1. Begin bus */
    this.bus.beginCycle(curCycle);

    /* 2. Clock peripherals */
    this.uart.tick(curCycle);
    this.i2c.tick();

    /* 3. Interrupt edge detection */
    if (this.uart.irqOre && !this.prevOre) {
      this.nvic.setPending(IRQ_UART_ORE);
    }
    this.prevOre = this.uart.irqOre;

    if (this.dma.irqLine && !this.prevDmaIrq) {
      this.nvic.setPending(IRQ_DMA1_CH1);
    }
    this.prevDmaIrq = this.dma.irqLine;

    /* 4. Propagate hardware handshake lines */
    this.dma.tickHandshake(this.uart.dmaReqRx, this.i2c.dmaReqTx);

    /* 5. Prepare master requests */
    this.cpu.prepareBusRequest(this.bus, this.nvic, curCycle);
    this.dma.prepareBusRequest(this.bus);

    /* 6. Commit bus */
    const trans = this.bus.commit(this);

    /* 7. CPU executes and handles ISRs */
    this.cpu.tick(this.nvic, curCycle);

    this.cycle++;
    return trans;
  }
}
