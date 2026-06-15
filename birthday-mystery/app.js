/**
 * Big Bear's Birthday Mystery - Game Logic
 * Language: English text/comments, Chinese Voice prompts.
 */

// Sound Effects and Music Synth using Web Audio API
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.musicInterval = null;
    this.isMuted = true;
    this.musicPlaying = false;
  }

  // Initialize and resume AudioContext on user interaction
  async init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.error("Failed to resume AudioContext:", err);
      }
    }
  }

  // Soft click sound (short rising frequency)
  async playClick() {
    await this.init();
    if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Dress sound (cute swoop down)
  async playDress() {
    await this.init();
    if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'triangle';
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.2);
    
    gain.gain.setValueAtTime(0.20, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Error/Fail sound (sad slide down buzz)
  async playFail() {
    await this.init();
    if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sawtooth';
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.35);
    
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  // Celebration success chime (happy arpeggio)
  async playSuccess() {
    await this.init();
    if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
    
    const now = this.ctx.currentTime;
    // Triumphant C-major arpeggio notes (C4, E4, G4, C5, E5, G5, C6)
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sine';
      
      const noteTime = now + index * 0.08;
      osc.frequency.setValueAtTime(freq, noteTime);
      gain.gain.setValueAtTime(0.15, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);
      
      osc.start(noteTime);
      osc.stop(noteTime + 0.3);
    });
  }

  // Start background music loop (gentle music box feel)
  async startMusic() {
    await this.init();
    this.isMuted = false;
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    
    // Cheerful, looping pentatonic lullaby sequence
    const melody = [
      { f: 261.63, d: 0.5 }, // C4
      { f: 329.63, d: 0.5 }, // E4
      { f: 392.00, d: 0.5 }, // G4
      { f: 440.00, d: 0.5 }, // A4
      { f: 523.25, d: 0.5 }, // C5
      { f: 440.00, d: 0.5 }, // A4
      { f: 392.00, d: 0.5 }, // G4
      { f: 329.63, d: 0.5 }, // E4
      { f: 293.66, d: 0.5 }, // D4
      { f: 329.63, d: 0.5 }, // E4
      { f: 392.00, d: 0.5 }, // G4
      { f: 293.66, d: 0.5 }  // D4
    ];
    
    let noteIndex = 0;
    const playNextNote = async () => {
      if (!this.musicPlaying || this.isMuted) return;
      
      // Ensure context is running (re-resume if browser slept it)
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      if (!this.ctx || this.ctx.state !== 'running') {
        this.musicInterval = setTimeout(playNextNote, 200);
        return;
      }

      const note = melody[noteIndex];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      // Sine wave gives a soft music box feel
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.f, this.ctx.currentTime);
      
      // Keep it soft but clearly audible in the background
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime); 
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + note.d);
      
      osc.start();
      osc.stop(this.ctx.currentTime + note.d);
      
      noteIndex = (noteIndex + 1) % melody.length;
      // Schedule next note
      this.musicInterval = setTimeout(playNextNote, note.d * 1000 + 50);
    };
    
    playNextNote();
  }

  // Stop background music
  stopMusic() {
    this.musicPlaying = false;
    if (this.musicInterval) {
      clearTimeout(this.musicInterval);
    }
  }

  // Toggle music on/off
  async toggleMusic() {
    await this.init();
    if (this.isMuted) {
      await this.startMusic();
      return true;
    } else {
      this.isMuted = true;
      this.stopMusic();
      return false;
    }
  }
}

