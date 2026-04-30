import type { Task } from './types';

export const Color = {
    RED: 0,
    BLACK: 1
} as const;

export type Color = typeof Color[keyof typeof Color];

export class RBNode {
    task: Task;
    color: Color;
    left: RBNode | null;
    right: RBNode | null;
    parent: RBNode | null;

    constructor(task: Task, color: Color = Color.RED) {
        this.task = task;
        this.color = color;
        this.left = null;
        this.right = null;
        this.parent = null;
    }
}

export class RBTree {
    root: RBNode | null = null;
    private minNode: RBNode | null = null;
    // To support EEVDF which compares virtualDeadline when picking among eligible.
    // Standard CFS uses vruntime.
    compareMode: 'vruntime' | 'virtualDeadline' = 'vruntime';

    constructor(compareMode: 'vruntime' | 'virtualDeadline' = 'vruntime') {
        this.compareMode = compareMode;
    }

    private compare(a: Task, b: Task): number {
        if (this.compareMode === 'vruntime') {
            if (a.vruntime === b.vruntime) return a.id.localeCompare(b.id);
            return a.vruntime - b.vruntime;
        } else {
            if (a.virtualDeadline === b.virtualDeadline) return a.id.localeCompare(b.id);
            return a.virtualDeadline - b.virtualDeadline;
        }
    }

    insert(task: Task) {
        const node = new RBNode(task);
        if (this.root === null) {
            node.color = Color.BLACK;
            this.root = node;
            this.updateMinNode();
            return;
        }

        let current: RBNode | null = this.root;
        let parent: RBNode | null = null;

        while (current !== null) {
            parent = current;
            if (this.compare(node.task, current.task) < 0) {
                current = current.left;
            } else {
                current = current.right;
            }
        }

        node.parent = parent;
        if (parent === null) {
            // Should not happen as root checked
        } else if (this.compare(node.task, parent.task) < 0) {
            parent.left = node;
        } else {
            parent.right = node;
        }

        this.insertFixup(node);
        this.updateMinNode();
    }

    private insertFixup(node: RBNode) {
        let k = node;
        while (k.parent !== null && k.parent.color === Color.RED) {
            if (k.parent === k.parent.parent?.left) {
                let u = k.parent.parent.right;
                if (u !== null && u.color === Color.RED) {
                    k.parent.color = Color.BLACK;
                    u.color = Color.BLACK;
                    k.parent.parent.color = Color.RED;
                    k = k.parent.parent;
                } else {
                    if (k === k.parent.right) {
                        k = k.parent;
                        this.leftRotate(k);
                    }
                    k.parent!.color = Color.BLACK;
                    k.parent!.parent!.color = Color.RED;
                    this.rightRotate(k.parent!.parent!);
                }
            } else {
                let u = k.parent.parent?.left || null;
                if (u !== null && u.color === Color.RED) {
                    k.parent.color = Color.BLACK;
                    u.color = Color.BLACK;
                    k.parent.parent!.color = Color.RED;
                    k = k.parent.parent!;
                } else {
                    if (k === k.parent.left) {
                        k = k.parent;
                        this.rightRotate(k);
                    }
                    k.parent!.color = Color.BLACK;
                    k.parent!.parent!.color = Color.RED;
                    this.leftRotate(k.parent!.parent!);
                }
            }
            if (k === this.root) break;
        }
        this.root!.color = Color.BLACK;
    }

    private leftRotate(x: RBNode) {
        let y = x.right!;
        x.right = y.left;
        if (y.left !== null) y.left.parent = x;
        y.parent = x.parent;
        if (x.parent === null) this.root = y;
        else if (x === x.parent.left) x.parent.left = y;
        else x.parent.right = y;
        y.left = x;
        x.parent = y;
    }

    private rightRotate(y: RBNode) {
        let x = y.left!;
        y.left = x.right;
        if (x.right !== null) x.right.parent = y;
        x.parent = y.parent;
        if (y.parent === null) this.root = x;
        else if (y === y.parent.right) y.parent.right = x;
        else y.parent.left = x;
        x.right = y;
        y.parent = x;
    }

    remove(task: Task) {
        let node = this.findNode(this.root, task);
        if (node === null) return;

        let y = node;
        let yOriginalColor = y.color;
        let x: RBNode | null;

        if (node.left === null) {
            x = node.right;
            this.transplant(node, node.right);
        } else if (node.right === null) {
            x = node.left;
            this.transplant(node, node.left);
        } else {
            y = this.minimum(node.right);
            yOriginalColor = y.color;
            x = y.right;
            if (y.parent === node) {
                if (x !== null) x.parent = y;
            } else {
                this.transplant(y, y.right);
                y.right = node.right;
                y.right.parent = y;
            }
            this.transplant(node, y);
            y.left = node.left;
            y.left.parent = y;
            y.color = node.color;
        }

        if (yOriginalColor === Color.BLACK && x !== null) {
            this.deleteFixup(x);
        }
        this.updateMinNode();
    }

