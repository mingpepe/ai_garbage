import React, { useRef } from 'react';
import Raycaster from './Raycaster';
import True3DView from './True3DView';
import Manual3DView from './Manual3DView';
import type { Player } from './raycaster/engine';
import './App.css';

function App() {
  const playerRef = useRef<Player>({
    x: 5.5,
    y: 5.5,
    dirX: -1,
    dirY: 0,
    planeX: 0,
    planeY: 0.66,
  });

  return (
    <div className="App" style={{ minHeight: '100vh', background: '#050505', color: '#fff', padding: '20px', fontFamily: 'monospace' }}>
      <h1 style={{ textAlign: 'center', color: '#0f0', margin: '0 0 20px 0', textShadow: '0 0 10px #0f0' }}>EVOLUTION OF 3D RENDERING</h1>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
        {/* Layer 1: Raycasting Views (2D and 2.5D) */}
        <Raycaster playerRef={playerRef} />
        
        {/* Layer 2: True 3D Views (WebGL and Manual Projection) */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <True3DView playerRef={playerRef} />
          <Manual3DView playerRef={playerRef} />
        </div>
      </div>

      <div style={{ marginTop: '30px', textAlign: 'center', color: '#555', fontSize: '12px' }}>
        Use Arrow Keys to navigate. All views are synchronized to the same player position.
      </div>
    </div>
  );
}

export default App;
