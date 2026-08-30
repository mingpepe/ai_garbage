import type { LevelConfig, CircuitEvaluation, NodeType } from '@/types/circuit';
import { GraphValidator } from './GraphValidator';

export class CircuitEngine {
  /**
   * Performs Kahn's algorithm to generate topological sort order.
   * Throws an error if cycle exists.
   */
  public static getTopologicalOrder(level: LevelConfig): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const node of level.nodes) {
      inDegree.set(node.id, 0);
      adj.set(node.id, []);
    }

    for (const pipe of level.pipes) {
      if (inDegree.has(pipe.to)) {
        inDegree.set(pipe.to, (inDegree.get(pipe.to) || 0) + 1);
      }
      if (adj.has(pipe.from)) {
        adj.get(pipe.from)!.push(pipe.to);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      const neighbors = adj.get(current) || [];
      for (const neighbor of neighbors) {
        const newDeg = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (order.length !== level.nodes.length) {
      throw new Error('Cannot evaluate circuit: Graph contains a cycle.');
    }

    return order;
  }

  /**
   * Evaluates the circuit DAG given an input state dictionary for SOURCE nodes.
   */
  public static evaluate(
    level: LevelConfig,
    sourceInputs: Record<string, boolean>
  ): CircuitEvaluation {
    const validation = GraphValidator.validate(level);
    if (!validation.isValid) {
      const cycleIssue = validation.issues.find(i => i.type === 'CYCLE');
      if (cycleIssue) {
        throw new Error(`Circuit validation failed: ${cycleIssue.message}`);
      }
    }

    const order = this.getTopologicalOrder(level);
    const nodeMap = new Map(level.nodes.map(n => [n.id, n]));
    const nodeStates: Record<string, boolean> = {};

    // Group incoming pipes by node id
    const incomingPipes = new Map<string, { from: string; slot: number }[]>();
    for (const node of level.nodes) {
      incomingPipes.set(node.id, []);
    }
    for (const pipe of level.pipes) {
      if (incomingPipes.has(pipe.to)) {
        incomingPipes.get(pipe.to)!.push({ from: pipe.from, slot: pipe.inputSlot });
      }
    }

    // Evaluate in topological order
    for (const nodeId of order) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      if (node.type === 'SOURCE') {
        const isSet = sourceInputs[nodeId] !== undefined;
        nodeStates[nodeId] = isSet ? sourceInputs[nodeId] : (node.state ?? false);
        continue;
      }

      const inputs = incomingPipes.get(nodeId) || [];
      const slotValues: boolean[] = [];

      for (const inp of inputs) {
        slotValues[inp.slot] = nodeStates[inp.from] ?? false;
      }

      nodeStates[nodeId] = this.evaluateGate(node.type, slotValues);
    }

    // Calculate pipe flow states
    const pipeFlows: Record<string, boolean> = {};
    for (const pipe of level.pipes) {
      pipeFlows[pipe.id] = nodeStates[pipe.from] ?? false;
    }

    // Check target matching
    const targetMatches: Record<string, boolean> = {};
    let allTargetsMatched = true;
    const targetNodes = level.nodes.filter(n => n.type === 'TARGET');

    for (const target of targetNodes) {
      const actualState = nodeStates[target.id] ?? false;
      const expectedState = target.targetState ?? true;
      const matches = actualState === expectedState;
      targetMatches[target.id] = matches;
      if (!matches) {
        allTargetsMatched = false;
      }
    }

    return {
      nodeStates,
      pipeFlows,
      isVictory: targetNodes.length > 0 && allTargetsMatched,
      targetMatches,
      executionOrder: order,
    };
  }

  private static evaluateGate(type: NodeType, slotValues: boolean[]): boolean {
    const s0 = Boolean(slotValues[0]);
    const s1 = Boolean(slotValues[1]);

    switch (type) {
      case 'AND':
        return s0 && s1;
      case 'OR':
        return s0 || s1;
      case 'NOT':
        return !s0;
      case 'XOR':
        return s0 !== s1;
      case 'TARGET':
        return s0;
      case 'SOURCE':
      default:
        return s0;
    }
  }
}
