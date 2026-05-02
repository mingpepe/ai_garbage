<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useGameStore } from '../stores/game';
import { Zap, ChevronUp, Star, Key, Lock, Unlock, CircleDashed, Waves, Sailboat, Plane, Target, Box, Radio } from 'lucide-vue-next';

const store = useGameStore();

const ITEM_COLORS: Record<string, string> = {
    blue: '#4cc9f0',
    red: '#ef4444',
    yellow: '#f59e0b',
    green: '#22c55e',
    purple: '#a855f7',
    orange: '#fb923c',
    pink: '#f472b6',
    cyan: '#22d3ee'
};

const TRIGGER_COLORS = [
    '#a855f7', // purple
    '#fb923c', // orange
    '#f472b6', // pink
    '#22d3ee', // cyan
    '#f59e0b', // yellow
    '#ef4444', // red
    '#22c55e', // green
    '#4cc9f0'  // blue
];

function getTriggerColor(setId: number) {
    return TRIGGER_COLORS[(setId - 1) % TRIGGER_COLORS.length];
}

function itemColor(color?: string) {
    return ITEM_COLORS[color || 'blue'] || color || ITEM_COLORS.blue;
}

const gridSize = computed(() => store.currentLevel.gridSize);
const cellWidth = computed(() => 100 / gridSize.value[0]);
const cellHeight = computed(() => 100 / gridSize.value[1]);

const robotStyle = computed(() => {
  const { x, y, dir } = store.robotPos;
  return {
    left: `${x * cellWidth.value}%`,
    top: `${y * cellHeight.value}%`,
    width: `${cellWidth.value}%`,
    height: `${cellHeight.value}%`,
    transform: `rotate(${dir * 90}deg)`,
  };
});

function getRockStyle(rock: { x: number, y: number }) {
  return {
    left: `${rock.x * cellWidth.value}%`,
    top: `${rock.y * cellHeight.value}%`,
    width: `${cellWidth.value}%`,
    height: `${cellHeight.value}%`,
  };
}

function isObstacle(x: number, y: number) {
  return store.currentLevel.obstacles.some(ob => ob[0] === x && ob[1] === y);
}

function isWater(x: number, y: number) {
  return store.currentLevel.waterTiles?.some(tile => Math.round(tile.x) === x && Math.round(tile.y) === y) === true;
}

function isBoat(x: number, y: number) {
  return store.currentLevel.boats?.some(tile => tile.x === x && tile.y === y) === true;
}

function isPlane(x: number, y: number) {
  return store.currentLevel.planes?.some(tile => tile.x === x && tile.y === y) === true;
}

function isGoal(x: number, y: number) {
  return store.currentLevel.goal.x === x && store.currentLevel.goal.y === y;
}

function getCollectibleAt(x: number, y: number) {
    const idx = store.currentLevel.collectibles?.findIndex(c => c.x === x && c.y === y);
    if (idx === undefined || idx === -1) return null;
    return { idx, isCollected: store.collectedIds.has(`coll-${idx}`) };
}

function getKeyAt(x: number, y: number) {
    const idx = store.currentLevel.keys?.findIndex(k => k.x === x && k.y === y);
    if (idx === undefined || idx === -1) return null;
    const key = store.currentLevel.keys?.[idx];
    return { idx, color: itemColor(key?.color), isCollected: store.collectedKeyIds.has(`key-${idx}`) };
}

function getDoorAt(x: number, y: number) {
    const idx = store.currentLevel.doors?.findIndex(d => d.x === x && d.y === y);
    if (idx === undefined || idx === -1) return null;
    const door = store.currentLevel.doors?.[idx];
    return { idx, color: itemColor(door?.color), isOpen: store.openDoors.has(`door-${idx}`) };
}

function getPortalAt(x: number, y: number) {
    return store.currentLevel.portals?.find(p => (p.posA.x === x && p.posA.y === y) || (p.posB.x === x && p.posB.y === y));
}

function getTriggerButtonAt(x: number, y: number) {
    return store.currentLevel.triggerButtons?.find(b => Math.round(b.x) === x && Math.round(b.y) === y);
}

