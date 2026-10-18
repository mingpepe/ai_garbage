export type SignalFormat = "bit" | "hex" | "dec" | "ascii" | "state_dma" | "state_bus" | "state_cpu";

export interface GtkSignalTrack {
  id: string;
  group: string;
  name: string;
  width: number;
  format: SignalFormat;
  color: string;
  values: (number | string)[]; // Indexed by sample step
}

export interface GtkWaveformSnapshot {
  timeNs: number;
  cycle: number;
  signals: Record<string, number | string>;
}

const DMA_STATE_MAP: Record<number, string> = {
  0: "IDLE",
  1: "WAIT_REQ",
  2: "REQ_SRC",
  3: "READ_LATCH",
  4: "REQ_DST",
  5: "WRITE_COMMIT",
  6: "UPDATE",
  7: "COMPLETE"
};

const BUS_MASTER_MAP: Record<number, string> = {
  0: "IDLE",
  1: "CPU",
  2: "DMA"
};

const CPU_STATE_MAP: Record<number, string> = {
  0: "RUNNING",
  1: "ISR_EXEC",
  2: "ISR_EXIT"
};

export class GtkWaveViewer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private signalListContainer: HTMLElement;
  private cursorInfoEl: HTMLElement;

  private timestamps: number[] = [];
  private cycles: number[] = [];
  private tracks: GtkSignalTrack[] = [];

  // View state
  private pixelsPerSample = 28;
  private scrollSampleOffset = 0;
  private cursorIndex = 0;
  private baselineIndex: number | null = null;
  private selectedTrackIdx = 2;
  private autoFollow = true;
  private isDragging = false;

  private readonly rowHeight = 26;
  private readonly rulerHeight = 32;

  constructor(
    canvas: HTMLCanvasElement,
    signalListContainer: HTMLElement,
    cursorInfoEl: HTMLElement
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.signalListContainer = signalListContainer;
    this.cursorInfoEl = cursorInfoEl;

    this.initDefaultTracks();
    this.setupInteractions();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  public initDefaultTracks(): void {
    this.timestamps = [];
    this.cycles = [];
    this.tracks = [
      // Clock & Reset
      { id: "clk",           group: "CLK",  name: "clk",                  width: 1,  format: "bit",       color: "#00ff66", values: [] },
      { id: "rst_n",         group: "CLK",  name: "rst_n",                width: 1,  format: "bit",       color: "#00ff66", values: [] },
      // AHB Bus Arbiter
      { id: "bus_master",    group: "BUS",  name: "bus_master[1:0]",      width: 2,  format: "state_bus", color: "#38bdf8", values: [] },
      { id: "cpu_req",       group: "BUS",  name: "u_arb.cpu_req",        width: 1,  format: "bit",       color: "#60a5fa", values: [] },
      { id: "dma_req",       group: "BUS",  name: "u_arb.dma_req",        width: 1,  format: "bit",       color: "#34d399", values: [] },
      { id: "haddr",         group: "BUS",  name: "haddr[31:0]",          width: 32, format: "hex",       color: "#fbbf24", values: [] },
      { id: "hwrite",        group: "BUS",  name: "hwrite",               width: 1,  format: "bit",       color: "#f59e0b", values: [] },
      { id: "hwdata",        group: "BUS",  name: "hwdata[7:0]",          width: 8,  format: "hex",       color: "#a78bfa", values: [] },
      { id: "hrdata",        group: "BUS",  name: "hrdata[7:0]",          width: 8,  format: "hex",       color: "#34d399", values: [] },
      // DMA Controller Internal
      { id: "dma_state",     group: "DMA",  name: "u_dma.state[2:0]",     width: 3,  format: "state_dma", color: "#10b981", values: [] },
      { id: "dma_cndtr",     group: "DMA",  name: "u_dma.cndtr[15:0]",    width: 16, format: "dec",       color: "#34d399", values: [] },
      { id: "dma_latch",     group: "DMA",  name: "u_dma.data_latch[7:0]",width: 8,  format: "hex",       color: "#c084fc", values: [] },
      { id: "dreq_uart_rx",  group: "DMA",  name: "u_dma.dreq_uart_rx",   width: 1,  format: "bit",       color: "#00ff66", values: [] },
      { id: "dreq_i2c_tx",   group: "DMA",  name: "u_dma.dreq_i2c_tx",    width: 1,  format: "bit",       color: "#38bdf8", values: [] },
      { id: "irq_dma_tc",    group: "DMA",  name: "u_dma.irq_dma_tc",     width: 1,  format: "bit",       color: "#f43f5e", values: [] },
      // Peripherals (UART0 & I2C0)
      { id: "uart_fifo_cnt", group: "UART", name: "u_uart.fifo_cnt[2:0]", width: 3,  format: "dec",       color: "#4ade80", values: [] },
      { id: "i2c_fifo_cnt",  group: "I2C",  name: "u_i2c.fifo_cnt[1:0]",  width: 2,  format: "dec",       color: "#60a5fa", values: [] },
      { id: "i2c_is_tx",     group: "I2C",  name: "u_i2c.is_transmitting",width: 1,  format: "bit",       color: "#fbbf24", values: [] },
      { id: "i2c_shift",     group: "I2C",  name: "u_i2c.shift_byte[7:0]",width: 8,  format: "hex",       color: "#fbbf24", values: [] },
      { id: "i2c_sda",       group: "I2C",  name: "i2c_sda (wire)",       width: 1,  format: "bit",       color: "#2dd4bf", values: [] },
      // CPU & NVIC & SRAM
      { id: "cpu_state",     group: "CPU",  name: "u_cpu.state[1:0]",     width: 2,  format: "state_cpu", color: "#60a5fa", values: [] },
      { id: "nvic_ispr",     group: "NVIC", name: "u_nvic.ispr[3:0]",     width: 4,  format: "hex",       color: "#f87171", values: [] },
      { id: "sram_b0",       group: "SRAM", name: "u_sram.mem[0][7:0]",   width: 8,  format: "hex",       color: "#22d3ee", values: [] }
    ];
    this.cursorIndex = 0;
    this.baselineIndex = null;
    this.scrollSampleOffset = 0;
    this.renderSignalList();
    this.draw();
  }

  public clear(): void {
    this.initDefaultTracks();
  }

  public pushSnapshot(snap: GtkWaveformSnapshot): void {
    this.timestamps.push(snap.timeNs);
    this.cycles.push(snap.cycle);

    for (const track of this.tracks) {
      const val = snap.signals[track.id];
      track.values.push(val !== undefined ? val : 0);
    }

    if (this.autoFollow) {
      this.cursorIndex = this.timestamps.length - 1;
      const visibleCols = Math.floor(this.canvas.clientWidth / this.pixelsPerSample);
      if (this.timestamps.length > visibleCols - 2) {
        this.scrollSampleOffset = Math.max(0, this.timestamps.length - visibleCols + 2);
      }
    }

    this.updateSignalValuesDOM();
    this.draw();
  }

  public zoomIn(): void {
    this.pixelsPerSample = Math.min(90, Math.round(this.pixelsPerSample * 1.3));
    this.draw();
  }

  public zoomOut(): void {
    this.pixelsPerSample = Math.max(6, Math.round(this.pixelsPerSample / 1.3));
    this.draw();
  }

  public zoomFit(): void {
    if (this.timestamps.length <= 1) return;
    const w = this.canvas.clientWidth || 600;
    this.pixelsPerSample = Math.max(6, Math.min(80, Math.floor((w - 20) / this.timestamps.length)));
    this.scrollSampleOffset = 0;
    this.draw();
  }

  public scrollLeft(): void {
    this.autoFollow = false;
    this.scrollSampleOffset = Math.max(0, this.scrollSampleOffset - 6);
    this.draw();
  }

  public scrollRight(): void {
    this.scrollSampleOffset = Math.min(
      Math.max(0, this.timestamps.length - 4),
      this.scrollSampleOffset + 6
    );
    this.draw();
  }

  public formatTrackValue(track: GtkSignalTrack, raw: number | string | undefined): string {
    if (raw === undefined) return "-";
    if (typeof raw === "string") return raw.trim() || "0";

    switch (track.format) {
      case "bit":
        return (raw & 1) ? "1" : "0";
      case "dec":
        return raw.toString(10);
      case "state_dma":
        return DMA_STATE_MAP[raw] ?? `ST_${raw}`;
      case "state_bus":
        return BUS_MASTER_MAP[raw] ?? `M_${raw}`;
      case "state_cpu":
        return CPU_STATE_MAP[raw] ?? `CPU_${raw}`;
      case "hex":
      default: {
        const hexDigits = Math.ceil(track.width / 4);
        return "0x" + (raw >>> 0).toString(16).padStart(hexDigits, "0").toUpperCase();
      }
    }
  }

  // Parse standard IEEE 1364 Verilog VCD file into GTKWave viewer tracks
  public loadVcdContent(vcdText: string): void {
    interface VcdVar {
      idCode: string;
      name: string;
      scope: string;
      width: number;
    }

    const varsById = new Map<string, VcdVar>();
    const scopeStack: string[] = [];
    const lines = vcdText.split(/\r?\n/);

    let inDefinitions = true;
    let currentTime = 0;
    const timePoints: number[] = [];
    const currentVals = new Map<string, number | string>();
    const historyById = new Map<string, (number | string)[]>();

    const commitTimeSlice = (t: number) => {
      timePoints.push(t);
      for (const [id, v] of varsById.entries()) {
        void v;
        const arr = historyById.get(id)!;
        arr.push(currentVals.get(id) ?? 0);
      }
    };

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (inDefinitions) {
        if (line.startsWith("$scope")) {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) scopeStack.push(parts[2]);
        } else if (line.startsWith("$upscope")) {
          scopeStack.pop();
        } else if (line.startsWith("$var")) {
          // e.g. $var wire 32 # haddr [31:0] $end
          const parts = line.split(/\s+/);
          if (parts.length >= 5) {
            const width = parseInt(parts[2], 10) || 1;
            const idCode = parts[3];
            const rawName = parts[4];
            const scope = scopeStack.join(".");
            if (!varsById.has(idCode)) {
              varsById.set(idCode, { idCode, name: rawName, scope, width });
              currentVals.set(idCode, 0);
              historyById.set(idCode, []);
            }
          }
        } else if (line.startsWith("$enddefinitions")) {
          inDefinitions = false;
        }
        continue;
      }

      if (line.startsWith("$")) continue;

      if (line.startsWith("#")) {
        const nextTime = parseInt(line.slice(1), 10);
        if (!isNaN(nextTime)) {
          if (timePoints.length > 0 || nextTime > 0) {
            commitTimeSlice(currentTime);
          }
          currentTime = nextTime;
        }
      } else if (line.startsWith("b") || line.startsWith("B")) {
        const spaceIdx = line.indexOf(" ");
        if (spaceIdx > 1) {
          const binStr = line.slice(1, spaceIdx);
          const idCode = line.slice(spaceIdx + 1).trim();
          const vInfo = varsById.get(idCode);
          if (vInfo && vInfo.width > 32) {
            // Convert ASCII bitvector to string
            let ascii = "";
            const padded = binStr.padStart(vInfo.width, "0");
            for (let i = 0; i < padded.length; i += 8) {
              const byteVal = parseInt(padded.slice(i, i + 8), 2);
              if (byteVal >= 32 && byteVal <= 126) ascii += String.fromCharCode(byteVal);
            }
            currentVals.set(idCode, ascii.trim());
          } else {
            const cleanBin = binStr.replace(/[xzXZ]/g, "0");
            const num = parseInt(cleanBin, 2);
            currentVals.set(idCode, isNaN(num) ? 0 : num);
          }
        }
      } else if (/^[01xzXZ]/.test(line)) {
        const bitChar = line[0];
        const idCode = line.slice(1).trim();
        currentVals.set(idCode, bitChar === "1" ? 1 : 0);
      }
    }
    commitTimeSlice(currentTime);

    // Map key signals from the VCD into GtkSignalTrack list
    const findVar = (pred: (v: VcdVar) => boolean): VcdVar | undefined => {
      for (const v of varsById.values()) {
        if (pred(v)) return v;
      }
      return undefined;
    };

    const desiredSignals: {
      group: string;
      label: string;
      format: SignalFormat;
      color: string;
      match: (v: VcdVar) => boolean;
    }[] = [
      { group: "CLK",  label: "clk",                  format: "bit",       color: "#00ff66", match: (v) => v.name === "clk" },
      { group: "CLK",  label: "rst_n",                format: "bit",       color: "#00ff66", match: (v) => v.name === "rst_n" },
      { group: "BUS",  label: "bus_master[1:0]",      format: "state_bus", color: "#38bdf8", match: (v) => v.name === "bus_master" },
      { group: "BUS",  label: "u_arb.cpu_req",        format: "bit",       color: "#60a5fa", match: (v) => v.name === "cpu_req" },
      { group: "BUS",  label: "u_arb.dma_req",        format: "bit",       color: "#34d399", match: (v) => v.name === "dma_req" },
      { group: "BUS",  label: "haddr[31:0]",          format: "hex",       color: "#fbbf24", match: (v) => v.name === "haddr" },
      { group: "BUS",  label: "hwrite",               format: "bit",       color: "#f59e0b", match: (v) => v.name === "hwrite" },
      { group: "BUS",  label: "hwdata[31:0]",         format: "hex",       color: "#a78bfa", match: (v) => v.name === "hwdata" || v.name === "hdata" },
      { group: "BUS",  label: "hrdata[31:0]",         format: "hex",       color: "#34d399", match: (v) => v.name === "hrdata" },
      { group: "DMA",  label: "u_dma.state",          format: "state_dma", color: "#10b981", match: (v) => v.name === "dma_state" },
      { group: "DMA",  label: "u_dma.cndtr[15:0]",    format: "dec",       color: "#34d399", match: (v) => v.name === "dma_cndtr" || v.name === "reg_cndtr" },
      { group: "DMA",  label: "u_dma.data_latch[7:0]",format: "hex",       color: "#c084fc", match: (v) => v.name === "dma_data_latch" || v.name === "data_latch" },
      { group: "DMA",  label: "dreq_uart_rx",         format: "bit",       color: "#00ff66", match: (v) => v.name === "dreq_uart_rx" },
      { group: "DMA",  label: "dreq_i2c_tx",          format: "bit",       color: "#38bdf8", match: (v) => v.name === "dreq_i2c_tx" },
      { group: "DMA",  label: "irq_dma_tc",           format: "bit",       color: "#f43f5e", match: (v) => v.name === "irq_dma_tc" || v.name === "irq_dma" },
      { group: "UART", label: "u_uart.fifo_cnt[2:0]", format: "dec",       color: "#4ade80", match: (v) => v.name === "uart_fifo_count" || (v.scope.includes("u_uart") && v.name === "fifo_count") },
      { group: "I2C",  label: "u_i2c.fifo_cnt[1:0]",  format: "dec",       color: "#60a5fa", match: (v) => v.name === "i2c_fifo_count" || (v.scope.includes("u_i2c") && v.name === "fifo_count") },
      { group: "I2C",  label: "u_i2c.is_transmitting",format: "bit",       color: "#fbbf24", match: (v) => v.name.includes("is_transmitting") },
      { group: "I2C",  label: "u_i2c.shift_byte[7:0]",format: "hex",       color: "#fbbf24", match: (v) => v.name.includes("shift_byte") },
      { group: "I2C",  label: "i2c_sda (wire)",       format: "bit",       color: "#2dd4bf", match: (v) => v.name === "i2c_sda" },
      { group: "CPU",  label: "u_cpu.state[1:0]",     format: "state_cpu", color: "#60a5fa", match: (v) => v.name === "cpu_state" },
      { group: "NVIC", label: "u_nvic.ispr[3:0]",     format: "hex",       color: "#f87171", match: (v) => v.name === "nvic_ispr" || v.name === "ispr" },
      { group: "SRAM", label: "u_sram.byte0[7:0]",    format: "hex",       color: "#22d3ee", match: (v) => v.name === "sram_byte0" || v.name === "sram_b0" }
    ];

    const newTracks: GtkSignalTrack[] = [];
    for (const item of desiredSignals) {
      const found = findVar(item.match);
      if (found) {
        newTracks.push({
          id: found.idCode,
          group: item.group,
          name: item.label,
          width: found.width,
          format: item.format,
          color: item.color,
          values: historyById.get(found.idCode) ?? []
        });
      }
    }

    if (newTracks.length > 0) {
      this.tracks = newTracks;
      this.timestamps = timePoints;
      this.cycles = timePoints.map((t) => Math.floor(t / 10));
      this.cursorIndex = Math.min(10, Math.max(0, this.timestamps.length - 1));
      this.scrollSampleOffset = 0;
      this.autoFollow = false;
      this.resize();
      this.renderSignalList();
      this.zoomFit();
    }
  }

  public resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const totalHeight = this.rulerHeight + this.tracks.length * this.rowHeight;
    this.canvas.style.height = `${totalHeight}px`;
    this.canvas.width = Math.max(300, rect.width) * dpr;
    this.canvas.height = totalHeight * dpr;
    this.draw();
  }

  private setupInteractions(): void {
    const pickSampleFromEvent = (e: MouseEvent): number => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = this.scrollSampleOffset + Math.floor(x / this.pixelsPerSample);
      return Math.max(0, Math.min(this.timestamps.length - 1, idx));
    };

    this.canvas.addEventListener("mousedown", (e) => {
      if (this.timestamps.length === 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (y > this.rulerHeight) {
        const trackIdx = Math.floor((y - this.rulerHeight) / this.rowHeight);
        if (trackIdx >= 0 && trackIdx < this.tracks.length) {
          this.selectedTrackIdx = trackIdx;
        }
      }

      if (e.shiftKey || e.button === 2) {
        this.baselineIndex = pickSampleFromEvent(e);
      } else {
        this.isDragging = true;
        this.autoFollow = false;
        this.cursorIndex = pickSampleFromEvent(e);
      }
      this.updateSignalValuesDOM();
      this.draw();
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging || this.timestamps.length === 0) return;
      this.cursorIndex = pickSampleFromEvent(e);
      this.updateSignalValuesDOM();
      this.draw();
    });

    window.addEventListener("mouseup", () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        if (e.deltaY < 0) this.zoomIn();
        else this.zoomOut();
      } else {
        if (e.deltaY > 0 || e.deltaX > 0) this.scrollRight();
        else this.scrollLeft();
      }
    }, { passive: false });
  }

  private renderSignalList(): void {
    this.signalListContainer.innerHTML = "";
    this.tracks.forEach((track, idx) => {
      const row = document.createElement("div");
      row.className = "gtkw-sig-row" + (idx === this.selectedTrackIdx ? " selected" : "");
      row.style.height = `${this.rowHeight}px`;
      row.dataset.idx = idx.toString();

      const grpBadge = document.createElement("span");
      grpBadge.className = "gtkw-grp-badge";
      grpBadge.textContent = track.group;

      const nameSpan = document.createElement("span");
      nameSpan.className = "gtkw-sig-name";
      nameSpan.textContent = track.name;

      const valSpan = document.createElement("span");
      valSpan.className = "gtkw-sig-val";
      valSpan.id = `gtkw-val-${idx}`;
      valSpan.style.color = track.color;
      valSpan.textContent = this.formatTrackValue(track, track.values[this.cursorIndex]);

      row.appendChild(grpBadge);
      row.appendChild(nameSpan);
      row.appendChild(valSpan);

      row.addEventListener("click", () => {
        this.selectedTrackIdx = idx;
        this.updateSignalValuesDOM();
        this.draw();
      });

      this.signalListContainer.appendChild(row);
    });
    this.updateSignalValuesDOM();
  }

  private updateSignalValuesDOM(): void {
    const rows = this.signalListContainer.querySelectorAll(".gtkw-sig-row");
    rows.forEach((r, idx) => {
      if (idx === this.selectedTrackIdx) r.classList.add("selected");
      else r.classList.remove("selected");
    });

    this.tracks.forEach((track, idx) => {
      const el = document.getElementById(`gtkw-val-${idx}`);
      if (el) {
        el.textContent = this.formatTrackValue(track, track.values[this.cursorIndex]);
      }
    });

    const t = this.timestamps[this.cursorIndex] ?? 0;
    const cyc = this.cycles[this.cursorIndex] ?? 0;
    let info = `Marker: ${t} ns (Cycle ${cyc})`;
    if (this.baselineIndex !== null && this.timestamps[this.baselineIndex] !== undefined) {
      const bt = this.timestamps[this.baselineIndex];
      const dt = t - bt;
      info += `  |  Base: ${bt} ns  |  Δt: ${dt >= 0 ? "+" : ""}${dt} ns`;
    }
    this.cursorInfoEl.textContent = info;
  }

  public draw(): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. GTKWave Classic Pitch-Black Background
    ctx.fillStyle = "#05080f";
    ctx.fillRect(0, 0, w, h);

    const pps = this.pixelsPerSample;
    const visibleCols = Math.ceil(w / pps) + 1;
    const startIdx = this.scrollSampleOffset;
    const endIdx = Math.min(this.timestamps.length, startIdx + visibleCols);

    // 2. Top Time Ruler
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, this.rulerHeight);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.rulerHeight - 0.5);
    ctx.lineTo(w, this.rulerHeight - 0.5);
    ctx.stroke();

    for (let i = startIdx; i < endIdx; i++) {
      const x = (i - startIdx) * pps;
      const tNs = this.timestamps[i];
      const cyc = this.cycles[i];

      // Vertical grid line
      ctx.strokeStyle = i % 2 === 0 ? "#111a2e" : "#0b111e";
      ctx.beginPath();
      ctx.moveTo(x, this.rulerHeight);
      ctx.lineTo(x, h);
      ctx.stroke();

      // Ruler tick
      ctx.strokeStyle = "#475569";
      ctx.beginPath();
      ctx.moveTo(x, this.rulerHeight - (i % 2 === 0 ? 8 : 4));
      ctx.lineTo(x, this.rulerHeight);
      ctx.stroke();

      // Time & cycle label
      if (pps >= 24 || i % 2 === 0) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${tNs}ns`, x + 3, 12);
        ctx.fillStyle = "#475569";
        ctx.font = "8px monospace";
        ctx.fillText(`c${cyc}`, x + 3, 23);
      }
    }

    // 3. Draw Each Signal Track
    this.tracks.forEach((track, tIdx) => {
      const rowTop = this.rulerHeight + tIdx * this.rowHeight;
      const rowBot = rowTop + this.rowHeight;
      const waveTop = rowTop + 4;
      const waveBot = rowBot - 4;
      const waveMid = (waveTop + waveBot) / 2;

      // Highlight selected track row
      if (tIdx === this.selectedTrackIdx) {
        ctx.fillStyle = "rgba(30, 58, 138, 0.25)";
        ctx.fillRect(0, rowTop, w, this.rowHeight);
      }

      // Row divider line
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rowBot - 0.5);
      ctx.lineTo(w, rowBot - 0.5);
      ctx.stroke();

      if (this.timestamps.length === 0) return;

      if (track.width === 1) {
        // 1-bit GTKWave logic trace
        ctx.fillStyle = track.color + "1A"; // Translucent fill under high level
        for (let i = startIdx; i < endIdx; i++) {
          const val = Number(track.values[i]) & 1;
          if (val === 1) {
            const x = (i - startIdx) * pps;
            ctx.fillRect(x, waveTop, pps, waveBot - waveTop);
          }
        }

        ctx.strokeStyle = track.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = startIdx; i < endIdx; i++) {
          const x0 = (i - startIdx) * pps;
          const x1 = x0 + pps;
          const val = Number(track.values[i]) & 1;
          const y = val ? waveTop : waveBot;

          if (i === startIdx) {
            ctx.moveTo(x0, y);
          } else {
            const prevVal = Number(track.values[i - 1]) & 1;
            const prevY = prevVal ? waveTop : waveBot;
            if (prevY !== y) {
              ctx.lineTo(x0, prevY);
              ctx.lineTo(x0, y);
            }
          }
          ctx.lineTo(x1, y);
        }
        ctx.stroke();
      } else {
        // Multi-bit GTKWave Hexagonal Bus / State Vector Envelope
        let segStart = startIdx;
        while (segStart < endIdx) {
          const segVal = track.values[segStart];
          let segEnd = segStart + 1;
          while (segEnd < endIdx && track.values[segEnd] === segVal) {
            segEnd++;
          }

          const xStart = (segStart - startIdx) * pps;
          const xEnd = (segEnd - startIdx) * pps;
          const segWidth = xEnd - xStart;
          const slant = Math.min(4, segWidth / 4);

          const hasLeftTransition = segStart > 0 && track.values[segStart - 1] !== segVal;
          const hasRightTransition = segEnd < this.timestamps.length && track.values[segEnd] !== segVal;

          const xL = hasLeftTransition ? xStart + slant : xStart;
          const xR = hasRightTransition ? xEnd - slant : xEnd;

          // Bus background fill (subtle tint based on value)
          const isZeroOrIdle = segVal === 0 || segVal === "IDLE";
          ctx.fillStyle = isZeroOrIdle ? "rgba(30, 41, 59, 0.35)" : (track.color + "22");
          ctx.strokeStyle = isZeroOrIdle ? "#475569" : track.color;
          ctx.lineWidth = 1.4;

          ctx.beginPath();
          ctx.moveTo(hasLeftTransition ? xStart : xL, waveMid);
          ctx.lineTo(xL, waveTop);
          ctx.lineTo(xR, waveTop);
          if (hasRightTransition) {
            ctx.lineTo(xEnd, waveMid);
          } else {
            ctx.lineTo(xEnd, waveTop);
            ctx.lineTo(xEnd, waveBot);
          }
          ctx.lineTo(xR, waveBot);
          ctx.lineTo(xL, waveBot);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Draw formatted value label inside the bus hexagon
          const label = this.formatTrackValue(track, segVal);
          if (segWidth >= 22) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(xL + 2, waveTop, Math.max(0, xR - xL - 4), waveBot - waveTop);
            ctx.clip();

            ctx.fillStyle = isZeroOrIdle ? "#94a3b8" : "#f8fafc";
            ctx.font = "bold 10px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, (xL + xR) / 2, waveMid + 0.5);
            ctx.restore();
          }

          segStart = segEnd;
        }
      }
    });

    // 4. Draw Secondary Baseline Marker (Amber Dashed)
    if (
      this.baselineIndex !== null &&
      this.baselineIndex >= startIdx &&
      this.baselineIndex < endIdx
    ) {
      const bx = (this.baselineIndex - startIdx) * pps + pps / 2;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. Draw Primary GTKWave Cursor (Red Vertical Line + Top Triangle)
    if (
      this.timestamps.length > 0 &&
      this.cursorIndex >= startIdx &&
      this.cursorIndex < endIdx
    ) {
      const cx = (this.cursorIndex - startIdx) * pps + pps / 2;
      ctx.strokeStyle = "#ff2e4c";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      // Top marker triangle
      ctx.fillStyle = "#ff2e4c";
      ctx.beginPath();
      ctx.moveTo(cx - 5, 0);
      ctx.lineTo(cx + 5, 0);
      ctx.lineTo(cx, 7);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
