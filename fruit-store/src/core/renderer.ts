import {
  TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  COORDS,
  FRUIT_MAP,
  CUSTOMER_AVATARS,
} from '@/core/constants';
import type {
  SceneType,
  ShelfState,
  FruitPileState,
  Customer,
  PlayerCarryState,
  Particle,
  FloatingText,
} from '@/types/game';
import type { MiniGameEngine } from '@/core/physics';

// Polyfill roundRect for environments and browsers without native support
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    this: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radii?: number | number[]
  ) {
    const r = typeof radii === 'number' ? radii : Array.isArray(radii) ? radii[0] || 0 : 0;
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + radius, y);
    this.arcTo(x + w, y, x + w, y + h, radius);
    this.arcTo(x + w, y + h, x, y + h, radius);
    this.arcTo(x, y + h, x, y, radius);
    this.arcTo(x, y, x + w, y, radius);
    this.closePath();
    return this;
  };
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  scene: SceneType;
  playerX: number;
  playerY: number;
  playerFacing: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  playerCarry: PlayerCarryState;
  isMoving: boolean;
  shelves: ShelfState[];
  fruitPiles: FruitPileState[];
  customers: Customer[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  timeSec: number;
  activeInteraction?: string;
  miniGame?: MiniGameEngine | null;
}

export class GameRenderer {
  // Main draw dispatch
  static render(rc: RenderContext): void {
    const { ctx, scene } = rc;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (scene === 'SHOP') {
      this.drawShopScene(rc);
    } else if (scene === 'WAREHOUSE') {
      this.drawWarehouseScene(rc);
    } else if (scene === 'MINI_GAME') {
      this.drawMiniGameScene(rc);
    }

    // Common particles and floating numbers
    this.drawParticles(ctx, rc.particles);
    this.drawFloatingTexts(ctx, rc.floatingTexts);
  }

  // ==========================================
  // SCENE A: SHOP RENDERING
  // ==========================================
  static drawShopScene(rc: RenderContext): void {
    const { ctx, playerX, playerY, shelves, customers, timeSec } = rc;

    // 1. Floor Tiles & Walls
    this.drawShopFloor(ctx);

    // 2. Fixtures & Furniture
    this.drawDoor(ctx, COORDS.SHOP.BACK_DOOR.x, COORDS.SHOP.BACK_DOOR.y, '🚪 倉庫', '#F59E0B');
    this.drawFaucet(ctx, COORDS.SHOP.FAUCET.x, COORDS.SHOP.FAUCET.y, timeSec);
    this.drawTrashCan(ctx, COORDS.SHOP.TRASH_CAN.x, COORDS.SHOP.TRASH_CAN.y);
    this.drawCashCounter(ctx, COORDS.SHOP.COUNTER_REGISTER.x, COORDS.SHOP.COUNTER_REGISTER.y, timeSec);
    this.drawEntranceMat(ctx, COORDS.SHOP.ENTRANCE_DOOR.x, COORDS.SHOP.ENTRANCE_DOOR.y);

    // 3. Shelves
    shelves.forEach((shelf) => {
      this.drawShelf(ctx, shelf, timeSec);
    });

    // 4. Customers
    customers.forEach((c) => {
      this.drawCustomer(ctx, c, timeSec);
    });

    // 5. Player
    this.drawPlayer(ctx, playerX, playerY, rc.playerFacing, rc.playerCarry, rc.isMoving, timeSec);

    // 6. Interaction Proximity Hint Highlight
    this.drawInteractionPrompts(rc);
  }

  // Draw Shop Flooring
  private static drawShopFloor(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#FEF3C7'; // warm wood parquet
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid parquet lines
    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 1;
    for (let c = 0; c <= GRID_COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * TILE_SIZE, 0);
      ctx.lineTo(c * TILE_SIZE, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * TILE_SIZE);
      ctx.lineTo(CANVAS_WIDTH, r * TILE_SIZE);
      ctx.stroke();
    }

    // Walls top border
    ctx.fillStyle = '#78350F';
    ctx.fillRect(0, 0, CANVAS_WIDTH, TILE_SIZE * 0.7);

