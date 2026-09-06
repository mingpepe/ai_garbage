import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Star, RefreshCw, ArrowRight, Layers, Clock, Footprints } from 'lucide-react';

interface VictoryModalProps {
  isOpen: boolean;
  timeSec: number;
  stepCount: number;
  optimalSteps: number;
  bridgeCrossCount: number;
  onPlayAgain: () => void;
  onNextLevel: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  isOpen,
  timeSec,
  stepCount,
  optimalSteps,
  bridgeCrossCount,
  onPlayAgain,
  onNextLevel,
}) => {
  useEffect(() => {
    if (isOpen) {
      const count = 200;
      const defaults = {
        origin: { y: 0.7 },
        zIndex: 9999,
      };

      function fire(particleRatio: number, opts: confetti.Options) {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
        });
      }

      fire(0.25, {
        spread: 26,
        startVelocity: 55,
      });
      fire(0.2, {
        spread: 60,
      });
      fire(0.35, {
        spread: 100,
        decay: 0.91,
        scalar: 0.8,
      });
      fire(0.1, {
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2,
      });
      fire(0.1, {
        spread: 120,
        startVelocity: 45,
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins} 分 ${s} 秒`;
  };

  const ratio = optimalSteps > 0 ? optimalSteps / Math.max(1, stepCount) : 1;
  const stars = ratio >= 0.85 ? 3 : ratio >= 0.5 ? 2 : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 md:p-8 shadow-2xl text-center space-y-6">
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-500/20 blur-3xl rounded-full pointer-events-none" />

        <div className="relative inline-flex items-center justify-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-4xl shadow-xl shadow-amber-500/30 animate-bounceSmall">
            🏆
          </div>
          <div className="absolute -bottom-2 -right-2 text-2xl">
            🪷
          </div>
        </div>

        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-wide">
            恭喜通關！
          </h2>
          <p className="text-emerald-400 text-sm mt-1 font-medium">
            順利穿越立體立交迷宮抵達終點！
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <Star
              key={s}
              className={`w-8 h-8 transition-transform ${
                s <= stars
                  ? 'text-amber-400 fill-amber-400 scale-110 drop-shadow-md'
                  : 'text-slate-700'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/60 text-slate-200 text-xs">
          <div className="flex flex-col items-center">
            <Clock className="w-4 h-4 text-sky-400 mb-1" />
            <span className="text-slate-400 text-[10px]">通關時間</span>
            <span className="font-bold text-white text-xs mt-0.5">{formatTime(timeSec)}</span>
          </div>

          <div className="flex flex-col items-center border-x border-slate-700">
            <Footprints className="w-4 h-4 text-emerald-400 mb-1" />
            <span className="text-slate-400 text-[10px]">移動步數</span>
            <span className="font-bold text-white text-xs mt-0.5">
              {stepCount} <span className="text-[10px] text-slate-400">/ 最優 {optimalSteps}</span>
            </span>
          </div>

          <div className="flex flex-col items-center">
            <Layers className="w-4 h-4 text-amber-400 mb-1" />
            <span className="text-slate-400 text-[10px]">跨越高架橋</span>
            <span className="font-bold text-white text-xs mt-0.5">{bridgeCrossCount} 次</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            onClick={onPlayAgain}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>重新挑戰本局</span>
          </button>

          <button
            onClick={onNextLevel}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2"
          >
            <span>下一關迷宮</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
