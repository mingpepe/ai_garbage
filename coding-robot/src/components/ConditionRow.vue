<script setup lang="ts">
import type { Condition, SimpleCondition } from '../types';

const props = defineProps<{
  condition: Condition;
}>();

const subjects = [
  { value: 'front', label: 'Front' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'back', label: 'Back' },
  { value: 'here', label: 'Here' },
  { value: 'robot', label: 'Robot' }
];

const targets = [
  { value: 'wall', label: 'Wall' },
  { value: 'water', label: 'Water' },
  { value: 'rock', label: 'Rock' },
  { value: 'goal', label: 'Goal' },
  { value: 'star', label: 'Star' },
  { value: 'key', label: 'Key' },
  { value: 'boat', label: 'Boat' },
  { value: 'plane', label: 'Plane' },
  { value: 't-door', label: 'Door' },
  { value: 'boundary', label: 'Boundary' }
];

function toggleNot(cond: SimpleCondition) {
  cond.not = !cond.not;
}
</script>

<template>
  <div class="flex items-center gap-1 flex-wrap">
    <!-- Simple Condition -->
    <template v-if="condition.type === 'simple'">
      <select v-model="condition.subject" class="bg-slate-800 border border-white/20 rounded px-1 py-0.5 text-[11px] font-black text-cyan-300 focus:outline-none">
        <option v-for="s in subjects" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>

      <button @click="toggleNot(condition as SimpleCondition)" 
        class="px-1.5 py-0.5 rounded text-[10px] font-black transition-colors"
        :class="condition.not ? 'bg-rose-500 text-white' : 'bg-green-500/20 text-green-400 border border-green-500/30'"
      >
        {{ condition.not ? 'IS NOT' : 'IS' }}
      </button>

      <select v-model="condition.target" class="bg-slate-800 border border-white/20 rounded px-1 py-0.5 text-[11px] font-black text-yellow-400 focus:outline-none">
        <option v-for="t in targets" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
    </template>

    <!-- Logic Condition -->
    <template v-else>
      <div class="flex items-center gap-1.5 p-1 bg-white/5 rounded border border-white/10">
        <ConditionRow :condition="condition.left" />
        <span class="text-[10px] font-black text-purple-400 uppercase">{{ condition.type }}</span>
        <ConditionRow :condition="condition.right" />
      </div>
    </template>
  </div>
</template>
