<script setup lang="ts">
import draggable from 'vuedraggable';
import { useGameStore } from '../stores/game';
import { Play, SkipForward, Square, Trash2, Code2, ChevronDown, ChevronUp, MousePointer2 } from 'lucide-vue-next';
import CommandBlock from './CommandBlock.vue';
import { ref, watch, nextTick, computed } from 'vue';

const store = useGameStore();
const expandedFunc = ref<'A' | 'B' | null>(null);
const mainScrollRef = ref<HTMLElement | null>(null);
const funcAScrollRef = ref<HTMLElement | null>(null);
const funcBScrollRef = ref<HTMLElement | null>(null);

// Reactive computed for vuedraggable v-model
const commandQueue = computed({
  get: () => store.commandQueue,
  set: (val) => { store.commandQueue = val }
});

const functionAQueue = computed({
  get: () => store.functionAQueue,
  set: (val) => { store.functionAQueue = val }
});

const functionBQueue = computed({
  get: () => store.functionBQueue,
  set: (val) => { store.functionBQueue = val }
});

// Sync store's active target
watch(expandedFunc, (val) => {
    if (val === null) store.currentActiveTarget = 'main';
    else store.currentActiveTarget = val;
}, { immediate: true });

// Auto-scroll to bottom when new commands added
watch(() => store.commandQueue.length, async () => {
    await nextTick();
    if (mainScrollRef.value) {
        mainScrollRef.value.scrollTo({ top: mainScrollRef.value.scrollHeight, behavior: 'smooth' });
    }
});

watch(() => store.functionAQueue.length, async () => {
    await nextTick();
    if (funcAScrollRef.value) {
        funcAScrollRef.value.scrollTo({ top: funcAScrollRef.value.scrollHeight, behavior: 'smooth' });
    }
});

watch(() => store.functionBQueue.length, async () => {
    await nextTick();
    if (funcBScrollRef.value) {
        funcBScrollRef.value.scrollTo({ top: funcBScrollRef.value.scrollHeight, behavior: 'smooth' });
    }
});

function clearCommands() {
  if (store.isProgramLocked) return;
  store.cancelStepping();
  store.commandQueue = [];
  store.functionAQueue = [];
  store.functionBQueue = [];
}

function onMove() {
    return true;
}

function toggleFunc(id: 'A' | 'B') {
    expandedFunc.value = expandedFunc.value === id ? null : id;
}
</script>

