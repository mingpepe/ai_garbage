import type {
  Customer,
  ShelfState,
  AdminSettings,
  ShoppingItem,
} from '@/types/game';
import { COORDS, CUSTOMER_AVATARS, FRUIT_MAP } from '@/core/constants';
import { MathEngine } from '@/core/mathEngine';

export class CustomerManager {
  private _customers: Customer[] = [];
  private _spawnTimer = 0;
  private _nextSpawnInterval = 10;
  private _nextId = 1;
  private _playerPos: { x: number; y: number } | null = null;

  constructor() {
    this._customers = [];
  }

  get customers(): Customer[] {
    return this._customers;
  }

  set customers(list: Customer[]) {
    this._customers = list;
  }

  reset(): void {
    this._customers = [];
    this._spawnTimer = 0;
    this._nextId = 1;
    this._playerPos = null;
  }

  // Update customer states, movement, and patience
  update(
    dt: number,
    shelves: ShelfState[],
    settings: AdminSettings,
    onCustomerLeft?: (c: Customer) => void,
    onFruitPicked?: (fruitId: number, count: number, shelfX: number, shelfY: number) => void,
    playerPos?: { x: number; y: number }
  ): void {
    if (playerPos) {
      this._playerPos = playerPos;
    }
    // 1. Check customer spawn timer
    if (this._customers.length < settings.maxCustomersInStore) {
      this._spawnTimer += dt;
      if (this._spawnTimer >= this._nextSpawnInterval) {
        // Only spawn if entrance door area is clear
        const entranceBlocked = this._customers.some(
          (c) => Math.hypot(c.x - COORDS.SHOP.ENTRANCE_DOOR.x, c.y - COORDS.SHOP.ENTRANCE_DOOR.y) < 1.0
        );
        if (!entranceBlocked) {
          this._spawnTimer = 0;
          this._calcNextSpawnInterval(settings);
          this.spawnCustomer(shelves, settings);
        }
      }
    }

    // 2. Update individual customer lifecycle
    for (let i = this._customers.length - 1; i >= 0; i--) {
      const c = this._customers[i];
      c.totalTime += dt;

      if (c.bubbleTimer && c.bubbleTimer > 0) {
        c.bubbleTimer -= dt;
        if (c.bubbleTimer <= 0) {
          c.bubbleText = undefined;
        }
      }

      // Update patience mood while waiting
      if (c.state === 'WAITING_CHECKOUT') {
        c.waitTime += dt;
        if (c.waitTime >= settings.patienceImpatientsSec) {
          c.mood = 'IMPATIENT';
        } else if (c.waitTime >= settings.patienceNeutralSec) {
          if (c.mood !== 'IMPATIENT') {
            c.mood = 'NEUTRAL';
          }
        }
      }

      // Move along current path avoiding other customers as physical obstacles
      this._moveCustomer(c, dt, shelves, i, onFruitPicked);

      // Check if left the shop completely
      if (c.state === 'LEAVING') {
        const exitDist = Math.hypot(
          c.x - COORDS.SHOP.ENTRANCE_DOOR.x,
          c.y - COORDS.SHOP.ENTRANCE_DOOR.y
        );
        if (exitDist < 0.2) {
          if (onCustomerLeft) onCustomerLeft(c);
          this._customers.splice(i, 1);
        }
      }
    }

    // 3. Keep customers separated so they never overlap or pass through each other
    for (let i = 0; i < this._customers.length; i++) {
      for (let j = i + 1; j < this._customers.length; j++) {
        const c1 = this._customers[i];
        const c2 = this._customers[j];
        const dist = Math.hypot(c1.x - c2.x, c1.y - c2.y);
        if (dist < 0.82 && dist > 0.001) {
          const overlap = (0.82 - dist) * 0.5;
          const nx = (c1.x - c2.x) / dist;
          const ny = (c1.y - c2.y) / dist;

          if (c1.state !== 'WAITING_CHECKOUT' && c1.state !== 'CHECKING_OUT') {
            const tx = c1.x + nx * overlap;
            const ty = c1.y + ny * overlap;
            if (isShopTileWalkable(Math.round(tx), Math.round(ty))) {
              c1.x = tx;
              c1.y = ty;
            }
          }
          if (c2.state !== 'WAITING_CHECKOUT' && c2.state !== 'CHECKING_OUT') {
            const tx = c2.x - nx * overlap;
            const ty = c2.y - ny * overlap;
            if (isShopTileWalkable(Math.round(tx), Math.round(ty))) {
              c2.x = tx;
              c2.y = ty;
            }
          }
        }
      }
    }

    // Mutual separation between customers and player kitten
    if (this._playerPos) {
      for (const c of this._customers) {
        if (c.state === 'WAITING_CHECKOUT' || c.state === 'CHECKING_OUT') continue;
        const dist = Math.hypot(c.x - this._playerPos.x, c.y - this._playerPos.y);
        if (dist < 0.82 && dist > 0.001) {
          const overlap = 0.82 - dist;
          const nx = (c.x - this._playerPos.x) / dist;
          const ny = (c.y - this._playerPos.y) / dist;
          const tx = c.x + nx * overlap;
          const ty = c.y + ny * overlap;
          if (isShopTileWalkable(Math.round(tx), Math.round(ty))) {
            c.x = tx;
            c.y = ty;
          }
        }
      }
    }

    // 4. Keep queue ordered and advancing smoothly
    this._updateQueuePositions();
  }

