<template>
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div
      class="bg-slate-900 border-2 border-slate-700 rounded-3xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center gap-5 text-white"
      :class="{ 'animate-wobble': isError }"
    >
      <div class="flex items-center justify-between w-full border-b border-slate-800 pb-3">
        <h3 class="text-lg font-bold flex items-center gap-2 text-amber-400">
          <span>🔒</span>
          <span>後台工程模式驗證</span>
        </h3>
        <button
          class="text-slate-400 hover:text-white text-xl p-1"
          @click="closeModal"
        >
          ✕
        </button>
      </div>

      <p class="text-xs text-slate-400 text-center">
        請輸入 4 位數管理員密碼以進入參數設定
      </p>

      <!-- PIN Display Dots -->
      <div class="flex items-center gap-3">
        <div
          v-for="i in 4"
          :key="i"
          class="w-10 h-12 rounded-xl border-2 flex items-center justify-center text-2xl font-mono"
          :class="[
            pin.length >= i
              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
              : 'border-slate-700 bg-slate-800 text-slate-500'
          ]"
        >
          {{ pin.length >= i ? '●' : '' }}
        </div>
      </div>

      <!-- Error Text -->
      <p v-if="errorMessage" class="text-xs text-rose-400 font-medium">
        {{ errorMessage }}
      </p>

      <!-- Keypad -->
      <div class="grid grid-cols-3 gap-2.5 w-full">
        <button
          v-for="num in ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK']"
          :key="num"
          class="h-12 rounded-xl font-bold text-lg flex items-center justify-center transition-all active:scale-95 shadow-md border"
          :class="[
            num === 'OK'
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400'
              : num === 'C'
              ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40'
              : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
          ]"
          @click="handleBtn(num)"
        >
          {{ num }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useAdminStore } from '@/stores/adminStore';
import { soundManager } from '@/core/audio';

const adminStore = useAdminStore();
const pin = ref('');
const isError = ref(false);
const errorMessage = ref('');

function closeModal() {
  pin.value = '';
  errorMessage.value = '';
  adminStore.closePinModal();
}

function handleBtn(val: string) {
  if (val === 'C') {
    pin.value = '';
    errorMessage.value = '';
    soundManager.playStep();
  } else if (val === 'OK') {
    submitPin();
  } else {
    if (pin.value.length < 4) {
      pin.value += val;
      soundManager.playStep();
      if (pin.value.length === 4) {
        submitPin();
      }
    }
  }
}

function submitPin() {
  if (pin.value.length < 4) {
    errorMessage.value = '請輸入完整 4 位數密碼';
    return;
  }

  const success = adminStore.verifyPin(pin.value);
  if (success) {
    soundManager.playInteract();
    pin.value = '';
    errorMessage.value = '';
  } else {
    isError.value = true;
    errorMessage.value = '密碼錯誤！請重新輸入';
    soundManager.playWrong();
    setTimeout(() => {
      isError.value = false;
      pin.value = '';
    }, 600);
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (!adminStore.isPinModalOpen) return;

  if (e.key >= '0' && e.key <= '9') {
    handleBtn(e.key);
  } else if (e.key === 'Backspace') {
    pin.value = pin.value.slice(0, -1);
    soundManager.playStep();
  } else if (e.key === 'Enter') {
    submitPin();
  } else if (e.key === 'Escape') {
    closeModal();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>
