import { X, Layers, Compass, Keyboard } from 'lucide-react';

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstructionsModal: React.FC<InstructionsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl text-slate-200 space-y-5 max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
              📖
            </div>
            <h3 className="text-lg font-bold text-white">立體立交迷宮 (Weave Maze) 玩法指南</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: The Weave Mechanism */}
        <div className="space-y-2.5 bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/60">
          <h4 className="font-bold text-emerald-400 text-sm flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            1. 立體高架與地下涵洞 (3D Overpasses & Tunnels)
          </h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            不同於傳統的平面迷宮，<strong>立體立交迷宮 (Weave Maze)</strong> 的道路會在交會處垂直交叉穿過：
          </p>
          <ul className="text-xs space-y-1.5 text-slate-300 list-disc list-inside">
            <li>
              <strong className="text-amber-300">🌉 上層高架橋 (Bridge)</strong>：道路在上方跨越，具有明顯的立體投影與木棧欄杆。
            </li>
            <li>
              <strong className="text-indigo-300">🚇 下層涵洞 (Tunnel)</strong>：道路從橋下方穿過，道路帶有深色涵洞陰影。
            </li>
            <li>
              <strong className="text-rose-400">⚠️ 絕對獨立不相通</strong>：上層與下層道路完全立體隔離，在交點處不能切換道路。
            </li>
            <li>
              <strong className="text-emerald-300">🔭 登高望遠 (Vantage Point)</strong>：身處地面時樹籬遮蔽遠景；但<strong>登上高架橋時視野會完全開闊</strong>，整座迷宮與前方佈局一覽無遺！請善用橋樑作為制高點規劃路線。
            </li>
          </ul>
        </div>

        {/* Section 2: Controls */}
        <div className="space-y-2.5 bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/60">
          <h4 className="font-bold text-sky-400 text-sm flex items-center gap-1.5">
            <Compass className="w-4 h-4" />
            2. 操作方式 (Controls)
          </h4>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex items-start gap-2.5 col-span-2">
              <Keyboard className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">鍵盤操作 (Keyboard Controls)</strong>
                <p className="text-slate-300 text-xs mt-1">
                  使用方向鍵 <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300">↑ ↓ ← →</span> 或 <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300">W A S D</span> 控制連續滑順移動；按 <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-sky-300">R</span> 鍵可重置回起點。
                </p>
              </div>
            </div>
        </div>

        {/* Section 3: Goal */}
        <div className="space-y-2 bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/60 text-xs">
          <h4 className="font-bold text-yellow-400 text-sm flex items-center gap-1.5">
            🎯 勝利目標
          </h4>
          <p className="text-slate-300">
            引導小青蛙 🐸 從起點出發，穿越複雜的立交網絡，成功抵達盛開著蓮花的花園池塘 🪷！
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-colors"
        >
          開始冒險！
        </button>
      </div>
    </div>
  );
};