  // Calculate next spawn interval
  private _calcNextSpawnInterval(settings: AdminSettings): void {
    const variance = (Math.random() * 2 - 1) * settings.customerSpawnVarianceSec;
    this._nextSpawnInterval = Math.max(2, settings.customerSpawnBaseSec + variance);
  }

  // Spawn a new customer
  spawnCustomer(
    shelves: ShelfState[],
    settings: AdminSettings
  ): Customer | null {
    const availableShelves = shelves.filter((s) => s.stock > 0);

    const customer: Customer = {
      id: `cust_${this._nextId++}_${Date.now()}`,
      avatarIndex: Math.floor(Math.random() * CUSTOMER_AVATARS.length),
      state: 'ENTERING',
      mood: 'HAPPY',
      x: COORDS.SHOP.ENTRANCE_DOOR.x,
      y: COORDS.SHOP.ENTRANCE_DOOR.y,
      targetX: COORDS.SHOP.ENTRANCE_DOOR.x,
      targetY: COORDS.SHOP.ENTRANCE_DOOR.y,
      path: [],
      items: [],
      wishlist: [],
      currentShoppingIndex: 0,
      waitTime: 0,
      totalTime: 0,
      pickedFruits: false,
    };

    // Edge case: All shelves have 0 stock
    if (availableShelves.length === 0) {
      customer.state = 'LEAVING';
      customer.mood = 'IMPATIENT';
      customer.bubbleText = '💨 ❓';
      customer.bubbleTimer = 2.0;
      customer.targetX = COORDS.SHOP.ENTRANCE_DOOR.x;
      customer.targetY = COORDS.SHOP.ENTRANCE_DOOR.y;
      customer.path = findShopPath(customer.x, customer.y, customer.targetX, customer.targetY);
      this._customers.push(customer);
      return customer;
    }

    // Build customer wishlist of fruits they want to buy
    // NOTE: DO NOT deduct shelf stock on spawn! Fruit is strictly deducted only when the customer physically picks it!
    const numTypes = Math.min(
      availableShelves.length,
      Math.floor(Math.random() * settings.maxFruitTypesPerCustomer) + 1
    );

    const shuffled = [...availableShelves].sort(() => Math.random() - 0.5);
    const chosenShelves = shuffled.slice(0, numTypes);
    const wishlist: ShoppingItem[] = [];

    for (const shelf of chosenShelves) {
      const desiredCount = Math.floor(Math.random() * settings.maxQuantityPerItem) + 1;
      const unitPrice = settings.fruitPrices[shelf.fruitId] ?? 2;
      wishlist.push({
        fruitId: shelf.fruitId,
        unitPrice,
        count: desiredCount,
      });
    }

    customer.wishlist = wishlist;
    customer.items = []; // Shopping cart starts empty; fruits are added only when physically picked from shelf

    if (wishlist.length === 0) {
      customer.state = 'LEAVING';
      customer.bubbleText = '💨';
      customer.bubbleTimer = 1.5;
      const blocked = this._getBlockedTilesForCustomer(customer);
      customer.path = findShopPath(customer.x, customer.y, customer.targetX, customer.targetY, blocked);
    } else {
      customer.state = 'BROWSING';
      this._assignNextDestination(customer, shelves, this._customers.length);
    }

    this._customers.push(customer);
    return customer;
  }

