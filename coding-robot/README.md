# RoboCode: Coding Robot 🤖

This is a programming logic enlightenment game designed specifically for children aged 5-6. Through an intuitive "Command Toolbox" and "Coding Area," children can help RoboCode move around the map, learning core programming concepts like sequences, sense of direction, and loops.

## Game Features

### 1. Core Gameplay
- **Command Sequence:** Drag and drop commands from the toolbox to the coding area to arrange the robot's actions.
- **Asynchronous Execution:** After clicking run, the robot performs actions one by one in the order of commands, accompanied by smooth animations.
- **Loop Logic:** Use "Repeat" cards to learn how to complete repetitive tasks with less code.

### 2. Educational Design
- **Visual Feedback:** During execution, the corresponding cards in the coding area highlight, helping establish the link between "code and action."
- **Frustration-Free Experience:** If the robot hits a wall, it shows a 😵 expression and automatically resets, encouraging repeated attempts.
- **Guided Paths:** Provides obstacles and targets to guide spatial thinking training.

### 3. Technical Implementation
- **Framework:** Vue 3 (Composition API)
- **State Management:** Pinia (handles map data and execution queue)
- **Animation:** GSAP (GreenSock) handles precise movement and rotation
- **Drag & Drop:** Vue.Draggable-next
- **Styling:** Tailwind CSS 4

## How to Start
```bash
cd coding-robot
npm install
npm run dev
```
Open your browser and visit `http://localhost:5173` to start learning programming logic!
