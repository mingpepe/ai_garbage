import { McuSystem } from "./core/mcuSystem.ts";
import { GtkWaveViewer } from "./ui/gtkwaveViewer.ts";
import {
  UART0_BASE,
  UART_REG_DR,
  I2C0_BASE,
  I2C_REG_DR,
  SRAM_BASE,
  DMA_CCR_DIR_P2P,
  DMA_CCR_DIR_P2M,
  BusMaster,
  DmaState
} from "./core/constants.ts";
import { CpuState } from "./core/cpu.ts";

const sys = new McuSystem();

// GTKWave Viewer
const gtkCanvasEl = document.getElementById("gtkwaveCanvas") as HTMLCanvasElement;
const gtkSigListEl = document.getElementById("gtkwSignalList")!;
const gtkCursorInfoEl = document.getElementById("gtkwCursorInfo")!;
const gtkViewer = new GtkWaveViewer(gtkCanvasEl, gtkSigListEl, gtkCursorInfoEl);

// State variables
let isRunning = false;
let runTimerId: number | null = null;
let clockHz = 4.0;

// DOM Elements
const cycleCountEl = document.getElementById("cycleCount")!;
const dmaStateBadgeEl = document.getElementById("dmaStateBadge")!;
const btnStepCycle = document.getElementById("btnStepCycle")!;
const btnStepDma = document.getElementById("btnStepDma")!;
const btnRunPause = document.getElementById("btnRunPause")!;
const btnReset = document.getElementById("btnReset")!;
const speedSlider = document.getElementById("speedSlider") as HTMLInputElement;
const speedValEl = document.getElementById("speedVal")!;
const btnPresetP2P = document.getElementById("btnPresetP2P")!;
const btnPresetP2M = document.getElementById("btnPresetP2M")!;

// GTKWave Toolbar Buttons
const btnGtkZoomIn = document.getElementById("btnGtkZoomIn")!;
const btnGtkZoomOut = document.getElementById("btnGtkZoomOut")!;
const btnGtkZoomFit = document.getElementById("btnGtkZoomFit")!;
const btnGtkLeft = document.getElementById("btnGtkLeft")!;
const btnGtkRight = document.getElementById("btnGtkRight")!;
const btnLoadVerilogVcd = document.getElementById("btnLoadVerilogVcd")!;
const fileVcdUpload = document.getElementById("fileVcdUpload") as HTMLInputElement;

const busWinnerVal = document.getElementById("busWinnerVal")!;
const busAddrVal = document.getElementById("busAddrVal")!;
const busRwVal = document.getElementById("busRwVal")!;
const busDataVal = document.getElementById("busDataVal")!;
const busDescVal = document.getElementById("busDescVal")!;
const busCard = document.getElementById("busCard")!;
const busContentionBadge = document.getElementById("busContentionBadge")!;

const statDmaGrants = document.getElementById("statDmaGrants")!;
const statCpuGrants = document.getElementById("statCpuGrants")!;
const statContentions = document.getElementById("statContentions")!;
const statIdle = document.getElementById("statIdle")!;

const cpuStateVal = document.getElementById("cpuStateVal")!;
const cpuStallsVal = document.getElementById("cpuStallsVal")!;
const cpuOpVal = document.getElementById("cpuOpVal")!;
const nvicIsprVal = document.getElementById("nvicIsprVal")!;

const ledUartRx = document.getElementById("ledUartRx")!;
const ledI2cTx = document.getElementById("ledI2cTx")!;
const ledDmaIrq = document.getElementById("ledDmaIrq")!;

const dmaCcrVal = document.getElementById("dmaCcrVal")!;
const dmaCparVal = document.getElementById("dmaCparVal")!;
const dmaCmarVal = document.getElementById("dmaCmarVal")!;
const dmaCndtrVal = document.getElementById("dmaCndtrVal")!;
const dmaLatchVal = document.getElementById("dmaLatchVal")!;
const dmaStatsVal = document.getElementById("dmaStatsVal")!;
const dmaActionMsg = document.getElementById("dmaActionMsg")!;

