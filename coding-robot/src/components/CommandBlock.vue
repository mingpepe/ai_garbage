<script setup lang="ts">
import { useGameStore } from '../stores/game';
import type { Command } from '../types';
import { MoveUp, RotateCcw, RotateCw, RefreshCw, Repeat, X, Split, Goal, MapPin, CornerUpLeft, Ban } from 'lucide-vue-next';
import draggable from 'vuedraggable';
import { computed } from 'vue';
import ConditionRow from './ConditionRow.vue';

const props = defineProps<{
  command: Command;
}>();

const emit = defineEmits(['remove']);
const store = useGameStore();

const isActive = computed(() => {
    if (!store.activeCommandId) return false;
    return store.activeCommandId.split('-at-').includes(props.command.id);
});

function updateLoopCount(val: number) {
  props.command.value = val;
}

function addLogic(type: 'and' | 'or') {
  if (!props.command.condition) return;
  const old = JSON.parse(JSON.stringify(props.command.condition));
  props.command.condition = {
    type,
    left: old,
    right: { type: 'simple', subject: 'front', not: false, target: 'wall' }
  };
}

function removeLogic() {
    if (props.command.condition?.type === 'and' || props.command.condition?.type === 'or') {
        props.command.condition = props.command.condition.left;
    }
}

function toggleBreakpoint() {
    props.command.breakpoint = !props.command.breakpoint;
}
</script>

