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
  },
  // NEW HARD LEVELS
  {
    id: 'hard_3',
    name: '星際戰機',
    difficulty: 'hard',
    width: 12,
    height: 12,
    symmetryType: 'horizontal',
    palette: PALETTE_NATURE,
    pattern: Array(12).fill(null).map((_, r) => {
        const row = Array(12).fill(null);
        if (r === 2) row[5] = 4;
        if (r === 3) { row[4] = 4; row[5] = 4; }
        if (r === 4) { row[3] = 4; row[4] = 3; row[5] = 3; }
        if (r === 5) { row[2] = 4; row[3] = 3; row[4] = 3; row[5] = 0; }
        if (r === 6) { row[3] = 3; row[4] = 3; row[5] = 0; }
        if (r === 7) { row[4] = 0; row[5] = 0; }
        if (r === 8) { row[4] = 0; row[5] = 4; }
        return row;
    })
  },
  {
    id: 'hard_4',
    name: '叢林貓頭鷹',
    difficulty: 'hard',
    width: 14,
    height: 14,
    symmetryType: 'horizontal',
    palette: PALETTE_NATURE,
    pattern: Array(14).fill(null).map((_, r) => {
        const row = Array(14).fill(null);
        if (r >= 3 && r <= 10) {
            for (let c = 3; c <= 6; c++) {
                if (r === 3 && c === 4) row[c] = 4;
                if (r === 4 && (c === 4 || c === 5)) row[c] = 4;
                if (r >= 5 && r <= 8 && c >= 3 && c <= 6) row[c] = (r+c) % 2 === 0 ? 4 : 5;
                if (r === 6 && c === 5) row[c] = 1; // Eye
            }
        }
        return row;
    })
  },
  {
    id: 'hard_5',
    name: '幾何抽象',
    difficulty: 'hard',
    width: 10,
    height: 10,
    symmetryType: 'diagonal-backslash',
    palette: PALETTE_NATURE,
    pattern: Array(10).fill(null).map((_, r) => {
        const row = Array(10).fill(null);
        for (let c = 0; c < 10; c++) {
            if (c < r) {
                if ((r + c) % 3 === 0) row[c] = (r) % 5;
            }
        }
        return row;
    })
  },
  {
    id: 'hard_6',
    name: '水晶山脈',
    difficulty: 'hard',
    width: 12,
    height: 12,
    symmetryType: 'vertical',
    palette: PALETTE_NATURE,
    pattern: Array(12).fill(null).map((_, r) => {
        const row = Array(12).fill(null);
        if (r < 6) {
            for (let c = 0; c < 12; c++) {
                if (r + c > 5 && c - r < 6) row[c] = (r) % 4;
            }
        }
        return row;
    })
  },
  {
    id: 'hard_tri_1',
    name: '三角迷蹤',
    difficulty: 'hard',
    width: 8,
    height: 8,
    symmetryType: 'horizontal',
    palette: PALETTE_NATURE,
    pattern: [
      [null, null, null, 0, null, null, null, null],
      [null, null, 1, 1, null, null, null, null],
      [null, 2, 2, 2, null, null, null, null],
      [3, 3, 3, 3, null, null, null, null],
      [null, 2, 2, 2, null, null, null, null],
      [null, null, 1, 1, null, null, null, null],
      [null, null, null, 0, null, null, null, null],
      [null, null, null, null, null, null, null, null],
    ],
    shapes: [
      [null, null, null, 'tri-tl', null, null, null, null],
      [null, null, 'tri-tl', 'square', null, null, null, null],
      [null, 'tri-tl', 'square', 'square', null, null, null, null],
      ['tri-tl', 'square', 'square', 'square', null, null, null, null],
      [null, 'tri-bl', 'square', 'square', null, null, null, null],
      [null, null, 'tri-bl', 'square', null, null, null, null],
      [null, null, null, 'tri-bl', null, null, null, null],
      [null, null, null, null, null, null, null, null],
    ]
  },
  {
    id: 'hard_tri_2',
    name: '菱形之心',
    difficulty: 'hard',
    width: 10,
    height: 10,
    symmetryType: 'vertical',
    palette: PALETTE_NATURE,
    pattern: Array(10).fill(null).map((_, r) => {
        const row = Array(10).fill(null);
        if (r < 5) {
            for (let c = 2; c <= 7; c++) {
                if (r === 4) row[c] = 0;
                else if (r === 3 && c >= 3 && c <= 6) row[c] = 0;
                else if (r === 2 && (c === 4 || c === 5)) row[c] = 0;
            }
        }
        return row;
    }),
    shapes: Array(10).fill(null).map((_, r) => {
        const row = Array(10).fill(null);
        if (r < 5) {
            if (r === 2) { row[4] = 'tri-tl'; row[5] = 'tri-tr'; }
            if (r === 3) { row[3] = 'tri-tl'; row[6] = 'tri-tr'; }
            if (r === 4) { row[2] = 'tri-tl'; row[7] = 'tri-tr'; }
        }
        return row;
    })
  },
  {
    id: 'hard_9',
    name: '深海巨獸',
    difficulty: 'hard',
    width: 14,
    height: 14,
    symmetryType: 'horizontal',
    palette: PALETTE_NATURE,
    pattern: Array(14).fill(null).map((_, r) => {
        const row = Array(14).fill(null);
        if (r >= 4 && r <= 9) {
            for (let c = 2; c <= 6; c++) row[c] = 3;
        }
        if (r === 5 || r === 8) row[5] = 7; // Eyes?
        return row;
    })
  },
  {
    id: 'hard_10',
    name: '皇冠加冕',
    difficulty: 'hard',
    width: 12,
    height: 12,
    symmetryType: 'horizontal',
    palette: PALETTE_NATURE,
    pattern: [
        [null, null, null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, 1, null, null, null, null, null, null],
        [null, null, 1, null, 1, 1, null, null, null, null, null, null],
        [null, 1, 1, 1, 1, 1, null, null, null, null, null, null],
        [null, 1, 1, 1, 1, 1, null, null, null, null, null, null],
        [1, 1, 1, 1, 1, 1, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null, null, null],
    ],
    shapes: [
        [null, null, null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, 'tri-tl', null, null, null, null, null, null],
        [null, null, 'tri-tl', null, 'tri-tl', 'square', null, null, null, null, null, null],
        [null, 'tri-tl', 'square', 'square', 'square', 'square', null, null, null, null, null, null],
        [null, 'square', 'square', 'square', 'square', 'square', null, null, null, null, null, null],
        ['tri-tl', 'square', 'square', 'square', 'square', 'square', null, null, null, null, null, null],
        ...Array(6).fill(Array(12).fill(null))
    ]
  },
  {
    id: 'hard_tri_3',
    name: '寶石之星',
    difficulty: 'hard',
    width: 10,
    height: 10,
    symmetryType: 'diagonal-slash',
    palette: PALETTE_NATURE,
    pattern: Array(10).fill(null).map((_, r) => {
        const row = Array(10).fill(null);
        for (let c = 0; c < 10; c++) {
            if (r + c < 9) {
                if (r > 2 && c > 2) row[c] = (r+c) % 3;
            }
        }
        return row;
    }),
    shapes: Array(10).fill(null).map((_, r) => {
        const row = Array(10).fill(null);
        for (let c = 0; c < 10; c++) {
            if (r + c < 9) {
                if (r + c === 8) row[c] = 'tri-tl';
            }
        }
        return row;
    })
  },
  {
    id: 'hard_tri_4',
    name: '終極挑戰',
    difficulty: 'hard',
    width: 14,
    height: 14,
    symmetryType: 'horizontal',
    palette: PALETTE_NATURE,
    pattern: Array(14).fill(null).map((_, r) => {
        const row = Array(14).fill(null);
        if (r >= 2 && r <= 11) {
            for (let c = 1; c <= 6; c++) {
                if ((r + c) % 2 === 0) row[c] = (r % 6);
            }
        }
        return row;
    }),
    shapes: Array(14).fill(null).map((_, r) => {
        const row = Array(14).fill(null);
        if (r >= 2 && r <= 11) {
            for (let c = 1; c <= 6; c++) {
                if (c === 6) row[c] = 'tri-tr';
                if (c === 1) row[c] = 'tri-tl';
            }
        }
        return row;
    })
  }
];