function getTriggerDoorAt(x: number, y: number) {
    return store.currentLevel.triggerDoors?.find(d => Math.round(d.x) === x && Math.round(d.y) === y);
}

// Force sync rockPosList when level changes
watch(() => store.currentLevelId, () => {
    store.resetRobot();
}, { immediate: true });

onMounted(() => {
    store.resetRobot();
});
</script>

<template>
  <div class="relative w-full bg-slate-900 rounded-xl shadow-2xl overflow-hidden border-8 border-slate-800 font-comic"
       :style="{ aspectRatio: `${gridSize[0]}/${gridSize[1]}` }">
    
    <div class="absolute inset-0 bg-slate-800 opacity-30"></div>

    <!-- Background Grid -->
    <div class="absolute inset-0 grid" 
         :style="{ 
            gridTemplateColumns: `repeat(${gridSize[0]}, 1fr)`,
            gridTemplateRows: `repeat(${gridSize[1]}, 1fr)` 
         }">
      <div v-for="i in (gridSize[0] * gridSize[1])" :key="`bg-${i}`" 
           class="border-[0.5px] border-slate-700/20 bg-slate-900/10">
      </div>
    </div>

    <!-- Elements Layer -->
    <template v-for="y in gridSize[1]" :key="`row-${y}`">
      <template v-for="x in gridSize[0]" :key="`cell-${x-1}-${y-1}`">
        <div 
          class="absolute flex items-center justify-center pointer-events-none"
          :style="{
            left: `${(x-1) * cellWidth}%`,
            top: `${(y-1) * cellHeight}%`,
            width: `${cellWidth}%`,
            height: `${cellHeight}%`
          }"
        >
          <!-- Obstacles -->
          <div v-if="isObstacle(x-1, y-1)" class="w-full h-full p-[2px]">
            <div class="obstacle-rock w-full h-full flex items-center justify-center border border-slate-600/30 overflow-hidden">
                <div class="w-full h-full bg-black/10 flex flex-wrap gap-1 p-1">
                    <div v-for="n in 3" :key="n" class="w-1 h-1 bg-white/5 rounded-full"></div>
                </div>
            </div>
          </div>

          <!-- Water Tiles -->
          <div v-if="isWater(x-1, y-1)" class="w-full h-full p-1">
            <div class="w-full h-full rounded bg-sky-300/60 border-2 border-sky-500/70 flex items-center justify-center overflow-hidden">
              <Waves :size="42" class="text-sky-700" stroke-width="3" />
            </div>
          </div>

          <!-- Boat -->
          <div v-if="isBoat(x-1, y-1)" class="w-full h-full flex items-center justify-center">
            <div class="bg-sky-500/20 w-full h-full rounded-full blur-[4px] absolute animate-pulse"></div>
            <Sailboat :size="44" class="text-white drop-shadow-[0_0_8px_#4cc9f0]" />
          </div>

          <!-- Plane -->
          <div v-if="isPlane(x-1, y-1)" class="w-full h-full flex items-center justify-center">
            <Plane :size="38" class="text-emerald-500 drop-shadow-md" />
          </div>

          <!-- Collectibles (Energy Stones) -->
          <div v-if="getCollectibleAt(x-1, y-1)" class="transition-all duration-500" :class="getCollectibleAt(x-1, y-1)?.isCollected ? 'scale-0 opacity-0' : 'scale-100 opacity-100'">
            <Star :size="40" fill="#FFCA3A" class="text-amber-500 drop-shadow-[0_0_5px_rgba(255,202,58,0.8)] animate-pulse" />
          </div>

          <!-- Keys -->
          <div v-if="getKeyAt(x-1, y-1)" class="transition-all duration-500" :class="getKeyAt(x-1, y-1)?.isCollected ? 'scale-0 opacity-0' : 'scale-100 opacity-100'">
            <Key :size="40" :color="getKeyAt(x-1, y-1)?.color" class="drop-shadow-md animate-bounce" stroke-width="3" />
          </div>

          <!-- Regular Key Doors -->
          <div v-if="getDoorAt(x-1, y-1)" class="w-full h-full p-0.5 transition-all duration-500 relative" :class="getDoorAt(x-1, y-1)?.isOpen ? 'opacity-20 grayscale' : 'opacity-100'">
            <div class="w-full h-full rounded flex items-center justify-center border-4 shadow-xl" :style="{ backgroundColor: getDoorAt(x-1, y-1)?.color, borderColor: 'rgba(255,255,255,0.2)' }">
                <div class="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
                <Unlock v-if="getDoorAt(x-1, y-1)?.isOpen" :size="28" class="text-slate-300 z-10" />
                <Lock v-else :size="28" class="text-white z-10" />
                <div class="absolute -top-1.5 -left-1.5 bg-slate-900 border-2 rounded-full p-1.5 flex items-center justify-center shadow-md" :style="{ borderColor: getDoorAt(x-1, y-1)?.color }">
                    <Key :size="14" :color="getDoorAt(x-1, y-1)?.color" />
                </div>
            </div>
          </div>

          <!-- Portals -->
          <div v-if="getPortalAt(x-1, y-1)" class="relative w-full h-full flex items-center justify-center">
             <CircleDashed :size="50" :color="getPortalAt(x-1, y-1)?.color" class="animate-spin-slow opacity-60" stroke-width="4" />
             <div class="absolute w-8 h-8 rounded-full blur-[2px]" :style="{ backgroundColor: getPortalAt(x-1, y-1)?.color }"></div>
          </div>

          <!-- Trigger Buttons -->
          <div v-if="getTriggerButtonAt(x-1, y-1)" class="w-full h-full flex items-center justify-center p-1 opacity-80 relative">
            <div class="w-full h-full rounded-xl border-4 flex items-center justify-center transition-all duration-300 shadow-inner"
                 :style="{ 
                    borderColor: getTriggerColor(getTriggerButtonAt(x-1, y-1)!.setId),
                    backgroundColor: store.activeTriggerSets.has(getTriggerButtonAt(x-1, y-1)!.setId) ? getTriggerColor(getTriggerButtonAt(x-1, y-1)!.setId) : 'rgba(0,0,0,0.3)'
                 }">
                <Target :size="28" :class="store.activeTriggerSets.has(getTriggerButtonAt(x-1, y-1)!.setId) ? 'text-white scale-110' : 'text-slate-600'" />
                <div class="absolute -top-1.5 -left-1.5 bg-slate-800 border-2 px-2 rounded-full flex items-center justify-center shadow-md" :style="{ borderColor: getTriggerColor(getTriggerButtonAt(x-1, y-1)!.setId) }">
                    <span class="text-[10px] font-black" :style="{ color: getTriggerColor(getTriggerButtonAt(x-1, y-1)!.setId) }">
                        {{ getTriggerButtonAt(x-1, y-1)!.setId }}
                    </span>
                </div>
            </div>
          </div>

          <!-- Trigger Doors -->
          <div v-if="getTriggerDoorAt(x-1, y-1)" class="w-full h-full p-0.5 transition-all duration-500 relative" 
               :class="store.activeTriggerSets.has(getTriggerDoorAt(x-1, y-1)!.setId) ? 'opacity-20 grayscale scale-90' : 'opacity-100'">
            <div class="w-full h-full rounded-lg flex items-center justify-center border-4 shadow-lg relative overflow-hidden" 
                 :style="{ 
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    borderColor: getTriggerColor(getTriggerDoorAt(x-1, y-1)!.setId)
                 }">
                <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                <Lock v-if="!store.activeTriggerSets.has(getTriggerDoorAt(x-1, y-1)!.setId)" :size="32" class="text-white z-10" />
                <Unlock v-else :size="32" class="text-slate-400 z-10" />
                <div class="absolute -top-2 -left-2 bg-slate-900 border-2 rounded-full p-1.5 flex items-center justify-center shadow-md" :style="{ borderColor: getTriggerColor(getTriggerDoorAt(x-1, y-1)!.setId) }">
                    <Radio :size="12" :color="getTriggerColor(getTriggerDoorAt(x-1, y-1)!.setId)" />
                </div>
                <div class="absolute bottom-0 left-0 right-0 h-1.5" :style="{ backgroundColor: getTriggerColor(getTriggerDoorAt(x-1, y-1)!.setId) }"></div>
            </div>
          </div>

          <!-- Saved Position Markers -->
          <div v-for="(pos, idx) in store.savedPositions" :key="`mark-${idx}`">
            <div v-if="pos.x === x-1 && pos.y === y-1" class="absolute inset-0 flex items-center justify-center">
                <div class="w-10 h-10 border-2 border-slate-400 rounded-full flex items-center justify-center bg-slate-800/50 backdrop-blur-sm animate-in zoom-in-0 duration-300">
                    <span class="text-[12px] font-black text-slate-300">{{ idx + 1 }}</span>
                </div>
            </div>
          </div>
          
          <!-- Goal -->
          <div v-if="isGoal(x-1, y-1)" class="flex items-center justify-center w-full h-full">
            <div class="w-[90%] h-[90%] bg-robot-green/30 rounded-lg animate-pulse absolute border-2 border-robot-green/50"></div>
            <Zap :size="gridSize[0] > 6 ? 40 : 54" class="text-robot-green drop-shadow-[0_0_8px_#4ade80] z-10 fill-robot-green" />
          </div>
        </div>
      </template>
    </template>

    <!-- Rocks (Always rendered absolulte for visibility) -->
    <div 
      v-for="(rock, idx) in store.rockPosList" 
      :key="`rock-v3-${idx}`"
      class="absolute flex items-center justify-center pointer-events-none transition-all duration-300 ease-out z-10"
      :style="getRockStyle(rock)"
    >
        <div class="w-[94%] h-[94%] bg-slate-500 rounded-lg shadow-2xl border-b-4 border-slate-800 flex items-center justify-center relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
            <Box :size="gridSize[0] > 10 ? 24 : 34" class="text-slate-100 opacity-80 drop-shadow-md" />
            <div class="absolute top-1 left-1 w-2.5 h-1.5 bg-white/30 rounded-full blur-[1px]"></div>
        </div>
    </div>

    <!-- Robot -->
    <div 
      class="absolute p-1.5 z-20 flex items-center justify-center pointer-events-none transition-all duration-300 ease-in-out"
      :style="robotStyle"
    >
      <div class="relative w-[90%] h-[95%] bg-slate-800 rounded-xl flex flex-col items-center shadow-xl border-t-2 border-slate-500 overflow-visible">
        <div class="absolute -top-1 w-1/2 h-2 bg-slate-700 rounded-t-full border-t border-slate-500"></div>
        <div class="absolute bottom-1 right-2 w-1 h-3 bg-slate-600"></div>
        <div class="absolute bottom-4 right-1.5 w-2 h-2 rounded-full z-30" :class="store.gameStatus.state === 'executing' ? 'bg-robot-pink animate-ping' : 'bg-robot-blue'"></div>
        <div class="w-[85%] h-[45%] mt-2 bg-slate-900 rounded-lg border border-slate-700 flex flex-col items-center justify-center gap-1 shadow-inner relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-b from-transparent via-robot-blue/10 to-transparent h-2 animate-bounce"></div>
            <div class="flex gap-3 z-10">
                <div v-if="store.gameStatus.state === 'failed'" class="text-rose-500 font-bold text-sm leading-none">× ×</div>
                <div v-else-if="store.gameStatus.state === 'success'" class="text-robot-green font-bold text-sm leading-none">^ ^</div>
                <div v-else class="flex gap-3">
                    <div class="w-3 h-3 bg-robot-blue rounded-full shadow-[0_0_8px_#4cc9f0] border border-white/20"></div>
                    <div class="w-3 h-3 bg-robot-blue rounded-full shadow-[0_0_8px_#4cc9f0] border border-white/20"></div>
                </div>
            </div>
        </div>
        <div class="flex-1 w-full flex flex-col items-center justify-center opacity-40">
            <ChevronUp :size="20" class="text-slate-500 -mb-2" stroke-width="4" />
            <ChevronUp :size="16" class="text-slate-500" stroke-width="3" />
        </div>
        <div class="absolute inset-0 rounded-xl pointer-events-none" :class="store.gameStatus.state === 'success' ? 'bg-robot-green/20 shadow-[0_0_30px_#4ade80]' : ''"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-spin-slow {
    animation: spin 3s linear infinite;
}
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
</style>