<template>
  <div 
    class="relative rounded-lg transition-all duration-200 w-full"
    :class="[
      isActive ? 'ring-2 ring-yellow-400 scale-[1.01] z-10 shadow-lg' : 'z-0',
      command.type === 'loop' || command.type === 'while' || command.type === 'whileNotGoal' || command.type === 'whileFrontClear' ? 'bg-robot-pink/20 p-2 border border-robot-pink/40' : 
      command.type === 'if' || command.type === 'ifLeft' || command.type === 'ifRight' ? 'bg-amber-500/20 p-2 border border-amber-500/40' :
      command.type.startsWith('callFunc') ? 'bg-cyan-500/20 p-2 border border-cyan-400/40' :
      command.type === 'break' ? 'bg-rose-500/20 p-2 border border-rose-500/40' :
      'bg-slate-700 p-2.5 shadow-md border border-slate-600',
      store.isProgramLocked && store.gameStatus.state !== 'stepping' ? 'pointer-events-none' : ''
    ]"
  >
    <div class="flex items-center gap-3">
      <div 
        @click="toggleBreakpoint"
        class="w-8 h-8 rounded flex items-center justify-center text-white shrink-0 shadow-sm relative cursor-pointer hover:brightness-110 active:scale-95 transition-all"
        :class="{
          'bg-robot-blue': command.type === 'forward',
          'bg-robot-purple': command.type === 'left' || command.type === 'right' || command.type === 'turnAround',
          'bg-robot-pink': command.type === 'loop' || command.type === 'while' || command.type === 'whileNotGoal' || command.type === 'whileFrontClear',
          'bg-amber-500': command.type === 'if' || command.type === 'ifLeft' || command.type === 'ifRight',
          'bg-slate-600': command.type === 'markPosition' || command.type === 'returnToMark',
          'bg-cyan-500': command.type.startsWith('callFunc'),
          'bg-rose-600': command.type === 'break'
        }"
      >
        <!-- Breakpoint indicator -->
        <div v-if="command.breakpoint" class="absolute -top-1 -left-1 w-3 h-3 bg-rose-500 border-2 border-white rounded-full z-20 shadow-sm animate-pulse"></div>

        <MoveUp v-if="command.type === 'forward'" :size="16" />
        <RotateCcw v-if="command.type === 'left'" :size="16" />
        <RotateCw v-if="command.type === 'right'" :size="16" />
        <RefreshCw v-if="command.type === 'turnAround'" :size="16" />
        <Repeat v-if="command.type === 'loop'" :size="16" />
        <Goal v-if="command.type === 'while' || command.type === 'whileNotGoal'" :size="16" />
        <Repeat v-if="command.type === 'whileFrontClear'" :size="16" />
        <Split v-if="command.type === 'if' || command.type === 'ifLeft' || command.type === 'ifRight'" :size="16" />
        <MapPin v-if="command.type === 'markPosition'" :size="16" />
        <CornerUpLeft v-if="command.type === 'returnToMark'" :size="16" />
        <Ban v-if="command.type === 'break'" :size="16" />
        <span v-if="command.type.startsWith('callFunc')" class="text-xs font-black">{{ command.type.slice(-1) }}</span>
      </div>

      <div class="flex-1 font-black text-white text-[14px] truncate drop-shadow-sm overflow-visible">
        <span v-if="command.type === 'forward'">Move Forward</span>
        <span v-if="command.type === 'left'">Turn Left 90°</span>
        <span v-if="command.type === 'right'">Turn Right 90°</span>
        <span v-if="command.type === 'turnAround'">Turn Around 180°</span>
        <span v-if="command.type === 'markPosition'">Mark Position</span>
        <span v-if="command.type === 'returnToMark'">Return to Mark</span>
        <span v-if="command.type.startsWith('callFunc')">Function {{ command.type.slice(-1) }}</span>
        <span v-if="command.type === 'break'">Break Loop</span>
        
        <div v-if="command.type === 'loop'" class="flex items-center gap-1.5">
          <span>Repeat</span>
          <select :value="command.value" @change="(e: any) => updateLoopCount(Number(e.target.value))" class="bg-slate-900 border border-robot-pink/40 rounded px-1.5 py-0.5 text-robot-pink text-[12px] font-black focus:outline-none">
            <option v-for="n in 20" :key="n" :value="n">{{ n }}x</option>
          </select>
        </div>

        <span v-if="command.type === 'whileNotGoal'">Until Goal Reached</span>
        <span v-if="command.type === 'whileFrontClear'">While Front Clear</span>
        <span v-if="command.type === 'ifLeft'">If Obstacle Left</span>
        <span v-if="command.type === 'ifRight'">If Obstacle Right</span>

        <!-- Condition Editor for IF and WHILE -->
        <div v-if="command.type === 'if' || command.type === 'while'" class="flex flex-col gap-1.5">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-white/70">{{ command.type === 'if' ? 'If' : 'While' }}</span>
            <ConditionRow :condition="command.condition" v-if="command.condition" />
            <button v-if="command.condition?.type === 'simple'" @click="addLogic('and')" class="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white/50">+ AND</button>
            <button v-if="command.condition?.type === 'simple'" @click="addLogic('or')" class="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white/50">+ OR</button>
            <button v-if="command.condition?.type !== 'simple'" @click="removeLogic" class="px-1.5 py-0.5 bg-rose-500/20 hover:bg-rose-500/40 rounded text-[10px] text-rose-300">Undo Logic</button>
          </div>
        </div>
      </div>

      <button @click="$emit('remove')" v-if="!store.isProgramLocked" class="text-slate-400 hover:text-rose-400 transition-colors p-1">
        <X :size="16" />
      </button>
    </div>

    <!-- Nested areas for WHILE and IF -->
    <div v-if="command.type === 'loop' || command.type === 'while' || command.type === 'whileNotGoal' || command.type === 'whileFrontClear'" class="mt-2 pl-4 border-l-2 border-robot-pink/30 ml-4">
      <draggable 
        v-model="command.subCommands" 
        group="commands" 
        item-key="id" 
        tag="div"
        :disabled="store.isProgramLocked" 
        class="flex flex-col gap-1.5 min-h-[40px] p-1.5 bg-black/30 rounded-lg border border-dashed border-robot-pink/20" 
        @change="store.cancelStepping" 
        :animation="200"
      >
        <template #item="{ element }">
          <CommandBlock :command="element" @remove="command.subCommands = command.subCommands?.filter(c => c.id !== element.id)" />
        </template>
      </draggable>
    </div>

    <div v-if="command.type === 'if' || command.type === 'ifLeft' || command.type === 'ifRight'" class="mt-2 ml-4 flex flex-col gap-2">
        <div class="pl-4 border-l-2 border-green-500/30">
            <span class="text-[10px] font-black text-green-400 uppercase tracking-tighter mb-1 block">Then:</span>
            <draggable 
                v-model="command.trueBranch" 
                group="commands" 
                item-key="id" 
                tag="div"
                :disabled="store.isProgramLocked" 
                class="flex flex-col gap-1.5 min-h-[40px] p-1.5 bg-black/30 rounded-lg border border-dashed border-green-500/20" 
                @change="store.cancelStepping" 
                :animation="200"
            >
                <template #item="{ element }">
                    <CommandBlock :command="element" @remove="command.trueBranch = command.trueBranch?.filter(c => c.id !== element.id)" />
                </template>
            </draggable>
        </div>
        <div class="pl-4 border-l-2 border-rose-500/30">
            <span class="text-[10px] font-black text-rose-400 uppercase tracking-tighter mb-1 block">Else:</span>
            <draggable 
                v-model="command.falseBranch" 
                group="commands" 
                item-key="id" 
                tag="div"
                :disabled="store.isProgramLocked" 
                class="flex flex-col gap-1.5 min-h-[40px] p-1.5 bg-black/30 rounded-lg border border-dashed border-rose-500/20" 
                @change="store.cancelStepping" 
                :animation="200"
            >
                <template #item="{ element }">
                    <CommandBlock :command="element" @remove="command.falseBranch = command.falseBranch?.filter(c => c.id !== element.id)" />
                </template>
            </draggable>
        </div>
    </div>
  </div>
</template>
