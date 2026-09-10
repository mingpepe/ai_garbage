import { defineStore } from 'pinia';
import { ref } from 'vue';
import type {
  SceneType,
  ShelfState,
  FruitPileState,
  Customer,
  Particle,
  FloatingText,
} from '@/types/game';
import { COORDS, FRUITS, FRUIT_MAP, GRID_COLS, GRID_ROWS } from '@/core/constants';
import { PlayerStateMachine } from '@/core/stateMachine';
import { CustomerManager } from '@/core/customerManager';
import { MiniGameEngine } from '@/core/physics';
import { soundManager } from '@/core/audio';
import { useAdminStore } from '@/stores/adminStore';

export const useGameStore = defineStore('game', () => {
  const adminStore = useAdminStore();

  // Active scene
  const currentScene = ref<SceneType>('SHOP');

  // Player state
  const playerX = ref<number>(8);
  const playerY = ref<number>(6);
  const playerFacing = ref<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>('DOWN');
  const isMoving = ref<boolean>(false);
  const stateMachine = ref<PlayerStateMachine>(new PlayerStateMachine());

  // Shop Shelves
  const shelves = ref<ShelfState[]>([
    ...COORDS.SHOP.SHELVES_TOP.map((s, idx) => ({
      id: s.id,
      fruitId: FRUITS[idx].id,
      stock: 5,
      maxStock: adminStore.settings.maxShelfStock ?? 15,
      freshness: 100,
      isRotten: false,
      needsMist: false,
      x: s.x,
      y: s.y,
    })),
    ...COORDS.SHOP.SHELVES_BOTTOM.map((s, idx) => ({
      id: s.id,
      fruitId: FRUITS[idx + 5].id,
      stock: 5,
      maxStock: adminStore.settings.maxShelfStock ?? 15,
      freshness: 100,
      isRotten: false,
      needsMist: false,
      x: s.x,
      y: s.y,
    })),
  ]);

  // Warehouse Fruit Piles
  const fruitPiles = ref<FruitPileState[]>([
    ...COORDS.WAREHOUSE.FRUIT_PILES_TOP.map((p, idx) => ({
      id: p.id,
      fruitId: FRUITS[idx].id,
      x: p.x,
      y: p.y,
    })),
    ...COORDS.WAREHOUSE.FRUIT_PILES_BOTTOM.map((p, idx) => ({
      id: p.id,
      fruitId: FRUITS[idx + 5].id,
      x: p.x,
      y: p.y,
    })),
  ]);

  // Customer Manager
  const customerManager = ref<CustomerManager>(new CustomerManager());
  const activeCheckingCustomer = ref<Customer | null>(null);
  const isCashRegisterOpen = ref<boolean>(false);

  // Coins Earned
  const totalCoins = ref<number>(0);

  // Particles & Animations
  const particles = ref<Particle[]>([]);
  const floatingTexts = ref<FloatingText[]>([]);

  // Mini Game instance
  const miniGameInstance = ref<MiniGameEngine | null>(null);

  // Scene transition state (snappy ~240ms transition between rooms and mini-game)
  const isTransitioning = ref<boolean>(false);

  // Switch Scene with sleek, fast transition (never drags on)
  function switchScene(scene: SceneType): void {
    if (isTransitioning.value || currentScene.value === scene) return;

    isTransitioning.value = true;
    soundManager.playDoor();

    setTimeout(() => {
      currentScene.value = scene;

      if (scene === 'SHOP') {
        playerX.value = COORDS.SHOP.BACK_DOOR.x;
        playerY.value = COORDS.SHOP.BACK_DOOR.y + 1;
        playerFacing.value = 'DOWN';
      } else if (scene === 'WAREHOUSE') {
        playerX.value = COORDS.WAREHOUSE.FRONT_DOOR.x;
        playerY.value = COORDS.WAREHOUSE.FRONT_DOOR.y + 1;
        playerFacing.value = 'DOWN';
      }

      setTimeout(() => {
        isTransitioning.value = false;
      }, 30);
    }, 120);
  }

  // Check if a tile is walkable for the player kitten (can walk freely along door rows, but cannot walk on fruit shelves or fixtures)
  function isPlayerWalkable(targetX: number, targetY: number): boolean {
    if (currentScene.value === 'SHOP') {
      // Map boundaries: 0 <= x <= 15, 1 <= y <= 11 (leftmost and rightmost columns are walkable)
      if (targetX < 0 || targetX > 15 || targetY < 1 || targetY > 11) return false;

      // Shelves 1~10 cannot be walked onto!
      if (shelves.value.some((s) => s.x === targetX && s.y === targetY)) return false;

      // Cash register counter cannot be walked onto!
      if (targetX === COORDS.SHOP.COUNTER_REGISTER.x && targetY === COORDS.SHOP.COUNTER_REGISTER.y) return false;

      // Trash can (1, 10) cannot be walked onto!
      if (targetX === COORDS.SHOP.TRASH_CAN.x && targetY === COORDS.SHOP.TRASH_CAN.y) return false;

      // Faucet sink (13, 1) cannot be walked onto!
      if (targetX === COORDS.SHOP.FAUCET.x && targetY === COORDS.SHOP.FAUCET.y) return false;

      // Player kitten CANNOT walk into or through any customer!
      const blockedByCustomer = customerManager.value.customers.some(
        (c) => Math.hypot(targetX - c.x, targetY - c.y) < 0.78
      );
      if (blockedByCustomer) return false;

      return true;
    } else if (currentScene.value === 'WAREHOUSE') {
      // Map boundaries: 0 <= x <= 15, 1 <= y <= 10 (leftmost and rightmost columns are walkable)
      if (targetX < 0 || targetX > 15 || targetY < 1 || targetY > 10) return false;

      // Fruit piles 1~10 cannot be walked onto!
      if (fruitPiles.value.some((p) => p.x === targetX && p.y === targetY)) return false;

      // Basket storage (2, 3) cannot be walked onto!
      if (targetX === COORDS.WAREHOUSE.BASKET_STORAGE.x && targetY === COORDS.WAREHOUSE.BASKET_STORAGE.y) return false;

      return true;
    }
    return true;
  }

  // Move Player with collision prevention against walking on fruit
  function movePlayer(dx: number, dy: number): void {
    if (isTransitioning.value) return;

    if (dx > 0) playerFacing.value = 'RIGHT';
    else if (dx < 0) playerFacing.value = 'LEFT';
    else if (dy > 0) playerFacing.value = 'DOWN';
    else if (dy < 0) playerFacing.value = 'UP';

    const newX = playerX.value + dx;
    const newY = playerY.value + dy;

    if (isPlayerWalkable(newX, newY)) {
      playerX.value = newX;
      playerY.value = newY;
      isMoving.value = true;
      soundManager.playStep();
    }
  }

  // Stop moving animation
  function stopMoving(): void {
    isMoving.value = false;
  }

  // Check what interactable object is directly in front or single closest to player
  function getNearbyInteractable(): string | null {
    const px = playerX.value;
    const py = playerY.value;
    const facing = playerFacing.value;

    let frontX = px;
    let frontY = py;
    if (facing === 'UP') frontY -= 1;
    else if (facing === 'DOWN') frontY += 1;
    else if (facing === 'LEFT') frontX -= 1;
    else if (facing === 'RIGHT') frontX += 1;

    if (currentScene.value === 'SHOP') {
      // 1. Direct facing target has absolute priority
      if (frontX === COORDS.SHOP.BACK_DOOR.x && frontY === COORDS.SHOP.BACK_DOOR.y) return 'DOOR_WAREHOUSE';
      if (frontX === COORDS.SHOP.FAUCET.x && frontY === COORDS.SHOP.FAUCET.y) return 'FAUCET';
      if (frontX === COORDS.SHOP.TRASH_CAN.x && frontY === COORDS.SHOP.TRASH_CAN.y) return 'TRASH_CAN';
      if (frontX === COORDS.SHOP.COUNTER_REGISTER.x && frontY === COORDS.SHOP.COUNTER_REGISTER.y) return 'REGISTER';
      if (frontX === COORDS.SHOP.COUNTER_INTERACTION.x && frontY === COORDS.SHOP.COUNTER_INTERACTION.y) return 'REGISTER';

      // Check if shelf directly in front
      const frontShelf = shelves.value.find((s) => s.x === frontX && s.y === frontY);
      if (frontShelf) return `SHELF_${frontShelf.id}`;

      // 2. Adjacent fixtures within 1 tile
      if (Math.hypot(px - COORDS.SHOP.BACK_DOOR.x, py - COORDS.SHOP.BACK_DOOR.y) <= 1.0) return 'DOOR_WAREHOUSE';
      if (Math.hypot(px - COORDS.SHOP.FAUCET.x, py - COORDS.SHOP.FAUCET.y) <= 1.0) return 'FAUCET';
      if (Math.hypot(px - COORDS.SHOP.TRASH_CAN.x, py - COORDS.SHOP.TRASH_CAN.y) <= 1.0) return 'TRASH_CAN';
      if (
        Math.hypot(px - COORDS.SHOP.COUNTER_INTERACTION.x, py - COORDS.SHOP.COUNTER_INTERACTION.y) <= 1.0 ||
        Math.hypot(px - COORDS.SHOP.COUNTER_REGISTER.x, py - COORDS.SHOP.COUNTER_REGISTER.y) <= 1.2
      ) {
        return 'REGISTER';
      }

      // 3. Single strictly closest shelf (distance <= 1.1)
      let closestShelf: ShelfState | null = null;
      let minDistance = Infinity;
      for (const s of shelves.value) {
        const d = Math.hypot(px - s.x, py - s.y);
        if (d <= 1.15 && d < minDistance) {
          minDistance = d;
          closestShelf = s;
        }
      }
      if (closestShelf) return `SHELF_${closestShelf.id}`;
    } else if (currentScene.value === 'WAREHOUSE') {
      // 1. Direct facing target
      if (frontX === COORDS.WAREHOUSE.FRONT_DOOR.x && frontY === COORDS.WAREHOUSE.FRONT_DOOR.y) return 'DOOR_SHOP';
      if (frontX === COORDS.WAREHOUSE.BASKET_STORAGE.x && frontY === COORDS.WAREHOUSE.BASKET_STORAGE.y) return 'BASKET_STORAGE';
      const frontPile = fruitPiles.value.find((p) => p.x === frontX && p.y === frontY);
      if (frontPile) return `FRUIT_PILE_${frontPile.id}`;

      // 2. Adjacent fixtures
      if (Math.hypot(px - COORDS.WAREHOUSE.FRONT_DOOR.x, py - COORDS.WAREHOUSE.FRONT_DOOR.y) <= 1.0) return 'DOOR_SHOP';
      if (Math.hypot(px - COORDS.WAREHOUSE.BASKET_STORAGE.x, py - COORDS.WAREHOUSE.BASKET_STORAGE.y) <= 1.0) return 'BASKET_STORAGE';

      // 3. Single strictly closest fruit pile (distance <= 1.15)
      let closestPile = null;
      let minDistance = Infinity;
      for (const p of fruitPiles.value) {
        const d = Math.hypot(px - p.x, py - p.y);
        if (d <= 1.15 && d < minDistance) {
          minDistance = d;
          closestPile = p;
        }
      }
      if (closestPile) return `FRUIT_PILE_${closestPile.id}`;
    }

    return null;
  }

  // Handle Space Key Interaction
  function handleInteract(): void {
    if (isTransitioning.value) return;

    const target = getNearbyInteractable();
    if (!target) return;

    if (currentScene.value === 'SHOP') {
      if (target === 'DOOR_WAREHOUSE') {
        switchScene('WAREHOUSE');
        return;
      }
      if (target === 'FAUCET') {
        if (stateMachine.value.isHoldingSprayer) {
          stateMachine.value.returnSprayer();
          soundManager.playInteract();
          spawnFloatingText('🚿 ↩️', playerX.value, playerY.value);
        } else if (stateMachine.value.isHoldingEmpty) {
          stateMachine.value.pickSprayer();
          soundManager.playInteract();
          spawnFloatingText('🚿 ✨', playerX.value, playerY.value);
        }
        return;
      }
      if (target === 'TRASH_CAN') {
        if (stateMachine.value.isHoldingRotten) {
          stateMachine.value.discardInTrash();
          soundManager.playTrash();
          spawnFloatingText('🗑️ ✨', playerX.value, playerY.value);
        }
        return;
      }
      if (target === 'REGISTER') {
        const cust = customerManager.value.getFirstWaitingCustomer();
        if (cust && (cust.state === 'WAITING_CHECKOUT' || cust.state === 'CHECKING_OUT')) {
          cust.state = 'CHECKING_OUT';
          activeCheckingCustomer.value = cust;
          isCashRegisterOpen.value = true;
          soundManager.playInteract();
        }
        return;
      }
      if (target.startsWith('SHELF_')) {
        const shelfId = parseInt(target.replace('SHELF_', ''), 10);
        const shelf = shelves.value.find((s) => s.id === shelfId);
        if (!shelf) return;

        // If holding mist sprayer
        if (stateMachine.value.isHoldingSprayer) {
          stateMachine.value.mistShelf(shelf);
          soundManager.playMist();
          emitWaterParticles(shelf.x * 48 + 24, shelf.y * 48 + 24);
          spawnFloatingText('💧 ✨', shelf.x, shelf.y);
          return;
        }

        // If holding full basket of this fruit
        if (stateMachine.value.isHoldingFullBasket && stateMachine.value.state.fruitId === shelf.fruitId) {
          const res = stateMachine.value.restockShelf(shelf);
          if (res.success) {
            soundManager.playInteract();
            emitStars(shelf.x * 48 + 24, shelf.y * 48 + 24);
            const fruitIcon = FRUIT_MAP.get(shelf.fruitId)?.icon ?? '🍎';
            spawnFloatingText(`+${res.added} ${fruitIcon}`, shelf.x, shelf.y);
          }
          return;
        }

        // If shelf is rotten and player is empty handed
        if (shelf.isRotten && stateMachine.value.isHoldingEmpty) {
          stateMachine.value.pickRottenFruit(shelf.fruitId);
          shelf.isRotten = false;
          shelf.stock = 0;
          soundManager.playInteract();
          spawnFloatingText('🤢 🤏', shelf.x, shelf.y);
          return;
        }
      }
    } else if (currentScene.value === 'WAREHOUSE') {
      if (target === 'DOOR_SHOP') {
        switchScene('SHOP');
        return;
      }
      if (target === 'BASKET_STORAGE') {
        if (stateMachine.value.isHoldingEmpty) {
          stateMachine.value.pickBasket();
          soundManager.playInteract();
          spawnFloatingText('🧺 🎒', playerX.value, playerY.value);
        } else if (stateMachine.value.isHoldingEmptyBasket) {
          stateMachine.value.returnBasket();
          soundManager.playInteract();
          spawnFloatingText('🧺 ↩️', playerX.value, playerY.value);
        }
        return;
      }
      if (target.startsWith('FRUIT_PILE_')) {
        const pileId = parseInt(target.replace('FRUIT_PILE_', ''), 10);
        const pile = fruitPiles.value.find((p) => p.id === pileId);
        if (!pile) return;

        // Start mini-game: MUST hold an empty basket!
        if (stateMachine.value.isHoldingEmptyBasket) {
          startMiniGame(pile.fruitId);
        } else if (stateMachine.value.isHoldingEmpty) {
          // Must fetch a basket from the basket rack first
          spawnFloatingText('🧺 👈', playerX.value, playerY.value);
          soundManager.playWrong();
        } else if (stateMachine.value.isHoldingFullBasket) {
          // Already holding fruit, must restock in store first
          spawnFloatingText('🏪 📦', playerX.value, playerY.value);
          soundManager.playWrong();
        } else {
          spawnFloatingText('🧺 ❓', playerX.value, playerY.value);
          soundManager.playWrong();
        }
        return;
      }
    }
  }

  // Start Mini-Game with short smooth transition
  function startMiniGame(fruitId: number): void {
    if (isTransitioning.value) return;
    const fruit = FRUITS.find((f) => f.id === fruitId);
    if (!fruit) return;

    isTransitioning.value = true;
    soundManager.playDoor();

    setTimeout(() => {
      miniGameInstance.value = new MiniGameEngine(
        fruit.id,
        fruit.icon,
        adminStore.settings.miniGameDurationSec,
        adminStore.settings.miniGameSpeed
      );
      currentScene.value = 'MINI_GAME';

      setTimeout(() => {
        isTransitioning.value = false;
      }, 30);
    }, 120);
  }

  // Finish Mini-Game with short smooth transition
  function finishMiniGame(): void {
    if (isTransitioning.value || !miniGameInstance.value) return;

    const count = miniGameInstance.value.collectedCount;
    const fruitId = miniGameInstance.value.fruitId;

    isTransitioning.value = true;
    soundManager.playDoor();

    setTimeout(() => {
      stateMachine.value.setBasketFull(fruitId, count);
      miniGameInstance.value = null;
      currentScene.value = 'WAREHOUSE';

      spawnFloatingText(`+${count} 📦`, playerX.value, playerY.value);

      setTimeout(() => {
        isTransitioning.value = false;
      }, 30);
    }, 120);
  }

  // Complete checkout
  function completeCheckout(earnedCoins: number): void {
    if (!activeCheckingCustomer.value) return;

    totalCoins.value += earnedCoins;
    customerManager.value.finishCheckout(activeCheckingCustomer.value.id);
    activeCheckingCustomer.value = null;
    isCashRegisterOpen.value = false;
    soundManager.playCashRegister();

    emitCoins(COORDS.SHOP.COUNTER_REGISTER.x * 48 + 24, COORDS.SHOP.COUNTER_REGISTER.y * 48 + 24);
    spawnFloatingText(`+${earnedCoins} 🪙`, COORDS.SHOP.COUNTER_REGISTER.x, COORDS.SHOP.COUNTER_REGISTER.y);
  }

  // Close Register Modal
  function closeCashRegister(): void {
    if (activeCheckingCustomer.value && activeCheckingCustomer.value.state === 'CHECKING_OUT') {
      activeCheckingCustomer.value.state = 'WAITING_CHECKOUT';
    }
    activeCheckingCustomer.value = null;
    isCashRegisterOpen.value = false;
  }

  // Admin Tools
  function refillAllShelves(): void {
    shelves.value.forEach((s) => {
      s.stock = s.maxStock;
      s.freshness = 100;
      s.isRotten = false;
      s.needsMist = false;
    });
    soundManager.playInteract();
    emitStars(400, 300);
  }

  function instantSpawnCustomer(): void {
    customerManager.value.spawnCustomer(shelves.value, adminStore.settings);
    soundManager.playInteract();
  }

  function triggerNeedsMist(): void {
    const valid = shelves.value.filter((s) => s.stock > 0 && !s.isRotten);
    if (valid.length > 0) {
      const s = valid[Math.floor(Math.random() * valid.length)];
      s.freshness = 30;
      s.needsMist = true;
      spawnFloatingText('💧', s.x, s.y);
      soundManager.playInteract();
    }
  }

  function triggerRotten(): void {
    const valid = shelves.value.filter((s) => s.stock > 0);
    if (valid.length > 0) {
      const s = valid[Math.floor(Math.random() * valid.length)];
      s.freshness = 0;
      s.isRotten = true;
      s.needsMist = false;
      spawnFloatingText('🤢', s.x, s.y);
      soundManager.playWrong();
    }
  }

  // Particle Emitters
  function emitStars(x: number, y: number): void {
    const colors = ['#FDE047', '#F59E0B', '#38BDF8'];
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 100;
      particles.value.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        color: colors[i % colors.length],
        size: 6,
        alpha: 1.0,
        life: 0.6,
        maxLife: 0.6,
        type: 'STAR',
      });
    }
  }

  function emitCoins(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 120;
      particles.value.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        color: '#FACC15',
        size: 8,
        alpha: 1.0,
        life: 0.8,
        maxLife: 0.8,
        type: 'COIN',
      });
    }
  }

  function emitWaterParticles(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 60;
      particles.value.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: '#38BDF8',
        size: 4,
        alpha: 0.8,
        life: 0.4,
        maxLife: 0.4,
        type: 'WATER',
      });
    }
  }

  function spawnFloatingText(text: string, gx: number, gy: number): void {
    floatingTexts.value.push({
      id: `ft_${Date.now()}_${Math.random()}`,
      x: gx * 48 + 24,
      y: gy * 48 - 8,
      text,
      color: '#FFFFFF',
      alpha: 1.0,
      scale: 1.0,
      life: 1.2,
    });
  }

  // Unified Game Simulation Tick (runs both in foreground 60fps and background tab ticker)
  function tick(dt: number): void {
    if (currentScene.value === 'SHOP') {
      // 1. Customer lifecycle, spawning, queueing
      customerManager.value.update(
        dt,
        shelves.value,
        adminStore.settings,
        undefined,
        (fruitId, count, shelfX, shelfY) => {
          const f = FRUIT_MAP.get(fruitId);
          spawnFloatingText(`-${count} ${f?.icon ?? '🍎'}`, shelfX, shelfY);
          soundManager.playCatchFruit();
        },
        { x: playerX.value, y: playerY.value }
      );

      // 2. Shelf freshness decay (fruit on display slowly dries out and needs mist)
      for (const s of shelves.value) {
        if (s.stock > 0 && !s.isRotten) {
          s.freshness = Math.max(0, s.freshness - dt * 0.95);
          if (s.freshness < 50) {
            s.needsMist = true;
          }
          if (s.freshness <= 0) {
            s.isRotten = true;
            s.needsMist = false;
          }
        }
      }
    } else if (currentScene.value === 'MINI_GAME') {
      const mg = miniGameInstance.value;
      if (mg && !mg.isFinished) {
        const finished = mg.update(dt, (_fruit) => {
          soundManager.playCatchFruit();
        });
        if (finished) {
          finishMiniGame();
        }
      }
    }

    // 3. Update floating texts
    for (let i = floatingTexts.value.length - 1; i >= 0; i--) {
      const ft = floatingTexts.value[i];
      ft.y -= 25 * dt;
      ft.life -= dt;
      ft.alpha = Math.max(0, ft.life / 1.2);
      if (ft.life <= 0) {
        floatingTexts.value.splice(i, 1);
      }
    }

    // 4. Update particles
    for (let i = particles.value.length - 1; i >= 0; i--) {
      const p = particles.value[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        particles.value.splice(i, 1);
      }
    }
  }

  return {
    currentScene,
    isTransitioning,
    playerX,
    playerY,
    playerFacing,
    isMoving,
    stateMachine,
    shelves,
    fruitPiles,
    customerManager,
    activeCheckingCustomer,
    isCashRegisterOpen,
    totalCoins,
    particles,
    floatingTexts,
    miniGameInstance,
    switchScene,
    movePlayer,
    stopMoving,
    getNearbyInteractable,
    handleInteract,
    startMiniGame,
    finishMiniGame,
    completeCheckout,
    closeCashRegister,
    refillAllShelves,
    instantSpawnCustomer,
    triggerNeedsMist,
    triggerRotten,
    tick,
  };
});
