import { BusMaster } from "./constants.ts";
import type { McuSystem } from "./mcuSystem.ts";

export interface BusRequest {
  master: BusMaster;
  addr: number;
  isWrite: boolean;
  wdata: number;
  priority: number;
  opName: string;
}

export interface BusTransaction {
  grantedMaster: BusMaster;
  addr: number;
  isWrite: boolean;
  wdata: number;
  rdata: number;
  active: boolean;
  description: string;
}

export class BusArbiter {
  cycle = 0;
  lastGranted: BusMaster = BusMaster.NONE;
  cpuReq: BusRequest | null = null;
  dmaReq: BusRequest | null = null;
  lastTransaction: BusTransaction = {
    grantedMaster: BusMaster.NONE,
    addr: 0,
    isWrite: false,
    wdata: 0,
    rdata: 0,
    active: false,
    description: "Idle"
  };

  totalCycles = 0;
  idleCycles = 0;
  cpuGrants = 0;
  dmaGrants = 0;
  busContentions = 0;

  reset(): void {
    this.cycle = 0;
    this.lastGranted = BusMaster.NONE;
    this.cpuReq = null;
    this.dmaReq = null;
    this.lastTransaction = {
      grantedMaster: BusMaster.NONE,
      addr: 0,
      isWrite: false,
      wdata: 0,
      rdata: 0,
      active: false,
      description: "Idle"
    };
    this.totalCycles = 0;
    this.idleCycles = 0;
    this.cpuGrants = 0;
    this.dmaGrants = 0;
    this.busContentions = 0;
  }

  beginCycle(cycle: number): void {
    this.cycle = cycle;
    this.totalCycles++;
    this.cpuReq = null;
    this.dmaReq = null;
    this.lastTransaction = {
      grantedMaster: BusMaster.NONE,
      addr: 0,
      isWrite: false,
      wdata: 0,
      rdata: 0,
      active: false,
      description: "Idle"
    };
  }

  requestCpu(addr: number, isWrite: boolean, wdata: number, priority: number, opName: string): void {
    this.cpuReq = {
      master: BusMaster.CPU,
      addr,
      isWrite,
      wdata,
      priority,
      opName
    };
  }

  requestDma(addr: number, isWrite: boolean, wdata: number, priority: number, opName: string): void {
    this.dmaReq = {
      master: BusMaster.DMA,
      addr,
      isWrite,
      wdata,
      priority,
      opName
    };
  }

  commit(sys: McuSystem): BusTransaction {
    const cpuWants = this.cpuReq !== null;
    const dmaWants = this.dmaReq !== null;

    if (!cpuWants && !dmaWants) {
      this.idleCycles++;
      this.lastTransaction = {
        grantedMaster: BusMaster.NONE,
        addr: 0,
        isWrite: false,
        wdata: 0,
        rdata: 0,
        active: false,
        description: "Bus Idle"
      };
      return this.lastTransaction;
    }

    let winner = BusMaster.NONE;
    let winReq: BusRequest;

    if (cpuWants && !dmaWants) {
      winner = BusMaster.CPU;
      winReq = this.cpuReq!;
    } else if (!cpuWants && dmaWants) {
      winner = BusMaster.DMA;
      winReq = this.dmaReq!;
    } else {
      // Both requested: Bus Contention!
      this.busContentions++;
      if (this.dmaReq!.priority < this.cpuReq!.priority) {
        winner = BusMaster.DMA;
        winReq = this.dmaReq!;
      } else if (this.cpuReq!.priority < this.dmaReq!.priority) {
        winner = BusMaster.CPU;
        winReq = this.cpuReq!;
      } else {
        // Equal priority: Round-Robin
        if (this.lastGranted === BusMaster.DMA) {
          winner = BusMaster.CPU;
          winReq = this.cpuReq!;
        } else {
          winner = BusMaster.DMA;
          winReq = this.dmaReq!;
        }
      }
    }

    const trans: BusTransaction = {
      grantedMaster: winner,
      addr: winReq.addr,
      isWrite: winReq.isWrite,
      wdata: winReq.wdata,
      rdata: 0,
      active: true,
      description: winReq.opName
    };

    if (trans.isWrite) {
      sys.busWrite(trans.addr, trans.wdata);
    } else {
      trans.rdata = sys.busRead(trans.addr);
    }

    if (winner === BusMaster.DMA) this.dmaGrants++;
    else if (winner === BusMaster.CPU) this.cpuGrants++;

    this.lastGranted = winner;
    this.lastTransaction = trans;

    if (dmaWants) sys.dma.onBusGranted(trans);
    if (cpuWants) sys.cpu.onBusGranted(trans);

    return trans;
  }
}
