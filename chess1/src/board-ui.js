// Interactive Chessboard UI Renderer with Drag-and-Drop, Touch, Click-to-Move, and Visual Hints
import { getPieceSvg } from './pieces.js';

export class BoardUI {
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.orientation = options.orientation || 'w'; // 'w' (white at bottom) or 'b'
    this.onMove = options.onMove || (() => {});
    this.getLegalMoves = options.getLegalMoves || (() => []);
    this.getBoardState = options.getBoardState || (() => []);
    this.interactive = options.interactive !== false;

    this.selectedSquare = null;
    this.legalDestinations = [];
    this.lastMove = null; // { from, to }
    this.checkSquare = null; // e.g. 'e1'
    this.stalemateSquare = null; // e.g. 'h8'
    this.tutorialHint = null; // { from, to }

    this.draggedPiece = null;
    this.dragSourceSquare = null;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="chessboard-wrapper">
        <div class="board-coordinates board-coords-ranks"></div>
        <div class="board-grid" id="board-grid"></div>
        <div class="board-coordinates board-coords-files"></div>
        <svg class="board-svg-overlay" id="board-overlay"></svg>
      </div>
    `;

    this.gridEl = this.container.querySelector('#board-grid');
    this.overlayEl = this.container.querySelector('#board-overlay');
    this.ranksCoordEl = this.container.querySelector('.board-coords-ranks');
    this.filesCoordEl = this.container.querySelector('.board-coords-files');
  }

  setOrientation(color) {
    if (this.orientation !== color) {
      this.orientation = color;
      this.render();
    }
  }

  setInteractive(enabled) {
    this.interactive = enabled;
    if (!enabled) {
      this.clearSelection();
    }
  }

  setLastMove(from, to) {
    this.lastMove = (from && to) ? { from, to } : null;
    this.updateHighlights();
  }

  setCheckSquare(square) {
    this.checkSquare = square;
    this.updateHighlights();
  }

  setStalemateSquare(square) {
    this.stalemateSquare = square;
    this.updateHighlights();
  }

  setTutorialHint(from, to) {
    this.tutorialHint = (from && to) ? { from, to } : null;
    this.renderOverlay();
    this.updateHighlights();
  }

  clearSelection() {
    this.selectedSquare = null;
    this.legalDestinations = [];
    this.updateHighlights();
  }

  render() {
    const isWhite = this.orientation === 'w';
    const ranks = isWhite ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const files = isWhite ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

    // Render coordinates
    this.ranksCoordEl.innerHTML = ranks.map(r => `<span class="coord-label">${r}</span>`).join('');
    this.filesCoordEl.innerHTML = files.map(f => `<span class="coord-label">${f}</span>`).join('');

    // Render 64 squares
    this.gridEl.innerHTML = '';
    const boardState = this.getBoardState(); // 8x8 array or map

    for (let r = 0; r < 8; r++) {
      const rank = ranks[r];
      for (let c = 0; c < 8; c++) {
        const file = files[c];
        const square = `${file}${rank}`;
        const isLight = (r + c) % 2 === 0;

        const sqEl = document.createElement('div');
        sqEl.className = `board-square ${isLight ? 'light' : 'dark'}`;
        sqEl.dataset.square = square;

        // Piece
        const piece = this.getPieceAt(boardState, square);
        if (piece) {
          const pieceEl = document.createElement('div');
          pieceEl.className = `chess-piece ${piece.color === 'w' ? 'piece-white' : 'piece-black'}`;
          pieceEl.dataset.square = square;
          pieceEl.dataset.color = piece.color;
          pieceEl.dataset.type = piece.type;
          pieceEl.draggable = this.interactive;
          pieceEl.innerHTML = getPieceSvg(piece.color, piece.type);
          sqEl.appendChild(pieceEl);
        }

        this.gridEl.appendChild(sqEl);
      }
    }

    this.updateHighlights();
    this.renderOverlay();
  }

  getPieceAt(boardState, square) {
    if (!boardState) return null;
    const file = square.charCodeAt(0) - 97; // 0..7
    const rank = parseInt(square[1], 10); // 1..8
    const row = 8 - rank;
    const col = file;
    if (boardState[row] && boardState[row][col]) {
      return boardState[row][col];
    }
    return null;
  }

  updateHighlights() {
    // Clear all special classes
    const allSquares = this.gridEl.querySelectorAll('.board-square');
    allSquares.forEach(sq => {
      sq.classList.remove('selected', 'legal-dest', 'legal-capture', 'legal-castle', 'last-move', 'in-check', 'in-stalemate', 'tutorial-source', 'tutorial-target');
      const dot = sq.querySelector('.move-indicator');
      if (dot) dot.remove();
    });

    // Last move highlight
    if (this.lastMove) {
      const fromEl = this.gridEl.querySelector(`[data-square="${this.lastMove.from}"]`);
      const toEl = this.gridEl.querySelector(`[data-square="${this.lastMove.to}"]`);
      if (fromEl) fromEl.classList.add('last-move');
      if (toEl) toEl.classList.add('last-move');
    }

    // Check highlight
    if (this.checkSquare) {
      const checkEl = this.gridEl.querySelector(`[data-square="${this.checkSquare}"]`);
      if (checkEl) checkEl.classList.add('in-check');
    }

    // Stalemate highlight (trapped King)
    if (this.stalemateSquare) {
      const staleEl = this.gridEl.querySelector(`[data-square="${this.stalemateSquare}"]`);
      if (staleEl) staleEl.classList.add('in-stalemate');
    }

    // Tutorial highlight
    if (this.tutorialHint) {
      const tutFromEl = this.gridEl.querySelector(`[data-square="${this.tutorialHint.from}"]`);
      const tutToEl = this.gridEl.querySelector(`[data-square="${this.tutorialHint.to}"]`);
      if (tutFromEl) tutFromEl.classList.add('tutorial-source');
      if (tutToEl) tutToEl.classList.add('tutorial-target');
    }

    // Selected square
    if (this.selectedSquare) {
      const selEl = this.gridEl.querySelector(`[data-square="${this.selectedSquare}"]`);
      if (selEl) selEl.classList.add('selected');

      // Legal moves
      this.legalDestinations.forEach(dest => {
        const destEl = this.gridEl.querySelector(`[data-square="${dest.to}"]`);
        if (destEl) {
          const isCapture = !!dest.captured;
          const isCastle = dest.isCastlingRook || (dest.flags && (dest.flags.includes('k') || dest.flags.includes('q')));

          if (isCastle) {
            destEl.classList.add('legal-castle');
            const indicator = document.createElement('div');
            indicator.className = 'move-indicator castle-indicator';
            indicator.title = '王車易位 (Castling)';
            indicator.innerHTML = '🏰';
            destEl.appendChild(indicator);
          } else {
            destEl.classList.add(isCapture ? 'legal-capture' : 'legal-dest');
            const indicator = document.createElement('div');
            indicator.className = `move-indicator ${isCapture ? 'capture-ring' : 'dest-dot'}`;
            destEl.appendChild(indicator);
          }
        }
      });
    }
  }

  renderOverlay() {
    if (!this.overlayEl) return;
    this.overlayEl.innerHTML = '';

    // Draw arrow for tutorial hint if present
    if (this.tutorialHint) {
      this.drawArrow(this.tutorialHint.from, this.tutorialHint.to, '#22c55e');
    }
  }

  drawArrow(fromSquare, toSquare, color = '#22c55e') {
    const fromEl = this.gridEl.querySelector(`[data-square="${fromSquare}"]`);
    const toEl = this.gridEl.querySelector(`[data-square="${toSquare}"]`);
    if (!fromEl || !toEl) return;

    const gridRect = this.gridEl.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const x1 = fromRect.left - gridRect.left + fromRect.width / 2;
    const y1 = fromRect.top - gridRect.top + fromRect.height / 2;
    const x2 = toRect.left - gridRect.left + toRect.width / 2;
    const y2 = toRect.top - gridRect.top + toRect.height / 2;

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowHeadLen = 14;
    const shorten = 18; // shorten so it doesn't cover center of target square

    const endX = x2 - shorten * Math.cos(angle);
    const endY = y2 - shorten * Math.sin(angle);

    const markerId = `arrow-head-${color.replace('#', '')}`;

    this.overlayEl.innerHTML = `
      <defs>
        <marker id="${markerId}" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto">
          <polygon points="0 1, 7 4, 0 7" fill="${color}" opacity="0.85" />
        </marker>
      </defs>
      <line x1="${x1}" y1="${y1}" x2="${endX}" y2="${endY}" 
            stroke="${color}" stroke-width="6" stroke-linecap="round" opacity="0.75"
            marker-end="url(#${markerId})" />
    `;
  }

  /**
   * 平滑滑動動畫：將棋子從 fromSquare 移動至 toSquare
   * @param {string} fromSquare - 起始格點（例如 'e7'）
   * @param {string} toSquare - 目標格點（例如 'e5'）
   * @param {Object} [options] - 動畫參數 { duration: 280, isCastle: false }
   * @param {Function} [onComplete] - 動畫結束回呼
   */
  animateMove(fromSquare, toSquare, options = {}, onComplete = () => {}) {
    if (typeof options === 'function') {
      onComplete = options;
      options = {};
    }

    const duration = options.duration || 280;
    const fromEl = this.gridEl ? this.gridEl.querySelector(`[data-square="${fromSquare}"]`) : null;
    const toEl = this.gridEl ? this.gridEl.querySelector(`[data-square="${toSquare}"]`) : null;

    if (!fromEl || !toEl) {
      onComplete();
      return;
    }

    const pieceEl = fromEl.querySelector('.chess-piece');
    if (!pieceEl) {
      onComplete();
      return;
    }

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const deltaX = toRect.left - fromRect.left;
    const deltaY = toRect.top - fromRect.top;

    // 若為王車易位，同步計算城堡 (Rook) 的滑動位移
    let rookEl = null;
    let rookFromEl = null;
    let rookDeltaX = 0;
    let rookDeltaY = 0;

    if (options.isCastle) {
      let rookFrom = null;
      let rookTo = null;
      if (fromSquare === 'e1' && toSquare === 'g1') { rookFrom = 'h1'; rookTo = 'f1'; }
      else if (fromSquare === 'e1' && toSquare === 'c1') { rookFrom = 'a1'; rookTo = 'd1'; }
      else if (fromSquare === 'e8' && toSquare === 'g8') { rookFrom = 'h8'; rookTo = 'f8'; }
      else if (fromSquare === 'e8' && toSquare === 'c8') { rookFrom = 'a8'; rookTo = 'd8'; }

      if (rookFrom && rookTo) {
        rookFromEl = this.gridEl.querySelector(`[data-square="${rookFrom}"]`);
        const rookToEl = this.gridEl.querySelector(`[data-square="${rookTo}"]`);
        if (rookFromEl && rookToEl) {
          rookEl = rookFromEl.querySelector('.chess-piece');
          if (rookEl) {
            const rFromRect = rookFromEl.getBoundingClientRect();
            const rToRect = rookToEl.getBoundingClientRect();
            rookDeltaX = rToRect.left - rFromRect.left;
            rookDeltaY = rToRect.top - rFromRect.top;
          }
        }
      }
    }

    // 若目標格有被吃的棋子，淡出縮小縮放
    const targetPiece = toEl.querySelector('.chess-piece');
    if (targetPiece) {
      targetPiece.style.transition = `opacity ${Math.round(duration * 0.6)}ms ease ${Math.round(duration * 0.35)}ms, transform ${Math.round(duration * 0.6)}ms ease ${Math.round(duration * 0.35)}ms`;
      targetPiece.style.opacity = '0.2';
      targetPiece.style.transform = 'scale(0.85)';
    }

    // 提高移動棋子的圖層並觸發平滑位移
    fromEl.style.zIndex = '30';
    pieceEl.classList.add('piece-moving');
    pieceEl.style.zIndex = '50';
    pieceEl.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.85, 0.3, 1)`;
    pieceEl.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;

