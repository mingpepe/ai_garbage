import React, { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { GameHeader } from '@/components/hud/GameHeader';
import { GameBoard } from '@/components/board/GameBoard';
import { LevelSelector } from '@/components/hud/LevelSelector';
import { VictoryModal } from '@/components/hud/VictoryModal';
import { WaterSplashCanvas } from '@/components/fx/WaterSplashCanvas';
import { Sparkles, CheckCircle, XCircle } from 'lucide-react';

export const App: React.FC = () => {
  const activeLevel = useGameStore(s => s.activeLevel);
  const evaluation = useGameStore(s => s.evaluation);
  const toggleValve = useGameStore(s => s.toggleValve);

  // Keyboard shortcut listener: numbers 1-9 to toggle valve sources
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        const sources = activeLevel.nodes.filter(n => n.type === 'SOURCE' && !n.locked);
        if (num <= sources.length) {
          toggleValve(sources[num - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLevel, toggleValve]);

  const sources = activeLevel.nodes.filter(n => n.type === 'SOURCE');
  const targets = activeLevel.nodes.filter(n => n.type === 'TARGET');

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 overflow-hidden relative">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-ocean-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top HUD Navigation */}
      <GameHeader />

      {/* Main Interactive Circuit Arena */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-2 min-h-0">
        <GameBoard />
      </main>

      {/* Bottom Level Briefing & Quick Control Bar */}
      <footer className="w-full bg-slate-900/90 border-t border-slate-800/80 p-3 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0 backdrop-blur-md">
        {/* Story & Pedagogical Objective */}
        <div className="flex items-center gap-3 text-xs">
          <div className="p-2 rounded-xl bg-ocean-500/10 text-ocean-400 border border-ocean-500/20 shrink-0 hidden sm:block">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-slate-200 font-medium line-clamp-1">{activeLevel.description}</p>
            <p className="text-ocean-300/80 text-[11px] font-mono">
              💡 Objective: {activeLevel.pedagogicalGoal}
            </p>
          </div>
        </div>

        {/* Quick Valve Buttons & Target Goals */}
        <div className="flex items-center gap-4 flex-wrap justify-end">
          {/* Quick Valve Toggles */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-mono mr-1 hidden sm:inline">Valves:</span>
            {sources.map((src, idx) => {
              const isOn = evaluation.nodeStates[src.id] ?? false;
              return (
                <button
                  key={src.id}
                  disabled={src.locked}
                  onClick={() => toggleValve(src.id)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold font-mono flex items-center gap-1.5 transition-all ${
                    isOn
                      ? 'bg-ocean-500 text-white border-ocean-300 shadow-md shadow-ocean-500/30'
                      : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
                  } ${src.locked ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
                >
                  <span>{src.label || `V${idx + 1}`}</span>
                  <span className={`text-[10px] px-1 rounded ${isOn ? 'bg-ocean-700 text-white' : 'bg-slate-900 text-slate-500'}`}>
                    {isOn ? '1' : '0'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Target Status Indicators */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            {targets.map(tgt => {
              const matched = evaluation.targetMatches[tgt.id] ?? false;
              return (
                <div
                  key={tgt.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-mono border ${
                    matched
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {matched ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-slate-600" />}
                  <span>{tgt.label || 'Target'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </footer>

      {/* Floating Overlays and Modals */}
      <LevelSelector />
      <VictoryModal />
      <WaterSplashCanvas />
    </div>
  );
};
export default App;
