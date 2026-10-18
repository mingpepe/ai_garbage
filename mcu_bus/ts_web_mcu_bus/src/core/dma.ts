import {
  DmaState,
  BusMaster,
  DMA_REG_ISR,
  DMA_REG_IFCR,
  DMA_REG_CCR,
  DMA_REG_CNDTR,
  DMA_REG_CPAR,
  DMA_REG_CMAR,
  DMA_CCR_EN,
  DMA_CCR_TCIE,
  DMA_CCR_HTIE,
  DMA_CCR_TEIE,
  DMA_CCR_DIR_MASK,
  DMA_CCR_DIR_P2M,
  DMA_CCR_DIR_M2P,
  DMA_CCR_DIR_P2P,
  DMA_CCR_CIRC,
  DMA_CCR_PINC,
  DMA_CCR_MINC,
  DMA_CCR_PL_MASK,
  DMA_FLAG_GIF,
  DMA_FLAG_TCIF,
  DMA_FLAG_HTIF,
  DMA_FLAG_TEIF
} from "./constants.ts";
import type { BusArbiter, BusTransaction } from "./bus.ts";

export class DmaController {
  isr = 0;
  ccr = 0;
  cndtr = 0;
  cpar = 0;
  cmar = 0;

  cndtrReload = 0;
  cparOrig = 0;
  cmarOrig = 0;
  dataLatch = 0;
  state: DmaState = DmaState.IDLE;

  rxReqLine = false;
  txReqLine = false;
  irqLine = false;

  totalTransferred = 0;
  busStalls = 0;
  lastEventMsg = "DMA Initialized";

  onLog?: (msg: string) => void;

  reset(): void {
    this.isr = 0;
    this.ccr = 0;
    this.cndtr = 0;
    this.cpar = 0;
    this.cmar = 0;
    this.cndtrReload = 0;
    this.cparOrig = 0;
    this.cmarOrig = 0;
    this.dataLatch = 0;
    this.state = DmaState.IDLE;
    this.rxReqLine = false;
    this.txReqLine = false;
    this.irqLine = false;
    this.totalTransferred = 0;
    this.busStalls = 0;
    this.lastEventMsg = "DMA Reset";
  }

  configure(
    srcAddr: number,
    dstAddr: number,
    count: number,
    dirMode: number,
    circ: boolean,
    pinc: boolean,
    minc: boolean,
    priority: number
  ): void {
    this.cpar = srcAddr;
    this.cparOrig = srcAddr;
    this.cmar = dstAddr;
    this.cmarOrig = dstAddr;
    this.cndtr = count;
    this.cndtrReload = count;

    this.ccr = DMA_CCR_TCIE | DMA_CCR_TEIE | (dirMode & DMA_CCR_DIR_MASK);
    if (circ) this.ccr |= DMA_CCR_CIRC;
    if (pinc) this.ccr |= DMA_CCR_PINC;
    if (minc) this.ccr |= DMA_CCR_MINC;
    this.ccr |= ((priority & 3) << 9);

    this.state = DmaState.IDLE;
    this.lastEventMsg = `Configured: 0x${srcAddr.toString(16).padStart(8, "0").toUpperCase()} -> 0x${dstAddr.toString(16).padStart(8, "0").toUpperCase()} (${count} bytes)`;
    this.onLog?.(`[DMA] ${this.lastEventMsg}`);
  }

  start(): void {
    this.ccr |= DMA_CCR_EN;
    this.state = DmaState.WAIT_REQ;
    this.lastEventMsg = `DMA Started, CNDTR=${this.cndtr}`;
    this.onLog?.(`[DMA] ${this.lastEventMsg}`);
  }

  stop(): void {
    this.ccr &= ~DMA_CCR_EN;
    this.state = DmaState.IDLE;
    this.lastEventMsg = "DMA Stopped";
    this.onLog?.(`[DMA] ${this.lastEventMsg}`);
  }

  tickHandshake(rxReq: boolean, txReq: boolean): void {
    this.rxReqLine = rxReq;
    this.txReqLine = txReq;

    if ((this.ccr & DMA_CCR_EN) === 0) {
      if (this.state !== DmaState.COMPLETE) this.state = DmaState.IDLE;
      return;
    }

    if (this.state === DmaState.WAIT_REQ) {
      const dir = this.ccr & DMA_CCR_DIR_MASK;
      let ready = false;

      if (dir === DMA_CCR_DIR_P2P) {
        ready = this.rxReqLine && this.txReqLine;
      } else if (dir === DMA_CCR_DIR_P2M) {
        ready = this.rxReqLine;
      } else if (dir === DMA_CCR_DIR_M2P) {
        ready = this.txReqLine;
      }

      if (ready) {
        this.state = DmaState.REQ_SRC;
        this.lastEventMsg = "DREQ Trigger Active -> Requesting Bus for Source Read";
      }
    }
  }

  prepareBusRequest(bus: BusArbiter): void {
    if ((this.ccr & DMA_CCR_EN) === 0) return;

    const priority = (this.ccr & DMA_CCR_PL_MASK) >> 9;
    const mappedPrio = 3 - priority;

    if (this.state === DmaState.REQ_SRC) {
      const srcAddr = (this.ccr & DMA_CCR_DIR_MASK) === DMA_CCR_DIR_M2P ? this.cmar : this.cpar;
      bus.requestDma(srcAddr, false, 0, mappedPrio, "DMA Read Source");
    } else if (this.state === DmaState.REQ_DST) {
      const dstAddr = (this.ccr & DMA_CCR_DIR_MASK) === DMA_CCR_DIR_M2P ? this.cpar : this.cmar;
      bus.requestDma(dstAddr, true, this.dataLatch, mappedPrio, "DMA Write Destination");
    }
  }

