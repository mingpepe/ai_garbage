<template>
  <div class="relative flex flex-col items-center justify-center w-full">
    <canvas
      ref="canvasRef"
      :width="CANVAS_WIDTH"
      :height="CANVAS_HEIGHT"
      class="rounded-b-2xl border-b-4 border-x-4 border-amber-600 shadow-2xl bg-amber-100 outline-none w-full aspect-[4/3] block"
      tabindex="0"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useGameStore } from '@/stores/gameStore';
import { useAdminStore } from '@/stores/adminStore';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/core/constants';
import { GameRenderer } from '@/core/renderer';

const gameStore = useGameStore();
const adminStore = useAdminStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let animId: number;
let lastTime = performance.now();
let lastMoveTime = 0;
const moveIntervalMs = 120; // smooth grid step rate
const keysHeld: Record<string, boolean> = {};

function loop(now: number) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const timeSec = now / 1000;

  // Handle continuous movement when key held
  if (!gameStore.isCashRegisterOpen && !adminStore.isPinModalOpen && !adminStore.isSettingsModalOpen && !gameStore.isTransitioning) {
    if (now - lastMoveTime >= moveIntervalMs) {
      let moved = false;
      if (keysHeld['ArrowUp'] || keysHeld['w'] || keysHeld['W']) {
        gameStore.movePlayer(0, -1);
        moved = true;
      } else if (keysHeld['ArrowDown'] || keysHeld['s'] || keysHeld['S']) {
        gameStore.movePlayer(0, 1);
        moved = true;
      } else if (keysHeld['ArrowLeft'] || keysHeld['a'] || keysHeld['A']) {
        gameStore.movePlayer(-1, 0);
        moved = true;
      } else if (keysHeld['ArrowRight'] || keysHeld['d'] || keysHeld['D']) {
        gameStore.movePlayer(1, 0);
        moved = true;
      }

      if (moved) {
        lastMoveTime = now;
      } else {
        gameStore.stopMoving();
      }
    }
  }

  // Update simulation via gameStore.tick
  gameStore.tick(dt);

  // Render Canvas
  const canvas = canvasRef.value;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      try {
        GameRenderer.render({
          ctx,
          scene: gameStore.currentScene,
          playerX: gameStore.playerX,
          playerY: gameStore.playerY,
          playerFacing: gameStore.playerFacing,
          playerCarry: gameStore.stateMachine.state,
          isMoving: gameStore.isMoving,
          shelves: gameStore.shelves,
          fruitPiles: gameStore.fruitPiles,
          customers: gameStore.customerManager.customers,
          particles: gameStore.particles,
          floatingTexts: gameStore.floatingTexts,
          timeSec,
          activeInteraction: gameStore.getNearbyInteractable() ?? undefined,
        });
      } catch (err) {
        console.error('Render error:', err);
      }
    }
  }

  animId = requestAnimationFrame(loop);
}

function handleKeyDown(e: KeyboardEvent) {
  if (gameStore.currentScene === 'MINI_GAME' || gameStore.isTransitioning) return;
  if (gameStore.isCashRegisterOpen || adminStore.isPinModalOpen || adminStore.isSettingsModalOpen) return;

  const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'];
  if (moveKeys.includes(e.key)) {
    e.preventDefault();
    if (!keysHeld[e.key]) {
      // Immediate response on initial key press
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') gameStore.movePlayer(0, -1);
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') gameStore.movePlayer(0, 1);
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') gameStore.movePlayer(-1, 0);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') gameStore.movePlayer(1, 0);
      lastMoveTime = performance.now();
    }
    keysHeld[e.key] = true;
  } else if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    gameStore.handleInteract();
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
