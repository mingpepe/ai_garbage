import { initAudio, playWarningMusic, playBattleMusic, stopMusic, setMute, setVolume } from './audio';

// Tower Defense Game Logic

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const moneyEl = document.getElementById('money')!;
const livesEl = document.getElementById('lives')!;
const waveEl = document.getElementById('wave')!;
const nextWaveBtn = document.getElementById('btn-next-wave') as HTMLButtonElement;
const soundToggleBtn = document.getElementById('btn-toggle-sound') as HTMLButtonElement;
const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
const autoWaveToggle = document.getElementById('auto-wave-toggle') as HTMLInputElement;

let soundEnabled = false;
let audioInitialized = false;

soundToggleBtn.addEventListener('click', async () => {
  if (!audioInitialized) {
    await initAudio();
    setVolume(parseFloat(volumeSlider.value));
    audioInitialized = true;
  }
  
  soundEnabled = !soundEnabled;
  setMute(!soundEnabled);
  
  if (soundEnabled) {
    soundToggleBtn.textContent = 'SOUND: ON';
    soundToggleBtn.style.background = '#3b82f6';
    if (waveEnemiesToSpawn === 0 && enemies.length === 0 && !isGameOver) {
      playWarningMusic();
    } else if (!isGameOver) {
      playBattleMusic();
    }
  } else {
    soundToggleBtn.textContent = 'SOUND: OFF';
    soundToggleBtn.style.background = '#444';
  }
});

volumeSlider.addEventListener('input', () => {
  setVolume(parseFloat(volumeSlider.value));
});
const towerButtons = document.querySelectorAll('.tower-opt') as NodeListOf<HTMLButtonElement>;

// Game State
let money = 200;
let lives = 20;
let wave = 0;
let lastTime = performance.now();
let isGameOver = false;
let selectedTowerType = 'basic';
let mouseX = 0;
let mouseY = 0;
let autoWave = false;

// Constants
const TOWER_RADIUS = 18;
const ENEMY_RADIUS = 12;
const PATH_WIDTH = 50;

const TOWER_TYPES = {
  basic: { cost: 50, damage: 30, range: 120, cooldown: 0.5, color: '#333' },
  sniper: { cost: 120, damage: 150, range: 300, cooldown: 1.5, color: '#1e3a8a' },
  cannon: { cost: 200, damage: 80, range: 160, cooldown: 0.8, color: '#451a03' }
};

const ENEMY_TYPES = [
  { hpMult: 1, speedMult: 1, color: '#4ade80', reward: 10, weight: 1.0 }, // Normal
  { hpMult: 3.5, speedMult: 0.6, color: '#fbbf24', reward: 30, weight: 0.4 }, // Tank
  { hpMult: 0.7, speedMult: 1.8, color: '#3b82f6', reward: 15, weight: 0.5 }, // Scout
  { hpMult: 10, speedMult: 0.4, color: '#f87171', reward: 150, weight: 0.1 } // Boss
];

const WAYPOINTS = [
  { x: -30, y: 300 },
  { x: 400, y: 300 },
  { x: 400, y: 100 },
  { x: 700, y: 100 },
  { x: 700, y: 500 },
  { x: 830, y: 500 },
];

class Enemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  reward: number;
  color: string;
  waypointIndex: number = 0;

  constructor(hp: number, speed: number, reward: number, color: string) {
    this.x = WAYPOINTS[0].x;
    this.y = WAYPOINTS[0].y;
    this.maxHp = hp;
    this.hp = hp;
    this.speed = speed;
    this.reward = reward;
    this.color = color;
  }

  update(dt: number) {
    const target = WAYPOINTS[this.waypointIndex + 1];
    if (!target) return;

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);

    const moveDist = this.speed * dt;
    if (dist <= moveDist) {
      this.x = target.x;
      this.y = target.y;
      this.waypointIndex++;
    } else {
      this.x += (dx / dist) * moveDist;
      this.y += (dy / dist) * moveDist;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, ENEMY_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.fillRect(this.x - 12, this.y - 22, 24, 5);
    ctx.fillStyle = '#0f0';
    const hpPercent = Math.max(0, this.hp / this.maxHp);
    ctx.fillRect(this.x - 12, this.y - 22, 24 * hpPercent, 5);
  }
}

