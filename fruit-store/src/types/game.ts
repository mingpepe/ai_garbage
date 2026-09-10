export type SceneType = 'SHOP' | 'WAREHOUSE' | 'MINI_GAME';

export type PlayerCarryType =
  | 'EMPTY'
  | 'MIST_SPRAYER'
  | 'ROTTEN_FRUIT'
  | 'BASKET_EMPTY'
  | 'BASKET_FULL';

export interface PlayerCarryState {
  type: PlayerCarryType;
  fruitId?: number;
  count?: number;
}

export type CustomerMood = 'HAPPY' | 'NEUTRAL' | 'IMPATIENT';

export type CustomerState =
  | 'ENTERING'
  | 'BROWSING'
  | 'PICKING'
  | 'WALKING_TO_QUEUE'
  | 'WAITING_CHECKOUT'
  | 'CHECKING_OUT'
  | 'LEAVING';

export interface ShoppingItem {
  fruitId: number;
  unitPrice: number;
  count: number;
}

export interface Customer {
  id: string;
  avatarIndex: number;
  state: CustomerState;
  mood: CustomerMood;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  path: Array<{ x: number; y: number }>;
  items: ShoppingItem[];
  wishlist?: ShoppingItem[];
  currentShoppingIndex: number;
  waitTime: number;
  totalTime: number;
  pickedFruits: boolean;
  bubbleText?: string;
  bubbleTimer?: number;
  browseWaitTimer?: number;
  queueJoinTime?: number;
}

export interface FruitDef {
  id: number;
  nameEn: string;
  nameZh: string;
  icon: string;
  color: string;
  defaultPrice: number;
}

export interface ShelfState {
  id: number;
  fruitId: number;
  stock: number;
  maxStock: number;
  freshness: number; // 0 to 100
  isRotten: boolean;
  needsMist: boolean;
  x: number;
  y: number;
}

export interface FruitPileState {
  id: number;
  fruitId: number;
  x: number;
  y: number;
}

export interface FallingFruit {
  id: number;
  x: number;
  y: number;
  speed: number;
  fruitId: number;
  icon: string;
  size: number;
  rotation: number;
  rotSpeed: number;
  caught: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  type: 'STAR' | 'COIN' | 'WATER' | 'SMOKE' | 'HEART' | 'CONFETTI';
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  scale: number;
  life: number;
}

export interface AdminSettings {
  customerSpawnBaseSec: number;
  customerSpawnVarianceSec: number;
  maxCustomersInStore: number;
  maxFruitTypesPerCustomer: number;
  maxQuantityPerItem: number;
  patienceNeutralSec: number;
  patienceImpatientsSec: number;
  miniGameDurationSec: number;
  miniGameSpeed: 'SLOW' | 'MEDIUM' | 'FAST';
  fruitPrices: Record<number, number>;
  maxShelfStock?: number;
}
