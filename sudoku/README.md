# 🧩 Sudoku

A client-only Sudoku web application built with **Vue 3**, **TypeScript**, and **Tailwind CSS**. Supports configurable board sizes (4×4 to 9×9) and five difficulty levels, with a strictly unique-solution guarantee for every generated puzzle.

---

## Installation & Usage

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later

### Setup

```bash
# Clone or navigate to the project directory
cd sudoku

# Install dependencies
npm install
```

### Development

```bash
npm run dev
```

Opens a local dev server at `http://localhost:5173`.

### Production Build

```bash
npm run build
```

Output is placed in `dist/`. The entire app is static — no server required. Serve `dist/` with any static host (Nginx, GitHub Pages, Vercel, etc.).

```bash
# Preview the production build locally
npm run preview
```

### Tests

```bash
npm test          # Run all tests once (CI mode)
npm run test:watch  # Watch mode for development
```

---

## How to Play

| Action | Method |
|--------|--------|
| Select a cell | Click it |
| Enter a number | Click a number on the pad, or press **1–N** on keyboard |
| Clear a cell | Click **✕ Clear**, or press **Backspace / Delete / 0** |
| Move selection | **Arrow keys** |
| New game | Choose size & difficulty in the left panel, click **▶ New Game** |

Conflicting cells are highlighted in **red** in real time. A victory banner appears when the board is correctly completed.

### Engineering Mode (Secret)

Type the sequence **`sc1107`** anywhere on the page (no input field needed — just type on the keyboard). The complete solution appears in a dedicated panel on the **right side** of the board, without obscuring your current progress. Press **`Escape`** to exit Engineering Mode.

---

## Project Architecture

```
sudoku/
├── index.html                        # HTML entry point
├── vite.config.ts                    # Vite + Vitest config
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json                     # TypeScript strict mode
│
├── public/
│   └── favicon.svg
│
└── src/
    ├── main.ts                       # App bootstrap
    ├── App.vue                       # Root layout & keyboard handler
    ├── assets/
    │   └── main.css                  # Tailwind directives + neon utilities
    │
    ├── types/
    │   └── index.ts                  # Shared TypeScript interfaces & types
    │
    ├── logic/                        # Pure functions — no Vue dependency
    │   ├── gridRules.ts              # Board dimension & sub-grid rules
    │   ├── validator.ts              # Move validation, board solver
    │   └── generator.ts             # Puzzle generation
    │
    ├── composables/                  # Vue 3 Composition API hooks
    │   ├── useGame.ts                # Game state (board, selection, errors)
    │   └── useEngineeringMode.ts    # Secret keysequence detector
    │
    ├── components/
    │   ├── SudokuBoard.vue           # Main interactive board grid
    │   ├── SudokuCell.vue            # Individual cell rendering & styling
    │   ├── SolutionBoard.vue         # Read-only solution panel (Engineering Mode)
    │   ├── ControlPanel.vue          # Size / difficulty selectors + new-game button
    │   ├── NumberPad.vue             # Digit input buttons
    │   └── VictoryBanner.vue         # Win overlay modal
    │
    └── __tests__/
        ├── gridRules.test.ts         # 11 tests
        ├── validator.test.ts         # 15 tests
        └── generator.test.ts        # 19 tests  (total: 45)
```

### Layer Responsibilities

```
┌─────────────────────────────────────────┐
│            Vue Components               │  Rendering & user interaction
├─────────────────────────────────────────┤
│              Composables                │  Reactive state management
├─────────────────────────────────────────┤
│          Logic (pure TS)                │  All game rules & algorithms
│   gridRules ─── validator ─── generator │
└─────────────────────────────────────────┘
```

The logic layer has **zero Vue dependency** — it is plain TypeScript and fully unit-testable without a browser.

---

## Shared Types (`src/types/index.ts`)

```typescript
type SudokuSize      = 4 | 5 | 6 | 7 | 8 | 9
type DifficultyLevel = 1 | 2 | 3 | 4 | 5
type Board           = number[][]   // 0 = empty cell

interface SolveResult {
  solvable: boolean
  unique:   boolean
  solution?: Board
}

interface SudokuPuzzle {
  size:       SudokuSize
  difficulty: DifficultyLevel
  puzzle:     Board   // cells to show the player (0 = blank)
  solution:   Board   // fully solved board
}

// Contract interfaces (not instantiated at runtime — used as type constraints)
interface SudokuValidator {
  isValidMove(board: Board, row: number, col: number, value: number): boolean
  isSolved(board: Board): boolean
  solve(board: Board): SolveResult
}

interface SudokuGenerator {
  generate(size: SudokuSize, difficulty: DifficultyLevel): SudokuPuzzle
}

// UI state types
interface CellPosition {
  row: number
  col: number
}

interface GameState {
  puzzle:        SudokuPuzzle | null
  userBoard:     Board
  selectedCell:  CellPosition | null
  engineeringMode: boolean
  isComplete:    boolean
  errors:        Set<string>
}
```