const uartFifoBadge = document.getElementById("uartFifoBadge")!;
const uartFifoBox = document.getElementById("uartFifoBox")!;
const inputUartHex = document.getElementById("inputUartHex") as HTMLInputElement;
const btnInjectUart = document.getElementById("btnInjectUart")!;

const i2cFifoBadge = document.getElementById("i2cFifoBadge")!;
const i2cFifoBox = document.getElementById("i2cFifoBox")!;
const i2cShiftVal = document.getElementById("i2cShiftVal")!;
const i2cShiftProgress = document.getElementById("i2cShiftProgress")!;
const i2cWireVal = document.getElementById("i2cWireVal")!;

const sramPre = document.getElementById("sramPre")!;
const logBox = document.getElementById("logBox")!;
const btnClearLog = document.getElementById("btnClearLog")!;

const pipelineStepEls: Record<string, HTMLElement> = {
  [DmaState.IDLE]: document.getElementById("step-IDLE")!,
  [DmaState.WAIT_REQ]: document.getElementById("step-WAIT_REQ")!,
  [DmaState.REQ_SRC]: document.getElementById("step-REQ_SRC")!,
  [DmaState.READ_LATCH]: document.getElementById("step-READ_LATCH")!,
  [DmaState.REQ_DST]: document.getElementById("step-REQ_DST")!,
  [DmaState.WRITE_COMMIT]: document.getElementById("step-WRITE_COMMIT")!,
  [DmaState.UPDATE]: document.getElementById("step-UPDATE")!,
  [DmaState.COMPLETE]: document.getElementById("step-COMPLETE")!
};

const DMA_STATE_NUM: Record<string, number> = {
  [DmaState.IDLE]: 0,
  [DmaState.WAIT_REQ]: 1,
  [DmaState.REQ_SRC]: 2,
  [DmaState.READ_LATCH]: 3,
  [DmaState.REQ_DST]: 4,
  [DmaState.WRITE_COMMIT]: 5,
  [DmaState.UPDATE]: 6,
  [DmaState.COMPLETE]: 7
};

// Log appending
sys.onSystemLog = (msg: string) => {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  if (msg.includes("[DMA]")) entry.classList.add("dma");
  else if (msg.includes("[CPU]")) entry.classList.add("cpu");
  else if (msg.includes("[I2C]")) entry.classList.add("wire");
  else if (msg.includes("OVERRUN") || msg.includes("ERROR")) entry.classList.add("warn");
  else entry.classList.add("sys");

  entry.textContent = msg;
  logBox.prepend(entry);
  while (logBox.children.length > 250) {
    logBox.removeChild(logBox.lastChild!);
  }
};

function formatHex(val: number, digits: number): string {
  return "0x" + (val >>> 0).toString(16).padStart(digits, "0").toUpperCase();
}

