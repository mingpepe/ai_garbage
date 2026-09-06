import {
  Direction,
  DIRECTION_VECTORS,
  MazeData,
  PlayerState,
  Position,
} from '../types/maze';
import { PathStep } from './mazeSolver';

// Unified Picture-Book Garden Color Palette
export const PALETTE = {
  bg: '#142c1f', // Deep moss garden green
  gridLines: 'rgba(255, 255, 255, 0.04)',
  
  // Ground road
  roadFill: '#fef08a', // Warm stone cream
  roadBorder: '#854d0e', // Earthy brown border
  roadTexture: '#fef9c3',

  // Underpass / Tunnel
  tunnelShadow: 'rgba(15, 23, 42, 0.55)',
  tunnelArchEdge: '#451a03',
  tunnelPillar: '#78350f',

  // Elevated Bridge
  bridgeDeck: '#b45309', // Rich warm wood
  bridgePlank: '#92400e',
  bridgeRailing: '#d97706',
  bridgePost: '#f59e0b',
  bridgeDropShadow: 'rgba(0, 0, 0, 0.65)',

  // Player & Markers
  frogBody: '#22c55e',
  frogBelly: '#bbf7d0',
  frogEyeWhite: '#ffffff',
  frogPupil: '#0f172a',
  frogBlush: 'rgba(244, 63, 94, 0.45)',

  // Helpers
  solutionGlow: '#ec4899', // Neon pink for dev mode solution
  trail: 'rgba(34, 197, 94, 0.35)',
};

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  maze: MazeData;
  player: PlayerState;
  visitedTrail: Position[];
  solutionPath: PathStep[] | null;
  showSolution: boolean;
  timeSec: number;
  vantageFactor?: number;
  isVantageFogEnabled?: boolean;
  visionRadius?: number;
}

/**
 * Calculates optimal cellSize and offsets to center maze on canvas
 */
export function getMazeViewport(
  canvasWidth: number,
  canvasHeight: number,
  mazeWidth: number,
  mazeHeight: number
): { cellSize: number; offsetX: number; offsetY: number; roadWidth: number } {
  const padding = 24;
  const availW = Math.max(100, canvasWidth - padding * 2);
  const availH = Math.max(100, canvasHeight - padding * 2);

  const cellW = availW / mazeWidth;
  const cellH = availH / mazeHeight;
  const cellSize = Math.min(cellW, cellH);

  const totalW = cellSize * mazeWidth;
  const totalH = cellSize * mazeHeight;

  const offsetX = (canvasWidth - totalW) / 2;
  const offsetY = (canvasHeight - totalH) / 2;

  // Road thickness is roughly 48% of cell size
  const roadWidth = Math.max(8, cellSize * 0.48);

  return { cellSize, offsetX, offsetY, roadWidth };
}

/**
 * Main render function for the Weave Maze
 */
