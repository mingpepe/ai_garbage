<template>
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div
      class="bg-amber-100 rounded-3xl border-4 border-amber-600 shadow-2xl p-6 sm:p-8 w-full max-w-xl sm:max-w-2xl md:max-w-3xl flex flex-col items-center gap-6 transition-transform"
      :class="{ 'animate-wobble': isShaking }"
    >
      <!-- Top: Customer & Shopping Cart Items -->
      <div class="w-full bg-amber-50 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border-2 border-amber-300 shadow-inner flex flex-col gap-4">
        <div class="flex items-center justify-between border-b-2 pb-2 border-amber-200">
          <div class="flex items-center gap-3">
            <span class="text-4xl sm:text-5xl">{{ customerAvatar }}</span>
            <span class="text-3xl sm:text-4xl">{{ customerMoodEmoji }}</span>
          </div>
          <div class="flex items-center gap-1.5 text-amber-800 font-black text-xl sm:text-2xl">
            <span>🛒</span>
          </div>
        </div>

        <!-- Item List Breakdown: Extra large fruit icons, prominent prices and counts -->
        <div class="flex flex-wrap gap-3 sm:gap-4 justify-center w-full">
          <div
            v-for="item in shoppingItems"
            :key="item.fruitId"
            class="flex items-center gap-3 bg-white px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-2xl border-2 border-amber-300 shadow-md hover:shadow-lg transition-shadow"
          >
            <!-- Large Fruit Icon -->
            <span class="text-4xl sm:text-5xl select-none filter drop-shadow-sm">{{ getFruitIcon(item.fruitId) }}</span>

            <!-- Large Unit Price -->
            <div class="flex items-center gap-1 bg-amber-100/90 px-3 py-1 rounded-xl border border-amber-300">
              <span class="text-xl sm:text-2xl">🪙</span>
              <span class="font-black text-xl sm:text-2xl text-amber-900 font-mono">{{ item.unitPrice }}</span>
            </div>

            <!-- Multiplier Symbol -->
            <span class="text-slate-400 font-black text-2xl sm:text-3xl select-none">×</span>

            <!-- Large Quantity Count -->
            <div class="flex items-center gap-1 bg-amber-300 text-amber-950 font-black text-xl sm:text-2xl px-3.5 py-1 rounded-xl shadow-inner border border-amber-400 font-mono">
              <span class="text-sm sm:text-base font-bold text-amber-800">x</span>
              <span>{{ item.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Middle: Visual Arithmetic Equation -->
      <div class="w-full bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border-3 border-amber-400 shadow-lg flex items-center justify-center gap-3">
        <div class="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
          <template v-for="(item, idx) in shoppingItems" :key="idx">
            <div class="flex items-center gap-1.5 sm:gap-2 bg-amber-50 px-3.5 sm:px-5 py-2 rounded-xl sm:rounded-2xl border-2 border-amber-200 text-2xl sm:text-3xl font-black text-slate-800 shadow-sm">
              <span class="text-amber-900 font-mono">{{ item.unitPrice }}</span>
              <span class="text-amber-500 text-xl sm:text-2xl font-bold">×</span>
              <span class="text-amber-900 font-mono">{{ item.count }}</span>
            </div>
            <span v-if="idx < shoppingItems.length - 1" class="text-amber-600 text-2xl sm:text-3xl font-black select-none">+</span>
          </template>
          <span class="text-slate-500 font-black text-2xl sm:text-3xl select-none">=</span>

          <!-- Input Display Box -->
          <div class="min-w-[84px] sm:min-w-[110px] h-13 sm:h-16 px-4 bg-amber-100 border-3 border-amber-500 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl font-black font-mono text-amber-950 tracking-wider shadow-inner">
            {{ inputAnswer || '?' }}
          </div>
        </div>
      </div>

      <!-- Bottom: Keyboard / Carousel Numbers Pad -->
      <div class="w-full flex flex-col items-center gap-4">
        <!-- Number Grid Bar -->
        <div class="grid grid-cols-6 gap-2.5 sm:gap-3 w-full max-w-xl">
          <button
            v-for="(key, idx) in keypadOptions"
            :key="key"
            class="h-14 sm:h-16 rounded-2xl font-black text-2xl sm:text-3xl flex items-center justify-center transition-all border-2 active:scale-95 select-none shadow-md"
            :class="[
              selectedKeyIndex === idx
                ? 'bg-amber-400 border-amber-600 text-amber-950 scale-105 ring-4 ring-amber-300'
                : 'bg-white border-amber-200 text-slate-700 hover:bg-amber-50',
              key === '🛎️' ? 'bg-emerald-400 hover:bg-emerald-500 text-white border-emerald-600' : '',
              key === '⌫' ? 'bg-rose-100 hover:bg-rose-200 text-rose-700 border-rose-300' : ''
            ]"
            @click="handleKeyClick(key)"
          >
            {{ key }}
          </button>
        </div>

        <!-- Hint for Keyboard Navigation -->
        <div class="flex items-center gap-3 text-sm sm:text-base text-amber-900/90 font-semibold bg-amber-200/60 px-4 py-1.5 rounded-full border border-amber-300">
          <span class="bg-amber-100 px-2.5 py-0.5 rounded text-amber-950 font-mono font-bold shadow-sm">0-9</span>
          <span>數字鍵直接輸入</span>
          <span class="text-amber-400">•</span>
          <span class="bg-amber-100 px-2.5 py-0.5 rounded text-amber-950 font-mono font-bold shadow-sm">Enter / 🛎️</span>
          <span>結帳</span>
          <span class="text-amber-400">•</span>
          <span class="bg-amber-100 px-2.5 py-0.5 rounded text-amber-950 font-mono font-bold shadow-sm">Esc</span>
          <span>關閉</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useGameStore } from '@/stores/gameStore';
