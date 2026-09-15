import type { FruitDef, AdminSettings } from '@/types/game';

export const TILE_SIZE = 48;
export const GRID_COLS = 16;
export const GRID_ROWS = 12;
export const CANVAS_WIDTH = GRID_COLS * TILE_SIZE; // 768 px
export const CANVAS_HEIGHT = GRID_ROWS * TILE_SIZE; // 576 px

// Fixed Coordinates in Grid System
export const COORDS = {
  SHOP: {
    BACK_DOOR: { x: 2, y: 1 },
    FAUCET: { x: 13, y: 1 },
    SHELVES_TOP: [
      { id: 1, x: 1, y: 4 },
      { id: 2, x: 2, y: 4 },
      { id: 3, x: 3, y: 4 },
      { id: 4, x: 4, y: 4 },
      { id: 5, x: 5, y: 4 },
    ],
    SHELVES_BOTTOM: [
      { id: 6, x: 1, y: 7 },
      { id: 7, x: 2, y: 7 },
      { id: 8, x: 3, y: 7 },
      { id: 9, x: 4, y: 7 },
      { id: 10, x: 5, y: 7 },
    ],
    TRASH_CAN: { x: 1, y: 10 },
    COUNTER_REGISTER: { x: 11, y: 4 },
    COUNTER_INTERACTION: { x: 11, y: 3 },
    CUSTOMER_QUEUE: [
      { x: 11, y: 5 },  // Register counter front (in front of register at 11, 4)
      { x: 11, y: 6 },
      { x: 11, y: 7 },
      { x: 11, y: 8 },
      { x: 11, y: 9 },
      { x: 11, y: 10 }, // 6 straight queue slots
      { x: 10, y: 10 }, // Turn along open aisle
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ],
    ENTRANCE_DOOR: { x: 14, y: 11 },
  },
  WAREHOUSE: {
    FRONT_DOOR: { x: 2, y: 1 },
    BASKET_STORAGE: { x: 2, y: 3 },
    FRUIT_PILES_TOP: [
      { id: 1, x: 5, y: 4 },
      { id: 2, x: 6, y: 4 },
      { id: 3, x: 7, y: 4 },
      { id: 4, x: 8, y: 4 },
      { id: 5, x: 9, y: 4 },
    ],
    FRUIT_PILES_BOTTOM: [
      { id: 6, x: 5, y: 8 },
      { id: 7, x: 6, y: 8 },
      { id: 8, x: 7, y: 8 },
      { id: 9, x: 8, y: 8 },
      { id: 10, x: 9, y: 8 },
    ],
  },
};

// 10 Fruit Definitions
export const FRUITS: FruitDef[] = [
  { id: 1, nameEn: 'Apple', nameZh: '紅蘋果', icon: '🍎', color: '#EF4444', defaultPrice: 2 },
  { id: 2, nameEn: 'Banana', nameZh: '香蕉', icon: '🍌', color: '#FACC15', defaultPrice: 1 },
  { id: 3, nameEn: 'Orange', nameZh: '柳橙', icon: '🍊', color: '#FB923C', defaultPrice: 3 },
  { id: 4, nameEn: 'Grape', nameZh: '葡萄', icon: '🍇', color: '#A855F7', defaultPrice: 4 },
  { id: 5, nameEn: 'Strawberry', nameZh: '草莓', icon: '🍓', color: '#F43F5E', defaultPrice: 5 },
  { id: 6, nameEn: 'Watermelon', nameZh: '西瓜', icon: '🍉', color: '#10B981', defaultPrice: 6 },
  { id: 7, nameEn: 'Peach', nameZh: '蜜桃', icon: '🍑', color: '#FDA4AF', defaultPrice: 3 },
  { id: 8, nameEn: 'Pineapple', nameZh: '鳳梨', icon: '🍍', color: '#F59E0B', defaultPrice: 7 },
  { id: 9, nameEn: 'Cherry', nameZh: '櫻桃', icon: '🍒', color: '#E11D48', defaultPrice: 4 },
  { id: 10, nameEn: 'Kiwi', nameZh: '奇異果', icon: '🥝', color: '#84CC16', defaultPrice: 2 },
];

export const FRUIT_MAP = new Map<number, FruitDef>(
  FRUITS.map((f) => [f.id, f])
);

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  customerSpawnBaseSec: 12,
  customerSpawnVarianceSec: 3,
  maxCustomersInStore: 3,
  maxFruitTypesPerCustomer: 2,
  maxQuantityPerItem: 3,
  patienceNeutralSec: 15,
  patienceImpatientsSec: 30,
  miniGameDurationSec: 10,
  miniGameSpeed: 'MEDIUM',
  maxShelfStock: 15,
  fruitPrices: {
    1: 2,
    2: 1,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 3,
    8: 7,
    9: 4,
    10: 2,
  },
};

export const ADMIN_PIN = '1107';

export const CUSTOMER_AVATARS = ['🐰', '🐻', '🐼', '🦊', '🐶', '🐯', '🐵', '🐧'];
