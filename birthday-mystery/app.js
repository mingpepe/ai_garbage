/**
 * Big Bear's Birthday Mystery - Expanded Game Logic
 * Features a multi-level state-driven logic training suite for kids.
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

// Multi-Level Configuration Array
const LEVELS = [
  {
    id: 1,
    title: "Level 1: The Birthday Shirts 👚",
    themeClass: "theme-birthday",
    bgGradient: "linear-gradient(180deg, #e0f2fe 0%, #ffffff 100%)", // Sky blue birthday party
    tableColor: "linear-gradient(180deg, #f0abfc, #d946ef)", // Pink-purple table
    tableBorder: "#f770ee",
    centerItem: "cake",
    characters: ["rabbit", "monkey", "kitty"],
    itemType: "shirt",
    options: ["red", "yellow", "blue"],
    solution: {
      rabbit: "blue",
      monkey: "yellow",
      kitty: "red"
    },
    clues: {
      rabbit: {
        speech: "我是小兔子。我不喜歡紅色，所以我沒有穿紅色的衣服喔！",
        engText: "Rabbit: 'I don't like red, so I am not wearing red.'",
        zhtText: "小兔子：「我不喜歡紅色，所以我沒有穿紅色的衣服。」"
      },
      monkey: {
        speech: "我是小猴子。我穿著和香蕉一樣顏色的衣服喔！",
        engText: "Monkey: 'I am wearing a shirt that is the color of a banana!'",
        zhtText: "小猴子：「我穿著和香蕉一樣顏色的衣服喔！」"
      },
      kitty: {
        speech: "我是小貓咪。我正看著穿藍色衣服的朋友，高興地拍拍手呢！",
        engText: "Kitty: 'I am looking at my friend in the blue shirt and clapping!'",
        zhtText: "小貓咪：「我正看著穿藍色衣服的朋友，高興地拍拍手呢！」"
      }
    },
    intro: {
      speech: "第一關！大熊的生日派對開始囉！小兔子、小猴子和小貓咪都穿了不同顏色的衣服，分別是紅色、黃色和藍色。請點擊小動物聽聽提示，幫牠們穿上正確顏色的衣服吧！",
      engText: "Level 1: Big Bear's Birthday Party! Help Rabbit, Monkey, and Kitty dress in their correct shirt colors.",
      zhtText: "第一關！大熊的生日派對！幫小兔子、小猴子和小貓咪穿上正確顏色的衣服吧！"
    }
  },
  {
    id: 2,
    title: "Level 2: The Cupcake Picnic 🧁",
    themeClass: "theme-picnic",
    bgGradient: "linear-gradient(180deg, #dcfce7 0%, #ffffff 100%)", // Light green forest picnic
    tableColor: "linear-gradient(180deg, #fed7aa, #f97316)", // Wooden table
    tableBorder: "#ea580c",
    centerItem: "picnic-basket",
    characters: ["rabbit", "monkey", "kitty"],
    itemType: "cupcake",
    options: ["pink", "brown", "green"], // Pink Strawberry, Brown Chocolate, Green Matcha
    solution: {
      rabbit: "green",
      monkey: "brown",
      kitty: "pink"
    },
    clues: {
      rabbit: {
        speech: "我是小兔子。我不喜歡粉紅色的草莓杯子蛋糕，所以我沒有拿草莓蛋糕喔！",
        engText: "Rabbit: 'I don't like pink strawberry cupcakes, so I didn't take strawberry.'",
        zhtText: "小兔子：「我不喜歡粉紅色的草莓蛋糕，所以我沒有拿草莓蛋糕喔！」"
      },
      monkey: {
        speech: "我是小猴子。我拿了最喜歡的巧克力杯子蛋糕，它是咖啡色的喔！",
        engText: "Monkey: 'I took the chocolate cupcake! It's brown!'",
        zhtText: "小猴子：「我拿了巧克力杯子蛋糕，它是咖啡色的喔！」"
      },
      kitty: {
        speech: "我是小貓咪。我正看著拿綠色抹茶蛋糕的朋友，高興地拍拍手呢！",
        engText: "Kitty: 'I am looking at my friend with the green matcha cupcake and clapping!'",
        zhtText: "小貓咪：「我正看著拿綠色抹茶蛋糕的朋友，高興地拍拍手呢！」"
      }
    },
    intro: {
      speech: "第二關！好朋友去森林裡野餐囉！桌上有草莓、巧克力和抹茶杯子蛋糕。聽聽小動物們說的話，把美味的蛋糕分給正確的動物吧！",
      engText: "Level 2: Forest Picnic! Help the friends find their favorite cupcake flavor (Strawberry, Chocolate, or Matcha).",
      zhtText: "第二關！森林野餐！聽聽提示，把美味的杯子蛋糕分給正確的小動物吧！"
    }
  },
  {
    id: 3,
    title: "Level 3: The Toy Sorting 🧸",
    themeClass: "theme-playroom",
    bgGradient: "linear-gradient(180deg, #fae8ff 0%, #ffffff 100%)", // Light purple playroom
    tableColor: "linear-gradient(180deg, #93c5fd, #3b82f6)", // Blue shelf
    tableBorder: "#2563eb",
    centerItem: "toy-box",
    characters: ["rabbit", "monkey", "kitty", "elephant"],
    itemType: "toy-chest",
    options: ["red", "yellow", "blue", "green"],
    solution: {
      rabbit: "blue",
      monkey: "yellow",
      kitty: "red",
      elephant: "green"
    },
    clues: {
      elephant: {
        speech: "我是大象。我的玩具箱是跟草地一樣的綠色喔！",
        engText: "Elephant: 'My toy box is green like the grass!'",
        zhtText: "大象：「我的玩具箱是像草地一樣的綠色喔！」"
      },
      monkey: {
        speech: "我是小猴子。我的玩具箱是黃色的喔！",
        engText: "Monkey: 'My toy box is yellow!'",
        zhtText: "小猴子：「我的玩具箱是黃色的喔！」"
      },
      rabbit: {
        speech: "我是小兔子。我的玩具箱不是紅色的喔！",
        engText: "Rabbit: 'My toy box is not red.'",
        zhtText: "小兔子：「我的玩具箱不是紅色的喔！」"
      },
      kitty: {
        speech: "我是小貓咪。我正看著把玩具收在藍色箱子裡的朋友喔！",
        engText: "Kitty: 'I am looking at my friend who puts their toys in the blue box!'",
        zhtText: "小貓咪：「我正看著把玩具收在藍色箱子裡的朋友喔！」"
      }
    },
    intro: {
      speech: "第三關！大象也加入我們囉！大家要把玩具收進紅色、黃色、藍色和綠色的玩具箱裡。聽聽牠們說的話，幫牠們收好吧！",
      engText: "Level 3: Toy Clean-up! Sort the toys into the Red, Yellow, Blue, and Green chests.",
      zhtText: "第三關！大象加入了！聽聽提示，把玩具收進正確顏色的玩具箱吧！"
    }
  },
  {
    id: 4,
    title: "Level 4: The Animal Train Ride 🚂",
    themeClass: "theme-train",
    bgGradient: "linear-gradient(180deg, #fef08a 0%, #ffffff 100%)", // Sunny yellow sky
    tableColor: "linear-gradient(180deg, #fca5a5, #ef4444)", // Red tracks/platform
    tableBorder: "#dc2626",
    centerItem: "train-engine",
    characters: ["monkey", "kitty", "rabbit"],
    itemType: "train-car",
    options: ["red", "yellow", "blue"],
    solution: {
      monkey: "red",
      kitty: "yellow",
      rabbit: "blue"
    },
    clues: {
      monkey: {
        speech: "我是小猴子。我最喜歡紅色，所以我選了最前面的紅色車廂喔！",
        engText: "Monkey: 'I like red, so I chose the red carriage!'",
        zhtText: "小猴子：「我最喜歡紅色，所以我選了最前面的紅色車廂喔！」"
      },
      kitty: {
        speech: "我是小貓咪。我不坐最後一節藍色車廂，也正看著坐在紅色車廂的朋友揮手呢！",
        engText: "Kitty: 'I am not sitting in the last blue carriage, and I am waving at my friend in the red carriage!'",
        zhtText: "小貓咪：「我不坐最後的藍色車廂，也正看著坐在紅色車廂的朋友揮手呢！」"
      },
      rabbit: {
        speech: "我是小兔子。小猴子坐在我前面的車廂呢！",
        engText: "Rabbit: 'Little Monkey sits in a carriage in front of mine!'",
        zhtText: "小兔子：「小猴子坐在我前面的車廂呢！」"
      }
    },
    intro: {
      speech: "第四關！好朋友要坐玩具火車出發囉！車廂有紅色、黃色和藍色。聽聽小動物說的話，幫牠們坐上正確的車廂吧！",
      engText: "Level 4: Toy Train Ride! Help the friends board their correct colored carriages (Red, Yellow, or Blue).",
      zhtText: "第四關！玩具火車！聽聽提示，幫小動物們坐上正確顏色的車廂吧！"
    }
  }
];

// Emojis for Visual Labels
const AVATARS = {
  rabbit: '🐰',
  monkey: '🐵',
  kitty: '🐱',
  elephant: '🐘'
};

// General Global Sound/Confetti managers
const SFX = new SoundEffects();
let confetti = null;

// Game State Binds
let currentLevelIndex = 0;
const state = {
  assignments: {}, // Dynamically populated based on active level characters
  selectedColor: null,
  isGameFinished: false
};

// Helper translation strings for checking solutions
const SCRIPTS = {
  win: {
    speech: "哇！你太棒了！大家都完成了任務，太厲害囉！祝大熊生日快樂！",
    engText: "Perfect Match! You solved the logic puzzle!",
    zhtText: "哇！你太棒了！大家都完成了任務，太厲害囉！祝大熊生日快樂！"
  },
  lose: {
    speech: "嗯...好像有人放錯地方囉！再點擊小動物聽聽提示，想一想吧！",
    engText: "Hmm... looks like someone placed it wrong. Try again!",
    zhtText: "嗯...好像有人放錯囉！點擊小動物再想一想吧！"
  },
  incomplete: {
    speech: "還有人還沒完成喔！全部整理好之後再來檢查吧！",
    engText: "Not everyone is finished! Complete the items first.",
    zhtText: "還有人還沒完成喔！全部整理好再來檢查吧！"
  }
};

// Prevent Speech Utterance garbage collection cutoff bugs
let activeUtterance = null;
let voiceSelection = null;

// Load TTS voices
function initSpeechVoice() {
  window.speechSynthesis.getVoices();
  const getChineseVoice = () => {
    const voices = window.speechSynthesis.getVoices();
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

// Speak and show Subtitles
function speakAndShowSubtitle(scriptKeyOrObj) {
  let scriptObj = null;
  
  if (typeof scriptKeyOrObj === 'string') {
    const currentLevel = LEVELS[currentLevelIndex];
    if (currentLevel && currentLevel.clues[scriptKeyOrObj]) {
      scriptObj = currentLevel.clues[scriptKeyOrObj];
    } else if (currentLevel && scriptKeyOrObj === 'intro') {
      scriptObj = currentLevel.intro;
    } else {
      scriptObj = SCRIPTS[scriptKeyOrObj];
    }
  } else {
    scriptObj = scriptKeyOrObj;
  }

  if (!scriptObj) return;

  // Stop previous voices
  window.speechSynthesis.cancel();

  const speechBubble = document.getElementById('speech-bubble');
  const speechText = document.getElementById('speech-text');
  
  speechText.innerHTML = `<strong>${scriptObj.engText}</strong><br><small style="opacity: 0.85">${scriptObj.zhtText}</small>`;
  speechBubble.classList.remove('hidden');

  const utterance = new SpeechSynthesisUtterance(scriptObj.speech);
  activeUtterance = utterance; // Keep global ref
  
  if (voiceSelection) {
    utterance.voice = voiceSelection;
  }
  
  utterance.rate = 1.0; 
  utterance.pitch = 1.0; 

  utterance.onend = () => {
    activeUtterance = null;
    if (scriptKeyOrObj !== 'win') {
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

// SVG Vector templates for Animals
const SVG_TEMPLATES = {
  rabbit: (itemFill, itemStroke, itemDash) => `
    <svg viewBox="0 0 100 120" width="90" height="108">
      <ellipse class="rabbit-ear-left" cx="35" cy="25" rx="8" ry="22" fill="#ffffff" stroke="#e0e0e0" stroke-width="1.5" transform="rotate(-10 35 25)" />
      <ellipse class="rabbit-ear-left-inner" cx="35" cy="27" rx="4" ry="16" fill="#f8bbd0" transform="rotate(-10 35 27)" />
      <ellipse class="rabbit-ear-right" cx="65" cy="25" rx="8" ry="22" fill="#ffffff" stroke="#e0e0e0" stroke-width="1.5" transform="rotate(10 65 25)" />
      <ellipse class="rabbit-ear-right-inner" cx="65" cy="27" rx="4" ry="16" fill="#f8bbd0" transform="rotate(10 65 27)" />
      <circle cx="50" cy="55" r="24" fill="#ffffff" stroke="#e0e0e0" stroke-width="1.5" />
      <circle cx="42" cy="52" r="3" fill="#2d3748" />
      <circle cx="41" cy="51" r="0.8" fill="#ffffff" />
      <circle cx="58" cy="52" r="3" fill="#2d3748" />
      <circle cx="57" cy="51" r="0.8" fill="#ffffff" />
      <ellipse cx="50" cy="58" rx="2.5" ry="1.8" fill="#f06292" />
      <path d="M 46 62 Q 48 64 50 62 Q 52 64 54 62" stroke="#2d3748" stroke-width="1.5" fill="none" />
      <circle cx="36" cy="58" r="3" fill="#f8bbd0" opacity="0.8" />
      <circle cx="64" cy="58" r="3" fill="#f8bbd0" opacity="0.8" />
      <path d="M 28 85 Q 20 95 28 100" stroke="#ffffff" stroke-width="7" stroke-linecap="round" fill="none" />
      <path d="M 72 85 Q 80 95 72 100" stroke="#ffffff" stroke-width="7" stroke-linecap="round" fill="none" />
      <path class="animal-shirt rabbit-shirt" d="M 32 78 L 68 78 L 74 108 L 26 108 Z" fill="${itemFill}" stroke="${itemStroke}" stroke-width="2" stroke-dasharray="${itemDash}" />
      <ellipse cx="50" cy="78" rx="8" ry="3" fill="#cbd5e1" />
      <ellipse cx="38" cy="112" rx="7" ry="5" fill="#ffffff" stroke="#e0e0e0" stroke-width="1" />
      <ellipse cx="62" cy="112" rx="7" ry="5" fill="#ffffff" stroke="#e0e0e0" stroke-width="1" />
    </svg>
  `,
  monkey: (itemFill, itemStroke, itemDash) => `
    <svg viewBox="0 0 100 120" width="90" height="108">
      <path d="M 28 105 Q 10 105 15 85 Q 20 70 30 75" stroke="#a0522d" stroke-width="4" stroke-linecap="round" fill="none" />
      <circle cx="24" cy="55" r="9" fill="#a0522d" />
      <circle cx="24" cy="55" r="5" fill="#ffcc80" />
      <circle cx="76" cy="55" r="9" fill="#a0522d" />
      <circle cx="76" cy="55" r="5" fill="#ffcc80" />
      <circle cx="50" cy="55" r="23" fill="#a0522d" />
      <path d="M 33 55 C 33 44 42 42 50 47 C 58 42 67 44 67 55 C 67 66 61 70 50 70 C 39 70 33 66 33 55 Z" fill="#ffcc80" />
      <circle cx="43" cy="52" r="3" fill="#2d3748" />
      <circle cx="42" cy="51" r="0.8" fill="#ffffff" />
      <circle cx="57" cy="52" r="3" fill="#2d3748" />
      <circle cx="57" cy="51" r="0.8" fill="#ffffff" />
      <ellipse cx="50" cy="58" rx="2" ry="1.5" fill="#a0522d" />
      <path d="M 44 62 Q 50 67 56 62" stroke="#2d3748" stroke-width="1.5" fill="none" />
      <circle cx="38" cy="60" r="2" fill="#f48fb1" opacity="0.6" />
      <circle cx="62" cy="60" r="2" fill="#f48fb1" opacity="0.6" />
      <path d="M 28 85 Q 18 95 24 102" stroke="#a0522d" stroke-width="6" stroke-linecap="round" fill="none" />
      <path d="M 72 85 Q 82 95 76 102" stroke="#a0522d" stroke-width="6" stroke-linecap="round" fill="none" />
      <path class="animal-shirt monkey-shirt" d="M 32 78 L 68 78 L 74 108 L 26 108 Z" fill="${itemFill}" stroke="${itemStroke}" stroke-width="2" stroke-dasharray="${itemDash}" />
      <ellipse cx="50" cy="78" rx="8" ry="3" fill="#cbd5e1" />
      <ellipse cx="38" cy="112" rx="6" ry="4" fill="#a0522d" />
      <ellipse cx="62" cy="112" rx="6" ry="4" fill="#a0522d" />
    </svg>
  `,
  kitty: (itemFill, itemStroke, itemDash) => `
    <svg viewBox="0 0 100 120" width="90" height="108">
      <path class="kitty-tail" d="M 72 105 Q 85 110 82 90 Q 80 80 88 78" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" fill="none" />
      <polygon points="28,33 46,47 28,52" fill="#94a3b8" stroke="#788896" stroke-width="1" />
      <polygon points="31,37 43,47 31,50" fill="#f8bbd0" />
      <polygon points="72,33 54,47 72,52" fill="#94a3b8" stroke="#788896" stroke-width="1" />
      <polygon points="69,37 57,47 69,50" fill="#f8bbd0" />
      <ellipse cx="50" cy="56" rx="23" ry="19" fill="#94a3b8" />
      <circle cx="40" cy="52" r="3.5" fill="#4d7c0f" />
      <circle cx="39" cy="51" r="1" fill="#ffffff" />
      <circle cx="60" cy="52" r="3.5" fill="#4d7c0f" />
      <circle cx="59" cy="51" r="1" fill="#ffffff" />
      <polygon points="50,58 48,56 52,56" fill="#f06292" />
      <path d="M 46 61 Q 48 63 50 61 Q 52 63 54 61" stroke="#2d3748" stroke-width="1.5" fill="none" />
      <line x1="28" y1="58" x2="18" y2="57" stroke="#2d3748" stroke-width="1" />
      <line x1="28" y1="61" x2="17" y2="62" stroke="#2d3748" stroke-width="1" />
      <line x1="72" y1="58" x2="82" y2="57" stroke="#2d3748" stroke-width="1" />
      <line x1="72" y1="61" x2="83" y2="62" stroke="#2d3748" stroke-width="1" />
      <circle cx="33" cy="58" r="2.5" fill="#f8bbd0" opacity="0.7" />
      <circle cx="67" cy="58" r="2.5" fill="#f8bbd0" opacity="0.7" />
      <path d="M 28 85 Q 18 95 24 102" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" fill="none" />
      <path d="M 72 85 Q 82 95 76 102" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" fill="none" />
      <path class="animal-shirt kitty-shirt" d="M 32 78 L 68 78 L 74 108 L 26 108 Z" fill="${itemFill}" stroke="${itemStroke}" stroke-width="2" stroke-dasharray="${itemDash}" />
      <ellipse cx="50" cy="78" rx="8" ry="3" fill="#cbd5e1" />
      <ellipse cx="38" cy="112" rx="6" ry="4" fill="#94a3b8" />
      <ellipse cx="62" cy="112" rx="6" ry="4" fill="#94a3b8" />
    </svg>
  `,
  elephant: (itemFill, itemStroke, itemDash) => `
    <svg viewBox="0 0 100 120" width="90" height="108">
      <ellipse cx="22" cy="52" rx="16" ry="24" fill="#94a3b8" stroke="#788896" stroke-width="1" />
      <ellipse cx="24" cy="52" rx="10" ry="16" fill="#f8bbd0" />
      <ellipse cx="78" cy="52" rx="16" ry="24" fill="#94a3b8" stroke="#788896" stroke-width="1" />
      <ellipse cx="76" cy="52" rx="10" ry="16" fill="#f8bbd0" />
      <circle cx="50" cy="58" r="23" fill="#94a3b8" />
      <circle cx="40" cy="54" r="3.5" fill="#2d3748" />
      <circle cx="39" cy="53" r="1" fill="#ffffff" />
      <circle cx="60" cy="54" r="3.5" fill="#2d3748" />
      <circle cx="59" cy="53" r="1" fill="#ffffff" />
      <circle cx="31" cy="62" r="3" fill="#f8bbd0" opacity="0.8" />
      <circle cx="69" cy="62" r="3" fill="#f8bbd0" opacity="0.8" />
      <path d="M 50 66 Q 50 82 58 82 Q 64 82 64 74 Q 64 70 60 70" fill="none" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" />
      <path d="M 43 68 L 41 74 L 44 72 Z" fill="#ffffff" />
      <path d="M 57 68 L 59 74 L 56 72 Z" fill="#ffffff" />
      <path d="M 28 88 Q 16 96 22 104" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" fill="none" />
      <path d="M 72 88 Q 84 96 78 104" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" fill="none" />
      <path class="animal-shirt elephant-shirt" d="M 32 78 L 68 78 L 74 108 L 26 108 Z" fill="${itemFill}" stroke="${itemStroke}" stroke-width="2" stroke-dasharray="${itemDash}" />
      <ellipse cx="50" cy="78" rx="8" ry="3" fill="#cbd5e1" />
      <ellipse cx="38" cy="112" rx="7" ry="5" fill="#94a3b8" />
      <ellipse cx="62" cy="112" rx="7" ry="5" fill="#94a3b8" />
    </svg>
  `
};

// SVG Vector templates for Centerpieces
const CENTER_PIECE_TEMPLATES = {
  cake: `
    <div class="cake-container" id="birthday-cake" style="cursor: pointer;">
      <svg viewBox="0 0 100 100" width="80" height="80">
        <ellipse cx="50" cy="85" rx="35" ry="8" fill="#e0e0e0" />
        <rect x="46" y="80" width="8" height="8" fill="#bdbdbd" />
        <path d="M 22 75 L 22 55 Q 50 60 78 55 L 78 75 Q 50 80 22 75 Z" fill="#ff8a80" />
        <path d="M 27 55 L 27 38 Q 50 43 73 38 L 73 55 Q 50 60 27 55 Z" fill="#ffd54f" />
        <path d="M 27 38 Q 33 46 38 38 Q 44 46 50 38 Q 56 46 62 38 Q 68 46 73 38 Q 73 45 73 48 Q 50 53 27 48 Z" fill="#ffffff" opacity="0.9" />
        <path d="M 22 55 Q 28 63 34 55 Q 40 63 46 55 Q 52 63 58 55 Q 64 63 70 55 Q 75 63 78 55 Q 78 62 78 65 Q 50 70 22 65 Z" fill="#81c784" opacity="0.9" />
        <circle cx="35" cy="35" r="4" fill="#e57373" />
        <circle cx="50" cy="35" r="4" fill="#e57373" />
        <circle cx="65" cy="35" r="4" fill="#e57373" />
        <rect x="37" y="22" width="3" height="12" fill="#4fc3f7" />
        <path class="candle-flame" id="flame-left" d="M 38.5 22 Q 35 15 38.5 10 Q 42 15 38.5 22 Z" fill="#ffb300" />
        <rect x="48.5" y="20" width="3" height="14" fill="#ba68c8" />
        <path class="candle-flame" id="flame-center" d="M 50 20 Q 46 12 50 7 Q 54 12 50 20 Z" fill="#ffb300" />
        <rect x="60" y="22" width="3" height="12" fill="#81c784" />
        <path class="candle-flame" id="flame-right" d="M 61.5 22 Q 58 15 61.5 10 Q 65 15 61.5 22 Z" fill="#ffb300" />
      </svg>
    </div>
  `,
  "picnic-basket": `
    <div class="cake-container" id="birthday-cake" style="cursor: pointer;">
      <svg viewBox="0 0 100 100" width="80" height="80">
        <path d="M 20 80 Q 50 90 80 80 Q 82 68 80 50 Q 50 52 20 50 Q 18 68 20 80 Z" fill="#ef4444" />
        <path d="M 25 80 Q 50 87 75 80 Q 77 72 75 60 L 25 60 Z" fill="#ffffff" opacity="0.8" stroke="#ef4444" stroke-width="1" stroke-dasharray="2,2" />
        <path d="M 22 75 L 28 50 L 72 50 L 78 75 Q 50 82 22 75 Z" fill="#b45309" stroke="#78350f" stroke-width="2" />
        <path d="M 32 50 L 38 78" stroke="#78350f" stroke-width="2" />
        <path d="M 45 50 L 50 80" stroke="#78350f" stroke-width="2" />
        <path d="M 58 50 L 62 78" stroke="#78350f" stroke-width="2" />
        <path d="M 68 50 L 72 78" stroke="#78350f" stroke-width="2" />
        <path d="M 24 60 Q 50 65 76 60" stroke="#78350f" stroke-width="1.5" fill="none" />
        <path d="M 26 70 Q 50 75 74 70" stroke="#78350f" stroke-width="1.5" fill="none" />
        <ellipse cx="50" cy="50" rx="26" ry="5" fill="#d97706" stroke="#78350f" stroke-width="2" />
        <path d="M 24 50 Q 24 18 50 18 Q 76 18 76 50" fill="none" stroke="#d97706" stroke-width="5" />
        <path d="M 24 50 Q 24 18 50 18 Q 76 18 76 50" fill="none" stroke="#78350f" stroke-width="1.5" />
        <circle cx="42" cy="45" r="5" fill="#f472b6" />
        <circle cx="58" cy="45" r="5" fill="#78350f" />
        <circle cx="50" cy="43" r="5" fill="#4ade80" />
      </svg>
    </div>
  `,
  "toy-box": `
    <div class="cake-container" id="birthday-cake" style="cursor: pointer;">
      <svg viewBox="0 0 100 100" width="80" height="80">
        <rect x="22" y="50" width="56" height="32" rx="4" fill="#a16207" stroke="#78350f" stroke-width="2" />
        <rect x="18" y="46" width="64" height="6" rx="2" fill="#d97706" stroke="#78350f" stroke-width="2" />
        <polygon points="50,56 53,62 60,63 55,67 56,74 50,71 44,74 45,67 40,63 47,62" fill="#fbbf24" stroke="#d97706" stroke-width="1" />
        <circle cx="38" cy="38" r="8" fill="#a0522d" />
        <circle cx="32" cy="32" r="3.5" fill="#a0522d" />
        <circle cx="32" cy="32" r="2" fill="#ffcc80" />
        <circle cx="44" cy="32" r="3.5" fill="#a0522d" />
        <circle cx="44" cy="32" r="2" fill="#ffcc80" />
        <circle cx="38" cy="40" r="1.5" fill="#000000" />
        <ellipse cx="38" cy="42" rx="3" ry="2.2" fill="#ffcc80" />
        <circle cx="38" cy="41" r="1" fill="#a0522d" />
        <rect x="56" y="34" width="12" height="12" rx="1" fill="#ef4444" transform="rotate(15 62 40)" />
        <text x="60" y="44" font-family="Fredoka" font-size="8" fill="#ffffff" font-weight="bold" transform="rotate(15 62 40)">A</text>
        <circle cx="50" cy="42" r="8" fill="#3b82f6" />
        <path d="M 50 34 A 8 8 0 0 1 50 50" fill="#fbbf24" />
        <path d="M 44 37 Q 50 42 56 37" fill="#ef4444" />
      </svg>
    </div>
  `,
  "train-engine": `
    <div class="cake-container" id="birthday-cake" style="cursor: pointer;">
      <svg viewBox="0 0 100 100" width="80" height="80">
        <line x1="10" y1="82" x2="90" y2="82" stroke="#475569" stroke-width="4" />
        <line x1="20" y1="82" x2="20" y2="86" stroke="#475569" stroke-width="3" />
        <line x1="40" y1="82" x2="40" y2="86" stroke="#475569" stroke-width="3" />
        <line x1="60" y1="82" x2="60" y2="86" stroke="#475569" stroke-width="3" />
        <line x1="80" y1="82" x2="80" y2="86" stroke="#475569" stroke-width="3" />
        <rect x="25" y="44" width="46" height="26" fill="#ef4444" rx="2" />
        <rect x="58" y="32" width="16" height="38" fill="#3b82f6" rx="2" />
        <path d="M 54 32 L 78 32 L 74 26 L 58 26 Z" fill="#1e3a8a" />
        <rect x="30" y="30" width="8" height="14" fill="#475569" />
        <ellipse cx="34" cy="30" rx="5" ry="2" fill="#1e293b" />
        <circle cx="34" cy="22" r="3" fill="#cbd5e1" opacity="0.6" />
        <circle cx="38" cy="16" r="4.5" fill="#cbd5e1" opacity="0.4" />
        <circle cx="44" cy="10" r="6" fill="#cbd5e1" opacity="0.2" />
        <circle cx="36" cy="74" r="8" fill="#1e293b" />
        <circle cx="36" cy="74" r="3" fill="#94a3b8" />
        <circle cx="64" cy="74" r="8" fill="#1e293b" />
        <circle cx="64" cy="74" r="3" fill="#94a3b8" />
        <polygon points="18,70 26,58 26,70" fill="#f59e0b" />
      </svg>
    </div>
  `
};

// SVG Vector templates for Closet Options
const OPTION_TEMPLATES = {
  shirt: (colorFill, colorStroke) => `
    <svg viewBox="0 0 80 80" width="70" height="70">
      <path d="M 40 12 C 40 8, 45 8, 45 12 C 45 16, 40 18, 40 22" stroke="#d7ccc8" stroke-width="2.5" fill="none" stroke-linecap="round" />
      <path d="M 24 28 L 40 22 L 56 28" stroke="#d7ccc8" stroke-width="3" fill="none" stroke-linecap="round" />
      <path d="M 24 28 L 10 38 L 18 48 L 25 43 L 25 72 L 55 72 L 55 43 L 62 48 L 70 38 L 56 28 Q 40 33 24 28 Z" fill="${colorFill}" stroke="${colorStroke}" stroke-width="2" />
      <ellipse cx="40" cy="28" rx="10" ry="4" fill="${colorStroke}" opacity="0.3" />
    </svg>
  `,
  cupcake: (colorFill, colorStroke) => `
    <svg viewBox="0 0 80 80" width="70" height="70">
      <path d="M 25 50 L 30 74 L 50 74 L 55 50 Z" fill="#d7ccc8" stroke="#8d5b4c" stroke-width="1.5" />
      <line x1="31" y1="50" x2="35" y2="74" stroke="#8d5b4c" stroke-width="1" />
      <line x1="38" y1="50" x2="40" y2="74" stroke="#8d5b4c" stroke-width="1" />
      <line x1="45" y1="50" x2="45" y2="74" stroke="#8d5b4c" stroke-width="1" />
      <line x1="50" y1="50" x2="48" y2="74" stroke="#8d5b4c" stroke-width="1" />
      <path d="M 20 48 Q 50 36 60 48 Q 56 32 40 32 Q 24 32 20 48 Z" fill="${colorFill}" stroke="${colorStroke}" stroke-width="2" />
      <circle cx="30" cy="46" r="4" fill="${colorFill}" opacity="0.9" />
      <circle cx="50" cy="46" r="5" fill="${colorFill}" opacity="0.9" />
      <circle cx="40" cy="40" r="6" fill="${colorFill}" />
      <circle cx="40" cy="28" r="4" fill="#ef4444" />
      <path d="M 40 24 Q 44 16 48 18" fill="none" stroke="#b91c1c" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  `,
  "toy-chest": (colorFill, colorStroke) => `
    <svg viewBox="0 0 80 80" width="70" height="70">
      <rect x="18" y="32" width="44" height="36" rx="3" fill="${colorFill}" stroke="${colorStroke}" stroke-width="2" />
      <rect x="14" y="26" width="52" height="7" rx="1.5" fill="${colorFill}" stroke="${colorStroke}" stroke-width="2" />
      <rect x="26" y="32" width="4" height="36" fill="${colorStroke}" opacity="0.4" />
      <rect x="50" y="32" width="4" height="36" fill="${colorStroke}" opacity="0.4" />
      <path d="M 18 50 Q 14 50 14 54 Q 14 58 18 58" fill="none" stroke="${colorStroke}" stroke-width="2" />
      <path d="M 62 50 Q 66 50 66 54 Q 66 58 62 58" fill="none" stroke="${colorStroke}" stroke-width="2" />
      <rect x="36" y="35" width="8" height="10" rx="1" fill="#eab308" stroke="#ca8a04" stroke-width="1.5" />
      <circle cx="40" cy="40" r="1.5" fill="#000" />
    </svg>
  `,
  "train-car": (colorFill, colorStroke) => `
    <svg viewBox="0 0 80 80" width="70" height="70">
      <line x1="5" y1="68" x2="75" y2="68" stroke="#64748b" stroke-width="3" />
      <rect x="2" y="48" width="6" height="4" fill="#475569" />
      <rect x="72" y="48" width="6" height="4" fill="#475569" />
      <rect x="8" y="24" width="64" height="32" rx="4" fill="${colorFill}" stroke="${colorStroke}" stroke-width="2" />
      <rect x="16" y="30" width="12" height="12" rx="1" fill="#e0f2fe" stroke="${colorStroke}" stroke-width="1.5" />
      <rect x="34" y="30" width="12" height="12" rx="1" fill="#e0f2fe" stroke="${colorStroke}" stroke-width="1.5" />
      <rect x="52" y="30" width="12" height="12" rx="1" fill="#e0f2fe" stroke="${colorStroke}" stroke-width="1.5" />
      <circle cx="22" cy="62" r="6" fill="#1e293b" />
      <circle cx="22" cy="62" r="2.5" fill="#e2e8f0" />
      <circle cx="58" cy="62" r="6" fill="#1e293b" />
      <circle cx="58" cy="62" r="2.5" fill="#e2e8f0" />
    </svg>
  `
};

// Color Hex Matching Map
const COLOR_HEX = {
  red: { fill: '#ff4d4d', stroke: '#c62828' },
  yellow: { fill: '#ffd54f', stroke: '#f57f17' },
  blue: { fill: '#4d94ff', stroke: '#1565c0' },
  green: { fill: '#4ade80', stroke: '#166534' },
  pink: { fill: '#f472b6', stroke: '#be185d' }, // Strawberry cupcake
  brown: { fill: '#78350f', stroke: '#451a03' }, // Chocolate cupcake
  empty: { fill: '#e2e8f0', stroke: '#94a3b8' }
};

// Get visual label for option buttons
function getOptionLabel(level, option) {
  if (level.itemType === 'cupcake') {
    if (option === 'pink') return 'Strawberry 🍓';
    if (option === 'brown') return 'Chocolate 🍫';
    if (option === 'green') return 'Matcha 🍵';
  }
  if (level.itemType === 'toy-chest') {
    if (option === 'red') return 'Red Box 🔴';
    if (option === 'yellow') return 'Yellow Box 🟡';
    if (option === 'blue') return 'Blue Box 🔵';
    if (option === 'green') return 'Green Box 🟢';
  }
  if (level.itemType === 'train-car') {
    if (option === 'red') return 'Red Carriage 🔴';
    if (option === 'yellow') return 'Yellow Carriage 🟡';
    if (option === 'blue') return 'Blue Carriage 🔵';
  }
  // Default Shirts
  return option.charAt(0).toUpperCase() + option.slice(1);
}

// Get dynamic title for closet sections
function getClosetTitleText(itemType) {
  if (itemType === 'cupcake') return '🧁 Distribute Cupcakes! 🧁';
  if (itemType === 'toy-chest') return '🧸 Sort Toys into Chests! 🧸';
  if (itemType === 'train-car') return '🚂 Assign Train Carriages! 🚂';
  return '👚 Dress the Friends! 👚';
}

// Get instruction text for closet sections
function getClosetInstructionText(itemType) {
  if (itemType === 'cupcake') return 'Click a cupcake below, then click an animal friend to feed them! (Or drag it)';
  if (itemType === 'toy-chest') return 'Click a toy chest below, then click an animal friend to sort their toys! (Or drag it)';
  if (itemType === 'train-car') return 'Click a carriage below, then click an animal friend to seat them! (Or drag it)';
  return 'Click a shirt below, then click an animal friend to dress them! (Or drag it)';
}

// Capitalize animal names helper
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Load a specific level config dynamically
function loadLevel(levelIndex) {
  const level = LEVELS[levelIndex];
  if (!level) return;

  // 1. Update Title and Indicator
  document.getElementById('level-indicator-tag').textContent = `Level ${level.id} of ${LEVELS.length}`;
  
  // 2. Set Theme Gradients dynamically
  document.getElementById('party-scene-area').style.background = level.bgGradient;
  document.getElementById('table-surface-color').style.background = level.tableColor;
  document.getElementById('table-surface-color').style.borderColor = level.tableBorder;

  // 3. Render centerpiece
  const centerpieceContainer = document.getElementById('table-centerpiece');
  centerpieceContainer.innerHTML = CENTER_PIECE_TEMPLATES[level.centerItem];

  // 4. Render Clue Board List
  const cluesList = document.getElementById('clues-list');
  cluesList.innerHTML = "";
  level.characters.forEach(char => {
    const clueObj = level.clues[char];
    cluesList.innerHTML += `
      <div class="clue-item" id="clue-${char}" data-animal="${char}">
        <div class="clue-avatar">${AVATARS[char]}</div>
        <div class="clue-text-container">
          <span class="clue-speaker">${capitalize(char)}:</span>
          <p class="clue-text">${clueObj.engText}</p>
        </div>
        <button class="play-clue-btn">🔊</button>
      </div>
    `;
  });

  // 5. Render Animal Seats/Characters
  const friendsRow = document.getElementById('friends-row');
  friendsRow.innerHTML = "";
  level.characters.forEach(char => {
    friendsRow.innerHTML += `
      <div class="animal-seat" id="seat-${char}" data-animal="${char}">
        <div class="speech-bubble-indicator hidden">💬</div>
        <div class="animal-character" id="char-${char}">
          ${SVG_TEMPLATES[char](COLOR_HEX.empty.fill, COLOR_HEX.empty.stroke, '3,3')}
        </div>
        <span class="character-tag">${capitalize(char)} ${AVATARS[char]}</span>
        <div class="dressed-color-badge hidden"></div>
      </div>
    `;
  });

  // 6. Render Wardrobe Options
  const wardrobe = document.getElementById('wardrobe');
  wardrobe.innerHTML = "";
  level.options.forEach(opt => {
    wardrobe.innerHTML += `
      <div class="draggable-shirt-wrapper">
        <div class="shirt-item" id="shirt-${opt}" draggable="true" data-color="${opt}">
          ${OPTION_TEMPLATES[level.itemType](COLOR_HEX[opt].fill, COLOR_HEX[opt].stroke)}
          <span class="shirt-label label-${opt}">${getOptionLabel(level, opt)}</span>
        </div>
      </div>
    `;
  });

  // 7. Update Closet Instruction Titles
  document.getElementById('closet-title').textContent = getClosetTitleText(level.itemType);
  document.getElementById('closet-instruction').textContent = getClosetInstructionText(level.itemType);

  // 8. Re-initialize game state variables
  state.assignments = {};
  level.characters.forEach(char => {
    state.assignments[char] = null;
  });
  state.selectedColor = null;
  state.isGameFinished = false;

  // 9. Close any open overlays & stop confetti
  document.getElementById('victory-modal').classList.add('hidden');
  document.getElementById('speech-bubble').classList.add('hidden');
  confetti.stop();

  // 10. Re-bind event handlers to new elements
  setupLevelEventListeners();

  // 11. Play welcome intro prompt
  speakAndShowSubtitle('intro');
}

// Binds actions to dynamically loaded level elements
function setupLevelEventListeners() {
  const level = LEVELS[currentLevelIndex];
  
  // 1. Clue Board items clicks
  document.querySelectorAll('.clue-item').forEach(item => {
    item.addEventListener('click', () => {
      const animal = item.dataset.animal;
      speakAndShowSubtitle(animal);
      highlightClueCard(animal);
    });
  });

  // 2. Closet Option items selections (Click/Drag)
  document.querySelectorAll('.shirt-item').forEach(item => {
    // Click Select
    item.addEventListener('click', () => {
      selectClosetShirt(item.dataset.color);
    });

    // Native Drag and Drop
    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging');
      e.dataTransfer.setData('text/plain', item.dataset.color);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });
  });

  // 3. Animal Seats clicks and drops
  document.querySelectorAll('.animal-seat').forEach(seat => {
    const animal = seat.dataset.animal;

    // Click assign/speak
    seat.addEventListener('click', (e) => {
      // Speak clue if clicking the speaker bubble indicator
      if (e.target.closest('.speech-bubble-indicator')) {
        speakAndShowSubtitle(animal);
        highlightClueCard(animal);
        return;
      }

      if (state.selectedColor) {
        // Apply color
        dressAnimal(animal, state.selectedColor);
        // Clear selection
        state.selectedColor = null;
        document.querySelectorAll('.shirt-item').forEach(el => el.classList.remove('selected'));
      } else {
        // Read clue
        speakAndShowSubtitle(animal);
        highlightClueCard(animal);
      }
    });

    // Drag Over
    seat.addEventListener('dragover', (e) => {
      e.preventDefault();
      seat.classList.add('drag-hover');
    });

    // Drag Leave
    seat.addEventListener('dragleave', () => {
      seat.classList.remove('drag-hover');
    });

    // Drop
    seat.addEventListener('drop', (e) => {
      e.preventDefault();
      seat.classList.remove('drag-hover');
      const color = e.dataTransfer.getData('text/plain');
      if (color) {
        dressAnimal(animal, color);
      }
    });
  });

  // 4. Centerpiece click wiggle easter egg
  const centerpiece = document.getElementById('birthday-cake');
  if (centerpiece) {
    centerpiece.addEventListener('click', () => {
      SFX.playClick();
      const bear = document.getElementById('bear-character');
      bear.classList.add('shake');
      setTimeout(() => bear.classList.remove('shake'), 500);
    });
  }
}

// Assigns a choice color to an animal seat, rendering dynamic path color changes
function dressAnimal(animal, color) {
  state.assignments[animal] = color;
  
  // Color the path in dynamic SVGs (works for rabbit, monkey, kitty, elephant)
  const shirtPath = document.querySelector(`#seat-${animal} .animal-shirt`);
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

  // Set dressed badge overlay
  const badge = document.querySelector(`#seat-${animal} .dressed-color-badge`);
  if (badge) {
    badge.className = 'dressed-color-badge';
    if (color) {
      badge.classList.add(`badge-${color}`);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  SFX.playDress();

  // Prevent duplication: un-assign color if already assigned to another animal
  if (color) {
    Object.keys(state.assignments).forEach(otherAnimal => {
      if (otherAnimal !== animal && state.assignments[otherAnimal] === color) {
        dressAnimal(otherAnimal, null);
      }
    });
  }
}

// Select a shirt/option item in closet
function selectClosetShirt(color) {
  SFX.playClick();
  
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

  const level = LEVELS[currentLevelIndex];
  const assignments = state.assignments;
  
  // Verify if all animals are completed
  const incompleteChar = level.characters.find(char => !assignments[char]);
  if (incompleteChar) {
    speakAndShowSubtitle('incomplete');
    SFX.playFail();
    return;
  }

  // Check answers
  let isAllCorrect = true;
  const correctness = {};
  
  level.characters.forEach(char => {
    correctness[char] = (assignments[char] === level.solution[char]);
    if (!correctness[char]) {
      isAllCorrect = false;
    }
  });

  if (isAllCorrect) {
    // WIN STATE
    state.isGameFinished = true;
    SFX.stopMusic();
    SFX.playSuccess();
    speakAndShowSubtitle('win');

    // Blow out cake candles if present
    document.querySelectorAll('.candle-flame').forEach(flame => {
      flame.style.display = 'none';
    });

    // Add cheering bounces
    level.characters.forEach(char => {
      document.getElementById(`char-${char}`).classList.add('bounce-cheer');
    });
    document.getElementById('bear-character').classList.add('bounce-cheer');

    // Launch Confetti
    confetti.start();

    // Prepare victory modal content
    const modalTitle = document.getElementById('modal-title');
    const modalSubtitle = document.getElementById('modal-subtitle');
    const modalActionBtn = document.getElementById('modal-action-btn');
    const celebrationDisplay = document.getElementById('celebration-display');

    if (currentLevelIndex < LEVELS.length - 1) {
      modalTitle.textContent = "Level Completed! 🎉";
      modalSubtitle.textContent = `You solved ${level.title}! Let's move on to the next puzzle!`;
      modalActionBtn.textContent = "🍰 Play Next Level 🍰";
    } else {
      modalTitle.textContent = "Super Logic Detective! 🏆";
      modalSubtitle.textContent = "Congratulations! You solved all the birthday party puzzles! You are a logic champion! 🌟";
      modalActionBtn.textContent = "🎂 Play Again 🎂";
    }

    // Load cheering items in modal
    celebrationDisplay.innerHTML = "";
    level.characters.forEach(char => {
      celebrationDisplay.innerHTML += `
        <div class="friend-cheering ${char}-jump">
          ${AVATARS[char]}
          <div class="color-badge ${assignments[char]}-bg"></div>
        </div>
      `;
    });
    celebrationDisplay.innerHTML += `
      <div class="friend-cheering bear-clap">🐻</div>
    `;

    // Show victory modal overlay after a short delay
    setTimeout(() => {
      document.getElementById('victory-modal').classList.remove('hidden');
    }, 2500);

  } else {
    // LOSE STATE
    speakAndShowSubtitle('lose');
    SFX.playFail();

    // Shake incorrect animals
    level.characters.forEach(char => {
      if (!correctness[char]) {
        const el = document.getElementById(`seat-${char}`);
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 600);
      }
    });
  }
}

// Reset Game Wrapper
async function resetGame() {
  await SFX.playClick();
  
  const level = LEVELS[currentLevelIndex];
  
  // Reset assignments
  level.characters.forEach(animal => {
    dressAnimal(animal, null);
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

    // Load first level
    currentLevelIndex = 0;
    loadLevel(currentLevelIndex);

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

  // Check Answer Button
  document.getElementById('check-btn').addEventListener('click', checkSolution);

  // Reset Button
  document.getElementById('reset-btn').addEventListener('click', resetGame);

  // Modal Action Button (Next Level or Restart Suite)
  document.getElementById('modal-action-btn').addEventListener('click', () => {
    SFX.playClick();
    if (currentLevelIndex < LEVELS.length - 1) {
      currentLevelIndex++;
      loadLevel(currentLevelIndex);
    } else {
      currentLevelIndex = 0;
      loadLevel(currentLevelIndex);
    }
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
