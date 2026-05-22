# 🤖 RoboCode: Level Editor Guide

This guide details how to create brand new logic challenge levels for "RoboCode" through the visual interface or by editing the `src/utils/levels.json` file. It aligns 100% with the game's actual TypeScript type system and execution engine.

---

## 1. Visual Editor (Map Workshop)
The game features a built-in **"Map Workshop"** allowing you to draw maps without writing code:

1.  **Access:** On the left side of the main game screen, inside the "Stats Panel" next to the **Progress** display, click the **⚙️ Level Editor** button.
    > [!IMPORTANT]
    > **Developer Note:** The Level Editor button is protected by the `engineeringMode` flag. In the codebase (`src/stores/game.ts`), `engineeringMode` is initialized as `ref(false)`. To access this button in the UI, you must set `engineeringMode.value = true` (e.g., using Vue Devtools, or by editing the source code during development).
2.  **Settings Panel:** In the editor sidebar, you can configure the map's Title, Width, Height, Fog of War Radius, and **Allowed Commands**. Toggle the command buttons to restrict which commands the player can drag-and-drop in this specific level.
3.  **Clear Map:** Use the "Clear Map" button at the top to instantly remove all items, obstacles, and triggers from the current level.
4.  **Draw Map:** Select a tool from the top toolbar and click on the grid to place the element.
5.  **Toolbar Icons:**
    *   **Wall (Obstacle)**: solid obstacle, blocks the robot (unless carrying a Plane) and rocks.
    *   **Water**: liquid hazard, requires **Boat** or **Plane** for the robot to cross. Rocks can never cross water.
    *   **Boat**: item that allows the robot (but not rocks) to cross water.
    *   **Plane**: item that allows the robot (but not rocks) to fly over both walls and water.
    *   **Star**: Energy Stone. **All Stars must be collected** to win.
    *   **Blue/Red/Yellow Key**: traditional lock-and-key system. Finding the key opens all doors of that color.
    *   **Blue/Red/Yellow Door**: doors locked by keys of the same color.
    *   **Rock**: pushable box that interacts with the robot and buttons.
    *   **Button**: pressure plate (momentary trigger) linked to T-Doors of the same Set ID.
    *   **T-Door**: Trigger door linked to buttons of the same Set ID.
    *   **Goal**: the mission objective cell. The robot must stand here after collecting all stars to win.
    *   **Start**: the robot's starting position and direction.
    *   **Eraser**: click a cell to clear all items on it.
6.  **Multi-Set ID (1-8)**: 
    *   Used to link specific buttons to specific doors. 
    *   Select a **Set ID** in the sidebar, then place a button and a trigger door. They will automatically be linked and share the same color code.
7.  **Export JSON:** Once editing is finished, click "Download JSON" and overwrite `src/utils/levels.json` in your project.

---

## 2. Coordinate System & Directions
*   **Origin (0, 0):** The **top-left corner** of the map.
*   **Grid Coordinates:** `x` increases to the right (East), `y` increases downwards (South).
*   **Direction Codes (`dir`):**
    *   `0`: North (Up ↑) - Decrements `y`
    *   `1`: East (Right →) - Increments `x`
    *   `2`: South (Down ↓) - Increments `y`
    *   `3`: West (Left ←) - Decrements `x`

---

## 3. Physical & Logic Rules (Game Engine Internals)

### A. Movement & Collision Rules (`canEnterTile`)
The game engine validates movement using a strict `canEnterTile(x, y, isRock)` rule. 

#### Robot Passability:
A tile is **blocked (impassable)** for the robot if:
*   It is out of the grid boundaries (`isOutOfBounds`).
*   It contains an active (closed) Trigger Door (`T-Door`) or a locked Regular Door.
*   It contains a Wall (`Obstacle`) **AND** the robot does *not* carry a **Plane**.
*   It contains Water **AND** the robot carries *neither* a **Boat** *nor* a **Plane**.
*   It contains a Rock **AND** the cell behind the rock is blocked (preventing pushing).