function updateUI(): void {
  cycleCountEl.textContent = sys.cycle.toString();

  // DMA State
  dmaStateBadgeEl.textContent = `DMA: ${sys.dma.state}`;
  Object.entries(pipelineStepEls).forEach(([st, el]) => {
    if (el) {
      if (st === sys.dma.state) el.classList.add("active");
      else el.classList.remove("active");
    }
  });

  // LEDs
  ledUartRx.className = `led ${sys.dma.rxReqLine ? "active-green" : ""}`;
  ledI2cTx.className = `led ${sys.dma.txReqLine ? "active-blue" : ""}`;
  ledDmaIrq.className = `led ${sys.dma.irqLine ? "active-red" : ""}`;

  // DMA Registers
  dmaCcrVal.textContent = formatHex(sys.dma.ccr, 4);
  dmaCparVal.textContent = formatHex(sys.dma.cpar, 8);
  dmaCmarVal.textContent = formatHex(sys.dma.cmar, 8);
  dmaCndtrVal.textContent = sys.dma.cndtr.toString();
  dmaLatchVal.textContent = formatHex(sys.dma.dataLatch, 2);
  dmaStatsVal.textContent = `${sys.dma.totalTransferred} / ${sys.dma.busStalls}`;
  dmaActionMsg.textContent = sys.dma.lastEventMsg;

  // Bus Card
  const trans = sys.bus.lastTransaction;
  const master = trans.active ? trans.grantedMaster : BusMaster.NONE;
  busWinnerVal.textContent = master;
  if (master === BusMaster.DMA) {
    busWinnerVal.style.color = "var(--accent-green)";
    busCard.style.borderLeftColor = "var(--accent-green)";
  } else if (master === BusMaster.CPU) {
    busWinnerVal.style.color = "var(--accent-blue)";
    busCard.style.borderLeftColor = "var(--accent-blue)";
  } else {
    busWinnerVal.style.color = "#6b7280";
    busCard.style.borderLeftColor = "#6b7280";
  }

  busAddrVal.textContent = formatHex(trans.addr, 8);
  busRwVal.textContent = trans.active ? (trans.isWrite ? "WRITE" : "READ") : "-";
  busDataVal.textContent = formatHex(trans.isWrite ? trans.wdata : trans.rdata, 2);
  busDescVal.textContent = trans.description;

  // Bus Stats
  statDmaGrants.textContent = sys.bus.dmaGrants.toString();
  statCpuGrants.textContent = sys.bus.cpuGrants.toString();
  statContentions.textContent = sys.bus.busContentions.toString();
  statIdle.textContent = sys.bus.idleCycles.toString();
  busContentionBadge.textContent = `${sys.bus.busContentions} Contention(s)`;

  // CPU
  cpuStateVal.textContent = sys.cpu.state;
  cpuStallsVal.textContent = sys.cpu.busStalls.toString();
  cpuOpVal.textContent = sys.cpu.currentOp;

  // NVIC
  nvicIsprVal.textContent = formatHex(sys.nvic.ispr, 2);

  // UART FIFO
  uartFifoBadge.textContent = `FIFO: ${sys.uart.fifoCount}/${sys.uart.fifoCapacity}`;
  uartFifoBox.innerHTML = "";
  if (sys.uart.fifoCount === 0) {
    uartFifoBox.innerHTML = `<span style="color:var(--text-muted); font-size:10px;">[ FIFO Empty ]</span>`;
  } else {
    sys.uart.rxFifo.forEach((b) => {
      const slot = document.createElement("div");
      slot.className = "fifo-slot";
      slot.textContent = formatHex(b, 2);
      uartFifoBox.appendChild(slot);
    });
  }

  // I2C FIFO
  i2cFifoBadge.textContent = `FIFO: ${sys.i2c.fifoCount}/${sys.i2c.fifoCapacity}`;
  i2cFifoBox.innerHTML = "";
  if (sys.i2c.fifoCount === 0) {
    i2cFifoBox.innerHTML = `<span style="color:var(--text-muted); font-size:10px;">[ FIFO Empty ]</span>`;
  } else {
    sys.i2c.txFifo.forEach((b) => {
      const slot = document.createElement("div");
      slot.className = "fifo-slot";
      slot.style.color = "var(--accent-blue)";
      slot.textContent = formatHex(b, 2);
      i2cFifoBox.appendChild(slot);
    });
  }

  // I2C Shifter
  if (sys.i2c.isTransmitting) {
    i2cShiftVal.textContent = `Shifting ${formatHex(sys.i2c.shiftByte, 2)}`;
    const pct = (sys.i2c.shiftCounter / sys.i2c.cyclesPerByte) * 100;
    i2cShiftProgress.style.width = `${pct}%`;
  } else {
    i2cShiftVal.textContent = "Idle";
    i2cShiftProgress.style.width = "0%";
  }
  i2cWireVal.textContent = formatHex(sys.i2c.lastWireByte, 2);

  // SRAM Dump
  let sramStr = "";
  for (let i = 0; i < 32; i += 8) {
    sramStr += `${formatHex(SRAM_BASE + i, 8)}: `;
    for (let j = 0; j < 8; j++) {
      sramStr += sys.sram.memory[i + j].toString(16).padStart(2, "0").toUpperCase() + " ";
    }
    sramStr += "\n";
  }
  sramPre.textContent = sramStr.trimEnd();
}