import { MathEngine, type MathFormula } from '@/core/mathEngine';
import { FRUIT_MAP, CUSTOMER_AVATARS } from '@/core/constants';
import { soundManager } from '@/core/audio';

const gameStore = useGameStore();

const keypadOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫', '🛎️'];
const selectedKeyIndex = ref(0);
const inputAnswer = ref('');
const isShaking = ref(false);

const customer = computed(() => gameStore.activeCheckingCustomer);
const customerAvatar = computed(() => {
  if (!customer.value) return '🐰';
  return CUSTOMER_AVATARS[customer.value.avatarIndex % CUSTOMER_AVATARS.length];
});

const customerMoodEmoji = computed(() => {
  if (!customer.value) return '😊';
  if (customer.value.mood === 'NEUTRAL') return '😐';
  if (customer.value.mood === 'IMPATIENT') return '😣';
  return '😊';
});

const shoppingItems = computed(() => customer.value?.items ?? []);

const formula = computed<MathFormula>(() => {
  return MathEngine.generateFormula(shoppingItems.value);
});

function getFruitIcon(fruitId: number): string {
  return FRUIT_MAP.get(fruitId)?.icon ?? '🍎';
}

function handleKeyClick(key: string) {
  if (key === '⌫') {
    inputAnswer.value = inputAnswer.value.slice(0, -1);
    soundManager.playStep();
  } else if (key === '🛎️') {
    submitAnswer();
  } else {
    if (inputAnswer.value.length < 4) {
      inputAnswer.value += key;
      soundManager.playStep();
    }
  }
}

function submitAnswer() {
  const numAnswer = parseInt(inputAnswer.value, 10);
  if (isNaN(numAnswer)) {
    triggerError();
    return;
  }

  const isCorrect = MathEngine.verifyAnswer(numAnswer, formula.value);
  if (isCorrect) {
    gameStore.completeCheckout(formula.value.totalSum);
  } else {
    triggerError();
  }
}

function triggerError() {
  isShaking.value = true;
  soundManager.playWrong();

  if (customer.value) {
    customer.value.mood = MathEngine.degradeMood(customer.value.mood);
  }

  setTimeout(() => {
    isShaking.value = false;
    inputAnswer.value = '';
  }, 500);
}

function handleKeyDown(e: KeyboardEvent) {
  if (!gameStore.isCashRegisterOpen) return;

  // Direct Enter or NumpadEnter to submit
  if (e.key === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    submitAnswer();
    return;
  }

  // Direct number input (0-9 and Numpad 0-9)
  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    if (inputAnswer.value.length < 4) {
      inputAnswer.value += e.key;
      soundManager.playStep();
      const idx = keypadOptions.indexOf(e.key);
      if (idx !== -1) selectedKeyIndex.value = idx;
    }
    return;
  }

  // Backspace to delete
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    inputAnswer.value = inputAnswer.value.slice(0, -1);
    soundManager.playStep();
    return;
  }

  // Carousel navigation
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    selectedKeyIndex.value = (selectedKeyIndex.value + 1) % keypadOptions.length;
    soundManager.playStep();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    selectedKeyIndex.value = (selectedKeyIndex.value - 1 + keypadOptions.length) % keypadOptions.length;
    soundManager.playStep();
  } else if (e.key === ' ') {
    e.preventDefault();
    const selectedKey = keypadOptions[selectedKeyIndex.value];
    handleKeyClick(selectedKey);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    gameStore.closeCashRegister();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>
