<script setup lang="ts">
import { onMounted } from 'vue'
import type { SudokuSize, DifficultyLevel } from '@/types'
import { useGame } from '@/composables/useGame'
import { useEngineeringMode } from '@/composables/useEngineeringMode'
import SudokuBoard from '@/components/SudokuBoard.vue'
import SolutionBoard from '@/components/SolutionBoard.vue'
import ControlPanel from '@/components/ControlPanel.vue'
import NumberPad from '@/components/NumberPad.vue'
import VictoryBanner from '@/components/VictoryBanner.vue'

const {
  puzzle,
  userBoard,
  selectedCell,
  isGenerating,
  errors,
  isComplete,
  isClue,
  startNewGame,
  selectCell,
  enterValue,
  clearCell,
  getSolution
} = useGame()

const { engineeringMode, exitEngineeringMode } = useEngineeringMode()

function handleNewGame(size: SudokuSize, difficulty: DifficultyLevel) {
  exitEngineeringMode()
  startNewGame(size, difficulty)
}

function handleKeyboard(e: KeyboardEvent) {
  if (!selectedCell.value || !puzzle.value || isComplete.value) return
  const key = e.key
  if (key >= '1' && key <= String(puzzle.value.size)) {
    enterValue(Number(key))
  } else if (key === 'Backspace' || key === 'Delete' || key === '0') {
    clearCell()
  } else if (key === 'ArrowUp' && selectedCell.value.row > 0) {
    selectCell({ row: selectedCell.value.row - 1, col: selectedCell.value.col })
  } else if (key === 'ArrowDown' && selectedCell.value.row < puzzle.value.size - 1) {
    selectCell({ row: selectedCell.value.row + 1, col: selectedCell.value.col })
  } else if (key === 'ArrowLeft' && selectedCell.value.col > 0) {
    selectCell({ row: selectedCell.value.row, col: selectedCell.value.col - 1 })
  } else if (key === 'ArrowRight' && selectedCell.value.col < puzzle.value.size - 1) {
    selectCell({ row: selectedCell.value.row, col: selectedCell.value.col + 1 })
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyboard)
  startNewGame(9, 2)
})

const difficultyLabels: Record<number, string> = {
  1: 'Novice', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Expert'
}
</script>

<template>
  <div class="min-h-screen bg-zinc-950 flex flex-col">

    <!-- Header -->
    <header class="flex items-center justify-between px-10 py-5 border-b border-zinc-800/80">
      <div class="flex items-center gap-3">
        <span class="text-3xl">🧩</span>
        <h1 class="text-2xl font-bold font-mono neon-text-violet tracking-widest">SUDOKU</h1>
      </div>
      <div class="flex items-center gap-6">
        <div v-if="engineeringMode"
          class="flex items-center gap-2 text-sm font-mono text-emerald-400 animate-pulse">
          <span>⚡</span>
          <span>ENGINEERING MODE</span>
        </div>
        <div v-if="puzzle" class="flex gap-3 text-sm font-mono text-zinc-500">
          <span class="text-zinc-400">{{ puzzle.size }}×{{ puzzle.size }}</span>
          <span class="text-zinc-700">·</span>
          <span class="text-zinc-400">{{ difficultyLabels[puzzle.difficulty] }}</span>
        </div>
      </div>
    </header>

    <!-- Main layout -->
    <main class="flex-1 flex items-start gap-10 p-0 pt-10">

      <!-- Left: Control Panel — flush to left edge -->
      <aside class="shrink-0 pl-8 pt-2">
        <ControlPanel
          :current-size="(puzzle?.size ?? 9) as SudokuSize"
          :current-difficulty="(puzzle?.difficulty ?? 2) as DifficultyLevel"
          :is-generating="isGenerating"
          @new-game="handleNewGame"
        />
      </aside>

      <!-- Center: Main Board -->
      <section class="flex-1 flex flex-col items-center gap-5">
        <div v-if="isGenerating"
          class="flex items-center gap-3 text-zinc-400 font-mono text-base mt-32">
          <span class="inline-block animate-spin text-xl">⟳</span>
          Generating puzzle…
        </div>

        <template v-else-if="puzzle && userBoard.length">
          <!-- Board title row -->
          <div class="w-full flex items-center justify-between px-1">
            <span class="text-xs font-mono text-zinc-600 tracking-widest uppercase">Your Board</span>
            <span v-if="errors.size > 0" class="text-xs font-mono text-red-400">
              {{ errors.size }} conflict{{ errors.size > 1 ? 's' : '' }}
            </span>
          </div>

          <SudokuBoard
            :user-board="userBoard"
            :is-clue="isClue"
            :selected-cell="selectedCell"
            :errors="errors"
            :engineering-mode="engineeringMode"
            :size="puzzle.size"
            @select-cell="selectCell"
          />

          <!-- Number pad below board (hidden in engineering mode) -->
          <div v-if="!engineeringMode" class="mt-2">
            <NumberPad
              :size="puzzle.size"
              :disabled="!selectedCell || isComplete"
              @input="enterValue"
              @clear="clearCell"
            />
          </div>
        </template>
      </section>

      <!-- Right: Solution Board (Engineering Mode) or spacer -->
      <aside class="shrink-0 pt-2 pr-8 flex flex-col items-center gap-4 min-w-[220px]">
        <template v-if="engineeringMode && puzzle && getSolution()">
          <SolutionBoard
            :solution="getSolution()!"
            :puzzle="puzzle.puzzle"
            :size="puzzle.size"
          />
        </template>
        <template v-else>
          <!-- Spacer to keep layout stable -->
          <div class="w-[220px]" />
        </template>
      </aside>

    </main>

    <!-- Victory Modal -->
    <VictoryBanner
      v-if="isComplete"
      @new-game="handleNewGame(puzzle!.size, puzzle!.difficulty)"
    />
  </div>
</template>
