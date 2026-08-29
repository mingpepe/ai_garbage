<script setup lang="ts">
interface Props {
  size: number
  disabled: boolean
}
defineProps<Props>()
const emit = defineEmits<{
  input: [value: number]
  clear: []
}>()
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-1 text-center">Input</p>
    <div
      class="grid gap-2"
      :style="{ gridTemplateColumns: `repeat(${Math.ceil(size / 2)}, minmax(0, 1fr))` }"
    >
      <button
        v-for="n in size"
        :key="n"
        :disabled="disabled"
        class="h-12 w-12 rounded-xl font-mono font-bold text-lg
               transition-all duration-150
               bg-zinc-800/80 border border-zinc-700 text-zinc-300
               hover:border-cyan-500 hover:text-cyan-300 hover:bg-zinc-700/80
               active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
        @click="emit('input', n)"
      >
        {{ n }}
      </button>
    </div>
    <button
      :disabled="disabled"
      class="w-full h-10 rounded-xl font-mono text-sm mt-1
             bg-zinc-800/60 border border-zinc-700 text-zinc-500
             hover:border-red-500/70 hover:text-red-400 hover:bg-zinc-700/60
             active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed
             transition-all duration-150"
      @click="emit('clear')"
    >
      ✕ Clear
    </button>
  </div>
</template>
