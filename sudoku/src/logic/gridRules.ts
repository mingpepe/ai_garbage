import type { SudokuSize } from '@/types'

export interface GridRule {
  hasSubGrids: boolean;
  boxRows: number;
  boxCols: number;
}

/**
 * Returns the sub-grid dimensions for sizes that support box constraints.
 * 5x5 and 7x7 use Latin Square rules only (no sub-grids).
 */
export function getGridRule(size: SudokuSize): GridRule {
  switch (size) {
    case 4: return { hasSubGrids: true, boxRows: 2, boxCols: 2 }
    case 5: return { hasSubGrids: false, boxRows: 0, boxCols: 0 }
    case 6: return { hasSubGrids: true, boxRows: 2, boxCols: 3 }
    case 7: return { hasSubGrids: false, boxRows: 0, boxCols: 0 }
    case 8: return { hasSubGrids: true, boxRows: 2, boxCols: 4 }
    case 9: return { hasSubGrids: true, boxRows: 3, boxCols: 3 }
  }
}

export function getBoxOrigin(
  row: number,
  col: number,
  rule: GridRule
): { boxRow: number; boxCol: number } {
  return {
    boxRow: Math.floor(row / rule.boxRows) * rule.boxRows,
    boxCol: Math.floor(col / rule.boxCols) * rule.boxCols
  }
}

export function cloneBoard(board: number[][]): number[][] {
  return board.map(r => [...r])
}

export function createEmptyBoard(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0))
}
