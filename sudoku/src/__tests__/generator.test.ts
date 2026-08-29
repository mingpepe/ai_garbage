import { describe, it, expect } from 'vitest'
import { generatePuzzle } from '@/logic/generator'
import { isSolved } from '@/logic/validator'
import { solve } from '@/logic/validator'
import type { SudokuSize } from '@/types'

const sizes: SudokuSize[] = [4, 5, 6, 7, 8, 9]

describe('generatePuzzle', () => {
  it.each(sizes)('generates a valid fully-solved solution for size %i', (size) => {
    const { solution } = generatePuzzle(size, 1)
    expect(isSolved(solution)).toBe(true)
  })

  it.each(sizes)('generated puzzle has correct dimensions for size %i', (size) => {
    const { puzzle } = generatePuzzle(size, 1)
    expect(puzzle).toHaveLength(size)
    puzzle.forEach(row => expect(row).toHaveLength(size))
  })

  it('puzzle has at least some empty cells', () => {
    const { puzzle } = generatePuzzle(9, 3)
    const empties = puzzle.flat().filter(v => v === 0).length
    expect(empties).toBeGreaterThan(0)
  })

  it('puzzle has fewer clues at higher difficulty', () => {
    const easy = generatePuzzle(9, 1)
    const hard = generatePuzzle(9, 5)
    const easyClues = easy.puzzle.flat().filter(v => v !== 0).length
    const hardClues = hard.puzzle.flat().filter(v => v !== 0).length
    expect(easyClues).toBeGreaterThanOrEqual(hardClues)
  })

  it.each([4, 5, 6, 9] as SudokuSize[])('generated puzzle has a unique solution for size %i', (size) => {
    const { puzzle } = generatePuzzle(size, 2)
    const result = solve(puzzle)
    expect(result.unique).toBe(true)
  }, 30000)

  it('solution matches the puzzle clues', () => {
    const { puzzle, solution } = generatePuzzle(9, 2)
    const size = 9
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (puzzle[r][c] !== 0) {
          expect(puzzle[r][c]).toBe(solution[r][c])
        }
      }
    }
  })
})
