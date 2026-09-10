<template>
  <div class="relative flex flex-col items-center justify-center w-full">
    <canvas
      ref="canvasRef"
      :width="CANVAS_WIDTH"
      :height="CANVAS_HEIGHT"
      class="rounded-b-2xl border-b-4 border-x-4 border-amber-600 shadow-2xl bg-sky-200 outline-none w-full aspect-[4/3] block"
      tabindex="0"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useGameStore } from '@/stores/gameStore';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/core/constants';
import { GameRenderer } from '@/core/renderer';
import { soundManager } from '@/core/audio';

const gameStore = useGameStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let animId: number;
let lastTime = performance.now();
const keysHeld: Record<string, boolean> = {};

function loop(now: number) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const timeSec = now / 1000;

  const mg = gameStore.miniGameInstance;
  if (mg && !mg.isFinished) {
    // Handle keyboard movement
    const moveSpeed = 480; // px per second
    let isMovingNow = false;
    if (keysHeld['ArrowLeft'] || keysHeld['a'] || keysHeld['A']) {
      mg.moveBasket(-moveSpeed * dt);
      isMovingNow = true;
    }
    if (keysHeld['ArrowRight'] || keysHeld['d'] || keysHeld['D']) {
      mg.moveBasket(moveSpeed * dt);
      isMovingNow = true;
    }
    if (!isMovingNow) {
      mg.setMoving(false);
    }

    // Update mini-game physics
    const finished = mg.update(dt, (_fruit) => {
      soundManager.playCatchFruit();
    });

    if (finished) {
      gameStore.finishMiniGame();
      return;
    }
  }

  // Render
  const canvas = canvasRef.value;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      try {
        GameRenderer.render({
          ctx,
          scene: 'MINI_GAME',
          playerX: 0,
          playerY: 0,
          playerFacing: 'DOWN',
          playerCarry: gameStore.stateMachine.state,
          isMoving: false,
          shelves: gameStore.shelves,
          fruitPiles: gameStore.fruitPiles,
          customers: gameStore.customerManager.customers,
          particles: gameStore.particles,
          floatingTexts: gameStore.floatingTexts,
          timeSec,
          miniGame: gameStore.miniGameInstance,
        });
      } catch (err) {
        console.error('MiniGame render error:', err);
      }
    }
  }

  animId = requestAnimationFrame(loop);
}

function handleKeyDown(e: KeyboardEvent) {
  if (gameStore.currentScene !== 'MINI_GAME' || gameStore.isTransitioning) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd' || e.key === 'A' || e.key === 'D') {
    e.preventDefault();
    keysHeld[e.key] = true;
  }
}

function handleKeyUp(e: KeyboardEvent) {
  keysHeld[e.key] = false;
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
  canvasRef.value?.focus();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  cancelAnimationFrame(animId);
});
</script>
