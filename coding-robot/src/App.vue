<script setup lang="ts">
import ControlPanel from './components/ControlPanel.vue';
import RobotStage from './components/RobotStage.vue';
import CommandPalette from './components/CommandPalette.vue';
import CodingArea from './components/CodingArea.vue';
import LevelEditor from './components/LevelEditor.vue';
import { useGameStore } from './stores/game';
import { Settings } from 'lucide-vue-next';

const store = useGameStore();
</script>

<template>
  <!-- Editor Mode -->
  <LevelEditor v-if="store.mode === 'editor' && store.engineeringMode" />

  <!-- Play Mode -->
  <div v-else class="min-h-screen p-4 md:p-8 flex flex-col gap-6 max-w-[1840px] mx-auto text-slate-200">
    <ControlPanel />

    <main class="flex-1 flex flex-col lg:flex-row gap-6">
      <!-- Left: Game World -->
      <div class="lg:w-[500px] xl:w-[600px] flex flex-col gap-6">
        <RobotStage />
        
        <div class="flex flex-col gap-4">
          <!-- Stats Panel -->
          <div class="bg-slate-900 p-6 rounded-2xl text-white flex justify-between items-center shadow-2xl border-b-4 border-black/40">
             <div class="flex flex-col gap-1">
                <span class="text-[10px] text-slate-500 font-black uppercase tracking-widest">Progress</span>
                <span class="text-xl font-black text-robot-blue">
                   Level {{ store.currentLevelId.split('_')[1] }}
                </span>
             </div>
             
             <div class="h-12 w-px bg-slate-800 mx-4"></div>
             
             <button v-if="store.engineeringMode" @click="store.enterEditor" class="flex flex-col items-center gap-1 group text-slate-500 hover:text-robot-purple transition-colors">
                <Settings class="group-hover:rotate-90 transition-transform" />
                <span class="text-[10px] font-black uppercase">Level Editor</span>
             </button>
          </div>

          <div v-if="store.gameStatus.state === 'failed'" class="p-4 bg-rose-600 text-white rounded-xl font-black text-center shadow-lg animate-bounce">
              {{ store.gameStatus.message }}<br/>
              <span class="text-xs opacity-80 mt-1 block">Click "Reset" in the top right and try again!</span>
          </div>
        </div>
      </div>

      <!-- Right: Coding Tools -->
      <div class="flex-1 flex flex-col sm:flex-row gap-6 min-w-0">
        <div class="sm:w-[22rem] xl:w-[24rem] shrink-0">
          <CommandPalette />
        </div>
        <div class="flex-1 min-w-0 max-w-[760px]">
          <CodingArea />
        </div>
      </div>
    </main>

  </div>
</template>

<style>
#app {
  width: 100%;
}
</style>
