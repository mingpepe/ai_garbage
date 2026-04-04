import './style.css'

type AppMode = 'practice' | 'interactive';
type Difficulty = 1 | 2 | 3 | 4;

interface Time {
  h: number; // 1-12
  m: number; // 0-59
  isPM: boolean;
}

interface State {
  mode: AppMode;
  difficulty: Difficulty;
  startTime: Time;
  endTime: Time;
  options: { h: number; m: number }[];
  interactiveCurrentTime: Time;
  interactiveDuration: { h: number, m: number };
  totalCorrect: number;
  totalWrong: number;
  correctStreak: number;
  sessionCorrect: number;
  sessionStartTime: number;
  isResting: boolean;
  restTimeLeft: number;
  showLevelUpModal: boolean;
  debugMode: boolean;
}

const state: State = {
  mode: 'practice',
  difficulty: 1,
  startTime: { h: 10, m: 0, isPM: false },
  endTime: { h: 12, m: 0, isPM: false },
  options: [],
  interactiveCurrentTime: { h: 10, m: 0, isPM: false },
  interactiveDuration: { h: 1, m: 0 },
  totalCorrect: 0,
  totalWrong: 0,
  correctStreak: 0,
  sessionCorrect: 0,
  sessionStartTime: Date.now(),
  isResting: false,
  restTimeLeft: 0,
  showLevelUpModal: false,
  debugMode: false 
};

// --- Context Icons ---
function getContextIcon(h: number, isPM: boolean): string {
  const h24 = isPM ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
  if (h24 >= 6 && h24 < 8) return '🥣'; 
  if (h24 >= 8 && h24 < 10) return '🎒'; 
  if (h24 >= 10 && h24 < 12) return '📖'; 
  if (h24 >= 12 && h24 < 14) return '🍱'; 
  if (h24 >= 14 && h24 < 16) return '🎨'; 
  if (h24 >= 16 && h24 < 18) return '⚽'; 
  if (h24 >= 18 && h24 < 20) return '🍽️'; 
  if (h24 >= 20 && h24 < 21) return '🛁'; 
  if (h24 >= 21 || h24 < 6) return '🛌'; 
  return '☀️';
}

// --- Sound Effects ---
let audioCtx: AudioContext | null = null;

function playSound(type: 'correct' | 'wrong' | 'break' | 'click' | 'levelup') {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  if (type === 'correct') {
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
  } else if (type === 'wrong') {
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  } else if (type === 'break') {
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.5);
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  } else if (type === 'levelup') {
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2);
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  } else {
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
  }
  
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.5);
}

function timeToTotalMins(t: Time) {
  const h24 = t.isPM ? (t.h === 12 ? 12 : t.h + 12) : (t.h === 12 ? 0 : t.h);
  return h24 * 60 + t.m;
}

function minsToTime(totalMins: number): Time {
  let m = totalMins % 60;
  if (m < 0) { m += 60; totalMins -= 60; } 
  let h24 = Math.floor(totalMins / 60) % 24;
  if (h24 < 0) h24 += 24; 
  
  return {
    h: (h24 % 12 === 0 ? 12 : h24 % 12),
    m: m,
    isPM: h24 >= 12
  };
}

