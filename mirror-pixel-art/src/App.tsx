import React, { useState, useEffect, useMemo } from 'react';
import { LEVELS } from './levels';
import { type Level, type Difficulty, type SymmetryType } from './types';
import { checkGridCompletion, getHintCell, isTemplateArea, getMirrorCell, getMirroredShape } from './utils/gameLogic';
import confetti from 'canvas-confetti';
import { Trophy, Award, Palette, Eraser, RotateCcw, Lightbulb, CheckCircle2, ChevronRight, Layout } from 'lucide-react';
import './App.css';

const getInitialProgress = () => {
  try {
    const data = localStorage.getItem('mirror-pixel-art-v2');
    if (!data) return { completedLevels: [], totalScore: 0 };
    const parsed = JSON.parse(data);
    return {
      completedLevels: Array.isArray(parsed.completedLevels) ? parsed.completedLevels : [],
      totalScore: typeof parsed.totalScore === 'number' ? parsed.totalScore : 0
    };
  } catch (e) {
    console.error("Failed to load progress:", e);
    return { completedLevels: [], totalScore: 0 };
  }
};

const INITIAL_PROGRESS = getInitialProgress();

const App: React.FC = () => {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const filteredLevels = useMemo(() => LEVELS.filter(l => l.difficulty === difficulty), [difficulty]);
  
  const [currentLevel, setCurrentLevel] = useState<Level>(filteredLevels[0]);
  const [userGrid, setUserGrid] = useState<(string | null)[][]>(() => 
    Array(LEVELS[0].height).fill(null).map(() => Array(LEVELS[0].width).fill(null))
  );
  const [history, setHistory] = useState<(string | null)[][][]>([]);
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(0);
  const [completedLevels, setCompletedLevels] = useState<string[]>(INITIAL_PROGRESS.completedLevels);
  const [totalScore, setTotalScore] = useState<number>(INITIAL_PROGRESS.totalScore);
  const [isPerfect, setIsPerfect] = useState(false);
  const [isEasyMode, setIsEasyMode] = useState(false);
  const [inputBuffer, setInputBuffer] = useState('');
  const [hoveredCell, setHoveredCell] = useState<{ r: number, c: number } | null>(null);
  const [animatingCell, setAnimCell] = useState<{ r: number, c: number, type: 'pulse' | 'jelly' | 'hint' } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEasyMode(false);
        return;
      }
      const char = e.key.toLowerCase();
      if (/^[a-z]$/.test(char)) {
        setInputBuffer(prev => {
          const newBuffer = (prev + char).slice(-4);
          if (newBuffer === 'easy') {
            setIsEasyMode(true);
          }
          return newBuffer;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activePalette = useMemo(() => {
    const usedIndices = new Set<number>();
    currentLevel.pattern.forEach(row => {
      row.forEach(cell => {
        if (cell !== null) usedIndices.add(cell);
      });
    });
    
    // Sort indices
    const sortedIndices = Array.from(usedIndices).sort((a, b) => a - b);
    return sortedIndices.map(idx => ({
      index: idx,
      color: currentLevel.palette[idx]
    }));
  }, [currentLevel]);

  useEffect(() => {
    localStorage.setItem('mirror-pixel-art-v2', JSON.stringify({ completedLevels, totalScore }));
  }, [completedLevels, totalScore]);

  useEffect(() => {
    if (activePalette.length > 0 && (selectedColorIndex === null || !activePalette.some(p => p.index === selectedColorIndex))) {
      setSelectedColorIndex(activePalette[0].index);
    }
  }, [activePalette, selectedColorIndex]);

  const changeLevel = (level: Level) => {
    setCurrentLevel(level);
    setUserGrid(Array(level.height).fill(null).map(() => Array(level.width).fill(null)));
    setHistory([]);
    setIsPerfect(false);
    setAnimCell(null);
    setHoveredCell(null);
  };

  const handleDifficultyChange = (d: Difficulty) => {
    setDifficulty(d);
    const firstOfDiff = LEVELS.find(l => l.difficulty === d);
    if (firstOfDiff) changeLevel(firstOfDiff);
  };

  const stats = useMemo(() => checkGridCompletion(userGrid, currentLevel), [userGrid, currentLevel]);

  const handleCellClick = (r: number, c: number) => {
    if (isPerfect) return;
    if (isTemplateArea(r, c, currentLevel)) return; 

    setHistory(prev => [userGrid.map(row => [...row]), ...prev].slice(0, 20));

    const newGrid = userGrid.map((row, rowIdx) => {
        if (rowIdx !== r) return row;
        const newRow = [...row];
        const newColor = selectedColorIndex !== null ? currentLevel.palette[selectedColorIndex] : null;
        newRow[c] = (newRow[c] === newColor) ? null : newColor;
        return newRow;
    });

    const mirror = getMirrorCell(r, c, currentLevel);
    const targetIdx = currentLevel.pattern[mirror.r][mirror.c];
    const targetColor = targetIdx !== null ? currentLevel.palette[targetIdx] : null;
    const placedColor = newGrid[r][c];

    if (placedColor !== null) {
        if (placedColor === targetColor) setAnimCell({ r, c, type: 'pulse' });
        else setAnimCell({ r, c, type: 'jelly' });
    }
    
    setUserGrid(newGrid);
    
    const result = checkGridCompletion(newGrid, currentLevel);
    if (result.isPerfect) {
      setIsPerfect(true);
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      if (!completedLevels.includes(currentLevel.id)) {
        setCompletedLevels(prev => [...prev, currentLevel.id]);
        setTotalScore(s => s + 100);
      }
    }
  };

  const undo = () => {
    if (history.length === 0) return;
    setUserGrid(history[0]);
    setHistory(history.slice(1));
  };

  const showHint = () => {
    const hint = getHintCell(userGrid, currentLevel);
    if (hint) {
        setAnimCell({ ...hint, type: 'hint' });
        setTotalScore(s => Math.max(0, s - 10)); 
        setTimeout(() => setAnimCell(null), 1000);
    }
  };

  const nextLevel = () => {
    const currentIndex = LEVELS.findIndex(l => l.id === currentLevel.id);
    const next = LEVELS[currentIndex + 1] || LEVELS[0];
    changeLevel(next);
    setDifficulty(next.difficulty);
  };

  const getCellColor = (r: number, c: number) => {
    if (isTemplateArea(r, c, currentLevel)) {
      const colorIdx = currentLevel.pattern[r][c];
      return colorIdx !== null ? currentLevel.palette[colorIdx] : 'transparent';
    }
    return userGrid[r]?.[c] || 'transparent';
  };

  const progressPercent = stats.totalRequired > 0 ? (stats.correctCount / stats.totalRequired) * 100 : 0;

  const getSymmetryLabel = (type: SymmetryType) => {
    switch(type) {
        case 'horizontal': return '左右鏡像';
        case 'vertical': return '上下鏡像';
        case 'diagonal-backslash': return '左斜鏡像';
        case 'diagonal-slash': return '右斜鏡像';
        default: return '';
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>鏡像小畫家 🎨</h1>
        <div className="stats-bar">
          <div className="stat-item"><Trophy className="icon-gold" /> 總分: {totalScore}</div>
          <div className="stat-item"><CheckCircle2 className="icon-green" /> 關卡: {completedLevels.length} / {LEVELS.length}</div>
        </div>
      </header>

      <div className="difficulty-tabs">
        {(['easy', 'normal', 'hard'] as Difficulty[]).map(d => (
          <button 
            key={d} 
            className={`tab ${difficulty === d ? 'active' : ''}`}
            onClick={() => handleDifficultyChange(d)}
          >
            {d === 'easy' ? '新手' : d === 'normal' ? '進階' : '挑戰'}
          </button>
        ))}
      </div>

      <div className="level-selector">
        {filteredLevels.map(l => (
          <div 
            key={l.id} 
            className={`level-card ${currentLevel.id === l.id ? 'active' : ''} ${completedLevels.includes(l.id) ? 'completed' : ''}`}
            onClick={() => changeLevel(l)}
          >
            {completedLevels.includes(l.id) && <CheckCircle2 size={12} className="card-check" />}
            <span className="level-name">{l.name}</span>
          </div>
        ))}
      </div>

      <div className="game-layout">
        <div className="game-main">
            <div className="level-info">
                <span className="symmetry-tag"><Layout size={14}/> {getSymmetryLabel(currentLevel.symmetryType)}</span>
                <div className="progress-indicator">
                    完成度: {stats.correctCount} / {stats.totalRequired}
                    <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                </div>
            </div>

            <div 
            className="grid-container" 
            style={{ 
                gridTemplateColumns: `repeat(${currentLevel.width}, 1fr)`,
                width: `clamp(280px, 85vw, ${currentLevel.width * 45}px)`
            }}
            onMouseLeave={() => setHoveredCell(null)}
            >
            <div className={`grid-divider divider-${currentLevel.symmetryType}`} />
            {Array(currentLevel.height).fill(0).map((_, r) => (
                Array(currentLevel.width).fill(0).map((_, c) => {
                const isTemplate = isTemplateArea(r, c, currentLevel);
                const mirror = getMirrorCell(r, c, currentLevel);
                const mirrorOfHovered = hoveredCell ? getMirrorCell(hoveredCell.r, hoveredCell.c, currentLevel) : null;
                
                const shouldHighlight = hoveredCell && (
                    (hoveredCell.r === r && hoveredCell.c === c) ||
                    (isEasyMode && isTemplate && r === mirrorOfHovered?.r && c === mirrorOfHovered?.c)
                );

                const isPulse = animatingCell?.r === r && animatingCell?.c === c && animatingCell.type === 'pulse';
                const isJelly = animatingCell?.r === r && animatingCell?.c === c && animatingCell.type === 'jelly';
                const isHint = animatingCell?.r === r && animatingCell?.c === c && animatingCell.type === 'hint';

                const getCellShapeClass = () => {
                  if (!currentLevel.shapes) return '';
                  const templateR = isTemplate ? r : mirror.r;
                  const templateC = isTemplate ? c : mirror.c;
                  const baseShape = currentLevel.shapes[templateR]?.[templateC] || 'square';
                  if (isTemplate) return baseShape === 'square' ? '' : baseShape;
                  const mirrored = getMirroredShape(baseShape, currentLevel.symmetryType);
                  return mirrored === 'square' ? '' : mirrored;
                };

                return (
                    <div
                    key={`${r}-${c}`}
                    className={`cell ${isTemplate ? 'cell-template' : ''} ${shouldHighlight ? 'hovered' : ''} ${isPulse ? 'pulse' : ''} ${isJelly ? 'jelly' : ''} ${isHint ? 'hint-flash' : ''} ${getCellShapeClass()}`}
                    style={{ backgroundColor: getCellColor(r, c) }}
                    onClick={() => {
                        handleCellClick(r, c);
                        setHoveredCell({ r, c });
                    }}
                    onMouseEnter={() => setHoveredCell({ r, c })}
                    />
                );
                })
            ))}
            </div>
        </div>

        <div className="toolbar">
            <div className="palette">
                {activePalette.map(({ index, color }) => (
                    <div 
                    key={color}
                    className={`color-swatch ${selectedColorIndex === index ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setSelectedColorIndex(index)}
                    />
                ))}
                <button 
                    className={`tool-btn ${selectedColorIndex === null ? 'active' : ''}`}
                    onClick={() => setSelectedColorIndex(null)}
                    title="橡皮擦"
                >
                    <Eraser size={24} />
                </button>
            </div>

            <div className="action-btns">
                <button className="tool-btn" onClick={undo} disabled={history.length === 0} title="復原">
                    <RotateCcw size={20} /> <span className="btn-text">復原</span>
                </button>
                <button className="tool-btn" onClick={showHint} title="提示 (-10分)">
                    <Lightbulb size={20} color="#FFCA3A" /> <span className="btn-text">提示</span>
                </button>
            </div>
        </div>

        <div className="badge-container">
          {completedLevels.length >= 1 && <div className="badge"><Award size={16} /> 繪畫小天才</div>}
          {completedLevels.length >= 5 && <div className="badge"><Award size={16} /> 對稱大師</div>}
          {totalScore >= 1000 && <div className="badge"><Palette size={16} /> 色彩藝術家</div>}
        </div>
      </div>

      {isPerfect && (
        <div className="perfect-overlay">
          <h2>Perfect! 🌟</h2>
          <p>太棒了！你完成了一個完美的對稱圖案！</p>
          <button className="btn-next" onClick={nextLevel}>
            下一關 <ChevronRight size={24} />
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
