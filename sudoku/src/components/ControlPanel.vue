<script setup lang="ts">
import { ref } from 'vue'
import type { SudokuSize, DifficultyLevel } from '@/types'

interface Props {
  currentSize: SudokuSize
  currentDifficulty: DifficultyLevel
  isGenerating: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  newGame: [size: SudokuSize, difficulty: DifficultyLevel]
}>()

const selectedSize = ref<SudokuSize>(9)
const selectedDifficulty = ref<DifficultyLevel>(2)

const sizes: { value: SudokuSize; label: string }[] = [
  { value: 4, label: '4×4' },
  { value: 5, label: '5×5' },
  { value: 6, label: '6×6' },
  { value: 7, label: '7×7' },
  { value: 8, label: '8×8' },
  { value: 9, label: '9×9' }
]

const difficulties: { value: DifficultyLevel; label: string; color: string }[] = [
  { value: 1, label: 'Novice',  color: 'text-emerald-400' },
  { value: 2, label: 'Easy',    color: 'text-cyan-400' },
  { value: 3, label: 'Medium',  color: 'text-yellow-400' },
  { value: 4, label: 'Hard',    color: 'text-orange-400' },
  { value: 5, label: 'Expert',  color: 'text-red-400' }
]

function handleNewGame() {
  emit('newGame', selectedSize.value, selectedDifficulty.value)
}
</script>

<template>
  <div class="flex flex-col gap-6 w-56">

    <!-- Size -->
    <div>
      <p class="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">Board Size</p>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="s in sizes"
          :key="s.value"
          class="py-2 rounded-xl text-sm font-mono font-semibold transition-all duration-150 border"
          :class="selectedSize === s.value
            ? 'bg-violet-900/70 border-violet-400 text-violet-200 shadow-[0_0_10px_#bf5af230]'
            : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'"
          @click="selectedSize = s.value"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- Difficulty -->
    <div>
      <p class="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">Difficulty</p>
      <div class="flex flex-col gap-1.5">
        <button
          v-for="d in difficulties"
          :key="d.value"
          class="w-full py-2 px-4 rounded-xl text-sm font-mono text-left transition-all duration-150 border flex items-center justify-between"
          :class="selectedDifficulty === d.value
            ? 'bg-zinc-700/80 border-zinc-400 ' + d.color
            : 'bg-zinc-800/60 border-zinc-700/80 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'"
          @click="selectedDifficulty = d.value"
        >
          <span>{{ d.label }}</span>
          <span class="text-xs opacity-50">Lv.{{ d.value }}</span>
        </button>
      </div>
    </div>

    <!-- New Game -->
    <button
      :disabled="isGenerating"
      class="w-full py-3 rounded-2xl font-mono font-bold text-base
             bg-gradient-to-r from-violet-700 to-cyan-700
             hover:from-violet-600 hover:to-cyan-600
             border border-zinc-500 text-white
             shadow-[0_0_16px_#bf5af230]
             transition-all duration-150 active:scale-95
             disabled:opacity-50 disabled:cursor-not-allowed"
      @click="handleNewGame"
    >
      <span v-if="isGenerating" class="animate-pulse">Generating…</span>
      <span v-else>▶ New Game</span>
    </button>

  </div>
</template>
