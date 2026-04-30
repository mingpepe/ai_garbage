import React, { useState, useEffect, useRef } from 'react';
import { Scheduler, type SchedulerType } from './engine/scheduler';
import { type Task, NICE_TO_WEIGHT } from './engine/types';
import { GanttChart } from './components/GanttChart';
import { RBTreeViewer } from './components/RBTreeViewer';
import { Play, Pause, StepForward, Plus, RefreshCw, Moon, Sun } from 'lucide-react';
import './App.css';

function App() {
  const [numCores, setNumCores] = useState(1);
  const [schedulerType, setSchedulerType] = useState<SchedulerType>('CFS');
  const [scheduler, setScheduler] = useState<Scheduler>(new Scheduler(numCores, schedulerType));
  const [isPlaying, setIsPlaying] = useState(false);
  const speed = 50; 
  
  const [, setTick] = useState(0);
  const timerRef = useRef<number | null>(null);

  const [taskName, setTaskName] = useState('');
  const [taskWorkload, setTaskWorkload] = useState(100);
  const [taskNice, setTaskNice] = useState(0);
  const [taskLatency, setTaskLatency] = useState(10);
  const [taskIdCounter, setTaskIdCounter] = useState(1);

  const stepSimulation = () => {
    scheduler.step();
    setTick(t => t + 1);
  };

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = window.setInterval(stepSimulation, speed);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, scheduler]);

  const resetScheduler = () => {
    setIsPlaying(false);
    setScheduler(new Scheduler(numCores, schedulerType));
    setTick(0);
    setTaskIdCounter(1);
  };

  const handleCoresChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cores = parseInt(e.target.value);
    setNumCores(cores);
    setIsPlaying(false);
    setScheduler(new Scheduler(cores, schedulerType));
    setTick(0);
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value as SchedulerType;
    setSchedulerType(type);
    setIsPlaying(false);
    setScheduler(new Scheduler(numCores, type));
    setTick(0);
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const newTask: Task = {
      id: `t${taskIdCounter}`,
      name: taskName || `T${taskIdCounter}`,
      arrivalTime: scheduler.currentTime,
      totalWorkload: taskWorkload,
      remainingWorkload: taskWorkload,
      nice: taskNice,
      weight: NICE_TO_WEIGHT[taskNice] || 1024,
      requestedSlice: taskLatency,
      state: 'READY',
      vruntime: 0,
      lag: 0,
      virtualDeadline: 0,
      isEligible: true,
      sliceRemaining: 0,
      startTime: null,
      endTime: null,
      waitTime: 0,
      executedTime: 0,
      executionHistory: []
    };
    scheduler.addTask(newTask);
    setTaskIdCounter(c => c + 1);
    setTaskName('');
    setTick(t => t + 1);
  };

  const toggleSleep = (taskId: string) => {
    scheduler.toggleSleep(taskId);
    setTick(t => t + 1);
  };

  // Scenarios
  const runScenario = (name: string) => {
    setIsPlaying(false);
    let s: Scheduler;
    switch(name) {
      case 'cfs-fairness':
        setSchedulerType('CFS');
        s = new Scheduler(1, 'CFS');
        s.addTask({ id: 't1', name: 'Task A (N0)', arrivalTime: 0, totalWorkload: 500, remainingWorkload: 500, nice: 0, weight: 1024, requestedSlice: 10, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        s.addTask({ id: 't2', name: 'Task B (N0)', arrivalTime: 0, totalWorkload: 500, remainingWorkload: 500, nice: 0, weight: 1024, requestedSlice: 10, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        setScheduler(s);
        break;
      case 'cfs-weight':
        setSchedulerType('CFS');
        s = new Scheduler(1, 'CFS');
        s.addTask({ id: 't1', name: 'Task A (N-5)', arrivalTime: 0, totalWorkload: 500, remainingWorkload: 500, nice: -5, weight: NICE_TO_WEIGHT[-5], requestedSlice: 10, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        s.addTask({ id: 't2', name: 'Task B (N5)', arrivalTime: 0, totalWorkload: 500, remainingWorkload: 500, nice: 5, weight: NICE_TO_WEIGHT[5], requestedSlice: 10, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        setScheduler(s);
        break;
      case 'cfs-preemption':
        setSchedulerType('CFS');
        s = new Scheduler(1, 'CFS');
        s.addTask({ id: 't1', name: 'Long Task (N0)', arrivalTime: 0, totalWorkload: 1000, remainingWorkload: 1000, nice: 0, weight: 1024, requestedSlice: 10, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        // Give new task a higher priority (nice -10) to force a significant vruntime gap quickly
        s.addTask({ id: 't2', name: 'Priority (N-10)', arrivalTime: 50, totalWorkload: 200, remainingWorkload: 200, nice: -10, weight: NICE_TO_WEIGHT[-10], requestedSlice: 10, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        setScheduler(s);
        break;
      case 'eevdf-latency':
        setSchedulerType('EEVDF');
        s = new Scheduler(1, 'EEVDF');
        s.addTask({ id: 't1', name: 'Bulk (r=100)', arrivalTime: 0, totalWorkload: 1000, remainingWorkload: 1000, nice: 0, weight: 1024, requestedSlice: 100, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        s.addTask({ id: 't2', name: 'Inter (r=10)', arrivalTime: 1, totalWorkload: 200, remainingWorkload: 200, nice: 0, weight: 1024, requestedSlice: 10, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        setScheduler(s);
        break;
      case 'eevdf-preemption':
        setSchedulerType('EEVDF');
        s = new Scheduler(1, 'EEVDF');
        s.addTask({ id: 't1', name: 'Running (r=50)', arrivalTime: 0, totalWorkload: 1000, remainingWorkload: 1000, nice: 0, weight: 1024, requestedSlice: 50, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        s.addTask({ id: 't2', name: 'Quick (r=5)', arrivalTime: 20, totalWorkload: 100, remainingWorkload: 100, nice: 0, weight: 1024, requestedSlice: 5, state: 'READY', vruntime: 0, lag: 0, virtualDeadline: 0, isEligible: true, sliceRemaining: 0, startTime: null, endTime: null, waitTime: 0, executedTime: 0, executionHistory: [] });
        setScheduler(s);
        break;
    }
    setTick(t => t + 1);
  };

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>CPU Scheduler Simulator</h1>
          <p className="subtitle">Visualizing CFS and EEVDF Mechanics</p>
        </div>
        <div className="controls">
          <select value={schedulerType} onChange={handleTypeChange}>
            <option value="CFS">CFS (Completely Fair Scheduler)</option>
            <option value="EEVDF">EEVDF (Earliest Eligible Virtual Deadline First)</option>
          </select>
          <select value={numCores} onChange={handleCoresChange}>
            <option value={1}>1 Core</option>
            <option value={2}>2 Cores</option>
            <option value={4}>4 Cores</option>
          </select>
          <button onClick={() => setIsPlaying(!isPlaying)} className={`btn ${isPlaying ? 'btn-pause' : 'btn-play'}`}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button onClick={stepSimulation} disabled={isPlaying} className="btn btn-secondary">
            <StepForward size={16} /> Step
          </button>
          <button onClick={resetScheduler} className="btn btn-danger">
            <RefreshCw size={16} /> Reset
          </button>
        </div>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <div className="panel">
            <h3>Add Task</h3>
            <form onSubmit={handleAddTask} className="task-form">
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="T1" />
              </div>
              <div className="form-group">
                <label>Workload (ms)</label>
                <input type="number" value={taskWorkload} onChange={e => setTaskWorkload(parseInt(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label>Nice (-20 to 19)</label>
                <input type="number" min="-20" max="19" value={taskNice} onChange={e => setTaskNice(parseInt(e.target.value) || 0)} />
              </div>
              {schedulerType === 'EEVDF' && (
                <div className="form-group">
                  <label>Latency Request (ms)</label>
                  <input type="number" value={taskLatency} onChange={e => setTaskLatency(parseInt(e.target.value) || 0)} />
                </div>
              )}
              <button type="submit" className="btn btn-primary w-full"><Plus size={16} /> Add Task</button>
            </form>
          </div>

          <div className="panel">
            <h3>Scenarios</h3>
            <div className="scenario-grid">
              <button onClick={() => runScenario('cfs-fairness')} className="btn-small">CFS Fairness</button>
              <button onClick={() => runScenario('cfs-weight')} className="btn-small">CFS Weights</button>
              <button onClick={() => runScenario('cfs-preemption')} className="btn-small">CFS Preempt</button>
              <button onClick={() => runScenario('eevdf-latency')} className="btn-small">EEVDF Latency</button>
              <button onClick={() => runScenario('eevdf-preemption')} className="btn-small">EEVDF Preempt</button>
            </div>
          </div>

          <div className="panel stats">
            <h3>Global Stats</h3>
            <p><strong>Current Time:</strong> {scheduler.currentTime.toFixed(1)} ms</p>
            <p><strong>Tick Rate:</strong> {scheduler.tickRateMs} ms</p>
          </div>
        </div>

        <div className="visualization">
          <GanttChart tasks={scheduler.allTasks} currentTime={scheduler.currentTime} coresCount={numCores} />
          
          <div className="trees-container">
            {scheduler.cores.map(core => (
              <div key={core.id} className="tree-wrapper">
                <h4>Core {core.id} Runqueue</h4>
                <div className="vtime-stats">
                  <span>min_v: {Math.round(core.minVruntime)}</span>
                  {schedulerType === 'EEVDF' && <span>V(t)*: {Math.round(core.avgVirtualTime)}</span>}
                </div>
                <RBTreeViewer root={core.runqueue.root} width={400} height={250} type={schedulerType} />
                <p className="caption">*Simplified V(t) approximation</p>
              </div>
            ))}
          </div>

          <div className="task-list">
            <h3>Task Details</h3>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>State</th>
                  <th>Nice</th>
                  <th>Progress</th>
                  <th>Vruntime</th>
                  {schedulerType === 'EEVDF' && <th>Lag</th>}
                  {schedulerType === 'EEVDF' && <th>VD</th>}
                  {schedulerType === 'EEVDF' && <th>Eligible</th>}
                  <th>Wait</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {scheduler.allTasks.map(t => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.name}</td>
                    <td><span className={`badge badge-${t.state.toLowerCase()}`}>{t.state}</span></td>
                    <td>{t.nice}</td>
                    <td>{t.executedTime.toFixed(1)} / {t.totalWorkload}</td>
                    <td>{Math.round(t.vruntime)}</td>
                    {schedulerType === 'EEVDF' && <td>{Math.round(t.lag)}</td>}
                    {schedulerType === 'EEVDF' && <td>{Math.round(t.virtualDeadline)}</td>}
                    {schedulerType === 'EEVDF' && (
                      <td>
                        <span className={`status-dot ${t.isEligible ? 'dot-green' : 'dot-red'}`}></span>
                        {t.isEligible ? 'Yes' : 'No'}
                      </td>
                    )}
                    <td>{t.waitTime.toFixed(1)}</td>
                    <td>
                      {t.state !== 'DONE' && (
                        <button onClick={() => toggleSleep(t.id)} className="btn-icon" title={t.state === 'SLEEPING' ? 'Wake' : 'Sleep'}>
                          {t.state === 'SLEEPING' ? <Sun size={14} /> : <Moon size={14} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
