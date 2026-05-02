# 🤖 RoboCode: Level Editor Guide

This guide details how to create brand new logic challenge levels for "RoboCode" through the visual interface or by editing the `src/utils/levels.json` file.

---

## 1. Visual Editor (Recommended)
The game now features a built-in **"Map Workshop"**, allowing you to draw maps without writing code:

1.  **Access:** On the left side of the main game screen, next to the "Progress" panel, click the **⚙️ Settings icon**.
2.  **Draw Map:** Select a tool from the top toolbar and click on the grid to place the element.
3.  **Toolbar Icons:**
    *   **Wall**: solid obstacle, blocks robot and rocks.
    *   **Water**: liquid hazard, requires **Boat** to cross.
    *   **Boat**: item that allows the robot to cross water.
    *   **Plane**: item that allows the robot to fly over walls and water.
    *   **Star**: Energy Stone. **All Stars must be collected** to win.
    *   **Blue/Red/Yellow Key**: traditional lock-and-key system. Finding the key opens all doors of that color.
    *   **Rock**: pushable box that interacts with the robot and buttons.
    *   **Button**: pressure plate (see "Physics" section).
    *   **T-Door**: Trigger door linked to buttons (see "Physics" section).
    *   **Goal**: the mission objective cell.
    *   **Start**: the robot's starting position.
    *   **Eraser**: click a cell to clear all items on it.
4.  **Multi-Set ID (1-8)**: 
    *   Used to link specific buttons to specific doors. 
    *   Select a **Set ID** in the sidebar, then place a button and a door. They will automatically be linked and share the same color code.
5.  **Export JSON:** Once editing is finished, click "Download JSON" and overwrite `src/utils/levels.json` in your project.

---

## 2. Coordinate System & Directions
*   **Origin (0, 0):** The **top-left corner** of the map.
*   **Direction Codes (`dir`):**
    *   `0`: North (Up ↑)
    *   `1`: East (Right →)
    *   `2`: South (Down ↓)
    *   `3`: West (Left ←)

---

## 3. Physical & Logic Rules (Crucial for Design)

### A. Movement & Pushing
*   **Robot Pushing**: The robot can push **one rock** at a time if the cell behind the rock is empty.
*   **Push Direction**: Works for both **Forward** and **Backward** movement.
*   **Collisions**: Rocks cannot be pushed into walls, water, or other rocks.

### B. Trigger Mechanisms (Buttons & T-Doors)
*   **Momentary Buttons**: The linked T-Door (same Set ID) only stays open as long as a robot or rock is **currently on top** of the button. This is ideal for puzzles requiring the robot to push a rock onto a button to proceed.

### C. Advanced Logic Commands
*   **Stack-based Memory**: `markPosition` adds the current location to a "stack". `returnToMark` takes the robot back to the **most recent** mark and removes it. 
*   **Break**: immediately exits the current `Loop` or `While` block.
*   **Directional If**: `If Obstacle Left/Right` checks for walls relative to the robot's current facing direction.

---

## 4. JSON File Structure (Schema)

If you choose to edit `levels.json` directly, please follow this format:

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier (e.g., "level_1"). |
| `name` | `string` | Level title. |
| `gridSize` | `[width, height]` | Map grid size (recommended 5x5 ~ 12x12). |
| `start` | `object` | Initial pos: `{"x": 0, "y": 4, "dir": 0}`. |
| `goal` | `object` | Goal pos: `{"x": 0, "y": 0}`. |
| `obstacles` | `[[x, y]]` | Array of static wall coordinates. |
| `waterTiles` | `[{x, y}]` | Array of water hazards. |
| `boats` | `[{x, y}]` | Boat items (to cross water). |
| `planes` | `[{x, y}]` | Plane items (to fly over walls and water). |
| `collectibles` | `[{x, y}]` | **Energy Stones**. Required for victory. |
| `keys` | `[{x, y, color}]`| **Keys**. Opens same-colored `doors`. |
| `doors` | `[{x, y, color}]`| **Doors**. Requires same-colored `keys`. |
| `portals` | `[{id, posA, posB, color}]`| **Teleporters**. One ID connects two points. |
| `rocks` | `[{x, y}]` | **Pushable objects**. |
| `triggerButtons` | `[{x, y, setId, color}]` | Buttons linked to `triggerDoors`. |
| `triggerDoors` | `[{x, y, setId, color}]` | Doors linked to `triggerButtons`. |

---

## 5. Design Tips
1.  **Check for Softlocks**: Ensure the robot can't accidentally push a rock into a corner where it's no longer reachable if a button needs it.
2.  **Color Coding**: Use the **Set ID** system to visually group related mechanisms for the player.
3.  **Encourage Algorithms**: Design levels that are easier to solve with `While` and `If` rather than a long sequence of `Move Forward`.

Enjoy creating your own logic challenges for RoboCode! 🤖🚀✨
