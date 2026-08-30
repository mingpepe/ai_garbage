import type { LevelConfig, ValidationResult, ValidationIssue, NodeType } from '@/types/circuit';

export class GraphValidator {
  public static validate(level: LevelConfig): ValidationResult {
    const issues: ValidationIssue[] = [];
    const nodeMap = new Map(level.nodes.map(n => [n.id, n]));

    // Check for missing nodes in pipes
    for (const pipe of level.pipes) {
      const fromNode = nodeMap.get(pipe.from);
      const toNode = nodeMap.get(pipe.to);

      if (!fromNode || !toNode) {
        issues.push({
          type: 'DANGLING_PIPE',
          message: `Pipe "${pipe.id}" connects unknown node (${pipe.from} -> ${pipe.to})`,
          pipeIds: [pipe.id],
        });
        continue;
      }

      // SOURCE cannot have incoming pipes
      if (toNode.type === 'SOURCE') {
        issues.push({
          type: 'INVALID_SLOT',
          message: `Source node "${toNode.id}" cannot receive incoming pipes`,
          nodeIds: [toNode.id],
          pipeIds: [pipe.id],
        });
      }

      // TARGET cannot have outgoing pipes
      if (fromNode.type === 'TARGET') {
        issues.push({
          type: 'INVALID_SLOT',
          message: `Target node "${fromNode.id}" cannot have outgoing pipes`,
          nodeIds: [fromNode.id],
          pipeIds: [pipe.id],
        });
      }

      // Slot index bounds check
      const maxSlots = this.getMaxInputSlots(toNode.type);
      if (pipe.inputSlot < 0 || pipe.inputSlot >= maxSlots) {
        issues.push({
          type: 'INVALID_SLOT',
          message: `Node "${toNode.id}" of type "${toNode.type}" only accepts slot < ${maxSlots}, got ${pipe.inputSlot}`,
          nodeIds: [toNode.id],
          pipeIds: [pipe.id],
        });
      }
    }

    // Check for duplicate pipes entering the same input slot
    const slotUsage = new Map<string, string>();
    for (const pipe of level.pipes) {
      const key = `${pipe.to}:${pipe.inputSlot}`;
      if (slotUsage.has(key)) {
        issues.push({
          type: 'DUPLICATE_PIPE',
          message: `Multiple pipes connect to slot ${pipe.inputSlot} of node "${pipe.to}"`,
          nodeIds: [pipe.to],
          pipeIds: [slotUsage.get(key)!, pipe.id],
        });
      } else {
        slotUsage.set(key, pipe.id);
      }
    }

    // Cycle detection using DFS with 3-color marking
    const cycle = this.detectCycle(level);
    if (cycle) {
      issues.push({
        type: 'CYCLE',
        message: `Cycle detected in circuit graph: ${cycle.join(' -> ')}`,
        nodeIds: cycle,
      });
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  public static getMaxInputSlots(type: NodeType): number {
    switch (type) {
      case 'SOURCE':
        return 0;
      case 'NOT':
      case 'TARGET':
        return 1;
      case 'AND':
      case 'OR':
      case 'XOR':
        return 2;
    }
  }

  private static detectCycle(level: LevelConfig): string[] | null {
    const adj = new Map<string, string[]>();
    for (const n of level.nodes) {
      adj.set(n.id, []);
    }
    for (const p of level.pipes) {
      if (adj.has(p.from)) {
        adj.get(p.from)!.push(p.to);
      }
    }

    // 0 = unvisited, 1 = visiting, 2 = visited
    const visited = new Map<string, number>();
    const parent = new Map<string, string>();

    for (const n of level.nodes) {
      visited.set(n.id, 0);
    }

    const dfs = (nodeId: string): string[] | null => {
      visited.set(nodeId, 1);
      const neighbors = adj.get(nodeId) || [];

      for (const next of neighbors) {
        if (visited.get(next) === 1) {
          // Cycle found, reconstruct path
          const path = [next, nodeId];
          let curr = nodeId;
          while (curr && parent.get(curr) && parent.get(curr) !== next) {
            curr = parent.get(curr)!;
            path.push(curr);
          }
          path.reverse();
          path.push(next);
          return path;
        }
        if (visited.get(next) === 0) {
          parent.set(next, nodeId);
          const found = dfs(next);
          if (found) return found;
        }
      }

      visited.set(nodeId, 2);
      return null;
    };

    for (const n of level.nodes) {
      if (visited.get(n.id) === 0) {
        const cycle = dfs(n.id);
        if (cycle) return cycle;
      }
    }

    return null;
  }
}
