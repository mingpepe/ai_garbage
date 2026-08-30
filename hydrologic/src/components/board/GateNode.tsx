import React from 'react';
import type { NodeSchema } from '@/types/circuit';
import { useGameStore } from '@/store/gameStore';

interface GateNodeProps {
  node: NodeSchema;
  state: boolean;
  targetMatch?: boolean;
  cellSize: number;
  isSelected?: boolean;
  onClick?: () => void;
}

export const GateNode: React.FC<GateNodeProps> = ({
  node,
  state,
  targetMatch = true,
  cellSize,
  isSelected = false,
  onClick,
}) => {
  const showLogicBadges = useGameStore(s => s.showLogicBadges);
  const activeHint = useGameStore(s => s.activeHint);
  const isHinted = activeHint?.targetNodeId === node.id;

  const width = cellSize * 0.94;
  const height = cellSize * 0.94;
  const halfW = width / 2;
  const halfH = height / 2;

  const isSource = node.type === 'SOURCE';
  const isTarget = node.type === 'TARGET';
  const isInteractive = isSource && !node.locked;

  return (
    <g
      transform={`translate(${node.position.x * cellSize + cellSize / 2}, ${node.position.y * cellSize + cellSize / 2})`}
      className={`select-none group ${isInteractive ? 'cursor-pointer' : 'cursor-default'}`}
      onClick={onClick}
    >
      {/* Hitbox Area */}
      <rect
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        rx={18}
        fill="transparent"
        pointerEvents="all"
      />

      {/* Hint / Selection Highlights */}
      {isHinted && (
        <rect
          x={-halfW - 6}
          y={-halfH - 6}
          width={width + 12}
          height={height + 12}
          rx={24}
          className="animate-pulse stroke-yellow-400 stroke-[3.5] fill-yellow-400/25 pointer-events-none"
        />
      )}
      {isSelected && (
        <rect
          x={-halfW - 4}
          y={-halfH - 4}
          width={width + 8}
          height={height + 8}
          rx={22}
          className="stroke-amber-400 stroke-[2.5] fill-none stroke-dasharray-4 pointer-events-none"
        />
      )}

      {/* Housing Outer Frame */}
      <rect
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        rx={18}
        className={`transition-colors duration-200 stroke-2 pointer-events-none ${
          state
            ? 'fill-slate-900/95 stroke-ocean-400 shadow-[0_0_28px_rgba(56,189,248,0.45)]'
            : 'fill-slate-900/90 stroke-slate-700'
        } ${isInteractive ? 'group-hover:stroke-ocean-300 group-hover:fill-slate-850' : ''}`}
      />

      {/* Interactive Hover Glow Ring */}
      {isInteractive && (
        <rect
          x={-halfW + 3}
          y={-halfH + 3}
          width={width - 6}
          height={height - 6}
          rx={15}
          fill="none"
          className="stroke-ocean-400/0 group-hover:stroke-ocean-400/60 stroke-[1.5] transition-all duration-200 pointer-events-none"
        />
      )}

      {/* Node Component Illustrations */}
      {isSource && (
        <SourceValveSVG active={state} locked={node.locked} />
      )}

      {isTarget && (
        <FarmlandTargetSVG
          active={state}
          targetState={node.targetState ?? true}
          cropType={node.targetType || 'SUNFLOWER'}
          targetMatch={targetMatch}
        />
      )}

      {node.type === 'AND' && <AndCircuitGateSVG active={state} />}
      {node.type === 'OR' && <OrCircuitGateSVG active={state} />}
      {node.type === 'NOT' && <NotCircuitGateSVG active={state} />}
      {node.type === 'XOR' && <XorCircuitGateSVG active={state} />}

      {/* Bottom Label Tag */}
      <text
        y={halfH + 20}
        textAnchor="middle"
        className="fill-slate-200 font-bold text-[13px] tracking-wider pointer-events-none drop-shadow"
      >
        {node.label || node.id}
      </text>

      {/* Educational 0/1 Logic Badge */}
      {showLogicBadges && (
        <g transform={`translate(${halfW - 10}, ${-halfH + 10})`} className="pointer-events-none">
          <circle
            r={12}
            className={state ? 'fill-ocean-500 stroke-ocean-200 stroke-[1.5]' : 'fill-slate-850 stroke-slate-600 stroke-[1.5]'}
          />
          <text
            y={4.5}
            textAnchor="middle"
            className="fill-white font-mono font-bold text-xs"
          >
            {state ? '1' : '0'}
          </text>
        </g>
      )}
    </g>
  );
};

