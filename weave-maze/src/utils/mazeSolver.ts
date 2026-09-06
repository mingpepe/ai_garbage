import {
  Axis,
  Cell,
  Direction,
  DIRECTION_VECTORS,
  OPPOSITE_DIRECTION,
  ALL_DIRECTIONS,
  LayerType,
  MazeData,
  SolverNode,
  Position,
} from '../types/maze';
import { isInBounds } from './mazeGenerator';

/**
 * Encodes a solver state into a unique string key for BFS visited set
 */
function stateKey(x: number, y: number, axis?: Axis): string {
  return `${x},${y},${axis || 'NONE'}`;
}

/**
 * Returns axis for a given movement direction
 */
export function getAxisForDirection(dir: Direction): Axis {
  return dir === Direction.EAST || dir === Direction.WEST ? 'HORIZONTAL' : 'VERTICAL';
}

/**
 * Returns layer type for a cell given the traversal axis
 */
export function getCellLayer(cell: Cell, axis?: Axis): LayerType {
  if (!cell.isWeave || !axis) {
    return 'GROUND';
  }
  return cell.bridgeAxis === axis ? 'BRIDGE' : 'TUNNEL';
}

/**
 * Validates whether a move from (fromX, fromY) in direction `dir` is legally permitted.
 * Respects weave overpasses and underpasses (cannot turn at cross junctions).
 */
export function canMove(
  maze: MazeData,
  fromX: number,
  fromY: number,
  lastDir: Direction,
  dir: Direction
): {
  allowed: boolean;
  toX: number;
  toY: number;
  nextLayer: LayerType;
  reason?: string;
} {
  const { width, height, cells } = maze;
  if (!isInBounds(fromX, fromY, width, height)) {
    return { allowed: false, toX: fromX, toY: fromY, nextLayer: 'GROUND', reason: 'Out of bounds' };
  }

  const currentCell = cells[fromY][fromX];
  const moveVec = DIRECTION_VECTORS[dir];
  const toX = fromX + moveVec.dx;
  const toY = fromY + moveVec.dy;

  if (!isInBounds(toX, toY, width, height)) {
    return { allowed: false, toX: fromX, toY: fromY, nextLayer: 'GROUND', reason: 'Wall boundary' };
  }

  const targetCell = cells[toY][toX];
  const moveAxis = getAxisForDirection(dir);

  // 1. Current cell check
  if (currentCell.isWeave) {
    const currentActiveAxis = lastDir !== Direction.NONE ? getAxisForDirection(lastDir) : currentCell.bridgeAxis;
    if (moveAxis !== currentActiveAxis) {
      return {
        allowed: false,
        toX: fromX,
        toY: fromY,
        nextLayer: 'GROUND',
        reason: 'Cannot turn perpendicularly inside bridge/tunnel',
      };
    }

    const isBridge = currentCell.bridgeAxis === currentActiveAxis;
    const mask = isBridge ? currentCell.bridgeOpenMask : currentCell.openMask;
    if ((mask & dir) === 0) {
      return { allowed: false, toX: fromX, toY: fromY, nextLayer: 'GROUND', reason: 'Wall in current cell' };
    }
  } else {
    if ((currentCell.openMask & dir) === 0) {
      return { allowed: false, toX: fromX, toY: fromY, nextLayer: 'GROUND', reason: 'Wall in current cell' };
    }
  }

  // 2. Target cell check
  const oppDir = OPPOSITE_DIRECTION[dir];
  if (targetCell.isWeave) {
    const isBridge = targetCell.bridgeAxis === moveAxis;
    const mask = isBridge ? targetCell.bridgeOpenMask : targetCell.openMask;
    if ((mask & oppDir) === 0) {
      return { allowed: false, toX: fromX, toY: fromY, nextLayer: 'GROUND', reason: 'Wall in target cell' };
    }
    const nextLayer: LayerType = isBridge ? 'BRIDGE' : 'TUNNEL';
    return { allowed: true, toX, toY, nextLayer };
  } else {
    if ((targetCell.openMask & oppDir) === 0) {
      return { allowed: false, toX: fromX, toY: fromY, nextLayer: 'GROUND', reason: 'Wall in target cell' };
    }
    return { allowed: true, toX, toY, nextLayer: 'GROUND' };
  }
}

