import type { Board, SolveResult, SudokuSize } from '@/types'
import { getGridRule, getBoxOrigin, cloneBoard } from './gridRules'

function isValueValidInRow(board: Board, row: number, col: number, value: number): boolean {
  for (let c = 0; c < board[row].length; c++) {
    if (c !== col && board[row][c] === value) return false
  }
  return true
}

function isValueValidInCol(board: Board, row: number, col: number, value: number): boolean {
  for (let r = 0; r < board.length; r++) {
    if (r !== row && board[r][col] === value) return false
  }
  return true
}

function isValueValidInBox(
  board: Board,
  row: number,
  col: number,
  value: number,
  size: SudokuSize
): boolean {
  const rule = getGridRule(size)
  if (!rule.hasSubGrids) return true
  const { boxRow, boxCol } = getBoxOrigin(row, col, rule)
  for (let r = boxRow; r < boxRow + rule.boxRows; r++) {
    for (let c = boxCol; c < boxCol + rule.boxCols; c++) {
      if ((r !== row || c !== col) && board[r][c] === value) return false
    }
  }
  return true
}

export function isValidMove(board: Board, row: number, col: number, value: number): boolean {
  const size = board.length as SudokuSize
  if (value === 0) return true
  return (
    isValueValidInRow(board, row, col, value) &&
    isValueValidInCol(board, row, col, value) &&
    isValueValidInBox(board, row, col, value, size)
  )
}

export function isBoardFull(board: Board): boolean {
  return board.every(row => row.every(cell => cell !== 0))
}

export function isSolved(board: Board): boolean {
  if (!isBoardFull(board)) return false
  const size = board.length
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = board[r][c]
      board[r][c] = 0
      const valid = isValidMove(board, r, c, val)
      board[r][c] = val
      if (!valid) return false
    }
  }
  return true
}

export function solve(board: Board): SolveResult {
  const size = board.length as SudokuSize
  const working = cloneBoard(board)
  let solutionCount = 0
  let foundSolution: Board | undefined

  function findEmpty(): [number, number] | null {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (working[r][c] === 0) return [r, c]
      }
    }
    return null
  }

  function backtrack(): void {
    if (solutionCount > 1) return
    const pos = findEmpty()
    if (!pos) {
      solutionCount++
      if (solutionCount === 1) foundSolution = cloneBoard(working)
      return
    }
    const [r, c] = pos
    for (let v = 1; v <= size; v++) {
      if (isValidMove(working, r, c, v)) {
        working[r][c] = v
        backtrack()
        working[r][c] = 0
      }
      if (solutionCount > 1) return
    }
  }

  backtrack()

  return {
    solvable: solutionCount >= 1,
    unique: solutionCount === 1,
    solution: foundSolution
  }
}