// Particle/Confetti Engine for victory celebration
class ConfettiEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.isActive = false;
    this.colors = ['#ff4d4d', '#ffd54f', '#4d94ff', '#10b981', '#f43f5e', '#8b5cf6'];
    
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  start() {
    this.isActive = true;
    this.particles = [];
    // Spawn initial burst of particles
    for (let i = 0; i < 150; i++) {
      this.particles.push(this.createParticle(true));
    }
    this.animate();
  }

  stop() {
    this.isActive = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  createParticle(isBurst = false) {
    return {
      x: isBurst ? this.canvas.width / 2 + (Math.random() - 0.5) * 150 : Math.random() * this.canvas.width,
      y: isBurst ? this.canvas.height / 2 + (Math.random() - 0.5) * 100 : -20,
      size: Math.random() * 8 + 6,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      speedX: (Math.random() - 0.5) * 14,
      speedY: isBurst ? -Math.random() * 12 - 4 : Math.random() * 4 + 2,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 8,
      opacity: 1
    };
  }

  animate() {
    if (!this.isActive) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.speedX;
      p.y += p.speedY;
      p.speedY += 0.15; // Gravity
      p.speedX *= 0.98; // Air resistance
      p.rotation += p.rotationSpeed;
      
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation * Math.PI / 180);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.opacity;
      
      // Draw alternate squares and circles
      if (i % 2 === 0) {
        this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
      
      this.ctx.restore();

      // Recycled fell-off particles
      if (p.y > this.canvas.height) {
        this.particles[i] = this.createParticle(false);
      }
    }

    requestAnimationFrame(() => this.animate());
  }
}

// Game Script Constants and State Variables
const SFX = new SoundEffects();
let confetti = null;

// Game State
const state = {
  assignments: {
    rabbit: null, // 'red', 'yellow', 'blue', or null
    monkey: null,
    kitty: null
  },
  selectedColor: null, // Currently clicked/active color from closet
  isGameFinished: false
};

// Puzzle Answers
const SOLUTION = {
  rabbit: 'blue',
  monkey: 'yellow',
  kitty: 'red'
};

// Text Transcripts for SpeechSynthesis (Chinese) and Subtitles (English + Chinese)
const SCRIPTS = {
  intro: {
    speech: "大熊的生日派對開始囉！小兔子、小猴子和小貓咪穿著不同顏色的衣服，分別是紅色、黃色和藍色。請點擊小動物，聽聽牠們的提示，幫牠們穿上正確顏色的衣服吧！",
    engText: "Welcome to Big Bear's Birthday Party! Help Rabbit, Monkey, and Kitty dress in their correct shirt colors.",
    zhtText: "大熊的生日派對開始囉！幫小兔子、小猴子和小貓咪穿上正確顏色的衣服吧！"
  },
  rabbit: {
    speech: "我是小兔子，提示是：我不喜歡紅色，所以我沒有穿紅色的衣服喔！",
    engText: "Rabbit: 'I don't like red, so I am not wearing red.'",
    zhtText: "小兔子：「我不喜歡紅色，所以我沒有穿紅色的衣服。」"
  },
  monkey: {
    speech: "我是小猴子，提示是：我穿著和香蕉一樣顏色的衣服喔！",
    engText: "Monkey: 'I am wearing a shirt that is the color of a banana!'",
    zhtText: "小猴子：「我穿著和香蕉一樣顏色的衣服喔！」"
  },
  kitty: {
    speech: "我是小貓咪，提示是：我正看著穿藍色衣服的朋友，高興地拍拍手呢！",
    engText: "Kitty: 'I am looking at my friend in the blue shirt and clapping!'",
    zhtText: "小貓咪：「我正看著穿藍色衣服的朋友，高興地拍拍手呢！」"
  },
  win: {
    speech: "哇！你太棒了！大家都穿上了正確的衣服，可以開開心心吃蛋糕囉！祝大熊生日快樂！",
    engText: "Perfect Match! You solved the birthday party mystery!",
    zhtText: "哇！你太棒了！大家都穿上了正確的衣服，可以吃蛋糕囉！祝大熊生日快樂！"
  },
  lose: {
    speech: "嗯...好像有人穿錯衣服囉！再點擊小動物聽聽提示，想一想吧！",
    engText: "Hmm... looks like someone is wearing the wrong color. Try again!",
    zhtText: "嗯...好像有人穿錯衣服囉！點擊小動物再想一想吧！"
  },
  incomplete: {
    speech: "還有人還沒穿衣服喔！把衣服都穿好再檢查吧！",
    engText: "Not everyone is dressed yet! Dress all the friends first.",
    zhtText: "還有人還沒穿衣服喔！把衣服都穿好再檢查吧！"
  }
};

