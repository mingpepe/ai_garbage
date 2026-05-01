import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import confetti from 'canvas-confetti';
import './index.css';

interface WeightItem {
  id: string;
  value: number;
  color: string;
  locked?: boolean;
  isMystery?: boolean;
  isMultiplier?: boolean;
}

type DragEndEvent = MouseEvent | TouchEvent | PointerEvent;

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#82E0AA', '#F1948A', '#85C1E9'
];

const NIGHT_STARS = Array.from({ length: 20 }, (_, i) => ({
  top: `${8 + ((i * 37) % 74)}%`,
  left: `${(i * 53) % 100}%`,
  animationDelay: `${(i % 6) * 0.7}s`,
}));

const SEA_BUBBLES = Array.from({ length: 15 }, (_, i) => ({
  left: `${(i * 47) % 100}%`,
  width: 10 + ((i * 11) % 20),
  height: 10 + ((i * 11) % 20),
  animationDelay: `${(i % 10) * 0.8}s`,
  animationDuration: `${5 + (i % 5)}s`,
}));

const getChallengeType = (targetLevel: number) => ['mystery', 'limited', 'multi'][(targetLevel - 1) % 3];

const CHALLENGE_COPY: Record<string, { title: string; hint: string }> = {
  mystery: {
    title: 'Mystery Challenge',
    hint: 'Find the hidden weight by reading the scale.',
  },
  limited: {
    title: 'Limited Weights',
    hint: 'Use the given pieces. Extra weights are decoys.',
  },
  multi: {
    title: 'Multiplier Trial',
    hint: 'Yellow x2 blocks double the tray total.',
  },
};

const Weight: React.FC<{ 
  item: WeightItem;
  onDragEnd?: (event: DragEndEvent, info: PanInfo) => void;
  onClick?: () => void;
  isStatic?: boolean;
  isSolved?: boolean;
}> = ({ item, onDragEnd, onClick, isStatic, isSolved }) => {
  const { value, color, locked, isMystery, isMultiplier } = item;
  const size = 42 + (Math.abs(value) * 5);
  const showMystery = isMystery && !isSolved;
  
  return (
    <motion.div
      drag={!isStatic && !locked}
      dragSnapToOrigin={!isStatic}
      onDragEnd={onDragEnd}
      onClick={onClick}
      whileHover={!locked ? { scale: 1.05 } : {}}
      whileTap={!locked ? { scale: 0.95 } : {}}
      whileDrag={{ zIndex: 1000, scale: 1.1 }}
      animate={isMystery && isSolved ? { rotateY: 360 } : { rotateY: 0 }}
      transition={{ duration: 0.8, type: 'spring' }}
      className={`weight ${locked ? 'locked' : ''} ${showMystery ? 'mystery' : ''} ${isMultiplier ? 'multiplier' : ''}`}
      style={{
        width: size,
        height: size,
        background: showMystery ? undefined : (isMultiplier ? '#ffeb3b' : `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`),
        fontSize: size * 0.4,
        color: isMultiplier ? '#5d4037' : 'white',
        cursor: locked ? 'default' : (isStatic ? 'pointer' : 'grab')
      }}
    >
      {showMystery ? '?' : (isMultiplier ? 'x2' : value)}
    </motion.div>
  );
};

type GameMode = 'free' | 'challenge';

const BackgroundDecorations: React.FC<{ theme: string }> = ({ theme }) => {
  if (theme === 'theme-day') {
    return (
      <div className="decorations">
        <div className="cloud" style={{ top: '10%', left: '-10%', animationDelay: '0s' }} />
        <div className="cloud" style={{ top: '25%', left: '-15%', animationDelay: '5s' }} />
        <div className="cloud" style={{ top: '15%', left: '-20%', animationDelay: '12s' }} />
      </div>
    );
  }
  if (theme === 'theme-night') {
    return (
      <div className="decorations">
        {NIGHT_STARS.map((star, i) => (
          <div key={i} className="star" style={{ 
            top: star.top,
            left: star.left,
            animationDelay: star.animationDelay,
          }} />
        ))}
      </div>
    );
  }
  if (theme === 'theme-sea') {
    return (
      <div className="decorations">
        {SEA_BUBBLES.map((bubble, i) => (
          <div key={i} className="bubble" style={{ 
            left: bubble.left,
            bottom: '-50px',
            width: bubble.width,
            height: bubble.height,
            animationDelay: bubble.animationDelay,
            animationDuration: bubble.animationDuration,
          }} />
        ))}
      </div>
    );
  }
  return null;
};

