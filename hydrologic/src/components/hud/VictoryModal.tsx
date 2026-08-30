import React, { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Trophy, Star, ArrowRight, RotateCcw, Lightbulb, Sparkles, X, Eye, EyeOff } from 'lucide-react';

export const VictoryModal: React.FC = () => {
  const isVictoryModalOpen = useGameStore(s => s.isVictoryModalOpen);
  const setVictoryModalOpen = useGameStore(s => s.setVictoryModalOpen);
  const activeLevel = useGameStore(s => s.activeLevel);
  const stepCount = useGameStore(s => s.stepCount);
  const currentLevelIndex = useGameStore(s => s.currentLevelIndex);
  const campaignLevels = useGameStore(s => s.campaignLevels);
  const nextLevel = useGameStore(s => s.nextLevel);
  const resetCurrentLevel = useGameStore(s => s.resetCurrentLevel);

  const [minimized, setMinimized] = useState(false);

  if (!isVictoryModalOpen) return null;

  const par = activeLevel.parSteps ?? 2;
  let earnedStars = 1;
  if (stepCount <= par) {
    earnedStars = 3;
  } else if (stepCount <= par + 2) {
    earnedStars = 2;
  }

  const hasNext = currentLevelIndex + 1 < campaignLevels.length;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 pointer-events-none">
      <div className="pointer-events-auto bg-slate-900/95 border-2 border-emerald-500/80 rounded-3xl shadow-[0_0_40px_rgba(16,185,129,0.25)] backdrop-blur-xl w-full max-w-sm sm:max-w-md p-5 text-center space-y-4 animate-in fade-in slide-in-from-bottom-5 duration-300">
        {/* Top Header Bar with Minimize and Close */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Trophy className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-emerald-400 font-mono tracking-wider uppercase">
              Circuit Solved!
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setMinimized(!minimized)}
              title={minimized ? "Expand Victory Details" : "Minimize to Inspect Board"}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {minimized ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setVictoryModalOpen(false)}
              title="Close"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* Title & Stars Header */}
            <div className="flex items-center justify-between gap-4 text-left">
              <div>
                <h2 className="text-lg font-bold text-slate-100">{activeLevel.title}</h2>
                <p className="text-[11px] text-slate-400 font-mono">
                  Steps: <span className="text-emerald-300 font-bold">{stepCount}</span> / Par {par}
                </p>
              </div>

              {/* Star Rating Display */}
              <div className="flex gap-1 text-amber-400">
                {[1, 2, 3].map(s => (
                  <Star
                    key={s}
                    className={`w-6 h-6 transition-transform duration-300 ${
                      s <= earnedStars
                        ? 'fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)] scale-105'
                        : 'text-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Educational Takeaway Card */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3 text-left space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400">
                <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                <span>Logic Principle Learned:</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {activeLevel.pedagogicalGoal}
              </p>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              resetCurrentLevel();
            }}
            className="flex-1 py-2.5 px-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Replay</span>
          </button>

          {hasNext ? (
            <button
              onClick={() => {
                nextLevel();
              }}
              className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-ocean-500 to-emerald-500 hover:from-ocean-600 hover:to-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-ocean-500/20 transition-all hover:scale-[1.02]"
            >
              <span>Next Level</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setVictoryModalOpen(false)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-ocean-500 hover:bg-ocean-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>All Cleared!</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