  // Path movement logic for customer along collision-free waypoints
  private _moveCustomer(
    c: Customer,
    dt: number,
    shelves: ShelfState[],
    queueIndex: number,
    onFruitPicked?: (fruitId: number, count: number, shelfX: number, shelfY: number) => void
  ): void {
    // Pause at shelf while picking/browsing
    if (c.state === 'PICKING') {
      if (c.browseWaitTimer && c.browseWaitTimer > 0) {
        c.browseWaitTimer -= dt;
        return;
      } else {
        // Customer physically takes fruit from the shelf at this exact moment!
        const currentWish = c.wishlist ? c.wishlist[c.currentShoppingIndex] : undefined;
        if (currentWish) {
          const shelf = shelves.find((s) => s.fruitId === currentWish.fruitId);
          if (shelf && shelf.stock > 0) {
            // Strictly reduce shelf stock by exactly how much the customer takes!
            const takeAmount = Math.min(currentWish.count, shelf.stock);
            shelf.stock -= takeAmount;

            c.items.push({
              fruitId: currentWish.fruitId,
              unitPrice: currentWish.unitPrice,
              count: takeAmount,
            });

            const f = FRUIT_MAP.get(currentWish.fruitId);
            c.bubbleText = f ? `${f.icon} 🧺` : '🧺';
            c.bubbleTimer = 1.8;

            if (onFruitPicked) {
              onFruitPicked(currentWish.fruitId, takeAmount, shelf.x, shelf.y);
            }
          } else {
            // Shelf out of stock, could not get this fruit
            const f = currentWish ? FRUIT_MAP.get(currentWish.fruitId) : null;
            c.bubbleText = f ? `${f.icon} ❓` : '❓';
            c.bubbleTimer = 1.8;
          }
        }

        c.currentShoppingIndex++;
        const nextWish = c.wishlist ? c.wishlist[c.currentShoppingIndex] : undefined;
        if (nextWish) {
          c.state = 'BROWSING';
          this._assignNextDestination(c, shelves, queueIndex);
        } else {
          // Finished all wishlist items
          if (c.items.length > 0) {
            this._joinQueue(c);
          } else {
            // Couldn't buy any fruit
            c.state = 'LEAVING';
            c.bubbleText = '💨 ❓';
            c.bubbleTimer = 2.0;
            c.targetX = COORDS.SHOP.ENTRANCE_DOOR.x;
            c.targetY = COORDS.SHOP.ENTRANCE_DOOR.y;
            const blocked = this._getBlockedTilesForCustomer(c);
            c.path = findShopPath(c.x, c.y, c.targetX, c.targetY, blocked);
          }
        }
        return;
      }
    }

    const speed = 2.0; // relaxed walking speed
    const MIN_SEPARATION = 0.82; // Tile distance threshold to prevent customers from walking through each other

    // Ensure waypoint path exists if away from target
    if (!c.path || c.path.length === 0) {
      const dist = Math.hypot(c.targetX - c.x, c.targetY - c.y);
      if (dist > 0.08) {
        const blocked = this._getBlockedTilesForCustomer(c);
        c.path = findShopPath(c.x, c.y, c.targetX, c.targetY, blocked);
      }
    }

    // Follow waypoint path strictly to navigate around fruit shelves, fixtures, and other customers
    if (c.path && c.path.length > 0) {
      const nextTile = c.path[0];

      // Check if next waypoint tile is currently blocked by another customer OR the player kitten
      const blockingCust = this._customers.find((other) => {
        if (other.id === c.id) return false;
        return Math.hypot(other.x - nextTile.x, other.y - nextTile.y) < 0.78;
      });
      const blockingPlayer = this._playerPos && Math.hypot(this._playerPos.x - nextTile.x, this._playerPos.y - nextTile.y) < 0.78;

      if (blockingCust || blockingPlayer) {
        // Immediate waypoint is blocked! Attempt to find detour path around obstacle
        const blocked = this._getBlockedTilesForCustomer(c);
        const detour = findShopPath(c.x, c.y, c.targetX, c.targetY, blocked);
        if (detour.length > 0 && (detour[0].x !== nextTile.x || detour[0].y !== nextTile.y)) {
          c.path = detour;
        } else {
          // If no immediate detour exists, pause and wait politely for the obstacle to clear
          return;
        }
      }

      const activeNextTile = c.path[0];
      const dx = activeNextTile.x - c.x;
      const dy = activeNextTile.y - c.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 0.08) {
        const step = Math.min(dist, speed * dt);
        const proposedX = c.x + (dx / dist) * step;
        const proposedY = c.y + (dy / dist) * step;

        // Verify that moving forward doesn't penetrate into any other customer OR player kitten
        let willCollide = false;
        for (const other of this._customers) {
          if (other.id === c.id) continue;
          if (Math.hypot(proposedX - other.x, proposedY - other.y) < MIN_SEPARATION) {
            willCollide = true;
            break;
          }
        }
        if (!willCollide && this._playerPos) {
          if (Math.hypot(proposedX - this._playerPos.x, proposedY - this._playerPos.y) < MIN_SEPARATION) {
            willCollide = true;
          }
        }

        if (!willCollide) {
          c.x = proposedX;
          c.y = proposedY;
        } else {
          // Obstacle detected ahead! Re-path around them
          const blocked = this._getBlockedTilesForCustomer(c);
          const detour = findShopPath(c.x, c.y, c.targetX, c.targetY, blocked);
          if (detour.length > 0) {
            c.path = detour;
          }
        }
      } else {
        c.x = activeNextTile.x;
        c.y = activeNextTile.y;
        c.path.shift();
        if (c.path.length === 0) {
          const remainingDist = Math.hypot(c.targetX - c.x, c.targetY - c.y);
          if (remainingDist <= 0.1) {
            c.x = c.targetX;
            c.y = c.targetY;
            this._onCustomerReachedTarget(c, shelves, queueIndex);
          }
        }
      }
    } else {
      const dist = Math.hypot(c.targetX - c.x, c.targetY - c.y);
      if (dist <= 0.1) {
        c.x = c.targetX;
        c.y = c.targetY;
        this._onCustomerReachedTarget(c, shelves, queueIndex);
      }
    }
  }

  // Handle target arrival
  private _onCustomerReachedTarget(
    c: Customer,
    shelves: ShelfState[],
    queueIndex: number
  ): void {
    if (c.state === 'BROWSING') {
      // Customer stays at shelf to inspect and pick fruit for 3.0 to 4.5 seconds
      c.state = 'PICKING';
      c.browseWaitTimer = 3.0 + Math.random() * 1.5;
      const currentWish = c.wishlist ? c.wishlist[c.currentShoppingIndex] : undefined;
      const f = currentWish ? FRUIT_MAP.get(currentWish.fruitId) : null;
      c.bubbleText = f ? `${f.icon} 🔍` : '👀';
      c.bubbleTimer = 2.0;
    } else if (c.state === 'WALKING_TO_QUEUE') {
      c.state = 'WAITING_CHECKOUT';
      this._updateQueuePositions();
    }
  }

  // Collect positions of all other customers and player kitten as obstacles for customer c
  private _getBlockedTilesForCustomer(c: Customer): Set<string> {
    const set = new Set<string>();

    // Kitten position is an obstacle
    if (this._playerPos) {
      set.add(`${Math.round(this._playerPos.x)},${Math.round(this._playerPos.y)}`);
    }

    for (const other of this._customers) {
      if (other.id === c.id) continue;

      // Current tile occupied by other customer
      set.add(`${Math.round(other.x)},${Math.round(other.y)}`);

      // If other customer is moving, also reserve their immediate next tile
      if (other.path && other.path.length > 0) {
        set.add(`${other.path[0].x},${other.path[0].y}`);
      }

      // If other customer is standing in line or picking, reserve their target position
      if (
        other.state === 'PICKING' ||
        other.state === 'WAITING_CHECKOUT' ||
        other.state === 'CHECKING_OUT'
      ) {
        set.add(`${other.targetX},${other.targetY}`);
      }
    }
    return set;
  }

  // Find a free, unblocked browsing spot in front of or next to the shelf so customers never overlap
  private _findFreeBrowsingSpot(shelf: ShelfState, customerId: string): { x: number; y: number } {
    const candidates: Array<{ x: number; y: number }> = [];
    if (shelf.y === 4) {
      candidates.push({ x: shelf.x, y: 5 }); // direct front
      candidates.push({ x: shelf.x, y: 6 }); // 1 step back in aisle
      candidates.push({ x: shelf.x, y: 3 }); // walkway behind shelf
      if (shelf.x === 5) candidates.push({ x: 6, y: 4 });
      if (shelf.x === 1) candidates.push({ x: 0, y: 4 });
    } else {
      candidates.push({ x: shelf.x, y: 8 }); // direct front
      candidates.push({ x: shelf.x, y: 6 }); // aisle behind shelf
      candidates.push({ x: shelf.x, y: 9 }); // 1 step back
      if (shelf.x === 5) candidates.push({ x: 6, y: 7 });
      if (shelf.x === 1) candidates.push({ x: 0, y: 7 });
    }

    for (const cand of candidates) {
      if (!isShopTileWalkable(cand.x, cand.y)) continue;
      // Check if player kitten is currently standing at this spot
      if (this._playerPos && Math.hypot(this._playerPos.x - cand.x, this._playerPos.y - cand.y) < 0.8) {
        continue;
      }
      // Check if any other customer is at or heading to this spot
      const isTaken = this._customers.some((other) => {
        if (other.id === customerId) return false;
        const atCand = Math.hypot(other.x - cand.x, other.y - cand.y) < 0.8;
        const targetingCand = other.targetX === cand.x && other.targetY === cand.y;
        return atCand || targetingCand;
      });
      if (!isTaken) {
        return cand;
      }
    }

    // Default fallback spot
    return { x: shelf.x, y: shelf.y === 4 ? 5 : 8 };
  }

  // Assign destination in front of shelf in the open aisles
  private _assignNextDestination(
    c: Customer,
    shelves: ShelfState[],
    _queueIndex: number
  ): void {
    const currentWish = c.wishlist ? c.wishlist[c.currentShoppingIndex] : undefined;
    if (!currentWish) {
      if (c.items.length > 0) {
        this._joinQueue(c);
      } else {
        c.state = 'LEAVING';
        c.targetX = COORDS.SHOP.ENTRANCE_DOOR.x;
        c.targetY = COORDS.SHOP.ENTRANCE_DOOR.y;
        const blocked = this._getBlockedTilesForCustomer(c);
        c.path = findShopPath(c.x, c.y, c.targetX, c.targetY, blocked);
      }
      return;
    }

    const shelf = shelves.find((s) => s.fruitId === currentWish.fruitId);
    if (shelf) {
      const spot = this._findFreeBrowsingSpot(shelf, c.id);
      c.targetX = spot.x;
      c.targetY = spot.y;
      const blocked = this._getBlockedTilesForCustomer(c);
      c.path = findShopPath(c.x, c.y, spot.x, spot.y, blocked);
    } else {
      this._joinQueue(c);
    }
  }

  // Customer joins the checkout queue line
  private _joinQueue(c: Customer): void {
    if (!c.queueJoinTime) {
      c.queueJoinTime = performance.now();
    }
    c.state = 'WALKING_TO_QUEUE';
    this._updateQueuePositions();
  }

  // Get all customers currently in queue, strictly sorted by arrival time
  private _getQueuedCustomers(): Customer[] {
    return this._customers
      .filter(
        (c) =>
          c.state === 'WAITING_CHECKOUT' ||
          c.state === 'CHECKING_OUT' ||
          c.state === 'WALKING_TO_QUEUE'
      )
      .sort((a, b) => (a.queueJoinTime ?? 0) - (b.queueJoinTime ?? 0));
  }

  // Re-align all customers waiting in queue so they stand in a neat, orderly line without crowding
  private _updateQueuePositions(): void {
    const queueSlots = COORDS.SHOP.CUSTOMER_QUEUE;
    const queueCusts = this._getQueuedCustomers();

    queueCusts.forEach((c, idx) => {
      const slotIdx = Math.min(idx, queueSlots.length - 1);
      const slot = queueSlots[slotIdx];
      if (c.targetX !== slot.x || c.targetY !== slot.y) {
        c.targetX = slot.x;
        c.targetY = slot.y;
        c.path = findShopPath(c.x, c.y, slot.x, slot.y);
      }
    });
  }

  // Find customer waiting at the front of checkout counter (slot 0)
  getFirstWaitingCustomer(): Customer | undefined {
    const queued = this._getQueuedCustomers();
    return queued.find(
      (c) => c.state === 'WAITING_CHECKOUT' || c.state === 'CHECKING_OUT'
    );
  }

  // Customer successfully checks out
  finishCheckout(customerId: string): boolean {
    const c = this._customers.find((cust) => cust.id === customerId);
    if (!c) return false;

    c.state = 'LEAVING';
    c.mood = 'HAPPY';
    c.queueJoinTime = undefined;
    c.targetX = COORDS.SHOP.ENTRANCE_DOOR.x;
    c.targetY = COORDS.SHOP.ENTRANCE_DOOR.y;
    const blocked = this._getBlockedTilesForCustomer(c);
    c.path = findShopPath(c.x, c.y, c.targetX, c.targetY, blocked);
    c.bubbleText = '✨ 💖';
    c.bubbleTimer = 2.0;

    // Advance the remaining waiting customers in line forward
    this._updateQueuePositions();
    return true;
  }
}

