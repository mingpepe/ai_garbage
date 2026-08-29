<script setup lang="ts">
import { computed } from 'vue'
import type { CellPosition, SudokuSize } from '@/types'
import { getGridRule } from '@/logic/gridRules'
import SudokuCell from './SudokuCell.vue'

interface Props {
  userBoard: number[][]
  isClue: (row: number, col: number) => boolean
  selectedCell: CellPosition | null
  errors: Set<string>
  engineeringMode: boolean
  size: SudokuSize
}

const props = defineProps<Props>()
const emit = defineEmits<{
  selectCell: [pos: CellPosition]
}>()

const rule = computed(() => getGridRule(props.size))

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${props.size}, 1fr)`,
  gridTemplateRows: `repeat(${props.size}, 1fr)`
}))

const boardPixels = computed(() => {
  if (props.size <= 4) return 420
  if (props.size <= 5) return 480
  if (props.size <= 6) return 540
  if (props.size <= 7) return 560
  if (props.size <= 8) return 600
  return 630
})

interface FlatCell {
  row: number
  col: number
}

const cells = computed<FlatCell[]>(() => {
  const out: FlatCell[] = []
  for (let r = 0; r < props.size; r++) {
    for (let c = 0; c < props.size; c++) {
      out.push({ row: r, col: c })
    }
  }
  return out
})

function isHighlighted(row: number, col: number): boolean {
  if (!props.selectedCell) return false
  const { row: sr, col: sc } = props.selectedCell
  if (row === sr || col === sc) return true
  if (rule.value.hasSubGrids) {
    const { boxRows, boxCols } = rule.value
    const boxRowStart = Math.floor(sr / boxRows) * boxRows
    const boxColStart = Math.floor(sc / boxCols) * boxCols
    if (
      row >= boxRowStart && row < boxRowStart + boxRows &&
      col >= boxColStart && col < boxColStart + boxCols
    ) {
      return true
    }
  }
  return false
}
</script>

<template>
  <div
    :style="{
      ...gridStyle,
      width: boardPixels + 'px',
      height: boardPixels + 'px'
    }"
    class="rounded-2xl overflow-hidden border-2"
    :class="engineeringMode
      ? 'border-zinc-500'
      : 'border-zinc-600'"
  >
    <SudokuCell
      v-for="cell in cells"
      :key="`${cell.row}-${cell.col}`"
      :value="userBoard[cell.row]?.[cell.col] ?? 0"
      :row="cell.row"
      :col="cell.col"
      :size="size"
      :is-clue="isClue(cell.row, cell.col)"
      :is-selected="selectedCell?.row === cell.row && selectedCell?.col === cell.col"
      :is-highlighted="isHighlighted(cell.row, cell.col)"
      :has-error="errors.has(`${cell.row},${cell.col}`)"
      :box-rows="rule.boxRows"
      :box-cols="rule.boxCols"
      @select="(r, c) => emit('selectCell', { row: r, col: c })"
    />
  </div>
</template>