// ============================================================================
// 1. SOURCE: Rotary Water Valve (Enlarged)
// ============================================================================
const SourceValveSVG: React.FC<{ active: boolean; locked?: boolean }> = ({ active, locked }) => {
  return (
    <g className="pointer-events-none" transform="translate(0, -2)">
      {/* Pipe Casing */}
      <circle
        cx={0}
        cy={0}
        r={34}
        className={active ? 'fill-ocean-950 stroke-ocean-400 stroke-[2.5]' : 'fill-slate-850 stroke-slate-700 stroke-2'}
      />

      {/* Water Flow Core Glow */}
      {active && (
        <circle cx={0} cy={0} r={25} className="fill-ocean-500/35 animate-pulse-glow" />
      )}

      {/* Rotary Wheel Handle */}
      <g transform={`rotate(${active ? 90 : 0})`}>
        <line
          x1={-25}
          y1={0}
          x2={25}
          y2={0}
          className={active ? 'stroke-ocean-300 stroke-[3.5]' : 'stroke-slate-400 stroke-[3.5]'}
          strokeLinecap="round"
        />
        <line
          x1={0}
          y1={-25}
          x2={0}
          y2={25}
          className={active ? 'stroke-ocean-300 stroke-[3.5]' : 'stroke-slate-400 stroke-[3.5]'}
          strokeLinecap="round"
        />
        <circle
          cx={0}
          cy={0}
          r={7.5}
          className={active ? 'fill-ocean-400 stroke-white stroke-[1.5]' : 'fill-slate-500'}
        />
        <circle
          cx={0}
          cy={0}
          r={25}
          fill="none"
          className={active ? 'stroke-ocean-300 stroke-[2.5]' : 'stroke-slate-500 stroke-2'}
          strokeDasharray="8 5"
        />
      </g>

      {/* Status indicator */}
      {locked ? (
        <g transform="translate(0, 18)">
          <rect x={-9} y={-7} width={18} height={14} rx={2.5} className="fill-amber-500/90" />
          <path d="M-4 -7 A4 4 0 0 1 4 -7" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
        </g>
      ) : (
        <text y={4} textAnchor="middle" className="text-[11px] font-extrabold fill-slate-100 font-mono tracking-wider">
          {active ? 'ON' : 'OFF'}
        </text>
      )}
    </g>
  );
};

