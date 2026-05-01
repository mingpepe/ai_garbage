import type { Level, CellShape, SymmetryType } from '../types';

export const getMirroredShape = (shape: CellShape, symmetry: SymmetryType): CellShape => {
    if (shape === 'square') return 'square';
    
    switch (symmetry) {
        case 'horizontal':
            if (shape === 'tri-tl') return 'tri-tr';
            if (shape === 'tri-tr') return 'tri-tl';
            if (shape === 'tri-bl') return 'tri-br';
            if (shape === 'tri-br') return 'tri-bl';
            break;
        case 'vertical':
            if (shape === 'tri-tl') return 'tri-bl';
            if (shape === 'tri-bl') return 'tri-tl';
            if (shape === 'tri-tr') return 'tri-br';
            if (shape === 'tri-br') return 'tri-tr';
            break;
        case 'diagonal-backslash': // Mirror across \
            if (shape === 'tri-tl') return 'tri-tl';
            if (shape === 'tri-br') return 'tri-br';
            if (shape === 'tri-tr') return 'tri-bl';
            if (shape === 'tri-bl') return 'tri-tr';
            break;
        case 'diagonal-slash': // Mirror across /
            if (shape === 'tri-tr') return 'tri-tr';
            if (shape === 'tri-bl') return 'tri-bl';
            if (shape === 'tri-tl') return 'tri-br';
            if (shape === 'tri-br') return 'tri-tl';
            break;
    }
    return shape;
};

/**
 * Returns true if (r, c) belongs to the template area for the given level.
 */
export const isTemplateArea = (r: number, c: number, level: Level): boolean => {
    const { width, height, symmetryType } = level;
    switch (symmetryType) {
        case 'horizontal': return c < width / 2;
        case 'vertical': return r < height / 2;
        case 'diagonal-backslash': return c < r; // Bottom-left triangle is template
        case 'diagonal-slash': return (c + r) < (width - 1); // Top-left triangle is template
        default: return false;
    }
};

/**
 * Maps any cell (r, c) to its symmetrical counterpart.
 */
export const getMirrorCell = (r: number, c: number, level: Level): { r: number, c: number } => {
    const { width, height, symmetryType } = level;
    switch (symmetryType) {
        case 'horizontal': return { r, c: width - 1 - c };
        case 'vertical': return { r: height - 1 - r, c };
        case 'diagonal-backslash': return { r: c, c: r };
        case 'diagonal-slash': return { r: width - 1 - c, c: height - 1 - r };
        default: return { r, c };
    }
};

export const checkGridCompletion = (grid: (string | null)[][], level: Level): { isPerfect: boolean, correctCount: number, totalRequired: number } => {
    const { width, height } = level;
    let correctCount = 0;
    let totalRequired = 0;
    let isPerfect = true;

    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            if (isTemplateArea(r, c, level)) continue; // Only check user area

            const mirror = getMirrorCell(r, c, level);
            const targetColorIdx = level.pattern[mirror.r][mirror.c];
            const targetColor = targetColorIdx !== null ? level.palette[targetColorIdx] : null;
            
            if (targetColor !== null) totalRequired++;
            
            if (grid[r][c] === targetColor) {
                if (targetColor !== null) correctCount++;
            } else {
                isPerfect = false;
            }
        }
    }

    return { isPerfect, correctCount, totalRequired };
};

export const getHintCell = (grid: (string | null)[][], level: Level): { r: number, c: number } | null => {
    const { width, height } = level;
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            if (isTemplateArea(r, c, level)) continue;

            const mirror = getMirrorCell(r, c, level);
            const targetColorIdx = level.pattern[mirror.r][mirror.c];
            const targetColor = targetColorIdx !== null ? level.palette[targetColorIdx] : null;
            
            if (grid[r][c] !== targetColor) {
                return { r, c };
            }
        }
    }
    return null;
};