const TitleScreen: React.FC<{ onStart: (mode: GameMode) => void, highScore: number, totalStars: number }> = ({ onStart, highScore, totalStars }) => {
  const getRank = (stars: number) => {
    if (stars >= 500) return 'Balance God ⚡';
    if (stars >= 200) return 'Gravity Master 🌌';
    if (stars >= 100) return 'Math Wizard 🧙';
    if (stars >= 50) return 'Expert Balancer 🏆';
    if (stars >= 10) return 'Novice 🔰';
    return 'Apprentice';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="title-screen">
      <motion.h1 initial={{ y: -50 }} animate={{ y: 0 }} style={{ fontSize: '4rem', color: '#5d4037', textShadow: '4px 4px 0px #fff', margin: 0 }}>
        Balance Master
      </motion.h1>
      <div style={{ fontSize: '1.5rem', color: '#795548', fontWeight: 'bold', marginBottom: '10px' }}>
        Rank: {getRank(totalStars)}
      </div>
      <p style={{ fontSize: '1.2rem', color: '#5d4037', marginBottom: '10px', maxWidth: '400px', textAlign: 'center' }}>
        Master the laws of physics and math to keep the scale perfectly balanced!
      </p>
      
      <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
        {highScore > 1 && <div className="high-score-badge">Level: {highScore}</div>}
        {totalStars > 0 && <div className="high-score-badge" style={{ background: '#ff9800', color: '#fff' }}>⭐ {totalStars}</div>}
      </div>
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <button className="btn btn-secondary" onClick={() => onStart('free')}>Free Play</button>
        <button className="btn btn-primary" onClick={() => onStart('challenge')}>Start Challenge</button>
      </div>

      <div className="instructions-mini">
        <h3>How to Play:</h3>
        <ul style={{ textAlign: 'left' }}>
          <li>Drag weights to trays to balance them.</li>
          <li>In Challenge Mode, the left tray is locked.</li>
          <li>Keep it balanced for 1s to win.</li>
          <li>Watch your move limit!</li>
        </ul>
      </div>
    </motion.div>
  );
};

const MilestoneScreen: React.FC<{ level: number, onContinue: () => void }> = ({ level, onContinue }) => {
  return (
    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="milestone-screen">
      <h2 style={{ fontSize: '3rem', margin: '0 0 10px 0', color: '#5d4037' }}>🏆 LEVEL {level} COMPLETE!</h2>
      <p style={{ fontSize: '1.5rem', marginBottom: '30px', color: '#5d4037' }}>You've mastered this environment.</p>
      <button className="btn btn-primary" onClick={onContinue}>Unlock Next Theme ➔</button>
    </motion.div>
  );
};

const playSound = (type: 'drop' | 'win' | 'lose', enabled: boolean) => {
  if (!enabled) return;
  try {
    const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    if (type === 'drop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(); osc.stop(now + 0.1);
    } else if (type === 'win') {
      [261, 329, 392, 523].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.setValueAtTime(f, now + i * 0.1);
        g.gain.setValueAtTime(0.1, now + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.5);
        o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.5);
      });
    } else if (type === 'lose') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(50, now + 0.5);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
      osc.start(); osc.stop(now + 0.5);
    }
  } catch {
    return;
  }
};
const SettingsModal: React.FC<{ 
  soundEnabled: boolean, 
  onToggleSound: () => void, 
  onReset: () => void, 
  onClose: () => void 
}> = ({ soundEnabled, onToggleSound, onReset, onClose }) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-overlay">
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="settings-card">
        <h2>Settings</h2>
        <div className="setting-row">
          <span>Sound Effects</span>
          <button className={`btn ${soundEnabled ? 'btn-primary' : 'btn-secondary'}`} onClick={onToggleSound}>
            {soundEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="setting-row" style={{ marginTop: 20 }}>
          <span>Clear All Progress</span>
          <button className="btn" style={{ background: '#f44336', color: '#fff' }} onClick={() => {
            if (confirm('Are you sure you want to reset everything?')) onReset();
          }}>Reset</button>
        </div>
        <button className="btn btn-secondary" style={{ marginTop: 30, width: '100%' }} onClick={onClose}>Close</button>
      </motion.div>
    </motion.div>
  );
};

