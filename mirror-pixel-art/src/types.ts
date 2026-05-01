export type Difficulty = 'easy' | 'normal' | 'hard';
export type SymmetryType = 'horizontal' | 'vertical' | 'diagonal-backslash' | 'diagonal-slash';
export type CellShape = 'square' | 'tri-tl' | 'tri-tr' | 'tri-bl' | 'tri-br';

export interface Level {
  id: string;
  name: string;
  difficulty: Difficulty;
  width: number;
  height: number;
  symmetryType: SymmetryType;
  pattern: (number | null)[][]; // The template side
  shapes?: (CellShape | null)[][]; // Optional shapes for each cell
  palette: string[];
}

export interface GameState {
  completedLevels: string[];
  totalScore: number;
}