class Tower {
  x: number;
  y: number;
  range: number;
  damage: number;
  cooldown: number;
  color: string;
  timer: number = 0;

  constructor(x: number, y: number, type: keyof typeof TOWER_TYPES) {
    this.x = x;
    this.y = y;
    const config = TOWER_TYPES[type];
    this.range = config.range;
    this.damage = config.damage;
    this.cooldown = config.cooldown;
    this.color = config.color;
  }

  update(dt: number, enemies: Enemy[], projectiles: Projectile[]) {
    this.timer -= dt;
    if (this.timer <= 0) {
      let bestTarget: Enemy | null = null;
      let maxWaypoint = -1;

      for (const enemy of enemies) {
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist <= this.range) {
          if (enemy.waypointIndex > maxWaypoint) {
            maxWaypoint = enemy.waypointIndex;
            bestTarget = enemy;
          } else if (enemy.waypointIndex === maxWaypoint && bestTarget === null) {
            bestTarget = enemy;
          }
        }
      }

      if (bestTarget) {
        this.shoot(bestTarget, projectiles);
        this.timer = this.cooldown;
      }
    }
  }

  shoot(target: Enemy, projectiles: Projectile[]) {
    projectiles.push(new Projectile(this.x, this.y, target, this.damage));
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, TOWER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, TOWER_RADIUS * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

class Projectile {
  x: number;
  y: number;
  target: Enemy;
  speed: number = 800;
  damage: number;
  hit: boolean = false;

  constructor(x: number, y: number, target: Enemy, damage: number) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
  }

  update(dt: number) {
    if (this.hit) return;
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    const moveDist = this.speed * dt;
    if (dist <= moveDist) {
      this.target.hp -= this.damage;
      this.hit = true;
    } else {
      this.x += (dx / dist) * moveDist;
      this.y += (dy / dist) * moveDist;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

const enemies: Enemy[] = [];
const towers: Tower[] = [];
const projectiles: Projectile[] = [];

let waveEnemiesToSpawn = 0;
let spawnTimer = 0;
let spawnInterval = 1.0;

towerButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    towerButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTowerType = btn.dataset.type as string;
  });
});

function startWave() {
  if (waveEnemiesToSpawn > 0 || enemies.length > 0) return;
  wave++;
  waveEnemiesToSpawn = 10 + Math.floor(wave * 4);
  spawnInterval = Math.max(0.12, 1.0 - wave * 0.08);
  nextWaveBtn.disabled = true;
  updateUI();
  playBattleMusic();
}

nextWaveBtn.addEventListener('click', startWave);
autoWaveToggle.addEventListener('change', () => {
  autoWave = autoWaveToggle.checked;
  if (autoWave && !nextWaveBtn.disabled) {
    startWave();
  }
});

function updateUI() {
  moneyEl.textContent = `$${money}`;
  livesEl.textContent = lives.toString();
  waveEl.textContent = wave.toString();
  if (waveEnemiesToSpawn === 0 && enemies.length === 0) {
    nextWaveBtn.disabled = false;
    if (!isGameOver) playWarningMusic(); // Play warning music when waiting for next wave
    if (autoWave) {
      setTimeout(() => {
        if (autoWave && !isGameOver) startWave();
      }, 1000);
    }
  }
}

function distanceToSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function isOverlappingPath(x: number, y: number) {
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const dist = distanceToSegment({x, y}, WAYPOINTS[i], WAYPOINTS[i+1]);
    if (dist < PATH_WIDTH / 2 + TOWER_RADIUS) return true;
  }
  return false;
}

