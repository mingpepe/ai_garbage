import { describe, it, expect } from 'vitest'
import { getGridRule, getBoxOrigin, cloneBoard, createEmptyBoard } from '@/logic/gridRules'

describe('getGridRule', () => {
  it('returns 2x2 sub-grids for size 4', () => {
    const rule = getGridRule(4)
    expect(rule).toEqual({ hasSubGrids: true, boxRows: 2, boxCols: 2 })
  })

  it('returns no sub-grids for size 5 (Latin Square)', () => {
    const rule = getGridRule(5)
    expect(rule.hasSubGrids).toBe(false)
  })

  it('returns 2x3 sub-grids for size 6', () => {
    const rule = getGridRule(6)
    expect(rule).toEqual({ hasSubGrids: true, boxRows: 2, boxCols: 3 })
  })

  it('returns no sub-grids for size 7 (Latin Square)', () => {
    const rule = getGridRule(7)
    expect(rule.hasSubGrids).toBe(false)
  })

  it('returns 2x4 sub-grids for size 8', () => {
    const rule = getGridRule(8)
    expect(rule).toEqual({ hasSubGrids: true, boxRows: 2, boxCols: 4 })
  })

  it('returns 3x3 sub-grids for size 9', () => {
    const rule = getGridRule(9)
    expect(rule).toEqual({ hasSubGrids: true, boxRows: 3, boxCols: 3 })
  })
})

describe('getBoxOrigin', () => {
  it('returns correct origin for 9x9 top-left box', () => {
    const rule = getGridRule(9)
    expect(getBoxOrigin(1, 2, rule)).toEqual({ boxRow: 0, boxCol: 0 })
  })

  it('returns correct origin for 9x9 bottom-right box', () => {
    const rule = getGridRule(9)
    expect(getBoxOrigin(8, 8, rule)).toEqual({ boxRow: 6, boxCol: 6 })
  })

  it('returns correct origin for 6x6 second row, third col box', () => {
    const rule = getGridRule(6)
    expect(getBoxOrigin(3, 4, rule)).toEqual({ boxRow: 2, boxCol: 3 })
  })
})

describe('cloneBoard', () => {
  it('creates a deep copy', () => {
    const board = [[1, 2], [3, 4]]
    const clone = cloneBoard(board)
    clone[0][0] = 99
    expect(board[0][0]).toBe(1)
  })
})

describe('createEmptyBoard', () => {
  it('creates an NxN board filled with zeros', () => {
    const board = createEmptyBoard(4)
    expect(board).toHaveLength(4)
    board.forEach(row => {
      expect(row).toHaveLength(4)
      row.forEach(cell => expect(cell).toBe(0))
    })
  })
})