/**
 * Path step representation for the solution
 */
export interface PathStep {
  x: number;
  y: number;
  layer: LayerType;
  axis?: Axis;
  dirFromPrev?: Direction;
}

/**
 * Finds shortest path between any two positions in the 3D Weave Maze
 */
export function findShortestPath(
  maze: MazeData,
  startPos: Position,
  targetPos: Position,
  startLastDir: Direction = Direction.NONE
): PathStep[] | null {
  const { width, height, cells } = maze;
  if (!isInBounds(startPos.x, startPos.y, width, height) || !isInBounds(targetPos.x, targetPos.y, width, height)) {
    return null;
  }

  const queue: SolverNode[] = [];
  const visited = new Set<string>();

  const startCell = cells[startPos.y][startPos.x];
  let initialAxis: Axis | undefined = undefined;
  if (startCell.isWeave) {
    initialAxis = startLastDir !== Direction.NONE ? getAxisForDirection(startLastDir) : startCell.bridgeAxis;
  }

  const startNode: SolverNode = {
    x: startPos.x,
    y: startPos.y,
    axis: initialAxis,
    cost: 0,
    layer: startCell.isWeave && initialAxis === startCell.bridgeAxis ? 'BRIDGE' : 'GROUND',
  };

  queue.push(startNode);
  visited.add(stateKey(startNode.x, startNode.y, startNode.axis));

  let targetNode: SolverNode | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.x === targetPos.x && current.y === targetPos.y) {
      targetNode = current;
      break;
    }

    const currentCell = cells[current.y][current.x];

    for (const dir of ALL_DIRECTIONS) {
      const moveAxis = getAxisForDirection(dir);

      if (currentCell.isWeave && current.axis && moveAxis !== current.axis) {
        continue;
      }

      if (currentCell.isWeave) {
        const isBridge = currentCell.bridgeAxis === current.axis;
        const mask = isBridge ? currentCell.bridgeOpenMask : currentCell.openMask;
        if ((mask & dir) === 0) continue;
      } else {
        if ((currentCell.openMask & dir) === 0) continue;
      }

      const vec = DIRECTION_VECTORS[dir];
      const nx = current.x + vec.dx;
      const ny = current.y + vec.dy;

      if (!isInBounds(nx, ny, width, height)) continue;

      const neighbor = cells[ny][nx];
      const oppDir = OPPOSITE_DIRECTION[dir];

      let neighborAxis: Axis | undefined = undefined;
      let neighborLayer: LayerType = 'GROUND';

      if (neighbor.isWeave) {
        neighborAxis = moveAxis;
        const isBridge = neighbor.bridgeAxis === neighborAxis;
        const mask = isBridge ? neighbor.bridgeOpenMask : neighbor.openMask;
        if ((mask & oppDir) === 0) continue;
        neighborLayer = isBridge ? 'BRIDGE' : 'TUNNEL';
      } else {
        if ((neighbor.openMask & oppDir) === 0) continue;
        neighborLayer = 'GROUND';
      }

      const key = stateKey(nx, ny, neighborAxis);
      if (!visited.has(key)) {
        visited.add(key);
        const nextNode: SolverNode = {
          x: nx,
          y: ny,
          axis: neighborAxis,
          cost: current.cost + 1,
          parent: current,
          stepDirection: dir,
          layer: neighborLayer,
        };
        queue.push(nextNode);
      }
    }
  }

  if (!targetNode) {
    return null;
  }

  const path: PathStep[] = [];
  let curr: SolverNode | undefined = targetNode;
  while (curr) {
    path.unshift({
      x: curr.x,
      y: curr.y,
      layer: curr.layer,
      axis: curr.axis,
      dirFromPrev: curr.stepDirection,
    });
    curr = curr.parent;
  }

  return path;
}

/**
 * Finds the shortest path from start to end in the Weave Maze
 */
export function solveMaze(maze: MazeData): PathStep[] | null {
  return findShortestPath(maze, maze.start, maze.end, Direction.NONE);
}
