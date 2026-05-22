import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Command, Position, GameStatus, LevelProgress, Level, Condition, SimpleCondition } from '../types';
import { LEVELS as INITIAL_LEVELS } from '../utils/levels';
import { calculateChecksum } from '../utils/checksum';
import gsap from 'gsap';

type StepFrame = {
  commands: Command[];
  index: number;
  kind?: 'loop' | 'while' | 'whileFrontClear' | 'func';
  func?: 'A' | 'B';
  path?: string;
  isPeeking?: boolean;
  remaining?: number;
  iterations?: number;
};

interface SavedProgram {
  checksum: string;
  main: Command[];
  fA: Command[];
  fB: Command[];
}

export const useGameStore = defineStore('game', () => {
  const mode = ref<'play' | 'editor'>('play');
  const engineeringMode = ref(false); 
  
  const allLevels = ref<Record<string, Level>>({ ...INITIAL_LEVELS });
  const currentLevelId = ref('level_1');
  const currentLevel = computed(() => allLevels.value[currentLevelId.value]);
  const currentLevelChecksum = computed(() => calculateChecksum(currentLevel.value));
  
  const commandQueue = ref<Command[]>([]);
  const functionAQueue = ref<Command[]>([]);
  const functionBQueue = ref<Command[]>([]);

  const savedPrograms = ref<Record<string, SavedProgram>>(
    JSON.parse(localStorage.getItem('coding-robot-programs-v1') || '{}')
  );

  function loadProgramForLevel(id: string) {
    const level = allLevels.value[id];
    if (!level) return;
    
    const checksum = calculateChecksum(level);
    const saved = savedPrograms.value[id];

    if (saved && saved.checksum === checksum) {
      commandQueue.value = JSON.parse(JSON.stringify(saved.main));
      functionAQueue.value = JSON.parse(JSON.stringify(saved.fA));
      functionBQueue.value = JSON.parse(JSON.stringify(saved.fB));
    } else {
      commandQueue.value = [];
      functionAQueue.value = [];
      functionBQueue.value = [];
      if (saved) {
        delete savedPrograms.value[id];
        localStorage.setItem('coding-robot-programs-v1', JSON.stringify(savedPrograms.value));
      }
    }
  }

  function saveCurrentProgram() {
    if (!currentLevel.value) return;

    savedPrograms.value[currentLevelId.value] = {
      checksum: currentLevelChecksum.value,
      main: JSON.parse(JSON.stringify(commandQueue.value)),
      fA: JSON.parse(JSON.stringify(functionAQueue.value)),
      fB: JSON.parse(JSON.stringify(functionBQueue.value))
    };
    localStorage.setItem('coding-robot-programs-v1', JSON.stringify(savedPrograms.value));
  }

  // Initial load
  loadProgramForLevel(currentLevelId.value);

  // Auto-save on changes
  watch([commandQueue, functionAQueue, functionBQueue], () => {
    saveCurrentProgram();
  }, { deep: true });

  const robotPos = ref<Position>({ ...currentLevel.value.start });
  
  const gameStatus = ref<GameStatus>({ state: 'idle', message: '' });
  const activeCommandId = ref<string | null>(null);
  const activeFunction = ref<'A' | 'B' | null>(null);
  const currentActiveTarget = ref<'main' | 'A' | 'B'>('main');
  const executionToken = ref(0);
  const stepStack = ref<StepFrame[]>([]);
  const isStepRunning = ref(false);
  const savedPositions = ref<Position[]>([]);
  const rockPosList = ref<{x: number, y: number}[]>((currentLevel.value.rocks || []).map(r => ({ ...r })));
  
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

  const isFogDisabled = ref(false);

  function toggleFog() {
    isFogDisabled.value = !isFogDisabled.value;
  }

  const isProgramLocked = computed(() => gameStatus.value.state === 'executing' || isStepRunning.value);
  const canStopProgram = computed(() => gameStatus.value.state === 'executing' || gameStatus.value.state === 'stepping');

  function isUnlocked(id: string) {
    if (engineeringMode.value) return true;
    const num = parseInt(id.split('_')[1]);
    if (num === 1) return true;
    const prevId = `level_${num - 1}`;
    return levelProgress.value[prevId]?.completed === true;
  }

  // Auto-update active function during stepping
  watch(stepStack, (stack) => {
    if (gameStatus.value.state === 'stepping') {
        const funcFrame = [...stack].reverse().find(f => f.kind === 'func');
        activeFunction.value = funcFrame?.func || null;
    }
  }, { deep: true });

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
    loadProgramForLevel(id);
    resetRobot();
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
    activeFunction.value = null;
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
    console.log('--- runCommands triggered ---');
    if (gameStatus.value.state === 'executing' || isStepRunning.value) return;

    // 1. If IDLE, reset and start fresh. If STEPPING, just resume.
    const isResuming = gameStatus.value.state === 'stepping';
    
    if (!isResuming) {
        console.log('Starting fresh run...');
        const shouldPauseAfterReset = needsPreRunReset();
        resetRobot();
        executionToken.value++;
        stepStack.value = [{ commands: commandQueue.value, index: 0 }];
        
        if (shouldPauseAfterReset) {
            gameStatus.value = { state: 'executing', message: 'Resetting...' };
            const resetComplete = await waitForRunToken(520, executionToken.value);
            if (!resetComplete) return;
        }
    } else {
        console.log('Resuming from stepping/breakpoint...');
        // Increment token to cancel any pending stepping timeouts but don't reset robot
        executionToken.value++;
    }

    const runToken = executionToken.value;
    gameStatus.value = { state: 'executing', message: isResuming ? 'Resuming...' : 'Running...' };

    let firstStepAfterResume = isResuming;

    while (gameStatus.value.state === 'executing' && executionToken.value === runToken) {
        const result = getNextSteppableCommand();
        if (!result) break;

        const { cmd, path } = result;

        // Breakpoint check: skip if we are resuming and this is the very first fetch
        if (cmd.breakpoint && !firstStepAfterResume) {
            console.log('Breakpoint hit at:', path);
            activeCommandId.value = path;
            gameStatus.value = { state: 'stepping', message: 'Breakpoint hit.' };
            
            // Revert state so this command is executed next time
            const frame = stepStack.value[stepStack.value.length - 1];
            if (frame.isPeeking) frame.isPeeking = false;
            else frame.index--;
            return;
        }
        firstStepAfterResume = false;

        activeCommandId.value = path;
        
        const isPhysical = [
            'forward', 'left', 'right', 'turnAround', 
            'markPosition', 'returnToMark'
        ].includes(cmd.type);

        if (isPhysical) {
            const prevX = Math.round(robotPos.value.x);
            const prevY = Math.round(robotPos.value.y);
            const success = await executeSingleCommand(cmd, runToken);
            if (executionToken.value !== runToken) return;
            if (!success) {
                stepStack.value = [];
                return;
            }
            const rx = Math.round(robotPos.value.x);
            const ry = Math.round(robotPos.value.y);
            const didMove = (prevX !== rx || prevY !== ry);
            const interactionsComplete = await handleCellInteractions(runToken, didMove);
            if (!interactionsComplete) return;
        }

        if (checkWin()) {
            activeCommandId.value = null;
            activeFunction.value = null;
            stepStack.value = [];
            gameStatus.value = { state: 'success', message: 'Success! Mission Accomplished!' };
            updateProgress(currentLevelId.value);
            return;
        }
    }

    if (executionToken.value === runToken) {
        if (gameStatus.value.state === 'executing') {
            gameStatus.value = { state: 'failed', message: 'Target not reached.' };
        }
        activeCommandId.value = null;
        activeFunction.value = null;
    }
  }

  function stopExecution() {
    if (!canStopProgram.value) return;
    executionToken.value++;
    gsap.killTweensOf(robotPos.value);
    activeCommandId.value = null;
    activeFunction.value = null;
    stepStack.value = [];
    isStepRunning.value = false;
    gameStatus.value = { state: 'stopped', message: 'Execution stopped.' };
  }

  function cancelStepping() {
    if (gameStatus.value.state !== 'stepping') return;
    executionToken.value++;
    activeCommandId.value = null;
    activeFunction.value = null;
    stepStack.value = [];
    isStepRunning.value = false;
    gameStatus.value = { state: 'idle', message: '' };
  }

  async function runSingleStep() {
    console.log('--- runSingleStep triggered ---');
    if (gameStatus.value.state === 'executing' || isStepRunning.value) return;
    if (commandQueue.value.length === 0) return;

    // 1. If IDLE, we just highlight the first command
    if (gameStatus.value.state !== 'stepping') {
      const shouldPauseAfterReset = needsPreRunReset();
      resetRobot();
      executionToken.value++;
      stepStack.value = [{ commands: commandQueue.value, index: 0 }];
      gameStatus.value = { state: 'stepping', message: 'Step mode: Ready.' };

      if (shouldPauseAfterReset) {
        isStepRunning.value = true;
        const resetComplete = await waitForRunToken(520, executionToken.value);
        isStepRunning.value = false;
        if (!resetComplete) return;
      }

      // Peek the first command to show the yellow frame
      const first = getNextSteppableCommand();
      if (first) {
          console.log('Initial peek for highlighting:', first.path);
          activeCommandId.value = first.path;
          
          // Revert state so this command is executed on the NEXT click
          const frame = stepStack.value[stepStack.value.length - 1];
          if (frame.isPeeking) frame.isPeeking = false;
          else frame.index--;
      }
      return; 
    }

    await doOneSteppingStep(executionToken.value);
  }

  async function doOneSteppingStep(runToken: number) {
    const result = getNextSteppableCommand();

    if (!result) {
      activeCommandId.value = null;
      activeFunction.value = null;
      stepStack.value = [];
      gameStatus.value = checkWin()
        ? { state: 'success', message: 'Success! Mission Accomplished!' }
        : { state: 'failed', message: 'Target not reached.' };
      if (checkWin()) updateProgress(currentLevelId.value);
      return;
    }

    const { cmd, path } = result;
    activeCommandId.value = path;
    
    const isPhysical = [
        'forward', 'left', 'right', 'turnAround', 
        'markPosition', 'returnToMark'
    ].includes(cmd.type);

    if (isPhysical) {
        const prevX = Math.round(robotPos.value.x);
        const prevY = Math.round(robotPos.value.y);
        isStepRunning.value = true;
        const success = await executeSingleCommand(cmd, runToken);
        isStepRunning.value = false;

        if (executionToken.value !== runToken) return;

        if (!success) {
            stepStack.value = [];
            return;
        }

        const rx = Math.round(robotPos.value.x);
        const ry = Math.round(robotPos.value.y);
        const didMove = (prevX !== rx || prevY !== ry);
        const interactionsComplete = await handleCellInteractions(runToken, didMove);
        if (!interactionsComplete) return;
    }

    if (checkWin()) {
      activeCommandId.value = null;
      activeFunction.value = null;
      stepStack.value = [];
      gameStatus.value = { state: 'success', message: 'Success! Mission Accomplished!' };
      updateProgress(currentLevelId.value);
      return;
    }

    gameStatus.value = { state: 'stepping', message: 'Step complete.' };
  }

  async function runOverStep() {
    console.log('--- runOverStep triggered ---');
    if (gameStatus.value.state === 'executing' || isStepRunning.value) {
        console.log('Blocked: state is executing or step is already running', { state: gameStatus.value.state, isStepRunning: isStepRunning.value });
        return;
    }
    if (commandQueue.value.length === 0) {
        console.log('Blocked: commandQueue is empty');
        return;
    }

    // 1. Initialize stepping if not started
    if (gameStatus.value.state !== 'stepping') {
      console.log('Initializing stepping mode...');
      const shouldPauseAfterReset = needsPreRunReset();
      resetRobot();
      executionToken.value++;
      stepStack.value = [{ commands: commandQueue.value, index: 0 }];
      gameStatus.value = { state: 'stepping', message: 'Step mode: Ready.' };

      if (shouldPauseAfterReset) {
        isStepRunning.value = true;
        const resetComplete = await waitForRunToken(520, executionToken.value);
        isStepRunning.value = false;
        if (!resetComplete) {
            console.log('Reset failed or interrupted');
            return;
        }
      }

      // Peek the first command to show the yellow frame
      const first = getNextSteppableCommand();
      if (first) {
          activeCommandId.value = first.path;
          const frame = stepStack.value[stepStack.value.length - 1];
          if (frame && !frame.isPeeking) frame.index--; 
          else if (frame && frame.isPeeking) frame.isPeeking = false;
      }
      return; 
    }

    const runToken = executionToken.value;
    console.log('Current runToken:', runToken);
    
    // 2. Peek current frame for function calls
    let frame = stepStack.value[stepStack.value.length - 1];
    while (frame && frame.index >= frame.commands.length) {
        console.log('Popping finished frame');
        stepStack.value.pop();
        frame = stepStack.value[stepStack.value.length - 1];
    }

    if (!frame) {
        console.log('No frame found after cleanup, falling back to doOneSteppingStep');
        await doOneSteppingStep(runToken);
        return;
    }

    const cmd = frame.commands[frame.index];
    console.log('Next command to evaluate:', cmd?.type, 'at index', frame.index);
    const isFunction = cmd.type === 'callFuncA' || cmd.type === 'callFuncB';

    // 3. Handle Step Over Function
    if (isFunction) {
        console.log('Detected Function Call - Executing Step Over');
        isStepRunning.value = true;
        frame.index++; // Advance past the function call
        frame.isPeeking = false;
        const currentPath = frame.path ? `${frame.path}-at-${cmd.id}` : cmd.id;
        activeCommandId.value = currentPath;

        const prevFunc = activeFunction.value;
        activeFunction.value = cmd.type === 'callFuncA' ? 'A' : 'B';
        const queue = cmd.type === 'callFuncA' ? functionAQueue.value : functionBQueue.value;

        console.log('Running recursive execution for function:', activeFunction.value);
        const result = await executeRecursive(queue, (_c, path) => {
            if (executionToken.value !== runToken) return;
            activeCommandId.value = path;
        }, 0, runToken, currentPath);

        activeFunction.value = prevFunc;
        isStepRunning.value = false;

        if (executionToken.value !== runToken) {
            console.log('Token mismatch after recursive execution');
            return;
        }

        if (result === 'breakpoint') {
            console.log('Breakpoint hit inside function during Step Over');
            // Recursive interrupted, we stay in stepping mode
            return;
        }

        if (result === 'failed') {
            console.log('Recursive execution failed');
            stepStack.value = [];
            return;
        }

        const interactionsComplete = await handleCellInteractions(runToken);
        if (!interactionsComplete) {
            console.log('Interactions failed after function execution');
            return;
        }

        if (checkWin()) {
            console.log('Win detected after function execution');
            activeCommandId.value = null;
            activeFunction.value = null;
            stepStack.value = [];
            gameStatus.value = { state: 'success', message: 'Success! Mission Accomplished!' };
            updateProgress(currentLevelId.value);
            return;
        }

        // After step over, we should highlight the NEXT command
        console.log('Scanning for next command to highlight...');
        const nextResult = getNextSteppableCommand();
        if (nextResult) {
            console.log('Highlighting next command:', nextResult.path);
            activeCommandId.value = nextResult.path;
            const nextFrame = stepStack.value[stepStack.value.length - 1];
            if (nextFrame && !nextFrame.isPeeking) {
                console.log('Adjusting frame index for next highlight');
                nextFrame.index--; 
            } else if (nextFrame && nextFrame.isPeeking) {
                console.log('Resetting peek state for container highlight');
                nextFrame.isPeeking = false;
            }
        } else {
            console.log('No next command found');
            activeCommandId.value = null;
        }

        gameStatus.value = { state: 'stepping', message: 'Step over complete.' };
    } else {
        console.log('Non-function command, falling back to doOneSteppingStep');
        await doOneSteppingStep(runToken);
    }
  }

  function evaluateCondition(cond?: Condition): boolean {
    if (!cond) return false;
    if (cond.type === 'simple') {
      const result = checkSimpleCondition(cond);
      return cond.not ? !result : result;
    } else if (cond.type === 'and') {
      return evaluateCondition(cond.left) && evaluateCondition(cond.right);
    } else if (cond.type === 'or') {
      return evaluateCondition(cond.left) || evaluateCondition(cond.right);
    }
    return false;
  }

  function checkSimpleCondition(cond: SimpleCondition): boolean {
    const rx = Math.round(robotPos.value.x);
    const ry = Math.round(robotPos.value.y);

    if (cond.subject === 'robot') {
      switch (cond.target) {
        case 'boat': return hasBoat.value;
        case 'plane': return hasPlane.value;
        case 'key': return hasKey.value;
        case 'star': return collectedCount.value > 0;
        default: return false;
      }
    }

    let targetX = rx;
    let targetY = ry;
    
    if (cond.subject !== 'here') {
      let offset = 0;
      if (cond.subject === 'left') offset = -1;
      else if (cond.subject === 'right') offset = 1;
      else if (cond.subject === 'back') offset = 2;
      const next = getNextPos(robotPos.value, offset);
      targetX = next.x;
      targetY = next.y;
    }

    switch (cond.target) {
      case 'wall': return isOutOfBounds(targetX, targetY) || isObstacle(targetX, targetY);
      case 'boundary': return isOutOfBounds(targetX, targetY);
      case 'water': return isWater(targetX, targetY);
      case 'rock': return !!getRockAt(targetX, targetY);
      case 'goal': return targetX === currentLevel.value.goal.x && targetY === currentLevel.value.goal.y;
      case 'star': 
        return currentLevel.value.collectibles?.some((item, idx) => 
          item.x === targetX && item.y === targetY && !collectedIds.value.has(`coll-${idx}`)
        ) || false;
      case 'key':
        return currentLevel.value.keys?.some((item, idx) => 
          item.x === targetX && item.y === targetY && !collectedKeyIds.value.has(`key-${idx}`)
        ) || false;
      case 'boat':
        return currentLevel.value.boats?.some((item, idx) => 
          item.x === targetX && item.y === targetY && !collectedBoatIds.value.has(`boat-${idx}`)
        ) || false;
      case 'plane':
        return currentLevel.value.planes?.some((item, idx) => 
          item.x === targetX && item.y === targetY && !collectedPlaneIds.value.has(`plane-${idx}`)
        ) || false;
      case 't-door': return isTriggerDoorClosed(targetX, targetY) || isRegularDoorClosed(targetX, targetY);
      default: return false;
    }
  }

  function getNextSteppableCommand(): { cmd: Command, path: string } | null {
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
          frame.isPeeking = false;
          continue;
        }

        stepStack.value.pop();
        continue;
      }

      const cmd = frame.commands[frame.index];
      const currentPath = frame.path ? `${frame.path}-at-${cmd.id}` : cmd.id;
      
      const isContainer = [
          'loop', 'while', 'whileNotGoal', 'whileFrontClear', 
          'if', 'ifLeft', 'ifRight', 'callFuncA', 'callFuncB'
      ].includes(cmd.type);

      if (isContainer && !frame.isPeeking) {
          frame.isPeeking = true;
          return { cmd, path: currentPath };
      }

      // If we are here, it's either physical or we've already peeked the container.
      frame.index++;
      frame.isPeeking = false;

      if (cmd.type === 'break') {
        while (stepStack.value.length > 0) {
          const popped = stepStack.value.pop();
          if (popped?.kind) break;
        }
        continue;
      }

      if (cmd.type === 'loop') {
        const count = cmd.value || 2;
        if (count > 0 && (cmd.subCommands?.length || 0) > 0) {
          stepStack.value.push({ commands: cmd.subCommands || [], index: 0, kind: 'loop', remaining: count, path: currentPath });
        }
        continue;
      }

      if (cmd.type === 'while' || cmd.type === 'whileNotGoal' || cmd.type === 'whileFrontClear') {
        let shouldContinue = false;
        if (cmd.type === 'while') shouldContinue = evaluateCondition(cmd.condition);
        else if (cmd.type === 'whileNotGoal') shouldContinue = !checkWin();
        else if (cmd.type === 'whileFrontClear') shouldContinue = !isFrontBlocked();

        if (shouldContinue && (cmd.subCommands?.length || 0) > 0) {
          frame.index--; // Re-run this while block after subcommands
          stepStack.value.push({ commands: cmd.subCommands || [], index: 0, path: currentPath });
        }
        continue;
      }

      if (cmd.type === 'if' || cmd.type === 'ifLeft' || cmd.type === 'ifRight') {
        let conditionMet = false;
        if (cmd.type === 'if' && cmd.condition) {
            conditionMet = evaluateCondition(cmd.condition);
        } else {
            let offset = 0;
            if (cmd.type === 'ifLeft') offset = -1;
            else if (cmd.type === 'ifRight') offset = 1;
            conditionMet = isTileBlocked(offset);
        }
        
        const branch = conditionMet ? (cmd.trueBranch || []) : (cmd.falseBranch || []);
        if (branch.length > 0) {
          stepStack.value.push({ commands: branch, index: 0, path: currentPath });
        }
        continue;
      }

      if (cmd.type === 'callFuncA') {
        if (functionAQueue.value.length > 0) stepStack.value.push({ commands: functionAQueue.value, index: 0, kind: 'func', func: 'A', path: currentPath });
        continue;
      }

      if (cmd.type === 'callFuncB') {
        if (functionBQueue.value.length > 0) stepStack.value.push({ commands: functionBQueue.value, index: 0, kind: 'func', func: 'B', path: currentPath });
        continue;
      }

      return { cmd, path: currentPath };
    }

    return null;
  }

  async function executeRecursive(commands: Command[], onStep: (cmd: Command, path: string) => void, depth: number = 0, runToken: number = executionToken.value, parentPath: string = ''): Promise<'ok' | 'failed' | 'break' | 'breakpoint'> {
    if (executionToken.value !== runToken) return 'failed';
    if (depth > 500) return 'failed'; 
    for (const cmd of commands) {
      if (executionToken.value !== runToken) return 'failed';
      if (gameStatus.value.state === 'failed') return 'failed';
      
      const currentPath = parentPath ? `${parentPath}-at-${cmd.id}` : cmd.id;

      // Breakpoint check: Stop BEFORE executing
      if (cmd.breakpoint && gameStatus.value.state === 'executing') {
          console.log('Breakpoint hit at:', currentPath);
          activeCommandId.value = currentPath;
          gameStatus.value = { state: 'stepping', message: 'Breakpoint hit.' };
          
          // Prepare the step stack so user can continue from here
          // We need to find where we are. This is tricky for recursive.
          // But wait, if we switch to 'stepping', the runCommands loop will finish.
          // We need to initialize the step stack with the current state.
          // This requires a bit more work to "pause" and "resume" recursive execution.
          return 'breakpoint';
      }

      onStep(cmd, currentPath);
      
      if (cmd.type === 'break') return 'break';

      if (cmd.type === 'loop') {
        const count = cmd.value || 2;
        for (let i = 0; i < count; i++) {
          const res = await executeRecursive(cmd.subCommands || [], onStep, depth + 1, runToken, currentPath);
          if (res === 'break') break;
          if (res === 'breakpoint') return 'breakpoint';
          if (res === 'failed') return 'failed';
        }
      } else if (cmd.type === 'while' || cmd.type === 'whileNotGoal' || cmd.type === 'whileFrontClear') {
        let iterations = 0;
        let shouldContinue = true;
        while (shouldContinue && iterations < 200 && executionToken.value === runToken) { 
          if (cmd.type === 'while') shouldContinue = evaluateCondition(cmd.condition);
          else if (cmd.type === 'whileNotGoal') shouldContinue = !checkWin();
          else if (cmd.type === 'whileFrontClear') shouldContinue = !isFrontBlocked();
          
          if (!shouldContinue) break;

          const res = await executeRecursive(cmd.subCommands || [], onStep, depth + 1, runToken, currentPath);
          if (res === 'break') break;
          if (res === 'breakpoint') return 'breakpoint';
          if (res === 'failed') return 'failed';
          iterations++;
        }
      } else if (cmd.type === 'if' || cmd.type === 'ifLeft' || cmd.type === 'ifRight') {
        let conditionMet = false;
        if (cmd.type === 'if' && cmd.condition) {
            conditionMet = evaluateCondition(cmd.condition);
        } else {
            let offset = 0;
            if (cmd.type === 'ifLeft') offset = -1;
            else if (cmd.type === 'ifRight') offset = 1;
            conditionMet = isTileBlocked(offset);
        }

        const branch = conditionMet ? (cmd.trueBranch || []) : (cmd.falseBranch || []);
        const res = await executeRecursive(branch, onStep, depth + 1, runToken, currentPath);
        if (res === 'break') return 'break'; // Propagate break out of IF
        if (res === 'breakpoint') return 'breakpoint';
        if (res === 'failed') return 'failed';
      } else if (cmd.type === 'callFuncA') {
        const prevFunc = activeFunction.value;
        activeFunction.value = 'A';
        const res = await executeRecursive(functionAQueue.value, onStep, depth + 1, runToken, currentPath);
        activeFunction.value = prevFunc;
        if (res === 'break') return 'break';
        if (res === 'breakpoint') return 'breakpoint';
        if (res === 'failed') return 'failed';
      } else if (cmd.type === 'callFuncB') {
        const prevFunc = activeFunction.value;
        activeFunction.value = 'B';
        const res = await executeRecursive(functionBQueue.value, onStep, depth + 1, runToken, currentPath);
        activeFunction.value = prevFunc;
        if (res === 'break') return 'break';
        if (res === 'breakpoint') return 'breakpoint';
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

  async function handleCellInteractions(runToken: number, didMove: boolean = false) {
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

    if (didMove) {
        for (const portal of currentLevel.value.portals || []) {
            let target: { x: number; y: number } | null = null;
            if (portal.posA.x === rx && portal.posA.y === ry) target = portal.posB;
            else if (portal.posB.x === rx && portal.posB.y === ry) target = portal.posA;
            if (target) {
                const canTeleport = await waitForRunToken(520, runToken);
                if (!canTeleport) return false;
                const prevX = Math.round(robotPos.value.x);
                const prevY = Math.round(robotPos.value.y);
                robotPos.value.x = target.x;
                robotPos.value.y = target.y;

                if (hasBoat.value && isWater(prevX, prevY) && !isWater(robotPos.value.x, robotPos.value.y)) {
                    hasBoat.value = false;
                }

                if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
                return waitForRunToken(320, runToken);
            }
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
    const startX = Math.round(robotPos.value.x);
    const startY = Math.round(robotPos.value.y);
    
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

      if (cmd.type === 'forward') {
        const next = getNextPos(robotPos.value);
        
        // Rock Pushing Logic
        const rockToPush = getRockAt(next.x, next.y);
        if (rockToPush) {
          const dx = Math.round(next.x) - startX;
          const dy = Math.round(next.y) - startY;
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
            const isBlockedByWater = isWater(next.x, next.y) && !hasBoat.value && !hasPlane.value;
            const hitObstacle = isObstacle(next.x, next.y) || isTriggerDoorClosed(next.x, next.y) || isBlockedByWater;
            
            if (isBlockedByWater) {
                gameStatus.value = { state: 'failed', message: 'Need a boat to cross water!' };
            } else {
                gameStatus.value = { state: 'failed', message: hitObstacle ? 'Bang! Hit an obstacle!' : 'Oops! Hit the boundary!' };
            }
            
            if (navigator.vibrate) navigator.vibrate(200);
            
            if (isBlockedByWater) {
                // Refusal shake instead of bumping into water
                gsap.to(robotPos.value, {
                    dir: robotPos.value.dir + 0.2,
                    duration: 0.05,
                    yoyo: true,
                    repeat: 5,
                    onComplete: () => {
                        robotPos.value.dir = (Math.round(robotPos.value.dir) + 400) % 4;
                        finish(false);
                    },
                    onInterrupt: () => finish(false)
                });
            } else {
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
            }
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

             // Boat consumption: If we moved FROM water TO land, and have a boat, lose it
             if (hasBoat.value && isWater(startX, startY) && !isWater(robotPos.value.x, robotPos.value.y)) {
                hasBoat.value = false;
             }

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

            if (hasBoat.value && isWater(startX, startY) && !isWater(robotPos.value.x, robotPos.value.y)) {
                hasBoat.value = false;
            }

            setTimeout(() => finish(executionToken.value === runToken), 120);
          },
          onInterrupt: () => finish(false)
        });
      } else {
        finish(true);
      }
    });
  }

  function getNextPos(pos: Position, dirOffset: number = 0): { x: number, y: number } {
    let { x, y, dir } = pos;
    let d = (Math.round(dir) + 400 + dirOffset) % 4;
    
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
    
    // Water check: Must have plane or boat
    if (isWater(x, y) && (isRock || (!hasBoat.value && !hasPlane.value))) return false;
    
    if (isRock && getRockAt(x, y)) return false; // Rocks can't push each other
    return true;
  }

  function isTileBlocked(offset: number = 0) {
    const nextPos = getNextPos(robotPos.value, offset);
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
      saveCurrentProgram();
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
    activeFunction,
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
    isFogDisabled,
    isUnlocked,
    setLevel,
    enterEditor,
    exitEditor,
    resetRobot,
    runCommands,
    runSingleStep,
    runOverStep,
    stopExecution,
    cancelStepping,
    addCommandToTarget,
    removeCommand,
    updateLevel,
    addLevel,
    toggleFog
  };
});

