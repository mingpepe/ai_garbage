export class PixelAudioPlayer {
  constructor({ canvas, onTick, onEnded }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTick = onTick;
    this.onEnded = onEnded;

    this.audioCtx = null;
    this.gainNode = null;
    this.analyser = null;

    this.audioBuffer = null;
    this.sourceNode = null;

    this.isPlaying = false;
    this.startTimestamp = 0;
    this.pauseOffset = 0;
    this.duration = 0;
    this.volume = 0.8;
    this.visMode = 'wave';

    this.peaks = new Float32Array(32);
    this.rafId = null;

    this._drawIdle();
  }

  _ensureContext() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AC();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.volume;

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;

      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }
  }

  async load(arrayBuffer, fallbackDuration = 0) {
    this.stop();
    this._ensureContext();
    this.pauseOffset = 0;

    try {
      const copy = arrayBuffer.slice(0);
      this.audioBuffer = await this.audioCtx.decodeAudioData(copy);
      this.duration = this.audioBuffer.duration || fallbackDuration;
    } catch (err) {
      this.audioBuffer = null;
      this.duration = fallbackDuration;
      throw new Error(`瀏覽器無法解碼此音訊串流 (${err.message || err})，但仍可檢視 Binary 結構。`);
    }
    this._drawIdle();
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  setVisMode(mode) {
    this.visMode = mode;
    if (!this.isPlaying) this._drawIdle();
  }

  getCurrentTime() {
    if (!this.isPlaying || !this.audioCtx) return this.pauseOffset;
    const t = this.pauseOffset + (this.audioCtx.currentTime - this.startTimestamp);
    return Math.min(this.duration, Math.max(0, t));
  }

  async play() {
    if (!this.audioBuffer) return;
    this._ensureContext();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (this.isPlaying) return;

    if (this.pauseOffset >= this.duration) {
      this.pauseOffset = 0;
    }

    const src = this.audioCtx.createBufferSource();
    src.buffer = this.audioBuffer;
    src.connect(this.gainNode);

    const offset = this.pauseOffset;
    src.onended = () => {
      if (this.sourceNode !== src) return;
      this.isPlaying = false;
      this.sourceNode = null;
      this.pauseOffset = 0;
      this._stopLoop();
      this._drawIdle();
      if (this.onTick) this.onTick(0, false);
      if (this.onEnded) this.onEnded();
    };

    this.sourceNode = src;
    this.startTimestamp = this.audioCtx.currentTime;
    this.isPlaying = true;
    src.start(0, offset);
    this._startLoop();
  }

  pause() {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getCurrentTime();
    this.isPlaying = false;
    if (this.sourceNode) {
      const src = this.sourceNode;
      this.sourceNode = null;
      try {
        src.stop();
      } catch (_) {}
    }
    this._stopLoop();
    if (this.onTick) this.onTick(this.pauseOffset, false);
  }

  stop() {
    this.isPlaying = false;
    this.pauseOffset = 0;
    if (this.sourceNode) {
      const src = this.sourceNode;
      this.sourceNode = null;
      try {
        src.stop();
      } catch (_) {}
    }
    this._stopLoop();
    this._drawIdle();
    if (this.onTick) this.onTick(0, false);
  }

  seek(timeSec) {
    const clamped = Math.max(0, Math.min(this.duration, timeSec));
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.pauseOffset = clamped;
    if (this.onTick) this.onTick(clamped, false);
    if (wasPlaying) {
      this.play();
    }
  }

  _startLoop() {
    this._stopLoop();
    const tick = () => {
      if (!this.isPlaying) return;
      const cur = this.getCurrentTime();
      this._drawVisuals();
      if (this.onTick) this.onTick(cur, true);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _drawGrid(w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = '#07080e';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#141829';
    for (let x = 0; x < w; x += 16) {
      ctx.fillRect(x, 0, 1, h);
    }
    for (let y = 0; y < h; y += 12) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = '#252a45';
    ctx.fillRect(0, Math.floor(h / 2), w, 1);
  }

  _drawIdle() {
    const { width: w, height: h } = this.canvas;
    this._drawGrid(w, h);
    this.ctx.fillStyle = '#38b764';
    const cy = Math.floor(h / 2) - 1;
    for (let x = 4; x < w - 4; x += 6) {
      this.ctx.fillRect(x, cy, 4, 2);
    }
  }

  _drawVisuals() {
    const { width: w, height: h } = this.canvas;
    this._drawGrid(w, h);
    if (!this.analyser) return;

    const ctx = this.ctx;

    if (this.visMode === 'wave') {
      const data = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(data);
      const cols = 80;
      const colW = Math.floor(w / cols);
      const step = Math.floor(data.length / cols);

      for (let i = 0; i < cols; i++) {
        const v = data[i * step] / 128.0 - 1.0;
        const y = Math.floor(((v + 1) / 2) * (h - 8)) + 4;
        const py = Math.floor(y / 3) * 3;
        ctx.fillStyle = Math.abs(v) > 0.6 ? '#ffcd75' : '#a7f070';
        ctx.fillRect(i * colW, py, colW - 1, 4);
      }
    } else {
      const bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(bins);
      const barCount = 32;
      const barW = Math.floor((w - 16) / barCount);
      const blockH = 4;
      const gapY = 2;

      for (let i = 0; i < barCount; i++) {
        const val = bins[i * 2] / 255;
        this.peaks[i] = Math.max(val, this.peaks[i] - 0.018);

        const maxBlocks = Math.floor((h - 8) / (blockH + gapY));
        const activeBlocks = Math.round(val * maxBlocks);
        const peakBlock = Math.min(maxBlocks - 1, Math.round(this.peaks[i] * maxBlocks));
        const x = 8 + i * barW;

        for (let b = 0; b < activeBlocks; b++) {
          const y = h - 4 - (b + 1) * (blockH + gapY);
          const ratio = b / maxBlocks;
          ctx.fillStyle = ratio > 0.78 ? '#e43b44' : ratio > 0.5 ? '#ffcd75' : '#38b764';
          ctx.fillRect(x, y, barW - 3, blockH);
        }

        if (peakBlock > 0) {
          const py = h - 4 - (peakBlock + 1) * (blockH + gapY);
          ctx.fillStyle = '#41a6f6';
          ctx.fillRect(x, py, barW - 3, 2);
        }
      }
    }
  }
}
