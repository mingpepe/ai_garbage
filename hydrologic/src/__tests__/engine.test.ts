import { describe, it, expect } from 'vitest';
import { CircuitEngine } from '@/engine/CircuitEngine';
import type { LevelConfig } from '@/types/circuit';

describe('CircuitEngine logic evaluations', () => {
  it('evaluates single SOURCE to TARGET correctly', () => {
    const level: LevelConfig = {
      levelId: 'test-1',
      title: 'Test',
      chapter: 'Test',
      tier: 1,
      description: '',
      hint: '',
      pedagogicalGoal: '',
      gridSize: { cols: 4, rows: 2 },
      nodes: [
        { id: 'src', type: 'SOURCE', position: { x: 0, y: 0 } },
        { id: 'tgt', type: 'TARGET', position: { x: 2, y: 0 }, targetState: true },
      ],
      pipes: [{ id: 'p1', from: 'src', to: 'tgt', inputSlot: 0 }],
    };

    const resFalse = CircuitEngine.evaluate(level, { src: false });
    expect(resFalse.nodeStates['tgt']).toBe(false);
    expect(resFalse.pipeFlows['p1']).toBe(false);
    expect(resFalse.isVictory).toBe(false);

    const resTrue = CircuitEngine.evaluate(level, { src: true });
    expect(resTrue.nodeStates['tgt']).toBe(true);
    expect(resTrue.pipeFlows['p1']).toBe(true);
    expect(resTrue.isVictory).toBe(true);
  });

  it('evaluates AND gate truth table (0,0 -> 0; 1,0 -> 0; 0,1 -> 0; 1,1 -> 1)', () => {
    const level: LevelConfig = {
      levelId: 'test-and',
      title: 'AND Test',
      chapter: 'Test',
      tier: 1,
      description: '',
      hint: '',
      pedagogicalGoal: '',
      gridSize: { cols: 4, rows: 3 },
      nodes: [
        { id: 'a', type: 'SOURCE', position: { x: 0, y: 0 } },
        { id: 'b', type: 'SOURCE', position: { x: 0, y: 2 } },
        { id: 'and', type: 'AND', position: { x: 2, y: 1 } },
        { id: 'out', type: 'TARGET', position: { x: 3, y: 1 }, targetState: true },
      ],
      pipes: [
        { id: 'p1', from: 'a', to: 'and', inputSlot: 0 },
        { id: 'p2', from: 'b', to: 'and', inputSlot: 1 },
        { id: 'p3', from: 'and', to: 'out', inputSlot: 0 },
      ],
    };

    expect(CircuitEngine.evaluate(level, { a: false, b: false }).nodeStates['and']).toBe(false);
    expect(CircuitEngine.evaluate(level, { a: true, b: false }).nodeStates['and']).toBe(false);
    expect(CircuitEngine.evaluate(level, { a: false, b: true }).nodeStates['and']).toBe(false);
    expect(CircuitEngine.evaluate(level, { a: true, b: true }).nodeStates['and']).toBe(true);
    expect(CircuitEngine.evaluate(level, { a: true, b: true }).isVictory).toBe(true);
  });

  it('evaluates OR gate truth table (0,0 -> 0; 1,0 -> 1; 0,1 -> 1; 1,1 -> 1)', () => {
    const level: LevelConfig = {
      levelId: 'test-or',
      title: 'OR Test',
      chapter: 'Test',
      tier: 1,
      description: '',
      hint: '',
      pedagogicalGoal: '',
      gridSize: { cols: 4, rows: 3 },
      nodes: [
        { id: 'a', type: 'SOURCE', position: { x: 0, y: 0 } },
        { id: 'b', type: 'SOURCE', position: { x: 0, y: 2 } },
        { id: 'or', type: 'OR', position: { x: 2, y: 1 } },
        { id: 'out', type: 'TARGET', position: { x: 3, y: 1 } },
      ],
      pipes: [
        { id: 'p1', from: 'a', to: 'or', inputSlot: 0 },
        { id: 'p2', from: 'b', to: 'or', inputSlot: 1 },
        { id: 'p3', from: 'or', to: 'out', inputSlot: 0 },
      ],
    };

    expect(CircuitEngine.evaluate(level, { a: false, b: false }).nodeStates['or']).toBe(false);
    expect(CircuitEngine.evaluate(level, { a: true, b: false }).nodeStates['or']).toBe(true);
    expect(CircuitEngine.evaluate(level, { a: false, b: true }).nodeStates['or']).toBe(true);
    expect(CircuitEngine.evaluate(level, { a: true, b: true }).nodeStates['or']).toBe(true);
  });

  it('evaluates NOT gate inversion (0 -> 1; 1 -> 0)', () => {
    const level: LevelConfig = {
      levelId: 'test-not',
      title: 'NOT Test',
      chapter: 'Test',
      tier: 1,
      description: '',
      hint: '',
      pedagogicalGoal: '',
      gridSize: { cols: 3, rows: 1 },
      nodes: [
        { id: 'a', type: 'SOURCE', position: { x: 0, y: 0 } },
        { id: 'not', type: 'NOT', position: { x: 1, y: 0 } },
        { id: 'out', type: 'TARGET', position: { x: 2, y: 0 } },
      ],
      pipes: [
        { id: 'p1', from: 'a', to: 'not', inputSlot: 0 },
        { id: 'p2', from: 'not', to: 'out', inputSlot: 0 },
      ],
    };

    expect(CircuitEngine.evaluate(level, { a: false }).nodeStates['not']).toBe(true);
    expect(CircuitEngine.evaluate(level, { a: true }).nodeStates['not']).toBe(false);
  });

  it('evaluates XOR gate truth table (0,0 -> 0; 1,0 -> 1; 0,1 -> 1; 1,1 -> 0)', () => {
    const level: LevelConfig = {
      levelId: 'test-xor',
      title: 'XOR Test',
      chapter: 'Test',
      tier: 1,
      description: '',
      hint: '',
      pedagogicalGoal: '',
      gridSize: { cols: 4, rows: 3 },
      nodes: [
        { id: 'a', type: 'SOURCE', position: { x: 0, y: 0 } },
        { id: 'b', type: 'SOURCE', position: { x: 0, y: 2 } },
        { id: 'xor', type: 'XOR', position: { x: 2, y: 1 } },
        { id: 'out', type: 'TARGET', position: { x: 3, y: 1 } },
      ],
      pipes: [
        { id: 'p1', from: 'a', to: 'xor', inputSlot: 0 },
        { id: 'p2', from: 'b', to: 'xor', inputSlot: 1 },
        { id: 'p3', from: 'xor', to: 'out', inputSlot: 0 },
      ],
    };

    expect(CircuitEngine.evaluate(level, { a: false, b: false }).nodeStates['xor']).toBe(false);
    expect(CircuitEngine.evaluate(level, { a: true, b: false }).nodeStates['xor']).toBe(true);
    expect(CircuitEngine.evaluate(level, { a: false, b: true }).nodeStates['xor']).toBe(true);
    expect(CircuitEngine.evaluate(level, { a: true, b: true }).nodeStates['xor']).toBe(false);
  });
});
