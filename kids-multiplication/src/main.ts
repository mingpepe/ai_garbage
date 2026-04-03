import './style.css'

type AppMode = 'explore' | 'practice';
type Difficulty = 1 | 2 | 3 | 4;

interface Problem {
  n1: number;
  n2: number;
}

interface State {
  mode: AppMode;
  difficulty: Difficulty;
  num1: number; // Groups (Baskets)
  num2: number; // Items per group
  fruit: string;
  options: number[];
  mistakeBuffer: Problem[];
  correctStreak: number;
  totalCorrect: number;
  totalWrong: number;
  sessionCorrect: number;
  isResting: boolean;
  restTimeLeft: number;
}

const fruits = ['🍎', '🍊', '🍌', '🍇', '🍓', '🍒', '🍍', '🍑', '🥝', '🍐', '🥭', '🍉'];

const state: State = {
  mode: 'explore',
  difficulty: 1,
  num1: 2,
  num2: 3,
  fruit: fruits[0],
  options: [],
  mistakeBuffer: [],
  correctStreak: 0,
  totalCorrect: 0,
  totalWrong: 0,
  sessionCorrect: 0,
  isResting: false,
  restTimeLeft: 0
};

// --- Sound Effects ---
let audioCtx: AudioContext | null = null;

function playSound(type: 'correct' | 'wrong' | 'break') {
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
  } else {
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.5);
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  }
  
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.5);
}

function generatePractice() {
  const prevN1 = state.num1;
  const prevN2 = state.num2;

  let nextN1, nextN2;
  do {
    if (state.correctStreak >= 3 && state.mistakeBuffer.length > 0) {
      const recovered = state.mistakeBuffer.shift()!;
      nextN1 = recovered.n1;
      nextN2 = recovered.n2;
    } else {
      const limits = { 1: 3, 2: 5, 3: 9, 4: 12 };
      const max = limits[state.difficulty];
      nextN1 = Math.floor(Math.random() * max) + 1;
      nextN2 = Math.floor(Math.random() * max) + 1;
    }
  } while (nextN1 === prevN1 && nextN2 === prevN2 && state.mistakeBuffer.length === 0);

  state.num1 = nextN1;
  state.num2 = nextN2;
  state.fruit = fruits[Math.floor(Math.random() * fruits.length)];

  const correct = state.num1 * state.num2;
  const opts = new Set([correct]);
  const maxPossible = { 1: 10, 2: 30, 3: 100, 4: 150 }[state.difficulty];
  while (opts.size < 6) {
    const distractor = Math.random() > 0.5 
      ? correct + (Math.floor(Math.random() * 7) - 3)
      : Math.floor(Math.random() * maxPossible) + 1;
    if (distractor > 0 && distractor !== correct) opts.add(distractor);
  }
  state.options = Array.from(opts).sort((a, b) => a - b);
}

function startRest() {
  state.isResting = true;
  state.restTimeLeft = 30;
  playSound('break');
  render();

  const timer = setInterval(() => {
    state.restTimeLeft--;
    if (state.restTimeLeft <= 0) {
      clearInterval(timer);
      state.isResting = false;
      state.sessionCorrect = 0;
      generatePractice();
      render();
    } else {
      render();
    }
  }, 1000);
}

function render() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  
  if (state.isResting) {
    app.innerHTML = `
      <div style="padding: 50px;">
        <h1 style="font-size: 5rem;">😴</h1>
        <h2>Fruit Break Time!</h2>
        <p>Rest your eyes for a bit...</p>
        <div style="font-size: 5rem; color: #ff9f43; font-weight: bold; margin: 20px;">${state.restTimeLeft}s</div>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    <div class="top-dashboard">
      ${state.mode === 'practice' ? renderStats() + renderDifficultySelector() : ''}
    </div>

    <h1>🍓 Kids Multiplication 🍎</h1>
    
    <div class="mode-switch">
      <button class="mode-btn ${state.mode === 'explore' ? 'active' : ''}" id="btn-explore">🔍 Explore</button>
      <button class="mode-btn ${state.mode === 'practice' ? 'active' : ''}" id="btn-practice">🎯 Play</button>
    </div>

    <div id="game-content">
      ${state.mode === 'explore' ? renderExplore() : renderPractice()}
    </div>
    
    <div id="feedback-overlay" class="feedback-overlay"></div>
  `;

  addEventListeners();
}

