import { Direction, LayerType, MazeData } from '../types/maze';

// Corridor collision parameters in grid units (0.0 to 1.0 per cell)
export const CORRIDOR_RADIUS = 0.22; // Half road width
export const PLAYER_COLLISION_RADIUS = 0.06; // Small player collision radius
export const MAX_OFFSET_FROM_CENTER = CORRIDOR_RADIUS - PLAYER_COLLISION_RADIUS; // ~0.16

/**
 * Checks whether a continuous 2D position (x, y) is inside the legal road corridor
 * and determines the active layer (GROUND, BRIDGE, or TUNNEL).
 */
export function validateCorridorPosition(
  maze: MazeData,
  x: number,
  y: number,
  currentLayer: LayerType
): { valid: boolean; layer: LayerType } {
  const { width, height, cells } = maze;

  const gx = Math.round(x);
  const gy = Math.round(y);

  if (gx < 0 || gx >= width || gy < 0 || gy >= height) {
    return { valid: false, layer: currentLayer };
  }

  const cell = cells[gy][gx];
  const dx = x - gx; // Offset from cell center [-0.5, 0.5]
  const dy = y - gy; // Offset from cell center [-0.5, 0.5]
  const limit = MAX_OFFSET_FROM_CENTER;

  if (cell.isWeave) {
    const isBridgeHorizontal = cell.bridgeAxis === 'HORIZONTAL';

    // Horizontal Track (East-West corridor)
    const isInHorizontalTrack = Math.abs(dy) <= limit && Math.abs(dx) <= 0.5;
    const horizontalLayer: LayerType = isBridgeHorizontal ? 'BRIDGE' : 'TUNNEL';

    // Vertical Track (North-South corridor)
    const isInVerticalTrack = Math.abs(dx) <= limit && Math.abs(dy) <= 0.5;
    const verticalLayer: LayerType = isBridgeHorizontal ? 'TUNNEL' : 'BRIDGE';

    // If already in BRIDGE or TUNNEL, stay strictly on that track
    if (currentLayer === 'BRIDGE') {
      if (isBridgeHorizontal && isInHorizontalTrack) {
        return { valid: true, layer: 'BRIDGE' };
      }
      if (!isBridgeHorizontal && isInVerticalTrack) {
        return { valid: true, layer: 'BRIDGE' };
      }
      return { valid: false, layer: 'BRIDGE' };
    }

    if (currentLayer === 'TUNNEL') {
      if (!isBridgeHorizontal && isInHorizontalTrack) {
        return { valid: true, layer: 'TUNNEL' };
      }
      if (isBridgeHorizontal && isInVerticalTrack) {
        return { valid: true, layer: 'TUNNEL' };
      }
      return { valid: false, layer: 'TUNNEL' };
    }

    // Entering from GROUND: choose track based on entry direction
    if (Math.abs(dx) > Math.abs(dy) && isInHorizontalTrack) {
      return { valid: true, layer: horizontalLayer };
    }
    if (isInVerticalTrack) {
      return { valid: true, layer: verticalLayer };
    }
    if (isInHorizontalTrack) {
      return { valid: true, layer: horizontalLayer };
    }

    return { valid: false, layer: currentLayer };
  } else {
    // Standard cell (GROUND layer)
    // Central junction box
    if (Math.abs(dx) <= limit && Math.abs(dy) <= limit) {
      return { valid: true, layer: 'GROUND' };
    }

    // East corridor
    if (dx > limit && Math.abs(dy) <= limit && dx <= 0.5) {
      if ((cell.openMask & Direction.EAST) !== 0) {
        return { valid: true, layer: 'GROUND' };
      }
    }

    // West corridor
    if (dx < -limit && Math.abs(dy) <= limit && dx >= -0.5) {
      if ((cell.openMask & Direction.WEST) !== 0) {
        return { valid: true, layer: 'GROUND' };
      }
    }

    // South corridor
    if (dy > limit && Math.abs(dx) <= limit && dy <= 0.5) {
      if ((cell.openMask & Direction.SOUTH) !== 0) {
        return { valid: true, layer: 'GROUND' };
      }
    }

    // North corridor
    if (dy < -limit && Math.abs(dx) <= limit && dy >= -0.5) {
      if ((cell.openMask & Direction.NORTH) !== 0) {
        return { valid: true, layer: 'GROUND' };
      }
    }

    return { valid: false, layer: 'GROUND' };
  }
}

/**
 * Calculates continuous sub-pixel movement with smooth wall sliding physics
 */
export function updateContinuousPhysics(
  maze: MazeData,
  currentX: number,
  currentY: number,
  currentLayer: LayerType,
  vx: number,
  vy: number,
  dt: number
): { x: number; y: number; layer: LayerType; moved: boolean } {
  if (vx === 0 && vy === 0) {
    return { x: currentX, y: currentY, layer: currentLayer, moved: false };
  }

  const deltaX = vx * dt;
  const deltaY = vy * dt;

  // 1. Try full 2D movement vector
  const tryFull = validateCorridorPosition(maze, currentX + deltaX, currentY + deltaY, currentLayer);
  if (tryFull.valid) {
    return {
      x: currentX + deltaX,
      y: currentY + deltaY,
      layer: tryFull.layer,
      moved: true,
    };
  }

  // 2. Try Wall Sliding (X-axis only)
  if (deltaX !== 0) {
    const tryX = validateCorridorPosition(maze, currentX + deltaX, currentY, currentLayer);
    if (tryX.valid) {
      return {
        x: currentX + deltaX,
        y: currentY,
        layer: tryX.layer,
        moved: true,
      };
    }
  }

  // 3. Try Wall Sliding (Y-axis only)
  if (deltaY !== 0) {
    const tryY = validateCorridorPosition(maze, currentX, currentY + deltaY, currentLayer);
    if (tryY.valid) {
      return {
        x: currentX,
        y: currentY + deltaY,
        layer: tryY.layer,
        moved: true,
      };
    }
  }

  // Blocked by corner/wall
  return { x: currentX, y: currentY, layer: currentLayer, moved: false };
}
