import React, { useEffect, useRef } from 'react';
import { MAP, MAP_SIZE } from './raycaster/engine';
import type { Player } from './raycaster/engine';

interface Manual3DViewProps {
  playerRef: React.MutableRefObject<Player>;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

const WALL_COLORS: Record<number, string> = {
  1: '#2980b9', 2: '#c0392b', 3: '#f1c40f', 4: '#27ae60',
};

const Manual3DView: React.FC<Manual3DViewProps> = ({ playerRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animationId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const p = playerRef.current;

      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);

      const vertices: Point3D[] = [
        {x: -0.5, y: -0.5, z: -0.5}, {x: 0.5, y: -0.5, z: -0.5},
        {x: 0.5, y: 0.5, z: -0.5}, {x: -0.5, y: 0.5, z: -0.5},
        {x: -0.5, y: -0.5, z: 0.5}, {x: 0.5, y: -0.5, z: 0.5},
        {x: 0.5, y: 0.5, z: 0.5}, {x: -0.5, y: 0.5, z: 0.5}
      ];
      const edges = [[0,1], [1,2], [2,3], [3,0], [4,5], [5,6], [6,7], [7,4], [0,4], [1,5], [2,6], [3,7]];

      for (let mx = 0; mx < MAP_SIZE; mx++) {
        for (let my = 0; my < MAP_SIZE; my++) {
          if (MAP[mx][my] === 0) continue;
          const dist = Math.sqrt((mx - p.x)**2 + (my - p.y)**2);
          if (dist > 8) continue; 

          const projectedPoints: {x: number, y: number}[] = [];
          let isPointInFront = false;

          vertices.forEach(v => {
            const tx = (my + v.x) - p.y; // Column offset
            const ty = v.y;              // Height offset
            const tz = (mx + v.z) - p.x; // Row offset

            // Correct projection: 
            // rz (depth) is the projection onto the player's direction vector (dirY, dirX)
            // rx (horizontal) is the projection onto the right vector (-dirX, dirY)
            const rz = tx * p.dirY + tz * p.dirX;
            const rx = tx * (-p.dirX) + tz * p.dirY;

            if (rz > 0.1) {
              isPointInFront = true;
              const scale = 400 / rz;
              // In canvas, Y increases downwards, so we negate ty if v.y=0.5 is the top
              projectedPoints.push({x: rx * scale + w / 2, y: -ty * scale + h / 2});
            } else { 
              projectedPoints.push({x: -999, y: -999}); 
            }
          });

          if (isPointInFront) {
            ctx.strokeStyle = WALL_COLORS[MAP[mx][my]];
            ctx.lineWidth = Math.max(0.5, 2 / dist);
            ctx.globalAlpha = Math.max(0, 1 - dist / 9); 
            edges.forEach(edge => {
              const p1 = projectedPoints[edge[0]];
              const p2 = projectedPoints[edge[1]];
              if (p1.x !== -999 && p2.x !== -999) {
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
              }
            });
          }
        }
      }
      ctx.globalAlpha = 1.0;
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [playerRef]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0a0a0a', border: '1px solid #444', padding: '15px' }}>
      <h3 style={{ color: '#f0f', margin: '0 0 10px 0', fontSize: '16px' }}>VIEW 4: MANUAL 3D ENGINE</h3>
      <canvas ref={canvasRef} width={400} height={400} style={{ background: '#000', border: '1px solid #555' }} />
    </div>
  );
};

export default Manual3DView;
