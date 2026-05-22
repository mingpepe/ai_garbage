import fs from 'fs';
import path from 'path';

const levels = {
  "level_1": {
    "id": "challenge_01",
    "name": "First Steps",
    "gridSize": [3, 3],
    "start": { "x": 0, "y": 2, "dir": 0 },
    "goal": { "x": 2, "y": 0 },
    "allowedCommands": ["forward", "left", "right"],
    "obstacles": [
      [1, 2], [2, 2], [1, 1], [2, 1]
    ],
    "collectibles": []
  },
  "level_2": {
    "id": "level_02",
    "name": "Cornering Obstacles",
    "gridSize": [4, 4],
    "start": { "x": 0, "y": 3, "dir": 0 },
    "goal": { "x": 3, "y": 0 },
    "allowedCommands": ["forward", "left", "right"],
    "obstacles": [
      [1, 1], [1, 2], [1, 3],
      [2, 1], [2, 2], [2, 3],
      [3, 1], [3, 2], [3, 3]
    ],
    "collectibles": []
  },
  "level_3": {
    "id": "level_03",
    "name": "Starry Path",
    "gridSize": [5, 5],
    "start": { "x": 0, "y": 4, "dir": 0 },
    "goal": { "x": 4, "y": 0 },
    "allowedCommands": ["forward", "left", "right"],
    "obstacles": [
      [1, 1], [1, 2], [1, 3], [1, 4],
      [3, 0], [3, 1], [3, 2], [3, 3]
    ],
    "collectibles": [
      { "x": 0, "y": 2 },
      { "x": 2, "y": 2 },
      { "x": 4, "y": 2 }
    ]
  },
  "level_4": {
    "id": "level_04",
    "name": "Dead End Turnaround",
    "gridSize": [5, 5],
    "start": { "x": 2, "y": 4, "dir": 0 },
    "goal": { "x": 2, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "turnAround"],
    "obstacles": [
      [0, 0], [0, 1], [0, 3], [0, 4],
      [1, 0], [1, 1], [1, 3], [1, 4],
      [3, 0], [3, 1], [3, 3], [3, 4],
      [4, 0], [4, 1], [4, 3], [4, 4]
    ],
    "collectibles": [
      { "x": 0, "y": 2 },
      { "x": 4, "y": 2 }
    ]
  },
  "level_5": {
    "id": "level_05",
    "name": "Infinite Loop",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 1 },
    "goal": { "x": 5, "y": 5 },
    "allowedCommands": ["forward", "left", "right", "loop"],
    "obstacles": [
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
      [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
      [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
      [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
      [5, 0], [5, 1], [5, 2], [5, 3], [5, 4]
    ],
    "collectibles": [
      { "x": 1, "y": 5 },
      { "x": 2, "y": 5 },
      { "x": 3, "y": 5 },
      { "x": 4, "y": 5 }
    ]
  },
  "level_6": {
    "id": "level_06",
    "name": "Locked Gate",
    "gridSize": [5, 5],
    "start": { "x": 0, "y": 4, "dir": 0 },
    "goal": { "x": 4, "y": 4 },
    "allowedCommands": ["forward", "left", "right", "turnAround"],
    "obstacles": [
      [1, 0], [1, 1], [1, 3], [1, 4],
      [2, 0], [2, 1], [2, 3], [2, 4],
      [3, 0], [3, 1], [3, 3], [3, 4]
    ],
    "keys": [
      { "x": 0, "y": 0, "color": "blue" }
    ],
    "doors": [
      { "x": 2, "y": 2, "color": "blue", "keyRequired": true }
    ],
    "collectibles": [
      { "x": 4, "y": 2 }
    ]
  },
  "level_7": {
    "id": "level_07",
    "name": "Portal Link",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 0 },
    "goal": { "x": 5, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "turnAround"],
    "obstacles": [
      [0, 1],
      [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
      [2, 1], [2, 2], [2, 3], [2, 4], [2, 5],
      [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
      [4, 1], [4, 2], [4, 3], [4, 4], [4, 5],
      [5, 1], [5, 2]
    ],
    "portals": [
      { "id": "p1", "posA": { "x": 0, "y": 2 }, "posB": { "x": 5, "y": 5 }, "color": "#3b82f6" },
      { "id": "p2", "posA": { "x": 5, "y": 3 }, "posB": { "x": 0, "y": 0 }, "color": "#a855f7" }
    ],
    "collectibles": [
      { "x": 0, "y": 3 },
      { "x": 5, "y": 4 },
      { "x": 2, "y": 0 }
    ]
  },
  "level_8": {
    "id": "level_08",
    "name": "Block Pusher",
    "gridSize": [5, 5],
    "start": { "x": 2, "y": 4, "dir": 0 },
    "goal": { "x": 2, "y": 0 },
    "allowedCommands": ["forward", "left", "right"],
    "obstacles": [
      [0, 0], [1, 0], [3, 0], [4, 0],
      [0, 1],
      [0, 2], [1, 2], [3, 2],
      [0, 3], [1, 3], [3, 3],
      [0, 4], [1, 4]
    ],
    "rocks": [
      { "x": 2, "y": 1 }
    ],
    "collectibles": [
      { "x": 4, "y": 2 }
    ]
  },
  "level_9": {
    "id": "level_09",
    "name": "Pressure Switch",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 0 },
    "goal": { "x": 5, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "turnAround"],
    "obstacles": [
      [1, 1], [2, 1], [3, 1], [4, 1], [5, 1],
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
      [3, 3], [4, 3], [5, 3],
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
      [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]
    ],
    "rocks": [
      { "x": 1, "y": 3 }
    ],
    "triggerButtons": [
      { "x": 2, "y": 3, "setId": 1, "color": "#fb923c" }
    ],
    "triggerDoors": [
      { "x": 0, "y": 1, "setId": 1, "color": "#fb923c" }
    ],
    "collectibles": [
      { "x": 1, "y": 0 }
    ]
  },
  "level_10": {
    "id": "level_10",
    "name": "Crossing the River",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 1 },
    "goal": { "x": 5, "y": 0 },
    "allowedCommands": ["forward", "left", "right"],
    "waterTiles": [
      { "x": 0, "y": 4 }, { "x": 1, "y": 4 }, { "x": 2, "y": 4 },
      { "x": 3, "y": 4 }, { "x": 4, "y": 4 }, { "x": 5, "y": 4 }
    ],
    "obstacles": [
      [0, 0], [0, 1], [0, 2], [0, 3],
      [1, 0], [1, 1], [1, 2], [1, 3],
      [2, 0], [2, 1], [2, 2], [2, 3],
      [3, 0], [3, 1], [3, 2], [3, 3],
      [4, 0], [4, 1], [4, 2], [4, 3]
    ],
    "boats": [
      { "x": 5, "y": 5 }
    ],
    "collectibles": [
      { "x": 2, "y": 5 }
    ]
  },
  "level_11": {
    "id": "level_11",
    "name": "Sky Flight",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 1 },
    "goal": { "x": 5, "y": 0 },
    "allowedCommands": ["forward", "left", "right"],
    "obstacles": [
      [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3]
    ],
    "planes": [
      { "x": 5, "y": 5 }
    ],
    "collectibles": [
      { "x": 2, "y": 5 }
    ]
  },
  "level_12": {
    "id": "level_12",
    "name": "Conditional Path",
    "gridSize": [5, 5],
    "start": { "x": 2, "y": 4, "dir": 0 },
    "goal": { "x": 4, "y": 1 },
    "allowedCommands": ["forward", "left", "right", "if"],
    "obstacles": [
      [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
      [0, 1], [1, 1], [2, 1], [3, 1],
      [0, 2], [1, 2], [2, 2], [3, 2],
      [0, 3], [1, 3],
      [0, 4], [1, 4], [3, 4], [4, 4]
    ],
    "collectibles": [
      { "x": 3, "y": 3 }
    ]
  },
  "level_13": {
    "id": "level_13",
    "name": "Infinite Loop Patrol",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 0 },
    "goal": { "x": 2, "y": 2 },
    "allowedCommands": ["forward", "left", "right", "while"],
    "obstacles": [
      [1, 1], [2, 1], [3, 1], [4, 1],
      [1, 2], [3, 2], [4, 2],
      [1, 3], [3, 3], [4, 3],
      [1, 4], [3, 4], [4, 4],
      [1, 5]
    ],
    "collectibles": [
      { "x": 5, "y": 2 }
    ]
  },
  "level_14": {
    "id": "level_14",
    "name": "Sub-Routine (Function A)",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 0 },
    "goal": { "x": 5, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "callFuncA"],
    "obstacles": [
      [0, 0], [1, 0], [2, 0], [3, 0],
      [0, 1], [1, 1], [2, 1], [5, 1],
      [0, 2], [1, 2], [4, 2], [5, 2],
      [0, 3], [3, 3], [4, 3], [5, 3],
      [2, 4], [3, 4], [4, 4], [5, 4],
      [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]
    ],
    "collectibles": [
      { "x": 1, "y": 4 },
      { "x": 2, "y": 3 },
      { "x": 3, "y": 2 }
    ]
  },
  "level_15": {
    "id": "level_15",
    "name": "Dual Routines",
    "gridSize": [7, 3],
    "start": { "x": 0, "y": 1, "dir": 1 },
    "goal": { "x": 6, "y": 1 },
    "allowedCommands": ["forward", "left", "right", "callFuncA", "callFuncB"],
    "obstacles": [
      [0, 0], [1, 0], [2, 0], [6, 0],
      [1, 1], [4, 1],
      [3, 2], [4, 2], [5, 2], [6, 2]
    ],
    "collectibles": [
      { "x": 3, "y": 1 },
      { "x": 4, "y": 0 }
    ]
  },
  "level_16": {
    "id": "level_16",
    "name": "Path Memory (Marking)",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 0 },
    "goal": { "x": 5, "y": 5 },
    "allowedCommands": ["forward", "left", "right", "markPosition", "returnToMark"],
    "obstacles": [
      [0, 0], [0, 1], [0, 2], [0, 3],
      [1, 0], [1, 1], [1, 2], [1, 3],
      [3, 0], [3, 1], [3, 2], [3, 3],
      [4, 0], [4, 1], [4, 2], [4, 3],
      [5, 0], [5, 1], [5, 2], [5, 3]
    ],
    "collectibles": [
      { "x": 2, "y": 1 }
    ]
  },
  "level_17": {
    "id": "level_17",
    "name": "Parallel Portals",
    "gridSize": [3, 5],
    "start": { "x": 0, "y": 4, "dir": 0 },
    "goal": { "x": 2, "y": 1 },
    "allowedCommands": ["forward", "left", "right", "turnAround"],
    "obstacles": [
      [1, 0], [1, 1], [1, 2], [1, 3], [1, 4]
    ],
    "portals": [
      { "id": "p1", "posA": { "x": 0, "y": 2 }, "posB": { "x": 2, "y": 2 }, "color": "#3b82f6" },
      { "id": "p2", "posA": { "x": 0, "y": 0 }, "posB": { "x": 2, "y": 0 }, "color": "#a855f7" }
    ],
    "keys": [
      { "x": 2, "y": 4, "color": "blue" }
    ],
    "doors": [
      { "x": 0, "y": 1, "color": "blue", "keyRequired": true }
    ],
    "collectibles": [
      { "x": 0, "y": 3 },
      { "x": 2, "y": 3 }
    ]
  },
  "level_18": {
    "id": "level_18",
    "name": "Archipelago Return",
    "gridSize": [5, 5],
    "start": { "x": 0, "y": 4, "dir": 1 },
    "goal": { "x": 4, "y": 4 },
    "allowedCommands": ["forward", "left", "right", "turnAround", "loop"],
    "obstacles": [
      [0, 0], [0, 1], [0, 2], [0, 3],
      [1, 0], [1, 1], [1, 2], [1, 3],
      [2, 0], [2, 1], [2, 2], [2, 3],
      [3, 0], [4, 0]
    ],
    "portals": [
      { "id": "p1", "posA": { "x": 1, "y": 4 }, "posB": { "x": 4, "y": 1 }, "color": "#ec4899" },
      { "id": "p2", "posA": { "x": 2, "y": 4 }, "posB": { "x": 4, "y": 2 }, "color": "#a855f7" },
      { "id": "p3", "posA": { "x": 3, "y": 4 }, "posB": { "x": 4, "y": 3 }, "color": "#3b82f6" }
    ],
    "collectibles": [
      { "x": 3, "y": 1 },
      { "x": 3, "y": 2 },
      { "x": 3, "y": 3 }
    ]
  },
  "level_19": {
    "id": "level_19",
    "name": "Key Chain Relay",
    "gridSize": [5, 5],
    "start": { "x": 0, "y": 4, "dir": 0 },
    "goal": { "x": 4, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "turnAround"],
    "obstacles": [
      [1, 0], [1, 1], [1, 3], [1, 4],
      [3, 0], [3, 1], [3, 3], [3, 4]
    ],
    "keys": [
      { "x": 0, "y": 0, "color": "blue" },
      { "x": 2, "y": 0, "color": "red" },
      { "x": 4, "y": 4, "color": "yellow" }
    ],
    "doors": [
      { "x": 1, "y": 2, "color": "blue", "keyRequired": true },
      { "x": 3, "y": 2, "color": "red", "keyRequired": true },
      { "x": 4, "y": 1, "color": "yellow", "keyRequired": true }
    ],
    "collectibles": [
      { "x": 0, "y": 2 },
      { "x": 2, "y": 2 },
      { "x": 4, "y": 3 }
    ]
  },
  "level_20": {
    "id": "level_20",
    "name": "Sea & Sky Flight",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 1 },
    "goal": { "x": 5, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "loop"],
    "waterTiles": [
      { "x": 0, "y": 4 }, { "x": 1, "y": 4 }, { "x": 2, "y": 4 },
      { "x": 3, "y": 4 }, { "x": 4, "y": 4 }, { "x": 5, "y": 4 }
    ],
    "obstacles": [
      [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]
    ],
    "boats": [
      { "x": 5, "y": 5 }
    ],
    "planes": [
      { "x": 0, "y": 3 }
    ],
    "collectibles": [
      { "x": 3, "y": 5 },
      { "x": 2, "y": 3 }
    ]
  },
  "level_21": {
    "id": "level_21",
    "name": "Double Back T-Maze",
    "gridSize": [5, 5],
    "start": { "x": 0, "y": 2, "dir": 1 },
    "goal": { "x": 4, "y": 2 },
    "allowedCommands": ["forward", "left", "right", "callFuncA"],
    "obstacles": [
      [0, 0], [0, 1], [0, 3], [0, 4],
      [1, 0], [1, 4],
      [2, 0], [2, 4],
      [3, 0], [3, 4],
      [4, 0], [4, 1], [4, 3], [4, 4]
    ],
    "collectibles": [
      { "x": 1, "y": 1 },
      { "x": 3, "y": 1 },
      { "x": 1, "y": 3 }
    ]
  },
  "level_22": {
    "id": "level_22",
    "name": "Triple Deep Alcoves",
    "gridSize": [3, 7],
    "start": { "x": 1, "y": 6, "dir": 0 },
    "goal": { "x": 1, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "turnAround", "callFuncA", "callFuncB"],
    "obstacles": [
      [0, 0], [0, 2], [0, 4], [0, 6],
      [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6]
    ],
    "collectibles": [
      { "x": 0, "y": 5 },
      { "x": 0, "y": 3 },
      { "x": 0, "y": 1 }
    ]
  },
  "level_23": {
    "id": "level_23",
    "name": "Branching Memory Maze",
    "gridSize": [5, 5],
    "start": { "x": 2, "y": 4, "dir": 0 },
    "goal": { "x": 2, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "markPosition", "returnToMark", "loop"],
    "obstacles": [
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 0], [1, 2], [1, 4],
      [3, 0], [3, 2], [3, 4],
      [4, 0], [4, 1], [4, 2], [4, 3], [4, 4]
    ],
    "collectibles": [
      { "x": 1, "y": 1 },
      { "x": 1, "y": 3 },
      { "x": 3, "y": 1 },
      { "x": 3, "y": 3 }
    ]
  },
  "level_24": {
    "id": "level_24",
    "name": "Portal & Plane Flight",
    "gridSize": [7, 7],
    "start": { "x": 0, "y": 6, "dir": 0 },
    "goal": { "x": 4, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "turnAround", "loop"],
    "portals": [
      { "id": "p1", "posA": { "x": 0, "y": 5 }, "posB": { "x": 6, "y": 5 }, "color": "#3b82f6" },
      { "id": "p2", "posA": { "x": 0, "y": 1 }, "posB": { "x": 6, "y": 1 }, "color": "#ec4899" }
    ],
    "keys": [
      { "x": 6, "y": 4, "color": "blue" }
    ],
    "doors": [
      { "x": 0, "y": 4, "color": "blue", "keyRequired": true }
    ],
    "boats": [
      { "x": 0, "y": 3 }
    ],
    "waterTiles": [
      { "x": 0, "y": 2 }
    ],
    "planes": [
      { "x": 6, "y": 0 }
    ],
    "obstacles": [
      [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
      [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
      [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6],
      [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6],
      [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6],
      [6, 2], [6, 3], [6, 6]
    ],
    "collectibles": [
      { "x": 1, "y": 0 },
      { "x": 5, "y": 0 }
    ]
  },
  "level_25": {
    "id": "level_25",
    "name": "Pressure plate Maze",
    "gridSize": [6, 4],
    "start": { "x": 0, "y": 2, "dir": 1 },
    "goal": { "x": 5, "y": 2 },
    "allowedCommands": ["forward", "left", "right"],
    "obstacles": [
      [0, 0], [0, 1], [1, 0], [1, 1], [1, 2],
      [3, 0], [3, 1], [3, 3],
      [4, 0], [4, 1], [4, 3],
      [5, 0], [5, 1], [5, 3]
    ],
    "rocks": [
      { "x": 2, "y": 2 }
    ],
    "triggerButtons": [
      { "x": 2, "y": 0, "setId": 1, "color": "#fb923c" }
    ],
    "triggerDoors": [
      { "x": 4, "y": 2, "setId": 1, "color": "#fb923c" }
    ],
    "collectibles": [
      { "x": 2, "y": 1 },
      { "x": 3, "y": 2 }
    ]
  },
  "level_26": {
    "id": "level_26",
    "name": "The Grand Finale",
    "gridSize": [6, 6],
    "start": { "x": 0, "y": 5, "dir": 0 },
    "goal": { "x": 5, "y": 0 },
    "allowedCommands": ["forward", "left", "right", "while", "if"],
    "obstacles": [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2], [1, 4], [1, 5],
      [2, 0], [2, 1], [2, 2], [2, 4], [2, 5],
      [3, 0], [3, 4], [3, 5],
      [4, 0], [4, 2], [4, 3], [4, 4], [4, 5],
      [5, 2], [5, 3], [5, 4], [5, 5]
    ],
    "collectibles": [
      { "x": 0, "y": 3 },
      { "x": 3, "y": 3 },
      { "x": 3, "y": 1 },
      { "x": 5, "y": 1 }
    ]
  }
};

const levelsPath = path.resolve('src/utils/levels.json');
fs.writeFileSync(levelsPath, JSON.stringify(levels, null, 2), 'utf8');
console.log('✨ Success: Wrote all 26 redesigned progressive levels to src/utils/levels.json!');
