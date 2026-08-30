import React from 'react';
import { useGameStore } from '@/store/gameStore';
import { GateNode } from './GateNode';
import { PipeRenderer } from './PipeRenderer';

export const GameBoard: React.FC = () => {
  const activeLevel = useGameStore(s => s.activeLevel);
  const evaluation = useGameStore(s => s.evaluation);
  const toggleValve = useGameStore(s => s.toggleValve);

  const cellSize = 135;
  const gridWidth = (activeLevel.gridSize.cols + 1.2) * cellSize;
  const gridHeight = (activeLevel.gridSize.rows + 1.2) * cellSize;

  const nodeMap = new Map(activeLevel.nodes.map(n => [n.id, n]));

  return (
    <div className="relative w-full h-full flex items-center justify-center p-3 sm:p-5 overflow-auto">
      <svg
        viewBox={`0 0 ${gridWidth} ${gridHeight}`}
        className="w-full max-w-6xl h-auto max-h-[76vh] rounded-3xl bg-slate-950/80 border-2 border-slate-800 shadow-2xl backdrop-blur-md"
      >
        <defs>
          {/* Water Glowing Gradient */}
          <linearGradient id="waterGlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>

          {/* Background Circuit Grid Pattern */}
          <pattern id="circuitGrid" width="45" height="45" patternUnits="userSpaceOnUse">
            <circle cx="22.5" cy="22.5" r="1.5" fill="#334155" opacity="0.45" />
            <path d="M 45 0 L 0 0 0 45" fill="none" stroke="#1e293b" strokeWidth="0.6" opacity="0.35" />
          </pattern>
        </defs>

        {/* Background Grid */}
        <rect width="100%" height="100%" fill="url(#circuitGrid)" rx="24" />

        {/* Layer 1: Pipe Connections */}
        <g id="pipes-layer">
          {activeLevel.pipes.map(pipe => {
            const fromNode = nodeMap.get(pipe.from);
            const toNode = nodeMap.get(pipe.to);
            if (!fromNode || !toNode) return null;

            const isFlowing = evaluation.pipeFlows[pipe.id] ?? false;

            return (
              <PipeRenderer
                key={pipe.id}
                pipe={pipe}
                fromNode={fromNode}
                toNode={toNode}
                flowActive={isFlowing}
                cellSize={cellSize}
              />
            );
          })}
        </g>

        {/* Layer 2: Logic Nodes */}
        <g id="nodes-layer">
          {activeLevel.nodes.map(node => {
            const nodeState = evaluation.nodeStates[node.id] ?? false;
            const targetMatch = evaluation.targetMatches[node.id] ?? true;

            return (
              <GateNode
                key={node.id}
                node={node}
                state={nodeState}
                targetMatch={targetMatch}
                cellSize={cellSize}
                onClick={() => {
                  if (node.type === 'SOURCE') {
                    toggleValve(node.id);
                  }
                }}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
