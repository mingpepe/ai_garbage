import React from 'react';
import { useGameStore } from '@/store/gameStore';
import { X, Star, Lock, Droplets, Compass } from 'lucide-react';

export const LevelSelector: React.FC = () => {
  const isLevelSelectOpen = useGameStore(s => s.isLevelSelectOpen);
  const setLevelSelectOpen = useGameStore(s => s.setLevelSelectOpen);
  const campaignLevels = useGameStore(s => s.campaignLevels);
  const currentLevelIndex = useGameStore(s => s.currentLevelIndex);
  const unlockedLevelIndex = useGameStore(s => s.unlockedLevelIndex);
  const levelStars = useGameStore(s => s.levelStars);
  const loadLevel = useGameStore(s => s.loadLevel);

  if (!isLevelSelectOpen) return null;

  const tiers = [
    { tier: 1, name: 'Tier 1: Foundations', desc: 'Valves & Basic Gates (AND, OR, NOT)' },
    { tier: 2, name: 'Tier 2: Intermediate Networks', desc: 'Compound Expressions & Multi-Output Routing' },
    { tier: 3, name: 'Tier 3: Applied Real-World Logic', desc: 'Safety Systems & Binary Half-Adders' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-ocean-500/20 text-ocean-400 border border-ocean-500/30">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">HydroLogic Campaign Map</h2>
              <p className="text-xs text-slate-400">Select an unlocked stage to explore fluid logic circuits</p>
            </div>
          </div>
          <button
            onClick={() => setLevelSelectOpen(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-8">
          {tiers.map(t => {
            const tierLevels = campaignLevels
              .map((lvl, index) => ({ lvl, index }))
              .filter(item => item.lvl.tier === t.tier);

            return (
              <div key={t.tier} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ocean-300 uppercase tracking-wider">
                    {t.name}
                  </h3>
                  <span className="text-xs text-slate-500">{t.desc}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tierLevels.map(({ lvl, index }) => {
                    const isUnlocked = index <= unlockedLevelIndex;
                    const isCurrent = index === currentLevelIndex;
                    const stars = levelStars[lvl.levelId] || 0;

                    return (
                      <button
                        key={lvl.levelId}
                        disabled={!isUnlocked}
                        onClick={() => loadLevel(index)}
                        className={`p-4 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between h-28 relative overflow-hidden ${
                          isCurrent
                            ? 'bg-ocean-950/70 border-ocean-400 ring-2 ring-ocean-400/40 shadow-lg shadow-ocean-500/10'
                            : isUnlocked
                            ? 'bg-slate-800/60 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                            : 'bg-slate-900/40 border-slate-800/80 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] font-mono font-bold text-ocean-400">
                              LV {String(index + 1).padStart(2, '0')}
                            </span>
                            <h4 className="text-sm font-bold text-slate-100 truncate mt-0.5">
                              {lvl.title}
                            </h4>
                          </div>

                          {isUnlocked ? (
                            <div className="flex gap-0.5 text-amber-400">
                              {[1, 2, 3].map(s => (
                                <Star
                                  key={s}
                                  className={`w-3.5 h-3.5 ${
                                    s <= stars ? 'fill-amber-400' : 'text-slate-600'
                                  }`}
                                />
                              ))}
                            </div>
                          ) : (
                            <Lock className="w-4 h-4 text-slate-600" />
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 truncate">
                          {lvl.pedagogicalGoal}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-ocean-400">
            <Droplets className="w-4 h-4" />
            <span>Water-Pipe Boolean Odyssey</span>
          </div>
          <span>Total Levels: {campaignLevels.length}</span>
        </div>
      </div>
    </div>
  );
};