// Initialize Speech Synthesis and cache voices
let voiceSelection = null;
function initSpeechVoice() {
  window.speechSynthesis.getVoices();
  const getChineseVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    // Prioritize Traditional Chinese (Taiwan), then HK, then CN, then any Chinese
    voiceSelection = voices.find(v => v.lang === 'zh-TW') ||
                     voices.find(v => v.lang === 'zh-HK') ||
                     voices.find(v => v.lang === 'zh-CN') ||
                     voices.find(v => v.lang.startsWith('zh')) ||
                     null;
  };
  getChineseVoice();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = getChineseVoice;
  }
}

// Prevent garbage collection of active utterance which causes cutoffs/stuttering in some browsers
let activeUtterance = null;

// Speak Chinese text using Web Speech API, showing custom English/Chinese subtitles on screen
function speakAndShowSubtitle(scriptKey) {
  const scriptObj = SCRIPTS[scriptKey];
  if (!scriptObj) return;

  // Cancel any ongoing speech first
  window.speechSynthesis.cancel();

  // Update visual subtitle bubble
  const speechBubble = document.getElementById('speech-bubble');
  const speechText = document.getElementById('speech-text');
  
  speechText.innerHTML = `<strong>${scriptObj.engText}</strong><br><small style="opacity: 0.85">${scriptObj.zhtText}</small>`;
  speechBubble.classList.remove('hidden');

  // Trigger Text-To-Speech (Chinese)
  const utterance = new SpeechSynthesisUtterance(scriptObj.speech);
  activeUtterance = utterance; // Prevent GC
  
  if (voiceSelection) {
    utterance.voice = voiceSelection;
  }
  
  // Natural-sounding speech settings
  utterance.rate = 1.0; 
  utterance.pitch = 1.0; 

  // Hide subtitle bubble once speech completes (with a small buffer time)
  utterance.onend = () => {
    activeUtterance = null;
    // Keep win bubble active on victory screen
    if (scriptKey !== 'win') {
      setTimeout(() => {
        speechBubble.classList.add('hidden');
      }, 1500);
    }
  };

  utterance.onerror = () => {
    activeUtterance = null;
    setTimeout(() => {
      speechBubble.classList.add('hidden');
    }, 1500);
  };

  window.speechSynthesis.speak(utterance);
}

// Color Hex Map for styling the SVG shirts dynamically
const COLOR_HEX = {
  red: { fill: '#ff4d4d', stroke: '#c62828' },
  yellow: { fill: '#ffd54f', stroke: '#f57f17' },
  blue: { fill: '#4d94ff', stroke: '#1565c0' },
  empty: { fill: '#e2e8f0', stroke: '#94a3b8' }
};

