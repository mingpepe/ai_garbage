import React, { useRef, useEffect } from 'react';
import { Direction, DIRECTION_VECTORS, LayerType, MazeData, PlayerState, Position } from '../types/maze';
import { PathStep } from '../utils/mazeSolver';
import { renderMaze } from '../utils/renderer';
import { updateContinuousPhysics } from '../utils/corridorPhysics';
import { soundManager } from '../utils/audio';

interface CanvasMazeProps {
  maze: MazeData;
  player: PlayerState;
  onLayerChange: (layer: LayerType) => void;
  visitedTrail: Position[];
  setVisitedTrail: React.Dispatch<React.SetStateAction<Position[]>>;
  solutionPath: PathStep[] | null;
  showSolution: boolean;
  moveSpeed: number;
  onWin: () => void;
  onStepIncrement: () => void;
  onBridgeCross: () => void;
  isWon: boolean;
  heldDir: Direction;
  isVantageFogEnabled?: boolean;
  visionRadius?: number;
}

export const CanvasMaze: React.FC<CanvasMazeProps> = ({
  maze,
  player,
  onLayerChange,
  visitedTrail,
  setVisitedTrail,
  solutionPath,
  showSolution,
  moveSpeed,
  onWin,
  onStepIncrement,
  onBridgeCross,
  isWon,
  heldDir,
  isVantageFogEnabled = false,
  visionRadius = 2.5,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Local continuous kinematics state (pure 60 FPS keyboard physics)
  const kinematicPlayerRef = useRef<PlayerState>({ ...player });

  const moveSpeedRef = useRef(moveSpeed);
  moveSpeedRef.current = moveSpeed;

  useEffect(() => {
    kinematicPlayerRef.current = { ...player };
  }, [player.gridX, player.gridY, maze]);

  const mazeRef = useRef(maze);
  mazeRef.current = maze;

  const visitedTrailRef = useRef(visitedTrail);
  visitedTrailRef.current = visitedTrail;

  const solutionPathRef = useRef(solutionPath);
  solutionPathRef.current = solutionPath;

  const showSolutionRef = useRef(showSolution);
  showSolutionRef.current = showSolution;

  const isWonRef = useRef(isWon);
  isWonRef.current = isWon;

  const heldDirRef = useRef(heldDir);
  heldDirRef.current = heldDir;

  const isVantageFogEnabledRef = useRef(isVantageFogEnabled);
  isVantageFogEnabledRef.current = isVantageFogEnabled;

  const visionRadiusRef = useRef(visionRadius);
  visionRadiusRef.current = visionRadius;

  // Vantage Point Elevation Factor (0.0: ground fog, 1.0: high vantage point full panorama)
  const vantageFactorRef = useRef<number>(0.0);

  // Main 60 FPS Real-Time Continuous Keyboard Physics Loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let startTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.04, (now - lastTime) / 1000);
      lastTime = now;
      const timeSec = (now - startTime) / 1000;

      const p = kinematicPlayerRef.current;
      const m = mazeRef.current;
      const won = isWonRef.current;
      const speed = moveSpeedRef.current;

      if (!won) {
        let vx = 0;
        let vy = 0;

        // Pure Keyboard Direction Input
        if (heldDirRef.current !== Direction.NONE) {
          const vec = DIRECTION_VECTORS[heldDirRef.current];
          vx = vec.dx * speed;
          vy = vec.dy * speed;
        }

        // Apply continuous 2D sub-pixel physics with wall sliding
        if (vx !== 0 || vy !== 0) {
          const result = updateContinuousPhysics(
            m,
            p.exactX,
            p.exactY,
            p.currentLayer,
            vx,
            vy,
            dt
          );

          if (result.moved) {
            p.exactX = result.x;
            p.exactY = result.y;
            p.isMoving = true;

            // Update layer & sound
            if (result.layer !== p.currentLayer) {
              if (result.layer === 'BRIDGE') {
                onBridgeCross();
                soundManager.playBridge();
              } else if (result.layer === 'TUNNEL') {
                soundManager.playTunnel();
              }
              p.currentLayer = result.layer;
              onLayerChange(result.layer);
            }

            // Smooth character facing rotation
            const targetAngle = Math.atan2(vy, vx) + Math.PI / 2;
            let diff = targetAngle - p.facingAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            p.facingAngle += diff * Math.min(1, 18 * dt);

            // Track grid cell entry for score & breadcrumbs
            const currGridX = Math.round(p.exactX);
            const currGridY = Math.round(p.exactY);

            if (currGridX !== p.gridX || currGridY !== p.gridY) {
              p.gridX = currGridX;
              p.gridY = currGridY;
              onStepIncrement();
              setVisitedTrail((prev) => [...prev, { x: currGridX, y: currGridY }]);

              if (p.currentLayer === 'GROUND') {
                soundManager.playHop();
              }
            }

            // Check Goal Reached
            const distToEnd = Math.hypot(p.exactX - m.end.x, p.exactY - m.end.y);
            if (distToEnd < 0.32) {
              p.isMoving = false;
              onWin();
            }
          } else {
            p.isMoving = false;
          }
        } else {
          p.isMoving = false;
        }
      }

      // Update Vantage Point elevation factor smoothly (0.0 to 1.0)
      const targetVantage = (p.currentLayer === 'BRIDGE' || won || showSolutionRef.current) ? 1.0 : 0.0;
      const vantageSpeed = targetVantage > vantageFactorRef.current ? 4.8 : 3.0;
      vantageFactorRef.current += (targetVantage - vantageFactorRef.current) * Math.min(1, vantageSpeed * dt);

      // Render to Canvas at 60 FPS
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.floor(rect.width);
        const targetH = Math.floor(rect.height);

        if (canvas.width !== targetW * dpr || canvas.height !== targetH * dpr) {
          canvas.width = targetW * dpr;
          canvas.height = targetH * dpr;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          renderMaze({
            ctx,
            canvasWidth: rect.width,
            canvasHeight: rect.height,
            maze: m,
            player: p,
            visitedTrail: visitedTrailRef.current,
            solutionPath: solutionPathRef.current,
            showSolution: showSolutionRef.current,
            timeSec,
            vantageFactor: vantageFactorRef.current,
            isVantageFogEnabled: isVantageFogEnabledRef.current,
            visionRadius: visionRadiusRef.current,
          });

          ctx.restore();
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [onLayerChange, setVisitedTrail, onWin, onStepIncrement, onBridgeCross]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden bg-slate-950 select-none"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-default"
      />
    </div>
  );
};
