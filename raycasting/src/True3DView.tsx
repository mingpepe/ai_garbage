import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MAP, MAP_SIZE } from './raycaster/engine';
import type { Player } from './raycaster/engine';

interface True3DViewProps {
  playerRef: React.MutableRefObject<Player>;
}

const WALL_COLORS: Record<number, number> = {
  1: 0x2980b9, 2: 0xc0392b, 3: 0xf1c40f, 4: 0x27ae60,
};

function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

const True3DView: React.FC<True3DViewProps> = ({ playerRef }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const available = isWebGLAvailable();
    if (!available) console.warn('WebGL is NOT supported on this system/browser.');
    setIsSupported(available);
  }, []);

  useEffect(() => {
    if (!isSupported || !mountRef.current) return;

    let renderer: THREE.WebGLRenderer;
    let animationId: number;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(400, 400);
      mountRef.current.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050505);
      scene.fog = new THREE.Fog(0x050505, 2, 8);

      const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 100);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(5, 10, 5);
      scene.add(dirLight);

      const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
      const materials: Record<number, THREE.MeshLambertMaterial> = {};
      for (const key in WALL_COLORS) {
        materials[key] = new THREE.MeshLambertMaterial({ color: WALL_COLORS[key] });
      }

      for (let x = 0; x < MAP_SIZE; x++) {
        for (let y = 0; y < MAP_SIZE; y++) {
          if (MAP[x][y] > 0) {
            const material = materials[MAP[x][y]] || materials[1];
            const cube = new THREE.Mesh(wallGeometry, material);
            cube.position.set(y, 0, x);
            scene.add(cube);
          }
        }
      }

      const animate = () => {
        const p = playerRef.current;
        camera.position.set(p.y, 0, p.x);
        camera.lookAt(p.y + p.dirY, 0, p.x + p.dirX);
        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };
      animate();

      return () => {
        cancelAnimationFrame(animationId);
        if (mountRef.current && renderer.domElement) mountRef.current.removeChild(renderer.domElement);
        renderer.dispose();
        wallGeometry.dispose();
      };
    } catch (e) {
      console.error('WebGL Initialization Error:', e);
      setIsSupported(false);
    }
  }, [isSupported, playerRef]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0a0a0a', border: '1px solid #444', padding: '15px' }}>
      <h3 style={{ color: '#0ff', margin: '0 0 10px 0', fontSize: '16px' }}>VIEW 3: WEBGL 3D</h3>
      <div style={{ width: '400px', height: '400px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isSupported === false ? (
          <div style={{ color: '#f00', textAlign: 'center' }}>
            <div>WebGL Not Supported</div>
          </div>
        ) : (
          <div ref={mountRef} />
        )}
      </div>
    </div>
  );
};

export default True3DView;
