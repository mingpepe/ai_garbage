import React from 'react';
import type { NodeSchema, PipeSchema } from '@/types/circuit';
import { GraphValidator } from '@/engine/GraphValidator';

interface PipeRendererProps {
  pipe: PipeSchema;
  fromNode: NodeSchema;
  toNode: NodeSchema;
  flowActive: boolean;
  cellSize: number;
}

export const PipeRenderer: React.FC<PipeRendererProps> = ({
  pipe,
  fromNode,
  toNode,
  flowActive,
  cellSize,
}) => {
  const halfNode = (cellSize * 0.94) / 2;

  // Output port is on the right side of the from-node
  const startX = fromNode.position.x * cellSize + cellSize / 2 + halfNode;
  const startY = fromNode.position.y * cellSize + cellSize / 2;

  // Input slot offset calculation
  const maxSlots = GraphValidator.getMaxInputSlots(toNode.type);
  let slotYOffset = 0;
  if (maxSlots === 2) {
    slotYOffset = pipe.inputSlot === 0 ? -18 : 18;
  }

  // Input port is on the left side of the to-node
  const endX = toNode.position.x * cellSize + cellSize / 2 - halfNode;
  const endY = toNode.position.y * cellSize + cellSize / 2 + slotYOffset;

  // Generate smooth curved Bézier path
  const dx = Math.abs(endX - startX);
  const controlDist = Math.max(50, dx * 0.52);
  const cp1x = startX + controlDist;
  const cp1y = startY;
  const cp2x = endX - controlDist;
  const cp2y = endY;

  const pathD = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

  return (
    <g className="pointer-events-none">
      {/* Outer Metallic Pipe Casing */}
      <path
        d={pathD}
        fill="none"
        stroke="#0f172a"
        strokeWidth={18}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={pathD}
        fill="none"
        stroke="#334155"
        strokeWidth={15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inner Dry Channel */}
      <path
        d={pathD}
        fill="none"
        stroke="#0b0f19"
        strokeWidth={11}
        strokeLinecap="round"
      />

      {/* Flowing Water Core when active */}
      {flowActive && (
        <>
          {/* Base Glowing Water Stream */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#waterGlowGrad)"
            strokeWidth={9.5}
            strokeLinecap="round"
            className="filter drop-shadow-[0_0_10px_rgba(56,189,248,0.9)]"
          />

          {/* Animated Directional Flow Dash Pulse */}
          <path
            d={pathD}
            fill="none"
            stroke="#f0f9ff"
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeDasharray="16 20"
            className="animate-flow-fast opacity-95"
          />

          {/* Core high-intensity fluid filament */}
          <path
            d={pathD}
            fill="none"
            stroke="#ffffff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="6 30"
            className="animate-flow-fast opacity-90"
          />
        </>
      )}

      {/* Pipe Connection Flange Rings at Ports */}
      <circle cx={startX} cy={startY} r={6.5} fill="#475569" stroke="#94a3b8" strokeWidth={1.5} />
      <circle cx={endX} cy={endY} r={6.5} fill="#475569" stroke="#94a3b8" strokeWidth={1.5} />
    </g>
  );
};
