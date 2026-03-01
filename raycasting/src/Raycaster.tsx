import React, { useEffect, useRef, useState } from 'react';
import { MAP, MAP_SIZE, castRay, rotatePlayer, movePlayer } from './raycaster/engine';
import type { Player, RayHit } from './raycaster/engine';

const WALL_COLORS: Record<number, string> = {
  1: '210, 80%', 2: '0, 80%', 3: '50, 90%', 4: '120, 70%',
};

interface RaycasterProps {
  playerRef: React.MutableRefObject<Player>;
}

const Raycaster: React.FC<RaycasterProps> = ({ playerRef }) => {
  const canvas2DRef = useRef<HTMLCanvasElement>(null);
  const canvas3DRef = useRef<HTMLCanvasElement>(null);
  const [showDebug, setShowDebug] = useState(true);
  const [debugData, setDebugData] = useState<any>({});
  const [keys, setKeys] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: true }));
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: false }));
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    let animationId: number;

    const loop = () => {
      const p = playerRef.current;
      const moveSpeed = 0.05;
      const rotSpeed = 0.03;
      if (keys['arrowup']) playerRef.current = movePlayer(p, moveSpeed);
      if (keys['arrowdown']) playerRef.current = movePlayer(p, -moveSpeed);
      if (keys['arrowleft']) playerRef.current = rotatePlayer(p, rotSpeed);
      if (keys['arrowright']) playerRef.current = rotatePlayer(p, -rotSpeed);

      const canvas2D = canvas2DRef.current;
      const canvas3D = canvas3DRef.current;
      if (!canvas2D || !canvas3D) return;

      const ctx2D = canvas2D.getContext('2d')!;
      const ctx3D = canvas3D.getContext('2d')!;

      // Use larger width for detail (400px)
      const rays: RayHit[] = [];
      for (let x = 0; x < 400; x++) {
        rays.push(castRay(x, 400, playerRef.current, 400));
      }

      // --- VIEW 1: 2D ENGINE (Full Detail) ---
      ctx2D.fillStyle = '#050505';
      ctx2D.fillRect(0, 0, 400, 400);
      const blockSize = 400 / MAP_SIZE;
      for (let i = 0; i < MAP_SIZE; i++) {
        for (let j = 0; j < MAP_SIZE; j++) {
          if (MAP[i][j] > 0) {
            ctx2D.fillStyle = `hsl(${WALL_COLORS[MAP[i][j]]}, 30%)`;
            ctx2D.fillRect(j * blockSize, i * blockSize, blockSize - 1, blockSize - 1);
          }
        }
      }
      // Drawing Rays
      ctx2D.strokeStyle = 'rgba(0, 255, 0, 0.2)';
      rays.forEach((ray, i) => {
        if (i % 10 === 0) {
          ctx2D.beginPath();
          ctx2D.moveTo(p.y * blockSize, p.x * blockSize);
          ctx2D.lineTo(
            (p.y + ray.rayDirY * ray.perpWallDist) * blockSize,
            (p.x + ray.rayDirX * ray.perpWallDist) * blockSize
          );
          ctx2D.stroke();
        }
      });
      // Player
      ctx2D.fillStyle = '#ff3333';
      ctx2D.beginPath(); ctx2D.arc(p.y * blockSize, p.x * blockSize, 6, 0, Math.PI * 2); ctx2D.fill();
      ctx2D.strokeStyle = '#ff3333';
      ctx2D.beginPath(); ctx2D.moveTo(p.y * blockSize, p.x * blockSize);
      ctx2D.lineTo((p.y + p.dirY * 1.0) * blockSize, (p.x + p.dirX * 1.0) * blockSize);
      ctx2D.stroke();

      // --- VIEW 2: 2.5D PROJECTION (Raycasting) ---
      ctx3D.fillStyle = '#111';
      ctx3D.fillRect(0, 0, 400, 400);
      rays.forEach((ray, x) => {
        const wallH = ray.lineHeight;
        const start = Math.max(0, -wallH / 2 + 200);
        const end = Math.min(400, wallH / 2 + 200);
        let b = Math.min(50, (1.2 / ray.perpWallDist) * 80);
        if (ray.side === 1) b *= 0.7;
        ctx3D.strokeStyle = `hsl(${WALL_COLORS[ray.wallType]}, ${b}%)`;
        ctx3D.beginPath(); ctx3D.moveTo(x, start); ctx3D.lineTo(x, end); ctx3D.stroke();
        ctx3D.strokeStyle = '#151515'; ctx3D.beginPath(); ctx3D.moveTo(x, 0); ctx3D.lineTo(x, start); ctx3D.stroke();
        ctx3D.strokeStyle = '#252525'; ctx3D.beginPath(); ctx3D.moveTo(x, end); ctx3D.lineTo(x, 400); ctx3D.stroke();
      });

      // Update full Debug Data
      setDebugData({
        player: { ...p },
        centerRay: rays[200],
      });
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [keys, playerRef]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #444', padding: '15px' }}>
          <h3 style={{ color: '#0f0', margin: '0 0 10px 0', fontSize: '16px' }}>VIEW 1: 2D LOGIC ENGINE</h3>
          <canvas ref={canvas2DRef} width={400} height={400} style={{ border: '1px solid #555' }} />
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #444', padding: '15px' }}>
          <h3 style={{ color: '#fff', margin: '0 0 10px 0', fontSize: '16px' }}>VIEW 2: 2.5D PROJECTION</h3>
          <canvas ref={canvas3DRef} width={400} height={400} style={{ border: '1px solid #555' }} />
        </div>
      </div>

      <div style={{ marginTop: '15px' }}>
        <button 
          onClick={() => setShowDebug(!showDebug)} 
          style={{ padding: '8px 20px', background: '#222', color: '#0f0', border: '1px solid #0f0', cursor: 'pointer', fontSize: '14px' }}
        >
          {showDebug ? 'HIDE DETAILED METRICS' : 'SHOW DETAILED METRICS'}
        </button>
      </div>

      {showDebug && debugData.player && (
        <div style={{ 
          position: 'fixed', right: 20, top: 20, 
          background: 'rgba(0,0,0,0.9)', padding: '20px', 
          border: '1px solid #0f0', color: '#0f0', 
          fontSize: '12px', width: '240px',
          boxShadow: '0 0 15px rgba(0,255,0,0.3)',
          zIndex: 100,
          fontFamily: 'monospace'
        }}>
          <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #0f0', paddingBottom: '5px' }}>SYSTEM ANALYTICS</h4>
          <section style={{ marginBottom: '10px' }}>
            <div style={{ color: '#fff' }}>[PLAYER POSITION]</div>
            <div>POS_X: {debugData.player.x.toFixed(5)}</div>
            <div>POS_Y: {debugData.player.y.toFixed(5)}</div>
          </section>
          <section style={{ marginBottom: '10px' }}>
            <div style={{ color: '#fff' }}>[VECTORS]</div>
            <div>DIR_X: {debugData.player.dirX.toFixed(5)}</div>
            <div>DIR_Y: {debugData.player.dirY.toFixed(5)}</div>
            <div>PLANE_X: {debugData.player.planeX.toFixed(5)}</div>
            <div>PLANE_Y: {debugData.player.planeY.toFixed(5)}</div>
          </section>
          <section>
            <div style={{ color: '#fff' }}>[CENTER RAY DATA]</div>
            <div>WALL_DIST: {debugData.centerRay?.perpWallDist.toFixed(5)}</div>
            <div>WALL_H: {debugData.centerRay?.lineHeight}px</div>
            <div>HIT_GRID: [{debugData.centerRay?.mapX}, {debugData.centerRay?.mapY}]</div>
            <div>SIDE: {debugData.centerRay?.side === 0 ? 'NS' : 'EW'}</div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Raycaster;