    // Cute decorative shop awning stripe at top
    const stripeW = 32;
    for (let x = 0; x < CANVAS_WIDTH; x += stripeW * 2) {
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(x, 0, stripeW, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x + stripeW, 0, stripeW, 16);
    }
  }

  // Draw Beautiful Architectural Door (Connecting Shop & Warehouse)
  private static drawDoor(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    label: string,
    badgeBgColor: string
  ): void {
    const px = gx * TILE_SIZE;
    const py = gy * TILE_SIZE;
    const w = TILE_SIZE;
    const h = TILE_SIZE;

    ctx.save();

    // 1. Threshold drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.roundRect(px + 2, py + h - 5, w - 4, 7, 3);
    ctx.fill();

    // Warm golden under-door light spill
    const glowGrad = ctx.createLinearGradient(px, py + h - 4, px, py + h + 8);
    glowGrad.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
    glowGrad.addColorStop(1, 'rgba(251, 191, 36, 0.0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(px + 3, py + h - 4, w - 6, 10);

    // 2. Heavy Stone / Sturdy Timber Outer Frame Arch
    ctx.fillStyle = '#451A03'; // Deep rustic frame
    ctx.beginPath();
    ctx.roundRect(px + 2, py + 1, w - 4, h - 3, [10, 10, 2, 2]);
    ctx.fill();

    // Outer frame bevel highlight
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Keystone / arch center stone at top
    ctx.fillStyle = '#92400E';
    ctx.beginPath();
    ctx.roundRect(px + w / 2 - 6, py, 12, 5, 2);
    ctx.fill();

    // 3. Wooden Door Body (Rich Cedar Plank Gradient)
    const doorGrad = ctx.createLinearGradient(px, py + 4, px + w, py + h);
    doorGrad.addColorStop(0, '#B45309');
    doorGrad.addColorStop(0.5, '#92400E');
    doorGrad.addColorStop(1, '#78350F');
    ctx.fillStyle = doorGrad;
    ctx.beginPath();
    ctx.roundRect(px + 5, py + 4, w - 10, h - 7, [7, 7, 0, 0]);
    ctx.fill();

    // 4. Vertical Wood Planks (fine plank seams)
    ctx.strokeStyle = 'rgba(69, 26, 3, 0.6)';
    ctx.lineWidth = 1;
    const plankW = (w - 10) / 3;
    for (let i = 1; i < 3; i++) {
      const sx = px + 5 + i * plankW;
      ctx.beginPath();
      ctx.moveTo(sx, py + 5);
      ctx.lineTo(sx, py + h - 4);
      ctx.stroke();
    }

    // 5. Black Iron Hinges / Strap Bands
    ctx.fillStyle = '#1E293B';
    // Top strap band
    ctx.fillRect(px + 5, py + 12, w - 10, 3);
    // Bottom strap band
    ctx.fillRect(px + 5, py + h - 13, w - 10, 3);

    // Metallic rivets on iron straps
    ctx.fillStyle = '#94A3B8';
    [-9, 0, 9].forEach((offset) => {
      ctx.beginPath();
      ctx.arc(px + w / 2 + offset, py + 13.5, 1.2, 0, Math.PI * 2);
      ctx.arc(px + w / 2 + offset, py + h - 11.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // 6. Polished Brass Door Knob / Plate
    const handleX = px + w - 11;
    const handleY = py + h / 2 + 1;
    // Brass plate
    ctx.fillStyle = '#78350F';
    ctx.beginPath();
    ctx.arc(handleX, handleY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // Shiny gold knob
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(handleX, handleY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(handleX - 1, handleY - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // 7. Destination Indicator Badge (Compact & Elegant)
    const isWarehouse = label.includes('倉庫');
    const badgeEmoji = isWarehouse ? '📦' : '🏪';
    ctx.fillStyle = badgeBgColor || '#F59E0B';
    ctx.beginPath();
    ctx.arc(px + w / 2, py + 22, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.font = '11px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeEmoji, px + w / 2, py + 22.5);

    ctx.restore();
  }

  // Draw Water Faucet & Mist Sprayer Station
  private static drawFaucet(ctx: CanvasRenderingContext2D, gx: number, gy: number, timeSec: number): void {
    const px = gx * TILE_SIZE;
    const py = gy * TILE_SIZE;

    ctx.save();
    // Sink basin
    ctx.fillStyle = '#E2E8F0';
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8, 8);
    ctx.fill();
    ctx.stroke();

    // Water ripple
    const ripple = (Math.sin(timeSec * 4) + 1) * 0.5;
    ctx.fillStyle = `rgba(56, 189, 248, ${0.4 + ripple * 0.3})`;
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2 + 4, 10 + ripple * 3, 0, Math.PI * 2);
    ctx.fill();

    // Icon
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚿', px + TILE_SIZE / 2, py + TILE_SIZE / 2 - 2);
    ctx.restore();
  }

  // Draw Trash Can
  private static drawTrashCan(ctx: CanvasRenderingContext2D, gx: number, gy: number): void {
    const px = gx * TILE_SIZE;
    const py = gy * TILE_SIZE;

    ctx.save();
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.roundRect(px + 6, py + 6, TILE_SIZE - 12, TILE_SIZE - 12, 6);
    ctx.fill();

    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🗑️', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
    ctx.restore();
  }

  // Draw Checkout Counter & Register
  private static drawCashCounter(ctx: CanvasRenderingContext2D, gx: number, gy: number, timeSec: number): void {
    const px = gx * TILE_SIZE;
    const py = gy * TILE_SIZE;

    ctx.save();
    // Counter wooden table
    ctx.fillStyle = '#B45309';
    ctx.beginPath();
    ctx.roundRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4, 8);
    ctx.fill();

    // Register top
    ctx.fillStyle = '#FCD34D';
    ctx.beginPath();
    ctx.roundRect(px + 6, py + 6, TILE_SIZE - 12, TILE_SIZE - 12, 6);
    ctx.fill();

    const bounce = Math.sin(timeSec * 3) * 2;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛎️', px + TILE_SIZE / 2, py + TILE_SIZE / 2 + bounce);
    ctx.restore();
  }

  // Draw Shop Main Entrance (Glass Double Doors & Velvet Welcome Carpet)
  private static drawEntranceMat(ctx: CanvasRenderingContext2D, gx: number, gy: number): void {
    const px = gx * TILE_SIZE;
    const py = gy * TILE_SIZE;
    const w = TILE_SIZE;
    const h = TILE_SIZE;

    ctx.save();

    // 1. Velvet Welcome Carpet on the floor
    // Deep ruby red mat with curved corners
    ctx.fillStyle = '#9F1239'; // Deep crimson velvet
    ctx.beginPath();
    ctx.roundRect(px + 3, py + 12, w - 6, h - 14, 5);
    ctx.fill();

    // Golden embroidered border
    ctx.strokeStyle = '#FCD34D';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px + 5, py + 14, w - 10, h - 18, 3);
    ctx.stroke();

    // Gold carpet star / welcome motif
    ctx.fillStyle = '#FDE047';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ 歡迎 ★', px + w / 2, py + h - 10);

    // 2. Modern Glass Double Doors threshold frame
    ctx.fillStyle = '#334155'; // Dark slate metallic frame
    ctx.fillRect(px + 4, py, w - 8, 12);
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 4, py, w - 8, 12);

    // 3. Glass Panes with cyan sky tint & reflections
    const glassGrad = ctx.createLinearGradient(px, py, px + w, py + 12);
    glassGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
    glassGrad.addColorStop(0.5, 'rgba(186, 230, 253, 0.65)');
    glassGrad.addColorStop(1, 'rgba(56, 189, 248, 0.45)');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(px + 6, py + 2, w / 2 - 7, 8);
    ctx.fillRect(px + w / 2 + 1, py + 2, w / 2 - 7, 8);

    // Specular diagonal reflection on glass
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 9);
    ctx.lineTo(px + 14, py + 3);
    ctx.moveTo(px + w / 2 + 3, py + 9);
    ctx.lineTo(px + w / 2 + 9, py + 3);
    ctx.stroke();

    // 4. Center Gold Vertical Handles
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(px + w / 2 - 2, py + 3, 1.5, 6);
    ctx.fillRect(px + w / 2 + 0.5, py + 3, 1.5, 6);

    // 5. Overhead Welcome Bell
    ctx.font = '13px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛎️', px + w / 2, py + 2);

    ctx.restore();
  }

  // Draw Fruit Shelf
  private static drawShelf(ctx: CanvasRenderingContext2D, shelf: ShelfState, timeSec: number): void {
    const px = shelf.x * TILE_SIZE;
    const py = shelf.y * TILE_SIZE;
    const fruit = FRUIT_MAP.get(shelf.fruitId);
    if (!fruit) return;

    ctx.save();
    // Wooden Shelf Base
    ctx.fillStyle = '#92400E';
    ctx.beginPath();
    ctx.roundRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4, 8);
    ctx.fill();

    ctx.fillStyle = '#D97706';
    ctx.beginPath();
    ctx.roundRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8, 6);
    ctx.fill();

    // Shelf Stock Status Badge at bottom: e.g. "5/15" or "15/15"
    const max = shelf.maxStock || 15;
    const isFull = shelf.stock >= max;
    const isEmpty = shelf.stock <= 0;

    if (isEmpty) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚫', px + TILE_SIZE / 2, py + TILE_SIZE / 2 - 7);

      // Empty Badge
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.beginPath();
      ctx.roundRect(px + 4, py + 31, TILE_SIZE - 8, 13, 4);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(`0/${max}`, px + TILE_SIZE / 2, py + 37.5);
    } else {
      // Fruit Icon with gentle bobbing
      const bob = Math.sin(timeSec * 2 + shelf.id) * 1.5;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fruit.icon, px + TILE_SIZE / 2, py + 18 + bob);

      // Capacity & Count Pill Badge (e.g. 5/15, 15/15)
      ctx.beginPath();
      ctx.roundRect(px + 4, py + 30, TILE_SIZE - 8, 14, 4);
      if (isFull) {
        ctx.fillStyle = '#F59E0B'; // shiny gold when at max capacity
        ctx.fill();
        ctx.strokeStyle = '#FCD34D';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(`${shelf.stock}/${max}✨`, px + TILE_SIZE / 2, py + 37);
      } else {
        ctx.fillStyle = '#FEF3C7'; // warm cream badge
        ctx.fill();
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Mini progress bar fill inside badge
        const progressW = Math.min(1, shelf.stock / max) * (TILE_SIZE - 10);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
        ctx.beginPath();
        ctx.roundRect(px + 5, py + 31, progressW, 12, 3);
        ctx.fill();

        ctx.fillStyle = '#78350F';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.fillText(`${shelf.stock}/${max}`, px + TILE_SIZE / 2, py + 37);
      }
    }

    // Warning Alert Badge (Needs Mist 💧 or Rotten 🤢)
    if (shelf.isRotten) {
      // Stink pulse animation
      const stinkPulse = Math.sin(timeSec * 6 + shelf.id) * 3;
      ctx.save();
      ctx.fillStyle = '#DCFCE7';
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE - 6, py + 4 + stinkPulse, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🤢', px + TILE_SIZE - 6, py + 5 + stinkPulse);
      ctx.restore();
    } else if (shelf.needsMist) {
      // Water droplet bounce animation
      const dropBounce = Math.sin(timeSec * 6 + shelf.id) * 3;
      ctx.save();
      ctx.fillStyle = '#E0F2FE';
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE - 6, py + 4 + dropBounce, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💧', px + TILE_SIZE - 6, py + 5 + dropBounce);
      ctx.restore();
    }

    ctx.restore();
  }

  // Draw Customer
  private static drawCustomer(ctx: CanvasRenderingContext2D, c: Customer, timeSec: number): void {
    const px = c.x * TILE_SIZE;
    const py = c.y * TILE_SIZE;
    const avatar = CUSTOMER_AVATARS[c.avatarIndex % CUSTOMER_AVATARS.length];

    ctx.save();
    const bob = Math.sin(timeSec * 6 + c.x * 3) * 2;
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2 + bob;

    // Solid opaque backing badge
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Animal avatar
    ctx.font = '26px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatar, cx, cy + 1);

    // Mood Emoji badge
    let moodEmoji = '😊';
    if (c.mood === 'NEUTRAL') moodEmoji = '😐';
    if (c.mood === 'IMPATIENT') moodEmoji = '😣';

    ctx.font = '15px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillText(moodEmoji, cx + 13, cy - 11);

    // Custom Thought Bubble
    if (c.bubbleText) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(px - 10, py - 26, 68, 22, 10);
      ctx.fill();
      ctx.stroke();

      ctx.font = '13px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.fillStyle = '#1E293B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.bubbleText, px + 24, py - 15);
    } else if (c.state === 'WAITING_CHECKOUT' || c.state === 'CHECKING_OUT') {
      // Show basket summary icon bubble
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = '#FCD34D';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(px - 4, py - 24, 56, 20, 8);
      ctx.fill();
      ctx.stroke();

      let itemsStr = '';
      c.items.forEach((item) => {
        const f = FRUIT_MAP.get(item.fruitId);
        if (f) itemsStr += f.icon;
      });
      ctx.font = '12px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(itemsStr || '🧺', px + 24, py - 14);
    }

    ctx.restore();
  }

  // Draw Player Character (Cute Kitten)
  private static drawPlayer(
    ctx: CanvasRenderingContext2D,
    pxTile: number,
    pyTile: number,
    _facing: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT',
    carry: PlayerCarryState,
    isMoving: boolean,
    timeSec: number
  ): void {
    const px = pxTile * TILE_SIZE;
    const py = pyTile * TILE_SIZE;
    const walkBounce = isMoving ? Math.sin(timeSec * 16) * 3 : 0;
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2 + walkBounce;

    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, py + TILE_SIZE / 2 + 16, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Solid Opaque Badge for Player Kitten (100% solid, bright and never transparent)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Cute Player Cat Avatar
    ctx.font = '32px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐱', cx, cy + 1);

    // Carry Item Visual
    if (carry.type === 'MIST_SPRAYER') {
      ctx.font = '18px "Segoe UI Emoji", sans-serif';
      ctx.fillText('🚿', cx + 16, cy - 10);
    } else if (carry.type === 'ROTTEN_FRUIT') {
      const f = FRUIT_MAP.get(carry.fruitId ?? 1);
      ctx.font = '18px "Segoe UI Emoji", sans-serif';
      ctx.fillText(f?.icon ?? '🤢', cx + 16, cy - 10);
    } else if (carry.type === 'BASKET_EMPTY') {
      ctx.font = '18px "Segoe UI Emoji", sans-serif';
      ctx.fillText('🧺', cx - 14, cy - 10);
    } else if (carry.type === 'BASKET_FULL') {
      const f = FRUIT_MAP.get(carry.fruitId ?? 1);
      ctx.font = '20px "Segoe UI Emoji", sans-serif';
      ctx.fillText(`📦${f?.icon ?? '🍎'}`, cx, cy - 22);

      // Bubble count
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(cx + 20, cy - 26, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${carry.count ?? 1}`, cx + 20, cy - 26);
    }

    ctx.restore();
  }

  // Draw Highlight Action Rings when player is adjacent to interactable objects (Zero-Text, no text above player)
  private static drawInteractionPrompts(rc: RenderContext): void {
    const { ctx, activeInteraction, timeSec } = rc;
    if (!activeInteraction) return;

    const pulse = (Math.sin(timeSec * 6) + 1) * 0.5;
    ctx.save();

    // Warm golden pulsing interaction aura beneath the player kitten's feet
    const cx = rc.playerX * TILE_SIZE + TILE_SIZE / 2;
    const cy = rc.playerY * TILE_SIZE + TILE_SIZE / 2 + 15;

    ctx.strokeStyle = `rgba(251, 191, 36, ${0.7 + pulse * 0.3})`;
    ctx.lineWidth = 2.5;
    ctx.fillStyle = `rgba(251, 191, 36, ${0.18 + pulse * 0.18})`;

    ctx.beginPath();
    ctx.ellipse(cx, cy, 18 + pulse * 3, 8 + pulse * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ==========================================
  // SCENE B: WAREHOUSE RENDERING
  // ==========================================
  static drawWarehouseScene(rc: RenderContext): void {
    const { ctx, playerX, playerY, fruitPiles, timeSec } = rc;

    // 1. Warehouse rustic brick floor
    ctx.fillStyle = '#78716C';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Stone tile grid
    ctx.strokeStyle = '#57534E';
    ctx.lineWidth = 1;
    for (let c = 0; c <= GRID_COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * TILE_SIZE, 0);
      ctx.lineTo(c * TILE_SIZE, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * TILE_SIZE);
      ctx.lineTo(CANVAS_WIDTH, r * TILE_SIZE);
      ctx.stroke();
    }

    // 2. Front Door to Shop
    this.drawDoor(ctx, COORDS.WAREHOUSE.FRONT_DOOR.x, COORDS.WAREHOUSE.FRONT_DOOR.y, '🚪 店鋪', '#10B981');

    // 3. Basket Storage Rack
    const bpx = COORDS.WAREHOUSE.BASKET_STORAGE.x * TILE_SIZE;
    const bpy = COORDS.WAREHOUSE.BASKET_STORAGE.y * TILE_SIZE;
    ctx.save();
    // Warm mat
    ctx.fillStyle = '#92400E';
    ctx.beginPath();
    ctx.roundRect(bpx + 1, bpy + 1, TILE_SIZE - 2, TILE_SIZE - 2, 8);
    ctx.fill();

    ctx.fillStyle = '#D97706';
    ctx.beginPath();
    ctx.roundRect(bpx + 3, bpy + 3, TILE_SIZE - 6, TILE_SIZE - 6, 6);
    ctx.fill();

    ctx.font = '28px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧺', bpx + TILE_SIZE / 2, bpy + TILE_SIZE / 2);
    ctx.restore();

    // 4. Fruit Piles 1 ~ 10
    fruitPiles.forEach((pile) => {
      const px = pile.x * TILE_SIZE;
      const py = pile.y * TILE_SIZE;
      const fruit = FRUIT_MAP.get(pile.fruitId);
      if (!fruit) return;

      ctx.save();
      // Wooden crate
      ctx.fillStyle = '#854D0E';
      ctx.beginPath();
      ctx.roundRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4, 6);
      ctx.fill();

      // Fruit pile overflow
      const bounce = Math.sin(timeSec * 3 + pile.id) * 2;
      ctx.font = '26px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fruit.icon, px + TILE_SIZE / 2, py + TILE_SIZE / 2 + bounce);

      // Mini-game indicator badge on fruit crate
      ctx.font = '12px "Segoe UI Emoji", sans-serif';
      ctx.fillText('🎮', px + TILE_SIZE - 8, py + 10);
      ctx.restore();
    });

    // 5. Player
    this.drawPlayer(ctx, playerX, playerY, rc.playerFacing, rc.playerCarry, rc.isMoving, timeSec);

    // 6. Interaction Prompts
    this.drawInteractionPrompts(rc);
  }

  // ==========================================
  // SCENE C: MINI GAME RENDERING
  // ==========================================
  static drawMiniGameScene(rc: RenderContext): void {
    const { ctx, miniGame, timeSec } = rc;
    if (!miniGame) return;

    // 1. Themed Scenic Background for the Specific Fruit
    this.drawThemedMiniGameBackground(ctx, miniGame.fruitId, timeSec);

    // 2. Falling Fruits
    miniGame.fallingFruits.forEach((f) => {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rotation);
      ctx.font = `${f.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.icon, 0, 0);
      ctx.restore();
    });

    // 4. Kitty Player with Backpack Basket (standing, running cat with moving feet)
    const bx = miniGame.basketX;
    const by = miniGame.basketY;
    this.drawStandingCatWithBasket(ctx, bx, by, miniGame.facing, miniGame.isMoving, timeSec);

    // 5. Mini Game Particles
    this.drawParticles(ctx, miniGame.particles);

    // 6. Top UI Overlay (Circular Progress Bar & Fruit Count)
    this.drawMiniGameHud(ctx, miniGame);
  }

  // Mini-Game HUD
  private static drawMiniGameHud(ctx: CanvasRenderingContext2D, mg: MiniGameEngine): void {
    ctx.save();

    // Circular Countdown / Hourglass at top center
    const cx = CANVAS_WIDTH / 2;
    const cy = 45;
    const r = 26;
    const progress = mg.duration > 0 ? mg.timeRemaining / mg.duration : 0;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fill();

    // Progress ring
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = progress > 0.25 ? '#10B981' : '#EF4444';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();

    // Hourglass icon
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⏳', cx, cy);

    // Top-Right Real-time Count: 🍎 x 8
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH - 150, 20, 130, 44, 16);
    ctx.fill();
    ctx.stroke();

    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(mg.fruitIcon, CANVAS_WIDTH - 140, 42);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`x ${mg.collectedCount}`, CANVAS_WIDTH - 100, 43);

    ctx.restore();
  }

  // ==========================================
  // 10 THEMED MINI-GAME BACKGROUNDS
  // ==========================================
  private static drawThemedMiniGameBackground(
    ctx: CanvasRenderingContext2D,
    fruitId: number,
    timeSec: number
  ): void {
    switch (fruitId) {
      case 1:
        this.drawAppleOrchardBg(ctx, timeSec);
        break;
      case 2:
        this.drawBananaJungleBg(ctx, timeSec);
        break;
      case 3:
        this.drawOrangeGroveBg(ctx, timeSec);
        break;
      case 4:
        this.drawGrapeVineyardBg(ctx, timeSec);
        break;
      case 5:
        this.drawStrawberryMeadowBg(ctx, timeSec);
        break;
      case 6:
        this.drawWatermelonBeachBg(ctx, timeSec);
        break;
      case 7:
        this.drawPeachValleyBg(ctx, timeSec);
        break;
      case 8:
        this.drawPineappleIslandBg(ctx, timeSec);
        break;
      case 9:
        this.drawCherrySakuraBg(ctx, timeSec);
        break;
      case 10:
        this.drawKiwiForestBg(ctx, timeSec);
        break;
      default:
        this.drawAppleOrchardBg(ctx, timeSec);
        break;
    }
  }

  // 1. 🍎 Apple: Sunny Apple Orchard
  private static drawAppleOrchardBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#38BDF8');
    sky.addColorStop(0.6, '#BAE6FD');
    sky.addColorStop(1, '#DCFCE7');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Warm Sun with soft aura
    ctx.save();
    const sunX = W - 90;
    const sunY = 70;
    const corona = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 48);
    corona.addColorStop(0, 'rgba(254, 240, 138, 0.6)');
    corona.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Drifting Fluffy Clouds
    const c1 = ((timeSec * 12) % (W + 120)) - 60;
    const c2 = (((timeSec * 8) + 380) % (W + 140)) - 70;
    this.drawCloud(ctx, c1, 65, 1.0);
    this.drawCloud(ctx, c2, 110, 0.75);

    // Distant Rolling Sage Hills
    ctx.fillStyle = '#86EFAC';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.bezierCurveTo(W * 0.25, groundY - 120, W * 0.45, groundY - 60, W * 0.7, groundY - 110);
    ctx.bezierCurveTo(W * 0.85, groundY - 140, W * 0.95, groundY - 80, W, groundY - 90);
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Closer Emerald Hill
    ctx.fillStyle = '#4ADE80';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.bezierCurveTo(W * 0.2, groundY - 70, W * 0.5, groundY - 110, W * 0.8, groundY - 60);
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Orchard Apple Trees
    const trees = [
      { x: 90, y: groundY - 55, r: 38 },
      { x: 260, y: groundY - 80, r: 34 },
      { x: 670, y: groundY - 50, r: 42 },
    ];
    trees.forEach((t) => {
      // Trunk
      ctx.fillStyle = '#78350F';
      ctx.fillRect(t.x - 7, t.y, 14, groundY - t.y);
      // Leaves
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.arc(t.x - 14, t.y - 12, t.r * 0.8, 0, Math.PI * 2);
      ctx.arc(t.x + 14, t.y - 12, t.r * 0.8, 0, Math.PI * 2);
      ctx.arc(t.x, t.y - 28, t.r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      // Little red apples on tree
      ctx.fillStyle = '#EF4444';
      const apples = [
        { dx: -18, dy: -10 },
        { dx: 14, dy: -8 },
        { dx: -4, dy: -24 },
        { dx: 8, dy: -20 },
        { dx: -10, dy: -36 },
      ];
      apples.forEach((a) => {
        ctx.beginPath();
        ctx.arc(t.x + a.dx, t.y + a.dy, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Orchard Split-Rail Wooden Fence
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, groundY - 20);
    ctx.lineTo(W, groundY - 20);
    ctx.moveTo(0, groundY - 10);
    ctx.lineTo(W, groundY - 10);
    ctx.stroke();
    for (let fx = 30; fx < W; fx += 70) {
      ctx.fillStyle = '#92400E';
      ctx.fillRect(fx - 3, groundY - 28, 6, 28);
    }

    // Ground Lawn
    ctx.fillStyle = '#22C55E';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#16A34A';
    ctx.fillRect(0, groundY, W, 6);

    // Daisies
    for (let dx = 20; dx < W; dx += 55) {
      this.drawDaisy(ctx, dx, groundY + 18 + ((dx * 7) % 16));
    }
  }

  // 2. 🍌 Banana: Tropical Sunset Jungle
  private static drawBananaJungleBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;

    // Sunset Sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#991B1B');
    sky.addColorStop(0.3, '#EA580C');
    sky.addColorStop(0.65, '#F59E0B');
    sky.addColorStop(1, '#FEF08A');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Setting Warm Golden Sun
    const sunX = W * 0.5;
    const sunY = groundY - 40;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 70);
    sunGrad.addColorStop(0, '#FFFBEB');
    sunGrad.addColorStop(0.4, '#FEF08A');
    sunGrad.addColorStop(0.8, 'rgba(245, 158, 11, 0.4)');
    sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 70, 0, Math.PI * 2);
    ctx.fill();

    // Jungle Canopy Silhouette Layer
    ctx.fillStyle = '#7C2D12';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let jx = 0; jx <= W; jx += 40) {
      const jy = groundY - 60 - Math.sin((jx + 10) * 0.05) * 35;
      ctx.lineTo(jx, jy);
    }
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Midground Jungle Palms & Banana Trees
    const palms = [
      { x: 80, sway: Math.sin(timeSec * 1.5) * 0.04 },
      { x: W - 90, sway: Math.sin(timeSec * 1.5 + 1) * 0.04 },
    ];
    palms.forEach((p) => {
      ctx.save();
      ctx.translate(p.x, groundY);
      ctx.rotate(p.sway);
      // Trunk
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(p.x < W / 2 ? 25 : -25, -120, 0, -220);
      ctx.stroke();

      // Hanging banana bunch beneath crown
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍌', 0, -195);

      // Broad arched banana fronds
      const leafAngles = [-1.8, -1.2, -0.6, 0.6, 1.2, 1.8];
      leafAngles.forEach((ang) => {
        ctx.save();
        ctx.translate(0, -215);
        ctx.rotate(ang);
        ctx.fillStyle = '#15803D';
        ctx.beginPath();
        ctx.ellipse(45, 0, 50, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(90, 0);
        ctx.stroke();
        ctx.restore();
      });
      ctx.restore();
    });

    // Jungle Floor
    ctx.fillStyle = '#92400E';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#15803D';
    ctx.fillRect(0, groundY, W, 8);

    // Exotic Tropical Foliage at bottom
    for (let fx = 15; fx < W; fx += 60) {
      ctx.fillStyle = '#16A34A';
      ctx.beginPath();
      ctx.ellipse(fx, groundY + 2, 16, 7, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.arc(fx + 6, groundY - 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. 🍊 Orange: Sunny Valencia Citrus Grove
  private static drawOrangeGroveBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;

    // Mediterranean Sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#0284C7');
    sky.addColorStop(0.55, '#38BDF8');
    sky.addColorStop(1, '#FEF9C3');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Bright Sun with gentle rotating rays
    const sunX = W - 100;
    const sunY = 70;
    ctx.save();
    ctx.translate(sunX, sunY);
    ctx.rotate(timeSec * 0.15);
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.4)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(44, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 24, 0, Math.PI * 2);
    ctx.fill();

    // Terracotta Tuscan Rolling Hills
    ctx.fillStyle = '#FDBA74';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.bezierCurveTo(W * 0.3, groundY - 140, W * 0.6, groundY - 70, W, groundY - 120);
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FB923C';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.bezierCurveTo(W * 0.25, groundY - 70, W * 0.65, groundY - 110, W, groundY - 60);
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Citrus Trees Laden with Oranges
    const trees = [
      { x: 120, y: groundY - 45, r: 40 },
      { x: W - 140, y: groundY - 45, r: 44 },
    ];
    trees.forEach((t) => {
      // Trunk
      ctx.fillStyle = '#78350F';
      ctx.fillRect(t.x - 7, t.y, 14, groundY - t.y);
      // Foliage
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.arc(t.x, t.y - 30, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.arc(t.x - 12, t.y - 32, t.r * 0.75, 0, Math.PI * 2);
      ctx.arc(t.x + 12, t.y - 32, t.r * 0.75, 0, Math.PI * 2);
      ctx.fill();
      // Bright Oranges
      ctx.fillStyle = '#FB923C';
      const oranges = [
        { dx: -18, dy: -24 },
        { dx: 12, dy: -18 },
        { dx: -2, dy: -42 },
        { dx: 16, dy: -40 },
        { dx: -14, dy: -48 },
      ];
      oranges.forEach((o) => {
        ctx.beginPath();
        ctx.arc(t.x + o.dx, t.y + o.dy, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      // White orange blossoms
      ctx.fillStyle = '#FFFFFF';
      oranges.forEach((o) => {
        ctx.beginPath();
        ctx.arc(t.x + o.dx + 4, t.y + o.dy - 6, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Rustic Stacked Stone Wall
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, groundY - 18, W, 18);
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    for (let wx = 0; wx < W; wx += 45) {
      ctx.beginPath();
      ctx.moveTo(wx, groundY - 18);
      ctx.lineTo(wx, groundY);
      ctx.stroke();
    }

    // Sunny Lawn
    ctx.fillStyle = '#84CC16';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#65A30D';
    ctx.fillRect(0, groundY, W, 6);

    // Buttercup flowers
    for (let fx = 25; fx < W; fx += 50) {
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.arc(fx, groundY + 16 + ((fx * 5) % 15), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. 🍇 Grape: Twilight Vineyard Hill
  private static drawGrapeVineyardBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;

    // Twilight Gradient
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#2E1065');
    sky.addColorStop(0.4, '#581C87');
    sky.addColorStop(0.75, '#8B5CF6');
    sky.addColorStop(1, '#F472B6');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Glowing Crescent Moon
    const moonX = W - 100;
    const moonY = 75;
    ctx.save();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2E1065';
    ctx.beginPath();
    ctx.arc(moonX + 9, moonY - 5, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Twinkling Stars
    const stars = [
      { x: 70, y: 50 },
      { x: 180, y: 80 },
      { x: 310, y: 40 },
      { x: 440, y: 65 },
      { x: 570, y: 35 },
    ];
    stars.forEach((s, idx) => {
      const twinkle = (Math.sin(timeSec * 3 + idx) + 1) * 0.5;
      ctx.fillStyle = `rgba(254, 240, 138, ${0.4 + twinkle * 0.6})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2 + twinkle * 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Vineyard Silhouette Ridges
    ctx.fillStyle = '#3B0764';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.bezierCurveTo(W * 0.3, groundY - 110, W * 0.6, groundY - 60, W, groundY - 95);
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Wooden Pergola Trellis Across Field
    ctx.strokeStyle = '#4A1D96';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY - 65);
    ctx.lineTo(W, groundY - 65);
    ctx.moveTo(0, groundY - 45);
    ctx.lineTo(W, groundY - 45);
    ctx.stroke();

    // Posts & Grape Vines
    for (let px = 40; px < W; px += 90) {
      ctx.fillStyle = '#312E81';
      ctx.fillRect(px - 4, groundY - 80, 8, 80);

      // Vine foliage
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.ellipse(px + 12, groundY - 65, 14, 9, 0.3, 0, Math.PI * 2);
      ctx.ellipse(px - 10, groundY - 50, 12, 8, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Hanging purple grape cluster
      ctx.fillStyle = '#9333EA';
      ctx.beginPath();
      ctx.arc(px + 14, groundY - 50, 4.5, 0, Math.PI * 2);
      ctx.arc(px + 21, groundY - 50, 4.5, 0, Math.PI * 2);
      ctx.arc(px + 17, groundY - 44, 4, 0, Math.PI * 2);
      ctx.arc(px + 17, groundY - 39, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glowing Fireflies
    for (let f = 0; f < 6; f++) {
      const fx = (f * 130 + timeSec * 15) % W;
      const fy = groundY - 40 + Math.sin(timeSec * 2 + f) * 20;
      const glow = (Math.sin(timeSec * 4 + f) + 1) * 0.5;
      ctx.fillStyle = `rgba(254, 240, 138, ${0.3 + glow * 0.7})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 3 + glow * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground Turf
    ctx.fillStyle = '#312E81';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#4338CA';
    ctx.fillRect(0, groundY, W, 6);

    // Lavender wild petals
    for (let lx = 35; lx < W; lx += 60) {
      ctx.fillStyle = '#C084FC';
      ctx.beginPath();
      ctx.arc(lx, groundY + 18, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 5. 🍓 Strawberry: Fairy Strawberry Meadow
  private static drawStrawberryMeadowBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;

    // Pastel Strawberry-Pink Sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#F472B6');
    sky.addColorStop(0.5, '#FDA4AF');
    sky.addColorStop(1, '#FEF3C7');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Fluffy Pink Cotton-Candy Clouds
    const c1 = ((timeSec * 9) % (W + 130)) - 65;
    const c2 = (((timeSec * 6) + 400) % (W + 150)) - 75;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    this.drawCloud(ctx, c1, 60, 0.95);
    this.drawCloud(ctx, c2, 105, 0.8);

    // Pastel Mint Hills
    ctx.fillStyle = '#A7F3D0';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.bezierCurveTo(W * 0.25, groundY - 100, W * 0.65, groundY - 60, W, groundY - 90);
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // White Picket Fence
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.fillRect(0, groundY - 32, W, 4);
    ctx.fillRect(0, groundY - 18, W, 4);
    for (let px = 20; px < W; px += 36) {
      ctx.beginPath();
      ctx.moveTo(px - 6, groundY);
      ctx.lineTo(px - 6, groundY - 38);
      ctx.lineTo(px, groundY - 46);
      ctx.lineTo(px + 6, groundY - 38);
      ctx.lineTo(px + 6, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Strawberry Bushes with White Flowers & Mini Strawberries
    for (let bx = 45; bx < W; bx += 85) {
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.arc(bx - 12, groundY - 10, 18, 0, Math.PI * 2);
      ctx.arc(bx + 12, groundY - 10, 18, 0, Math.PI * 2);
      ctx.arc(bx, groundY - 20, 20, 0, Math.PI * 2);
      ctx.fill();

      // Mini Wild Strawberry
      ctx.fillStyle = '#F43F5E';
      ctx.beginPath();
      ctx.arc(bx + 8, groundY - 14, 5, 0, Math.PI * 2);
      ctx.fill();

      // 5-Petal White Strawberry Flower with Golden Center
      this.drawStrawberryFlower(ctx, bx - 6, groundY - 18);
    }

    // Drifting Fairy Flower Petals
    for (let p = 0; p < 6; p++) {
      const px = ((p * 140) + timeSec * 22) % W;
      const py = 70 + ((p * 85 + timeSec * 35) % (groundY - 100));
      this.drawPetal(ctx, px, py, 6, timeSec * 2 + p, '#FDA4AF');
    }

    // Ground Mint Lawn
    ctx.fillStyle = '#34D399';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#059669';
    ctx.fillRect(0, groundY, W, 6);

    // Clover & flowers
    for (let fx = 25; fx < W; fx += 48) {
      this.drawStrawberryFlower(ctx, fx, groundY + 20 + ((fx * 3) % 12));
    }
  }

  // 6. 🍉 Watermelon: Summer Seaside Beach
  private static drawWatermelonBeachBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;
    const oceanY = groundY - 120;

    // Summer Sky
    const sky = ctx.createLinearGradient(0, 0, 0, oceanY);
    sky.addColorStop(0, '#0284C7');
    sky.addColorStop(0.6, '#38BDF8');
    sky.addColorStop(1, '#BAE6FD');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, oceanY);

    // Bright Summer Sun
    const sunX = W - 90;
    const sunY = 65;
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();

    // Soaring Seagulls
    this.drawSeagull(ctx, 160 + Math.sin(timeSec) * 20, 80);
    this.drawSeagull(ctx, 230 + Math.sin(timeSec + 1) * 15, 60);

    // Ocean Waves
    const oceanGrad = ctx.createLinearGradient(0, oceanY, 0, groundY);
    oceanGrad.addColorStop(0, '#0284C7');
    oceanGrad.addColorStop(0.5, '#0EA5E9');
    oceanGrad.addColorStop(1, '#38BDF8');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, oceanY, W, groundY - oceanY);

    // Animated Foam Wave Crests
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 3;
    const waveShift = Math.sin(timeSec * 2.5) * 6;
    for (let wy = oceanY + 25; wy < groundY - 15; wy += 30) {
      ctx.beginPath();
      for (let wx = 0; wx <= W; wx += 50) {
        ctx.quadraticCurveTo(wx + 25, wy + waveShift, wx + 50, wy);
      }
      ctx.stroke();
    }

    // Leaning Palm on left
    ctx.save();
    ctx.translate(60, groundY);
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(35, -70, 20, -140);
    ctx.stroke();
    // Fronds
    const frondAngles = [-1.5, -0.9, -0.2, 0.4, 1.1];
    frondAngles.forEach((ang) => {
      ctx.save();
      ctx.translate(20, -140);
      ctx.rotate(ang + Math.sin(timeSec * 2) * 0.05);
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.ellipse(35, 0, 42, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();

    // Red & White Striped Beach Umbrella on right
    ctx.save();
    const ux = W - 110;
    const uy = groundY - 10;
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(ux, uy);
    ctx.lineTo(ux - 15, uy - 110);
    ctx.stroke();

    ctx.translate(ux - 15, uy - 110);
    ctx.rotate(-0.12);
    const segs = ['#EF4444', '#FFFFFF', '#EF4444', '#FFFFFF'];
    for (let s = 0; s < 4; s++) {
      const a1 = Math.PI + (Math.PI / 4) * s;
      const a2 = Math.PI + (Math.PI / 4) * (s + 1);
      ctx.fillStyle = segs[s];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 48, a1, a2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Golden Beach Sand
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(0, groundY, W, 6);

    // Seashells on beach
    for (let sx = 40; sx < W; sx += 75) {
      ctx.fillStyle = '#FDA4AF';
      ctx.beginPath();
      ctx.arc(sx, groundY + 18, 5, 0, Math.PI);
      ctx.fill();
    }
  }

  // 7. 🍑 Peach: Peach Blossom Valley
  private static drawPeachValleyBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;

    // Misty Dawn Sunrise Sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#C084FC');
    sky.addColorStop(0.4, '#F472B6');
    sky.addColorStop(0.8, '#FECDD3');
    sky.addColorStop(1, '#FFF1F2');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Soft Pale Dawn Sun
    const sunX = W * 0.5;
    const sunY = groundY - 140;
    ctx.fillStyle = 'rgba(255, 228, 230, 0.8)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 40, 0, Math.PI * 2);
    ctx.fill();

    // Distant Misty Mountain Peaks
    ctx.fillStyle = '#DDD6FE';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W * 0.2, groundY - 150);
    ctx.lineTo(W * 0.45, groundY - 70);
    ctx.lineTo(W * 0.75, groundY - 180);
    ctx.lineTo(W, groundY - 90);
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Traditional Red Arched Bridge Silhouette in Valley
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(W * 0.45, groundY - 45, 45, Math.PI, 0);
    ctx.stroke();

    // Arching Blooming Peach Branches
    const branches = [
      { startX: 0, startY: 100, endX: 200, endY: 180 },
      { startX: W, startY: 80, endX: W - 220, endY: 170 },
    ];
    branches.forEach((b) => {
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(b.startX, b.startY);
      ctx.quadraticCurveTo((b.startX + b.endX) / 2, b.startY - 30, b.endX, b.endY);
      ctx.stroke();

      // Peach blossoms along branch
      for (let t = 0.2; t <= 1.0; t += 0.2) {
        const px = b.startX + (b.endX - b.startX) * t;
        const py = b.startY + (b.endY - b.startY) * t + Math.sin(t * 5) * 8;
        this.drawBlossom(ctx, px, py, '#FB7185', '#FECDD3');
      }
    });

    // Swirling Peach Petals
    for (let p = 0; p < 8; p++) {
      const px = ((p * 110) + timeSec * 30) % W;
      const py = 50 + ((p * 70 + timeSec * 40) % (groundY - 80));
      this.drawPetal(ctx, px, py, 6, timeSec * 3 + p, '#FB7185');
    }

    // Mossy Valley Floor
    ctx.fillStyle = '#65A30D';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#4D7C0F';
    ctx.fillRect(0, groundY, W, 6);

    // Carpet of Fallen Pink Petals
    for (let px = 20; px < W; px += 42) {
      this.drawPetal(ctx, px, groundY + 16 + ((px * 4) % 16), 5, px, '#FECDD3');
    }
  }

  // 8. 🍍 Pineapple: Hawaiian Tropical Island
  private static drawPineappleIslandBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;

    // Cyan Tropical Sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#0891B2');
    sky.addColorStop(0.5, '#06B6D4');
    sky.addColorStop(0.85, '#67E8F9');
    sky.addColorStop(1, '#CFFAFE');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Tropical Sun
    const sunX = W - 90;
    const sunY = 70;
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();

    // Dramatic Emerald Volcanic Island Peak in Distance
    ctx.fillStyle = '#0F766E';
    ctx.beginPath();
    ctx.moveTo(W * 0.2, groundY - 40);
    ctx.lineTo(W * 0.45, groundY - 170);
    ctx.lineTo(W * 0.7, groundY - 40);
    ctx.closePath();
    ctx.fill();

    // Leaning Hawaiian Coconut Palms
    ctx.save();
    ctx.translate(W - 80, groundY);
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-40, -100, -30, -210);
    ctx.stroke();

    const fronds = [-1.4, -0.8, -0.1, 0.6, 1.2];
    fronds.forEach((ang) => {
      ctx.save();
      ctx.translate(-30, -210);
      ctx.rotate(ang + Math.sin(timeSec * 2) * 0.05);
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.ellipse(40, 0, 48, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();

    // Striped Surfboard Planted in Sand on Left
    ctx.save();
    ctx.translate(90, groundY);
    ctx.rotate(0.12);
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.ellipse(0, -50, 14, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#06B6D4';
    ctx.fillRect(-14, -60, 28, 20);
    ctx.restore();

    // Tropical Shoreline & Water Line
    ctx.fillStyle = '#22D3EE';
    ctx.fillRect(0, groundY - 14, W, 14);

    // Coral Golden Shore Sand
    ctx.fillStyle = '#FED7AA';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(0, groundY, W, 6);

    // Red Hibiscus Flowers
    for (let hx = 30; hx < W; hx += 70) {
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(hx, groundY + 18, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(hx, groundY + 18, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 9. 🍒 Cherry: Spring Sakura Garden
  private static drawCherrySakuraBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;

    // Spring Azure Sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#2563EB');
    sky.addColorStop(0.4, '#60A5FA');
    sky.addColorStop(0.8, '#BFDBFE');
    sky.addColorStop(1, '#FDF2F8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Gentle Spring Sun
    const sunX = W - 90;
    const sunY = 65;
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 24, 0, Math.PI * 2);
    ctx.fill();

    // Distant Blue Mountain Silhouette
    ctx.fillStyle = '#93C5FD';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W * 0.35, groundY - 130);
    ctx.lineTo(W * 0.65, groundY - 70);
    ctx.lineTo(W * 0.85, groundY - 110);
    ctx.lineTo(W, groundY - 70);
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Spreading Japanese Sakura Cherry Trees
    const trees = [
      { x: 110, y: groundY - 40, r: 46 },
      { x: W - 130, y: groundY - 40, r: 50 },
    ];
    trees.forEach((t) => {
      // Dark Trunk
      ctx.fillStyle = '#451A03';
      ctx.fillRect(t.x - 8, t.y, 16, groundY - t.y);
      // Fluffy Sakura Blossom Clouds
      ctx.fillStyle = '#FBCFE8';
      ctx.beginPath();
      ctx.arc(t.x - 20, t.y - 25, t.r * 0.75, 0, Math.PI * 2);
      ctx.arc(t.x + 20, t.y - 25, t.r * 0.75, 0, Math.PI * 2);
      ctx.arc(t.x, t.y - 45, t.r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      // Deeper pink accents
      ctx.fillStyle = '#F472B6';
      ctx.beginPath();
      ctx.arc(t.x - 10, t.y - 35, t.r * 0.45, 0, Math.PI * 2);
      ctx.arc(t.x + 15, t.y - 42, t.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Bamboo Fence across Midground
    ctx.fillStyle = '#CA8A04';
    ctx.fillRect(0, groundY - 24, W, 4);
    ctx.fillRect(0, groundY - 12, W, 4);
    for (let bx = 15; bx < W; bx += 28) {
      ctx.fillRect(bx - 2, groundY - 30, 4, 30);
    }

    // Swirling Sakura Petals
    for (let p = 0; p < 9; p++) {
      const px = ((p * 95) + timeSec * 35) % W;
      const py = 60 + ((p * 65 + timeSec * 45) % (groundY - 80));
      this.drawPetal(ctx, px, py, 6, timeSec * 2.5 + p, '#F472B6');
    }

    // Spring Lawn
    ctx.fillStyle = '#4ADE80';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#22C55E';
    ctx.fillRect(0, groundY, W, 6);

    // Scattered Pink Petals on Lawn
    for (let px = 18; px < W; px += 38) {
      this.drawPetal(ctx, px, groundY + 16 + ((px * 3) % 16), 5, px, '#FBCFE8');
    }
  }

  // 10. 🥝 Kiwi: Alpine Kiwi Forest & Pergola
  private static drawKiwiForestBg(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const groundY = H - 42;

    // Cool Alpine Mist Sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#0D9488');
    sky.addColorStop(0.5, '#2DD4BF');
    sky.addColorStop(0.85, '#99F6E4');
    sky.addColorStop(1, '#E6FFFA');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Alpine Mountain Ridges with Evergreens
    ctx.fillStyle = '#065F46';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W * 0.25, groundY - 140);
    ctx.lineTo(W * 0.55, groundY - 85);
    ctx.lineTo(W * 0.8, groundY - 150);
    ctx.lineTo(W, groundY - 95);
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Rustic Timber Pergola Framework (Kiwi Arbor)
    ctx.fillStyle = '#78350F';
    // Overhead crossbeam
    ctx.fillRect(0, groundY - 95, W, 10);
    // Support posts
    for (let px = 50; px < W; px += 130) {
      ctx.fillRect(px - 6, groundY - 95, 12, 95);
    }

    // Climbing Dense Kiwi Vines & Heart-Shaped Leaves
    ctx.fillStyle = '#166534';
    for (let vx = 20; vx < W; vx += 40) {
      ctx.beginPath();
      ctx.ellipse(vx, groundY - 92, 18, 12, Math.sin(vx) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#15803D';
    for (let vx = 35; vx < W; vx += 50) {
      ctx.beginPath();
      ctx.ellipse(vx, groundY - 88, 14, 10, -Math.sin(vx) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dangling Brown Fuzzy Kiwi Fruits beneath Pergola
    for (let kx = 60; kx < W; kx += 75) {
      ctx.save();
      ctx.fillStyle = '#92400E';
      ctx.beginPath();
      ctx.ellipse(kx, groundY - 72, 7, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // Stem
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(kx, groundY - 82);
      ctx.lineTo(kx, groundY - 92);
      ctx.stroke();
      ctx.restore();
    }

    // Deep Alpine Mossy Floor
    ctx.fillStyle = '#15803D';
    ctx.fillRect(0, groundY, W, 42);
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, groundY, W, 6);

    // Wild Forest Mushrooms & Ferns
    for (let mx = 35; mx < W; mx += 65) {
      // Mushroom stem
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(mx - 2, groundY + 16, 4, 10);
      // Red cap with white dots
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(mx, groundY + 16, 7, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(mx - 2, groundY + 13, 1.5, 0, Math.PI * 2);
      ctx.arc(mx + 2, groundY + 13, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Helper: Draw soft fluffy cloud
  private static drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number): void {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, 20 * scale, 0, Math.PI * 2);
    ctx.arc(cx + 18 * scale, cy - 8 * scale, 24 * scale, 0, Math.PI * 2);
    ctx.arc(cx + 42 * scale, cy - 4 * scale, 22 * scale, 0, Math.PI * 2);
    ctx.arc(cx + 58 * scale, cy + 4 * scale, 16 * scale, 0, Math.PI * 2);
    ctx.arc(cx + 28 * scale, cy + 8 * scale, 20 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Helper: Draw Daisy flower
  private static drawDaisy(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 5; i++) {
      const ang = ((Math.PI * 2) / 5) * i;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Helper: Draw 5-petal strawberry flower
  private static drawStrawberryFlower(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 5; i++) {
      const ang = ((Math.PI * 2) / 5) * i;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * 4.5, y + Math.sin(ang) * 4.5, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Helper: Draw peach/cherry blossom
  private static drawBlossom(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    mainColor: string,
    centerColor: string
  ): void {
    ctx.save();
    ctx.fillStyle = mainColor;
    for (let i = 0; i < 5; i++) {
      const ang = ((Math.PI * 2) / 5) * i;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * 5, y + Math.sin(ang) * 5, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = centerColor;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Helper: Draw floating petal
  private static drawPetal(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    angle: number,
    color: string
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Helper: Draw soaring seagull
  private static drawSeagull(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 4);
    ctx.quadraticCurveTo(x - 5, y - 4, x, y);
    ctx.quadraticCurveTo(x + 5, y - 4, x + 10, y + 4);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws a realistic standing cartoon cat with animated running legs/feet
   * and a woven basket strapped on its back to catch fruits.
   */
  private static drawStandingCatWithBasket(
    ctx: CanvasRenderingContext2D,
    bx: number,
    _by: number,
    facing: 'LEFT' | 'RIGHT',
    isMoving: boolean,
    timeSec: number
  ): void {
    const groundY = CANVAS_HEIGHT - 38;

    ctx.save();
    ctx.translate(bx, groundY);
    if (facing === 'LEFT') {
      ctx.scale(-1, 1);
    }

    const runSpeed = 15;
    const stride = isMoving ? timeSec * runSpeed : 0;
    const legAngleL = isMoving ? Math.sin(stride) * 0.5 : 0;
    const legAngleR = isMoving ? Math.sin(stride + Math.PI) * 0.5 : 0;
    const bodyBob = isMoving ? Math.abs(Math.sin(stride)) * 3.5 : Math.sin(timeSec * 3) * 1.5;
    const tailSwing = Math.sin(timeSec * (isMoving ? 9 : 3)) * 0.25;

    // 1. Soft ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Tail (swaying behind on the left side)
    ctx.save();
    ctx.translate(-14, -22 - bodyBob);
    ctx.rotate(tailSwing - 0.2);
    ctx.strokeStyle = '#EA580C';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-14, -8, -20, -22, -10, -28);
    ctx.stroke();

    // White tail tip
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-14, -24);
    ctx.lineTo(-10, -28);
    ctx.stroke();
    ctx.restore();

    // 3. Back Leg (Far Leg)
    ctx.save();
    ctx.translate(-6, -14 - bodyBob);
    ctx.rotate(legAngleR);
    ctx.fillStyle = '#EA580C';
    ctx.beginPath();
    ctx.roundRect(-4, 0, 8, 14, 4);
    ctx.fill();
    // Little white paw
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, 13, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. Woven Basket Strapped on Back (揹著籃子在後面)
    // Placed on the back (left side of the standing cat)
    const basketX = -18;
    const basketY = -42 - bodyBob;
    const bw = 52;
    const bh = 38;

    ctx.save();
    // Basket Body (woven trapezoid)
    ctx.fillStyle = '#D97706'; // warm bamboo golden
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(basketX - bw / 2 + 5, basketY + bh);
    ctx.lineTo(basketX - bw / 2, basketY);
    ctx.lineTo(basketX + bw / 2, basketY);
    ctx.lineTo(basketX + bw / 2 - 5, basketY + bh);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Woven criss-cross pattern
    ctx.strokeStyle = 'rgba(146, 64, 14, 0.45)';
    ctx.lineWidth = 1.5;
    for (let i = -18; i <= 18; i += 9) {
      ctx.beginPath();
      ctx.moveTo(basketX + i - 6, basketY);
      ctx.lineTo(basketX + i + 6, basketY + bh);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(basketX + i + 6, basketY);
      ctx.lineTo(basketX + i - 6, basketY + bh);
      ctx.stroke();
    }

    // Basket Rim (oval opening on top to catch fruits)
    ctx.fillStyle = '#B45309';
    ctx.beginPath();
    ctx.ellipse(basketX, basketY, bw / 2 + 2, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner basket dark depth
    ctx.fillStyle = '#451A03';
    ctx.beginPath();
    ctx.ellipse(basketX, basketY + 1, bw / 2 - 4, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Leather backpack straps over cat shoulder
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(basketX + bw / 2 - 4, basketY + 10);
    ctx.quadraticCurveTo(-2, -36 - bodyBob, 8, -28 - bodyBob);
    ctx.stroke();
    ctx.restore();

    // 5. Standing Cat Torso / Body
    ctx.save();
    ctx.fillStyle = '#FB923C'; // bright cute ginger orange
    ctx.strokeStyle = '#EA580C';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-7, -38 - bodyBob, 24, 28, [8, 12, 10, 8]);
    ctx.fill();
    ctx.stroke();

    // Creamy white belly on front
    ctx.fillStyle = '#FFF7ED';
    ctx.beginPath();
    ctx.ellipse(6, -26 - bodyBob, 7, 10, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 6. Front Leg (Near Leg)
    ctx.save();
    ctx.translate(6, -14 - bodyBob);
    ctx.rotate(legAngleL);
    ctx.fillStyle = '#FB923C';
    ctx.beginPath();
    ctx.roundRect(-4, 0, 8, 14, 4);
    ctx.fill();
    // Front white paw
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, 13, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 7. Cat Head
    const headX = 8;
    const headY = -50 - bodyBob;
    const headR = 17;

    ctx.save();
    // Pointy Ears
    // Left ear
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.moveTo(headX - 11, headY - 10);
    ctx.lineTo(headX - 14, headY - 26);
    ctx.lineTo(headX - 1, headY - 14);
    ctx.closePath();
    ctx.fill();
    // Left inner pink ear
    ctx.fillStyle = '#FDA4AF';
    ctx.beginPath();
    ctx.moveTo(headX - 10, headY - 12);
    ctx.lineTo(headX - 13, headY - 23);
    ctx.lineTo(headX - 3, headY - 15);
    ctx.closePath();
    ctx.fill();

    // Right ear
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.moveTo(headX + 4, headY - 13);
    ctx.lineTo(headX + 13, headY - 26);
    ctx.lineTo(headX + 15, headY - 9);
    ctx.closePath();
    ctx.fill();
    // Right inner pink ear
    ctx.fillStyle = '#FDA4AF';
    ctx.beginPath();
    ctx.moveTo(headX + 6, headY - 14);
    ctx.lineTo(headX + 12, headY - 23);
    ctx.lineTo(headX + 13, headY - 11);
    ctx.closePath();
    ctx.fill();

    // Head base circle
    ctx.fillStyle = '#FB923C';
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#EA580C';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Cheerful cartoon eye (facing right)
    // White eye background
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(headX + 8, headY - 2, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Big dark pupil
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.ellipse(headX + 9, headY - 2, 3.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cute sparkle highlights
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(headX + 10, headY - 4, 1.6, 0, Math.PI * 2);
    ctx.arc(headX + 8, headY, 1, 0, Math.PI * 2);
    ctx.fill();

    // Rosy blushing cheek
    ctx.fillStyle = 'rgba(251, 113, 133, 0.6)';
    ctx.beginPath();
    ctx.ellipse(headX + 6, headY + 5, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cute pink nose
    ctx.fillStyle = '#F43F5E';
    ctx.beginPath();
    ctx.moveTo(headX + 16, headY + 1);
    ctx.lineTo(headX + 13, headY);
    ctx.lineTo(headX + 14, headY + 3);
    ctx.closePath();
    ctx.fill();

    // Cute whiskers pointing right
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(headX + 12, headY + 3);
    ctx.lineTo(headX + 22, headY + 1);
    ctx.moveTo(headX + 12, headY + 5);
    ctx.lineTo(headX + 21, headY + 6);
    ctx.stroke();

    // Cute little paw holding backpack strap
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(headX + 2, headY + 22, 4.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#EA580C';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  // Particles
  private static drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
    particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'STAR') {
        ctx.font = `${p.size * 2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⭐', p.x, p.y);
      } else if (p.type === 'COIN') {
        ctx.font = `${p.size * 2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🪙', p.x, p.y);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // Floating Popups
  private static drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]): void {
    texts.forEach((t) => {
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });
  }
}
