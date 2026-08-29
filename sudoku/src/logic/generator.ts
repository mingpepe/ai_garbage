import type { Board, DifficultyLevel, SudokuPuzzle, SudokuSize } from '@/types'
import { getGridRule, cloneBoard, createEmptyBoard } from './gridRules'
import { isValidMove, solve } from './validator'

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function fillBoard(board: Board, size: SudokuSize): boolean {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 0) {
        const values = shuffleArray(
          Array.from({ length: size }, (_, i) => i + 1)
        )
        for (const v of values) {
          if (isValidMove(board, r, c, v)) {
            board[r][c] = v
            if (fillBoard(board, size)) return true
            board[r][c] = 0
          }
        }
        return false
      }
    }
  }
  return true
}

/**
 * Returns the number of clues to leave based on size and difficulty.
 * Higher difficulty = fewer clues.
 */
function getClueCount(size: SudokuSize, difficulty: DifficultyLevel): number {
  const total = size * size
  const ratios: Record<DifficultyLevel, number> = {
    1: 0.65,
    2: 0.52,
    3: 0.42,
    4: 0.34,
    5: 0.27
  }
  return Math.max(
    Math.ceil(size * 1.5),
    Math.floor(total * ratios[difficulty])
  )
}

function removeClues(solution: Board, size: SudokuSize, targetClues: number): Board {
  const puzzle = cloneBoard(solution)
  const positions = shuffleArray(
    Array.from({ length: size * size }, (_, i) => i)
  )
  let cluesLeft = size * size

  for (const pos of positions) {
    if (cluesLeft <= targetClues) break
    const row = Math.floor(pos / size)
    const col = pos % size
    const backup = puzzle[row][col]
    puzzle[row][col] = 0
    const result = solve(puzzle)
    if (!result.unique) {
      puzzle[row][col] = backup
    } else {
      cluesLeft--
    }
  }

  return puzzle
}

export function generatePuzzle(size: SudokuSize, difficulty: DifficultyLevel): SudokuPuzzle {
  const board = createEmptyBoard(size)
  fillBoard(board, size)
  const solution = cloneBoard(board)
  const targetClues = getClueCount(size, difficulty)
  const puzzle = removeClues(solution, size, targetClues)

  return { size, difficulty, puzzle, solution }
}

export { getGridRule }