// ============================================================================
// 2. TARGET: Authentic Farmland Plot (Enlarged)
// ============================================================================
const FarmlandTargetSVG: React.FC<{
  active: boolean;
  targetState: boolean;
  cropType: 'CARROT' | 'SUNFLOWER' | 'TANK';
  targetMatch: boolean;
}> = ({ active, targetState, cropType, targetMatch }) => {
  return (
    <g className="pointer-events-none" transform="translate(0, 4)">
      {/* Target Goal Requirement Banner */}
      <g transform="translate(0, -36)">
        <rect
          x={-30}
          y={-9}
          width={60}
          height={18}
          rx={5}
          className={targetMatch ? 'fill-emerald-600' : 'fill-rose-600'}
        />
        <text
          y={4}
          textAnchor="middle"
          className="fill-white font-mono font-bold text-[10px] tracking-wider"
        >
          {targetState ? 'WANT: WET' : 'WANT: DRY'}
        </text>
      </g>

      {cropType === 'TANK' ? (
        // Water Cistern / Reservoir
        <g transform="translate(0, -6)">
          <rect x={-20} y={-16} width={40} height={36} rx={5} className="fill-slate-800 stroke-slate-400 stroke-[1.5]" />
          {active && (
            <rect x={-17} y={-5} width={34} height={23} rx={3} className="fill-ocean-400/85 animate-pulse-glow" />
          )}
          <line x1={-17} y1={-8} x2={-10} y2={-8} className="stroke-slate-400 stroke-[1.5]" />
          <line x1={-17} y1={2} x2={-10} y2={2} className="stroke-slate-400 stroke-[1.5]" />
          <line x1={-17} y1={12} x2={-10} y2={12} className="stroke-slate-400 stroke-[1.5]" />
          <text y={-20} textAnchor="middle" className="text-[10px] font-bold fill-slate-300 font-mono">
            TANK
          </text>
        </g>
      ) : (
        // Authentic Farmland Garden Bed Plot
        <g transform="translate(0, -2)">
          {/* Wooden Planter Bed Frame */}
          <rect
            x={-42}
            y={-6}
            width={84}
            height={32}
            rx={6}
            className="fill-amber-950 stroke-amber-800 stroke-2"
          />
          {/* Corner Joinery Pegs */}
          <circle cx={-37} cy={-1} r={2} className="fill-amber-600" />
          <circle cx={37} cy={-1} r={2} className="fill-amber-600" />
          <circle cx={-37} cy={21} r={2} className="fill-amber-600" />
          <circle cx={37} cy={21} r={2} className="fill-amber-600" />

          {/* Soil Bed with Tilled Furrows */}
          <rect
            x={-37}
            y={-2}
            width={74}
            height={24}
            rx={4}
            className={active ? 'fill-[#3f1d0b]' : 'fill-[#78716c]'}
          />
          {/* Furrow Ridge Lines in Soil */}
          <line x1={-32} y1={5} x2={32} y2={5} className={active ? 'stroke-[#572a10] stroke-[1.5]' : 'stroke-[#57534e] stroke-[1.5]'} />
          <line x1={-32} y1={14} x2={32} y2={14} className={active ? 'stroke-[#572a10] stroke-[1.5]' : 'stroke-[#57534e] stroke-[1.5]'} />

          {/* Water Droplets / Puddles on irrigated soil */}
          {active && (
            <>
              <ellipse cx={-22} cy={14} rx={5} ry={2.5} className="fill-ocean-400/70" />
              <ellipse cx={22} cy={14} rx={5} ry={2.5} className="fill-ocean-400/70" />
            </>
          )}

          {/* Crops Growing in Farmland */}
          {cropType === 'SUNFLOWER' && (
            <g>
              {/* Left stalk */}
              <g transform="translate(-18, 0)">
                <path
                  d={active ? 'M0 2 Q-1 -7 0 -15' : 'M0 2 Q5 -3 5 -5'}
                  className={active ? 'stroke-emerald-400 stroke-[2.5]' : 'stroke-amber-800 stroke-2'}
                  fill="none"
                />
                {active ? (
                  <g transform="translate(0, -15)">
                    {[0, 60, 120, 180, 240, 300].map(deg => (
                      <ellipse key={deg} cx={0} cy={-6} rx={2.5} ry={5} transform={`rotate(${deg})`} className="fill-yellow-400" />
                    ))}
                    <circle cx={0} cy={0} r={4} className="fill-amber-900" />
                  </g>
                ) : (
                  <circle cx={5} cy={-5} r={2.5} className="fill-stone-600" />
                )}
              </g>

              {/* Main Center Sunflower */}
              <g transform="translate(0, 0)">
                <path
                  d={active ? 'M0 2 Q-1 -10 0 -20' : 'M0 2 Q7 -5 7 -7'}
                  className={active ? 'stroke-emerald-400 stroke-[3]' : 'stroke-amber-800 stroke-[2.5]'}
                  fill="none"
                />
                {active ? (
                  <g transform="translate(0, -20)">
                    {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                      <ellipse key={deg} cx={0} cy={-8.5} rx={3.5} ry={7} transform={`rotate(${deg})`} className="fill-yellow-400 stroke-amber-500 stroke-[0.5]" />
                    ))}
                    <circle cx={0} cy={0} r={5.5} className="fill-amber-900 stroke-amber-950 stroke-[0.5]" />
                    <circle cx={2} cy={-2} r={1.5} className="fill-white" />
                  </g>
                ) : (
                  <circle cx={7} cy={-7} r={3.5} className="fill-stone-600" />
                )}
              </g>

              {/* Right stalk */}
              <g transform="translate(18, 0)">
                <path
                  d={active ? 'M0 2 Q1 -7 0 -15' : 'M0 2 Q-5 -3 -5 -5'}
                  className={active ? 'stroke-emerald-400 stroke-[2.5]' : 'stroke-amber-800 stroke-2'}
                  fill="none"
                />
                {active ? (
                  <g transform="translate(0, -15)">
                    {[0, 60, 120, 180, 240, 300].map(deg => (
                      <ellipse key={deg} cx={0} cy={-6} rx={2.5} ry={5} transform={`rotate(${deg})`} className="fill-yellow-400" />
                    ))}
                    <circle cx={0} cy={0} r={4} className="fill-amber-900" />
                  </g>
                ) : (
                  <circle cx={-5} cy={-5} r={2.5} className="fill-stone-600" />
                )}
              </g>
            </g>
          )}

          {cropType === 'CARROT' && (
            <g>
              {/* Row of 3 Carrots in Farmland Bed */}
              {[-20, 0, 20].map((offset, idx) => (
                <g key={idx} transform={`translate(${offset}, 0)`}>
                  {active ? (
                    <>
                      <path d="M-5 2 L5 2 L0 15 Z" className="fill-orange-500 stroke-orange-600 stroke-1" />
                      <path d="M0 2 Q-6 -7 -4 -15 M0 2 Q0 -10 0 -17 M0 2 Q6 -7 4 -15" className="stroke-emerald-400 stroke-[2.2] fill-none" strokeLinecap="round" />
                    </>
                  ) : (
                    <>
                      <path d="M-3.5 2 L3.5 2 L0 7 Z" className="fill-stone-600" />
                      <path d="M0 2 Q-4 0 -5 -3" className="stroke-stone-500 stroke-[1.2] fill-none" />
                    </>
                  )}
                </g>
              ))}
            </g>
          )}
        </g>
      )}
    </g>
  );
};