    if (rookEl && rookFromEl) {
      rookFromEl.style.zIndex = '29';
      rookEl.classList.add('piece-moving');
      rookEl.style.zIndex = '49';
      rookEl.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.85, 0.3, 1)`;
      rookEl.style.transform = `translate3d(${rookDeltaX}px, ${rookDeltaY}px, 0)`;
    }

    let finished = false;
    const cleanupAndDone = () => {
      if (finished) return;
      finished = true;
      fromEl.style.zIndex = '';
      pieceEl.classList.remove('piece-moving');
      pieceEl.style.transition = '';
      pieceEl.style.transform = '';
      pieceEl.style.zIndex = '';
      if (targetPiece) {
        targetPiece.style.transition = '';
        targetPiece.style.opacity = '';
        targetPiece.style.transform = '';
      }
      if (rookEl && rookFromEl) {
        rookFromEl.style.zIndex = '';
        rookEl.classList.remove('piece-moving');
        rookEl.style.transition = '';
        rookEl.style.transform = '';
        rookEl.style.zIndex = '';
      }
      onComplete();
    };

    setTimeout(cleanupAndDone, duration + 20);
  }

  bindEvents() {
    // Click handling
    this.gridEl.addEventListener('click', e => {
      if (!this.interactive) return;

      const squareEl = e.target.closest('.board-square');
      if (!squareEl) return;

      const square = squareEl.dataset.square;

      // If already selected a square
      if (this.selectedSquare) {
        // Did user click on a legal destination?
        const move = this.legalDestinations.find(m => m.to === square);
        if (move) {
          const from = this.selectedSquare;
          this.clearSelection();
          this.onMove(from, square, move);
          return;
        }

        // Did user click on the same square? Deselect
        if (this.selectedSquare === square) {
          this.clearSelection();
          return;
        }
      }

      // Check if clicking on own piece to select
      const boardState = this.getBoardState();
      const piece = this.getPieceAt(boardState, square);
      if (piece) {
        const moves = this.getLegalMoves(square);
        if (moves.length > 0) {
          this.selectedSquare = square;
          this.legalDestinations = moves;
          this.updateHighlights();
          return;
        }
      }

      // Clicking on empty space or piece with no legal moves
      this.clearSelection();
    });

    // Drag-and-drop
    this.gridEl.addEventListener('dragstart', e => {
      if (!this.interactive) {
        e.preventDefault();
        return;
      }
      const pieceEl = e.target.closest('.chess-piece');
      if (!pieceEl) return;

      const square = pieceEl.dataset.square;
      const moves = this.getLegalMoves(square);
      if (moves.length === 0) {
        e.preventDefault();
        return;
      }

      this.draggedPiece = pieceEl;
      this.dragSourceSquare = square;
      this.selectedSquare = square;
      this.legalDestinations = moves;
      this.updateHighlights();

      e.dataTransfer.setData('text/plain', square);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => {
        pieceEl.classList.add('dragging');
      }, 0);
    });

    this.gridEl.addEventListener('dragend', () => {
      if (this.draggedPiece) {
        this.draggedPiece.classList.remove('dragging');
        this.draggedPiece = null;
      }
    });

    this.gridEl.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    this.gridEl.addEventListener('drop', e => {
      e.preventDefault();
      const squareEl = e.target.closest('.board-square');
      if (!squareEl || !this.dragSourceSquare) return;

      const targetSquare = squareEl.dataset.square;
      const move = this.legalDestinations.find(m => m.to === targetSquare);

      const from = this.dragSourceSquare;
      this.dragSourceSquare = null;
      this.clearSelection();

      if (move) {
        this.onMove(from, targetSquare, move);
      }
    });

    // Re-draw arrows on window resize
    window.addEventListener('resize', () => {
      this.renderOverlay();
    });
  }
}
