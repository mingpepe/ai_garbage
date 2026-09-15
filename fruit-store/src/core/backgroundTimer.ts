/**
 * BackgroundTicker
 * Utilizes an inline Web Worker + setInterval + visibilitychange listener
 * to ensure game simulation (customer lifecycle, spawn timers, shelf freshness)
 * continues running smoothly even when the browser tab is in the background or switched away.
 */
export class BackgroundTicker {
  private _worker: Worker | null = null;
  private _intervalId: number | null = null;
  private _lastTime = performance.now();
  private _onTick: (dt: number) => void;
  private _isActive = false;

  constructor(onTick: (dt: number) => void) {
    this._onTick = onTick;
  }

  start(): void {
    if (this._isActive) return;
    this._isActive = true;
    this._lastTime = performance.now();

    // Inline Web Worker via Blob so it requires no external files
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const workerCode = `
          var timer = null;
          self.onmessage = function(e) {
            if (e.data === 'start') {
              if (!timer) timer = setInterval(function() { self.postMessage('tick'); }, 100);
            } else if (e.data === 'stop') {
              if (timer) { clearInterval(timer); timer = null; }
            }
          };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        this._worker = new Worker(url);
        this._worker.onmessage = () => {
          this._handleTick();
        };
        this._worker.postMessage('start');
      } catch {
        // Fallback to window.setInterval if Web Worker is restricted
        this._intervalId = window.setInterval(() => {
          this._handleTick();
        }, 100);
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  private _handleTick(): void {
    const now = performance.now();
    const dt = Math.min(2.0, (now - this._lastTime) / 1000);
    this._lastTime = now;

    // When tab is hidden in background, requestAnimationFrame stops firing.
    // The worker tick steps the game simulation forward!
    if (typeof document !== 'undefined' && document.hidden) {
      if (dt > 0.01) {
        this._onTick(dt);
      }
    }
  }

  private _onVisibilityChange = (): void => {
    const now = performance.now();
    const dt = Math.min(5.0, (now - this._lastTime) / 1000);
    this._lastTime = now;

    if (dt > 0.05) {
      this._onTick(dt);
    }
  };

  /**
   * Sync frame time from requestAnimationFrame when tab is visible
   */
  notifyFrame(now: number): void {
    this._lastTime = now;
  }

  stop(): void {
    this._isActive = false;
    if (this._worker) {
      this._worker.postMessage('stop');
      this._worker.terminate();
      this._worker = null;
    }
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
  }
}