// ============================================================================
// 3. AND GATE: Standard D-Circuit Symbol + Impellers (Enlarged)
// ============================================================================
const AndCircuitGateSVG: React.FC<{ active: boolean }> = ({ active }) => {
  return (
    <g className="pointer-events-none" transform="translate(0, -2)">
      {/* Standard ANSI Logic Gate D-Shape Contour */}
      <path
        d="M -30 -26 L 0 -26 A 26 26 0 0 1 0 26 L -30 26 Z"
        className={`stroke-[2.5] transition-colors ${
          active
            ? 'fill-ocean-950/90 stroke-ocean-400 shadow-[0_0_16px_rgba(56,189,248,0.55)]'
            : 'fill-slate-950/80 stroke-slate-600'
        }`}
      />

      {/* Dual Turbine Impellers */}
      <g transform="translate(-18, -14)" className={active ? 'animate-spin-fast' : ''}>
        <circle cx={0} cy={0} r={7.5} className={active ? 'fill-ocean-900 stroke-ocean-300 stroke-1' : 'fill-slate-800 stroke-slate-600 stroke-1'} />
        <line x1={-5} y1={0} x2={5} y2={0} className={active ? 'stroke-ocean-300 stroke-[2.5]' : 'stroke-slate-400 stroke-2'} />
        <line x1={0} y1={-5} x2={0} y2={5} className={active ? 'stroke-ocean-300 stroke-[2.5]' : 'stroke-slate-400 stroke-2'} />
      </g>

      <g transform="translate(-18, 14)" className={active ? 'animate-spin-fast' : ''}>
        <circle cx={0} cy={0} r={7.5} className={active ? 'fill-ocean-900 stroke-ocean-300 stroke-1' : 'fill-slate-800 stroke-slate-600 stroke-1'} />
        <line x1={-5} y1={0} x2={5} y2={0} className={active ? 'stroke-ocean-300 stroke-[2.5]' : 'stroke-slate-400 stroke-2'} />
        <line x1={0} y1={-5} x2={0} y2={5} className={active ? 'stroke-ocean-300 stroke-[2.5]' : 'stroke-slate-400 stroke-2'} />
      </g>

      {/* Central Sliding Iron Gate */}
      <g transform={`translate(2, ${active ? -14 : 0})`}>
        <rect
          x={-3.5}
          y={-10}
          width={7}
          height={20}
          rx={2}
          className={active ? 'fill-emerald-500 stroke-emerald-300 stroke-1' : 'fill-slate-600 stroke-slate-400 stroke-1'}
        />
      </g>

      {/* Circuit Symbol Label */}
      <text y={4} textAnchor="middle" className="text-xs font-extrabold fill-slate-100 font-mono tracking-wider">
        AND
      </text>
    </g>
  );
};

