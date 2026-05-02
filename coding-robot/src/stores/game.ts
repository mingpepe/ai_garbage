import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Command, Position, GameStatus, LevelProgress, Level } from '../types';
import { LEVELS as INITIAL_LEVELS } from '../utils/levels';
import gsap from 'gsap';

type StepFrame = {
  commands: Command[];
  index: number;
  kind?: 'loop' | 'while' | 'whileFrontClear';
  remaining?: number;
  iterations?: number;
};

export const useGameStore = defineStore('game', () => {
  const mode = ref<'play' | 'editor'>('play');
  const engineeringMode = ref(false); 
  
  const allLevels = ref<Record<string, Level>>({ ...INITIAL_LEVELS });
  const currentLevelId = ref('level_1');
  const currentLevel = computed(() => allLevels.value[currentLevelId.value]);
  
  const robotPos = ref<Position>({ ...currentLevel.value.start });
  const commandQueue = ref<Command[]>([]);
  const functionAQueue = ref<Command[]>([]);
  const functionBQueue = ref<Command[]>([]);
  
  const gameStatus = ref<GameStatus>({ state: 'idle', message: '' });
  const activeCommandId = ref<string | null>(null);
  const currentActiveTarget = ref<'main' | 'A' | 'B'>('main');
  const executionToken = ref(0);
  const stepStack = ref<StepFrame[]>([]);
  const isStepRunning = ref(false);
  const savedPositions = ref<Position[]>([]);
  const rockPosList = ref<{x: number, y: number}[]>((INITIAL_LEVELS.level_1.rocks || []).map(r => ({ ...r })));
  
  const activeTriggerSets = computed(() => {
    const sets = new Set<number>();
    
    // Check robot pos
    const rx = Math.round(robotPos.value.x);
    const ry = Math.round(robotPos.value.y);
    currentLevel.value.triggerButtons?.forEach(btn => {
      if (Math.round(btn.x) === rx && Math.round(btn.y) === ry) {
        sets.add(btn.setId);
      }
    });

    // Check rocks pos
    rockPosList.value.forEach(rock => {
      currentLevel.value.triggerButtons?.forEach(btn => {
        if (Math.round(btn.x) === Math.round(rock.x) && Math.round(btn.y) === Math.round(rock.y)) {
          sets.add(btn.setId);
        }
      });
    });
    
    return sets;
  });
  
  const collectedCount = ref(0);
  const collectedIds = ref<Set<string>>(new Set());
  const collectedKeyIds = ref<Set<string>>(new Set());
  const keyColors = ref<Set<string>>(new Set());
  const collectedBoatIds = ref<Set<string>>(new Set());
  const collectedPlaneIds = ref<Set<string>>(new Set());
  const hasKey = ref(false);
  const hasBoat = ref(false);
  const hasPlane = ref(false);
  const openDoors = ref<Set<string>>(new Set());

  const levelProgress = ref<Record<string, LevelProgress>>(
    JSON.parse(localStorage.getItem('coding-robot-progress-v6') || '{}')
  );

  const isProgramLocked = computed(() => gameStatus.value.state === 'executing' || isStepRunning.value);
  const canStopProgram = computed(() => gameStatus.value.state === 'executing' || gameStatus.value.state === 'stepping');

  function isUnlocked(id: string) {
    if (engineeringMode.value) return true;
    const num = parseInt(id.split('_')[1]);
    if (num === 1) return true;
    const prevId = `level_${num - 1}`;
    return levelProgress.value[prevId]?.completed === true;
  }

  const blockCount = computed(() => 
    countBlocks(commandQueue.value) + 
    countBlocks(functionAQueue.value) +
    countBlocks(functionBQueue.value)
  );

  function countBlocks(commands: Command[]): number {
    let count = 0;
    for (const cmd of commands) {
      count++;
      if (cmd.subCommands) count += countBlocks(cmd.subCommands);
      if (cmd.trueBranch) count += countBlocks(cmd.trueBranch);
      if (cmd.falseBranch) count += countBlocks(cmd.falseBranch);
    }
    return count;
  }

  function setLevel(id: string) {
    if (isProgramLocked.value) return;
    if (!isUnlocked(id)) return;
    currentLevelId.value = id;
    resetRobot();
    commandQueue.value = [];
    functionAQueue.value = [];
    functionBQueue.value = [];
    currentActiveTarget.value = 'main';
  }

  function enterEditor() {
    if (!engineeringMode.value || isProgramLocked.value) return;
    mode.value = 'editor';
  }

  function exitEditor() {
    mode.value = 'play';
  }

  function resetRobot() {
    if (canStopProgram.value) {
      executionToken.value++;
    }

    // Kill any active GSAP animations to prevent conflicts
    gsap.killTweensOf(robotPos.value);
    
    // Immediate state reset
    robotPos.value.x = currentLevel.value.start.x;
    robotPos.value.y = currentLevel.value.start.y;
    robotPos.value.dir = currentLevel.value.start.dir;
    
    gameStatus.value = { state: 'idle', message: '' };
    activeCommandId.value = null;
    stepStack.value = [];
    isStepRunning.value = false;
    savedPositions.value = [];
    rockPosList.value = (currentLevel.value.rocks || []).map(r => ({ ...r }));
    collectedCount.value = 0;
    collectedIds.value = new Set();
    collectedKeyIds.value = new Set();
    keyColors.value = new Set();
    collectedBoatIds.value = new Set();
    collectedPlaneIds.value = new Set();
    hasKey.value = false;
    hasBoat.value = false;
    hasPlane.value = false;
    openDoors.value = new Set();
  }

  function needsPreRunReset() {
    const start = currentLevel.value.start;
    const atStart = Math.round(robotPos.value.x) === start.x &&
                    Math.round(robotPos.value.y) === start.y &&
                    Math.round(robotPos.value.dir) === start.dir;
    
    const rocksMoved = rockPosList.value.some((rock, idx) => {
        const initialRock = currentLevel.value.rocks?.[idx];
        return initialRock && (Math.round(rock.x) !== initialRock.x || Math.round(rock.y) !== initialRock.y);
    });

    return !atStart ||
           collectedCount.value > 0 ||
           collectedKeyIds.value.size > 0 ||
           keyColors.value.size > 0 ||
           collectedBoatIds.value.size > 0 ||
           collectedPlaneIds.value.size > 0 ||
           savedPositions.value.length > 0 ||
           rocksMoved ||
           hasKey.value ||
           hasBoat.value ||
           hasPlane.value ||
           openDoors.value.size > 0 ||
           gameStatus.value.state === 'success' ||
           gameStatus.value.state === 'failed' ||
           gameStatus.value.state === 'stopped' ||
           gameStatus.value.state === 'stepping';
  }

  function addCommandToTarget(cmd: Command) {
    if (isProgramLocked.value) return;
    cancelStepping();
    const target = currentActiveTarget.value;
    if (target === 'main') commandQueue.value.push(cmd);
    else if (target === 'A') functionAQueue.value.push(cmd);
    else if (target === 'B') functionBQueue.value.push(cmd);
  }

  function removeCommand(id: string) {
    if (isProgramLocked.value) return;
    cancelStepping();
    commandQueue.value = commandQueue.value.filter(c => c.id !== id);
    functionAQueue.value = functionAQueue.value.filter(c => c.id !== id);
    functionBQueue.value = functionBQueue.value.filter(c => c.id !== id);
  }

  async function runCommands() {
    if (isProgramLocked.value) return;
    
    const shouldPauseAfterReset = needsPreRunReset();
    resetRobot();
    const runToken = ++executionToken.value;

    if (shouldPauseAfterReset) {
      gameStatus.value = { state: 'executing', message: 'Resetting position...' };
      const resetComplete = await waitForRunToken(520, runToken);
      if (!resetComplete) return;
    }
    
    gameStatus.value = { state: 'executing', message: 'Starting robot...' };
    
    let totalPhysicalSteps = 0;
    const result = await executeRecursive(commandQueue.value, (cmd) => {
        if (executionToken.value !== runToken) return;
        activeCommandId.value = cmd.id; // Correctly highlights the current block
        const physicalTypes = ['forward', 'backward', 'left', 'right', 'turnAround'];
        if (physicalTypes.includes(cmd.type)) totalPhysicalSteps++;
    }, 0, runToken);

    if (executionToken.value !== runToken) return;

    if (result !== 'failed' && checkWin()) {
        gameStatus.value = { state: 'success', message: 'Success! Mission Accomplished!' };
        updateProgress(currentLevelId.value);
    } else if (gameStatus.value.state === 'executing') {
        gameStatus.value = { state: 'failed', message: 'Target not reached.' };
    }

    activeCommandId.value = null;
  }

  function stopExecution() {
    if (!canStopProgram.value) return;
    executionToken.value++;
    gsap.killTweensOf(robotPos.value);
    activeCommandId.value = null;
    stepStack.value = [];
    isStepRunning.value = false;
    gameStatus.value = { state: 'stopped', message: 'Execution stopped.' };
  }

  function cancelStepping() {
    if (gameStatus.value.state !== 'stepping') return;
    executionToken.value++;
    activeCommandId.value = null;
    stepStack.value = [];
    isStepRunning.value = false;
    gameStatus.value = { state: 'idle', message: '' };
  }

  async function runSingleStep() {
    if (gameStatus.value.state === 'executing' || isStepRunning.value) return;
    if (commandQueue.value.length === 0) return;

    if (gameStatus.value.state !== 'stepping') {
      const shouldPauseAfterReset = needsPreRunReset();
      resetRobot();
      executionToken.value++;
      stepStack.value = [{ commands: commandQueue.value, index: 0 }];
      gameStatus.value = { state: 'stepping', message: shouldPauseAfterReset ? 'Resetting...' : 'Step mode: Ready.' };

      if (shouldPauseAfterReset) {
        isStepRunning.value = true;
        const resetComplete = await waitForRunToken(520, executionToken.value);
        isStepRunning.value = false;
        if (!resetComplete) return;
        gameStatus.value = { state: 'stepping', message: 'Step mode: Ready.' };
      }
    }

    const runToken = executionToken.value;
    const cmd = getNextSteppableCommand();

    if (!cmd) {
      activeCommandId.value = null;
      stepStack.value = [];
      gameStatus.value = checkWin()
        ? { state: 'success', message: 'Success! Mission Accomplished!' }
        : { state: 'failed', message: 'Target not reached.' };
      if (checkWin()) updateProgress(currentLevelId.value);
      return;
    }

    isStepRunning.value = true;
    activeCommandId.value = cmd.id;
    const success = await executeSingleCommand(cmd, runToken);
    isStepRunning.value = false;

    if (executionToken.value !== runToken) return;

    if (!success) {
      stepStack.value = [];
      return;
    }

    const interactionsComplete = await handleCellInteractions(runToken);
    if (!interactionsComplete) return;

    if (checkWin()) {
      activeCommandId.value = null;
      stepStack.value = [];
      gameStatus.value = { state: 'success', message: 'Success! Mission Accomplished!' };
      updateProgress(currentLevelId.value);
      return;
    }

    gameStatus.value = { state: 'stepping', message: 'Step complete.' };
  }

  function getNextSteppableCommand(): Command | null {
    while (stepStack.value.length > 0) {
      if (stepStack.value.length > 500) {
        gameStatus.value = { state: 'failed', message: 'Stack overflow.' };
        stepStack.value = [];
        return null;
      }


      const frame = stepStack.value[stepStack.value.length - 1];

      if (frame.index >= frame.commands.length) {
        if (frame.kind === 'loop' && (frame.remaining || 0) > 1) {
          frame.remaining = (frame.remaining || 0) - 1;
          frame.index = 0;
          continue;
        }

        if (frame.kind === 'while' && !checkWin() && (frame.iterations || 0) < 200 && frame.commands.length > 0) {
          frame.iterations = (frame.iterations || 0) + 1;
          frame.index = 0;
          continue;
        }

        if (frame.kind === 'whileFrontClear' && !isFrontBlocked() && (frame.iterations || 0) < 200 && frame.commands.length > 0) {
          frame.iterations = (frame.iterations || 0) + 1;
          frame.index = 0;
          continue;
        }

        stepStack.value.pop();
        continue;
      }

      const cmd = frame.commands[frame.index++];
      activeCommandId.value = cmd.id;

      if (cmd.type === 'break') {
        while (stepStack.value.length > 0) {
          const popped = stepStack.value.pop();
          if (popped?.kind) break; // Exit the loop/while frame
        }
        continue;
      }

      if (cmd.type === 'loop') {
        const count = cmd.value || 2;
        if (count > 0 && (cmd.subCommands?.length || 0) > 0) {
          stepStack.value.push({ commands: cmd.subCommands || [], index: 0, kind: 'loop', remaining: count });
        }
        continue;
      }

      if (cmd.type === 'whileNotGoal') {
        if (!checkWin() && (cmd.subCommands?.length || 0) > 0) {
          stepStack.value.push({ commands: cmd.subCommands || [], index: 0, kind: 'while', iterations: 1 });
        }
        continue;
      }

      if (cmd.type === 'whileFrontClear') {
        if (!isFrontBlocked() && (cmd.subCommands?.length || 0) > 0) {
          stepStack.value.push({ commands: cmd.subCommands || [], index: 0, kind: 'whileFrontClear', iterations: 1 });
        }
        continue;
      }

      if (cmd.type === 'if' || cmd.type === 'ifLeft' || cmd.type === 'ifRight') {
        let offset = 0;
        if (cmd.type === 'ifLeft') offset = -1;
        else if (cmd.type === 'ifRight') offset = 1;
        
        const conditionMet = isTileBlocked(offset);
        const branch = conditionMet ? (cmd.trueBranch || []) : (cmd.falseBranch || []);
        if (branch.length > 0) {
          stepStack.value.push({ commands: branch, index: 0 });
        }
        continue;
      }

      if (cmd.type === 'callFuncA') {
        if (functionAQueue.value.length > 0) stepStack.value.push({ commands: functionAQueue.value, index: 0 });
        continue;
      }

      if (cmd.type === 'callFuncB') {
        if (functionBQueue.value.length > 0) stepStack.value.push({ commands: functionBQueue.value, index: 0 });
        continue;
      }

      return cmd;
    }

    return null;
  }

  async function executeRecursive(commands: Command[], onStep: (cmd: Command) => void, depth: number = 0, runToken: number = executionToken.value): Promise<'ok' | 'failed' | 'break'> {
    if (executionToken.value !== runToken) return 'failed';
    if (depth > 500) return 'failed'; 
    for (const cmd of commands) {
      if (executionToken.value !== runToken) return 'failed';
      if (gameStatus.value.state === 'failed') return 'failed';
      onStep(cmd);
      
      if (cmd.type === 'break') return 'break';

      if (cmd.type === 'loop') {
        const count = cmd.value || 2;
        for (let i = 0; i < count; i++) {
          const res = await executeRecursive(cmd.subCommands || [], onStep, depth + 1, runToken);
          if (res === 'break') break;
          if (res === 'failed') return 'failed';
        }
      } else if (cmd.type === 'whileNotGoal') {
        let iterations = 0;
        while (!checkWin() && iterations < 200 && executionToken.value === runToken) { 
          const res = await executeRecursive(cmd.subCommands || [], onStep, depth + 1, runToken);
          if (res === 'break') break;
          if (res === 'failed') return 'failed';
          iterations++;
        }
      } else if (cmd.type === 'whileFrontClear') {
        let iterations = 0;
        while (!isFrontBlocked() && iterations < 200 && executionToken.value === runToken) {
          const res = await executeRecursive(cmd.subCommands || [], onStep, depth + 1, runToken);
          if (res === 'break') break;
          if (res === 'failed') return 'failed';
          iterations++;
        }
      } else if (cmd.type === 'if' || cmd.type === 'ifLeft' || cmd.type === 'ifRight') {
        let offset = 0;
        if (cmd.type === 'ifLeft') offset = -1;
        else if (cmd.type === 'ifRight') offset = 1;
        
        const conditionMet = isTileBlocked(offset);
        const branch = conditionMet ? (cmd.trueBranch || []) : (cmd.falseBranch || []);
        const res = await executeRecursive(branch, onStep, depth + 1, runToken);
        if (res === 'break') return 'break'; // Propagate break out of IF
        if (res === 'failed') return 'failed';
      } else if (cmd.type === 'callFuncA') {
        const res = await executeRecursive(functionAQueue.value, onStep, depth + 1, runToken);
        if (res === 'break') return 'break';
        if (res === 'failed') return 'failed';
      } else if (cmd.type === 'callFuncB') {
        const res = await executeRecursive(functionBQueue.value, onStep, depth + 1, runToken);
        if (res === 'break') return 'break';
        if (res === 'failed') return 'failed';
      } else {
        const res = await executeSingleCommand(cmd, runToken);
        if (!res) return 'failed';
        const interactionsComplete = await handleCellInteractions(runToken);
        if (!interactionsComplete) return 'failed';
        if (checkWin()) return 'ok';
      }
    }
    return 'ok';
  }

  async function handleCellInteractions(runToken: number) {
    const rx = Math.round(robotPos.value.x);
    const ry = Math.round(robotPos.value.y);
    
    currentLevel.value.collectibles?.forEach((item, idx) => {
        if (item.x === rx && item.y === ry && !collectedIds.value.has(`coll-${idx}`)) {
            collectedIds.value.add(`coll-${idx}`);
            collectedCount.value++;
            if (navigator.vibrate) navigator.vibrate(50);
        }
    });

    currentLevel.value.boats?.forEach((boat, idx) => {
        const boatId = `boat-${idx}`;
        if (boat.x === rx && boat.y === ry && !collectedBoatIds.value.has(boatId)) {
            collectedBoatIds.value.add(boatId);
            hasBoat.value = true;
            if (navigator.vibrate) navigator.vibrate(50);
        }
    });

    currentLevel.value.planes?.forEach((plane, idx) => {
        const planeId = `plane-${idx}`;
        if (plane.x === rx && plane.y === ry && !collectedPlaneIds.value.has(planeId)) {
            collectedPlaneIds.value.add(planeId);
            hasPlane.value = true;
            if (navigator.vibrate) navigator.vibrate(50);
        }
    });

    if (isWater(rx, ry) && !hasBoat.value && !hasPlane.value) {
        gameStatus.value = { state: 'failed', message: 'Need a boat or plane to cross!' };
        if (navigator.vibrate) navigator.vibrate(200);
        return false;
    }

    currentLevel.value.keys?.forEach((k, kIdx) => {
        const keyId = `key-${kIdx}`;
        if (k.x === rx && k.y === ry && !collectedKeyIds.value.has(keyId)) {
            const color = normalizeItemColor(k.color);
            collectedKeyIds.value.add(keyId);
            keyColors.value.add(color);
            hasKey.value = true;
            currentLevel.value.doors?.forEach((d, dIdx) => {
                if (d.keyRequired && normalizeItemColor(d.color) === color) openDoors.value.add(`door-${dIdx}`);
            });
        }
    });
    for (const portal of currentLevel.value.portals || []) {
        let target: { x: number; y: number } | null = null;
        if (portal.posA.x === rx && portal.posA.y === ry) target = portal.posB;
        else if (portal.posB.x === rx && portal.posB.y === ry) target = portal.posA;
        if (target) {
            const canTeleport = await waitForRunToken(520, runToken);
            if (!canTeleport) return false;
            robotPos.value.x = target.x;
            robotPos.value.y = target.y;
            if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
            return waitForRunToken(320, runToken);
        }
    }

    return executionToken.value === runToken;
  }

  function waitForRunToken(ms: number, runToken: number): Promise<boolean> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        resolve(executionToken.value === runToken);
      }, ms);
    });
  }

  function updateProgress(id: string) {
    levelProgress.value[id] = { completed: true };
    localStorage.setItem('coding-robot-progress-v6', JSON.stringify(levelProgress.value));
  }

  async function executeSingleCommand(cmd: Command, runToken: number): Promise<boolean> {
    const duration = 0.3;
    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const finish = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };

      if (executionToken.value !== runToken) {
        finish(false);
        return;
      }

      if (cmd.type === 'forward' || cmd.type === 'backward') {
        const next = getNextPos(robotPos.value, cmd.type === 'backward');
        
        // Rock Pushing Logic
        const rockToPush = getRockAt(next.x, next.y);
        if (rockToPush) {
          const dx = Math.round(next.x) - Math.round(robotPos.value.x);
          const dy = Math.round(next.y) - Math.round(robotPos.value.y);
          const rockNext = { x: rockToPush.x + dx, y: rockToPush.y + dy };
          
          if (canEnterTile(rockNext.x, rockNext.y, true)) {
            gsap.to(rockToPush, {
              x: rockNext.x,
              y: rockNext.y,
              duration,
              ease: "back.out(1.2)",
              onComplete: () => {
                rockToPush.x = Math.round(rockNext.x);
                rockToPush.y = Math.round(rockNext.y);
              }
            });
          } else {
            const hitObstacle = isObstacle(next.x, next.y) || isTriggerDoorClosed(next.x, next.y) || (isWater(next.x, next.y) && !hasBoat.value) || !!getRockAt(next.x, next.y);
            gameStatus.value = { state: 'failed', message: hitObstacle ? 'Bang! Hit an obstacle!' : 'Oops! Hit the boundary!' };
            if (navigator.vibrate) navigator.vibrate(200);
            
            const rdx = (next.x - robotPos.value.x) * 0.3;
            const rdy = (next.y - robotPos.value.y) * 0.3;
            gsap.to(robotPos.value, {
                x: robotPos.value.x + rdx,
                y: robotPos.value.y + rdy,
                duration: 0.08,
                yoyo: true,
                repeat: 3,
                onComplete: () => finish(false),
                onInterrupt: () => finish(false)
            });
            return;
          }
        }

        if (!canEnterTile(next.x, next.y)) {
            const hitObstacle = isObstacle(next.x, next.y) || isTriggerDoorClosed(next.x, next.y) || (isWater(next.x, next.y) && !hasBoat.value);
            gameStatus.value = { state: 'failed', message: hitObstacle ? 'Bang! Hit an obstacle!' : 'Oops! Hit the boundary!' };
            if (navigator.vibrate) navigator.vibrate(200);
            
            const dx = (next.x - robotPos.value.x) * 0.3;
            const dy = (next.y - robotPos.value.y) * 0.3;
            gsap.to(robotPos.value, {
                x: robotPos.value.x + dx,
                y: robotPos.value.y + dy,
                duration: 0.08,
                yoyo: true,
                repeat: 3,
                onComplete: () => finish(false),
                onInterrupt: () => finish(false)
            });
            return;
        }

        gsap.to(robotPos.value, {
          x: next.x,
          y: next.y,
          duration,
          ease: "back.out(1.2)",
          onComplete: () => {
             if (executionToken.value !== runToken) {
               finish(false);
               return;
             }
             robotPos.value.x = Math.round(next.x);
             robotPos.value.y = Math.round(next.y);
             setTimeout(() => finish(executionToken.value === runToken), 100);
          },
          onInterrupt: () => finish(false)
        });
      } else if (cmd.type === 'left' || cmd.type === 'right' || cmd.type === 'turnAround') {
        let delta = 0;
        if (cmd.type === 'left') delta = -1;
        else if (cmd.type === 'right') delta = 1;
        else if (cmd.type === 'turnAround') delta = 2;

        gsap.to(robotPos.value, {
          dir: robotPos.value.dir + delta,
          duration,
          ease: "power2.out",
          onComplete: () => {
            if (executionToken.value !== runToken) {
              finish(false);
              return;
            }
            robotPos.value.dir = (Math.round(robotPos.value.dir) + 400) % 4;
            setTimeout(() => finish(executionToken.value === runToken), 50);
          },
          onInterrupt: () => finish(false)
        });
      } else if (cmd.type === 'wait') {
        setTimeout(() => finish(executionToken.value === runToken), 400);
      } else if (cmd.type === 'markPosition') {
        savedPositions.value.push({
          x: Math.round(robotPos.value.x),
          y: Math.round(robotPos.value.y),
          dir: (Math.round(robotPos.value.dir) + 400) % 4
        });
        setTimeout(() => finish(executionToken.value === runToken), 180);
      } else if (cmd.type === 'returnToMark') {
        const lastMark = savedPositions.value.pop();
        if (!lastMark) {
          gameStatus.value = { state: 'failed', message: 'No mark remembered.' };
          finish(false);
          return;
        }

        gsap.to(robotPos.value, {
          x: lastMark.x,
          y: lastMark.y,
          dir: lastMark.dir,
          duration: 0.35,
          ease: "power2.out",
          onComplete: () => {
            if (executionToken.value !== runToken) {
              finish(false);
              return;
            }
            robotPos.value.x = Math.round(lastMark.x);
            robotPos.value.y = Math.round(lastMark.y);
            robotPos.value.dir = (Math.round(lastMark.dir) + 400) % 4;
            setTimeout(() => finish(executionToken.value === runToken), 120);
          },
          onInterrupt: () => finish(false)
        });
      } else {
        finish(true);
      }
    });
  }

  function getNextPos(pos: Position, isBackward: boolean = false, dirOffset: number = 0): { x: number, y: number } {
    let { x, y, dir } = pos;
    let d = (Math.round(dir) + 400 + dirOffset) % 4;
    if (isBackward) d = (d + 2) % 4;
    if (d === 0) y--;
    else if (d === 1) x++;
    else if (d === 2) y++;
    else if (d === 3) x--;
    return { x, y };
  }

  function isOutOfBounds(x: number, y: number) {
    const [w, h] = currentLevel.value.gridSize;
    return x < 0 || x >= w || y < 0 || y >= h;
  }

  function isObstacle(x: number, y: number) {
    return currentLevel.value.obstacles.some(ob => ob[0] === x && ob[1] === y);
  }

  function isWater(x: number, y: number) {
    return currentLevel.value.waterTiles?.some(tile => Math.round(tile.x) === Math.round(x) && Math.round(tile.y) === Math.round(y)) === true;
  }

  function isTriggerDoorClosed(x: number, y: number) {
    const door = currentLevel.value.triggerDoors?.find(d => Math.round(d.x) === Math.round(x) && Math.round(d.y) === Math.round(y));
    if (!door) return false;
    return !activeTriggerSets.value.has(door.setId);
  }

  function getRockAt(x: number, y: number) {
    return rockPosList.value.find(r => Math.round(r.x) === Math.round(x) && Math.round(r.y) === Math.round(y));
  }

  function isRegularDoorClosed(x: number, y: number) {
    const doorIdx = currentLevel.value.doors?.findIndex(d => Math.round(d.x) === Math.round(x) && Math.round(d.y) === Math.round(y));
    if (doorIdx === undefined || doorIdx === -1) return false;
    return !openDoors.value.has(`door-${doorIdx}`);
  }

  function canEnterTile(x: number, y: number, isRock: boolean = false) {
    if (isOutOfBounds(x, y)) return false;
    if (isTriggerDoorClosed(x, y)) return false;
    if (isRegularDoorClosed(x, y)) return false;
    if (isObstacle(x, y) && (isRock || !hasPlane.value)) return false;
    if (isWater(x, y) && (isRock || (!hasBoat.value && !hasPlane.value))) return false;
    if (isRock && getRockAt(x, y)) return false; // Rocks can't push each other
    return true;
  }

  function isTileBlocked(offset: number = 0) {
    const nextPos = getNextPos(robotPos.value, false, offset);
    if (!canEnterTile(nextPos.x, nextPos.y)) return true;
    
    // If there's a rock, check if it can be pushed
    const rock = getRockAt(nextPos.x, nextPos.y);
    if (rock) {
      const dx = nextPos.x - Math.round(robotPos.value.x);
      const dy = nextPos.y - Math.round(robotPos.value.y);
      return !canEnterTile(rock.x + dx, rock.y + dy, true);
    }
    
    return false;
  }

  function isFrontBlocked() {
    return isTileBlocked(0);
  }

  function normalizeItemColor(color?: string) {
    return color || 'blue';
  }

  function checkWin() {
    const atGoal = Math.round(robotPos.value.x) === currentLevel.value.goal.x && 
                   Math.round(robotPos.value.y) === currentLevel.value.goal.y;
    const allCollected = (currentLevel.value.collectibles?.length || 0) === collectedCount.value;
    return atGoal && allCollected;
  }

  // Editor Actions
  function updateLevel(id: string, data: Level) {
    allLevels.value[id] = JSON.parse(JSON.stringify(data));
    if (id === currentLevelId.value) {
      resetRobot();
    }
  }

  function addLevel(id: string) {
    if (allLevels.value[id]) return;
    allLevels.value[id] = {
      id,
      name: 'New Level',
      gridSize: [8, 8],
      start: { x: 0, y: 7, dir: 0 },
      goal: { x: 7, y: 0 },
      allowedCommands: ['forward', 'left', 'right', 'loop', 'if', 'whileNotGoal'],
      obstacles: [],
      rocks: [],
      triggerButtons: [],
      triggerDoors: []
    };
  }

  return {
    mode,
    engineeringMode,
    allLevels,
    currentLevelId,
    currentLevel,
    robotPos,
    commandQueue,
    functionAQueue,
    functionBQueue,
    gameStatus,
    activeCommandId,
    currentActiveTarget,
    isProgramLocked,
    isStepRunning,
    savedPositions,
    rockPosList,
    activeTriggerSets,
    canStopProgram,
    blockCount,
    levelProgress,
    collectedIds,
    collectedKeyIds,
    keyColors,
    collectedBoatIds,
    collectedPlaneIds,
    hasKey,
    hasBoat,
    hasPlane,
    openDoors,
    isUnlocked,
    setLevel,
    enterEditor,
    exitEditor,
    resetRobot,
    runCommands,
    runSingleStep,
    stopExecution,
    cancelStepping,
    addCommandToTarget,
    removeCommand,
    updateLevel,
    addLevel
  };
});