  onBusGranted(trans: BusTransaction): void {
    if (trans.grantedMaster === BusMaster.DMA) {
      if (this.state === DmaState.REQ_SRC) {
        this.dataLatch = trans.rdata & 0xFF;
        this.state = DmaState.REQ_DST;
        this.lastEventMsg = `Latched 0x${this.dataLatch.toString(16).padStart(2, "0").toUpperCase()} from 0x${trans.addr.toString(16).padStart(8, "0").toUpperCase()}`;
        this.onLog?.(`[DMA] Read Source: 0x${this.dataLatch.toString(16).padStart(2, "0").toUpperCase()} (from 0x${trans.addr.toString(16).padStart(8, "0").toUpperCase()})`);
      } else if (this.state === DmaState.REQ_DST) {
        this.state = DmaState.UPDATE;
        this.lastEventMsg = `Committed 0x${this.dataLatch.toString(16).padStart(2, "0").toUpperCase()} to 0x${trans.addr.toString(16).padStart(8, "0").toUpperCase()}`;
        this.onLog?.(`[DMA] Write Dest: 0x${this.dataLatch.toString(16).padStart(2, "0").toUpperCase()} (to 0x${trans.addr.toString(16).padStart(8, "0").toUpperCase()})`);

        this.totalTransferred++;
        if (this.cndtr > 0) this.cndtr--;

        if (this.ccr & DMA_CCR_PINC) this.cpar++;
        if (this.ccr & DMA_CCR_MINC) this.cmar++;

        if (this.cndtrReload > 1 && this.cndtr === Math.floor(this.cndtrReload / 2)) {
          this.isr |= DMA_FLAG_HTIF | DMA_FLAG_GIF;
          if (this.ccr & DMA_CCR_HTIE) this.irqLine = true;
        }

        if (this.cndtr === 0) {
          this.isr |= DMA_FLAG_TCIF | DMA_FLAG_GIF;
          if (this.ccr & DMA_CCR_TCIE) this.irqLine = true;

          if (this.ccr & DMA_CCR_CIRC) {
            this.cndtr = this.cndtrReload;
            this.cpar = this.cparOrig;
            this.cmar = this.cmarOrig;
            this.state = DmaState.WAIT_REQ;
            this.lastEventMsg = `Circular Reload (CNDTR=${this.cndtr})`;
            this.onLog?.(`[DMA] ${this.lastEventMsg}`);
          } else {
            this.ccr &= ~DMA_CCR_EN;
            this.state = DmaState.COMPLETE;
            this.lastEventMsg = "Transfer Complete (TCIF asserted)";
            this.onLog?.(`[DMA] >>> TRANSFER COMPLETE! (IRQ Asserted: ${this.irqLine})`);
          }
        } else {
          this.state = DmaState.WAIT_REQ;
        }
      }
    } else {
      if (this.state === DmaState.REQ_SRC || this.state === DmaState.REQ_DST) {
        this.busStalls++;
        this.lastEventMsg = `Bus Stalled (Arbiter granted ${trans.grantedMaster})`;
        this.onLog?.(`[DMA] Stalled by bus arbiter`);
      }
    }
  }

  readReg(offset: number): number {
    switch (offset) {
      case DMA_REG_ISR: return this.isr;
      case DMA_REG_CCR: return this.ccr;
      case DMA_REG_CNDTR: return this.cndtr;
      case DMA_REG_CPAR: return this.cpar;
      case DMA_REG_CMAR: return this.cmar;
      default: return 0;
    }
  }

  writeReg(offset: number, value: number): void {
    switch (offset) {
      case DMA_REG_IFCR:
        if ((value & DMA_FLAG_GIF) !== 0) {
          this.isr = 0;
          this.irqLine = false;
        } else {
          this.isr &= ~(value & 0x0F);
          if ((this.isr & (DMA_FLAG_TCIF | DMA_FLAG_HTIF | DMA_FLAG_TEIF)) === 0) {
            this.isr &= ~DMA_FLAG_GIF;
            this.irqLine = false;
          }
        }
        break;
      case DMA_REG_CCR: {
        const wasEn = (this.ccr & DMA_CCR_EN) !== 0;
        this.ccr = value;
        const isEn = (this.ccr & DMA_CCR_EN) !== 0;
        if (!wasEn && isEn) this.state = DmaState.WAIT_REQ;
        else if (wasEn && !isEn) this.state = DmaState.IDLE;
        break;
      }
      case DMA_REG_CNDTR:
        if ((this.ccr & DMA_CCR_EN) === 0) {
          this.cndtr = value;
          this.cndtrReload = value;
        }
        break;
      case DMA_REG_CPAR:
        if ((this.ccr & DMA_CCR_EN) === 0) {
          this.cpar = value;
          this.cparOrig = value;
        }
        break;
      case DMA_REG_CMAR:
        if ((this.ccr & DMA_CCR_EN) === 0) {
          this.cmar = value;
          this.cmarOrig = value;
        }
        break;
    }
  }
}
