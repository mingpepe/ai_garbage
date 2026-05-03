export type CommandType = 'forward' | 'left' | 'right' | 'turnAround' | 'loop' | 'if' | 'ifLeft' | 'ifRight' | 'whileNotGoal' | 'whileFrontClear' | 'markPosition' | 'returnToMark' | 'callFuncA' | 'callFuncB' | 'break';

export const ALL_COMMAND_TYPES: CommandType[] = [
  'forward', 'left', 'right', 'turnAround',
  'loop', 'whileNotGoal', 'whileFrontClear', 'if', 'ifLeft', 'ifRight',
  'markPosition', 'returnToMark',
  'callFuncA', 'callFuncB', 'break'
];

export interface Command {
  id: string;
  type: CommandType;
  value?: number; // count for loop
  subCommands?: Command[]; 
  trueBranch?: Command[];  
  falseBranch?: Command[]; 
}

export interface Position {
  x: number;
  y: number;
  dir: number; // 0: North, 1: East, 2: South, 3: West
}

export interface Portal {
  id: string;
  posA: { x: number; y: number };
  posB: { x: number; y: number };
  color: string;
}

export interface TriggerButton {
  x: number;
  y: number;
  setId: number;
  color: string;
}

export interface TriggerDoor {
  x: number;
  y: number;
  setId: number;
  color: string;
}

export interface Level {
  id: string;
  name: string;
  gridSize: [number, number]; 
  start: Position;
  goal: { x: number; y: number };
  allowedCommands: CommandType[];
  obstacles: [number, number][];
  waterTiles?: { x: number; y: number }[];
  boats?: { x: number; y: number }[];
  planes?: { x: number; y: number }[];
  collectibles?: { x: number; y: number }[];
  keys?: { x: number; y: number; color?: string }[];
  doors?: { x: number; y: number; keyRequired: boolean; color?: string }[];
  portals?: Portal[];
  rocks?: { x: number; y: number }[];
  triggerButtons?: TriggerButton[];
  triggerDoors?: TriggerDoor[];
}

export interface LevelProgress {
  completed: boolean;
}

export interface GameStatus {
  state: 'idle' | 'executing' | 'stepping' | 'success' | 'failed' | 'stopped';
  message: string;
}