<template>
  <div class="flex-1 flex flex-col gap-3 h-full max-h-[85vh] font-comic">
    <!-- Main Program Area -->
    <div 
        class="flex-1 flex flex-col bg-slate-900 p-3 rounded-2xl min-h-0 border-2 transition-colors duration-300" 
        :class="expandedFunc === null ? 'border-robot-pink shadow-inner' : 'border-slate-800'"
        @click="expandedFunc = null"
    >
        <div class="flex justify-between items-center mb-2 shrink-0">
            <h3 class="text-sm font-black flex items-center gap-2 uppercase tracking-tighter text-slate-100">
                <span class="bg-robot-pink text-white w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-sm">M</span>
                Main Program
                <MousePointer2 v-if="expandedFunc === null" :size="12" class="text-robot-pink animate-pulse" />
            </h3>
            <div class="flex gap-2">
                <button @click.stop="clearCommands" :disabled="store.isProgramLocked" class="p-1.5 bg-slate-800 text-slate-500 hover:text-rose-500 rounded-lg disabled:opacity-30 shadow-sm transition-all border border-slate-700">
                    <Trash2 :size="16" />
                </button>
                <template v-if="store.gameStatus.state === 'executing'">
                    <button @click.stop="store.stopExecution" class="px-5 py-1.5 bg-rose-600 text-white font-black rounded-xl shadow-md hover:scale-105 flex items-center gap-2 text-sm transition-all">
                        <Square :size="14" fill="currentColor" /> Stop
                    </button>
                </template>
                <template v-else>
                    <button @click.stop="store.runSingleStep" :disabled="store.commandQueue.length === 0 || store.isStepRunning" class="px-4 py-1.5 bg-robot-blue text-white font-black rounded-xl shadow-md hover:scale-105 disabled:opacity-50 flex items-center gap-2 text-sm transition-all">
                        <SkipForward :size="15" fill="currentColor" /> Step
                    </button>
                    <button v-if="store.gameStatus.state === 'stepping'" @click.stop="store.stopExecution" class="px-4 py-1.5 bg-rose-600 text-white font-black rounded-xl shadow-md hover:scale-105 flex items-center gap-2 text-sm transition-all">
                        <Square :size="14" fill="currentColor" /> Stop
                    </button>
                    <button v-else @click.stop="store.runCommands" :disabled="store.commandQueue.length === 0" class="px-5 py-1.5 bg-robot-green text-white font-black rounded-xl shadow-md hover:scale-105 disabled:opacity-50 flex items-center gap-2 text-sm transition-all">
                        <Play :size="16" fill="currentColor" /> Run
                    </button>
                </template>
            </div>
        </div>
        
        <!-- Drop Area Container -->
        <div class="flex-1 bg-slate-950/50 rounded-xl border-2 border-dashed border-slate-800 overflow-hidden relative">
            <div ref="mainScrollRef" class="absolute inset-0 overflow-y-auto p-2 custom-scrollbar scroll-smooth">
                <draggable 
                    v-model="commandQueue" 
                    group="commands" 
                    item-key="id" 
                    tag="div"
                    :move="onMove" 
                    :disabled="store.isProgramLocked" 
                    class="flex flex-col gap-2 min-h-full pb-32" 
                    ghost-class="opacity-50"
                    @change="store.cancelStepping"
                    :animation="200"
                >
                    <template #item="{ element }">
                        <CommandBlock :command="element" @remove="store.removeCommand(element.id)" />
                    </template>
                </draggable>
            </div>
        </div>
    </div>

    <!-- Functions Areas -->
    <div class="flex flex-col gap-2 shrink-0">
        <!-- Function A -->
        <div class="bg-cyan-950/20 rounded-2xl border-2 transition-all duration-300" :class="expandedFunc === 'A' ? 'border-cyan-500 shadow-sm' : 'border-slate-800 opacity-60'">
            <button @click="toggleFunc('A')" class="w-full flex items-center justify-between p-2.5">
                <h3 class="text-xs font-black flex items-center gap-2 text-cyan-500 uppercase">
                    <Code2 :size="14" /> Function A
                    <MousePointer2 v-if="expandedFunc === 'A'" :size="10" class="text-cyan-500 animate-pulse" />
                </h3>
                <ChevronUp v-if="expandedFunc === 'A'" :size="14" class="text-cyan-400"/>
                <ChevronDown v-else :size="14" class="text-cyan-400"/>
            </button>
            <div v-show="expandedFunc === 'A'" class="px-2.5 pb-2.5 h-32">
                <div class="h-full bg-slate-950/50 rounded-xl border-2 border-dashed border-cyan-900/50 overflow-hidden relative">
                    <div ref="funcAScrollRef" class="absolute inset-0 overflow-y-auto p-1.5 custom-scrollbar pb-16">
                        <draggable v-model="functionAQueue" group="commands" item-key="id" tag="div" :move="onMove" :disabled="store.isProgramLocked" class="flex flex-col gap-1.5 min-h-full" ghost-class="opacity-50" @change="store.cancelStepping" :animation="200">
                            <template #item="{ element }">
                                <CommandBlock :command="element" @remove="store.removeCommand(element.id)" />
                            </template>
                        </draggable>
                    </div>
                </div>
            </div>
        </div>

        <!-- Function B -->
        <div class="bg-indigo-950/20 rounded-2xl border-2 transition-all duration-300" :class="expandedFunc === 'B' ? 'border-indigo-500 shadow-sm' : 'border-slate-800 opacity-60'">
            <button @click="toggleFunc('B')" class="w-full flex items-center justify-between p-2.5">
                <h3 class="text-xs font-black flex items-center gap-2 text-indigo-500 uppercase">
                    <Code2 :size="14" /> Function B
                    <MousePointer2 v-if="expandedFunc === 'B'" :size="10" class="text-indigo-500 animate-pulse" />
                </h3>
                <ChevronUp v-if="expandedFunc === 'B'" :size="14" class="text-indigo-400"/>
                <ChevronDown v-else :size="14" class="text-indigo-400"/>
            </button>
            <div v-show="expandedFunc === 'B'" class="px-2.5 pb-2.5 h-32">
                <div class="h-full bg-slate-950/50 rounded-xl border-2 border-dashed border-indigo-900/50 overflow-hidden relative">
                    <div ref="funcBScrollRef" class="absolute inset-0 overflow-y-auto p-1.5 custom-scrollbar pb-16">
                        <draggable v-model="functionBQueue" group="commands" item-key="id" tag="div" :move="onMove" :disabled="store.isProgramLocked" class="flex flex-col gap-1.5 min-h-full" ghost-class="opacity-50" @change="store.cancelStepping" :animation="200">
                            <template #item="{ element }">
                                <CommandBlock :command="element" @remove="store.removeCommand(element.id)" />
                            </template>
                        </draggable>
                    </div>
                </div>
            </div>
        </div>

    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
</style>
