<script setup lang="ts">
import { computed } from 'vue'
import type { SudokuSize } from '@/types'
import { getGridRule } from '@/logic/gridRules'

interface Props {
  solution: number[][]
  puzzle: number[][]
  size: SudokuSize
}

const props = defineProps<Props>()
const rule = computed(() => getGridRule(props.size))

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${props.size}, 1fr)`,
  gridTemplateRows: `repeat(${props.size}, 1fr)`
}))

// Solution board is slightly smaller than the main board — fixed 480px max
const boardPixels = computed(() => {
  if (props.size <= 4) return 280
  if (props.size <= 5) return 300
  if (props.size <= 6) return 330
  if (props.size <= 7) return 350
  if (props.size <= 8) return 380
  return 408
})

const fontSize = computed(() => {
  if (props.size <= 4) return 'text-xl'
  if (props.size <= 6) return 'text-lg'
  if (props.size <= 7) return 'text-base'
  return 'text-sm'
})

interface FlatCell { row: number; col: number }

const cells = computed<FlatCell[]>(() => {
  const out: FlatCell[] = []
  for (let r = 0; r < props.size; r++)
    for (let c = 0; c < props.size; c++)
      out.push({ row: r, col: c })
  return out
})

function isClue(row: number, col: number): boolean {
  return props.puzzle[row]?.[col] !== 0
}

function borderClass(row: number, col: number): string[] {
  const classes: string[] = []
  const { hasSubGrids, boxRows, boxCols } = rule.value
  if (!hasSubGrids) return classes
  if ((col + 1) % boxCols === 0 && col < props.size - 1)
    classes.push('border-r-2', 'border-r-emerald-600')
  if ((row + 1) % boxRows === 0 && row < props.size - 1)
    classes.push('border-b-2', 'border-b-emerald-600')
  return classes
}
</script>

<template>
  <div class="flex flex-col items-center gap-3">
    <p class="text-xs font-mono text-emerald-400 tracking-widest uppercase flex items-center gap-1.5">
      <span class="animate-pulse">⚡</span> Solution
    </p>

    <div
      :style="{
        ...gridStyle,
        width: boardPixels + 'px',
        height: boardPixels + 'px'
      }"
      class="rounded-xl overflow-hidden border-2 border-emerald-500 shadow-[0_0_20px_#32d74b50]"
    >
      <div
        v-for="cell in cells"
        :key="`sol-${cell.row}-${cell.col}`"
        :class="[
          'flex items-center justify-center font-mono font-semibold',
          'border border-zinc-700/60 transition-none',
          fontSize,
          isClue(cell.row, cell.col)
            ? 'text-zinc-300 bg-emerald-950/40'
            : 'text-emerald-400 bg-zinc-900/70',
          ...borderClass(cell.row, cell.col)
        ]"
      >
        {{ solution[cell.row]?.[cell.col] || '' }}
      </div>
    </div>

    <p class="text-[10px] font-mono text-zinc-600">Press ESC to exit</p>
  </div>
</template>