function renderStats() {
  return `
    <div class="stats-panel">
      <div>🏆 <span style="color: #2ecc71; font-weight: bold;">${state.totalCorrect}</span></div>
      <div>❌ <span style="color: #e74c3c; font-weight: bold;">${state.totalWrong}</span></div>
      <div>🔥 <span style="color: #f1c40f; font-weight: bold;">${state.correctStreak}</span></div>
    </div>
  `;
}

function renderDifficultySelector() {
  const labels = ['Easy', 'Med', 'Hard', 'Max'];
  return `
    <div class="diff-panel">
      <div class="selector-group">
        ${[1, 2, 3, 4].map(lv => `
          <button class="num-btn diff-btn ${state.difficulty === lv ? 'selected' : ''}" data-lv="${lv}">
            ${labels[lv-1]}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderExplore() {
  return `
    <div class="practice-equation" style="font-size: 2.8rem; font-weight: bold; margin-bottom: 10px; color: #ecf0f1;">
       <span style="color: #2ecc71;">${state.num2}</span> <span style="font-size: 0.4em;">(Items)</span>
       <span style="color: #e74c3c;">×</span> 
       <span style="color: #3498db;">${state.num1}</span> <span style="font-size: 0.4em;">(Groups)</span> 
    </div>

    <div style="margin-bottom: 10px;">
      <p style="color: #2ecc71; margin-bottom: 2px; font-size: 0.9rem;">How many fruits in each? (Items)</p>
      <div class="selector-group" style="gap: 5px; margin-bottom: 10px;">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `
          <button class="num-btn n2-btn ${state.num2 === n ? 'selected' : ''}" data-val="${n}" style="width: 40px; height: 40px; font-size: 1.2rem;">${n}</button>
        `).join('')}
      </div>
    </div>

    <div style="margin-bottom: 10px;">
      <p style="color: #3498db; margin-bottom: 2px; font-size: 0.9rem;">How many baskets? (Groups)</p>
      <div class="selector-group" style="gap: 5px; margin-bottom: 10px;">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `
          <button class="num-btn n1-btn ${state.num1 === n ? 'selected' : ''}" data-val="${n}" style="width: 40px; height: 40px; font-size: 1.2rem;">${n}</button>
        `).join('')}
      </div>
    </div>

    <div class="display-area" style="padding: 15px; min-height: 200px;">
      <div class="groups-container">${renderGroups()}</div>
      <div class="math-symbol" style="font-size: 2.5rem; margin: 10px 0;">=</div>
      <div class="result-area" style="font-size: 3.5rem; margin-top: 0;">${state.num1 * state.num2}</div>
      <div class="fruit-total">${renderTotalFruits()}</div>
    </div>
  `;
}

function renderPractice() {
  if (state.options.length === 0) generatePractice();
  const colors = ['#E74C3C', '#E67E22', '#F1C40F', '#27AE60', '#2980B9', '#8E44AD', '#16A085', '#D35400'].sort(() => Math.random() - 0.5);

  return `
    <div class="practice-equation" style="font-size: 3.5rem; font-weight: bold; margin-bottom: 10px; color: #ecf0f1;">
      ${state.num2} <span style="color: #e74c3c;">×</span> ${state.num1} = <span style="color: #3498db;">?</span>
    </div>

    <div class="display-area">
      <div class="groups-container">
        ${renderGroups()}
      </div>
    </div>
    
    <div style="margin-top: 20px;">
      <div class="options-grid">
        ${state.options.map((opt, index) => `
          <button class="option-btn" data-val="${opt}" style="background-color: ${colors[index % colors.length]}; color: white; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">${opt}</button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderGroups(): string {
  let html = '';
  const n = state.num2;

  let cols = 3;
  if (n <= 3) cols = n;
  else if (n === 4) cols = 2;
  else if (n === 5 || n === 6) cols = 3;
  else if (n === 7 || n === 8) cols = 4;
  else if (n === 9) cols = 3;
  else if (n === 10) cols = 5;
  else if (n === 11 || n === 12) cols = 4;

  const fruitSize = state.num2 > 9 ? '1.8rem' : (state.num2 > 6 ? '2.5rem' : '3.5rem');
  const groupScale = state.num1 > 9 ? 0.7 : (state.num1 > 6 ? 0.9 : 1.1);

  for (let i = 0; i < state.num1; i++) {
    html += `
      <div class="group-box" style="
        grid-template-columns: repeat(${cols}, 1fr);
        transform: scale(${groupScale});
        margin: -${(1-groupScale)*10}px;
        padding: 12px;
        width: auto;
        min-width: 60px;
        gap: 5px;
        border: 3px dashed #444;
      ">`;
    for (let j = 0; j < state.num2; j++) {
      html += `
        <span class="fruit-icon" style="
          font-size: ${fruitSize}; 
          display: inline-block;
          line-height: 1;
        ">${state.fruit}</span>`;
    }
    html += `</div>`;
  }
  return html;
}

function renderTotalFruits(): string {
  let html = '';
  const total = state.num1 * state.num2;
  const totalSize = total > 80 ? '1rem' : (total > 40 ? '1.5rem' : '2.2rem');
  for (let i = 0; i < total; i++) {
    html += `<span class="small-fruit" style="font-size: ${totalSize};">${state.fruit}</span>`;
  }
  return html;
}

function showFeedback(isCorrect: boolean) {
  const overlay = document.getElementById('feedback-overlay')!;
  const container = document.querySelector('.display-area')!;
  
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
    const alreadyIn = state.mistakeBuffer.some(m => m.n1 === state.num1 && m.n2 === state.num2);
    if (!alreadyIn) {
      state.mistakeBuffer.push({ n1: state.num1, n2: state.num2 });
    }
    container.classList.add('shake');
    setTimeout(() => container.classList.remove('shake'), 500);
  }

  setTimeout(() => {
    overlay.classList.remove('show');
    if (isCorrect) {
      if (state.sessionCorrect >= 10) {
        startRest();
      } else {
        generatePractice();
      }
    }
    render();
  }, 1000);
}

function resetStats() {
  state.totalCorrect = 0;
  state.totalWrong = 0;
  state.correctStreak = 0;
  state.sessionCorrect = 0;
  state.mistakeBuffer = [];
}

function addEventListeners() {
  document.getElementById('btn-explore')?.addEventListener('click', () => {
    state.mode = 'explore';
    render();
  });

  document.getElementById('btn-practice')?.addEventListener('click', () => {
    state.mode = 'practice';
    resetStats();
    generatePractice();
    render();
  });

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.difficulty = parseInt((e.currentTarget as HTMLButtonElement).dataset.lv!) as Difficulty;
      resetStats();
      generatePractice();
      render();
    });
  });

  document.querySelectorAll('.n1-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.num1 = parseInt((e.currentTarget as HTMLButtonElement).dataset.val!);
      render();
    });
  });

  document.querySelectorAll('.n2-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.num2 = parseInt((e.currentTarget as HTMLButtonElement).dataset.val!);
      render();
    });
  });

  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selected = parseInt((e.currentTarget as HTMLButtonElement).dataset.val!);
      const correct = state.num1 * state.num2;
      showFeedback(selected === correct);
    });
  });
}

render();
