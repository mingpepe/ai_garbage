import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useGameStore } from '@/store/gameStore';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

export const WaterSplashCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const isVictoryModalOpen = useGameStore(state => state.isVictoryModalOpen);
  const currentLevelIndex = useGameStore(state => state.currentLevelIndex);
  const evaluation = useGameStore(state => state.evaluation);

  // Clear confetti & particles immediately when victory closes or level changes
  useEffect(() => {
    if (!isVictoryModalOpen) {
      try {
        confetti.reset();
      } catch {
        // Safe catch if confetti instance is idle
      }
      particlesRef.current = [];
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [isVictoryModalOpen, currentLevelIndex]);

  useEffect(() => {
    if (isVictoryModalOpen) {
      // Fire celebration confetti
      confetti({
        particleCount: 75,
        spread: 80,
        origin: { y: 0.7 },
        colors: ['#38bdf8', '#0284c7', '#34d399', '#fbbf24', '#a855f7'],
        disableForReducedMotion: true,
      });

      // Spawn ambient water bubble particles
      const canvas = canvasRef.current;
      if (canvas) {
        const colors = ['#38bdf8', '#7dd3fc', '#bae6fd', '#34d399'];
        for (let i = 0; i < 35; i++) {
          particlesRef.current.push({
            x: canvas.width / 2 + (Math.random() - 0.5) * 400,
            y: canvas.height * 0.75 + (Math.random() - 0.5) * 150,
            vx: (Math.random() - 0.5) * 5,
            vy: -Math.random() * 6 - 2,
            size: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            decay: Math.random() * 0.02 + 0.015,
          });
        }
      }
    }
  }, [isVictoryModalOpen, evaluation.isVictory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const handleResize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // gravity
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-40"
    />
  );
};
