import fs from 'fs';
import path from 'path';

// Map direction codes
const DIRS = [
  { dx: 0, dy: -1 }, // 0: North
  { dx: 1, dy: 0 },  // 1: East
  { dx: 0, dy: 1 },  // 2: South
  { dx: -1, dy: 0 }  // 3: West
];

const levelsPath = path.resolve('src/utils/levels.json');
const levels = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));

function verifyLevel(levelId, level) {
  const { gridSize, start, goal, obstacles = [], waterTiles = [], boats = [], planes = [], collectibles = [], keys = [], doors = [], portals = [], triggerButtons = [], triggerDoors = [], rocks = [] } = level;
  
  const totalStars = collectibles.length;
  
  // Initial state helper
  const serializeState = (s) => {
    const rocksStr = s.rocks.map(r => `${r.x},${r.y}`).sort().join(';');
    const keysStr = Array.from(s.keysCollected).sort().join(',');
    const starsStr = Array.from(s.collectedStarCoords).sort().join(';');
    return `${s.x},${s.y},${s.dir},${s.hasBoat ? 1 : 0},${s.hasPlane ? 1 : 0},${keysStr},${starsStr},${rocksStr}`;
  };

  const getRockAt = (x, y, rockList) => {
    return rockList.find(r => Math.round(r.x) === Math.round(x) && Math.round(r.y) === Math.round(y));
  };

  const isOutOfBounds = (x, y) => {
    return x < 0 || x >= gridSize[0] || y < 0 || y >= gridSize[1];
  };

  const isObstacle = (x, y) => {
    return obstacles.some(obs => obs[0] === x && obs[1] === y);
  };

  const isWater = (x, y) => {
    return waterTiles.some(w => w.x === x && w.y === y);
  };

  // Helper to evaluate trigger sets
  const getActiveTriggerSets = (rx, ry, rockList) => {
    const active = new Set();
    triggerButtons.forEach(btn => {
      const occupiedByRobot = Math.round(btn.x) === Math.round(rx) && Math.round(btn.y) === Math.round(ry);
      const occupiedByRock = rockList.some(r => Math.round(btn.x) === Math.round(r.x) && Math.round(btn.y) === Math.round(r.y));
      if (occupiedByRobot || occupiedByRock) {
        active.add(btn.setId);
      }
    });
    return active;
  };

  const isTriggerDoorClosed = (x, y, activeTriggerSets) => {
    const door = triggerDoors.find(d => Math.round(d.x) === Math.round(x) && Math.round(d.y) === Math.round(y));
    if (!door) return false;
    return !activeTriggerSets.has(door.setId);
  };

  const isRegularDoorClosed = (x, y, keysCollected) => {
    const doorIdx = doors.findIndex(d => Math.round(d.x) === Math.round(x) && Math.round(d.y) === Math.round(y));
    if (doorIdx === -1) return false;
    const door = doors[doorIdx];
    return !keysCollected.has(door.color || 'blue');
  };

  const canEnterTile = (x, y, isRock, hasBoat, hasPlane, keysCollected, activeTriggerSets, rockList) => {
    if (isOutOfBounds(x, y)) return false;
    if (isTriggerDoorClosed(x, y, activeTriggerSets)) return false;
    if (isRegularDoorClosed(x, y, keysCollected)) return false;
    if (isObstacle(x, y) && (isRock || !hasPlane)) return false;
    if (isWater(x, y) && (isRock || (!hasBoat && !hasPlane))) return false;
    if (isRock && getRockAt(x, y, rockList)) return false;
    return true;
  };

  // BFS Queue
  const startState = {
    x: start.x,
    y: start.y,
    dir: start.dir,
    hasBoat: false,
    hasPlane: false,
    keysCollected: new Set(),
    starsCollected: 0,
    rocks: rocks.map(r => ({ x: r.x, y: r.y })),
    collectedStarCoords: new Set(),
    collectedBoatCoords: new Set(),
    collectedPlaneCoords: new Set(),
    collectedKeyCoords: new Set(),
    path: []
  };

  const queue = [startState];
  const visited = new Set([serializeState(startState)]);

  while (queue.length > 0) {
    const curr = queue.shift();

    // Check Win
    const atGoal = curr.x === goal.x && curr.y === goal.y;
    const allStars = curr.starsCollected === totalStars;
    if (atGoal && allStars) {
      return { solvable: true, path: curr.path };
    }

    // Standard Moves: forward, left, right, turnAround
    const actions = ['forward', 'left', 'right', 'turnAround'];
    for (const action of actions) {
      let nx = curr.x;
      let ny = curr.y;
      let ndir = curr.dir;
      let nhasBoat = curr.hasBoat;
      let nhasPlane = curr.hasPlane;
      let nkeysCollected = new Set(curr.keysCollected);
      let nstarsCollected = curr.starsCollected;
      let nrocks = curr.rocks.map(r => ({ x: r.x, y: r.y }));
      let ncollectedStarCoords = new Set(curr.collectedStarCoords);
      let ncollectedBoatCoords = new Set(curr.collectedBoatCoords);
      let ncollectedPlaneCoords = new Set(curr.collectedPlaneCoords);
      let ncollectedKeyCoords = new Set(curr.collectedKeyCoords);

      if (action === 'left') {
        ndir = (ndir + 3) % 4;
      } else if (action === 'right') {
        ndir = (ndir + 1) % 4;
      } else if (action === 'turnAround') {
        ndir = (ndir + 2) % 4;
      } else if (action === 'forward') {
        const moveDir = DIRS[ndir];
        const nextX = nx + moveDir.dx;
        const nextY = ny + moveDir.dy;

        const activeTriggers = getActiveTriggerSets(nx, ny, nrocks);
        
        // Pushing rock check
        const rock = getRockAt(nextX, nextY, nrocks);
        if (rock) {
          const rockNextX = rock.x + moveDir.dx;
          const rockNextY = rock.y + moveDir.dy;
          if (canEnterTile(rockNextX, rockNextY, true, nhasBoat, nhasPlane, nkeysCollected, activeTriggers, nrocks)) {
            // Move Rock
            rock.x = rockNextX;
            rock.y = rockNextY;
            // Move Robot
            nx = nextX;
            ny = nextY;
          } else {
            // Can't push rock, crash/invalid move
            continue;
          }
        } else {
          // Regular step
          if (canEnterTile(nextX, nextY, false, nhasBoat, nhasPlane, nkeysCollected, activeTriggers, nrocks)) {
            nx = nextX;
            ny = nextY;
          } else {
            // Blocked, crash
            continue;
          }
        }

        // Boat consumption when moving from water to land
        if (nhasBoat && isWater(curr.x, curr.y) && !isWater(nx, ny)) {
          nhasBoat = false;
        }

        // Portal Teleportation
        for (const portal of portals) {
          let target = null;
          if (portal.posA.x === nx && portal.posA.y === ny) target = portal.posB;
          else if (portal.posB.x === nx && portal.posB.y === ny) target = portal.posA;
          
          if (target) {
            const prevX = nx;
            const prevY = ny;
            nx = target.x;
            ny = target.y;

            // Boat consumption on teleport
            if (nhasBoat && isWater(prevX, prevY) && !isWater(nx, ny)) {
              nhasBoat = false;
            }
            break;
          }
        }
      }

      // Collect item logic
      collectibles.forEach((c, idx) => {
        const coordKey = `${c.x},${c.y}`;
        if (c.x === nx && c.y === ny && !ncollectedStarCoords.has(coordKey)) {
          ncollectedStarCoords.add(coordKey);
          nstarsCollected++;
        }
      });

      boats.forEach((b, idx) => {
        const coordKey = `${b.x},${b.y}`;
        if (b.x === nx && b.y === ny && !ncollectedBoatCoords.has(coordKey)) {
          ncollectedBoatCoords.add(coordKey);
          nhasBoat = true;
        }
      });

      planes.forEach((p, idx) => {
        const coordKey = `${p.x},${p.y}`;
        if (p.x === nx && p.y === ny && !ncollectedPlaneCoords.has(coordKey)) {
          ncollectedPlaneCoords.add(coordKey);
          nhasPlane = true;
        }
      });

      keys.forEach((k, idx) => {
        const coordKey = `${k.x},${k.y}`;
        if (k.x === nx && k.y === ny && !ncollectedKeyCoords.has(coordKey)) {
          ncollectedKeyCoords.add(coordKey);
          nkeysCollected.add(k.color || 'blue');
        }
      });

      const nextState = {
        x: nx,
        y: ny,
        dir: ndir,
        hasBoat: nhasBoat,
        hasPlane: nhasPlane,
        keysCollected: nkeysCollected,
        starsCollected: nstarsCollected,
        rocks: nrocks,
        collectedStarCoords: ncollectedStarCoords,
        collectedBoatCoords: ncollectedBoatCoords,
        collectedPlaneCoords: ncollectedPlaneCoords,
        collectedKeyCoords: ncollectedKeyCoords,
        path: [...curr.path, action]
      };

      const key = serializeState(nextState);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(nextState);
      }
    }
  }

  return { solvable: false };
}

// Run verify
console.log('🤖 RoboCode: Verifying All Levels...');
let allSolvable = true;

for (const levelKey in levels) {
  const level = levels[levelKey];
  const result = verifyLevel(levelKey, level);
  if (result.solvable) {
    console.log(`✅ ${levelKey} (${level.name}): SOLVABLE! Path length: ${result.path.length}`);
  } else {
    console.error(`❌ ${levelKey} (${level.name}): UNSOLVABLE!`);
    allSolvable = false;
  }
}

if (allSolvable) {
  console.log('\n✨ Success: All levels are verified and 100% solvable!');
  process.exit(0);
} else {
  console.error('\n💥 Error: Some levels are UNSOLVABLE! Please check level designs.');
  process.exit(1);
}
