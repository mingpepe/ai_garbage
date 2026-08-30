import { describe, it, expect } from 'vitest';
import { GraphValidator } from '@/engine/GraphValidator';
import type { LevelConfig } from '@/types/circuit';

describe('GraphValidator', () => {
  it('detects simple 2-node cycles', () => {
    const cyclicLevel: LevelConfig = {
      levelId: 'cycle-2',
      title: 'Cycle',
      chapter: 'Test',
      tier: 1,
      description: '',
      hint: '',
      pedagogicalGoal: '',
      gridSize: { cols: 3, rows: 2 },
      nodes: [
        { id: 'n1', type: 'AND', position: { x: 0, y: 0 } },
        { id: 'n2', type: 'AND', position: { x: 1, y: 0 } },
      ],
      pipes: [
        { id: 'p1', from: 'n1', to: 'n2', inputSlot: 0 },
        { id: 'p2', from: 'n2', to: 'n1', inputSlot: 0 },
      ],
    };

    const res = GraphValidator.validate(cyclicLevel);
    expect(res.isValid).toBe(false);
    expect(res.issues.some(i => i.type === 'CYCLE')).toBe(true);
  });

  it('detects dangling pipes with non-existent node IDs', () => {
    const brokenLevel: LevelConfig = {
      levelId: 'dangling',
      title: 'Dangling',
      chapter: 'Test',
      tier: 1,
      description: '',
      hint: '',
      pedagogicalGoal: '',
      gridSize: { cols: 3, rows: 2 },
      nodes: [
        { id: 'n1', type: 'SOURCE', position: { x: 0, y: 0 } },
      ],
      pipes: [
        { id: 'p1', from: 'n1', to: 'missing_target', inputSlot: 0 },
      ],
    };

    const res = GraphValidator.validate(brokenLevel);
    expect(res.isValid).toBe(false);
    expect(res.issues.some(i => i.type === 'DANGLING_PIPE')).toBe(true);
  });

  it('detects invalid input slot indexes', () => {
    const invalidSlotLevel: LevelConfig = {
      levelId: 'slot-overflow',
      title: 'Slot',
      chapter: 'Test',
      tier: 1,
      description: '',
      hint: '',
      pedagogicalGoal: '',
      gridSize: { cols: 3, rows: 2 },
      nodes: [
        { id: 'src', type: 'SOURCE', position: { x: 0, y: 0 } },
        { id: 'not', type: 'NOT', position: { x: 1, y: 0 } },
      ],
      // NOT gate only has slot 0, slot 1 is invalid!
      pipes: [
        { id: 'p1', from: 'src', to: 'not', inputSlot: 1 },
      ],
    };

    const res = GraphValidator.validate(invalidSlotLevel);
    expect(res.isValid).toBe(false);
    expect(res.issues.some(i => i.type === 'INVALID_SLOT')).toBe(true);
  });
});
