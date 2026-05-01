import type { Level } from './types';

const PALETTE_NATURE = ['#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93', '#2D6A4F', '#D62828', '#000000'];

export const LEVELS: Level[] = [
  // EASY
  {
    id: 'easy_h1',
    name: '小小正方形',
    difficulty: 'easy',
    width: 6,
    height: 6,
    symmetryType: 'horizontal',
    palette: PALETTE_NATURE,
    pattern: [
      [null, null, null, null, null, null],
      [null, 0, 0, null, null, null],
      [null, 0, 0, null, null, null],
      [null, 0, 0, null, null, null],
      [null, 0, 0, null, null, null],
      [null, null, null, null, null, null],
    ]
  },
  {
    id: 'easy_v1',
    name: '藍天大海',
    difficulty: 'easy',
    width: 6,
    height: 4,
    symmetryType: 'vertical',
    palette: PALETTE_NATURE,
    pattern: [
      [3, 3, 3, 3, 3, 3],
      [3, 3, 3, 3, 3, 3],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
    ]
  },

  // NORMAL
  {
    id: 'normal_h1',
    name: '小樹苗',
    difficulty: 'normal',
    width: 10,
    height: 10,
    symmetryType: 'horizontal',
    palette: PALETTE_NATURE,
    pattern: [
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, 2, null, null, null, null, null],
      [null, null, null, 2, 2, null, null, null, null, null],
      [null, null, 2, 2, 2, null, null, null, null, null],
      [null, 2, 2, 2, 2, null, null, null, null, null],
      [2, 2, 2, 2, 2, null, null, null, null, null],
      [null, null, null, 4, 4, null, null, null, null, null],
      [null, null, null, 4, 4, null, null, null, null, null],
      [null, null, null, 4, 4, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
    ]
  },
  {
    id: 'normal_v1',
    name: '長長領結',
    difficulty: 'normal',
    width: 6,
    height: 8,
    symmetryType: 'vertical',
    palette: PALETTE_NATURE,
    pattern: [
      [0, 0, 0, 0, 0, 0],
      [null, 0, 0, 0, 0, null],
      [null, null, 0, 0, null, null],
      [null, null, 0, 0, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
    ]
  },
  {
    id: 'normal_d1',
    name: '斜斜樓梯',
    difficulty: 'normal',
    width: 6,
    height: 6,
    symmetryType: 'diagonal-backslash',
    palette: PALETTE_NATURE,
    pattern: [
      [null, null, null, null, null, null],
      [1, null, null, null, null, null],
      [1, 1, null, null, null, null],
      [1, 1, 1, null, null, null],
      [1, 1, 1, 1, null, null],
      [1, 1, 1, 1, 1, null],
    ]
  },

  // HARD
  {
    id: 'hard_h1',
    name: '繽紛蝴蝶',
    difficulty: 'hard',
    width: 14,
    height: 14,
    symmetryType: 'horizontal',
    palette: PALETTE_NATURE,
    pattern: Array(14).fill(null).map((_, r) => {
        if (r === 2) return [null, null, null, null, null, 7, null, ...Array(7).fill(null)];
        if (r === 3) return [null, 0, 0, 0, null, 7, 7, ...Array(7).fill(null)];
        if (r === 4) return [0, 0, 1, 1, 0, 7, 7, ...Array(7).fill(null)];
        if (r === 5) return [0, 1, 1, 1, 1, 0, 7, ...Array(7).fill(null)];
        if (r === 6) return [0, 1, 1, 1, 1, 0, 0, ...Array(7).fill(null)];
        if (r === 7) return [null, 0, 1, 1, 0, 0, 0, ...Array(7).fill(null)];
        if (r === 8) return [null, null, 0, 0, 2, 0, 0, ...Array(7).fill(null)];
        if (r === 9) return [null, 0, 3, 3, 3, 0, 0, ...Array(7).fill(null)];
        if (r === 10) return [0, 3, 3, 3, 3, 3, 0, ...Array(7).fill(null)];
        if (r === 11) return [0, 3, 3, 3, 3, 0, null, ...Array(7).fill(null)];
        return Array(14).fill(null);
    })
  },
  {
    id: 'hard_d2',
    name: '鑽石之星',
    difficulty: 'hard',
    width: 10,
    height: 10,
    symmetryType: 'diagonal-slash',
    palette: PALETTE_NATURE,
    pattern: Array(10).fill(null).map((_, r) => {
        const row = Array(10).fill(null);
        for (let c = 0; c < 10; c++) {
            if ((c + r) < 9) {
                if ((c + r) > 4 && (c > 2 || r > 2)) row[c] = (c + r) % 5;
            }
        }
        return row;
    })
  }
];
