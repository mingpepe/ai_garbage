import { ref, computed } from 'vue'
import type { SudokuSize, DifficultyLevel, CellPosition } from '@/types'
import { generatePuzzle } from '@/logic/generator'
import { isValidMove, isSolved } from '@/logic/validator'
import { cloneBoard } from '@/logic/gridRules'

export function useGame() {
  const puzzle = ref<ReturnType<typeof generatePuzzle> | null>(null)
  const userBoard = ref<number[][]>([])
  const selectedCell = ref<CellPosition | null>(null)
  const isGenerating = ref(false)

  const errors = computed<Set<string>>(() => {
    if (!puzzle.value) return new Set()
    const errs = new Set<string>()
    const board = userBoard.value
    const size = board.length
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const val = board[r][c]
        if (val === 0) continue
        board[r][c] = 0
        if (!isValidMove(board, r, c, val)) errs.add(`${r},${c}`)
        board[r][c] = val
      }
    }
    return errs
  })

  const isComplete = computed(() => {
    if (!userBoard.value.length) return false
    return isSolved(userBoard.value)
  })

  const isClue = computed(() => {
    return (row: number, col: number): boolean => {
      if (!puzzle.value) return false
      return puzzle.value.puzzle[row][col] !== 0
    }
  })

  function startNewGame(size: SudokuSize, difficulty: DifficultyLevel) {
    isGenerating.value = true
    selectedCell.value = null
    setTimeout(() => {
      puzzle.value = generatePuzzle(size, difficulty)
      userBoard.value = cloneBoard(puzzle.value.puzzle)
      isGenerating.value = false
    }, 50)
  }

  function selectCell(pos: CellPosition) {
    selectedCell.value = pos
  }

  function enterValue(value: number) {
    if (!selectedCell.value || !puzzle.value) return
    const { row, col } = selectedCell.value
    if (isClue.value(row, col)) return
    userBoard.value[row][col] = value
  }

  function clearCell() {
    enterValue(0)
  }

  function getSolution() {
    return puzzle.value?.solution ?? null
  }

  return {
    puzzle,
    userBoard,
    selectedCell,
    isGenerating,
    errors,
    isComplete,
    isClue,
    startNewGame,
    selectCell,
    enterValue,
    clearCell,
    getSolution
  }
}
