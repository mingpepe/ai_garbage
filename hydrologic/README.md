# 💧 HydroLogic: Water-Pipe Circuit Logic Odyssey

An educational puzzle game designed for students and learners to master **Boolean algebra**, **discrete logic circuits**, and **computer arithmetic** through tactile, intuitive **fluid-mechanics metaphors**.

Built with **React 18+**, **TypeScript (strict mode)**, **Tailwind CSS**, **Zustand**, and **Vitest**.

---

## 🌊 1. Physical Fluid Metaphors & Logical Core

Every discrete circuit logic gate is physically mapped to a tactile hydrodynamic mechanism:

| Logic Node | Physical Metaphor | Active State ($1$ / True) | Inactive State ($0$ / False) |
| :--- | :--- | :--- | :--- |
| **SOURCE (Input)** | **Rotary Water Valve** | Blue glowing pressurized water with bubbles | Dark slate dry pipe |
| **TARGET (Output)** | **Agricultural Farmland / Cistern** | Blooming sunflowers, lush carrots, filled reservoir | Dry cracked soil, wilted sprout, empty tank |
| **AND Gate** | **Dual-Impeller Lock Gate** | Both turbines spin under water pressure to lift the center gate | Single or no pressure locks the gate mechanism |
| **OR Gate** | **Y-Shaped Merging Funnel** | Smooth fluid confluence if any inlet has pressure | Dry conduit with no throughput |
| **NOT Gate** | **Inverted Buoy Siphon Tank** | Incoming flow fills tank, floats buoy to seal bottom drain ($0$) | Empty tank drops buoy, opening reserve drain ($1$) |
| **XOR Gate** | **Rocker Differential Balance** | Unequal pressure tilts the rocker arm to align the passage ($1$) | Balanced pressure (both ON or both OFF) blocks exit ($0$) |

---

## 🏛️ 2. Architectural Modules

```
hydrologic/
├── public/
│   └── favicon.svg                    # Vector droplet logo
├── src/
│   ├── types/
│   │   └── circuit.ts                 # Strict TypeScript schemas & interfaces
│   ├── engine/                        # Pure TypeScript Logic & Graph Core
│   │   ├── CircuitEngine.ts           # Kahn's Topological Sorting & DAG evaluator
│   │   ├── GraphValidator.ts          # DFS 3-color Cycle & Port Integrity checks
│   │   └── LevelSolver.ts             # Brute-force 2^N SAT solver & Hint Generator
│   ├── levels/
│   │   └── levelsData.ts              # 10-Level campaign across 3 pedagogical tiers
│   ├── store/
│   │   └── gameStore.ts               # Reactive Zustand game state management
│   ├── utils/
│   │   └── audio.ts                   # Procedural Web Audio API sound synthesizer
│   ├── components/
│   │   ├── board/                     # Visual Pipeline & Circuit Board
│   │   │   ├── GameBoard.tsx          # SVG canvas with reactive circuit rendering
│   │   │   ├── PipeRenderer.tsx       # Bézier SVG pipes with pulse dashoffset flow
│   │   │   └── GateNode.tsx           # Standard circuit logic gate contours + fluid mechanisms
│   │   ├── hud/                       # Educational HUD & Modals
│   │   │   ├── GameHeader.tsx         # Top bar with controls, step counter & par
│   │   │   ├── LevelSelector.tsx      # Campaign map with star ratings (1-3 stars)
│   │   │   └── VictoryModal.tsx       # Non-blocking victory card with pedagogical takeaways
│   │   └── fx/
│   │       └── WaterSplashCanvas.tsx  # HTML5 Canvas fluid particle physics & confetti
│   ├── App.tsx                        # Main application layout & keyboard controls
│   └── main.tsx                       # React application bootstrap
└── src/__tests__/
    ├── engine.test.ts                 # Unit tests for all 6 gate types & DAG evaluation
    ├── validator.test.ts              # Cycle detection & connection validation tests
    └── solver.test.ts                 # SAT solvability test for all 10 campaign levels
```

---

## 🚀 3. Installation & Getting Started

### Prerequisites
- **Node.js**: v18.0+
- **npm**: v9.0+

### Setup
```bash
# Navigate to the project directory
cd hydrologic

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build
```bash
npm run build
npm run preview
```

### Automated Testing
```bash
# Run Vitest test suite
npm test
```

---

## 🎓 4. Pedagogical Level Progression (10 Levels)

### Tier 1: Foundations (LV 01 ~ LV 04)
- **LV 01: The First Spring**: Introduction to Rotary Valves and 0/1 states.
- **LV 02: Twin Currents**: Dual-Impeller AND Gate ($1 \text{ AND } 1 = 1$).
- **LV 03: River Confluence**: Y-Funnel OR Gate ($1 \text{ OR } 0 = 1$).
- **LV 04: The Inverted Siphon**: Inverted Buoy NOT Gate ($\text{NOT } 0 = 1$).

### Tier 2: Intermediate Compound Networks (LV 05 ~ LV 07)
- **LV 05: Meadow Irrigation**: Compound expression combining AND and OR gates.
- **LV 06: Cactus & Carrot Sanctuary**: Multi-target routing (Dry Cactus = 0, Wet Carrot = 1).
- **LV 07: The Teeter-Totter Aqueduct**: Rocker Differential Balance XOR Gate.

### Tier 3: Applied Real-World Logic (LV 08 ~ LV 10)
- **LV 08: Automated Greenhouse Alert**: Emergency monitoring alarm with inverted sensor logic.
- **LV 09: Airlock Decompression Interlock**: Fail-safe decompression safety interlock using a universal NAND gate.
- **LV 10: The Hydraulic Half-Adder**: Computing binary arithmetic with water ($\text{Sum} = A \text{ XOR } B$, $\text{Carry} = A \text{ AND } B$) proving $1 + 1 = 10_2$.

---

## 🛠️ 5. Controls & Features

- **Interactive Valves**: Click rotary valves on the board or press number keys `1` to `9` on your keyboard.
- **AI Solver Hint**: Click the 💡 Lightbulb icon to compute the nearest valid path to victory using the integrated SAT solver.
- **0/1 Logic Badges**: Toggle digital logic values on all gates and pipes for beginner clarity.
- **Procedural Sound**: Synthetic fluid and mechanical sound effects powered by the Web Audio API with zero external audio dependencies.