function isOverlappingTower(x: number, y: number) {
  for (const t of towers) {
    if (Math.hypot(t.x - x, t.y - y) < TOWER_RADIUS * 2.2) return true;
  }
  return false;
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouseX = (e.clientX - rect.left) * scaleX;
  mouseY = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener('click', () => {
  const config = TOWER_TYPES[selectedTowerType as keyof typeof TOWER_TYPES];
  if (money >= config.cost && !isOverlappingPath(mouseX, mouseY) && !isOverlappingTower(mouseX, mouseY)) {
    money -= config.cost;
    towers.push(new Tower(mouseX, mouseY, selectedTowerType as keyof typeof TOWER_TYPES));
    updateUI();
  }
});

function drawPath() {
  ctx.strokeStyle = '#4a4a4a'; // dark path
  ctx.lineWidth = PATH_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  
  ctx.beginPath();
  ctx.moveTo(WAYPOINTS[0].x, WAYPOINTS[0].y);
  for (let i = 1; i < WAYPOINTS.length; i++) {
    ctx.lineTo(WAYPOINTS[i].x, WAYPOINTS[i].y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#5a5a5a';
  ctx.lineWidth = PATH_WIDTH - 15;
  ctx.stroke();
}

function gameLoop(timestamp: number) {
  if (isGameOver) {
    stopMusic();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
    ctx.font = '24px sans-serif';
    ctx.fillText(`Waves Cleared: ${wave - 1}`, canvas.width / 2, canvas.height / 2 + 50);
    return;
  }

  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Spawning logic
  if (waveEnemiesToSpawn > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const baseHp = 20 * Math.pow(1.35, wave - 1); // Even stronger growth
      const baseSpeed = 60 + wave * 3;

      let totalWeight = 0;
      ENEMY_TYPES.forEach(t => totalWeight += t.weight);
      let rand = Math.random() * totalWeight;
      let selectedType = ENEMY_TYPES[0];
      for (const t of ENEMY_TYPES) {
        if (rand < t.weight) {
          selectedType = t;
          break;
        }
        rand -= t.weight;
      }

      enemies.push(new Enemy(
        baseHp * selectedType.hpMult,
        baseSpeed * selectedType.speedMult,
        selectedType.reward,
        selectedType.color
      ));
      waveEnemiesToSpawn--;
      spawnTimer = spawnInterval;
    }
  } else if (enemies.length === 0 && nextWaveBtn.disabled) {
    // Wave just finished
    updateUI(); // This will trigger nextWaveBtn.disabled = false and potentially autoWave
  }

  // Update logic
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.update(dt);
    if (e.waypointIndex >= WAYPOINTS.length - 1) {
      lives--;
      enemies.splice(i, 1);
      updateUI();
      if (lives <= 0) isGameOver = true;
    } else if (e.hp <= 0) {
      money += e.reward;
      enemies.splice(i, 1);
      updateUI();
    }
  }

  for (const t of towers) t.update(dt, enemies, projectiles);
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.update(dt);
    if (p.hit || !enemies.includes(p.target)) {
      projectiles.splice(i, 1);
    }
  }

  // Draw phase
  drawPath();
  for (const t of towers) t.draw(ctx);
  for (const e of enemies) e.draw(ctx);
  for (const p of projectiles) p.draw(ctx);

  // Draw Range Preview (Hover)
  const hoverConfig = TOWER_TYPES[selectedTowerType as keyof typeof TOWER_TYPES];
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  if (isOverlappingPath(mouseX, mouseY) || isOverlappingTower(mouseX, mouseY)) {
    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
  }
  ctx.beginPath();
  ctx.arc(mouseX, mouseY, hoverConfig.range, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  requestAnimationFrame(gameLoop);
}

// Start game
updateUI();
requestAnimationFrame(gameLoop);