#### Rock Passability:
A tile is **blocked (impassable)** for a pushed rock if:
*   It is out of the grid boundaries.
*   It contains an active (closed) Trigger Door (`T-Door`) or a locked Regular Door.
*   It contains a Wall (carrying a Plane/Boat has no effect on rocks).
*   It contains Water (carrying a Plane/Boat has no effect on rocks).
*   It contains another Rock (rocks cannot push other rocks).

### B. Robot Pushing Mechanics
*   The robot can push **exactly one rock** at a time.
*   Pushing is executed automatically during the **Move Forward** command when walking into a cell occupied by a rock.
*   The rock will be pushed into the next cell in the direction of the robot's movement, provided that cell is passable for rocks (see Rock Passability above). If the destination is blocked, a collision is triggered and the execution fails ("Bang! Hit an obstacle!").

### C. Trigger Mechanisms (Buttons & T-Doors)
*   **Momentary Buttons**: A Trigger Door (`triggerDoors`) linked to a button (`triggerButtons`) via a matching `setId` remains open **only** as long as a robot or a rock is currently occupying the button. Once both move off the button, the door immediately closes.

### D. Keys & Doors
*   When a robot lands on a cell containing a key, the key is collected, and **all doors of that matching color are permanently unlocked** (`openDoors` set).
*   > [!WARNING]
    > **Crucial Level JSON Requirement:** For a key to unlock a door, the door object in the JSON **must** contain the property `"keyRequired": true` (e.g. `{"x": 1, "y": 3, "color": "blue", "keyRequired": true}`). If `"keyRequired"` is missing or `false`, the door will ignore the key and remain locked forever, causing a softlock.

### E. Portals (Teleporters)
*   Portals act in pairs sharing the same `id`. Landing on `posA` instantly teleports the robot to `posB`, and vice versa, with a short transitional delay.

---

## 4. Coding Interpreter & Advanced Logic Commands

The game features an AST-like hierarchical command interpreter that supports advanced flow control and memory structures.

### A. Stack-based Memory
*   **`markPosition`**: Pushes the robot's current coordinates (`x`, `y`) and current direction (`dir`) onto a Last-In, First-Out (LIFO) memory stack (`savedPositions`).
*   **`returnToMark`**: Pops the most recently saved position from the stack and moves the robot back to those coordinates and direction.
    *   If `returnToMark` is executed while the memory stack is empty, the program halts with a failure ("No mark remembered.").

### B. Break Command Propagation
*   **`break`**: Immediately exits the innermost `Loop` or `While` block.
*   > [!IMPORTANT]
    > **Bubbling Behavior:** If `break` is placed inside an `If` conditional branch or inside a custom function block (`callFuncA` / `callFuncB`), it will return a `'break'` signal which **bubbles/propagates up** through the execution stack until it hits an active loop block to terminate it, or halts the entire script if no loop is found.

### C. Custom Logical Condition Builder
Unlike simple Directional checks, the game's `If` and `While` blocks support a rich, customizable logic engine. You can construct nested, compound conditions using `AND` and `OR` logical operators.

Each individual condition is a **Simple Condition** consisting of three parts:
1.  **Subject**:
    *   `Front` / `Left` / `Right` / `Back`: Checks the tile relative to the robot's current facing direction.
    *   `Here`: Checks the tile directly underneath the robot.
    *   `Robot`: Checks the robot's inventory state.
