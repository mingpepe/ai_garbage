<script setup lang="ts">
import { useGameStore } from '../stores/game';
import type { Command } from '../types';
import { MoveUp, RotateCcw, RotateCw, RefreshCw, Repeat, X, Split, Goal, MapPin, CornerUpLeft, Ban, Timer } from 'lucide-vue-next';
import draggable from 'vuedraggable';
import { computed } from 'vue';

const props = defineProps<{
  command: Command;
}>();

const emit = defineEmits(['remove']);
const store = useGameStore();

const isActive = computed(() => {
    if (!store.activeCommandId) return false;
    return store.activeCommandId === props.command.id || store.activeCommandId.startsWith(`${props.command.id}-at-`);
});

function updateLoopCount(val: number) {
  props.command.value = val;
}
</script>

<template>
  <div 
    class="relative rounded-lg transition-all duration-200 w-full"
    :class="[
      isActive ? 'ring-2 ring-yellow-400 scale-[1.01] z-10 shadow-lg' : 'z-0',
      command.type === 'loop' || command.type === 'whileNotGoal' || command.type === 'whileFrontClear' ? 'bg-robot-pink/20 p-2 border border-robot-pink/40' : 
      command.type === 'if' || command.type === 'ifLeft' || command.type === 'ifRight' ? 'bg-amber-500/20 p-2 border border-amber-500/40' :
      command.type.startsWith('callFunc') ? 'bg-cyan-500/20 p-2 border border-cyan-400/40' :
      command.type === 'break' ? 'bg-rose-500/20 p-2 border border-rose-500/40' :
      command.type === 'wait' ? 'bg-slate-500/20 p-2 border border-slate-500/40' :
      'bg-slate-700 p-2.5 shadow-md border border-slate-600',
      store.isProgramLocked ? 'pointer-events-none' : ''
    ]"
  >
    <div class="flex items-center gap-3">
      <div 
        class="w-8 h-8 rounded flex items-center justify-center text-white shrink-0 shadow-sm"
        :class="{
          'bg-robot-blue': command.type === 'forward',
          'bg-robot-purple': command.type === 'left' || command.type === 'right' || command.type === 'turnAround',
          'bg-slate-500': command.type === 'wait',
          'bg-robot-pink': command.type === 'loop' || command.type === 'whileNotGoal' || command.type === 'whileFrontClear',
          'bg-amber-500': command.type === 'if' || command.type === 'ifLeft' || command.type === 'ifRight',
          'bg-slate-600': command.type === 'markPosition' || command.type === 'returnToMark',
          'bg-cyan-500': command.type.startsWith('callFunc'),
          'bg-rose-600': command.type === 'break'
        }"
      >
        <MoveUp v-if="command.type === 'forward'" :size="16" />
        <RotateCcw v-if="command.type === 'left'" :size="16" />
        <RotateCw v-if="command.type === 'right'" :size="16" />
        <RefreshCw v-if="command.type === 'turnAround'" :size="16" />
        <Repeat v-if="command.type === 'loop'" :size="16" />
        <Goal v-if="command.type === 'whileNotGoal'" :size="16" />
        <Repeat v-if="command.type === 'whileFrontClear'" :size="16" />
        <Split v-if="command.type === 'if' || command.type === 'ifLeft' || command.type === 'ifRight'" :size="16" />
        <MapPin v-if="command.type === 'markPosition'" :size="16" />
        <CornerUpLeft v-if="command.type === 'returnToMark'" :size="16" />
        <Ban v-if="command.type === 'break'" :size="16" />
        <Timer v-if="command.type === 'wait'" :size="16" />
        <span v-if="command.type.startsWith('callFunc')" class="text-xs font-black">{{ command.type.slice(-1) }}</span>
      </div>

      <div class="flex-1 font-black text-white text-[14px] truncate drop-shadow-sm">
        <span v-if="command.type === 'forward'">Move Forward</span>
        <span v-if="command.type === 'left'">Turn Left 90°</span>
        <span v-if="command.type === 'right'">Turn Right 90°</span>
        <span v-if="command.type === 'turnAround'">Turn Around 180°</span>
        <span v-if="command.type === 'wait'">Wait a Moment</span>
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
        <span v-if="command.type === 'if'">If Obstacle Ahead</span>
        <span v-if="command.type === 'ifLeft'">If Obstacle Left</span>
        <span v-if="command.type === 'ifRight'">If Obstacle Right</span>
      </div>

      <button @click="$emit('remove')" v-if="!store.isProgramLocked" class="text-slate-400 hover:text-rose-400 transition-colors p-1">
        <X :size="16" />
      </button>
    </div>

    <!-- Nested areas -->
    <div v-if="command.type === 'loop' || command.type === 'whileNotGoal' || command.type === 'whileFrontClear'" class="mt-2 pl-4 border-l-2 border-robot-pink/30 ml-4">
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
