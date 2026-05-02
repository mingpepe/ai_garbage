<script setup lang="ts">
import { useGameStore } from '../stores/game';
import { LEVELS } from '../utils/levels';
import { RotateCcw, Trophy, Lock } from 'lucide-vue-next';
import { onMounted, onUnmounted } from 'vue';

const store = useGameStore();

const levelIds = Object.keys(LEVELS).sort((a, b) => {
    return parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]);
});

// Engineering Mode Password logic
let inputBuffer = "";
const PASSWORD = "coding";

function handleKeydown(e: KeyboardEvent) {
    inputBuffer += e.key.toLowerCase();
    if (inputBuffer.length > 20) inputBuffer = inputBuffer.slice(-20);
    
    if (inputBuffer.includes(PASSWORD)) {
        store.engineeringMode = true;
        inputBuffer = "";
        alert('🛠️ Engineering mode activated! All levels unlocked.');
    }
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div class="bg-slate-900 p-4 md:p-6 rounded-2xl shadow-lg border-2 border-slate-800 flex flex-col lg:flex-row gap-6 items-center justify-between">
    <div class="flex flex-col gap-3 w-full lg:w-auto">
      <div class="flex items-center gap-3">
        <h2 class="text-xl md:text-2xl font-black text-robot-purple truncate">
          RoboCode: {{ store.currentLevel.name }}
        </h2>
        <div v-if="store.levelProgress[store.currentLevelId]?.completed" class="text-robot-green flex items-center gap-1 font-bold text-xs bg-robot-green/10 px-3 py-1 rounded-full shrink-0">
            <Trophy :size="14" /> Completed
        </div>
        <div v-if="store.engineeringMode" class="text-amber-500 font-black text-[10px] uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 shadow-sm">
            Debug Mode
        </div>
      </div>
      
      <!-- Responsive Level Grid -->
      <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-12 gap-1.5">
        <button 
          v-for="id in levelIds" 
          :key="id"
          @click="store.setLevel(id)"
          :disabled="store.isProgramLocked || !store.isUnlocked(id)"
          class="relative w-8 h-8 md:w-10 md:h-10 rounded-lg font-black text-[10px] md:text-xs transition-all flex items-center justify-center border-2 overflow-hidden"
          :class="[
            store.currentLevelId === id 
              ? 'bg-robot-purple text-white border-robot-purple shadow-md scale-110 z-10' 
              : !store.isUnlocked(id)
                ? 'bg-slate-800 text-slate-600 border-slate-700 opacity-60 cursor-not-allowed grayscale'
                : store.levelProgress[id]?.completed
                  ? 'bg-robot-green/10 text-robot-green border-robot-green/20 hover:bg-robot-green/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
          ]"
        >
          <span v-if="store.isUnlocked(id)">{{ id.split('_')[1] }}</span>
          <Lock v-else :size="12" class="opacity-30" />
        </button>
      </div>
    </div>

    <div class="flex items-center gap-4 md:gap-8 w-full lg:w-auto justify-between lg:justify-end">
      <div 
        v-if="store.gameStatus.message"
        class="px-4 py-2 md:px-6 md:py-3 rounded-xl font-black animate-pulse transition-colors text-xs md:text-sm max-w-[200px] text-center"
        :class="{
          'bg-robot-green/20 text-robot-green border border-robot-green/30': store.gameStatus.state === 'success',
          'bg-rose-900/40 text-rose-400 border border-rose-500/30': store.gameStatus.state === 'failed',
          'bg-sky-900/40 text-robot-blue border border-sky-500/30': store.gameStatus.state === 'executing' || store.gameStatus.state === 'stepping',
          'bg-amber-900/40 text-amber-400 border border-amber-500/30': store.gameStatus.state === 'stopped'
        }"
      >
        {{ store.gameStatus.message }}
      </div>

      <button 
        @click="store.resetRobot"
        :disabled="store.isProgramLocked"
        class="flex flex-col items-center gap-1 group text-slate-500 hover:text-robot-blue transition-colors disabled:opacity-30"
      >
        <RotateCcw class="group-hover:rotate-[-45deg] transition-transform" />
        <span class="text-[10px] font-black uppercase tracking-tighter">Reset</span>
      </button>
    </div>
  </div>
</template>
