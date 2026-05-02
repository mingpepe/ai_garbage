<script setup lang="ts">
import draggable from 'vuedraggable';
import { useGameStore } from '../stores/game';
import { MoveUp, MoveDown, RotateCcw, RotateCw, RefreshCw, Repeat, Split, Goal, MapPin, CornerUpLeft, Ban, Timer } from 'lucide-vue-next';
import type { Command, CommandType } from '../types';
import { computed } from 'vue';

const store = useGameStore();

const commandLibrary: Record<string, Command> = {
  forward: { id: 'lib-forward', type: 'forward' },
  backward: { id: 'lib-backward', type: 'backward' },
  left: { id: 'lib-left', type: 'left' },
  right: { id: 'lib-right', type: 'right' },
  turnAround: { id: 'lib-turnAround', type: 'turnAround' },
  loop: { id: 'lib-loop', type: 'loop', value: 2, subCommands: [] },
  whileNotGoal: { id: 'lib-whileNotGoal', type: 'whileNotGoal', subCommands: [] },
  whileFrontClear: { id: 'lib-whileFrontClear', type: 'whileFrontClear', subCommands: [] },
  if: { id: 'lib-if', type: 'if', trueBranch: [], falseBranch: [] },
  ifLeft: { id: 'lib-ifLeft', type: 'ifLeft', trueBranch: [], falseBranch: [] },
  ifRight: { id: 'lib-ifRight', type: 'ifRight', trueBranch: [], falseBranch: [] },
  markPosition: { id: 'lib-markPosition', type: 'markPosition' },
  returnToMark: { id: 'lib-returnToMark', type: 'returnToMark' },
  callFuncA: { id: 'lib-callFuncA', type: 'callFuncA' },
  callFuncB: { id: 'lib-callFuncB', type: 'callFuncB' },
  break: { id: 'lib-break', type: 'break' },
  wait: { id: 'lib-wait', type: 'wait' }
};

// All commands are available in all levels now
const ALL_COMMAND_TYPES: CommandType[] = [
  'forward', 'backward', 'left', 'right', 'turnAround', 'wait',
  'loop', 'whileNotGoal', 'whileFrontClear', 'if', 'ifLeft', 'ifRight',
  'markPosition', 'returnToMark',
  'callFuncA', 'callFuncB', 'break'
];

const availableCommands = computed(() => {
  return ALL_COMMAND_TYPES.map(type => commandLibrary[type]).filter(Boolean);
});

function cloneCommand(cmd: Command): Command {
  return { 
    ...cmd, 
    id: crypto.randomUUID(), 
    subCommands: cmd.subCommands ? [] : undefined,
    trueBranch: cmd.trueBranch ? [] : undefined,
    falseBranch: cmd.falseBranch ? [] : undefined
  };
}

function quickAdd(type: CommandType) {
    if (store.isProgramLocked) return;
    const base = commandLibrary[type];
    if (base) store.addCommandToTarget(cloneCommand(base as Command));
}
</script>

<template>
  <div class="bg-slate-900 p-3 rounded-2xl border-2 border-slate-800 h-full overflow-y-auto custom-scrollbar font-comic">
    <h3 class="text-xs font-black mb-1 flex items-center gap-2 uppercase tracking-tighter shrink-0 text-slate-100">
      <span class="bg-robot-purple text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] shadow-sm">1</span>
      Toolbox
    </h3>
    
    <draggable
      :list="availableCommands"
      :group="{ name: 'commands', pull: 'clone', put: false }"
      :clone="cloneCommand"
      :disabled="store.isProgramLocked"
      item-key="id"
      class="grid grid-cols-2 gap-1.5"
      :animation="200"
    >
      <template #item="{ element }">
        <div 
          @click="quickAdd(element.type)"
          class="min-h-11 px-2 py-2.5 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 text-white font-black command-shadow transition-all hover:translate-x-1 select-none"
          :class="[
            {
              'bg-robot-blue': element.type === 'forward' || element.type === 'backward',
              'bg-robot-purple': element.type === 'left' || element.type === 'right' || element.type === 'turnAround',
              'bg-slate-500': element.type === 'wait',
              'bg-robot-pink': element.type === 'loop' || element.type === 'whileNotGoal' || element.type === 'whileFrontClear',
              'bg-amber-500': element.type === 'if' || element.type === 'ifLeft' || element.type === 'ifRight',
              'bg-slate-600': element.type === 'markPosition' || element.type === 'returnToMark',
              'bg-rose-600': element.type === 'break',
              'bg-cyan-500': element.type === 'callFuncA',
              'bg-indigo-500': element.type === 'callFuncB'
            },
            store.isProgramLocked ? 'opacity-50 grayscale cursor-not-allowed' : ''
          ]"
        >
          <MoveUp v-if="element.type === 'forward'" :size="18" class="shrink-0" />
          <MoveDown v-if="element.type === 'backward'" :size="18" class="shrink-0" />
          <RotateCcw v-if="element.type === 'left'" :size="18" class="shrink-0" />
          <RotateCw v-if="element.type === 'right'" :size="18" class="shrink-0" />
          <RefreshCw v-if="element.type === 'turnAround'" :size="18" class="shrink-0" />
          <Repeat v-if="element.type === 'loop'" :size="18" class="shrink-0" />
          <Goal v-if="element.type === 'whileNotGoal'" :size="18" class="shrink-0" />
          <Repeat v-if="element.type === 'whileFrontClear'" :size="18" class="shrink-0" />
          <Split v-if="element.type === 'if' || element.type === 'ifLeft' || element.type === 'ifRight'" :size="18" class="shrink-0" />
          <MapPin v-if="element.type === 'markPosition'" :size="18" class="shrink-0" />
          <CornerUpLeft v-if="element.type === 'returnToMark'" :size="18" class="shrink-0" />
          <Ban v-if="element.type === 'break'" :size="18" class="shrink-0" />
          <Timer v-if="element.type === 'wait'" :size="18" class="shrink-0" />
          <span v-if="element.type.startsWith('callFunc')" class="text-xs w-4 text-center shrink-0">{{ element.type.slice(-1) }}</span>
          
          <span class="text-xs leading-tight truncate">
            {{ 
                element.type === 'forward' ? 'forward' :
                element.type === 'backward' ? 'backward' :
                element.type === 'left' ? 'left' :
                element.type === 'right' ? 'right' :
                element.type === 'turnAround' ? 'turn around' :
                element.type === 'wait' ? 'wait' :
                element.type === 'loop' ? 'loop' :
                element.type === 'whileNotGoal' ? 'while' :
                element.type === 'whileFrontClear' ? 'while front clear' :
                element.type === 'if' ? 'if obstacle' : 
                element.type === 'ifLeft' ? 'if obstacle L' :
                element.type === 'ifRight' ? 'if obstacle R' :
                element.type === 'markPosition' ? 'remember position' :
                element.type === 'returnToMark' ? 'return to mark' :
                element.type === 'callFuncA' ? 'function A' :
                element.type === 'callFuncB' ? 'function B' :
                'break'
            }}
          </span>
        </div>
      </template>
    </draggable>
  </div>
</template>
