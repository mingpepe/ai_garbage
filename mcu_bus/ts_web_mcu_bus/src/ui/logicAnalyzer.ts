export interface WaveformSample {
  cycle: number;
  busMaster: string; // "CPU", "DMA", "NONE"
  dmaState: string;
  uartDreq: boolean;
  i2cDreq: boolean;
  dmaIrq: boolean;
}

export class LogicAnalyzerCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private samples: WaveformSample[] = [];
  private maxVisibleSamples = 24;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.draw();
  }

  addSample(sample: WaveformSample): void {
    this.samples.push(sample);
    if (this.samples.length > 50) {
      this.samples.shift();
    }
    this.draw();
  }

  clear(): void {
    this.samples = [];
    this.draw();
  }

  draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, w, h);

    const channels = [
      { name: "BUS_GRANT", type: "master" },
      { name: "DMA_STATE", type: "state" },
      { name: "UART_DREQ", type: "bool", color: "#10B981" },
      { name: "I2C_DREQ",  type: "bool", color: "#3B82F6" },
      { name: "TC_IRQ",    type: "bool", color: "#EF4444" }
    ];

    const labelWidth = 110 * dpr;
    const plotWidth = w - labelWidth - (16 * dpr);
    const channelHeight = (h - (24 * dpr)) / channels.length;
    const visibleCount = Math.max(12, Math.min(this.maxVisibleSamples, this.samples.length));
    const stepX = plotWidth / (visibleCount + 1);

    // Channel separators and labels
    channels.forEach((ch, idx) => {
      const y = (24 * dpr) + idx * channelHeight;

      // Label background & text
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, y, labelWidth, channelHeight);
      ctx.fillStyle = "#94a3b8";
      ctx.font = `bold ${10 * dpr}px monospace`;
      ctx.textBaseline = "middle";
      ctx.fillText(ch.name, 10 * dpr, y + channelHeight / 2);

      // Horizontal division line
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    if (this.samples.length === 0) {
      ctx.restore();
      return;
    }

    const startIdx = Math.max(0, this.samples.length - visibleCount);
    const curSamples = this.samples.slice(startIdx);

    // Top cycle header numbers
    ctx.fillStyle = "#64748b";
    ctx.font = `${9 * dpr}px monospace`;
    ctx.textAlign = "center";
    curSamples.forEach((s, i) => {
      const x = labelWidth + i * stepX + stepX / 2;
      ctx.fillText(`C${s.cycle}`, x, 12 * dpr);

      // Vertical grid lines
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(labelWidth + i * stepX, 24 * dpr);
      ctx.lineTo(labelWidth + i * stepX, h);
      ctx.stroke();
    });

    // Draw channels
    channels.forEach((ch, chIdx) => {
      const chY = (24 * dpr) + chIdx * channelHeight;
      const waveHigh = chY + 6 * dpr;
      const waveLow = chY + channelHeight - (8 * dpr);

      if (ch.type === "master") {
        curSamples.forEach((s, i) => {
          const x = labelWidth + i * stepX;
          const master = s.busMaster;
          let color = "#334155";
          let label = "IDLE";
          if (master === "DMA") {
            color = "#059669";
            label = "DMA";
          } else if (master === "CPU") {
            color = "#2563eb";
            label = "CPU";
          }

          ctx.fillStyle = color;
          ctx.fillRect(x + 2 * dpr, waveHigh, stepX - 4 * dpr, waveLow - waveHigh);
          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${9 * dpr}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(label, x + stepX / 2, (waveHigh + waveLow) / 2 + 1);
        });
      } else if (ch.type === "state") {
        curSamples.forEach((s, i) => {
          const x = labelWidth + i * stepX;
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(x + 1 * dpr, waveHigh + 2 * dpr, stepX - 2 * dpr, waveLow - waveHigh - 4 * dpr);
          ctx.fillStyle = "#f59e0b";
          ctx.font = `bold ${8 * dpr}px monospace`;
          ctx.textAlign = "center";
          const shortState = s.dmaState.length > 8 ? s.dmaState.slice(0, 7) + "." : s.dmaState;
          ctx.fillText(shortState, x + stepX / 2, (waveHigh + waveLow) / 2 + 1);
        });
      } else if (ch.type === "bool") {
        ctx.strokeStyle = ch.color || "#10B981";
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();

        curSamples.forEach((s, i) => {
          const x = labelWidth + i * stepX;
          const val = ch.name === "UART_DREQ" ? s.uartDreq :
                      ch.name === "I2C_DREQ" ? s.i2cDreq : s.dmaIrq;
          const y = val ? waveHigh : waveLow;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            const prevVal = ch.name === "UART_DREQ" ? curSamples[i - 1].uartDreq :
                            ch.name === "I2C_DREQ" ? curSamples[i - 1].i2cDreq : curSamples[i - 1].dmaIrq;
            const prevY = prevVal ? waveHigh : waveLow;
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(x + stepX, y);
        });
        ctx.stroke();
      }
    });

    ctx.restore();
  }
}