---

## Grid Rules (`src/logic/gridRules.ts`)

Different board sizes use different constraint models:

| Size | Sub-grid | Box dimensions | Rule |
|------|----------|----------------|------|
| 4×4  | ✅ | 2×2 | Classic Sudoku |
| 5×5  | ❌ | —   | **Latin Square** (row + col only) |
| 6×6  | ✅ | 2×3 | Classic Sudoku |
| 7×7  | ❌ | —   | **Latin Square** (row + col only) |
| 8×8  | ✅ | 2×4 | Classic Sudoku |
| 9×9  | ✅ | 3×3 | Classic Sudoku |

**Latin Square** sizes (5 and 7) have no sub-grid constraint. Each number must appear exactly once in every row and every column, but there is no box grouping.

`getGridRule(size)` returns a `GridRule` object that drives both the validator and the board renderer (thick border placement).

---

## Generation Algorithm (`src/logic/generator.ts`)

Puzzle generation runs in two phases.

### Phase 1 — Fill a complete solution

```
fillBoard(board, size)
```

A recursive backtracking algorithm fills every cell of a blank board:

1. Scan left-to-right, top-to-bottom for the first empty cell.
2. Shuffle the candidate values `[1 … size]` randomly (Fisher-Yates).
3. For each candidate, call `isValidMove`. If valid, place it and recurse.
4. If no candidate works, return `false` to trigger backtracking.
5. When no empty cell remains, the board is complete — return `true`.

Shuffling candidate order at every step ensures a different random solution each call.

### Phase 2 — Remove clues while preserving uniqueness

```
removeClues(solution, size, targetClues)
```

1. Copy the full solution into a working puzzle.
2. Generate a list of all cell positions and shuffle it randomly.
3. Iterate through positions one by one:
   - Temporarily set the cell to `0` (blank).
   - Call `solve(puzzle)` to count solutions (capped at 2).
   - If `result.unique === true` → keep the cell blank (clue removed).
   - If `result.unique === false` → restore the original value.
4. Stop when the remaining clue count reaches `targetClues`.

This guarantees **exactly one solution** for every generated puzzle, regardless of difficulty.

### Clue count targets

Target clue count is computed as:

```
clues = max(⌈size × 1.5⌉, ⌊size² × ratio⌋)
```

| Level | Label  | Ratio | 9×9 clues (exact) |
|-------|--------|-------|-------------------|
| 1     | Novice | 0.65  | 52 |
| 2     | Easy   | 0.52  | 42 |
| 3     | Medium | 0.42  | 34 |
| 4     | Hard   | 0.34  | 27 |
| 5     | Expert | 0.27  | 21 |

The `⌈size × 1.5⌉` floor prevents degenerate puzzles on small boards where the ratio alone would leave too few clues to remain solvable.

---

## Validation Logic (`src/logic/validator.ts`)

### `isValidMove(board, row, col, value)`

Returns `true` if placing `value` at `(row, col)` violates no constraints. Checks three independent scopes, each skipping the target cell itself:

1. **Row uniqueness** — no other cell in the same row holds `value`.
2. **Column uniqueness** — no other cell in the same column holds `value`.
3. **Box uniqueness** — no other cell in the same sub-grid holds `value`. Skipped entirely for Latin Square sizes (5, 7).

Value `0` (empty) always returns `true`.

### `isSolved(board)`

1. Confirm every cell is non-zero (`isBoardFull`).
2. For every cell, temporarily blank it and call `isValidMove` with its own value. A board is solved only if every cell passes.

### `solve(board)` — Backtracking solver

Used internally during clue removal to verify uniqueness.

```
solve(board) → { solvable, unique, solution? }
```

- Scans for the first empty cell.
- Tries values `1 … size` in order. For each valid value, recurses.
- Counts solutions up to **2**. Stops early once two solutions are found (sufficient to determine non-uniqueness without exhaustive search).
- Returns:
  - `solvable: true` if at least one solution exists.
  - `unique: true` only when exactly one solution exists.
  - `solution`: the first found solution (if any).

Because the solver stops at 2, worst-case cost is bounded and suitable for real-time use during puzzle construction.

---

## Engineering Mode internals (`src/composables/useEngineeringMode.ts`)

A global `keydown` listener accumulates the last N typed characters into a rolling buffer (where N = length of the secret sequence). Whenever the buffer matches `sc1107`, `engineeringMode` is set to `true`. Pressing `Escape` resets it.

The composable is mounted/unmounted with the component lifecycle and cleans up its event listener automatically.

---

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Vue 3 | ^3.4 | UI framework (Composition API, `<script setup>`) |
| TypeScript | ^5.3 | Strict static typing |
| Tailwind CSS | ^3.4 | Utility-first styling |
| Vite | ^5.0 | Dev server & bundler |
| Vitest | ^1.2 | Unit test runner |
| @vue/test-utils | ^2.4 | Vue component testing utilities |
