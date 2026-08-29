export type SudokuSize = 4 | 5 | 6 | 7 | 8 | 9;
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export type Board = number[][];

export interface SolveResult {
  solvable: boolean;
  unique: boolean;
  solution?: Board;
}

export interface SudokuPuzzle {
  size: SudokuSize;
  difficulty: DifficultyLevel;
  puzzle: Board;
  solution: Board;
}

export interface SudokuValidator {
  isValidMove(board: Board, row: number, col: number, value: number): boolean;
  isSolved(board: Board): boolean;
  solve(board: Board): SolveResult;
}

export interface SudokuGenerator {
  generate(size: SudokuSize, difficulty: DifficultyLevel): SudokuPuzzle;
}

export interface CellPosition {
  row: number;
  col: number;
}

export interface GameState {
  puzzle: SudokuPuzzle | null;
  userBoard: Board;
  selectedCell: CellPosition | null;
  engineeringMode: boolean;
  isComplete: boolean;
  errors: Set<string>;
}