2.  **Operator**: `IS` or `IS NOT` (toggles the conditional result).
3.  **Target**:
    *   `Wall`: Evaluates to `true` if the target tile is out of bounds or contains a static obstacle.
    *   `Water`: Checks if the target tile contains water.
    *   `Rock`: Checks if the target tile contains a pushable rock.
    *   `Goal`: Checks if the target tile is the level goal.
    *   `Star`: Checks if the target tile contains an uncollected energy stone.
    *   `Key`: Checks if the target tile contains an uncollected key.
    *   `Boat`: If Subject is `Robot`, checks if the robot is carrying a Boat. Otherwise, checks if an uncollected Boat item lies on the target tile.
    *   `Plane`: If Subject is `Robot`, checks if the robot is carrying a Plane. Otherwise, checks if an uncollected Plane item lies on the target tile.
    *   `Door`: Checks if the target tile contains a blocked/closed door (T-door or Regular Door).
    *   `Boundary`: Checks if the target tile is outside the level boundaries.

*   **Shorthand Directional If (`If Obstacle Left/Right`)**: In the default UI palette, the "If Obstacle Left" and "If Obstacle Right" blocks are shorthand macros. They check `isTileBlocked(-1)` or `isTileBlocked(1)` respectively, returning `true` if the tile in that direction is impassable (due to walls, out-of-bounds, water without a boat/plane, closed doors, or blocked rocks).

---

## 5. JSON File Structure (Schema)

If you choose to edit `levels.json` directly, please adhere strictly to the following schema. All coordinate vectors are 0-indexed.

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier for the level (e.g., `"challenge_01"`). |
| `name` | `string` | Level title shown in the UI. |
| `gridSize` | `[number, number]` | Dimension of the grid: `[width, height]`. |
| `allowedCommands` | `string[]` | **Required.** Array of allowed command types (e.g., `["forward", "left", "right", "loop", "if", "while"]`). |
| `start` | `object` | Robot spawn position and direction: `{"x": 0, "y": 4, "dir": 0}`. |
| `goal` | `object` | Win destination coordinates: `{"x": 0, "y": 0}`. |
| `fogRadius` | `number` | *Optional.* Fog of war circle radius in tiles. Set to `0` to disable. |
| `obstacles` | `[[number, number]]` | Array of static wall coordinates. |
| `waterTiles` | `[{x, y}]` | *Optional.* Water hazard coordinates. |
| `boats` | `[{x, y}]` | *Optional.* Boat items to collect. |
| `planes` | `[{x, y}]` | *Optional.* Plane items to collect. |
| `collectibles` | `[{x, y}]` | *Optional.* Energy Stones. All must be gathered to unlock victory. |
| `keys` | `[{x, y, color}]` | *Optional.* Key items. `color` is `"blue"`, `"red"`, or `"yellow"`. |
| `doors` | `[{x, y, keyRequired: boolean, color: string}]` | *Optional.* Doors opened by keys. `"keyRequired": true` is **mandatory** for unlocking behavior. |
| `portals` | `[{id, posA: {x,y}, posB: {x,y}, color}]` | *Optional.* Portal pairs linked by a matching `id`. |
| `rocks` | `[{x, y}]` | *Optional.* Pushable rocks. |
| `triggerButtons` | `[{x, y, setId, color}]` | *Optional.* Pressure plates. `setId` connects it to a T-Door. |
| `triggerDoors` | `[{x, y, setId, color}]` | *Optional.* Trigger doors opened while a button of the same `setId` is held down. |

---

## 6. Design Tips

1.  **Check for Softlocks**: Ensure the robot cannot push a rock into a corner or against a wall where it can no longer be reached or moved, particularly if that rock is needed to hold down a momentary button.
2.  **Color Coding**: Use the **Set ID** system to visually group buttons and trigger doors of corresponding functions.
3.  **Validate Allowed Commands**: Always ensure the `allowedCommands` array contains the commands necessary to solve the puzzle (e.g., do not forget to allow `while` or `if` in algorithmic challenges).
4.  **Encourage Algorithmic Thinking**: Design maps that are simpler to solve with recursive functions, loops, and conditions rather than a tedious list of hardcoded `moveForward` commands.

Enjoy creating your own logic challenges for RoboCode! 🤖🚀✨
