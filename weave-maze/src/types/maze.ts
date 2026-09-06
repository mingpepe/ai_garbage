/**
 * Maze Direction bitflags and utility vectors
 */
export enum Direction {
  NONE = 0,
  NORTH = 1 << 0, // 1
  EAST = 1 << 1,  // 2
  SOUTH = 1 << 2, // 4
  WEST = 1 << 3,  // 8
}

export type DirectionKey = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';

export const DIRECTION_VECTORS: Record<Direction, { dx: number; dy: number }> = {
  [Direction.NONE]: { dx: 0, dy: 0 },
  [Direction.NORTH]: { dx: 0, dy: -1 },
  [Direction.EAST]: { dx: 1, dy: 0 },
  [Direction.SOUTH]: { dx: 0, dy: 1 },
  [Direction.WEST]: { dx: -1, dy: 0 },
};

export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  [Direction.NONE]: Direction.NONE,
  [Direction.NORTH]: Direction.SOUTH,
  [Direction.EAST]: Direction.WEST,
  [Direction.SOUTH]: Direction.NORTH,
  [Direction.WEST]: Direction.EAST,
};

export const ALL_DIRECTIONS: Direction[] = [
  Direction.NORTH,
  Direction.EAST,
  Direction.SOUTH,
  Direction.WEST,
];

/**
 * Axis for 1D movement inside a cell
 */
export type Axis = 'HORIZONTAL' | 'VERTICAL';

/**
 * Layer type for a path segment
 * GROUND: Standard single-level corridor
 * TUNNEL: Lower layer underpass
 * BRIDGE: Upper layer overpass
 */
export type LayerType = 'GROUND' | 'TUNNEL' | 'BRIDGE';

/**
 * Represents a single cell in the Weave Maze.
 */
export interface Cell {
  x: number;
  y: number;
  isWeave: boolean;
  
  // Bitmask of open directions on the standard/lower layer
  openMask: number;

  // Bitmask of open directions on the elevated bridge layer (only valid when isWeave is true)
  bridgeOpenMask: number;

  // Which axis is elevated as a bridge
  bridgeAxis?: Axis;
}

/**
 * Grid coordinates
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Continuous Player State (smooth 2D planar gliding)
 */
export interface PlayerState {
  gridX: number;
  gridY: number;
  exactX: number; // Continuous float X position
  exactY: number; // Continuous float Y position
  targetX: number;
  targetY: number;
  lastDir: Direction;
  currentLayer: LayerType;
  facingAngle: number;
  isMoving: boolean;
}

/**
 * Graph node state used for BFS solving and path validation
 */
export interface SolverNode {
  x: number;
  y: number;
  axis?: Axis;
  cost: number;
  parent?: SolverNode;
  stepDirection?: Direction;
  layer: LayerType;
}

/**
 * Full Maze model
 */
export interface MazeData {
  width: number;
  height: number;
  cells: Cell[][];
  start: Position;
  end: Position;
  weaveCount: number;
  weaveDensity: number;
}

/**
 * Game Difficulty presets
 */
export type DifficultyId = 'easy' | 'medium' | 'hard' | 'expert' | 'custom';

export interface DifficultyPreset {
  id: DifficultyId;
  name: string;
  width: number;
  height: number;
  defaultWeaveProb: number;
  icon: string;
}
