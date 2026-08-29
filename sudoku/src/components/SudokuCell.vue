<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  value: number
  row: number
  col: number
  size: number
  isClue: boolean
  isSelected: boolean
  isHighlighted: boolean
  hasError: boolean
  boxRows: number
  boxCols: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [row: number, col: number]
}>()

const borderClasses = computed(() => {
  const classes: string[] = []
  const { row, col, size, boxRows, boxCols } = props

  if (boxCols > 0 && (col + 1) % boxCols === 0 && col < size - 1) {
    classes.push('border-r-[3px]', 'border-r-zinc-400')
  }
  if (boxRows > 0 && (row + 1) % boxRows === 0 && row < size - 1) {
    classes.push('border-b-[3px]', 'border-b-zinc-400')
  }

  return classes
})

const cellClasses = computed(() => {
  const base = [
    'flex items-center justify-center',
    'font-mono font-bold cursor-pointer select-none',
    'transition-all duration-100 border border-zinc-700/80'
  ]

  if (props.hasError) {
    base.push('text-red-400 bg-red-950/50')
  } else if (props.isClue) {
    base.push('text-zinc-100 bg-zinc-800/70')
  } else if (props.value) {
    base.push('text-cyan-300 bg-zinc-900/60')
  } else {
    base.push('text-zinc-600 bg-zinc-900/60')
  }

  if (props.isSelected) {
    base.push('ring-2 ring-inset ring-cyan-400 bg-cyan-950/50 z-10 shadow-[inset_0_0_10px_#00f5ff20]')
  } else if (props.isHighlighted) {
    base.push('bg-zinc-800/90')
  }

  return [...base, ...borderClasses.value]
})

const fontSize = computed(() => {
  if (props.size <= 4) return 'text-3xl'
  if (props.size <= 6) return 'text-2xl'
  if (props.size <= 7) return 'text-xl'
  return 'text-lg'
})
</script>

<template>
  <div
    :class="[cellClasses, fontSize]"
    @click="emit('select', row, col)"
  >
    {{ value || '' }}
  </div>
</template>