function recordCycleToGtkWave(cycleNum: number): void {
  const trans = sys.bus.lastTransaction;
  const masterNum = trans.active ? (trans.grantedMaster === BusMaster.DMA ? 2 : 1) : 0;
  const cpuStateNum = sys.cpu.state === CpuState.ISR ? 1 : 0;
  const sdaBit = sys.i2c.isTransmitting
    ? ((sys.i2c.shiftByte >> (7 - (sys.i2c.shiftCounter & 3))) & 1)
    : 1;

  const baseSignals = {
    rst_n: 1,
    bus_master: masterNum,
    cpu_req: sys.bus.cpuReq !== null ? 1 : 0,
    dma_req: sys.bus.dmaReq !== null ? 1 : 0,
    haddr: trans.active ? trans.addr : 0,
    hwrite: trans.active && trans.isWrite ? 1 : 0,
    hwdata: trans.active && trans.isWrite ? trans.wdata : 0,
    hrdata: trans.active && !trans.isWrite ? trans.rdata : 0,
    dma_state: DMA_STATE_NUM[sys.dma.state] ?? 0,
    dma_cndtr: sys.dma.cndtr,
    dma_latch: sys.dma.dataLatch,
    dreq_uart_rx: sys.uart.dmaReqRx ? 1 : 0,
    dreq_i2c_tx: sys.i2c.dmaReqTx ? 1 : 0,
    irq_dma_tc: sys.dma.irqLine ? 1 : 0,
    uart_fifo_cnt: sys.uart.fifoCount,
    i2c_fifo_cnt: sys.i2c.fifoCount,
    i2c_is_tx: sys.i2c.isTransmitting ? 1 : 0,
    i2c_shift: sys.i2c.shiftByte,
    i2c_sda: sdaBit,
    cpu_state: cpuStateNum,
    nvic_ispr: sys.nvic.ispr,
    sram_b0: sys.sram.memory[0]
  };

  // Rising edge sample (clk = 1)
  gtkViewer.pushSnapshot({
    timeNs: (cycleNum - 1) * 10 + 5,
    cycle: cycleNum,
    signals: { ...baseSignals, clk: 1 }
  });

  // Falling edge sample (clk = 0)
  gtkViewer.pushSnapshot({
    timeNs: cycleNum * 10,
    cycle: cycleNum,
    signals: { ...baseSignals, clk: 0 }
  });
}

function stepCycle(): void {
  const curCyc = sys.cycle;
  sys.step();
  recordCycleToGtkWave(curCyc);
  updateUI();
}

function stepDmaByte(): void {
  const initDone = sys.dma.totalTransferred;
  let maxSteps = 15;
  while (maxSteps-- > 0) {
    stepCycle();
    if (sys.dma.totalTransferred > initDone || sys.dma.state === DmaState.COMPLETE) {
      break;
    }
  }
}

function configureP2P(): void {
  sys.dma.configure(
    UART0_BASE + UART_REG_DR,
    I2C0_BASE + I2C_REG_DR,
    5,
    DMA_CCR_DIR_P2P,
    false,
    false,
    false,
    3
  );
  sys.dma.start();
  updateUI();
}

function configureP2M(): void {
  sys.dma.configure(
    UART0_BASE + UART_REG_DR,
    SRAM_BASE,
    8,
    DMA_CCR_DIR_P2M,
    false,
    false,
    true, // Increment Memory address
    3
  );
  sys.dma.start();
  updateUI();
}

function resetDefault(): void {
  if (isRunning) toggleRun();
  sys.reset();
  gtkViewer.clear();
  logBox.innerHTML = "";

  configureP2P();

  // Schedule default test pattern
  sys.uart.scheduleReceive(2, 0x11);
  sys.uart.scheduleReceive(3, 0x22);
  sys.uart.scheduleReceive(4, 0x33);
  sys.uart.scheduleReceive(5, 0x44);
  sys.uart.scheduleReceive(6, 0x55);

  // Record initial reset sample at t=0ns
  gtkViewer.pushSnapshot({
    timeNs: 0,
    cycle: 0,
    signals: {
      clk: 0,
      rst_n: 0,
      bus_master: 0,
      cpu_req: 0,
      dma_req: 0,
      haddr: 0,
      hwrite: 0,
      hwdata: 0,
      hrdata: 0,
      dma_state: 1,
      dma_cndtr: 5,
      dma_latch: 0,
      dreq_uart_rx: 0,
      dreq_i2c_tx: 1,
      irq_dma_tc: 0,
      uart_fifo_cnt: 0,
      i2c_fifo_cnt: 0,
      i2c_is_tx: 0,
      i2c_shift: 0,
      i2c_sda: 1,
      cpu_state: 0,
      nvic_ispr: 0,
      sram_b0: 0
    }
  });

  updateUI();
  sys.onSystemLog?.("[SETUP] Initialized default scenario: UART RX -> I2C TX (5 bytes scheduled at cycles 2..6)");
}

