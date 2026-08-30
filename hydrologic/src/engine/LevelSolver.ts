import type { LevelConfig, LevelSolution } from '@/types/circuit';
import { CircuitEngine } from './CircuitEngine';

export class LevelSolver {
  /**
   * Brute-force SAT solver testing all 2^N combinations for non-locked inputs.
   */
  public static solve(level: LevelConfig): LevelSolution {
    const freeSources = level.nodes.filter(n => n.type === 'SOURCE' && !n.locked);
    const lockedSources = level.nodes.filter(n => n.type === 'SOURCE' && n.locked);

    const lockedDefaults: Record<string, boolean> = {};
    for (const ls of lockedSources) {
      lockedDefaults[ls.id] = ls.state ?? false;
    }

    const n = freeSources.length;
    const totalCombinations = 1 << n;
    const winningSolutions: Record<string, boolean>[] = [];

    const initialState: Record<string, boolean> = {};
    for (const s of level.nodes.filter(node => node.type === 'SOURCE')) {
      initialState[s.id] = s.state ?? false;
    }

    for (let i = 0; i < totalCombinations; i++) {
      const currentInputs: Record<string, boolean> = { ...lockedDefaults };

      for (let bit = 0; bit < n; bit++) {
        const source = freeSources[bit];
        currentInputs[source.id] = Boolean((i >> bit) & 1);
      }

      try {
        const evaluation = CircuitEngine.evaluate(level, currentInputs);
        if (evaluation.isVictory) {
          winningSolutions.push(currentInputs);
        }
      } catch {
        // Skip invalid evaluation states during search
      }
    }

    let minSteps = Infinity;
    for (const sol of winningSolutions) {
      let diff = 0;
      for (const fs of freeSources) {
        if (Boolean(sol[fs.id]) !== Boolean(initialState[fs.id])) {
          diff++;
        }
      }
      if (diff < minSteps) {
        minSteps = diff;
      }
    }

    return {
      satisfiable: winningSolutions.length > 0,
      solutions: winningSolutions,
      minSteps: minSteps === Infinity ? 0 : minSteps,
    };
  }

  /**
   * Provides a single step hint: which valve to toggle to move closer to the closest solution.
   */
  public static getNextStepHint(
    level: LevelConfig,
    currentInputs: Record<string, boolean>
  ): { targetNodeId: string; desiredState: boolean; explanation: string } | null {
    const solutionResult = this.solve(level);
    if (!solutionResult.satisfiable || solutionResult.solutions.length === 0) {
      return null;
    }

    const freeSources = level.nodes.filter(n => n.type === 'SOURCE' && !n.locked);

    let bestSol: Record<string, boolean> | null = null;
    let minDiff = Infinity;

    for (const sol of solutionResult.solutions) {
      let diff = 0;
      for (const fs of freeSources) {
        if (Boolean(sol[fs.id]) !== Boolean(currentInputs[fs.id] ?? fs.state ?? false)) {
          diff++;
        }
      }
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
        bestSol = sol;
      }
    }

    if (!bestSol) return null;

    for (const fs of freeSources) {
      const cur = Boolean(currentInputs[fs.id] ?? fs.state ?? false);
      const target = Boolean(bestSol[fs.id]);
      if (cur !== target) {
        const label = fs.label || fs.id;
        return {
          targetNodeId: fs.id,
          desiredState: target,
          explanation: target
            ? `Turn ON valve "${label}" to let water flow into the circuit.`
            : `Turn OFF valve "${label}" to stop unnecessary flow.`,
        };
      }
    }

    return null;
  }
}
