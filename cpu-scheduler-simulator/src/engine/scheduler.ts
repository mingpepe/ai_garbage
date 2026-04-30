import { type Task, NICE_0_LOAD, SCHED_LATENCY, MIN_GRANULARITY, WAKEUP_GRANULARITY } from './types';
import { RBTree } from './rbtree';

export type SchedulerType = 'CFS' | 'EEVDF';

export class Core {
    id: number;
    currentTask: Task | null = null;
    runqueue: RBTree;
    minVruntime: number = 0;
    avgVirtualTime: number = 0; 
    totalWeight: number = 0;
    type: SchedulerType;

    constructor(id: number, type: SchedulerType) {
        this.id = id;
        this.type = type;
        this.runqueue = new RBTree(type === 'EEVDF' ? 'virtualDeadline' : 'vruntime');
    }

    private updateMinVruntime() {
        let v = this.runqueue.getMinVruntime();
        if (this.currentTask) {
            v = Math.min(v, this.currentTask.vruntime);
        }
        if (v !== Infinity && v > this.minVruntime) {
            this.minVruntime = v;
        }
    }

    private updateAvgVirtualTime(deltaExec: number) {
        if (this.totalWeight > 0) {
            this.avgVirtualTime += deltaExec / (this.totalWeight / NICE_0_LOAD);
        }
        this.avgVirtualTime = Math.max(this.avgVirtualTime, this.minVruntime);
    }

    // Update dynamic system-dependent metrics (Lag, Eligibility)
    updateTaskMetrics(tasks: Task[]) {
        tasks.forEach((t: Task) => {
            t.lag = t.weight * (this.avgVirtualTime - t.vruntime);
            t.isEligible = t.vruntime <= this.avgVirtualTime;
            // Note: virtualDeadline is kept invariant while in runqueue 
            // because vruntime doesn't change for tasks in queue.
        });
    }

    private updateTaskVD(task: Task) {
        task.virtualDeadline = task.vruntime + (task.requestedSlice / (task.weight / NICE_0_LOAD));
    }

    tick(deltaExec: number = 1, currentTime: number) {
        const nextTime = Math.round((currentTime + deltaExec) * 1000) / 1000;
        
        if (this.currentTask) {
            this.currentTask.executedTime += deltaExec;
            this.currentTask.remainingWorkload -= deltaExec;
            const deltaVruntime = deltaExec * (NICE_0_LOAD / this.currentTask.weight);
            this.currentTask.vruntime += deltaVruntime;
            this.currentTask.sliceRemaining -= deltaExec;
            
            // For EEVDF, virtual deadline of the running task advances with its vruntime
            if (this.type === 'EEVDF') {
                this.updateTaskVD(this.currentTask);
            }

            if (this.currentTask.remainingWorkload <= 0) {
                this.currentTask.state = 'DONE';
                this.currentTask.endTime = nextTime;
                this.totalWeight -= this.currentTask.weight;
                if (this.currentTask.executionHistory.length > 0) {
                    this.currentTask.executionHistory[this.currentTask.executionHistory.length - 1].end = nextTime;
                }
                this.currentTask = null;
            } else {
                if (this.currentTask.executionHistory.length > 0) {
                    this.currentTask.executionHistory[this.currentTask.executionHistory.length - 1].end = nextTime;
                }
            }
        }
        if (this.type === 'EEVDF') this.updateAvgVirtualTime(deltaExec);
        this.updateMinVruntime();
    }

    schedule(currentTime: number) {
        if (this.type === 'CFS') this.scheduleCFS(currentTime);
        else this.scheduleEEVDF(currentTime);
    }

    private calculateSlice(task: Task): number {
        const nrRunning = this.runqueue.getAllTasks().length + (this.currentTask ? 1 : 0);
        const period = Math.max(SCHED_LATENCY, nrRunning * MIN_GRANULARITY);
        if (this.totalWeight === 0) return period;
        return Math.max(MIN_GRANULARITY, (task.weight / this.totalWeight) * period);
    }

    private scheduleCFS(currentTime: number) {
        const needsResched = this.checkPreemptCFS();
        if (needsResched || !this.currentTask) {
            if (this.currentTask && this.currentTask.state === 'RUNNING') {
                this.currentTask.state = 'READY';
                this.runqueue.insert(this.currentTask);
            }
            const next = this.runqueue.getMin();
            if (next) {
                this.runqueue.removeById(next.id);
                this.switchToTask(next, currentTime);
                this.currentTask!.sliceRemaining = this.calculateSlice(this.currentTask!);
            } else {
                this.switchToTask(null, currentTime);
            }
        }
    }

    private checkPreemptCFS(): boolean {
        if (!this.currentTask) return true;
        if (this.currentTask.sliceRemaining <= 0) return true;
        const minTask = this.runqueue.getMin();
        if (minTask) {
            const diff = this.currentTask.vruntime - minTask.vruntime;
            const gran = WAKEUP_GRANULARITY * (NICE_0_LOAD / this.currentTask.weight);
            if (diff > gran) return true;
        }
        return false;
    }