// ============================================================================
// 4. OR GATE: Standard Curved Shield Circuit Symbol + Funnel (Enlarged)
// ============================================================================
const OrCircuitGateSVG: React.FC<{ active: boolean }> = ({ active }) => {
  return (
    <g className="pointer-events-none" transform="translate(0, -2)">
      {/* Standard ANSI Logic Gate OR Curved Shield Contour */}
      <path
        d="M -32 -26 Q -16 0 -32 26 Q 2 24 26 0 Q 2 -24 -32 -26 Z"
        className={`stroke-[2.5] transition-colors ${
          active
            ? 'fill-ocean-950/90 stroke-ocean-400 shadow-[0_0_16px_rgba(56,189,248,0.55)]'
            : 'fill-slate-950/80 stroke-slate-600'
        }`}
      />

      {/* Swirling Eddy Confluence */}
      {active && (
        <circle cx={4} cy={0} r={6.5} className="fill-ocean-400 animate-spin-slow opacity-85" strokeDasharray="3.5 3.5" />
      )}

      {/* Circuit Symbol Label */}
      <text y={4} textAnchor="middle" className="text-xs font-extrabold fill-slate-100 font-mono tracking-wider">
        OR
      </text>
    </g>
  );
};

// ============================================================================
// 5. NOT GATE: Standard Triangle + Inversion Bubble (Enlarged)
// ============================================================================
const NotCircuitGateSVG: React.FC<{ active: boolean }> = ({ active }) => {
  return (
    <g className="pointer-events-none" transform="translate(0, -2)">
      {/* Standard ANSI Logic Gate Triangle */}
      <polygon
        points="-28,-24 -28,24 14,0"
        className={`stroke-[2.5] transition-colors ${
          active
            ? 'fill-ocean-950/90 stroke-ocean-400'
            : 'fill-slate-950/80 stroke-slate-600'
        }`}
      />

      {/* Inversion Bubble Circle at Output */}
      <circle
        cx={20}
        cy={0}
        r={6}
        className={active ? 'fill-ocean-500 stroke-ocean-300 stroke-[2.5]' : 'fill-slate-900 stroke-slate-400 stroke-2'}
      />

      {/* Buoy float & stopper mechanism inside */}
      <g transform={`translate(-12, ${active ? -10 : 8})`}>
        <ellipse cx={0} cy={0} rx={8.5} ry={5} className="fill-amber-500 stroke-amber-300 stroke-1" />
        <polygon points="-4,7 4,7 0,12" className={active ? 'fill-rose-500' : 'fill-emerald-500'} />
      </g>

      {/* Circuit Symbol Label */}
      <text y={-11} textAnchor="middle" className="text-[11px] font-extrabold fill-slate-200 font-mono tracking-wider">
        NOT
      </text>
    </g>
  );
};

// ============================================================================
// 6. XOR GATE: Standard Double-Arc Shield Symbol + Rocker (Enlarged)
// ============================================================================
const XorCircuitGateSVG: React.FC<{ active: boolean }> = ({ active }) => {
  return (
    <g className="pointer-events-none" transform="translate(0, -2)">
      {/* Outer Curved Back Arc Line */}
      <path
        d="M -36 -26 Q -20 0 -36 26"
        fill="none"
        className={active ? 'stroke-ocean-400 stroke-[2.5]' : 'stroke-slate-500 stroke-2'}
      />

      {/* Main ANSI XOR Shield Body */}
      <path
        d="M -30 -26 Q -14 0 -30 26 Q 4 24 26 0 Q 4 -24 -30 -26 Z"
        className={`stroke-[2.5] transition-colors ${
          active
            ? 'fill-ocean-950/90 stroke-ocean-400 shadow-[0_0_16px_rgba(56,189,248,0.55)]'
            : 'fill-slate-950/80 stroke-slate-600'
        }`}
      />

      {/* Rocker differential balance beam */}
      <g transform="translate(0, 0)">
        <polygon points="0,5 -5,14 5,14" className="fill-slate-600" />
        <line
          x1={-18}
          y1={active ? 11 : 5}
          x2={18}
          y2={active ? -1 : 5}
          className="stroke-amber-400 stroke-[3]"
          strokeLinecap="round"
        />
      </g>

      {/* Circuit Symbol Label */}
      <text y={-9} textAnchor="middle" className="text-xs font-extrabold fill-slate-100 font-mono tracking-wider">
        XOR
      </text>
    </g>
  );
};
