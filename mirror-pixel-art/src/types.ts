export type Difficulty = 'easy' | 'normal' | 'hard';
export type SymmetryType = 'horizontal' | 'vertical' | 'diagonal-backslash' | 'diagonal-slash';

export interface Level {
  id: string;
  name: string;
  difficulty: Difficulty;
  width: number;
  height: number;
  symmetryType: SymmetryType;
  pattern: (number | null)[][]; // The template side
  palette: string[];
}

export interface GameState {
  completedLevels: string[];
  totalScore: number;
}
