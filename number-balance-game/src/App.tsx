import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#82E0AA', '#F1948A', '#85C1E9'
];

const Weight: React.FC<{ 
  item: WeightItem;
  onDragEnd?: (event: any, info: any) => void;
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
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="star" style={{ 
            top: `${Math.random() * 80}%`, 
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s` 
          }} />
        ))}
      </div>
    );
  }
  if (theme === 'theme-sea') {
    return (
      <div className="decorations">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="bubble" style={{ 
            left: `${Math.random() * 100}%`, 
            bottom: '-50px',
            width: 10 + Math.random() * 20,
            height: 10 + Math.random() * 20,
            animationDelay: `${Math.random() * 10}s`,
            animationDuration: `${5 + Math.random() * 5}s`
          }} />
        ))}
      </div>
    );
  }
  return null;
};

const TitleScreen: React.FC<{ onStart: (mode: GameMode) => void, highScore: number, totalStars: number }> = ({ onStart, highScore, totalStars }) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="title-screen">
      <motion.h1 initial={{ y: -50 }} animate={{ y: 0 }} style={{ fontSize: '4rem', color: '#5d4037', textShadow: '4px 4px 0px #fff', margin: 0 }}>
        Balance Master
      </motion.h1>
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
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
  } catch (e) {}
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
  
  const leftTrayRef = useRef<HTMLDivElement>(null);
  const rightTrayRef = useRef<HTMLDivElement>(null);

  const currentTheme = level <= 5 ? 'theme-day' : (level <= 10 ? 'theme-sunset' : (level <= 15 ? 'theme-night' : 'theme-sea'));
  
  const calculateTraySum = (weights: WeightItem[]) => {
    let baseSum = weights.filter(w => !w.isMultiplier).reduce((acc, curr) => acc + curr.value, 0);
    let multipliers = weights.filter(w => w.isMultiplier).length;
    return baseSum * (multipliers > 0 ? Math.pow(2, multipliers) : 1);
  };

  const leftSum = calculateTraySum(leftWeights);
  const rightSum = calculateTraySum(rightWeights);
  const leftBuoyancy = currentTheme === 'theme-sea' ? leftWeights.length : 0;
  const rightBuoyancy = currentTheme === 'theme-sea' ? rightWeights.length : 0;

  const leftHasMystery = leftWeights.some(w => w.isMystery) && !isSolved;
  const rightHasMystery = rightWeights.some(w => w.isMystery) && !isSolved;

  const diff = (rightSum - rightBuoyancy) - (leftSum - leftBuoyancy) + windForce;
  const angle = Math.max(-30, Math.min(30, diff * 1.5));
  const beamPhysics = currentTheme === 'theme-sea' ? { stiffness: 10, damping: 20 } : { stiffness: 40, damping: 12 };

  useEffect(() => {
    const balanced = Math.abs(diff) < 0.1 && leftSum !== 0;
    const targetMet = targetSum === null || leftSum === targetSum;
    let timer: any;

    if (balanced && targetMet && !gameOver && !isSolved) {
      timer = setInterval(() => {
        setStabilityProgress(prev => {
          if (prev >= 100) {
            clearInterval(timer);
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
    } else {
      setStabilityProgress(0);
    }
    return () => clearInterval(timer);
  }, [diff, leftSum, targetSum, gameOver, isSolved, moves, idealMoves, mode, soundEnabled]);

  const startNewChallenge = (targetLevel: number, currentMode: GameMode) => {
    if (targetLevel > 1 && (targetLevel - 1) % 5 === 0 && !showMilestone && currentMode === 'challenge' && level < targetLevel) {
      setShowMilestone(true);
      return;
    }

    let newLeft: WeightItem[] = [];
    let newRight: WeightItem[] = [];
    let newInventory: WeightItem[] | null = null;
    let newTarget: number | null = null;
    let newIdeal = 0;
    setGameOver(false);
    setShowMilestone(false);

    const type = ['mystery', 'limited', 'multi'][(targetLevel - 1) % 3];
    let maxCount = targetLevel <= 3 ? 2 : (targetLevel <= 6 ? 3 : 5);
    let minCount = targetLevel <= 3 ? 1 : (targetLevel <= 6 ? 2 : 3);
    const leftCount = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
    let valMax = targetLevel <= 3 ? 5 : (targetLevel <= 6 ? 7 : 9);
    let valMin = targetLevel <= 3 ? 2 : (targetLevel <= 6 ? 3 : 4);

    let totalLeft = 0;
    for (let i = 0; i < leftCount; i++) {
      const val = Math.floor(Math.random() * (valMax - valMin + 1)) + valMin;
      totalLeft += val;
      newLeft.push({ id: `l-${i}-${Math.random()}`, value: val, color: COLORS[Math.min(9, val - 1)], locked: true, isMystery: leftCount === 1 });
    }

    if (type === 'limited') {
      newInventory = [{ id: 'inv-1', value: totalLeft, color: COLORS[Math.min(9, Math.floor(totalLeft/2))] }];
      newIdeal = 1;
    } else if (type === 'multi') {
      const rightStart = Math.floor(totalLeft / 3);
      if (rightStart > 0) newRight = [{ id: 'mr1', value: rightStart, color: COLORS[Math.min(9, rightStart - 1)], locked: true }];
      
      // If level 5+, occasionally limit inventory but include a multiplier
      if (targetLevel >= 5 && Math.random() > 0.6) {
        newInventory = [
          { id: 'mult-1', value: 0, color: '#ffeb3b', isMultiplier: true },
          { id: 'inv-w1', value: 5, color: COLORS[4] },
          { id: 'inv-w2', value: 10, color: COLORS[9] }
        ];
      }
      newIdeal = Math.ceil((totalLeft - rightStart) / 10);
    } else {
      newIdeal = Math.ceil(totalLeft / 10);
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

  const handleDragEnd = (_: any, info: any, item: WeightItem) => {
    if (gameOver) return;
    const { x, y } = info.point;
    let added = false;
    const check = (ref: React.RefObject<HTMLDivElement | null>, setter: React.Dispatch<React.SetStateAction<WeightItem[]>>, side: string) => {
      if (mode === 'challenge' && side === 'left') return;
      if (ref.current) {
        const r = ref.current.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          setter(prev => [...prev, { ...item, id: Math.random().toString(36) }]);
          added = true;
        }
      }
    };
    check(leftTrayRef, setLeftWeights, 'left');
    if (!added) check(rightTrayRef, setRightWeights, 'right');
    if (added) {
      if (inventory) setInventory(prev => prev ? prev.filter(w => w.id !== item.id) : null);
      if (mode !== 'free') {
        const nm = moves + 1; setMoves(nm);
        if (mode === 'challenge' && nm >= maxMoves && !isSolved) setTimeout(() => { setMoves(m => { if (m >= maxMoves) { setGameOver(true); playSound('lose', soundEnabled); } return m; }); }, 800);
      }
      playSound('drop', soundEnabled);
    }
  };

  const removeWeight = (item: WeightItem, side: 'left' | 'right') => {
    if (item.locked || gameOver) return;
    if (side === 'left') setLeftWeights(prev => prev.filter(w => w.id !== item.id));
    else setRightWeights(prev => prev.filter(w => w.id !== item.id));
    if (inventory !== null) setInventory(prev => prev ? [...prev, item] : null);
    if (mode !== 'free') { const nm = moves + 1; setMoves(nm); if (mode === 'challenge' && nm >= maxMoves) setTimeout(() => { setGameOver(true); playSound('lose', soundEnabled); }, 800); }
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
       showMilestone ? <MilestoneScreen level={level - 1} onContinue={() => startNewChallenge(level, 'challenge')} /> : (
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
              <h2 style={{fontSize:'1.1rem', margin:'10px 0', color:'#e65100'}}>MYSTERY CHALLENGE!</h2>
              {gameOver ? <div><h3 style={{color:'#f44336'}}>Out of Moves!</h3><button className="btn btn-primary" onClick={() => startNewChallenge(level, mode)}>Try Again</button></div> : 
               isSolved ? <div><div style={{fontSize:'1.8rem', margin:'5px 0'}}> {Array.from({length:3}).map((_,i)=><span key={i} style={{color:i<stars?'#ffd700':'#ccc'}}>⭐</span>)} </div><button className="btn btn-primary" onClick={() => startNewChallenge(level + 1, mode)}>Next ➔</button></div> : 
               <p style={{margin:0, fontSize:'1rem'}}>Moves: <span style={{color: moves >= maxMoves - 2 ? '#f44336' : '#2196f3'}}>{moves} / {maxMoves}</span></p>}
            </div>
          )}
          <div className="scale-system">
            {stabilityProgress > 0 && stabilityProgress < 100 && <div className="stability-indicator"><div className="stability-bar" style={{ width: `${stabilityProgress}%` }} /><span style={{ position: 'absolute', top: -20, fontSize: '0.9rem', color: '#4caf50', fontWeight: 'bold' }}>STABILIZING...</span></div>}
            <div className="pivot" />
            {windForce !== 0 && <div className="wind-indicator"><span style={{ fontSize: '1.5rem' }}>{windForce > 0 ? '➡' : '⬅'}</span><div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>WIND: {Math.abs(windForce)}</div></div>}
            {currentTheme === 'theme-sea' && <div className="buoyancy-legend">💧 BUOYANCY: -1 / item</div>}
            <motion.div className="beam-container" animate={{ rotate: angle }} transition={{ type: 'spring', ...beamPhysics }}>
              <div className="beam">
                <div className="tray-container" style={{ left: -140 }}>
                  <div className="string" />
                  <motion.div ref={leftTrayRef} className={`tray ${isSolved ? 'success-glow' : ''} ${mode === 'challenge' ? 'tray-locked' : ''}`} animate={{ rotate: -angle }}>
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
                  <motion.div ref={rightTrayRef} className={`tray ${isSolved ? 'success-glow' : ''}`} animate={{ rotate: -angle }}>
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