export default function App() {
  const [showTitle, setShowTitle] = useState(true);
  const [showMilestone, setShowMilestone] = useState(false);
  const [milestoneLevel, setMilestoneLevel] = useState<number | null>(null);
  const [pendingChallengeLevel, setPendingChallengeLevel] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('bm-sound') !== 'false');
  const [mode, setMode] = useState<GameMode>('free');
  // ... rest of state

  const [level, setLevel] = useState(() => Number(localStorage.getItem('bm-level')) || 1);
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem('bm-high-score')) || 1);
  const [totalStars, setTotalStars] = useState(() => Number(localStorage.getItem('bm-total-stars')) || 0);
  
  const [leftWeights, setLeftWeights] = useState<WeightItem[]>([]);
  const [rightWeights, setRightWeights] = useState<WeightItem[]>([]);
  const [inventory, setInventory] = useState<WeightItem[] | null>(null);

  const [moves, setMoves] = useState(0);
  const [maxMoves, setMaxMoves] = useState(0);
  const [idealMoves, setIdealMoves] = useState(0);
  const [targetSum, setTargetSum] = useState<number | null>(null);
  
  const [isSolved, setIsSolved] = useState(false);
  const [stars, setStars] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [windForce, setWindForce] = useState(0);
  
  const currentTheme = (() => {
    const cycle = Math.floor((level - 1) / 5) % 4;
    return ['theme-day', 'theme-sunset', 'theme-night', 'theme-sea'][cycle];
  })();
  
  const calculateTraySum = (weights: WeightItem[]) => {
    const baseSum = weights.filter(w => !w.isMultiplier).reduce((acc, curr) => acc + curr.value, 0);
    const multipliers = weights.filter(w => w.isMultiplier).length;
    return baseSum * (multipliers > 0 ? Math.pow(2, multipliers) : 1);
  };

  const leftSum = calculateTraySum(leftWeights);
  const rightSum = calculateTraySum(rightWeights);
  const leftBuoyancy = currentTheme === 'theme-sea' ? leftWeights.length : 0;
  const rightBuoyancy = currentTheme === 'theme-sea' ? rightWeights.length : 0;
  const leftEffective = leftSum - leftBuoyancy;
  const rightEffective = rightSum - rightBuoyancy;

  const leftHasMystery = leftWeights.some(w => w.isMystery) && !isSolved;
  const rightHasMystery = rightWeights.some(w => w.isMystery) && !isSolved;

  const diff = rightEffective - leftEffective + windForce;
  const angle = Math.max(-30, Math.min(30, diff * 1.5));
  const beamPhysics = currentTheme === 'theme-sea' ? { stiffness: 10, damping: 20 } : { stiffness: 40, damping: 12 };
  const challengeType = getChallengeType(level);
  const challengeCopy = CHALLENGE_COPY[challengeType];
  const showLeftReadout = mode === 'free' || isSolved;
  const balanceReadout = (() => {
    if (Math.abs(diff) < 0.1) return 'Level';
    if (mode === 'challenge') return diff > 0 ? 'Right heavy' : 'Left heavy';
    return `${Math.abs(diff)} ${diff > 0 ? 'R' : 'L'}`;
  })();

  useEffect(() => {
    const balanced = Math.abs(diff) < 0.1 && leftSum !== 0;
    const targetMet = targetSum === null || leftSum === targetSum;
    let timer: number | undefined;

    if (balanced && targetMet && !gameOver && !isSolved) {
      timer = window.setInterval(() => {
        setStabilityProgress(prev => {
          if (prev >= 100) {
            window.clearInterval(timer);
            setIsSolved(true);
            playSound('win', soundEnabled);
            const earnedStars = moves <= idealMoves + 1 ? 3 : (moves <= idealMoves + 3 ? 2 : 1);
            setStars(earnedStars);
            if (mode === 'challenge') {
              setTotalStars(t => {
                const next = t + earnedStars;
                localStorage.setItem('bm-total-stars', next.toString());
                return next;
              });
            }
            confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } });
            return 100;
          }
          return prev + 5;
        });
      }, 50);
    } else if (stabilityProgress !== 0) {
      timer = window.setTimeout(() => setStabilityProgress(0), 0);
    }
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timer);
    };
  }, [diff, leftSum, targetSum, gameOver, isSolved, moves, idealMoves, mode, soundEnabled, stabilityProgress]);

  useEffect(() => {
    if (mode !== 'challenge' || isSolved || gameOver || maxMoves === 0 || moves < maxMoves || stabilityProgress > 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setGameOver(true);
      playSound('lose', soundEnabled);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [mode, isSolved, gameOver, maxMoves, moves, stabilityProgress, soundEnabled]);

  const startNewChallenge = (targetLevel: number, currentMode: GameMode) => {
    if (targetLevel > 1 && (targetLevel - 1) % 5 === 0 && !showMilestone && currentMode === 'challenge' && level < targetLevel) {
      setMilestoneLevel(targetLevel - 1);
      setPendingChallengeLevel(targetLevel);
      setShowMilestone(true);
      return;
    }

    const newLeft: WeightItem[] = [];
    let newRight: WeightItem[] = [];
    let newInventory: WeightItem[] | null;
    const newTarget: number | null = null;
    let newIdeal: number;
    setGameOver(false);
    setShowMilestone(false);
    setMilestoneLevel(null);
    setPendingChallengeLevel(null);

    const type = getChallengeType(targetLevel);
    const maxCount = targetLevel <= 3 ? 2 : (targetLevel <= 6 ? 3 : 5);
    const minCount = targetLevel <= 3 ? 1 : (targetLevel <= 6 ? 2 : 3);
    const leftCount = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
    const valMax = targetLevel <= 3 ? 5 : (targetLevel <= 6 ? 7 : 9);
    const valMin = targetLevel <= 3 ? 2 : (targetLevel <= 6 ? 3 : 4);

    let totalLeft = 0;
    for (let i = 0; i < leftCount; i++) {
      const val = Math.floor(Math.random() * (valMax - valMin + 1)) + valMin;
      totalLeft += val;
      newLeft.push({ id: `l-${i}-${Math.random()}`, value: val, color: COLORS[Math.min(9, val - 1)], locked: true, isMystery: leftCount === 1 });
    }

    // Helper to generate a challenging inventory
    const buildInventory = (needed: number, isMulti: boolean) => {
      const inv: WeightItem[] = [];
      let remaining = needed;
      
      // If we have a multiplier and it's a multi level, use it
      let usedMultiplier = false;
      if (isMulti && targetLevel >= 5 && Math.random() > 0.5 && needed > 10 && needed % 2 === 0) {
        inv.push({ id: 'inv-mult', value: 0, color: '#ffeb3b', isMultiplier: true });
        remaining = needed / 2;
        usedMultiplier = true;
      }

      // Split the needed weight into multiple pieces
      const pieces = remaining > 15 ? 3 : 2;
      for (let i = 0; i < pieces - 1; i++) {
        const v = Math.max(1, Math.floor(remaining / pieces) + (Math.floor(Math.random() * 3) - 1));
        inv.push({ id: `inv-target-${i}`, value: v, color: COLORS[Math.min(9, v - 1)] });
        remaining -= v;
      }
      inv.push({ id: `inv-target-last`, value: Math.max(1, remaining), color: COLORS[Math.min(9, Math.max(0, remaining - 1))] });

      // Add 3-4 pieces of noise
      for (let i = 0; i < 4; i++) {
        const v = Math.floor(Math.random() * 9) + 1;
        inv.push({ id: `inv-noise-${i}`, value: v, color: COLORS[v - 1] });
      }
      return { inv: inv.sort(() => Math.random() - 0.5), count: pieces + (usedMultiplier ? 1 : 0) };
    };

    if (type === 'limited') {
      const { inv, count } = buildInventory(totalLeft, false);
      newInventory = inv;
      newIdeal = count;
    } else if (type === 'multi') {
      const rightStart = Math.floor(totalLeft / 3);
      if (rightStart > 0) newRight = [{ id: 'mr1', value: rightStart, color: COLORS[Math.min(9, rightStart - 1)], locked: true }];
      const { inv, count } = buildInventory(totalLeft - rightStart, true);
      newInventory = inv;
      newIdeal = count;
    } else {
      // mystery or generic
      const { inv, count } = buildInventory(totalLeft, true);
      newInventory = inv;
      newIdeal = count;
    }

    setLeftWeights(newLeft); setRightWeights(newRight); setInventory(newInventory);
    setTargetSum(newTarget); setIdealMoves(newIdeal); setMaxMoves(newIdeal + 5);
    setMoves(0); setIsSolved(false); setLevel(targetLevel); setMode(currentMode); setShowTitle(false);

    if (currentMode === 'challenge') {
      localStorage.setItem('bm-level', targetLevel.toString());
      if (targetLevel > highScore) { setHighScore(targetLevel); localStorage.setItem('bm-high-score', targetLevel.toString()); }
    }
    setWindForce(targetLevel > 5 && targetLevel <= 10 && currentMode === 'challenge' ? Math.floor(Math.random() * 7) - 3 : 0);
  };

  const startGame = (sel: GameMode) => {
    if (sel === 'free') { setMode('free'); setShowTitle(false); setInventory(null); setTargetSum(null); setLeftWeights([]); setRightWeights([]); }
    else { startNewChallenge(level, 'challenge'); }
  };

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('bm-sound', next.toString());
      return next;
    });
  };

  const resetProgress = () => {
    localStorage.clear();
    setLevel(1);
    setHighScore(1);
    setTotalStars(0);
    setShowSettings(false);
    setShowTitle(true);
  };

  const handleDragEnd = (_: DragEndEvent, info: PanInfo, item: WeightItem) => {
    if (gameOver) return;
    const { x, y } = info.point;
    const trayElement = document
      .elementsFromPoint(x, y)
      .find((element): element is HTMLElement => element instanceof HTMLElement && element.dataset.tray !== undefined);
    const side = trayElement?.dataset.tray as 'left' | 'right' | undefined;
    const added = side !== undefined && !(mode === 'challenge' && side === 'left');

    if (added) {
      const setter = side === 'left' ? setLeftWeights : setRightWeights;
      setter(prev => [...prev, { ...item, id: Math.random().toString(36) }]);
      if (inventory) setInventory(prev => prev ? prev.filter(w => w.id !== item.id) : null);
      if (mode !== 'free') {
        const nm = moves + 1; setMoves(nm);
      }
      playSound('drop', soundEnabled);
    }
  };

  const removeWeight = (item: WeightItem, side: 'left' | 'right') => {
    if (item.locked || gameOver) return;
    if (side === 'left') setLeftWeights(prev => prev.filter(w => w.id !== item.id));
    else setRightWeights(prev => prev.filter(w => w.id !== item.id));
    if (inventory !== null) setInventory(prev => prev ? [...prev, item] : null);
    if (mode !== 'free') setMoves(moves + 1);
    playSound('drop', soundEnabled);
  };

  return (
    <div className={`game-container ${currentTheme}`}>
      <BackgroundDecorations theme={currentTheme} />
      
      {showSettings && (
        <SettingsModal 
          soundEnabled={soundEnabled} 
          onToggleSound={toggleSound} 
          onReset={resetProgress} 
          onClose={() => setShowSettings(false)} 
        />
      )}

      {showTitle ? <TitleScreen onStart={startGame} highScore={highScore} totalStars={totalStars} /> : 
       showMilestone ? <MilestoneScreen level={milestoneLevel ?? level} onContinue={() => startNewChallenge(pendingChallengeLevel ?? level + 1, 'challenge')} /> : (
        <>
          <div className="mode-selector">
            <button className="btn btn-secondary" onClick={() => setShowTitle(true)}>Back</button>
            <button className={`btn btn-secondary ${mode === 'free' ? 'btn-active' : ''}`} onClick={() => startGame('free')}>Free Play</button>
            <button className={`btn btn-primary ${mode === 'challenge' ? 'btn-active' : ''}`} onClick={() => startNewChallenge(1, 'challenge')}>Reset Challenge</button>
            <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>⚙️</button>
          </div>
          <div className="spawner-area">
            <AnimatePresence>
              {inventory ? inventory.map(item => <div key={item.id}><Weight item={item} onDragEnd={(e, info) => handleDragEnd(e, info, item)} isStatic={false} /></div>) : 
               Array.from({ length: 10 }, (_, i) => i + 1).map(val => <div key={val}><Weight item={{ id: `t-${val}`, value: val, color: COLORS[val-1] }} onDragEnd={(e, info) => handleDragEnd(e, info, { id: 'temp', value: val, color: COLORS[val-1] })} isStatic={false} /></div>)}
            </AnimatePresence>
          </div>
          {mode === 'challenge' && (
            <div className="stats-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="level-badge">LVL {level}</span>
                {!isSolved && !gameOver && (
                  <button className="btn-icon" title="Restart Level" onClick={() => startNewChallenge(level, mode)}>🔄</button>
                )}
              </div>
              <div className="progress-container"><div className="progress-bar" style={{ width: `${(level % 5 || 5) * 20}%` }} /></div>
              <h2 style={{fontSize:'1.1rem', margin:'10px 0 4px', color:'#e65100'}}>{challengeCopy.title}</h2>
              {!gameOver && !isSolved && <p className="challenge-hint">{challengeCopy.hint}</p>}
              {gameOver ? <div><h3 style={{color:'#f44336'}}>Out of Moves!</h3><button className="btn btn-primary" onClick={() => startNewChallenge(level, mode)}>Try Again</button></div> : 
               isSolved ? <div><div style={{fontSize:'1.8rem', margin:'5px 0'}}> {Array.from({length:3}).map((_,i)=><span key={i} style={{color:i<stars?'#ffd700':'#ccc'}}>⭐</span>)} </div><button className="btn btn-primary" onClick={() => startNewChallenge(level + 1, mode)}>Next ➔</button></div> : 
               <p style={{margin:0, fontSize:'1rem'}}>Moves: <span style={{color: moves >= maxMoves - 2 ? '#f44336' : '#2196f3'}}>{moves} / {maxMoves}</span></p>}
            </div>
          )}
          <div className="scale-system">
            {stabilityProgress > 0 && stabilityProgress < 100 && <div className="stability-indicator"><div className="stability-bar" style={{ width: `${stabilityProgress}%` }} /><span style={{ position: 'absolute', top: -20, fontSize: '0.9rem', color: '#4caf50', fontWeight: 'bold' }}>STABILIZING...</span></div>}
            <div className="readout-panel">
              <div>
                <span>Left</span>
                <strong>{showLeftReadout ? (leftHasMystery ? '?' : leftEffective) : 'Hidden'}</strong>
              </div>
              <div>
                <span>Balance</span>
                <strong>{balanceReadout}</strong>
              </div>
              <div>
                <span>Right</span>
                <strong>{rightHasMystery ? '?' : rightEffective}</strong>
              </div>
            </div>
            <div className="pivot" />
            {windForce !== 0 && <div className="wind-indicator"><span style={{ fontSize: '1.5rem' }}>{windForce > 0 ? '➡' : '⬅'}</span><div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>WIND: {Math.abs(windForce)}</div></div>}
            {currentTheme === 'theme-sea' && <div className="buoyancy-legend">💧 BUOYANCY: -1 / item</div>}
            <motion.div className="beam-container" animate={{ rotate: angle }} transition={{ type: 'spring', ...beamPhysics }}>
              <div className="beam">
                <div className="tray-container" style={{ left: -140 }}>
                  <div className="string" />
                  <motion.div data-tray="left" className={`tray ${isSolved ? 'success-glow' : ''} ${mode === 'challenge' ? 'tray-locked' : ''}`} animate={{ rotate: -angle }}>
                    {mode === 'challenge' && <div style={{ position: 'absolute', top: -25, fontSize: '1.2rem', opacity: 0.6 }}>🔒 Fixed</div>}
                    {leftBuoyancy > 0 && <div className="buoyancy-indicator">↑ {leftBuoyancy}</div>}
                    <AnimatePresence>{leftWeights.map(w => <motion.div key={w.id} layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Weight item={w} isStatic={true} isSolved={isSolved} onClick={() => removeWeight(w, 'left')} /></motion.div>)}</AnimatePresence>
                  </motion.div>
                  {mode === 'challenge' && leftHasMystery && (
                    <div style={{fontWeight:'bold', color:'#5d4037', marginTop:5, fontSize:'1.2rem'}}>?</div>
                  )}
                </div>
                <div className="tray-container" style={{ right: -140 }}>
                  <div className="string" />
                  <motion.div data-tray="right" className={`tray ${isSolved ? 'success-glow' : ''}`} animate={{ rotate: -angle }}>
                    {rightBuoyancy > 0 && <div className="buoyancy-indicator">↑ {rightBuoyancy}</div>}
                    <AnimatePresence>{rightWeights.map(w => <motion.div key={w.id} layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Weight item={w} isStatic={true} isSolved={isSolved} onClick={() => removeWeight(w, 'right')} /></motion.div>)}</AnimatePresence>
                  </motion.div>
                  {mode === 'challenge' && <div style={{fontWeight:'bold', color:'#5d4037', marginTop:5, fontSize:'1.2rem'}}>{rightHasMystery ? '?' : rightSum - rightBuoyancy}</div>}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