function generateProblem() {
  const forceCross12 = state.difficulty >= 3 && Math.random() > 0.5;
  let startH24 = Math.floor(Math.random() * 24);
  if (forceCross12) {
    startH24 = Math.random() > 0.5 ? 10 + Math.floor(Math.random() * 2) : 22 + Math.floor(Math.random() * 2);
  }

  let startM = 0;
  if (state.difficulty >= 4) startM = Math.floor(Math.random() * 60);
  else if (state.difficulty >= 3) startM = Math.floor(Math.random() * 4) * 15;
  else if (state.difficulty >= 2) startM = Math.floor(Math.random() * 2) * 30;

  state.startTime = minsToTime(startH24 * 60 + startM);

  let diffH = Math.floor(Math.random() * (state.difficulty === 1 ? 4 : 6)) + 1;
  let diffM = 0;
  if (state.difficulty >= 4) diffM = Math.floor(Math.random() * 60);
  else if (state.difficulty >= 3) diffM = Math.floor(Math.random() * 4) * 15;
  else if (state.difficulty >= 2) diffM = Math.floor(Math.random() * 2) * 30;

  if (forceCross12 && diffH < 2) diffH = 2; 

  let startTotal = timeToTotalMins(state.startTime);
  let endTotal = startTotal + diffH * 60 + diffM;
  state.endTime = minsToTime(endTotal);
  
  if (state.mode === 'interactive') {
    state.interactiveDuration = { h: diffH, m: diffM };
    state.interactiveCurrentTime = { ...state.startTime };
    return;
  }

  const correct = { h: diffH, m: diffM };
  const opts = new Set([JSON.stringify(correct)]);
  
  while (opts.size < 6) {
    let randomH = Math.floor(Math.random() * 8) + (state.difficulty === 1 ? 1 : 0);
    let randomM = 0;
    if (state.difficulty >= 4) randomM = Math.floor(Math.random() * 60);
    else if (state.difficulty >= 3) randomM = Math.floor(Math.random() * 4) * 15;
    else if (state.difficulty >= 2) randomM = Math.floor(Math.random() * 2) * 30;
    if (randomH === 0 && randomM === 0) continue;
    opts.add(JSON.stringify({ h: randomH, m: randomM }));
  }
  
  state.options = Array.from(opts).map(s => JSON.parse(s)).sort((a, b) => (a.h * 60 + a.m) - (b.h * 60 + b.m));
}

let restTimer: any = null;

function startRest() {
  state.isResting = true;
  state.restTimeLeft = 20;
  playSound('break');
  render();

  if (restTimer) clearInterval(restTimer);
  restTimer = setInterval(() => {
    state.restTimeLeft--;
    if (state.restTimeLeft <= 0) {
      endRest();
    } else {
      render();
    }
  }, 1000);
}

function endRest() {
  if (restTimer) clearInterval(restTimer);
  restTimer = null;
  state.isResting = false;
  state.sessionCorrect = 0;
  state.sessionStartTime = Date.now();
  generateProblem();
  render();
}

function drawClock(canvasId: string, time: Time, sweepStart?: Time) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  const radius = canvas.height / 2;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(radius, radius);
  
  if (sweepStart) {
    const startMins = timeToTotalMins(sweepStart);
    let endMins = timeToTotalMins(time);
    if (endMins < startMins) endMins += 24 * 60; 
    const diffMins = endMins - startMins;
    
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const startAngleM = (sweepStart.m * Math.PI / 30) - Math.PI / 2;
    let endAngleM = (time.m * Math.PI / 30) - Math.PI / 2;
    if (diffMins >= 60) endAngleM = startAngleM + 2 * Math.PI;
    if (endAngleM < startAngleM) endAngleM += 2 * Math.PI;
    ctx.arc(0, 0, radius * 0.8, startAngleM, endAngleM);
    ctx.fillStyle = 'rgba(52, 152, 219, 0.2)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    const startH = (sweepStart.h % 12) + sweepStart.m / 60;
    const endH = (time.h % 12) + time.m / 60;
    const startAngleH = (startH * Math.PI / 6) - Math.PI / 2;
    let endAngleH = (endH * Math.PI / 6) - Math.PI / 2;
    if (diffMins >= 12 * 60) endAngleH = startAngleH + 2 * Math.PI;
    else if (endAngleH < startAngleH) endAngleH += 2 * Math.PI;
    ctx.arc(0, 0, radius * 0.5, startAngleH, endAngleH);
    ctx.fillStyle = 'rgba(231, 76, 60, 0.2)';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, 0, 2 * Math.PI);
  ctx.fillStyle = '#ecf0f1';
  ctx.fill();
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = radius * 0.05;
  ctx.stroke();

  ctx.restore();
  ctx.save();
  ctx.translate(radius, radius);
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    ctx.lineWidth = i % 5 === 0 ? 4 : 1;
    ctx.strokeStyle = '#333';
    const start = i % 5 === 0 ? 0.75 : 0.82;
    ctx.moveTo(0, -radius * 0.88);
    ctx.lineTo(0, -radius * start);
    ctx.stroke();
    ctx.rotate(Math.PI / 30);
  }

  ctx.font = `bold ${radius * 0.18}px Arial`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = "#2c3e50";
  for (let num = 1; num <= 12; num++) {
    const ang = num * Math.PI / 6;
    ctx.fillText(num.toString(), Math.sin(ang) * radius * 0.65, -Math.cos(ang) * radius * 0.65);
  }

  const h = (time.h % 12) + time.m / 60;
  const m = time.m;
  drawHand(ctx, (h * Math.PI / 6), radius * 0.5, radius * 0.08, "#e74c3c");
  drawHand(ctx, (m * Math.PI / 30), radius * 0.8, radius * 0.04, "#3498db");

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.06, 0, 2 * Math.PI);
  ctx.fillStyle = '#2c3e50';
  ctx.fill();
  ctx.restore();
}

