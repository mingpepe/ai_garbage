import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AdminSettings } from '@/types/game';
import { DEFAULT_ADMIN_SETTINGS, ADMIN_PIN } from '@/core/constants';

export const useAdminStore = defineStore('admin', () => {
  const isUnlocked = ref(false);
  const isPinModalOpen = ref(false);
  const isSettingsModalOpen = ref(false);

  const settings = ref<AdminSettings>({
    customerSpawnBaseSec: DEFAULT_ADMIN_SETTINGS.customerSpawnBaseSec,
    customerSpawnVarianceSec: DEFAULT_ADMIN_SETTINGS.customerSpawnVarianceSec,
    maxCustomersInStore: DEFAULT_ADMIN_SETTINGS.maxCustomersInStore,
    maxFruitTypesPerCustomer: DEFAULT_ADMIN_SETTINGS.maxFruitTypesPerCustomer,
    maxQuantityPerItem: DEFAULT_ADMIN_SETTINGS.maxQuantityPerItem,
    patienceNeutralSec: DEFAULT_ADMIN_SETTINGS.patienceNeutralSec,
    patienceImpatientsSec: DEFAULT_ADMIN_SETTINGS.patienceImpatientsSec,
    miniGameDurationSec: DEFAULT_ADMIN_SETTINGS.miniGameDurationSec,
    miniGameSpeed: DEFAULT_ADMIN_SETTINGS.miniGameSpeed,
    maxShelfStock: DEFAULT_ADMIN_SETTINGS.maxShelfStock ?? 15,
    fruitPrices: { ...DEFAULT_ADMIN_SETTINGS.fruitPrices },
  });

  function verifyPin(pin: string): boolean {
    if (pin === ADMIN_PIN) {
      isUnlocked.value = true;
      isPinModalOpen.value = false;
      isSettingsModalOpen.value = true;
      return true;
    }
    return false;
  }

  function openPinModal(): void {
    if (isUnlocked.value) {
      isSettingsModalOpen.value = true;
    } else {
      isPinModalOpen.value = true;
    }
  }

  function closePinModal(): void {
    isPinModalOpen.value = false;
  }

  function closeSettingsModal(): void {
    isSettingsModalOpen.value = false;
  }

  function updateFruitPrice(fruitId: number, price: number): void {
    settings.value.fruitPrices[fruitId] = Math.max(1, Math.min(10, price));
  }

  function resetToDefaults(): void {
    settings.value = {
      customerSpawnBaseSec: DEFAULT_ADMIN_SETTINGS.customerSpawnBaseSec,
      customerSpawnVarianceSec: DEFAULT_ADMIN_SETTINGS.customerSpawnVarianceSec,
      maxCustomersInStore: DEFAULT_ADMIN_SETTINGS.maxCustomersInStore,
      maxFruitTypesPerCustomer: DEFAULT_ADMIN_SETTINGS.maxFruitTypesPerCustomer,
      maxQuantityPerItem: DEFAULT_ADMIN_SETTINGS.maxQuantityPerItem,
      patienceNeutralSec: DEFAULT_ADMIN_SETTINGS.patienceNeutralSec,
      patienceImpatientsSec: DEFAULT_ADMIN_SETTINGS.patienceImpatientsSec,
      miniGameDurationSec: DEFAULT_ADMIN_SETTINGS.miniGameDurationSec,
      miniGameSpeed: DEFAULT_ADMIN_SETTINGS.miniGameSpeed,
      maxShelfStock: DEFAULT_ADMIN_SETTINGS.maxShelfStock ?? 15,
      fruitPrices: { ...DEFAULT_ADMIN_SETTINGS.fruitPrices },
    };
  }

  return {
    isUnlocked,
    isPinModalOpen,
    isSettingsModalOpen,
    settings,
    verifyPin,
    openPinModal,
    closePinModal,
    closeSettingsModal,
    updateFruitPrice,
    resetToDefaults,
  };
});
