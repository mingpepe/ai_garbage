export type NodeType = 'SOURCE' | 'TARGET' | 'AND' | 'OR' | 'NOT' | 'XOR';

export type TargetCropType = 'CARROT' | 'SUNFLOWER' | 'TANK';

export interface GridCoord {
  x: number;
  y: number;
}

export interface NodeSchema {
  id: string;
  type: NodeType;
  position: GridCoord;
  state?: boolean;
  targetState?: boolean;
  locked?: boolean;
  label?: string;
  targetType?: TargetCropType;
}

export interface PipeSchema {
  id: string;
  from: string;
  to: string;
  inputSlot: number;
}

export interface LevelConfig {
  levelId: string;
  title: string;
  chapter: string;
  tier: 1 | 2 | 3;
  description: string;
  hint: string;
  pedagogicalGoal: string;
  gridSize: { cols: number; rows: number };
  nodes: NodeSchema[];
  pipes: PipeSchema[];
  parSteps?: number;
}

export interface CircuitEvaluation {
  nodeStates: Record<string, boolean>;
  pipeFlows: Record<string, boolean>;
  isVictory: boolean;
  targetMatches: Record<string, boolean>;
  executionOrder: string[];
}

export interface LevelSolution {
  satisfiable: boolean;
  solutions: Record<string, boolean>[];
  minSteps: number;
}

export interface ValidationIssue {
  type: 'CYCLE' | 'DANGLING_PIPE' | 'INVALID_SLOT' | 'DUPLICATE_PIPE' | 'DISCONNECTED_TARGET' | 'MISSING_SOURCE';
  message: string;
  nodeIds?: string[];
  pipeIds?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}
