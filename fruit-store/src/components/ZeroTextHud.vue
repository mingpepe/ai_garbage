<template>
  <div class="flex items-center justify-between w-full px-5 py-2.5 bg-amber-900/90 rounded-t-2xl border-t-2 border-x-2 border-amber-600/60 shadow-lg text-white">
    <!-- Left: Piggy Bank & Coins -->
    <div class="flex items-center gap-2.5 bg-amber-950/70 px-4 py-2 rounded-full border border-amber-500/40">
      <span class="text-3xl animate-bounce-soft">🪙</span>
      <span class="font-bold text-2xl text-yellow-300 font-mono tracking-wider">{{ gameStore.totalCoins }}</span>
    </div>

    <!-- Center: Hand / Carry Status -->
    <div class="flex items-center gap-2 bg-amber-950/70 px-5 py-2 rounded-full border border-amber-500/40">
      <span class="text-sm text-amber-200">🎒</span>
      <div class="flex items-center gap-2">
        <span v-if="carryState.type === 'EMPTY'" class="text-2xl">🖐️</span>
        <span v-else-if="carryState.type === 'MIST_SPRAYER'" class="text-2xl">🚿</span>
        <span v-else-if="carryState.type === 'ROTTEN_FRUIT'" class="text-2xl">🤢</span>
        <span v-else-if="carryState.type === 'BASKET_EMPTY'" class="text-2xl">🧺</span>
        <div v-else-if="carryState.type === 'BASKET_FULL'" class="flex items-center gap-1.5">
          <span class="text-2xl">📦</span>
          <span class="text-2xl">{{ currentFruitIcon }}</span>
          <span class="bg-rose-500 text-white text-sm font-bold px-2 py-0.5 rounded-full">{{ carryState.count }}</span>
        </div>
      </div>
    </div>

    <!-- Right: Admin Gear Button -->
    <div class="flex items-center gap-2">
      <button
        id="admin-gear-btn"
        class="w-11 h-11 flex items-center justify-center rounded-full bg-amber-800 hover:bg-amber-700 active:scale-95 transition-all text-2xl shadow-md border border-amber-400/50"
        @click="openAdmin"
        title="工程模式"
      >
        ⚙️
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '@/stores/gameStore';
import { useAdminStore } from '@/stores/adminStore';
import { FRUIT_MAP } from '@/core/constants';

const gameStore = useGameStore();
const adminStore = useAdminStore();

const carryState = computed(() => gameStore.stateMachine.state);
const currentFruitIcon = computed(() => {
  if (carryState.value.fruitId) {
    return FRUIT_MAP.get(carryState.value.fruitId)?.icon ?? '🍎';
  }
  return '🍎';
});

function openAdmin() {
  adminStore.openPinModal();
}
</script>
