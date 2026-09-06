import React, { useState } from 'react';
import {
  Settings,
  Sparkles,
  Eye,
  EyeOff,
  Sliders,
  Compass,
  Footprints,
  ChevronDown,
  ChevronUp,
  Wrench,
  Activity,
  Gauge,
} from 'lucide-react';
import { DifficultyId, DifficultyPreset } from '../types/maze';

export const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  { id: 'easy', name: '入門 (Easy)', width: 8, height: 8, defaultWeaveProb: 0.45, icon: '🌱' },
  { id: 'medium', name: '進階 (Medium)', width: 14, height: 14, defaultWeaveProb: 0.6, icon: '🌲' },
  { id: 'hard', name: '大師 (Hard)', width: 22, height: 22, defaultWeaveProb: 0.75, icon: '🔥' },
  { id: 'expert', name: '極限 (Expert)', width: 30, height: 30, defaultWeaveProb: 0.85, icon: '⚡' },
];

interface ControlPanelProps {
  currentDifficulty: DifficultyId;
  customWidth: number;
  customHeight: number;
  weaveProb: number;
  braidFactor: number;
  moveSpeed: number;
  showSolution: boolean;
  showTrail: boolean;
  totalBridgesInMaze: number;
  isCustomSize: boolean;
  isEngineeringMode: boolean;
  solutionStepsCount: number;
  onSelectDifficulty: (preset: DifficultyPreset) => void;
  onChangeCustomSize: (w: number, h: number) => void;
  onChangeWeaveProb: (prob: number) => void;
  onChangeBraidFactor: (factor: number) => void;
  onChangeMoveSpeed: (speed: number) => void;
  onToggleSolution: () => void;
  onToggleTrail: () => void;
  onGenerateNewMaze: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  currentDifficulty,
  customWidth,
  customHeight,
  weaveProb,
  braidFactor,
  moveSpeed,
  showSolution,
  showTrail,
  totalBridgesInMaze,
  isCustomSize,
  isEngineeringMode,
  solutionStepsCount,
  onSelectDifficulty,
  onChangeCustomSize,
  onChangeWeaveProb,
  onChangeBraidFactor,
  onChangeMoveSpeed,
  onToggleSolution,
  onToggleTrail,
  onGenerateNewMaze,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`bg-slate-900/95 backdrop-blur-md border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col transition-all duration-300 shadow-2xl z-10 ${
        isCollapsed ? 'h-14 lg:h-full lg:w-14' : 'h-auto max-h-[50vh] lg:max-h-full lg:w-80 overflow-y-auto'
      }`}
    >
      {/* Header bar / toggle collapse */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-400" />
          {!isCollapsed && (
            <span className="font-bold text-sm tracking-wide text-white">迷宮控制台 (Controls)</span>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
          title={isCollapsed ? '展開控制台' : '收合控制台'}
        >
          {isCollapsed ? <ChevronUp className="w-4 h-4 lg:rotate-90" /> : <ChevronDown className="w-4 h-4 lg:-rotate-90" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-4 space-y-5 text-slate-200 text-xs md:text-sm">
          {/* Main Action Button */}
          <button
            onClick={onGenerateNewMaze}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>重新生成迷宮 (New Maze)</span>
          </button>

          {/* Difficulty Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                難度尺寸預設 (Difficulty)
              </span>
              <span className="text-emerald-400 font-mono">
                {customWidth} × {customHeight}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {DIFFICULTY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => onSelectDifficulty(preset)}
                  className={`px-3 py-2 rounded-xl text-left border transition-all text-xs flex items-center justify-between ${
                    currentDifficulty === preset.id && !isCustomSize
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold shadow-sm'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span>{preset.icon}</span>
                    <span>{preset.name}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {preset.width}x{preset.height}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Grid Dimension Sliders */}
          <div className="space-y-3 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">迷宮寬度 (Columns):</span>
                <span className="font-mono text-emerald-400 font-bold">{customWidth}</span>
              </div>
              <input
                type="range"
                min={5}
                max={35}
                value={customWidth}
                onChange={(e) => onChangeCustomSize(Number(e.target.value), customHeight)}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">迷宮高度 (Rows):</span>
                <span className="font-mono text-emerald-400 font-bold">{customHeight}</span>
              </div>
              <input
                type="range"
                min={5}
                max={35}
                value={customHeight}
                onChange={(e) => onChangeCustomSize(customWidth, Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
              />
            </div>
          </div>

          {/* Weave Overlap Rate Slider */}
          <div className="space-y-2 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300 flex items-center gap-1 font-medium">
                <span>🌉</span>
                立體重疊率 (Weave Rate):
              </span>
              <span className="font-mono text-amber-400 font-bold">
                {Math.round(weaveProb * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(weaveProb * 100)}
              onChange={(e) => onChangeWeaveProb(Number(e.target.value) / 100)}
              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>0% (平面)</span>
              <span className="text-amber-300 font-medium">現有 {totalBridgesInMaze} 座立交橋</span>
              <span>100% (極限立體)</span>
            </div>
          </div>

          {/* Trail Toggle */}
          <button
            onClick={onToggleTrail}
            className={`w-full px-3 py-2.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between ${
              showTrail
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Footprints className="w-4 h-4" />
              <span>行走軌跡足跡 (Breadcrumbs)</span>
            </span>
            <span className="text-xs font-bold">{showTrail ? '開' : '關'}</span>
          </button>

          {/* ENGINEERING MODE SECTION (Only visible in Engineering Mode) */}
          {isEngineeringMode && (
            <div className="space-y-3 bg-purple-950/40 p-3.5 rounded-2xl border border-purple-500/40 animate-fade-in">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                <Wrench className="w-4 h-4 text-purple-400" />
                <span>工程模式 (Engineering / Dev Mode)</span>
              </div>

              {/* Movement Speed Slider (Moved inside Engineering Mode) */}
              <div className="space-y-2 bg-slate-900/80 p-3 rounded-xl border border-purple-500/30">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-200 flex items-center gap-1.5 font-medium">
                    <Gauge className="w-3.5 h-3.5 text-purple-400" />
                    移動速度 (Move Speed):
                  </span>
                  <span className="font-mono text-purple-300 font-bold">
                    {moveSpeed.toFixed(1)} 格/秒
                  </span>
                </div>
                <input
                  type="range"
                  min={1.5}
                  max={6.5}
                  step={0.1}
                  value={moveSpeed}
                  onChange={(e) => onChangeMoveSpeed(Number(e.target.value))}
                  className="w-full accent-purple-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>慢速 (1.5)</span>
                  <span className="text-purple-300 font-medium">
                    {moveSpeed <= 2.5 ? '緩慢悠閒' : moveSpeed <= 4.0 ? '舒適平穩' : '敏捷快速'}
                  </span>
                  <span>快速 (6.5)</span>
                </div>
              </div>

              {/* Solution Path Toggle */}
              <button
                onClick={onToggleSolution}
                className={`w-full py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  showSolution
                    ? 'bg-pink-500/30 border-pink-500 text-pink-200 shadow-md shadow-pink-500/20'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
              >
                {showSolution ? <EyeOff className="w-4 h-4 text-pink-300" /> : <Eye className="w-4 h-4 text-pink-400" />}
                <span>{showSolution ? '隱藏最佳解答路徑' : '顯示最佳解答路徑 (Solution)'}</span>
              </button>

              {/* Braid Factor Slider */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-200 flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-purple-400" />
                    環狀通路率 (Braid Factor):
                  </span>
                  <span className="font-mono text-purple-300 font-bold">
                    {Math.round(braidFactor * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={Math.round(braidFactor * 100)}
                  onChange={(e) => onChangeBraidFactor(Number(e.target.value) / 100)}
                  className="w-full accent-purple-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                />
              </div>

              {/* Graph Metrics */}
              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-purple-500/20 space-y-1 text-[11px] font-mono text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-emerald-400" />
                    迷宮節點總數:
                  </span>
                  <span className="text-emerald-400 font-bold">{customWidth * customHeight}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">立體交叉節點:</span>
                  <span className="text-amber-400 font-bold">{totalBridgesInMaze}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">最優解路徑長度:</span>
                  <span className="text-pink-400 font-bold">{solutionStepsCount} 步</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
