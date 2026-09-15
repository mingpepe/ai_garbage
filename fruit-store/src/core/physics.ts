import type { FallingFruit, Particle } from '@/types/game';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/core/constants';

export class MiniGameEngine {
  private _fruitId: number;
  private _fruitIcon: string;
  private _duration: number;
  private _timeRemaining: number;
  private _speedMode: 'SLOW' | 'MEDIUM' | 'FAST';
  private _fallingFruits: FallingFruit[] = [];
  private _particles: Particle[] = [];
  private _basketX: number = CANVAS_WIDTH / 2;
  private _basketWidth: number = 80;
  private _basketY: number = CANVAS_HEIGHT - 60;
  private _collectedCount: number = 0;
  private _spawnTimer: number = 0;
  private _nextSpawnInterval: number = 1.0;
  private _nextFruitId: number = 1;
  private _isFinished: boolean = false;
  private _facing: 'LEFT' | 'RIGHT' = 'RIGHT';
  private _isMoving: boolean = false;

  constructor(
    fruitId: number,
    fruitIcon: string,
    durationSec: number = 60,
    speedMode: 'SLOW' | 'MEDIUM' | 'FAST' = 'MEDIUM'
  ) {
    this._fruitId = fruitId;
    this._fruitIcon = fruitIcon;
    this._duration = Math.max(5, durationSec);
    this._timeRemaining = this._duration;
    this._speedMode = speedMode;
    this._basketX = CANVAS_WIDTH / 2;
    this._collectedCount = 0;
    this._fallingFruits = [];
    this._particles = [];
    this._isFinished = false;
  }

  get timeRemaining(): number {
    return Math.max(0, this._timeRemaining);
  }

  get duration(): number {
    return this._duration;
  }

  get collectedCount(): number {
    return this._collectedCount;
  }

  set collectedCount(val: number) {
    this._collectedCount = val;
  }

  get isFinished(): boolean {
    return this._isFinished;
  }

  get basketX(): number {
    return this._basketX;
  }

  get basketY(): number {
    return this._basketY;
  }

  get basketWidth(): number {
    return this._basketWidth;
  }

  get fallingFruits(): FallingFruit[] {
    return this._fallingFruits;
  }

  get particles(): Particle[] {
    return this._particles;
  }

  get fruitIcon(): string {
    return this._fruitIcon;
  }

  get fruitId(): number {
    return this._fruitId;
  }

  get facing(): 'LEFT' | 'RIGHT' {
    return this._facing;
  }

  get isMoving(): boolean {
    return this._isMoving;
  }

  setMoving(moving: boolean): void {
    this._isMoving = moving;
  }

  // Move basket horizontally
  moveBasket(dx: number): void {
    if (dx > 0) this._facing = 'RIGHT';
    else if (dx < 0) this._facing = 'LEFT';
    this._isMoving = true;

    const minX = this._basketWidth / 2 + 20;
    const maxX = CANVAS_WIDTH - this._basketWidth / 2 - 20;
    this._basketX = Math.max(minX, Math.min(maxX, this._basketX + dx));
  }

  // Get falling speed based on setting
  private _getBaseSpeed(): number {
    switch (this._speedMode) {
      case 'SLOW':
        return 160;
      case 'FAST':
        return 340;
      case 'MEDIUM':
      default:
        return 240;
    }
  }

  // Update mini-game frame
  update(dt: number, onFruitCaught?: (fruit: FallingFruit) => void): boolean {
    if (this._isFinished) return true;

    // 1. Countdown timer
    this._timeRemaining -= dt;
    if (this._timeRemaining <= 0) {
      this._timeRemaining = 0;
      this._isFinished = true;
      return true;
    }

    // 2. Spawn falling fruits
    this._spawnTimer += dt;
    if (this._spawnTimer >= this._nextSpawnInterval) {
      this._spawnTimer = 0;
      this._nextSpawnInterval = 0.6 + Math.random() * 0.7; // 0.6s ~ 1.3s
      this._spawnFruit();
    }

    // 3. Update falling fruits
    const baseSpeed = this._getBaseSpeed();
    for (let i = this._fallingFruits.length - 1; i >= 0; i--) {
      const f = this._fallingFruits[i];
      f.y += f.speed * dt;
      f.rotation += f.rotSpeed * dt;

      // Check collision with basket
      const catchDistX = Math.abs(f.x - this._basketX);
      const catchDistY = Math.abs(f.y - this._basketY);

      if (
        !f.caught &&
        catchDistX < this._basketWidth * 0.55 &&
        catchDistY < 32 &&
        f.y >= this._basketY - 20
      ) {
        f.caught = true;
        this._collectedCount++;
        this._emitCatchParticles(f.x, f.y);
        if (onFruitCaught) onFruitCaught(f);
        this._fallingFruits.splice(i, 1);
        continue;
      }

      // Check if dropped below screen
      if (f.y > CANVAS_HEIGHT + 30) {
        this._fallingFruits.splice(i, 1);
      }
    }

    // 4. Update particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // gravity
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this._particles.splice(i, 1);
      }
    }

    return false;
  }

  // Spawn a new fruit at the top
  private _spawnFruit(): void {
    const margin = 50;
    const x = margin + Math.random() * (CANVAS_WIDTH - margin * 2);
    const speed = this._getBaseSpeed() * (0.85 + Math.random() * 0.3);

    this._fallingFruits.push({
      id: this._nextFruitId++,
      x,
      y: -30,
      speed,
      fruitId: this._fruitId,
      icon: this._fruitIcon,
      size: 36,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 4,
      caught: false,
    });
  }

  // Catch burst particles
  private _emitCatchParticles(x: number, y: number): void {
    const colors = ['#FDE047', '#F59E0B', '#F43F5E', '#10B981', '#38BDF8'];
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
      const speed = 100 + Math.random() * 160;
      this._particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        color: colors[i % colors.length],
        size: 5 + Math.random() * 6,
        alpha: 1.0,
        life: 0.6 + Math.random() * 0.3,
        maxLife: 0.8,
        type: 'STAR',
      });
    }
  }
}
