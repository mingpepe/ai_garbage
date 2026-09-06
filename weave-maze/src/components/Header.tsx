import React from 'react';
import { Volume2, VolumeX, HelpCircle, Sparkles, RefreshCw, Layers, Lock, Unlock } from 'lucide-react';
import { LayerType } from '../types/maze';

interface HeaderProps {
  currentLayer: LayerType;
  stepCount: number;
  bridgeCrossCount: number;
  timeSec: number;
  soundEnabled: boolean;
  isEngineeringMode: boolean;
  onToggleSound: () => void;
  onRequestEngineeringMode: () => void;
  onOpenHelp: () => void;
  onResetPosition: () => void;
  onNewMaze: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentLayer,
  stepCount,
  bridgeCrossCount,
  timeSec,
  soundEnabled,
  isEngineeringMode,
  onToggleSound,
  onRequestEngineeringMode,
  onOpenHelp,
  onResetPosition,
  onNewMaze,
}) => {
  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <header className="w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg z-20">
      {/* Title & Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/20 animate-bounceSmall">
          🐸
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg md:text-xl font-bold tracking-wide text-white flex items-center gap-1.5">
              立體立交迷宮
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                Weave Maze
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            高架橋與地下涵洞的繪本迷宮冒險
          </p>
        </div>
      </div>

      {/* Live Stats */}
      <div className="flex items-center flex-wrap gap-2 md:gap-3 text-xs md:text-sm">
        {/* Layer Badge */}
        <div
          className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 transition-colors duration-300 ${
            currentLayer === 'BRIDGE'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20'
              : currentLayer === 'TUNNEL'
              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/20'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>
            {currentLayer === 'BRIDGE'
              ? '🌉 上層高架橋'
              : currentLayer === 'TUNNEL'
              ? '🚇 下層涵洞'
              : '🌱 地面道路'}
          </span>
        </div>

        {/* Timer */}
        <div className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/80 rounded-lg text-slate-300 flex items-center gap-1.5 font-mono">
          <span className="text-slate-400">⏱️</span>
          <span>{formatTime(timeSec)}</span>
        </div>

        {/* Steps */}
        <div className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/80 rounded-lg text-slate-300 flex items-center gap-1.5 font-mono">
          <span className="text-slate-400">👣</span>
          <span>{stepCount} 步</span>
        </div>

        {/* Bridges Crossed */}
        <div className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/80 rounded-lg text-amber-300 flex items-center gap-1.5 font-mono">
          <span>🌉</span>
          <span>{bridgeCrossCount} 次立交</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5">
        {/* Engineering Mode Button with Lock/Unlock icon */}
        <button
          onClick={onRequestEngineeringMode}
          title={
            isEngineeringMode
              ? '離開並重新鎖定工程模式 (快捷鍵: Esc)'
              : '輸入密碼解鎖工程模式 (查看解答/速度調節/拓撲數據)'
          }
          className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5 ${
            isEngineeringMode
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm shadow-purple-500/20 font-bold'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
        >
          {isEngineeringMode ? (
            <Unlock className="w-3.5 h-3.5 text-purple-400" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span className="hidden sm:inline">工程模式</span>
        </button>

        {/* Sound Toggle */}
        <button
          onClick={onToggleSound}
          title={soundEnabled ? '靜音 (Mute)' : '開啟音效 (Unmute)'}
          className={`p-2 rounded-xl border transition-all ${
            soundEnabled
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Reset Position */}
        <button
          onClick={onResetPosition}
          title="重置角色回起點"
          className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl transition-all flex items-center gap-1 text-xs"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">回起點</span>
        </button>

        {/* New Maze */}
        <button
          onClick={onNewMaze}
          title="生成新迷宮"
          className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-xl shadow-md shadow-emerald-900/30 transition-all flex items-center gap-1 text-xs"
        >
          <Sparkles className="w-4 h-4" />
          <span>新迷宮</span>
        </button>

        {/* Help */}
        <button
          onClick={onOpenHelp}
          title="遊戲玩法說明"
          className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl transition-all"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