function drawHand(ctx: CanvasRenderingContext2D, pos: number, length: number, width: number, color: string) {
  ctx.beginPath();
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.moveTo(0, 0);
  ctx.rotate(pos);
  ctx.lineTo(0, -length);
  ctx.stroke();
  ctx.rotate(-pos);
}

function getForestString(): string {
  const treesCount = Math.floor(state.totalCorrect / 5);
  const treeTypes = ['🌱', '🌿', '🌳', '🌲', '🍎', '🍄'];
  let forest = '';
  for(let i=0; i<treesCount; i++) forest += treeTypes[i % treeTypes.length];
  return forest || '...';
}

function render() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  if (state.isResting) {
    app.innerHTML = `
      <div style="padding: 50px;">
        <h1 style="font-size: 5rem;">😴</h1>
        <h2>Time to Rest!</h2>
        <p>Rest your eyes for a bit...</p>
        <div style="font-size: 5rem; color: #ff9f43; font-weight: bold; margin: 20px;">${state.restTimeLeft}s</div>
      </div>
      ${renderDebugIndicator()}
    `;
    return;
  }

  const diffIcons = ['🌱', '🌿', '🌳', '🌲'];
  const startIcon = getContextIcon(state.startTime.h, state.startTime.isPM);
  let mainContent = '';

  if (state.mode === 'practice') {
    const endIcon = getContextIcon(state.endTime.h, state.endTime.isPM);
    mainContent = `
      <div class="clocks-container">
        <div class="clock-box"><div class="digital-time-container"><div class="sun-moon">${state.startTime.isPM ? '🌙' : '☀️'}</div><div class="digital-time">${state.startTime.h}:${state.startTime.m.toString().padStart(2, '0')}</div><div class="context-icon">${startIcon}</div></div><canvas id="clock-start" class="clock-canvas" width="280" height="280"></canvas></div>
        <div class="arrow">➡️</div>
        <div class="clock-box"><div class="digital-time-container"><div class="sun-moon">${state.endTime.isPM ? '🌙' : '☀️'}</div><div class="digital-time">${state.endTime.h}:${state.endTime.m.toString().padStart(2, '0')}</div><div class="context-icon">${endIcon}</div></div><canvas id="clock-end" class="clock-canvas" width="280" height="280"></canvas></div>
      </div>
      <div class="options-grid">${state.options.map((opt, i) => `<button class="option-btn" data-h="${opt.h}" data-m="${opt.m}" style="background-color: ${getOptionColor(i)}; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 2.5rem; min-height: 80px;">${opt.h}:${opt.m.toString().padStart(2, '0')}</button>`).join('')}</div>
    `;
  } else {
    mainContent = `
      <h2 style="color: #ffda79; margin-bottom: 5px;">Move the clock forward by:</h2>
      <div style="font-size: 3.5rem; font-weight: bold; color: #fff; margin-bottom: 20px; background: #2c3e50; display: inline-block; padding: 10px 40px; border-radius: 15px; border: 3px solid #3498db; font-family: 'Courier New', Courier, monospace;">
        ${state.interactiveDuration.h}:${state.interactiveDuration.m.toString().padStart(2, '0')}
      </div>
      <div class="clocks-container">
        <div class="clock-box"><div class="digital-time-container"><div class="sun-moon">${state.startTime.isPM ? '🌙' : '☀️'}</div><div class="digital-time">${state.startTime.h}:${state.startTime.m.toString().padStart(2, '0')}</div><div class="context-icon">${startIcon}</div></div><canvas id="clock-start" class="clock-canvas" width="220" height="220"></canvas></div>
        <div class="arrow">➡️</div>
        <div class="clock-box" style="border-color: #f1c40f; box-shadow: 0 0 20px rgba(241,196,15,0.4);">
          <div class="digital-time-container"><div class="sun-moon">${state.interactiveCurrentTime.isPM ? '🌙' : '☀️'}</div><div class="digital-time" style="color: #fff; background: #8e44ad;">${state.interactiveCurrentTime.h}:${state.interactiveCurrentTime.m.toString().padStart(2, '0')}</div><div class="context-icon">${getContextIcon(state.interactiveCurrentTime.h, state.interactiveCurrentTime.isPM)}</div></div>
          <canvas id="clock-interactive" class="clock-canvas" width="280" height="280"></canvas>
          <div class="interactive-controls">
            <button class="ctrl-btn" data-action="-1h">-1h</button><button class="ctrl-btn" data-action="+1h">+1h</button>
            <button class="ctrl-btn" data-action="-5m">-5m</button><button class="ctrl-btn" data-action="+5m">+5m</button>
            ${state.difficulty === 4 ? `<button class="ctrl-btn" data-action="-1m">-1m</button><button class="ctrl-btn" data-action="+1m">+1m</button>` : ''}
          </div>
          <button class="ctrl-btn check" id="check-btn" style="margin-top:15px; width: 100%;">Check! ✔️</button>
        </div>
      </div>
    `;
  }

  app.innerHTML = `
    <div class="dashboard"><div class="stats-panel"><div class="stats-row"><div title="Correct">🏆 <span style="color: #2ecc71;">${state.totalCorrect}</span></div><div title="Wrong">❌ <span style="color: #e74c3c;">${state.totalWrong}</span></div><div title="Streak">🔥 <span style="color: #f1c40f;">${state.correctStreak}</span></div></div><div class="forest-row" title="Your Forest">🌲: ${getForestString()}</div></div><div class="diff-panel"><div class="selector-group">${[1, 2, 3, 4].map(lv => `<button class="btn diff-btn ${state.difficulty === lv ? 'selected' : ''}" data-lv="${lv}">${diffIcons[lv-1]}</button>`).join('')}</div></div></div>
    <h1>🕒 Kids Time Magic ⏱️</h1>
    <div class="selector-group" style="margin-bottom: 10px;"><button class="btn mode-btn ${state.mode === 'practice' ? 'selected' : ''}" data-mode="practice">🔍 Guess Time</button><button class="btn mode-btn ${state.mode === 'interactive' ? 'selected' : ''}" data-mode="interactive">🖐️ Set Clock</button></div>
    ${mainContent}
    <div id="feedback-overlay" class="feedback-overlay"></div>
    ${state.showLevelUpModal ? `<div class="modal-overlay"><div class="modal-content"><h2 style="font-size: 2rem; color: #f1c40f;">🌟 Level Up! 🌟</h2><p style="font-size: 1.2rem; color: #ecf0f1; margin: 20px 0;">You are doing great! Want to try a harder level?</p><button class="modal-btn yes" id="btn-lvl-yes">Yes, Let's Go!</button><button class="modal-btn no" id="btn-lvl-no">Not Yet</button></div></div>` : ''}
    ${renderDebugIndicator()}
  `;

  drawClock('clock-start', state.startTime);
  if (state.mode === 'practice') drawClock('clock-end', state.endTime, state.startTime);
  else drawClock('clock-interactive', state.interactiveCurrentTime, state.startTime);
  addEventListeners();
}

function renderDebugIndicator() {
  if (!state.debugMode) return '';
  return `
    <div style="position: fixed; bottom: 5px; right: 5px; font-size: 1.2rem; opacity: 0.5; pointer-events: none; z-index: 1000;" title="Debug Mode Active">🛠️</div>
  `;
}

function getOptionColor(i: number) { return ['#E74C3C', '#E67E22', '#F1C40F', '#27AE60', '#2980B9', '#8E44AD'][i % 6]; }

function showFeedback(isCorrect: boolean) {
  const overlay = document.getElementById('feedback-overlay')!;
  if (!overlay) return;
  overlay.innerText = isCorrect ? '🌟' : '❌';
  overlay.className = 'feedback-overlay show';
  playSound(isCorrect ? 'correct' : 'wrong');

  if (isCorrect) {
    state.totalCorrect++;
    state.correctStreak++;
    state.sessionCorrect++;
  } else {
    state.totalWrong++;
    state.correctStreak = 0;
    document.querySelector('.clocks-container')?.classList.add('shake');
    setTimeout(() => document.querySelector('.clocks-container')?.classList.remove('shake'), 500);
  }

  setTimeout(() => {
    overlay.classList.remove('show');
    if (isCorrect) {
      if (state.correctStreak % 10 === 0 && state.difficulty < 4) {
        playSound('levelup');
        state.showLevelUpModal = true;
        render();
        return;
      }
      const elapsedMinutes = (Date.now() - state.sessionStartTime) / 1000 / 60;
      if (elapsedMinutes >= 5) {
        startRest();
      } else {
        generateProblem();
        render();
      }
    } else {
      render();
    }
  }, 1000);
}

function adjustInteractiveTime(action: string) {
  let mins = timeToTotalMins(state.interactiveCurrentTime);
  playSound('click');
  if (action === '+1h') mins += 60;
  if (action === '-1h') mins -= 60;
  if (action === '+5m') mins += 5;
  if (action === '-5m') mins -= 5;
  if (action === '+1m') mins += 1;
  if (action === '-1m') mins -= 1;
  state.interactiveCurrentTime = minsToTime(mins);
  render();
}

function checkInteractiveAnswer() {
  const expectedEnd = minsToTime(timeToTotalMins(state.startTime) + state.interactiveDuration.h * 60 + state.interactiveDuration.m);
  showFeedback(expectedEnd.h === state.interactiveCurrentTime.h && expectedEnd.m === state.interactiveCurrentTime.m && expectedEnd.isPM === state.interactiveCurrentTime.isPM);
}

function addEventListeners() {
  document.querySelectorAll('.diff-btn').forEach(btn => btn.addEventListener('click', (e) => {
    state.difficulty = parseInt((e.currentTarget as HTMLButtonElement).dataset.lv!) as Difficulty;
    state.totalCorrect = 0; state.totalWrong = 0; state.correctStreak = 0; state.sessionCorrect = 0;
    state.sessionStartTime = Date.now(); generateProblem(); render();
  }));
  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', (e) => {
    state.mode = (e.currentTarget as HTMLButtonElement).dataset.mode as AppMode;
    generateProblem(); render();
  }));
  document.querySelectorAll('.option-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const h = parseInt((e.currentTarget as HTMLButtonElement).dataset.h!);
    const m = parseInt((e.currentTarget as HTMLButtonElement).dataset.m!);
    const diffTotal = timeToTotalMins(state.endTime) - timeToTotalMins(state.startTime);
    const actualDiff = diffTotal < 0 ? diffTotal + 24 * 60 : diffTotal;
    showFeedback(h === Math.floor(actualDiff / 60) && m === actualDiff % 60);
  }));
  document.querySelectorAll('.ctrl-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const el = e.currentTarget as HTMLButtonElement;
    if (el.id === 'check-btn') checkInteractiveAnswer();
    else adjustInteractiveTime(el.dataset.action!);
  }));
  document.getElementById('btn-lvl-yes')?.addEventListener('click', () => {
    state.difficulty = Math.min(state.difficulty + 1, 4) as Difficulty;
    state.showLevelUpModal = false; generateProblem(); render();
  });
  document.getElementById('btn-lvl-no')?.addEventListener('click', () => { state.showLevelUpModal = false; generateProblem(); render(); });
}

// Global Key Listeners for Debugging
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  
  // Toggle Debug Mode
  if (key === 'd') {
    state.debugMode = true;
    render();
    console.log("Debug Mode: ON");
  } else if (e.key === 'Escape') {
    state.debugMode = false;
    render();
    console.log("Debug Mode: OFF");
  }

  // Debug Actions (Only if debugMode is true)
  if (state.debugMode) {
    if (key === 'w') showFeedback(true);
    if (key === 'l') showFeedback(false);
    if (key === 's' && state.isResting) endRest();
  }
});

generateProblem();
render();