    private scheduleEEVDF(currentTime: number) {
        // Update eligibility for all tasks based on latest avgVirtualTime
        const allInQueue = this.runqueue.getAllTasks();
        this.updateTaskMetrics([...allInQueue, ...(this.currentTask ? [this.currentTask] : [])]);

        const needsResched = this.checkPreemptEEVDF();
        if (needsResched || !this.currentTask) {
            if (this.currentTask && this.currentTask.state === 'RUNNING') {
                this.currentTask.state = 'READY';
                // currentTask VD was updated during tick(), so re-insertion uses fresh key
                this.runqueue.insert(this.currentTask);
            }

            const eligibleTasks = this.runqueue.getAllTasks().filter((t: Task) => t.isEligible);
            
            let next: Task | null = null;
            if (eligibleTasks.length > 0) {
                next = eligibleTasks.reduce((prev, curr) => curr.virtualDeadline < prev.virtualDeadline ? curr : prev);
            } else {
                const all = this.runqueue.getAllTasks();
                if (all.length > 0) {
                    next = all.reduce((prev, curr) => curr.vruntime < prev.vruntime ? curr : prev);
                    if (next && next.vruntime > this.avgVirtualTime) {
                        this.avgVirtualTime = next.vruntime;
                        // Fast-forward V(t) makes the new 'next' eligible
                        next.isEligible = true;
                    }
                }
            }

            if (next) {
                this.runqueue.removeById(next.id);
                this.switchToTask(next, currentTime);
                this.currentTask!.sliceRemaining = this.currentTask!.requestedSlice;
            } else {
                this.switchToTask(null, currentTime);
            }
        }
    }

    private checkPreemptEEVDF(): boolean {
        if (!this.currentTask) return true;
        if (this.currentTask.sliceRemaining <= 0) return true;
        
        const currentVD = this.currentTask.virtualDeadline;
        const betterTask = this.runqueue.getAllTasks().find(t => t.isEligible && t.virtualDeadline < currentVD);
        
        return !!betterTask;
    }

    private switchToTask(task: Task | null, currentTime: number) {
        if (this.currentTask !== task) {
            if (this.currentTask && this.currentTask.executionHistory.length > 0) {
                this.currentTask.executionHistory[this.currentTask.executionHistory.length - 1].end = currentTime;
            }
            this.currentTask = task;
            if (this.currentTask) {
                this.currentTask.state = 'RUNNING';
                if (this.currentTask.startTime === null) this.currentTask.startTime = currentTime;
                this.currentTask.executionHistory.push({ start: currentTime, end: currentTime, coreId: this.id });
            }
        }
    }

    addTask(task: Task) {
        task.vruntime = Math.max(task.vruntime, this.minVruntime);
        this.updateTaskVD(task);
        task.lag = task.weight * (this.avgVirtualTime - task.vruntime);
        task.isEligible = task.vruntime <= this.avgVirtualTime;
        
        this.totalWeight += task.weight;
        this.runqueue.insert(task);
        this.updateMinVruntime();
    }

    sleepTask(taskId: string, currentTime: number) {
        if (this.currentTask?.id === taskId) {
            this.currentTask.state = 'SLEEPING';
            this.totalWeight -= this.currentTask.weight;
            this.switchToTask(null, currentTime);
        } else {
            const tasks = this.runqueue.getAllTasks();
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                task.state = 'SLEEPING';
                this.totalWeight -= task.weight;
                this.runqueue.removeById(taskId);
            }
        }
    }

    wakeTask(task: Task) {
        task.state = 'READY';
        task.vruntime = Math.max(task.vruntime, this.minVruntime);
        this.updateTaskVD(task);
        task.lag = task.weight * (this.avgVirtualTime - task.vruntime);
        task.isEligible = task.vruntime <= this.avgVirtualTime;

        this.totalWeight += task.weight;
        this.runqueue.insert(task);
        this.updateMinVruntime();
    }
}

export class Scheduler {
    cores: Core[];
    currentTime: number = 0;
    unstartedTasks: Task[] = [];
    allTasks: Task[] = [];
    type: SchedulerType;
    tickRateMs: number = 0.1;

    constructor(numCores: number, type: SchedulerType) {
        this.cores = Array.from({ length: numCores }, (_, i) => new Core(i, type));
        this.type = type;
    }

    addTask(task: Task) {
        this.unstartedTasks.push(task);
        this.allTasks.push(task);
    }

    step() {
        const arriving = this.unstartedTasks.filter(t => t.arrivalTime <= this.currentTime);
        this.unstartedTasks = this.unstartedTasks.filter(t => t.arrivalTime > this.currentTime);

        for (const task of arriving) {
            let bestCore = this.cores[0];
            for (let i = 1; i < this.cores.length; i++) {
                if (this.cores[i].totalWeight < bestCore.totalWeight) bestCore = this.cores[i];
            }
            bestCore.addTask(task);
        }

        for (const core of this.cores) {
            core.tick(this.tickRateMs, this.currentTime);
            core.schedule(this.currentTime);
        }

        // Global update for UI consistency
        for (const core of this.cores) {
            const allTasksInCore = [...core.runqueue.getAllTasks(), ...(core.currentTask ? [core.currentTask] : [])];
            core.updateTaskMetrics(allTasksInCore);
        }

        for (const task of this.allTasks) {
            if (task.state === 'READY' && task.arrivalTime <= this.currentTime) task.waitTime += this.tickRateMs;
        }

        this.currentTime = Math.round((this.currentTime + this.tickRateMs) * 1000) / 1000;
    }

    toggleSleep(taskId: string) {
        const task = this.allTasks.find(t => t.id === taskId);
        if (!task) return;
        if (task.state === 'SLEEPING') {
            let bestCore = this.cores[0];
            for (let i = 1; i < this.cores.length; i++) {
                if (this.cores[i].totalWeight < bestCore.totalWeight) bestCore = this.cores[i];
            }
            bestCore.wakeTask(task);
        } else if (task.state === 'RUNNING' || task.state === 'READY') {
            for (const core of this.cores) {
                core.sleepTask(taskId, this.currentTime);
            }
        }
    }
}
