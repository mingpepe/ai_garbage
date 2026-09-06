import {
  Cell,
  Direction,
  DIRECTION_VECTORS,
  OPPOSITE_DIRECTION,
  ALL_DIRECTIONS,
  MazeData,
  Position,
  Axis,
} from '../types/maze';

/**
 * Options for generating a Weave Maze
 */
export interface GeneratorOptions {
  width: number;
  height: number;
  weaveProbability?: number; // 0.0 to 1.0 (default: 0.5)
  braidFactor?: number; // 0.0 to 1.0 (removes some dead ends for loopier mazes)
  start?: Position;
  end?: Position;
}

/**
 * Checks if coordinate is within maze bounds
 */
export function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

/**
 * Shuffle array in-place using Fisher-Yates algorithm
 */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Creates an empty grid with all walls closed
 */
function createEmptyGrid(width: number, height: number): Cell[][] {
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        isWeave: false,
        openMask: Direction.NONE,
        bridgeOpenMask: Direction.NONE,
        bridgeAxis: undefined,
      });
    }
    cells.push(row);
  }
  return cells;
}

/**
 * Generates a Multi-layer Weave Maze with overpasses and underpasses
 */
export function generateWeaveMaze(options: GeneratorOptions): MazeData {
  const width = Math.max(5, options.width);
  const height = Math.max(5, options.height);
  const weaveProbability = Math.max(0, Math.min(1, options.weaveProbability ?? 0.5));
  const braidFactor = Math.max(0, Math.min(1, options.braidFactor ?? 0.0));

  const start: Position = options.start ?? { x: 0, y: 0 };
  const end: Position = options.end ?? { x: width - 1, y: height - 1 };

  const cells = createEmptyGrid(width, height);
  const visited: boolean[][] = Array.from({ length: height }, () =>
    Array(width).fill(false)
  );

  const stack: Position[] = [];
  let weaveCount = 0;

  // Start carving from starting position
  visited[start.y][start.x] = true;
  stack.push({ x: start.x, y: start.y });

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const { x, y } = current;

    const directions = shuffle(ALL_DIRECTIONS);
    let carved = false;

    for (const dir of directions) {
      const vec = DIRECTION_VECTORS[dir];
      const nx = x + vec.dx;
      const ny = y + vec.dy;

      if (!isInBounds(nx, ny, width, height)) {
        continue;
      }

      // Case 1: Standard passage carve to an unvisited cell
      if (!visited[ny][nx]) {
        cells[y][x].openMask |= dir;
        cells[ny][nx].openMask |= OPPOSITE_DIRECTION[dir];
        visited[ny][nx] = true;
        stack.push({ x: nx, y: ny });
        carved = true;
        break;
      }

      // Case 2: Weave passage creation (jump across an existing straight passage)
      if (weaveProbability > 0 && Math.random() < weaveProbability) {
        const neighbor = cells[ny][nx];
        const isHorizontalMove = dir === Direction.EAST || dir === Direction.WEST;

        // Condition A: Neighbor must be a standard cell (not already a weave)
        if (!neighbor.isWeave) {
          // Condition B: Neighbor must be a straight corridor perpendicular to movement
          const isPerpendicularCorridor = isHorizontalMove
            ? neighbor.openMask === (Direction.NORTH | Direction.SOUTH)
            : neighbor.openMask === (Direction.EAST | Direction.WEST);

          if (isPerpendicularCorridor) {
            // Condition C: Target cell 2 units away must be in-bounds and unvisited
            const nnx = x + vec.dx * 2;
            const nny = y + vec.dy * 2;

            if (isInBounds(nnx, nny, width, height) && !visited[nny][nnx]) {
              // Condition D: Neighbor must not be adjacent to any existing weave cell
              const hasAdjacentWeave = ALL_DIRECTIONS.some((d) => {
                const cv = DIRECTION_VECTORS[d];
                const ax = nx + cv.dx;
                const ay = ny + cv.dy;
                return isInBounds(ax, ay, width, height) && cells[ay][ax].isWeave;
              });

              if (hasAdjacentWeave) {
                continue;
              }

              // Create the Weave Cell!
              neighbor.isWeave = true;
              weaveCount++;

              // Randomly decide which axis is the elevated bridge (50% bridge on new axis, 50% bridge on old axis)
              const newAxisIsBridge = Math.random() < 0.5;
              const newAxis: Axis = isHorizontalMove ? 'HORIZONTAL' : 'VERTICAL';
              const oldAxis: Axis = isHorizontalMove ? 'VERTICAL' : 'HORIZONTAL';

              if (newAxisIsBridge) {
                neighbor.bridgeAxis = newAxis;
                // New axis is bridge (Layer 1)
                neighbor.bridgeOpenMask = isHorizontalMove
                  ? Direction.EAST | Direction.WEST
                  : Direction.NORTH | Direction.SOUTH;
                // Old axis remains tunnel (Layer 0)
                neighbor.openMask = isHorizontalMove
                  ? Direction.NORTH | Direction.SOUTH
                  : Direction.EAST | Direction.WEST;
              } else {
                neighbor.bridgeAxis = oldAxis;
                // Old axis is bridge (Layer 1)
                neighbor.bridgeOpenMask = isHorizontalMove
                  ? Direction.NORTH | Direction.SOUTH
                  : Direction.EAST | Direction.WEST;
                // New axis is tunnel (Layer 0)
                neighbor.openMask = isHorizontalMove
                  ? Direction.EAST | Direction.WEST
                  : Direction.NORTH | Direction.SOUTH;
              }

              // Carve passage from current -> neighbor and neighbor -> target
              cells[y][x].openMask |= dir;
              cells[nny][nnx].openMask |= OPPOSITE_DIRECTION[dir];

              visited[nny][nnx] = true;
              stack.push({ x: nnx, y: nny });
              carved = true;
              break;
            }
          }
        }
      }
    }

    if (!carved) {
      stack.pop();
    }
  }

  // Ensure all isolated cells (if any) are connected via Hunt-and-Kill sweep
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!visited[y][x]) {
        visited[y][x] = true;
        // Connect to any visited neighbor
        const dirs = shuffle(ALL_DIRECTIONS);
        for (const dir of dirs) {
          const vec = DIRECTION_VECTORS[dir];
          const nx = x + vec.dx;
          const ny = y + vec.dy;
          if (isInBounds(nx, ny, width, height) && visited[ny][nx] && !cells[ny][nx].isWeave) {
            cells[y][x].openMask |= dir;
            cells[ny][nx].openMask |= OPPOSITE_DIRECTION[dir];
            break;
          }
        }
      }
    }
  }

  // Optional: Braid dead ends if requested (creates loops for variety)
  if (braidFactor > 0) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = cells[y][x];
        if (cell.isWeave) continue;
        if ((x === start.x && y === start.y) || (x === end.x && y === end.y)) continue;

        // Count open exits
        let openCount = 0;
        for (const d of ALL_DIRECTIONS) {
          if ((cell.openMask & d) !== 0) openCount++;
        }

        // If dead end (only 1 exit)
        if (openCount === 1 && Math.random() < braidFactor) {
          const dirs = shuffle(ALL_DIRECTIONS);
          for (const d of dirs) {
            if ((cell.openMask & d) === 0) {
              const vec = DIRECTION_VECTORS[d];
              const nx = x + vec.dx;
              const ny = y + vec.dy;
              if (isInBounds(nx, ny, width, height) && !cells[ny][nx].isWeave) {
                cell.openMask |= d;
                cells[ny][nx].openMask |= OPPOSITE_DIRECTION[d];
                break;
              }
            }
          }
        }
      }
    }
  }

  const totalCells = width * height;
  const weaveDensity = totalCells > 0 ? weaveCount / totalCells : 0;

  return {
    width,
    height,
    cells,
    start,
    end,
    weaveCount,
    weaveDensity,
  };
}
