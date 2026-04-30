export type TaskState = 'READY' | 'RUNNING' | 'DONE' | 'SLEEPING';

export interface Task {
  id: string;
  name: string;
  arrivalTime: number;
  totalWorkload: number;
  remainingWorkload: number;
  nice: number; // -20 to 19
  weight: number;
  requestedSlice: number; // Latency Request (r) for EEVDF
  
  state: TaskState;
  
  // Scheduler specifics
  vruntime: number;
  lag: number;
  virtualDeadline: number;
  isEligible: boolean; // For UI visualization
  
  // Slice tracking
  sliceRemaining: number;
  
  // Metrics
  startTime: number | null;
  endTime: number | null;
  waitTime: number;
  executedTime: number;
  
  // History for Gantt chart
  executionHistory: { start: number; end: number; coreId: number }[];
}

export const NICE_TO_WEIGHT: Record<number, number> = {
    "-20": 88761, "-19": 71755, "-18": 56483, "-17": 46273, "-16": 36291,
    "-15": 29154, "-14": 23254, "-13": 18705, "-12": 14949, "-11": 11916,
    "-10": 9548,  "-9": 7620,  "-8": 6100,  "-7": 4904,  "-6": 3906,
    "-5": 3121,  "-4": 2501,  "-3": 1991,  "-2": 1586,  "-1": 1277,
    "0": 1024,   "1": 820,   "2": 655,   "3": 526,   "4": 423,
    "5": 335,   "6": 272,   "7": 215,   "8": 172,   "9": 137,
    "10": 110,   "11": 87,   "12": 70,   "13": 56,   "14": 45,
    "15": 36,   "16": 29,   "17": 23,   "18": 18,   "19": 15,
};

export const NICE_0_LOAD = 1024;
export const SCHED_LATENCY = 6; // ms (base period)
export const MIN_GRANULARITY = 0.75; // ms (min slice)
export const WAKEUP_GRANULARITY = 1; // ms (preemption threshold)

export interface CoreConfig {
    id: number;
}
