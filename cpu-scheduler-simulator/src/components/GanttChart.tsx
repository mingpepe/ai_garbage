import React from 'react';
import type { Task } from '../engine/types';

interface Props {
    tasks: Task[];
    currentTime: number;
    coresCount: number;
}

const COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
];

export const GanttChart: React.FC<Props> = ({ tasks, currentTime, coresCount }) => {
    const pixelsPerMs = 2; // scale

    return (
        <div style={{ overflowX: 'auto', border: '1px solid #ddd', padding: '10px', backgroundColor: '#fafafa', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Gantt Chart</h3>
            <div style={{ position: 'relative', height: `${coresCount * 50 + 30}px`, minWidth: `${currentTime * pixelsPerMs}px` }}>
                {/* Timeline */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '20px', borderBottom: '1px solid #ccc' }}>
                    {Array.from({ length: Math.ceil(currentTime / 50) + 1 }).map((_, i) => (
                        <div key={i} style={{ position: 'absolute', left: `${i * 50 * pixelsPerMs}px`, top: 0, fontSize: '10px', color: '#666' }}>
                            {i * 50}ms
                        </div>
                    ))}
                </div>

                {/* Cores */}
                {Array.from({ length: coresCount }).map((_, coreId) => (
                    <div key={coreId} style={{ position: 'absolute', top: `${20 + coreId * 50}px`, left: 0, right: 0, height: '40px', borderBottom: '1px dashed #eee' }}>
                        <div style={{ position: 'absolute', left: '-50px', top: '10px', fontWeight: 'bold', fontSize: '12px' }}>
                            Core {coreId}
                        </div>
                    </div>
                ))}

                {/* Task Executions */}
                {tasks.map((task) => 
                    task.executionHistory.map((exec, execIdx) => (
                        <div
                            key={`${task.id}-${execIdx}`}
                            style={{
                                position: 'absolute',
                                top: `${20 + exec.coreId * 50 + 5}px`,
                                left: `${exec.start * pixelsPerMs}px`,
                                width: `${Math.max(1, (exec.end - exec.start) * pixelsPerMs)}px`,
                                height: '30px',
                                backgroundColor: COLORS[parseInt(task.id.replace('t', '')) % COLORS.length] || '#3b82f6',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                color: 'white',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                            title={`Task: ${task.name}\nStart: ${exec.start}\nEnd: ${exec.end}`}
                        >
                            {task.name}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
