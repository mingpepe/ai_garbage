<template>
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
    <div class="bg-slate-900 border-2 border-slate-700 rounded-3xl shadow-2xl p-6 w-full max-w-2xl text-white flex flex-col gap-6 my-8">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-slate-800 pb-4">
        <div class="flex items-center gap-3">
          <span class="text-3xl">⚙️</span>
          <div>
            <h2 class="text-xl font-bold text-amber-400">工程後台參數設定</h2>
            <p class="text-xs text-slate-400">即時連動 Pinia 狀態機，調整後立即生效</p>
          </div>
        </div>
        <button
          class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-sm font-bold border border-slate-700"
          @click="adminStore.closeSettingsModal"
        >
          關閉 ✕
        </button>
      </div>

      <!-- Settings Sections Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
        <!-- Section 1: Customer Generation -->
        <div class="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 flex flex-col gap-3">
          <h3 class="font-bold text-amber-300 flex items-center gap-2">
            <span>👥</span>
            <span>1. 顧客生成節奏</span>
          </h3>

          <div>
            <div class="flex justify-between text-xs text-slate-300 mb-1">
              <span>生成基礎間隔：</span>
              <span class="font-mono text-amber-400 font-bold">{{ settings.customerSpawnBaseSec }} 秒</span>
            </div>
            <input
              v-model.number="settings.customerSpawnBaseSec"
              type="range"
              min="5"
              max="60"
              class="w-full accent-amber-500"
            />
          </div>

          <div>
            <div class="flex justify-between text-xs text-slate-300 mb-1">
              <span>隨機浮動時間：</span>
              <span class="font-mono text-amber-400 font-bold">± {{ settings.customerSpawnVarianceSec }} 秒</span>
            </div>
            <input
              v-model.number="settings.customerSpawnVarianceSec"
              type="range"
              min="0"
              max="15"
              class="w-full accent-amber-500"
            />
          </div>

          <div>
            <div class="flex justify-between text-xs text-slate-300 mb-1">
              <span>在店最大人數：</span>
              <span class="font-mono text-amber-400 font-bold">{{ settings.maxCustomersInStore }} 人</span>
            </div>
            <input
              v-model.number="settings.maxCustomersInStore"
              type="range"
              min="1"
              max="5"
              class="w-full accent-amber-500"
            />
          </div>
        </div>

        <!-- Section 2: Purchasing Rules -->
        <div class="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 flex flex-col gap-3">
          <h3 class="font-bold text-sky-300 flex items-center gap-2">
            <span>🛒</span>
            <span>2. 顧客購買行為</span>
          </h3>

          <div>
            <div class="flex justify-between text-xs text-slate-300 mb-1">
              <span>單次最大購買種類：</span>
              <span class="font-mono text-sky-400 font-bold">{{ settings.maxFruitTypesPerCustomer }} 種</span>
            </div>
            <input
              v-model.number="settings.maxFruitTypesPerCustomer"
              type="range"
              min="1"
              max="4"
              class="w-full accent-sky-500"
            />
          </div>

          <div>
            <div class="flex justify-between text-xs text-slate-300 mb-1">
              <span>單品項最大購買量：</span>
              <span class="font-mono text-sky-400 font-bold">{{ settings.maxQuantityPerItem }} 顆</span>
            </div>
            <input
              v-model.number="settings.maxQuantityPerItem"
              type="range"
              min="1"
              max="5"
              class="w-full accent-sky-500"
            />
          </div>

          <div>
            <div class="flex justify-between text-xs text-slate-300 mb-1">
              <span>每種水果貨架容量上限：</span>
              <span class="font-mono text-sky-400 font-bold">{{ settings.maxShelfStock ?? 15 }} 顆</span>
            </div>
            <input
              v-model.number="settings.maxShelfStock"
              type="range"
              min="5"
              max="30"
              class="w-full accent-sky-500"
              @input="onMaxStockChange"
            />
          </div>
        </div>

        <!-- Section 3: Patience Thresholds -->
        <div class="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 flex flex-col gap-3">
          <h3 class="font-bold text-emerald-300 flex items-center gap-2">
            <span>⏳</span>
            <span>3. 顧客耐心值門檻</span>
          </h3>

          <div>
            <div class="flex justify-between text-xs text-slate-300 mb-1">
              <span>😊 $\to$ 😐 轉變時間：</span>
              <span class="font-mono text-emerald-400 font-bold">{{ settings.patienceNeutralSec }} 秒</span>
            </div>
            <input
              v-model.number="settings.patienceNeutralSec"
              type="range"
              min="5"
              max="60"
              class="w-full accent-emerald-500"
            />
          </div>

          <div>
            <div class="flex justify-between text-xs text-slate-300 mb-1">
              <span>😐 $\to$ 😣 轉變時間：</span>
              <span class="font-mono text-emerald-400 font-bold">{{ settings.patienceImpatientsSec }} 秒</span>
            </div>
            <input
              v-model.number="settings.patienceImpatientsSec"
              type="range"
              min="5"
              max="60"
              class="w-full accent-emerald-500"
            />
          </div>
        </div>

        <!-- Section 4: Mini Game Settings -->
        <div class="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 flex flex-col gap-3">
          <h3 class="font-bold text-purple-300 flex items-center gap-2">
            <span>🎮</span>
            <span>4. 接水果小遊戲</span>
          </h3>

          <div>
            <div class="flex justify-between text-xs text-slate-300 mb-1">
              <span>小遊戲時限：</span>
              <span class="font-mono text-purple-400 font-bold">{{ settings.miniGameDurationSec }} 秒</span>
            </div>
            <input
              v-model.number="settings.miniGameDurationSec"
              type="range"
              min="10"
              max="120"
              class="w-full accent-purple-500"
            />
          </div>

          <div>
            <span class="text-xs text-slate-300 block mb-1.5">水果下落速度：</span>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="mode in (['SLOW', 'MEDIUM', 'FAST'] as const)"
                :key="mode"
                class="py-1.5 rounded-xl font-bold text-xs border transition-all"
                :class="[
                  settings.miniGameSpeed === mode
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                ]"
                @click="settings.miniGameSpeed = mode"
              >
                {{ mode === 'SLOW' ? '慢速' : mode === 'MEDIUM' ? '中速' : '快速' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 5: Fruit Prices Config -->
      <div class="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 flex flex-col gap-3">
        <h3 class="font-bold text-rose-300 flex items-center gap-2">
          <span>🏷️</span>
          <span>5. 水果單價個別設定 (1~10 元)</span>
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div
            v-for="fruit in FRUITS"
            :key="fruit.id"
            class="bg-slate-800 p-2.5 rounded-xl border border-slate-700 flex flex-col items-center gap-1.5"
          >
            <span class="text-2xl">{{ fruit.icon }}</span>
            <span class="text-xs text-slate-300 font-medium">{{ fruit.nameZh }}</span>
            <div class="flex items-center gap-1">
              <input
                v-model.number="settings.fruitPrices[fruit.id]"
                type="number"
                min="1"
                max="10"
                class="w-12 text-center bg-slate-900 border border-slate-600 rounded-lg py-0.5 text-amber-400 font-bold font-mono"
              />
              <span class="text-xs text-slate-400">元</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 6: Dev Tools -->
      <div class="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 flex flex-col gap-3">
        <h3 class="font-bold text-yellow-300 flex items-center gap-2">
          <span>🛠️</span>
          <span>6. 開發測試工具</span>
        </h3>
        <div class="flex flex-wrap gap-3">
          <button
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all"
            @click="gameStore.refillAllShelves"
          >
            <span>🍎</span>
            <span>一鍵貨架全補滿</span>
          </button>
          <button
            class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all"
            @click="gameStore.instantSpawnCustomer"
          >
            <span>🐰</span>
            <span>一鍵生成顧客</span>
          </button>
          <button
            class="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all"
            @click="gameStore.triggerNeedsMist"
          >
            <span>💧</span>
            <span>觸發貨架缺水（測試灑水）</span>
          </button>
          <button
            class="px-4 py-2 rounded-xl bg-lime-700 hover:bg-lime-600 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all"
            @click="gameStore.triggerRotten"
          >
            <span>🤢</span>
            <span>觸發貨架腐爛（測試垃圾桶）</span>
          </button>
          <button
            class="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 font-bold text-xs flex items-center gap-2 shadow-md transition-all ml-auto"
            @click="adminStore.resetToDefaults"
          >
            <span>🔄</span>
            <span>恢復預設值</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAdminStore } from '@/stores/adminStore';
import { useGameStore } from '@/stores/gameStore';
import { FRUITS } from '@/core/constants';

const adminStore = useAdminStore();
const gameStore = useGameStore();

const settings = computed(() => adminStore.settings);

function onMaxStockChange() {
  const cap = settings.value.maxShelfStock ?? 15;
  gameStore.shelves.forEach((s) => {
    s.maxStock = cap;
    if (s.stock > cap) s.stock = cap;
  });
}
</script>