// Check if a tile in the shop is walkable and free of fruit shelves and fixtures
export function isShopTileWalkable(x: number, y: number): boolean {
  if (x < 0 || x > 15 || y < 1 || y > 11) return false;

  // Shelves 1~5 (top row) at (1, 4) ~ (5, 4)
  if (y === 4 && x >= 1 && x <= 5) return false;

  // Shelves 6~10 (bottom row) at (1, 7) ~ (5, 7)
  if (y === 7 && x >= 1 && x <= 5) return false;

  // Trash can at (1, 10)
  if (x === 1 && y === 10) return false;

  // Cash register counter at COORDS.SHOP.COUNTER_REGISTER (11, 4)
  if (x === COORDS.SHOP.COUNTER_REGISTER.x && y === COORDS.SHOP.COUNTER_REGISTER.y) return false;

  // Faucet at (13, 1)
  if (x === 13 && y === 1) return false;

  return true;
}

// Breadth-First-Search (BFS) shortest pathfinder avoiding shelves, fixtures, and other customer obstacles
export function findShopPath(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  blockedTiles?: Set<string>
): Array<{ x: number; y: number }> {
  const sx = Math.max(0, Math.min(15, Math.round(startX)));
  const sy = Math.max(1, Math.min(11, Math.round(startY)));
  const tx = Math.max(0, Math.min(15, Math.round(targetX)));
  const ty = Math.max(1, Math.min(11, Math.round(targetY)));

  if (sx === tx && sy === ty) return [];

  const queue: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
  const visited = new Set<string>();
  visited.add(`${sx},${sy}`);
  const parent = new Map<string, { x: number; y: number }>();

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  let found = false;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.x === tx && curr.y === ty) {
      found = true;
      break;
    }

    for (const dir of directions) {
      const nx = curr.x + dir.dx;
      const ny = curr.y + dir.dy;
      const key = `${nx},${ny}`;

      if (!visited.has(key)) {
        const isTarget = nx === tx && ny === ty;
        const isBlocked = blockedTiles ? blockedTiles.has(key) : false;

        // If target tile, or walkable shop tile that is not blocked by another customer
        if ((isTarget && isShopTileWalkable(nx, ny)) || (!isBlocked && isShopTileWalkable(nx, ny))) {
          visited.add(key);
          parent.set(key, curr);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  // If no path found when avoiding customer obstacles, fallback to base terrain path
  if (!found && blockedTiles && blockedTiles.size > 0) {
    return findShopPath(startX, startY, targetX, targetY);
  }

  if (!found) {
    return [{ x: tx, y: ty }];
  }

  // Backtrack path
  const path: Array<{ x: number; y: number }> = [];
  let curr = { x: tx, y: ty };
  while (curr.x !== sx || curr.y !== sy) {
    path.unshift({ ...curr });
    const p = parent.get(`${curr.x},${curr.y}`);
    if (!p) break;
    curr = p;
  }

  return path;
}
