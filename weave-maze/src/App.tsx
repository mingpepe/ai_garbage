import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DifficultyId,
  DifficultyPreset,
  Direction,
  LayerType,
  MazeData,
  PlayerState,
  Position,
} from './types/maze';
import { generateWeaveMaze } from './utils/mazeGenerator';
import { solveMaze, PathStep } from './utils/mazeSolver';
import { soundManager } from './utils/audio';

import { Header } from './components/Header';
import { CanvasMaze } from './components/CanvasMaze';
import { ControlPanel } from './components/ControlPanel';
import { VictoryModal } from './components/VictoryModal';
import { InstructionsModal } from './components/InstructionsModal';
import { PasswordModal } from './components/PasswordModal';

export const App: React.FC = () => {
  // Config & Difficulty State
  const [difficulty, setDifficulty] = useState<DifficultyId>('easy');
  const [customWidth, setCustomWidth] = useState<number>(8);
  const [customHeight, setCustomHeight] = useState<number>(8);
  const [isCustomSize, setIsCustomSize] = useState<boolean>(false);
  const [weaveProb, setWeaveProb] = useState<number>(0.55);
  const [braidFactor, setBraidFactor] = useState<number>(0.0);
  const [moveSpeed, setMoveSpeed] = useState<number>(3.5); // Default comfortable speed (cells/sec)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Engineering Mode & Password Protection
  const [isEngineeringMode, setIsEngineeringMode] = useState<boolean>(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);

  // Maze & Path State
  const [maze, setMaze] = useState<MazeData>(() =>
    generateWeaveMaze({ width: 8, height: 8, weaveProbability: 0.55, braidFactor: 0.0 })
  );
  const [solutionPath, setSolutionPath] = useState<PathStep[] | null>(null);
  const [showSolution, setShowSolution] = useState<boolean>(false);
  const [showTrail, setShowTrail] = useState<boolean>(true);
  const [isVantageFogEnabled, setIsVantageFogEnabled] = useState<boolean>(true);

  // Player State
  const [player, setPlayer] = useState<PlayerState>({
    gridX: 0,
    gridY: 0,
    exactX: 0,
    exactY: 0,
    targetX: 0,
    targetY: 0,
    lastDir: Direction.NONE,
    currentLayer: 'GROUND',
    facingAngle: 0,
    isMoving: false,
  });
  const [currentLayer, setCurrentLayer] = useState<LayerType>('GROUND');
  const [visitedTrail, setVisitedTrail] = useState<Position[]>([{ x: 0, y: 0 }]);
  const [heldDir, setHeldDir] = useState<Direction>(Direction.NONE);

  // Gameplay & Live Stats
  const [stepCount, setStepCount] = useState<number>(0);
  const [bridgeCrossCount, setBridgeCrossCount] = useState<number>(0);
  const [timeSec, setTimeSec] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [isWon, setIsWon] = useState<boolean>(false);

  // Modals
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isVictoryModalOpen, setIsVictoryModalOpen] = useState<boolean>(false);

  const activeKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sol = solveMaze(maze);
    setSolutionPath(sol);
  }, [maze]);

  useEffect(() => {
    let interval: number;
    if (isTimerRunning && !isWon) {
      interval = window.setInterval(() => {
        setTimeSec((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, isWon]);

  const handleStepIncrement = useCallback(() => {
    setIsTimerRunning(true);
    setStepCount((prev) => prev + 1);
  }, []);

  const handleBridgeCross = useCallback(() => {
    setBridgeCrossCount((prev) => prev + 1);
  }, []);

  const handleGenerateNewMaze = useCallback(
    (w?: number, h?: number, prob?: number, braid?: number) => {
      const width = w ?? customWidth;
      const height = h ?? customHeight;
      const wp = prob ?? weaveProb;
      const bf = braid ?? braidFactor;

      const newMaze = generateWeaveMaze({
        width,
        height,
        weaveProbability: wp,
        braidFactor: bf,
      });

      setMaze(newMaze);
      setPlayer({
        gridX: newMaze.start.x,
        gridY: newMaze.start.y,
        exactX: newMaze.start.x,
        exactY: newMaze.start.y,
        targetX: newMaze.start.x,
        targetY: newMaze.start.y,
        lastDir: Direction.NONE,
        currentLayer: 'GROUND',
        facingAngle: 0,
        isMoving: false,
      });
      setCurrentLayer('GROUND');
      setVisitedTrail([{ x: newMaze.start.x, y: newMaze.start.y }]);
      setHeldDir(Direction.NONE);
      activeKeysRef.current.clear();
      setStepCount(0);
      setBridgeCrossCount(0);
      setTimeSec(0);
      setIsTimerRunning(false);
      setIsWon(false);
      setIsVictoryModalOpen(false);
      soundManager.playClick();
    },
    [customWidth, customHeight, weaveProb, braidFactor]
  );

  const handleResetPosition = useCallback(() => {
    setPlayer({
      gridX: maze.start.x,
      gridY: maze.start.y,
      exactX: maze.start.x,
      exactY: maze.start.y,
      targetX: maze.start.x,
      targetY: maze.start.y,
      lastDir: Direction.NONE,
      currentLayer: 'GROUND',
      facingAngle: 0,
      isMoving: false,
    });
    setCurrentLayer('GROUND');
    setVisitedTrail([{ x: maze.start.x, y: maze.start.y }]);
    setHeldDir(Direction.NONE);
    activeKeysRef.current.clear();
    setStepCount(0);
    setBridgeCrossCount(0);
    setTimeSec(0);
    setIsTimerRunning(false);
    setIsWon(false);
    setIsVictoryModalOpen(false);
    soundManager.playClick();
  }, [maze]);

  const handleWin = useCallback(() => {
    setIsWon(true);
    setIsTimerRunning(false);
    setHeldDir(Direction.NONE);
    activeKeysRef.current.clear();
    soundManager.playVictory();
    setTimeout(() => {
      setIsVictoryModalOpen(true);
    }, 350);
  }, []);

  const updateHeldDirection = useCallback(() => {
    const keys = activeKeysRef.current;
    if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) {
      setHeldDir(Direction.NORTH);
    } else if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
      setHeldDir(Direction.EAST);
    } else if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) {
      setHeldDir(Direction.SOUTH);
    } else if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
      setHeldDir(Direction.WEST);
    } else {
      setHeldDir(Direction.NONE);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape key: close modals or exit engineering mode
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (isPasswordModalOpen) {
          setIsPasswordModalOpen(false);
          return;
        }
        if (isHelpOpen) {
          setIsHelpOpen(false);
          return;
        }
        if (isVictoryModalOpen) {
          setIsVictoryModalOpen(false);
          return;
        }
        if (isEngineeringMode) {
          setIsEngineeringMode(false);
          setShowSolution(false);
          return;
        }
      }

      if (e.target instanceof HTMLInputElement || isHelpOpen || isVictoryModalOpen || isPasswordModalOpen) return;

      if (e.key === 'r' || e.key === 'R') {
        handleResetPosition();
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 's', 'S', 'a', 'A', 'd', 'D'].includes(e.key)) {
        e.preventDefault();
        activeKeysRef.current.add(e.key);
        updateHeldDirection();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 's', 'S', 'a', 'A', 'd', 'D'].includes(e.key)) {
        activeKeysRef.current.delete(e.key);
        updateHeldDirection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isHelpOpen, isVictoryModalOpen, isPasswordModalOpen, isEngineeringMode, handleResetPosition, updateHeldDirection]);

  const handleRequestEngineeringMode = () => {
    if (!isEngineeringMode) {
      setIsPasswordModalOpen(true);
    } else {
      // Exit and relock engineering mode
      setIsEngineeringMode(false);
      setShowSolution(false);
    }
  };

  const handlePasswordSuccess = () => {
    setIsEngineeringMode(true);
    setIsPasswordModalOpen(false);
  };

  const handleSelectDifficulty = (preset: DifficultyPreset) => {
    setDifficulty(preset.id);
    setCustomWidth(preset.width);
    setCustomHeight(preset.height);
    setWeaveProb(preset.defaultWeaveProb);
    setIsCustomSize(false);
    handleGenerateNewMaze(preset.width, preset.height, preset.defaultWeaveProb, braidFactor);
  };

  const handleChangeCustomSize = (w: number, h: number) => {
    setCustomWidth(w);
    setCustomHeight(h);
    setIsCustomSize(true);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundManager.setEnabled(next);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 select-none text-slate-100">
      {/* Top Navigation Header */}
      <Header
        currentLayer={currentLayer}
        stepCount={stepCount}
        bridgeCrossCount={bridgeCrossCount}
        timeSec={timeSec}
        soundEnabled={soundEnabled}
        isEngineeringMode={isEngineeringMode}
        onToggleSound={handleToggleSound}
        onRequestEngineeringMode={handleRequestEngineeringMode}
        onOpenHelp={() => setIsHelpOpen(true)}
        onResetPosition={handleResetPosition}
        onNewMaze={() => handleGenerateNewMaze()}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Canvas Maze Viewport */}
        <main className="flex-1 relative flex items-center justify-center overflow-hidden bg-slate-950">
          <CanvasMaze
            maze={maze}
            player={player}
            onLayerChange={setCurrentLayer}
            visitedTrail={showTrail ? visitedTrail : []}
            setVisitedTrail={setVisitedTrail}
            solutionPath={solutionPath}
            showSolution={isEngineeringMode && showSolution}
            moveSpeed={moveSpeed}
            onWin={handleWin}
            onStepIncrement={handleStepIncrement}
            onBridgeCross={handleBridgeCross}
            isWon={isWon}
            heldDir={heldDir}
            isVantageFogEnabled={isVantageFogEnabled}
          />

          {/* Floating Quick Layer Status Badge with Vantage Highlighting */}
          <div className="absolute top-4 left-4 z-10 pointer-events-none">
            <div
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border backdrop-blur-md shadow-xl transition-all duration-300 flex items-center gap-2 ${
                currentLayer === 'BRIDGE'
                  ? 'bg-amber-500/30 text-amber-200 border-amber-400/70 shadow-amber-500/25 ring-2 ring-amber-400/30 animate-pulse'
                  : currentLayer === 'TUNNEL'
                  ? 'bg-indigo-500/30 text-indigo-200 border-indigo-500/50 shadow-indigo-500/20'
                  : 'bg-slate-900/70 text-slate-300 border-slate-700/60'
              }`}
            >
              {currentLayer === 'BRIDGE' && (
                <>
                  <span className="text-sm">🔭</span>
                  <span>正在高架橋制高點 · 全景遠眺中</span>
                </>
              )}
              {currentLayer === 'TUNNEL' && (
                <>
                  <span className="text-sm">🚇</span>
                  <span>正在地下涵洞穿越 · 陰影微光</span>
                </>
              )}
              {currentLayer === 'GROUND' && (
                <>
                  <span className="text-sm">🌱</span>
                  <span>地面花園小徑 · 樹籬探索中</span>
                </>
              )}
            </div>
          </div>
        </main>

        {/* Right Sidebar Control Panel */}
        <ControlPanel
          currentDifficulty={difficulty}
          customWidth={customWidth}
          customHeight={customHeight}
          weaveProb={weaveProb}
          braidFactor={braidFactor}
          moveSpeed={moveSpeed}
          showSolution={showSolution}
          showTrail={showTrail}
          totalBridgesInMaze={maze.weaveCount}
          isCustomSize={isCustomSize}
          isEngineeringMode={isEngineeringMode}
          solutionStepsCount={solutionPath ? solutionPath.length - 1 : 0}
          isVantageFogEnabled={isVantageFogEnabled}
          onSelectDifficulty={handleSelectDifficulty}
          onChangeCustomSize={handleChangeCustomSize}
          onChangeWeaveProb={setWeaveProb}
          onChangeBraidFactor={setBraidFactor}
          onChangeMoveSpeed={setMoveSpeed}
          onToggleSolution={() => setShowSolution((prev) => !prev)}
          onToggleTrail={() => setShowTrail((prev) => !prev)}
          onToggleVantageFog={() => setIsVantageFogEnabled((prev) => !prev)}
          onGenerateNewMaze={() => handleGenerateNewMaze()}
        />
      </div>

      {/* Password Modal for Engineering Mode */}
      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={handlePasswordSuccess}
      />

      {/* Instructions / Help Modal */}
      <InstructionsModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Victory Celebration Modal */}
      <VictoryModal
        isOpen={isVictoryModalOpen}
        timeSec={timeSec}
        stepCount={stepCount}
        optimalSteps={solutionPath ? solutionPath.length - 1 : 0}
        bridgeCrossCount={bridgeCrossCount}
        onPlayAgain={handleResetPosition}
        onNextLevel={() => handleGenerateNewMaze()}
      />
    </div>
  );
};
