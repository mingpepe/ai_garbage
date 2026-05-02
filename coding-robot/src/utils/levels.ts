import type { Level } from '../types';
import levelData from './levels.json';

export const LEVELS: Record<string, Level> = levelData as any;
