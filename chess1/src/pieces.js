// Standard crisp vector Staunton Chess Pieces (inline SVG)
export const PIECE_SVGS = {
  wK: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/>
      <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#fff" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V23.5C20 16 10.5 13 6.5 19.5c-3 6 5 10.5 5 10.5v7z" fill="#fff"/>
      <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/>
    </g>
  </svg>`,
  
  wQ: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm-27 4a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm18 0a2 2 0 1 1-4 0 2 2 0 1 1 4 0z"/>
      <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11-6-15-2.5 15-2.5-15-6 15-7-11 2 12z" stroke-linecap="butt"/>
      <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/>
      <path d="M11.5 30c3.5-1 20.5-1 22 0m-21 3.5c4-1 16-1 20 0m-19 3.5c4.5-1 13-1 18 0" fill="none"/>
    </g>
  </svg>`,

  wR: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 39h27v-3H9v3zm3-3v-4.5h21V36H12zm2-4.5V14h17v17.5H14z" stroke-linecap="butt"/>
      <path d="M14 14.5v-3h17v3H14zm-3-3v-3.5h5v2h4v-2h5v2h4v-2h5v3.5H11z" stroke-linecap="butt"/>
      <path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" fill="none"/>
    </g>
  </svg>`,

  wB: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <g fill="#fff" stroke-linecap="butt">
        <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/>
        <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/>
        <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/>
      </g>
      <path d="M17.5 26h10M15 30h15m-7.5-14.5v5m-3-2.5h6" stroke-linejoin="miter"/>
    </g>
  </svg>`,

  wN: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff"/>
      <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.64 1.25-1 1-1.25-1.25-.86-2.57-2-3-1.01-.38-1.52-.77-.5-1.5 2.37-1.7 4.29-3.21 6.5-6.5 1.5-2.25 2-4.5 2.5-6.5 1.5-3 5.5-5 8-4 .77.31 1.5.84 2 1.5z" fill="#fff"/>
      <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.5-9a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#000"/>
      <path d="M24.55 10.4s-1.05 1.46-.55 2.85c.5 1.4 2.55 2.15 2.55 2.15" stroke-linejoin="miter"/>
    </g>
  </svg>`,

  wP: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  bK: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/>
      <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#2b2b2b" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V23.5C20 16 10.5 13 6.5 19.5c-3 6 5 10.5 5 10.5v7z" fill="#2b2b2b"/>
      <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="#fff"/>
      <path d="M22.5 11.63V6M20 8h5" stroke="#fff" stroke-linejoin="miter"/>
    </g>
  </svg>`,

  bQ: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="#2b2b2b" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm-27 4a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm18 0a2 2 0 1 1-4 0 2 2 0 1 1 4 0z"/>
      <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11-6-15-2.5 15-2.5-15-6 15-7-11 2 12z" stroke-linecap="butt"/>
      <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/>
      <path d="M11.5 30c3.5-1 20.5-1 22 0m-21 3.5c4-1 16-1 20 0m-19 3.5c4.5-1 13-1 18 0" fill="none" stroke="#fff"/>
    </g>
  </svg>`,

  bR: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="#2b2b2b" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 39h27v-3H9v3zm3-3v-4.5h21V36H12zm2-4.5V14h17v17.5H14z" stroke-linecap="butt"/>
      <path d="M14 14.5v-3h17v3H14zm-3-3v-3.5h5v2h4v-2h5v2h4v-2h5v3.5H11z" stroke-linecap="butt"/>
      <path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" fill="none" stroke="#fff"/>
    </g>
  </svg>`,

  bB: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <g fill="#2b2b2b" stroke-linecap="butt">
        <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/>
        <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/>
        <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/>
      </g>
      <path d="M17.5 26h10M15 30h15m-7.5-14.5v5m-3-2.5h6" stroke="#fff" stroke-linejoin="miter"/>
    </g>
  </svg>`,

  bN: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#2b2b2b"/>
      <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.64 1.25-1 1-1.25-1.25-.86-2.57-2-3-1.01-.38-1.52-.77-.5-1.5 2.37-1.7 4.29-3.21 6.5-6.5 1.5-2.25 2-4.5 2.5-6.5 1.5-3 5.5-5 8-4 .77.31 1.5.84 2 1.5z" fill="#2b2b2b"/>
      <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.5-9a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#fff"/>
      <path d="M24.55 10.4s-1.05 1.46-.55 2.85c.5 1.4 2.55 2.15 2.55 2.15" stroke="#fff" stroke-linejoin="miter"/>
    </g>
  </svg>`,

  bP: `<svg viewBox="0 0 45 45" class="chess-piece-svg">
    <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#2b2b2b" stroke="#000" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`
};

export function getPieceSvg(color, type) {
  const key = `${color}${type.toUpperCase()}`;
  return PIECE_SVGS[key] || '';
}

export const PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

export const PIECE_NAMES = {
  p: '兵 (Pawn)',
  n: '騎士 (Knight)',
  b: '主教 (Bishop)',
  r: '城堡 (Rook)',
  q: '皇后 (Queen)',
  k: '國王 (King)'
};
