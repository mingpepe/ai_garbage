import React, { useEffect, useRef } from 'react';
import { RBNode, Color } from '../engine/rbtree';

interface Props {
    root: RBNode | null;
    width?: number;
    height?: number;
    type: 'CFS' | 'EEVDF';
}

export const RBTreeViewer: React.FC<Props> = ({ root, width = 600, height = 300, type }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const drawNode = (ctx: CanvasRenderingContext2D, node: RBNode | null, x: number, y: number, dx: number) => {
        if (!node) return;

        // Draw connections first
        if (node.left) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - dx, y + 50);
            ctx.strokeStyle = '#666';
            ctx.stroke();
            drawNode(ctx, node.left, x - dx, y + 50, dx / 2);
        }
        if (node.right) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + dx, y + 50);
            ctx.strokeStyle = '#666';
            ctx.stroke();
            drawNode(ctx, node.right, x + dx, y + 50, dx / 2);
        }

        // Draw node
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, 2 * Math.PI);
        
        // EEVDF visual: fade out ineligible tasks
        const isEligible = node.task.isEligible !== false;
        ctx.globalAlpha = isEligible ? 1.0 : 0.3;
        
        ctx.fillStyle = node.color === Color.RED ? '#ef4444' : '#111827';
        ctx.fill();
        ctx.strokeStyle = isEligible ? '#fff' : '#666';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = isEligible ? '#fff' : '#000';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.task.name, x, y);
        
        ctx.globalAlpha = 1.0; // Reset alpha

        // Draw vruntime/VD below node
        ctx.fillStyle = '#333';
        ctx.font = '10px Arial';
        const label = type === 'CFS' ? `v:${Math.round(node.task.vruntime)}` : `vd:${Math.round(node.task.virtualDeadline)}`;
        ctx.fillText(label, x, y + 25);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);
        if (root) {
            drawNode(ctx, root, width / 2, 30, width / 4);
        } else {
            ctx.fillStyle = '#999';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Runqueue is empty', width / 2, height / 2);
        }
    }, [root, width, height]);

    return (
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '10px', backgroundColor: '#fff' }}>
            <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block', margin: '0 auto' }} />
        </div>
    );
};