export function renderMaze(rc: RenderContext) {
  const { ctx, canvasWidth, canvasHeight, maze, player, visitedTrail, solutionPath, showSolution, timeSec } = rc;
  const { width: mw, height: mh, cells, start, end } = maze;

  const { cellSize, offsetX, offsetY, roadWidth } = getMazeViewport(canvasWidth, canvasHeight, mw, mh);
  const halfRoad = roadWidth / 2;
  const halfCell = cellSize / 2;

  // 1. Clear background
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Subtle background grid
  ctx.strokeStyle = PALETTE.gridLines;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= mw; x++) {
    const px = offsetX + x * cellSize;
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + mh * cellSize);
  }
  for (let y = 0; y <= mh; y++) {
    const py = offsetY + y * cellSize;
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + mw * cellSize, py);
  }
  ctx.stroke();

  const getCenter = (x: number, y: number) => ({
    cx: offsetX + x * cellSize + halfCell,
    cy: offsetY + y * cellSize + halfCell,
  });

  // ==========================================
  // PASS 1: GROUND ROAD NETWORK (SEAMLESS CONTINUOUS)
  // ==========================================
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const borderThickness = Math.max(3, roadWidth + cellSize * 0.08);

  // 1A. Outer Road Borders
  ctx.strokeStyle = PALETTE.roadBorder;
  ctx.lineWidth = borderThickness;
  ctx.beginPath();

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const cell = cells[y][x];
      const { cx, cy } = getCenter(x, y);

      if (!cell.isWeave) {
        for (const dir of [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST]) {
          if ((cell.openMask & dir) !== 0) {
            const vec = DIRECTION_VECTORS[dir];
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + vec.dx * halfCell, cy + vec.dy * halfCell);
          }
        }
      } else {
        const isBridgeHorizontal = cell.bridgeAxis === 'HORIZONTAL';
        if (isBridgeHorizontal) {
          ctx.moveTo(cx, cy - halfCell);
          ctx.lineTo(cx, cy + halfCell);
        } else {
          ctx.moveTo(cx - halfCell, cy);
          ctx.lineTo(cx + halfCell, cy);
        }
      }
    }
  }
  ctx.stroke();

  // 1B. Inner Road Surface (Warm stone cream)
  ctx.strokeStyle = PALETTE.roadFill;
  ctx.lineWidth = roadWidth;
  ctx.beginPath();

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const cell = cells[y][x];
      const { cx, cy } = getCenter(x, y);

      if (!cell.isWeave) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy);

        for (const dir of [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST]) {
          if ((cell.openMask & dir) !== 0) {
            const vec = DIRECTION_VECTORS[dir];
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + vec.dx * halfCell, cy + vec.dy * halfCell);
          }
        }
      } else {
        const isBridgeHorizontal = cell.bridgeAxis === 'HORIZONTAL';
        if (isBridgeHorizontal) {
          ctx.moveTo(cx, cy - halfCell);
          ctx.lineTo(cx, cy + halfCell);
        } else {
          ctx.moveTo(cx - halfCell, cy);
          ctx.lineTo(cx + halfCell, cy);
        }
      }
    }
  }
  ctx.stroke();
  ctx.restore();

  // ==========================================
  // PASS 2: NATURAL UNDERPASS SHADING ON LOWER ROAD
  // ==========================================
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const cell = cells[y][x];
      if (!cell.isWeave) continue;

      const { cx, cy } = getCenter(x, y);
      const isBridgeHorizontal = cell.bridgeAxis === 'HORIZONTAL';

      ctx.save();
      if (isBridgeHorizontal) {
        ctx.fillStyle = PALETTE.tunnelShadow;
        ctx.fillRect(cx - halfRoad, cy - halfRoad, roadWidth, roadWidth);

        ctx.fillStyle = PALETTE.tunnelPillar;
        ctx.fillRect(cx - halfCell, cy - halfRoad - 2, 4, roadWidth + 4);
        ctx.fillRect(cx + halfCell - 4, cy - halfRoad - 2, 4, roadWidth + 4);
      } else {
        ctx.fillStyle = PALETTE.tunnelShadow;
        ctx.fillRect(cx - halfRoad, cy - halfRoad, roadWidth, roadWidth);

        ctx.fillStyle = PALETTE.tunnelPillar;
        ctx.fillRect(cx - halfRoad - 2, cy - halfCell, roadWidth + 4, 4);
        ctx.fillRect(cx - halfRoad - 2, cy + halfCell - 4, roadWidth + 4, 4);
      }
      ctx.restore();
    }
  }

  // ==========================================
  // PASS 3: VISITED TRAIL
  // ==========================================
  if (visitedTrail.length > 1) {
    ctx.save();
    ctx.strokeStyle = PALETTE.trail;
    ctx.lineWidth = Math.max(3, roadWidth * 0.32);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([4, 6]);

    ctx.beginPath();
    for (let i = 0; i < visitedTrail.length; i++) {
      const pos = visitedTrail[i];
      const { cx, cy } = getCenter(pos.x, pos.y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ==========================================
  // PASS 4: SOLUTION PATH (Engineering Mode)
  // ==========================================
  if (showSolution && solutionPath && solutionPath.length > 1) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.shadowColor = PALETTE.solutionGlow;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = PALETTE.solutionGlow;
    ctx.lineWidth = Math.max(3.5, roadWidth * 0.36);

    ctx.beginPath();
    for (let i = 0; i < solutionPath.length; i++) {
      const step = solutionPath[i];
      const { cx, cy } = getCenter(step.x, step.y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, roadWidth * 0.14);
    ctx.stroke();

    ctx.restore();
  }

  // Draw End Goal & Start Pad
  const endC = getCenter(end.x, end.y);
  drawLotusGoal(ctx, endC.cx, endC.cy, cellSize, timeSec);

  const startC = getCenter(start.x, start.y);
  drawStartPad(ctx, startC.cx, startC.cy, cellSize);

  // ==========================================
  // PASS 5: DEPTH-ORDERED BRIDGE & PLAYER RENDERING
  // ==========================================
  const playerScreenX = offsetX + player.exactX * cellSize + halfCell;
  const playerScreenY = offsetY + player.exactY * cellSize + halfCell;

  const isPlayerInTunnel = player.currentLayer === 'TUNNEL';

  if (isPlayerInTunnel) {
    drawPlayer(ctx, playerScreenX, playerScreenY, cellSize, player, timeSec);
  }

  drawBridges(ctx, cells, mw, mh, cellSize, offsetX, offsetY, roadWidth, isPlayerInTunnel ? player : null);

  if (!isPlayerInTunnel) {
    drawPlayer(ctx, playerScreenX, playerScreenY, cellSize, player, timeSec);
  }

  // ==========================================
  // PASS 6: VANTAGE POINT BOTANICAL SHROUD (FOG OF WAR)
  // ==========================================
  drawVantageShroud(
    ctx,
    canvasWidth,
    canvasHeight,
    playerScreenX,
    playerScreenY,
    endC.cx,
    endC.cy,
    cellSize,
    rc.vantageFactor ?? 0,
    rc.isVantageFogEnabled ?? false,
    rc.visionRadius ?? 2.5,
    timeSec
  );
}

/**
 * Renders Vantage Point Garden Shroud (Fog of War)
 * On ground / tunnel: intimate local view around the player (configurable radius), with distant garden completely obscured.
 * On high bridge: vision smoothly expands, lifting the shroud to reveal the panoramic woven maze layout.
 */
function drawVantageShroud(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  playerScreenX: number,
  playerScreenY: number,
  goalScreenX: number,
  goalScreenY: number,
  cellSize: number,
  vantageFactor: number,
  isVantageFogEnabled: boolean,
  visionRadiusCells: number = 2.5,
  timeSec: number
) {
  if (!isVantageFogEnabled) return;
  if (vantageFactor >= 0.999) {
    // If fully on bridge with full panorama, draw golden sunbeam aura around player
    drawBridgeVantageAura(ctx, playerScreenX, playerScreenY, cellSize, timeSec, 1.0);
    return;
  }

  ctx.save();

  // Base vision radius at ground level: customizable by user in grid cells
  const baseRadius = Math.max(30, cellSize * visionRadiusCells);
  const maxRadius = Math.max(canvasWidth, canvasHeight) * 1.5;

  // Ease-out curve for natural visual transition
  const easeFactor = Math.sin((Math.max(0, Math.min(1, vantageFactor)) * Math.PI) / 2);
  const currentRadius = baseRadius + (maxRadius - baseRadius) * easeFactor;
  const currentAlpha = 1.0 - easeFactor; // Completely opaque (100%) on ground!

  if (currentAlpha > 0.01) {
    // 1. Dense opaque botanical radial vignette mask
    // Deep dark enchanted forest green (matches PALETTE.bg)
    const grad = ctx.createRadialGradient(
      playerScreenX,
      playerScreenY,
      currentRadius * 0.42,
      playerScreenX,
      playerScreenY,
      currentRadius
    );

    grad.addColorStop(0, 'rgba(10, 24, 16, 0)');
    grad.addColorStop(0.52, `rgba(10, 24, 16, ${currentAlpha * 0.22})`);
    grad.addColorStop(0.78, `rgba(10, 24, 16, ${currentAlpha * 0.82})`);
    grad.addColorStop(0.94, `rgba(10, 24, 16, ${currentAlpha * 0.98})`);
    grad.addColorStop(1, `rgba(10, 24, 16, ${currentAlpha})`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Goal Orientation Beacon (faint mystical water-lily light guiding direction through deep fog)
    const distToGoal = Math.hypot(playerScreenX - goalScreenX, playerScreenY - goalScreenY);
    if (distToGoal > currentRadius * 0.75) {
      const pulse = (Math.sin(timeSec * 2.4) + 1) * 0.5;
      const beaconR = cellSize * (0.95 + pulse * 0.2);
      const bGrad = ctx.createRadialGradient(
        goalScreenX,
        goalScreenY,
        0,
        goalScreenX,
        goalScreenY,
        beaconR
      );
      bGrad.addColorStop(0, `rgba(56, 189, 248, ${(0.32 + pulse * 0.1) * (1 - easeFactor)})`);
      bGrad.addColorStop(0.65, `rgba(56, 189, 248, ${0.08 * (1 - easeFactor)})`);
      bGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(goalScreenX, goalScreenY, beaconR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. If currently elevating on a bridge, draw sunlight shimmer aura
  if (vantageFactor > 0.05) {
    drawBridgeVantageAura(ctx, playerScreenX, playerScreenY, cellSize, timeSec, easeFactor);
  }

  ctx.restore();
}

/**
 * Draws sunlit vantage shimmer when player is standing high on an elevated bridge
 */
function drawBridgeVantageAura(
  ctx: CanvasRenderingContext2D,
  playerScreenX: number,
  playerScreenY: number,
  cellSize: number,
  timeSec: number,
  intensity: number = 1.0
) {
  ctx.save();
  const auraSize = cellSize * 1.35;
  const pulse = (Math.sin(timeSec * 3.5) + 1) * 0.5;

  ctx.shadowColor = 'rgba(251, 191, 36, 0.8)';
  ctx.shadowBlur = (14 + pulse * 8) * intensity;

  ctx.strokeStyle = `rgba(251, 191, 36, ${(0.55 + pulse * 0.3) * intensity})`;
  ctx.lineWidth = Math.max(2, cellSize * 0.06);

  ctx.beginPath();
  ctx.arc(playerScreenX, playerScreenY, auraSize * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Renders all elevated bridges with natural drop shadow and timber railings
 */
function drawBridges(
  ctx: CanvasRenderingContext2D,
  cells: MazeData['cells'],
  mw: number,
  mh: number,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  roadWidth: number,
  playerInTunnel: PlayerState | null
) {
  const halfRoad = roadWidth / 2;
  const halfCell = cellSize / 2;

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const cell = cells[y][x];
      if (!cell.isWeave) continue;

      const cx = offsetX + x * cellSize + halfCell;
      const cy = offsetY + y * cellSize + halfCell;
      const isBridgeHorizontal = cell.bridgeAxis === 'HORIZONTAL';

      const isPlayerUnderneath =
        playerInTunnel &&
        Math.abs(playerInTunnel.exactX - x) < 0.6 &&
        Math.abs(playerInTunnel.exactY - y) < 0.6;

      ctx.save();

      ctx.shadowColor = PALETTE.bridgeDropShadow;
      ctx.shadowBlur = Math.max(6, cellSize * 0.22);
      ctx.shadowOffsetY = Math.max(4, cellSize * 0.12);
      ctx.shadowOffsetX = 0;

      ctx.globalAlpha = isPlayerUnderneath ? 0.82 : 1.0;
      ctx.fillStyle = PALETTE.bridgeDeck;

      if (isBridgeHorizontal) {
        const leftX = cx - halfCell;
        const width = cellSize;
        const topY = cy - halfRoad;
        const height = roadWidth;

        ctx.fillRect(leftX, topY, width, height);

        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = PALETTE.bridgePlank;
        ctx.lineWidth = 1.5;
        const plankStep = Math.max(6, cellSize * 0.14);
        for (let px = leftX + 4; px < leftX + width - 4; px += plankStep) {
          ctx.beginPath();
          ctx.moveTo(px, topY + 2);
          ctx.lineTo(px, topY + height - 2);
          ctx.stroke();
        }

        ctx.strokeStyle = PALETTE.bridgeRailing;
        ctx.lineWidth = Math.max(2.5, cellSize * 0.06);

        ctx.beginPath();
        ctx.moveTo(leftX, topY);
        ctx.lineTo(leftX + width, topY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(leftX, topY + height);
        ctx.lineTo(leftX + width, topY + height);
        ctx.stroke();

        ctx.fillStyle = PALETTE.bridgePost;
        ctx.fillRect(leftX, topY - 2, 4, height + 4);
        ctx.fillRect(leftX + width - 4, topY - 2, 4, height + 4);
      } else {
        const topY = cy - halfCell;
        const height = cellSize;
        const leftX = cx - halfRoad;
        const width = roadWidth;

        ctx.fillRect(leftX, topY, width, height);

        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = PALETTE.bridgePlank;
        ctx.lineWidth = 1.5;
        const plankStep = Math.max(6, cellSize * 0.14);
        for (let py = topY + 4; py < topY + height - 4; py += plankStep) {
          ctx.beginPath();
          ctx.moveTo(leftX + 2, py);
          ctx.lineTo(leftX + width - 2, py);
          ctx.stroke();
        }

        ctx.strokeStyle = PALETTE.bridgeRailing;
        ctx.lineWidth = Math.max(2.5, cellSize * 0.06);

        ctx.beginPath();
        ctx.moveTo(leftX, topY);
        ctx.lineTo(leftX, topY + height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(leftX + width, topY);
        ctx.lineTo(leftX + width, topY + height);
        ctx.stroke();

        ctx.fillStyle = PALETTE.bridgePost;
        ctx.fillRect(leftX - 2, topY, width + 4, 4);
        ctx.fillRect(leftX - 2, topY + height - 4, width + 4, 4);
      }

      ctx.restore();
    }
  }
}

/**
 * Draws animated Lotus Pond at the maze exit
 */
function drawLotusGoal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellSize: number,
  timeSec: number
) {
  ctx.save();
  const radius = cellSize * 0.38;

  const rippleCount = 2;
  for (let i = 0; i < rippleCount; i++) {
    const rPhase = (timeSec * 1.2 + i * 0.5) % 1;
    const rSize = radius * (0.8 + rPhase * 0.4);
    const alpha = (1 - rPhase) * 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, rSize, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const pondGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  pondGrad.addColorStop(0, '#38bdf8');
  pondGrad.addColorStop(0.7, '#0284c7');
  pondGrad.addColorStop(1, '#0369a1');

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = pondGrad;
  ctx.shadowColor = 'rgba(2, 132, 199, 0.6)';
  ctx.shadowBlur = 10;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Lily Pad
  ctx.beginPath();
  ctx.arc(cx - radius * 0.15, cy + radius * 0.15, radius * 0.65, 0.4, Math.PI * 1.85);
  ctx.lineTo(cx - radius * 0.15, cy + radius * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#15803d';
  ctx.fill();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Blooming Lotus
  const petalCount = 6;
  const petalLen = radius * 0.45;
  const bobbing = Math.sin(timeSec * 3) * 2;

  ctx.save();
  ctx.translate(cx, cy + bobbing);

  for (let i = 0; i < petalCount; i++) {
    const angle = (i * Math.PI * 2) / petalCount + timeSec * 0.1;
    ctx.save();
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.ellipse(0, -petalLen * 0.6, petalLen * 0.35, petalLen * 0.6, 0, 0, Math.PI * 2);
    const petalGrad = ctx.createLinearGradient(0, 0, 0, -petalLen);
    petalGrad.addColorStop(0, '#f43f5e');
    petalGrad.addColorStop(0.6, '#fb7185');
    petalGrad.addColorStop(1, '#ffe4e6');
    ctx.fillStyle = petalGrad;
    ctx.fill();

    ctx.restore();
  }

  // Center
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#fbbf24';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/**
 * Draws Start Lily Pad Marker
 */
function drawStartPad(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellSize: number
) {
  ctx.save();
  const radius = cellSize * 0.34;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0.3, Math.PI * 1.88);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = '#166534';
  ctx.fill();
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#bbf7d0';
  ctx.font = `bold ${Math.max(8, cellSize * 0.18)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('START', cx, cy + radius * 0.05);

  ctx.restore();
}

/**
 * Draws Player Character (Frog) with smooth continuous 2D planar movement (no vertical hop bouncing)
 */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellSize: number,
  player: PlayerState,
  timeSec: number
) {
  ctx.save();

  // Pure 2D position without vertical hopping bounce
  ctx.translate(x, y);
  ctx.rotate(player.facingAngle);

  const frogR = cellSize * 0.28;
  const isTunnel = player.currentLayer === 'TUNNEL';
  const isBridge = player.currentLayer === 'BRIDGE';

  // Frog Drop Shadow
  ctx.save();
  ctx.shadowColor = isBridge ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = isBridge ? 12 : 6;
  ctx.shadowOffsetY = isBridge ? 6 : 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, frogR * 0.85, frogR * 0.7, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.fill();
  ctx.restore();

  // Rear Legs
  ctx.fillStyle = '#16a34a';
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.ellipse(side * frogR * 0.75, frogR * 0.45, frogR * 0.32, frogR * 0.2, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Front Hands
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.ellipse(side * frogR * 0.7, -frogR * 0.35, frogR * 0.22, frogR * 0.16, side * -0.4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Main Body
  const bodyGrad = ctx.createRadialGradient(0, -frogR * 0.2, 0, 0, 0, frogR);
  bodyGrad.addColorStop(0, PALETTE.frogBody);
  bodyGrad.addColorStop(1, '#15803d');

  ctx.beginPath();
  ctx.ellipse(0, 0, frogR * 0.85, frogR * 0.75, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Belly
  ctx.beginPath();
  ctx.ellipse(0, frogR * 0.15, frogR * 0.52, frogR * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.frogBelly;
  ctx.fill();

  // Eyes
  const eyeR = frogR * 0.36;
  const eyeY = -frogR * 0.65;
  const blink = Math.sin(timeSec * 2.5) > 0.96;

  [-1, 1].forEach((side) => {
    const eyeX = side * frogR * 0.52;

    ctx.beginPath();
    ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.frogBody;
    ctx.fill();
    ctx.stroke();

    if (!blink) {
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, eyeR * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.frogEyeWhite;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(eyeX, eyeY - eyeR * 0.1, eyeR * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.frogPupil;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(eyeX - eyeR * 0.2, eyeY - eyeR * 0.25, eyeR * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, eyeR * 0.5, 0.2, Math.PI - 0.2);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Rosy cheeks
  ctx.fillStyle = PALETTE.frogBlush;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.arc(side * frogR * 0.55, -frogR * 0.1, frogR * 0.18, 0, Math.PI * 2);
    ctx.fill();
  });

  // Smile
  ctx.beginPath();
  ctx.arc(0, -frogR * 0.1, frogR * 0.28, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Layer Indicator Badge (Upright)
  if (isBridge || isTunnel) {
    ctx.save();
    ctx.rotate(-player.facingAngle);
    ctx.fillStyle = isBridge ? '#f59e0b' : '#6366f1';
    ctx.beginPath();
    ctx.arc(0, -frogR * 1.25, frogR * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${frogR * 0.38}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isBridge ? '🌉' : '🚇', 0, -frogR * 1.25);
    ctx.restore();
  }

  ctx.restore();
}
