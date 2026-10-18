import {
  BusMaster,
  DMA1_BASE,
  DMA_REG_IFCR,
  DMA_FLAG_TCIF,
  DMA_FLAG_GIF,
  UART0_BASE,
  UART_REG_SR,
  I2C0_BASE,
  I2C_REG_SR,
  IRQ_DMA1_CH1,
  IRQ_UART_ORE
} from "./constants.ts";
import type { BusArbiter, BusTransaction } from "./bus.ts";
import type { Nvic } from "./nvic.ts";

export enum CpuState {
  RUNNING = "RUNNING",
  ISR = "ISR",
  STALLED = "STALLED"
}

export class Cpu {
  state: CpuState = CpuState.RUNNING;
  currentIrq = -1;
  isrRemainingCycles = 0;
  pollInterval: number;
  busStalls = 0;
  currentOp = "Running (Background)";
  lastReadVal = 0;

  onLog?: (msg: string) => void;

  constructor(pollInterval = 3) {
    this.pollInterval = pollInterval;
  }

  reset(): void {
    this.state = CpuState.RUNNING;
    this.currentIrq = -1;
    this.isrRemainingCycles = 0;
    this.busStalls = 0;
    this.currentOp = "Running (Background)";
    this.lastReadVal = 0;
  }

  prepareBusRequest(bus: BusArbiter, _nvic: Nvic, cycle: number): void {
    void _nvic;
    if (this.state === CpuState.ISR) {
      if (this.currentIrq === IRQ_DMA1_CH1) {
        bus.requestCpu(DMA1_BASE + DMA_REG_IFCR, true, DMA_FLAG_TCIF | DMA_FLAG_GIF, 1, "CPU ISR: Clear DMA TC Flag");
        return;
      }
      if (this.currentIrq === IRQ_UART_ORE) {
        bus.requestCpu(UART0_BASE + UART_REG_SR, true, 0, 1, "CPU ISR: Clear UART ORE");
        return;
      }
    }

    if (cycle % this.pollInterval === 0) {
      bus.requestCpu(I2C0_BASE + I2C_REG_SR, false, 0, 2, "CPU: Poll I2C Status");
    }
  }

  onBusGranted(trans: BusTransaction): void {
    if (trans.grantedMaster === BusMaster.CPU) {
      this.lastReadVal = trans.rdata;
      const dataVal = trans.isWrite ? trans.wdata : trans.rdata;
      this.currentOp = `Op Done: ${trans.description} (Data=0x${dataVal.toString(16).padStart(2, "0").toUpperCase()})`;
      this.onLog?.(`[CPU] ${this.currentOp}`);
    } else {
      this.busStalls++;
      this.currentOp = "Bus Stalled (DMA Preempted)";
      this.onLog?.(`[CPU] Bus stalled by DMA`);
    }
  }

  tick(nvic: Nvic, cycle: number): void {
    void cycle;
    if (this.state === CpuState.ISR) {
      this.isrRemainingCycles--;
      if (this.isrRemainingCycles <= 0) {
        this.onLog?.(`[CPU] <<< EXIT ISR: IRQ ${this.currentIrq}`);
        nvic.complete(this.currentIrq);
        this.currentIrq = -1;
        this.state = CpuState.RUNNING;
        this.currentOp = "Running (Background)";
      }
      return;
    }

    const irq = nvic.acknowledge();
    if (irq >= 0) {
      this.state = CpuState.ISR;
      this.currentIrq = irq;
      this.isrRemainingCycles = 2;
      const irqName = irq === IRQ_DMA1_CH1 ? "DMA TC" :
                      irq === IRQ_UART_ORE ? "UART Overrun" :
                      irq === 0 ? "UART RXNE" : "I2C TXE";
      this.onLog?.(`[CPU] >>> ENTER ISR: IRQ ${irq} (${irqName})`);
      this.currentOp = `Executing ISR (IRQ ${irq})`;
    }
  }
}
