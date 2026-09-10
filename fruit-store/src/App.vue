<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-2 sm:p-3 bg-slate-950/70">
    <!-- Main Game Container: enlarged to fill viewport comfortably -->
    <div
      class="flex flex-col items-center shadow-2xl rounded-2xl overflow-hidden bg-amber-900 border-4 border-amber-700 w-full transition-all"
      style="max-width: min(1200px, 96vw, calc((95vh - 70px) * 4 / 3));"
    >
      <!-- Zero-Text HUD Header -->
      <ZeroTextHud />

      <!-- Canvas Viewport -->
      <div class="relative w-full overflow-hidden">
        <MiniGameCanvas v-if="gameStore.currentScene === 'MINI_GAME'" />
        <GameCanvas v-else />

        <!-- Snappy Scene Transition Curtain (Fast, smooth, never drags) -->
        <div
          class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-stone-950 transition-opacity ease-in-out"
          :class="gameStore.isTransitioning ? 'opacity-100' : 'opacity-0'"
          style="transition-duration: 120ms;"
        >
          <!-- Subtle warm door portal glow -->
          <div
            class="w-24 h-24 rounded-full bg-amber-500/20 blur-xl transition-all duration-120"
            :class="gameStore.isTransitioning ? 'scale-100 opacity-100' : 'scale-50 opacity-0'"
          />
        </div>
      </div>
    </div>

    <!-- Modals -->
    <CashRegisterModal v-if="gameStore.isCashRegisterOpen" />
    <AdminPinModal v-if="adminStore.isPinModalOpen" />
    <AdminSettingsModal v-if="adminStore.isSettingsModalOpen" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useGameStore } from '@/stores/gameStore';
import { useAdminStore } from '@/stores/adminStore';
import { BackgroundTicker } from '@/core/backgroundTimer';
import ZeroTextHud from '@/components/ZeroTextHud.vue';
import GameCanvas from '@/components/GameCanvas.vue';
import MiniGameCanvas from '@/components/MiniGameCanvas.vue';
import CashRegisterModal from '@/components/CashRegisterModal.vue';
import AdminPinModal from '@/components/AdminPinModal.vue';
import AdminSettingsModal from '@/components/AdminSettingsModal.vue';

const gameStore = useGameStore();
const adminStore = useAdminStore();

let ticker: BackgroundTicker | null = null;

onMounted(() => {
  ticker = new BackgroundTicker((dt) => {
    gameStore.tick(dt);
  });
  ticker.start();
});

onUnmounted(() => {
  ticker?.stop();
});
</script>