    private transplant(u: RBNode, v: RBNode | null) {
        if (u.parent === null) this.root = v;
        else if (u === u.parent.left) u.parent.left = v;
        else u.parent.right = v;
        if (v !== null) v.parent = u.parent;
    }

    private deleteFixup(x: RBNode) {
        while (x !== this.root && x.color === Color.BLACK) {
            if (x === x.parent!.left) {
                let w = x.parent!.right!;
                if (w.color === Color.RED) {
                    w.color = Color.BLACK;
                    x.parent!.color = Color.RED;
                    this.leftRotate(x.parent!);
                    w = x.parent!.right!;
                }
                if ((w.left === null || w.left.color === Color.BLACK) &&
                    (w.right === null || w.right.color === Color.BLACK)) {
                    w.color = Color.RED;
                    x = x.parent!;
                } else {
                    if (w.right === null || w.right.color === Color.BLACK) {
                        if (w.left !== null) w.left.color = Color.BLACK;
                        w.color = Color.RED;
                        this.rightRotate(w);
                        w = x.parent!.right!;
                    }
                    w.color = x.parent!.color;
                    x.parent!.color = Color.BLACK;
                    if (w.right !== null) w.right.color = Color.BLACK;
                    this.leftRotate(x.parent!);
                    x = this.root!;
                }
            } else {
                let w = x.parent!.left!;
                if (w.color === Color.RED) {
                    w.color = Color.BLACK;
                    x.parent!.color = Color.RED;
                    this.rightRotate(x.parent!);
                    w = x.parent!.left!;
                }
                if ((w.right === null || w.right.color === Color.BLACK) &&
                    (w.left === null || w.left.color === Color.BLACK)) {
                    w.color = Color.RED;
                    x = x.parent!;
                } else {
                    if (w.left === null || w.left.color === Color.BLACK) {
                        if (w.right !== null) w.right.color = Color.BLACK;
                        w.color = Color.RED;
                        this.leftRotate(w);
                        w = x.parent!.left!;
                    }
                    w.color = x.parent!.color;
                    x.parent!.color = Color.BLACK;
                    if (w.left !== null) w.left.color = Color.BLACK;
                    this.rightRotate(x.parent!);
                    x = this.root!;
                }
            }
        }
        x.color = Color.BLACK;
    }

    private findNode(node: RBNode | null, task: Task): RBNode | null {
        if (node === null) return null;
        if (node.task.id === task.id) return node;
        let res = this.findNode(node.left, task);
        if (res) return res;
        return this.findNode(node.right, task);
    }

    private minimum(node: RBNode): RBNode {
        while (node.left !== null) {
            node = node.left;
        }
        return node;
    }

    private updateMinNode() {
        if (this.root === null) {
            this.minNode = null;
        } else {
            this.minNode = this.minimum(this.root);
        }
    }

    getMinVruntime(): number {
        if (!this.root) return Infinity;
        return this.recursiveMinVruntime(this.root);
    }

    private recursiveMinVruntime(node: RBNode): number {
        let min = node.task.vruntime;
        if (node.left) {
            const leftMin = this.recursiveMinVruntime(node.left);
            if (leftMin < min) min = leftMin;
        }
        if (node.right) {
            const rightMin = this.recursiveMinVruntime(node.right);
            if (rightMin < min) min = rightMin;
        }
        return min;
    }

    getMin(): Task | null {
        return this.minNode ? this.minNode.task : null;
    }

    getAllTasks(): Task[] {
        const tasks: Task[] = [];
        this.inOrderTraverse(this.root, tasks);
        return tasks;
    }

    private inOrderTraverse(node: RBNode | null, tasks: Task[]) {
        if (node !== null) {
            this.inOrderTraverse(node.left, tasks);
            tasks.push(node.task);
            this.inOrderTraverse(node.right, tasks);
        }
    }

    // Explicitly find task and remove it (safer if key changed, though we should re-insert)
    removeById(id: string) {
        const node = this.findNodeById(this.root, id);
        if (node) this.removeNode(node);
    }

    private findNodeById(node: RBNode | null, id: string): RBNode | null {
        if (!node) return null;
        if (node.task.id === id) return node;
        return this.findNodeById(node.left, id) || this.findNodeById(node.right, id);
    }

    private removeNode(node: RBNode) {
        let y = node;
        let yOriginalColor = y.color;
        let x: RBNode | null;

        if (node.left === null) {
            x = node.right;
            this.transplant(node, node.right);
        } else if (node.right === null) {
            x = node.left;
            this.transplant(node, node.left);
        } else {
            y = this.minimum(node.right);
            yOriginalColor = y.color;
            x = y.right;
            if (y.parent === node) {
                if (x !== null) x.parent = y;
            } else {
                this.transplant(y, y.right);
                y.right = node.right;
                y.right.parent = y;
            }
            this.transplant(node, y);
            y.left = node.left;
            y.left.parent = y;
            y.color = node.color;
        }

        if (yOriginalColor === Color.BLACK && x !== null) {
            this.deleteFixup(x);
        }
        this.updateMinNode();
    }
}
