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
  const { value, color, locked, isMystery } = item;
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
      className={`weight ${locked ? 'locked' : ''} ${showMystery ? 'mystery' : ''}`}
      style={{
        width: size,
        height: size,
        background: showMystery ? undefined : `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`,
        fontSize: size * 0.4,
        cursor: locked ? 'default' : (isStatic ? 'pointer' : 'grab')
      }}
    >
      {showMystery ? '?' : value}
    </motion.div>
  );
};

type GameMode = 'free' | 'challenge';

export default function App() {
  const [mode, setMode] = useState<GameMode>('free');
  const [level, setLevel] = useState(1);
  const [targetSum, setTargetSum] = useState<number | null>(null);
  const [idealMoves, setIdealMoves] = useState(0);
  
  const [leftWeights, setLeftWeights] = useState<WeightItem[]>([]);
  const [rightWeights, setRightWeights] = useState<WeightItem[]>([]);
  const [inventory, setInventory] = useState<WeightItem[] | null>(null);

  const [moves, setMoves] = useState(0);
  const [isSolved, setIsSolved] = useState(false);
  const [stars, setStars] = useState(0);
  
  const leftTrayRef = useRef<HTMLDivElement>(null);
  const rightTrayRef = useRef<HTMLDivElement>(null);
  
  const leftSum = leftWeights.reduce((acc, curr) => acc + curr.value, 0);
  const rightSum = rightWeights.reduce((acc, curr) => acc + curr.value, 0);
  
  const leftHasMystery = leftWeights.some(w => w.isMystery) && !isSolved;
  const rightHasMystery = rightWeights.some(w => w.isMystery) && !isSolved;

  const diff = rightSum - leftSum;
  const angle = Math.max(-30, Math.min(30, diff * 1.5));

  useEffect(() => {
    const balanced = leftSum === rightSum && leftSum !== 0;
    const targetMet = targetSum === null || leftSum === targetSum;
    
    if (balanced && targetMet) {
      if (!isSolved) {
        setIsSolved(true);
        let earnedStars = moves <= idealMoves + 1 ? 3 : (moves <= idealMoves + 3 ? 2 : 1);
        setStars(earnedStars);
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } });
      }
    } else {
      setIsSolved(false);
      setStars(0);
    }
  }, [leftSum, rightSum, targetSum]);

  const startNewChallenge = (targetLevel: number, currentMode: GameMode) => {
    let newLeft: WeightItem[] = [];
    let newRight: WeightItem[] = [];
    let newInventory: WeightItem[] | null = null;
    let newTarget: number | null = null;
    let newIdeal = 0;

    const type = ['mystery', 'limited', 'multi'][(targetLevel - 1) % 3];
    if (type === 'mystery') {
      const val = Math.floor(Math.random() * 7) + 3;
      newLeft = [{ id: 'm1', value: val, color: COLORS[val-1], locked: true, isMystery: true }];
      newIdeal = 1;
    } else if (type === 'limited') {
      const val = Math.floor(Math.random() * 6) + 4;
      newLeft = [{ id: 'l1', value: val, color: COLORS[val-1], locked: true }];
      newInventory = [{ id: 'inv-1', value: val, color: COLORS[val-1] }];
      newIdeal = 1;
    } else {
      newLeft = [{ id: 'ml1', value: 5, color: COLORS[4], locked: true }, { id: 'ml2', value: 3, color: COLORS[2], locked: true }];
      newRight = [{ id: 'mr1', value: 4, color: COLORS[3], locked: true }];
      newIdeal = 1;
    }

    setLeftWeights(newLeft);
    setRightWeights(newRight);
    setInventory(newInventory);
    setTargetSum(newTarget);
    setIdealMoves(newIdeal);
    setMoves(0);
    setIsSolved(false);
    setLevel(targetLevel);
    setMode(currentMode);
  };

  const handleDragEnd = (_: any, info: any, item: WeightItem) => {
    const { x, y } = info.point;
    let addedTo: 'left' | 'right' | null = null;

    const checkTray = (ref: React.RefObject<HTMLDivElement | null>, setter: React.Dispatch<React.SetStateAction<WeightItem[]>>, side: 'left' | 'right') => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          setter(prev => [...prev, { ...item, id: Math.random().toString(36) }]);
          addedTo = side;
        }
      }
    };

    checkTray(leftTrayRef, setLeftWeights, 'left');
    if (!addedTo) checkTray(rightTrayRef, setRightWeights, 'right');
    
    if (addedTo) {
      if (inventory) setInventory(prev => prev ? prev.filter(w => w.id !== item.id) : null);
      if (mode !== 'free') setMoves(m => m + 1);
    }
  };

  const removeWeight = (item: WeightItem, side: 'left' | 'right') => {
    if (item.locked) return;
    if (side === 'left') setLeftWeights(prev => prev.filter(w => w.id !== item.id));
    else setRightWeights(prev => prev.filter(w => w.id !== item.id));

    if (inventory !== null) setInventory(prev => prev ? [...prev, item] : null);
    if (mode !== 'free') setMoves(m => m + 1);
  };

  return (
    <div className="game-container">
      <div className="mode-selector">
        <button className={`btn btn-secondary ${mode === 'free' ? 'btn-active' : ''}`} onClick={() => {setMode('free'); setInventory(null); setTargetSum(null); setLeftWeights([]); setRightWeights([]);}}>Free Play</button>
        <button className={`btn btn-primary ${mode === 'challenge' ? 'btn-active' : ''}`} onClick={() => startNewChallenge(1, 'challenge')}>Challenge</button>
      </div>

      <div className="spawner-area">
        <AnimatePresence>
          {inventory ? inventory.map(item => (
            <div key={item.id}><Weight item={item} onDragEnd={(e, info) => handleDragEnd(e, info, item)} isStatic={false} /></div>
          )) : Array.from({ length: 10 }, (_, i) => i + 1).map(val => (
            <div key={val}><Weight item={{ id: `t-${val}`, value: val, color: COLORS[val-1] }} onDragEnd={(e, info) => handleDragEnd(e, info, { id: 'temp', value: val, color: COLORS[val-1] })} isStatic={false} /></div>
          ))}
        </AnimatePresence>
      </div>

      {mode === 'challenge' && (
        <div className="stats-panel">
          <span className="level-badge">LVL {level}</span>
          <h2 style={{fontSize:'1.1rem', margin:'10px 0', color:'#e65100'}}>MYSTERY CHALLENGE!</h2>
          {isSolved ? (
            <div>
              <div style={{fontSize:'1.8rem', margin:'5px 0'}}> {Array.from({length:3}).map((_,i)=><span key={i} style={{color:i<stars?'#ffd700':'#ccc'}}>⭐</span>)} </div>
              <button className="btn btn-primary" onClick={() => startNewChallenge(level + 1, mode)}>Next ➔</button>
            </div>
          ) : (
            <p style={{margin:0, fontSize:'1rem'}}>Moves: <span style={{color:'#2196f3'}}>{moves}</span> (Best: {idealMoves})</p>
          )}
        </div>
      )}

      <div className="scale-system">
        <div className="pivot" />
        <motion.div className="beam-container" animate={{ rotate: angle }} transition={{ type: 'spring', stiffness: 40, damping: 12 }}>
          {targetSum && <div className="target-display">Target: {targetSum}</div>}
          <div className="beam">
            <div className="tray-container" style={{ left: -140 }}>
              <div className="string" />
              <motion.div ref={leftTrayRef} className={`tray ${isSolved ? 'success-glow' : ''}`} animate={{ rotate: -angle }}>
                <AnimatePresence>{leftWeights.map(w => (
                  <motion.div key={w.id} layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                    <Weight item={w} isStatic={true} isSolved={isSolved} onClick={() => removeWeight(w, 'left')} />
                  </motion.div>
                ))}</AnimatePresence>
              </motion.div>
              {mode === 'challenge' && <div style={{fontWeight:'bold', color:'#5d4037', marginTop:5, fontSize:'1.2rem'}}>{leftHasMystery ? '?' : leftSum}</div>}
            </div>

            <div className="tray-container" style={{ right: -140 }}>
              <div className="string" />
              <motion.div ref={rightTrayRef} className={`tray ${isSolved ? 'success-glow' : ''}`} animate={{ rotate: -angle }}>
                <AnimatePresence>{rightWeights.map(w => (
                  <motion.div key={w.id} layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                    <Weight item={w} isStatic={true} isSolved={isSolved} onClick={() => removeWeight(w, 'right')} />
                  </motion.div>
                ))}</AnimatePresence>
              </motion.div>
              {mode === 'challenge' && <div style={{fontWeight:'bold', color:'#5d4037', marginTop:5, fontSize:'1.2rem'}}>{rightHasMystery ? '?' : rightSum}</div>}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