// Dress an animal in a color, update states and CSS
function dressAnimal(animal, color) {
  state.assignments[animal] = color;
  
  // Find shirt path in SVG and apply colors
  const shirtPath = document.querySelector(`.${animal}-shirt`);
  if (shirtPath) {
    if (color) {
      shirtPath.style.fill = COLOR_HEX[color].fill;
      shirtPath.style.stroke = COLOR_HEX[color].stroke;
      shirtPath.setAttribute('stroke-dasharray', 'none');
    } else {
      shirtPath.style.fill = COLOR_HEX.empty.fill;
      shirtPath.style.stroke = COLOR_HEX.empty.stroke;
      shirtPath.setAttribute('stroke-dasharray', '3,3');
    }
  }

  // Update dressed badge on seat card
  const badge = document.querySelector(`#seat-${animal} .dressed-color-badge`);
  if (badge) {
    badge.className = 'dressed-color-badge'; // reset classes
    if (color) {
      badge.classList.add(`badge-${color}`);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  SFX.playDress();

  // Check if dressing this animal resolves any duplicated clothes (only one of each color is allowed)
  if (color) {
    Object.keys(state.assignments).forEach(otherAnimal => {
      if (otherAnimal !== animal && state.assignments[otherAnimal] === color) {
        // Remove color from the other animal to avoid duplicate placement
        dressAnimal(otherAnimal, null);
      }
    });
  }
}

// Select a shirt from the closet
function selectClosetShirt(color) {
  SFX.playClick();
  
  // Toggle selection if clicking the already selected shirt
  if (state.selectedColor === color) {
    state.selectedColor = null;
    document.querySelectorAll('.shirt-item').forEach(el => el.classList.remove('selected'));
  } else {
    state.selectedColor = color;
    document.querySelectorAll('.shirt-item').forEach(el => {
      if (el.dataset.color === color) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }
}

// Highlight the clue items corresponding to the speaking animal
function highlightClueCard(animal) {
  document.querySelectorAll('.clue-item').forEach(item => {
    if (item.dataset.animal === animal) {
      item.classList.add('active-clue');
    } else {
      item.classList.remove('active-clue');
    }
  });
}

// Check the puzzle solution
function checkSolution() {
  SFX.playClick();

  const { rabbit, monkey, kitty } = state.assignments;
  
  // Check if any animal has not been dressed yet
  if (!rabbit || !monkey || !kitty) {
    speakAndShowSubtitle('incomplete');
    SFX.playFail();
    return;
  }

  // Verify puzzle logic
  const isRabbitCorrect = (rabbit === SOLUTION.rabbit);
  const isMonkeyCorrect = (monkey === SOLUTION.monkey);
  const isKittyCorrect = (kitty === SOLUTION.kitty);

  const isAllCorrect = isRabbitCorrect && isMonkeyCorrect && isKittyCorrect;

  if (isAllCorrect) {
    // WIN STATE
    state.isGameFinished = true;
    
    // Stop background music and trigger success chimes
    SFX.stopMusic();
    SFX.playSuccess();
    
    // Read victory message
    speakAndShowSubtitle('win');

    // Blow out cake candles (hide flame SVGs and add a little smoke class)
    document.querySelectorAll('.candle-flame').forEach(flame => {
      flame.style.display = 'none';
    });

    // Make animals bounce happily in victory dance
    document.getElementById('char-rabbit').classList.add('bounce-cheer');
    document.getElementById('char-monkey').classList.add('bounce-cheer');
    document.getElementById('char-kitty').classList.add('bounce-cheer');
    document.getElementById('bear-character').classList.add('bounce-cheer');

    // Launch confetti celebration
    confetti.start();

    // Show victory modal overlay after a short delay
    setTimeout(() => {
      document.getElementById('victory-modal').classList.remove('hidden');
    }, 2500);

  } else {
    // LOSE STATE
    speakAndShowSubtitle('lose');
    SFX.playFail();

    // Shake incorrect animals
    if (!isRabbitCorrect) {
      const el = document.getElementById('seat-rabbit');
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 600);
    }
    if (!isMonkeyCorrect) {
      const el = document.getElementById('seat-monkey');
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 600);
    }
    if (!isKittyCorrect) {
      const el = document.getElementById('seat-kitty');
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 600);
    }
  }
}

// Reset the game board
async function resetGame() {
  await SFX.playClick();
  
  // Reset assignments
  Object.keys(state.assignments).forEach(animal => {
    dressAnimal(animal, null);
    // Remove cheering animation classes
    document.getElementById(`char-${animal}`).classList.remove('bounce-cheer');
  });
  document.getElementById('bear-character').classList.remove('bounce-cheer');

  // Reset candles on the cake (relight)
  document.querySelectorAll('.candle-flame').forEach(flame => {
    flame.style.display = 'block';
  });

  // Deselect wardrobe shirts
  state.selectedColor = null;
  document.querySelectorAll('.shirt-item').forEach(el => el.classList.remove('selected'));
  
  // Reset state
  state.isGameFinished = false;
  confetti.stop();

  // Hide modals & bubbles
  document.getElementById('victory-modal').classList.add('hidden');
  document.getElementById('speech-bubble').classList.add('hidden');
  document.querySelectorAll('.clue-item').forEach(item => item.classList.remove('active-clue'));

  // Restart BG music loop and play intro prompt
  await SFX.startMusic();
  speakAndShowSubtitle('intro');
}

// Set up event listeners for HTML elements
function setupEventListeners() {
  // Splash Start Button
  document.getElementById('start-btn').addEventListener('click', async () => {
    // Start Audio Context & play music loop
    await SFX.init();
    SFX.isMuted = false;
    await SFX.startMusic();
    document.getElementById('music-btn').textContent = "🎵 On";

    // Play welcome voice intro
    speakAndShowSubtitle('intro');

    // Fade out splash screen
    const splash = document.getElementById('splash-screen');
    splash.style.transition = 'opacity 0.4s ease';
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.classList.add('hidden');
      document.querySelector('.game-container').classList.remove('hidden');
    }, 400);
  });

  // Home Button (Return to splash screen)
  document.getElementById('home-btn').addEventListener('click', async () => {
    await SFX.playClick();
    window.speechSynthesis.cancel();
    document.getElementById('splash-screen').classList.remove('hidden');
    document.getElementById('splash-screen').style.opacity = '1';
    document.querySelector('.game-container').classList.add('hidden');
    document.getElementById('speech-bubble').classList.add('hidden');
  });

  // Help Button (Repeat intro story)
  document.getElementById('help-btn').addEventListener('click', async () => {
    await SFX.playClick();
    speakAndShowSubtitle('intro');
  });

  // Music toggle button
  const musicBtn = document.getElementById('music-btn');
  musicBtn.addEventListener('click', async () => {
    const isPlaying = await SFX.toggleMusic();
    musicBtn.textContent = isPlaying ? "🎵 On" : "🎵 Off";
  });

  // Closet Shirts selection
  document.querySelectorAll('.shirt-item').forEach(item => {
    // Click behavior
    item.addEventListener('click', () => {
      selectClosetShirt(item.dataset.color);
    });

    // Native Drag behavior (Desktop)
    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging');
      e.dataTransfer.setData('text/plain', item.dataset.color);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });
  });

  // Seat / Animal Interaction
  document.querySelectorAll('.animal-seat').forEach(seat => {
    const animal = seat.dataset.animal;

    // Click behavior: dress or speak clue
    seat.addEventListener('click', (e) => {
      // Avoid duplicate clicks if target was inside button
      if (e.target.closest('.speech-bubble-indicator')) {
        speakAndShowSubtitle(animal);
        highlightClueCard(animal);
        return;
      }

      if (state.selectedColor) {
        // Dress animal with currently selected wardrobe color
        dressAnimal(animal, state.selectedColor);
        // Clear selection after dressing
        state.selectedColor = null;
        document.querySelectorAll('.shirt-item').forEach(el => el.classList.remove('selected'));
      } else {
        // Read clue if no shirt is selected
        speakAndShowSubtitle(animal);
        highlightClueCard(animal);
      }
    });

    // Native Drop behavior (Desktop)
    seat.addEventListener('dragover', (e) => {
      e.preventDefault();
      seat.classList.add('drag-hover');
    });

    seat.addEventListener('dragleave', () => {
      seat.classList.remove('drag-hover');
    });

    seat.addEventListener('drop', (e) => {
      e.preventDefault();
      seat.classList.remove('drag-hover');
      const color = e.dataTransfer.getData('text/plain');
      if (color) {
        dressAnimal(animal, color);
      }
    });
  });

  // Clue items click to read clue
  document.querySelectorAll('.clue-item').forEach(item => {
    item.addEventListener('click', () => {
      const animal = item.dataset.animal;
      speakAndShowSubtitle(animal);
      highlightClueCard(animal);
    });
  });

  // Check Answer Button
  document.getElementById('check-btn').addEventListener('click', checkSolution);

  // Reset Button
  document.getElementById('reset-btn').addEventListener('click', resetGame);

  // Play Again Button (victory screen)
  document.getElementById('play-again-btn').addEventListener('click', () => {
    resetGame();
  });

  // Cake clicking wiggles bear and plays audio
  document.getElementById('birthday-cake').addEventListener('click', () => {
    SFX.playClick();
    const bear = document.getElementById('bear-character');
    bear.classList.add('shake');
    setTimeout(() => bear.classList.remove('shake'), 500);
  });
}

// Initial Setup on DOM load
window.addEventListener('DOMContentLoaded', () => {
  // Setup SpeechSynthesis voice cache
  initSpeechVoice();

  // Setup Confetti Engine
  const canvas = document.getElementById('confetti-canvas');
  confetti = new ConfettiEngine(canvas);

  // Setup UI event binds
  setupEventListeners();
});
