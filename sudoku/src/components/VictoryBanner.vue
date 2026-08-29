<script setup lang="ts">
defineEmits<{ newGame: [] }>()
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
    <div class="flex flex-col items-center gap-6 p-10 rounded-2xl border border-emerald-500
                bg-zinc-900 shadow-[0_0_60px_#32d74b40]">
      <div class="text-6xl animate-bounce">🏆</div>
      <h2 class="text-3xl font-bold neon-text-green font-mono">Puzzle Solved!</h2>
      <p class="text-zinc-400 text-sm font-mono">You've completed the board. Well done!</p>
      <button
        class="px-8 py-3 rounded-xl font-mono font-semibold
               bg-gradient-to-r from-emerald-700 to-cyan-700
               hover:from-emerald-600 hover:to-cyan-600
               text-white border border-emerald-500
               transition-all duration-150 active:scale-95"
        @click="$emit('newGame')"
      >
        Play Again
      </button>
    </div>
  </div>
</template>