function toggleRun(): void {
  isRunning = !isRunning;
  if (isRunning) {
    btnRunPause.textContent = "⏸ Pause";
    btnRunPause.classList.remove("btn-success");
    btnRunPause.classList.add("btn-purple");
    const intervalMs = 1000 / clockHz;
    runTimerId = window.setInterval(stepCycle, intervalMs);
  } else {
    btnRunPause.textContent = "▶ Run";
    btnRunPause.classList.add("btn-success");
    btnRunPause.classList.remove("btn-purple");
    if (runTimerId !== null) {
      clearInterval(runTimerId);
      runTimerId = null;
    }
  }
}

// Event Listeners
btnStepCycle.addEventListener("click", () => stepCycle());
btnStepDma.addEventListener("click", () => stepDmaByte());
btnRunPause.addEventListener("click", toggleRun);
btnReset.addEventListener("click", resetDefault);

btnPresetP2P.addEventListener("click", () => {
  resetDefault();
  configureP2P();
});

btnPresetP2M.addEventListener("click", () => {
  resetDefault();
  configureP2M();
});

btnInjectUart.addEventListener("click", () => {
  const hex = inputUartHex.value.trim().replace(/^0x/i, "");
  const num = parseInt(hex, 16);
  if (!isNaN(num)) {
    sys.uart.injectRx(num);
    updateUI();
  }
});

btnClearLog.addEventListener("click", () => {
  logBox.innerHTML = "";
});

speedSlider.addEventListener("input", () => {
  clockHz = parseFloat(speedSlider.value);
  speedValEl.textContent = `${clockHz.toFixed(1)} Hz`;
  if (isRunning) {
    if (runTimerId !== null) clearInterval(runTimerId);
    runTimerId = window.setInterval(stepCycle, 1000 / clockHz);
  }
});

// GTKWave Toolbar Listeners
btnGtkZoomIn.addEventListener("click", () => gtkViewer.zoomIn());
btnGtkZoomOut.addEventListener("click", () => gtkViewer.zoomOut());
btnGtkZoomFit.addEventListener("click", () => gtkViewer.zoomFit());
btnGtkLeft.addEventListener("click", () => gtkViewer.scrollLeft());
btnGtkRight.addEventListener("click", () => gtkViewer.scrollRight());

btnLoadVerilogVcd.addEventListener("click", async () => {
  try {
    const resp = await fetch("./mcu_bus.vcd");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (isRunning) toggleRun();
    gtkViewer.loadVcdContent(text);
    sys.onSystemLog?.("[GTKWAVE] Loaded Verilog RTL waveform 'mcu_bus.vcd' (72 cycles, P2P + P2M testbench).");
  } catch (err) {
    sys.onSystemLog?.(`[GTKWAVE] Failed to fetch mcu_bus.vcd: ${String(err)}`);
  }
});

fileVcdUpload.addEventListener("change", () => {
  const file = fileVcdUpload.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      if (isRunning) toggleRun();
      gtkViewer.loadVcdContent(reader.result);
      sys.onSystemLog?.(`[GTKWAVE] Loaded VCD file '${file.name}' into waveform viewer.`);
    }
  };
  reader.readAsText(file);
});

// Spacebar shortcut to step
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target === document.body) {
    e.preventDefault();
    stepCycle();
  }
});

// Start with default setup and run 14 cycles initially so the GTKWave waveform is immediately visible!
resetDefault();
for (let i = 0; i < 14; i++) {
  stepCycle();
}
