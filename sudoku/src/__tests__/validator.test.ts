import { describe, it, expect } from 'vitest'
import { isValidMove, isSolved, solve } from '@/logic/validator'
import type { Board } from '@/types'

// Solved 4x4 board
const solved4: Board = [
  [1, 2, 3, 4],
  [3, 4, 1, 2],
  [2, 1, 4, 3],
  [4, 3, 2, 1]
]

// Solved 9x9 board (classic valid)
const solved9: Board = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9]
]

describe('isValidMove', () => {
  it('returns true for 0 (empty cell)', () => {
    const board = [[0, 2], [3, 4]]
    expect(isValidMove(board, 0, 0, 0)).toBe(true)
  })

  it('returns false when value conflicts in row', () => {
    const board = [[1, 0, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]
    expect(isValidMove(board, 0, 1, 1)).toBe(false)
  })

  it('returns false when value conflicts in column', () => {
    const board = [[1, 0, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]
    expect(isValidMove(board, 0, 1, 4)).toBe(false)
  })

  it('returns false when value conflicts in sub-grid (4x4)', () => {
    const board = [[1, 0, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]
    expect(isValidMove(board, 0, 1, 3)).toBe(false)
  })

  it('returns true for valid move', () => {
    const board = [[1, 0, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]
    expect(isValidMove(board, 0, 1, 2)).toBe(true)
  })

  it('5x5 enforces row uniqueness (Latin Square — no box constraint)', () => {
    // Row 0 already has 1 at col 0. Placing 1 at col 2 conflicts in row.
    const board: Board = [
      [1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0]
    ]
    expect(isValidMove(board, 0, 2, 1)).toBe(false)
  })

  it('5x5 allows same value in same box-like area (no box constraint)', () => {
    // In 5x5 there are no sub-grids. Two cells at (0,0) and (1,1) can share
    // the same value as long as they don't share a row or column.
    const board: Board = [
      [1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0]
    ]
    // Placing 1 at (1,1): row 1 has no 1, col 1 has no 1, no box constraint => valid
    expect(isValidMove(board, 1, 1, 1)).toBe(true)
  })
})

describe('isSolved', () => {
  it('returns true for a correctly solved 4x4 board', () => {
    expect(isSolved(solved4)).toBe(true)
  })

  it('returns true for a correctly solved 9x9 board', () => {
    expect(isSolved(solved9)).toBe(true)
  })

  it('returns false when board has empty cells', () => {
    const board = [[0, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]
    expect(isSolved(board)).toBe(false)
  })

  it('returns false for an invalid board', () => {
    const board = [[1, 1, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]
    expect(isSolved(board)).toBe(false)
  })
})

describe('solve', () => {
  it('solves a simple 4x4 puzzle with unique solution', () => {
    const puzzle: Board = [
      [1, 0, 3, 4],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
      [4, 3, 2, 1]
    ]
    const result = solve(puzzle)
    expect(result.solvable).toBe(true)
    expect(result.unique).toBe(true)
    expect(result.solution).toEqual(solved4)
  })

  it('returns solvable=false for unsolvable board', () => {
    const puzzle: Board = [
      [1, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
    const result = solve(puzzle)
    expect(result.solvable).toBe(false)
  })

  it('detects non-unique puzzle (multiple solutions)', () => {
    const puzzle: Board = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
    const result = solve(puzzle)
    expect(result.unique).toBe(false)
  })

  it('solves a 9x9 puzzle', () => {
    const puzzle: Board = solved9.map(row => [...row])
    puzzle[0][0] = 0
    const result = solve(puzzle)
    expect(result.solvable).toBe(true)
    expect(result.unique).toBe(true)
    expect(result.solution?.[0][0]).toBe(5)
  })
})
