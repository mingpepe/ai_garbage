import { create } from 'zustand';
import type { LevelConfig, CircuitEvaluation } from '@/types/circuit';
import { CAMPAIGN_LEVELS } from '@/levels/levelsData';
import { CircuitEngine } from '@/engine/CircuitEngine';
import { LevelSolver } from '@/engine/LevelSolver';
import { sound } from '@/utils/audio';

interface GameState {
  currentLevelIndex: number;
  campaignLevels: LevelConfig[];
  activeLevel: LevelConfig;
  inputs: Record<string, boolean>;
  stepCount: number;
  evaluation: CircuitEvaluation;
  levelStars: Record<string, number>;
  unlockedLevelIndex: number;

  isVictoryModalOpen: boolean;
  isLevelSelectOpen: boolean;
  showLogicBadges: boolean;
  soundEnabled: boolean;
  activeHint: { targetNodeId: string; desiredState: boolean; explanation: string } | null;

  // Actions
  loadLevel: (index: number) => void;
  toggleValve: (nodeId: string) => void;
  resetCurrentLevel: () => void;
  nextLevel: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  setShowLogicBadges: (show: boolean) => void;
  setLevelSelectOpen: (open: boolean) => void;
  setVictoryModalOpen: (open: boolean) => void;
  requestHint: () => void;
  clearHint: () => void;
  applyInputs: (newInputs: Record<string, boolean>) => void;
}

const getInitialInputs = (level: LevelConfig): Record<string, boolean> => {
  const inputs: Record<string, boolean> = {};
  for (const node of level.nodes) {
    if (node.type === 'SOURCE') {
      inputs[node.id] = node.state ?? false;
    }
  }
  return inputs;
};

const initialLevel = CAMPAIGN_LEVELS[0];
const initialInputs = getInitialInputs(initialLevel);
const initialEvaluation = CircuitEngine.evaluate(initialLevel, initialInputs);

export const useGameStore = create<GameState>((set, get) => ({
  currentLevelIndex: 0,
  campaignLevels: CAMPAIGN_LEVELS,
  activeLevel: initialLevel,
  inputs: initialInputs,
  stepCount: 0,
  evaluation: initialEvaluation,
  levelStars: {},
  unlockedLevelIndex: 0,

  isVictoryModalOpen: false,
  isLevelSelectOpen: false,
  showLogicBadges: true,
  soundEnabled: true,
  activeHint: null,

  loadLevel: (index: number) => {
    const { campaignLevels } = get();
    if (index < 0 || index >= campaignLevels.length) return;

    const level = campaignLevels[index];
    const inputs = getInitialInputs(level);
    const evaluation = CircuitEngine.evaluate(level, inputs);

    sound.playClick();

    set({
      currentLevelIndex: index,
      activeLevel: level,
      inputs,
      stepCount: 0,
      evaluation,
      isVictoryModalOpen: false,
      isLevelSelectOpen: false,
      activeHint: null,
    });
  },

  toggleValve: (nodeId: string) => {
    const { activeLevel, inputs, stepCount, levelStars, currentLevelIndex, unlockedLevelIndex } = get();
    const node = activeLevel.nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'SOURCE' || node.locked) return;

    const newInputs = {
      ...inputs,
      [nodeId]: !inputs[nodeId],
    };

    const newEvaluation = CircuitEngine.evaluate(activeLevel, newInputs);
    const newStepCount = stepCount + 1;

    sound.playValveTurn();

    let isVictoryModalOpen = false;
    const newStars = { ...levelStars };
    let newUnlocked = unlockedLevelIndex;

    if (newEvaluation.isVictory) {
      sound.playVictory();
      isVictoryModalOpen = true;

      const par = activeLevel.parSteps ?? 2;
      let stars = 1;
      if (newStepCount <= par) {
        stars = 3;
      } else if (newStepCount <= par + 2) {
        stars = 2;
      }

      newStars[activeLevel.levelId] = Math.max(newStars[activeLevel.levelId] || 0, stars);
      newUnlocked = Math.max(unlockedLevelIndex, currentLevelIndex + 1);
    }

    set({
      inputs: newInputs,
      evaluation: newEvaluation,
      stepCount: newStepCount,
      isVictoryModalOpen,
      levelStars: newStars,
      unlockedLevelIndex: newUnlocked,
      activeHint: null,
    });
  },

  applyInputs: (newInputs: Record<string, boolean>) => {
    const { activeLevel, stepCount } = get();
    const newEvaluation = CircuitEngine.evaluate(activeLevel, newInputs);
    sound.playClick();

    set({
      inputs: newInputs,
      evaluation: newEvaluation,
      stepCount: stepCount + 1,
      activeHint: null,
    });
  },

  resetCurrentLevel: () => {
    const { activeLevel } = get();
    const inputs = getInitialInputs(activeLevel);
    const evaluation = CircuitEngine.evaluate(activeLevel, inputs);
    sound.playClick();

    set({
      inputs,
      stepCount: 0,
      evaluation,
      isVictoryModalOpen: false,
      activeHint: null,
    });
  },

  nextLevel: () => {
    const { currentLevelIndex, campaignLevels, loadLevel } = get();
    if (currentLevelIndex + 1 < campaignLevels.length) {
      loadLevel(currentLevelIndex + 1);
    }
  },

  setSoundEnabled: (enabled: boolean) => {
    sound.setMuted(!enabled);
    set({ soundEnabled: enabled });
  },

  setShowLogicBadges: (show: boolean) => {
    set({ showLogicBadges: show });
  },

  setLevelSelectOpen: (open: boolean) => {
    sound.playClick();
    set({ isLevelSelectOpen: open });
  },

  setVictoryModalOpen: (open: boolean) => {
    set({ isVictoryModalOpen: open });
  },

  requestHint: () => {
    const { activeLevel, inputs } = get();
    const hint = LevelSolver.getNextStepHint(activeLevel, inputs);
    sound.playClick();
    set({ activeHint: hint });
  },

  clearHint: () => {
    set({ activeHint: null });
  },
}));
