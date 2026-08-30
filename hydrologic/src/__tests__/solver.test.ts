import { describe, it, expect } from 'vitest';
import { CAMPAIGN_LEVELS } from '@/levels/levelsData';
import { LevelSolver } from '@/engine/LevelSolver';
import { GraphValidator } from '@/engine/GraphValidator';

describe('SAT Solver & Level Integrity for all 10 Campaign Levels', () => {
  it('contains exactly 10 levels across 3 tiers', () => {
    expect(CAMPAIGN_LEVELS).toHaveLength(10);
    const tier1 = CAMPAIGN_LEVELS.filter(l => l.tier === 1);
    const tier2 = CAMPAIGN_LEVELS.filter(l => l.tier === 2);
    const tier3 = CAMPAIGN_LEVELS.filter(l => l.tier === 3);

    expect(tier1).toHaveLength(4); // LV 01 ~ LV 04
    expect(tier2).toHaveLength(3); // LV 05 ~ LV 07
    expect(tier3).toHaveLength(3); // LV 08 ~ LV 10
  });

  for (const level of CAMPAIGN_LEVELS) {
    it(`validates graph integrity for Level ${level.levelId} (${level.title})`, () => {
      const validation = GraphValidator.validate(level);
      expect(validation.isValid, `Validation errors in ${level.title}: ${JSON.stringify(validation.issues)}`).toBe(true);
    });

    it(`guarantees SAT solvability for Level ${level.levelId} (${level.title})`, () => {
      const solution = LevelSolver.solve(level);
      expect(solution.satisfiable, `Level ${level.title} has NO satisfying solution!`).toBe(true);
      expect(solution.solutions.length).toBeGreaterThan(0);
    });
  }
});
