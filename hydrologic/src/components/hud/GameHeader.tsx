import React from 'react';
import { useGameStore } from '@/store/gameStore';
import {
  RotateCcw,
  Lightbulb,
  Compass,
  Volume2,
  VolumeX,
  Binary,
  Droplets,
  HelpCircle,
} from 'lucide-react';

export const GameHeader: React.FC = () => {
  const activeLevel = useGameStore(s => s.activeLevel);
  const currentLevelIndex = useGameStore(s => s.currentLevelIndex);
  const stepCount = useGameStore(s => s.stepCount);
  const resetCurrentLevel = useGameStore(s => s.resetCurrentLevel);
  const setLevelSelectOpen = useGameStore(s => s.setLevelSelectOpen);
  const soundEnabled = useGameStore(s => s.soundEnabled);
  const setSoundEnabled = useGameStore(s => s.setSoundEnabled);
  const showLogicBadges = useGameStore(s => s.showLogicBadges);
  const setShowLogicBadges = useGameStore(s => s.setShowLogicBadges);
  const requestHint = useGameStore(s => s.requestHint);
  const activeHint = useGameStore(s => s.activeHint);

  const tierColors: Record<number, string> = {
    1: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    2: 'bg-ocean-500/20 text-ocean-300 border-ocean-500/30',
    3: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };

  return (
    <header className="w-full bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
      {/* Brand & Level Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-ocean-600 to-ocean-400 flex items-center justify-center text-white shadow-md shadow-ocean-500/20">
            <Droplets className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="font-bold text-base text-slate-100 tracking-wide">
              HydroLogic
            </h1>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-ocean-400 font-bold">
                LV {String(currentLevelIndex + 1).padStart(2, '0')}
              </span>
              <span className="text-slate-400 font-medium truncate max-w-[160px] sm:max-w-[240px]">
                {activeLevel.title}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${tierColors[activeLevel.tier]}`}>
                Tier {activeLevel.tier}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Center Step Counter */}
      <div className="flex items-center gap-4 text-xs">
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-1.5 flex items-center gap-2 font-mono">
          <span className="text-slate-400">Steps:</span>
          <span className="font-bold text-ocean-300 text-sm">{stepCount}</span>
          <span className="text-slate-600">/ Par {activeLevel.parSteps ?? 2}</span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Reset Button */}
        <button
          onClick={() => resetCurrentLevel()}
          title="Reset Level"
          className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Hint Button */}
        <button
          onClick={() => requestHint()}
          title="Get Logic Hint"
          className={`p-2 rounded-xl border transition-all ${
            activeHint
              ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/20'
              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
          }`}
        >
          <Lightbulb className="w-4 h-4" />
        </button>

        {/* Logic 0/1 Badges Toggle */}
        <button
          onClick={() => setShowLogicBadges(!showLogicBadges)}
          title="Toggle 0/1 Logic Badges"
          className={`p-2 rounded-xl border transition-all ${
            showLogicBadges
              ? 'bg-ocean-500/20 border-ocean-500 text-ocean-300'
              : 'bg-slate-800/80 text-slate-500 border-slate-700'
          }`}
        >
          <Binary className="w-4 h-4" />
        </button>

        {/* Sound Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Mute Sound' : 'Unmute Sound'}
          className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
        </button>

        {/* Level Map Button */}
        <button
          onClick={() => setLevelSelectOpen(true)}
          className="px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Compass className="w-4 h-4 text-ocean-400" />
          <span>Levels</span>
        </button>
      </div>

      {/* Active Hint Banner */}
      {activeHint && (
        <div className="w-full bg-amber-950/60 border border-amber-500/50 rounded-xl p-2.5 px-4 text-xs text-amber-200 flex items-center justify-between animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{activeHint.explanation}</span>
          </div>
          <span className="text-[10px] font-mono text-amber-400/80 uppercase">AI Solver Hint</span>
        </div>
      )}
    </header>
  );
};
