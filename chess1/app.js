// Main Chess Application Controller
import { Chess } from './lib/chess.js?v=2.2';
import { sounds } from './src/sound.js?v=2.2';
import { BoardUI } from './src/board-ui.js?v=2.2';
import { findBestMove, evaluateBoard, DIFFICULTY_CONFIG, normalizeDifficulty } from './src/ai.js?v=2.2';
import { OPENINGS_DATABASE, getOpeningById } from './src/openings.js?v=2.2';
import { getPieceSvg, PIECE_VALUES } from './src/pieces.js?v=2.2';

// 確保 BoardUI 原型防禦性容錯（防止瀏覽器記憶體快取未及時更新時報錯）
if (typeof BoardUI !== 'undefined') {
  if (!BoardUI.prototype.setStalemateSquare) {
    BoardUI.prototype.setStalemateSquare = function(sq) {
      this.stalemateSquare = sq;
      if (typeof this.updateHighlights === 'function') this.updateHighlights();
    };
  }
  if (!BoardUI.prototype.animateMove) {
    BoardUI.prototype.animateMove = function(from, to, options, cb) {
      const callback = typeof options === 'function' ? options : cb;
      if (typeof callback === 'function') callback();
    };
  }
}

class ChessApp {
  constructor() {
    this.game = new Chess();
    this.mode = 'vs-ai'; // 'vs-ai', 'two-player', 'tutorial'
    
    // AI Mode Settings
    this.playerColor = 'w'; // 'w' or 'b'
    let savedDiff = localStorage.getItem('chess_difficulty');
    this.aiDifficulty = savedDiff ? normalizeDifficulty(savedDiff) : 3; // 1: 新手, 2: 休閒, 3: 中級, 4: 進階, 5: 大師
    this.isAiThinking = false;
    this.aiTurnId = 0;

    // Two-Player Settings
    this.autoFlip = false;

    // Tutorial Settings
    this.currentOpening = OPENINGS_DATABASE[0];
    this.tutorialStepIndex = 0;

    // Move History Stack for full undo/redo to beginning
    // [{ fen: string, move: MoveObject, pgn: string }]
    this.historyStack = [];
    this.historyIndex = -1; // -1 means initial board

    // Match Scoreboard
    this.scores = this.loadScores();

    // Pending Promotion
    this.pendingMove = null;

    // Initialize UI
    this.initBoardUI();
    this.initDOMListeners();
    this.initTutorialSelect();
    this.initZoomControls();
    this.setAiDifficulty(this.aiDifficulty);
    this.resetGame();
  }

  setAiDifficulty(level) {
    this.aiDifficulty = normalizeDifficulty(level);
    const config = DIFFICULTY_CONFIG[this.aiDifficulty] || DIFFICULTY_CONFIG[3];

    // Update active button state
    document.querySelectorAll('#ai-settings-section .diff-btn').forEach(btn => {
      const lvl = parseInt(btn.dataset.level, 10);
      btn.classList.toggle('active', lvl === this.aiDifficulty);
    });

    // Update description texts
    const descEl = document.getElementById('ai-difficulty-desc');
    if (descEl) descEl.textContent = `${config.name} (${config.elo})`;
    const detailEl = document.getElementById('ai-difficulty-detail');
    if (detailEl) detailEl.textContent = config.description;

    try {
      localStorage.setItem('chess_difficulty', this.aiDifficulty);
    } catch {}

    this.updatePlayerBarTitles();
  }

  initZoomControls() {
    this.zoomLevels = [
      { label: '標準 (620px)', size: '620px' },
      { label: '大 (740px)', size: '740px' },
      { label: '特大 (850px)', size: '850px' },
      { label: '超大 (960px)', size: '960px' }
    ];

    let savedIdx = parseInt(localStorage.getItem('chess_zoom_idx'), 10);
    this.currentZoomIdx = (!isNaN(savedIdx) && savedIdx >= 0 && savedIdx < this.zoomLevels.length) ? savedIdx : 1; // Default to '大 (740px)'

    this.applyZoom(this.currentZoomIdx);

    const btnIn = document.getElementById('btn-zoom-in');
    const btnOut = document.getElementById('btn-zoom-out');
    const btnToggle = document.getElementById('btn-zoom-toggle');

    if (btnIn) {
      btnIn.addEventListener('click', () => {
        if (this.currentZoomIdx < this.zoomLevels.length - 1) {
          this.applyZoom(this.currentZoomIdx + 1);
        }
      });
    }

    if (btnOut) {
      btnOut.addEventListener('click', () => {
        if (this.currentZoomIdx > 0) {
          this.applyZoom(this.currentZoomIdx - 1);
        }
      });
    }

    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        const next = (this.currentZoomIdx + 1) % this.zoomLevels.length;
        this.applyZoom(next);
      });
    }
  }

  applyZoom(index) {
    this.currentZoomIdx = index;
    const current = this.zoomLevels[index];
    document.documentElement.style.setProperty('--board-max-size', current.size);
    const labelEl = document.getElementById('zoom-level-label');
    if (labelEl) labelEl.textContent = current.label;

    try {
      localStorage.setItem('chess_zoom_idx', index);
    } catch {}

    setTimeout(() => {
      if (this.boardUI) {
        this.boardUI.renderOverlay();
      }
    }, 50);
  }

  loadScores() {
    try {
      const saved = localStorage.getItem('chess_scores');
      return saved ? JSON.parse(saved) : { w: 0, b: 0, d: 0 };
    } catch {
      return { w: 0, b: 0, d: 0 };
    }
  }

  saveScores() {
    try {
      localStorage.setItem('chess_scores', JSON.stringify(this.scores));
    } catch (e) {
      console.warn('Cannot save scores:', e);
    }
    this.renderScores();
  }

  initBoardUI() {
    const boardContainer = document.getElementById('board-container');
    this.boardUI = new BoardUI(boardContainer, {
      orientation: 'w',
      onMove: (from, to, moveDetails) => this.handlePlayerMove(from, to, moveDetails),
      getLegalMoves: (square) => this.getLegalMovesForSquare(square),
      getBoardState: () => this.game.board(),
      interactive: true
    });
  }

  initTutorialSelect() {
    const selectEl = document.getElementById('tutorial-opening-select');
    selectEl.innerHTML = OPENINGS_DATABASE.map(op => `
      <option value="${op.id}">${op.name} (${op.difficulty})</option>
    `).join('');

    selectEl.addEventListener('change', (e) => {
      this.loadTutorialOpening(e.target.value);
    });
  }

  initDOMListeners() {
    // Mode tabs
    document.querySelectorAll('.mode-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = btn.dataset.mode;
        this.switchMode(mode);
      });
    });

    // Sound toggle
    document.getElementById('btn-sound-toggle').addEventListener('click', () => {
      const isEnabled = sounds.toggleSound();
      document.getElementById('sound-icon').textContent = isEnabled ? '🔊' : '🔇';
      document.getElementById('sound-label').textContent = isEnabled ? '音效開' : '音效關';
    });

    // Help modal
    const helpModal = document.getElementById('help-modal');
    document.getElementById('btn-help-modal').addEventListener('click', () => {
      helpModal.classList.add('open');
    });
    document.getElementById('btn-close-help').addEventListener('click', () => {
      helpModal.classList.remove('open');
    });
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) helpModal.classList.remove('open');
    });

    // Side selection (White / Black)
    document.getElementById('btn-pick-white').addEventListener('click', () => {
      if (this.playerColor !== 'w') {
        this.playerColor = 'w';
        document.getElementById('btn-pick-white').classList.add('active');
        document.getElementById('btn-pick-black').classList.remove('active');
        this.resetGame();
      }
    });
    document.getElementById('btn-pick-black').addEventListener('click', () => {
      if (this.playerColor !== 'b') {
        this.playerColor = 'b';
        document.getElementById('btn-pick-black').classList.add('active');
        document.getElementById('btn-pick-white').classList.remove('active');
        this.resetGame();
      }
    });

    // AI Difficulty buttons (1: 新手, 2: 休閒, 3: 中級, 4: 進階, 5: 大師)
    [1, 2, 3, 4, 5].forEach(level => {
      const btn = document.getElementById(`btn-diff-${level}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.setAiDifficulty(level);
        });
      }
    });

    // Auto flip checkbox
    document.getElementById('check-auto-flip').addEventListener('change', (e) => {
      this.autoFlip = e.target.checked;
      if (this.autoFlip && this.mode === 'two-player') {
        this.boardUI.setOrientation(this.game.turn());
      }
    });

    // Navigation & Undo / Redo controls
    document.getElementById('btn-undo').addEventListener('click', () => this.handleUndo());
    document.getElementById('btn-redo').addEventListener('click', () => this.handleRedo());
    document.getElementById('btn-jump-start').addEventListener('click', () => this.jumpToStart());
    document.getElementById('btn-jump-end').addEventListener('click', () => this.jumpToEnd());
    document.getElementById('btn-flip-board').addEventListener('click', () => {
      const nextOri = this.boardUI.orientation === 'w' ? 'b' : 'w';
      this.boardUI.setOrientation(nextOri);
    });
    document.getElementById('btn-new-game').addEventListener('click', () => this.resetGame());

    // Reset score
    document.getElementById('btn-reset-score').addEventListener('click', () => {
      if (confirm('確定要清空本次對戰戰績紀錄嗎？')) {
        this.scores = { w: 0, b: 0, d: 0 };
        this.saveScores();
      }
    });

    // Copy PGN
    document.getElementById('btn-copy-pgn').addEventListener('click', () => {
      const pgn = this.game.pgn();
      if (!pgn) {
        alert('目前尚無走棋記錄');
        return;
      }
      navigator.clipboard.writeText(pgn).then(() => {
        alert('已複製 PGN 著法表記至剪貼簿！');
      }).catch(() => {
        prompt('請複製下列 PGN 文本：', pgn);
      });
    });

    // Tutorial controls
    document.getElementById('btn-tut-show-step').addEventListener('click', () => this.tutorialShowCurrentStep());
    document.getElementById('btn-tut-prev').addEventListener('click', () => this.tutorialPrevStep());
    document.getElementById('btn-tut-next').addEventListener('click', () => this.tutorialNextStep());
    document.getElementById('btn-tut-restart').addEventListener('click', () => this.loadTutorialOpening(this.currentOpening.id));

    // Game over rematch / review
    document.getElementById('btn-gameover-rematch').addEventListener('click', () => {
      document.getElementById('gameover-modal').classList.remove('open');
      this.resetGame();
    });
    document.getElementById('btn-gameover-review').addEventListener('click', () => {
      document.getElementById('gameover-modal').classList.remove('open');
    });

    // Keyboard shortcuts for tutorial navigation and undo
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (this.mode === 'tutorial') {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.tutorialNextStep();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.tutorialPrevStep();
        }
      } else {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          this.handleUndo();
        }
      }
    });
  }

  switchMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;

    // Update Tab UI
    document.querySelectorAll('.mode-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Update settings visibility
    const settingsCard = document.getElementById('settings-card');
    const tutorialCard = document.getElementById('tutorial-card');
    const aiSection = document.getElementById('ai-settings-section');
    const twoPlayerSection = document.getElementById('twoplayer-settings-section');
    const modeTag = document.getElementById('current-mode-tag');

    if (mode === 'vs-ai') {
      settingsCard.style.display = 'block';
      tutorialCard.style.display = 'none';
      aiSection.style.display = 'block';
      twoPlayerSection.style.display = 'none';
      modeTag.textContent = '人機對戰';
    } else if (mode === 'two-player') {
      settingsCard.style.display = 'block';
      tutorialCard.style.display = 'none';
      aiSection.style.display = 'none';
      twoPlayerSection.style.display = 'block';
      modeTag.textContent = '雙人同機';
    } else if (mode === 'tutorial') {
      settingsCard.style.display = 'none';
      tutorialCard.style.display = 'block';
      this.loadTutorialOpening(this.currentOpening.id);
      return;
    }

    this.resetGame();
  }

  resetGame() {
    this.game.reset();
    this.historyStack = [];
    this.historyIndex = -1;
    this.isAiThinking = false;
    this.aiTurnId = (this.aiTurnId || 0) + 1;
    this.pendingMove = null;

    if (this.mode === 'vs-ai') {
      this.boardUI.setOrientation(this.playerColor);
    } else if (this.mode === 'two-player') {
      this.boardUI.setOrientation('w');
    }

    this.boardUI.setLastMove(null, null);
    this.boardUI.setCheckSquare(null);
    if (this.boardUI && typeof this.boardUI.setStalemateSquare === 'function') {
      this.boardUI.setStalemateSquare(null);
    }
    this.boardUI.setTutorialHint(null, null);

    this.updateGameState();

    // If vs AI and player picked Black, AI moves first as White
    if (this.mode === 'vs-ai' && this.playerColor === 'b') {
      this.triggerAiMove();
    }
  }

  getLegalMovesForSquare(square) {
    if (this.isAiThinking) return [];

    // In vs AI mode, disallow moving opponent pieces
    if (this.mode === 'vs-ai') {
      if (this.game.turn() !== this.playerColor) return [];
    }

    const standardMoves = this.game.moves({ square, verbose: true });
    const extraMoves = [];

    const turn = this.game.turn();
    const isWhite = turn === 'w';
    const kingSq = isWhite ? 'e1' : 'e8';
    const ksRookSq = isWhite ? 'h1' : 'h8';
    const qsRookSq = isWhite ? 'a1' : 'a8';
    const ksKingDest = isWhite ? 'g1' : 'g8';
    const qsKingDest = isWhite ? 'c1' : 'c8';

    // 1. If King is selected: allow moving 2 squares OR clicking/dropping onto Rook
    if (square === kingSq) {
      for (const m of standardMoves) {
        if (m.flags.includes('k') && m.to === ksKingDest) {
          extraMoves.push({
            from: kingSq,
            to: ksRookSq,
            piece: 'k',
            flags: 'k',
            isCastlingRook: true,
            actualFrom: kingSq,
            actualTo: ksKingDest,
            san: 'O-O'
          });
        }
        if (m.flags.includes('q') && m.to === qsKingDest) {
          extraMoves.push({
            from: kingSq,
            to: qsRookSq,
            piece: 'k',
            flags: 'q',
            isCastlingRook: true,
            actualFrom: kingSq,
            actualTo: qsKingDest,
            san: 'O-O-O'
          });
        }
      }
    }

    // 2. If Rook is selected: allow clicking the King to trigger castling
    if (square === ksRookSq) {
      const kingMoves = this.game.moves({ square: kingSq, verbose: true });
      const hasKsCastle = kingMoves.some(m => m.flags.includes('k') && m.to === ksKingDest);
      if (hasKsCastle) {
        extraMoves.push({
          from: ksRookSq,
          to: kingSq,
          piece: 'r',
          flags: 'k',
          isCastlingRook: true,
          actualFrom: kingSq,
          actualTo: ksKingDest,
          san: 'O-O'
        });
      }
    }

    if (square === qsRookSq) {
      const kingMoves = this.game.moves({ square: kingSq, verbose: true });
      const hasQsCastle = kingMoves.some(m => m.flags.includes('q') && m.to === qsKingDest);
      if (hasQsCastle) {
        extraMoves.push({
          from: qsRookSq,
          to: kingSq,
          piece: 'r',
          flags: 'q',
          isCastlingRook: true,
          actualFrom: kingSq,
          actualTo: qsKingDest,
          san: 'O-O-O'
        });
      }
    }

    return [...standardMoves, ...extraMoves];
  }

  handlePlayerMove(from, to, moveDetails) {
    if (this.isAiThinking) return;

    // Normalize castling moves (King to Rook, or Rook to King, or direct)
    let actualFrom = moveDetails?.actualFrom || from;
    let actualTo = moveDetails?.actualTo || to;

    if (from === 'e1' && to === 'h1') { actualFrom = 'e1'; actualTo = 'g1'; }
    else if (from === 'e1' && to === 'a1') { actualFrom = 'e1'; actualTo = 'c1'; }
    else if (from === 'e8' && to === 'h8') { actualFrom = 'e8'; actualTo = 'g8'; }
    else if (from === 'e8' && to === 'a8') { actualFrom = 'e8'; actualTo = 'c8'; }
    else if (from === 'h1' && to === 'e1') { actualFrom = 'e1'; actualTo = 'g1'; }
    else if (from === 'a1' && to === 'e1') { actualFrom = 'e1'; actualTo = 'c1'; }
    else if (from === 'h8' && to === 'e8') { actualFrom = 'e8'; actualTo = 'g8'; }
    else if (from === 'a8' && to === 'e8') { actualFrom = 'e8'; actualTo = 'c8'; }

    // Check if this move is a pawn promotion
    const isPawn = moveDetails.piece === 'p';
    const isPromotionRank = (moveDetails.color === 'w' && actualTo[1] === '8') || (moveDetails.color === 'b' && actualTo[1] === '1');

    if (isPawn && isPromotionRank) {
      this.promptPromotion(actualFrom, actualTo, moveDetails.color);
      return;
    }

    this.executeMove({ from: actualFrom, to: actualTo });
  }

  promptPromotion(from, to, color) {
    this.pendingMove = { from, to };
    const modal = document.getElementById('promotion-modal');
    const grid = document.getElementById('promotion-options-grid');

    const options = [
      { type: 'q', name: '皇后 (Queen)' },
      { type: 'r', name: '城堡 (Rook)' },
      { type: 'b', name: '主教 (Bishop)' },
      { type: 'n', name: '騎士 (Knight)' }
    ];

    grid.innerHTML = options.map(opt => `
      <button class="promotion-btn" data-piece="${opt.type}">
        <div class="promotion-piece-icon">${getPieceSvg(color, opt.type)}</div>
        <span class="promotion-piece-name">${opt.name}</span>
      </button>
    `).join('');

    const handleClick = (e) => {
      const btn = e.target.closest('.promotion-btn');
      if (!btn) return;
      const pieceChoice = btn.dataset.piece;
      modal.classList.remove('open');
      grid.removeEventListener('click', handleClick);

      if (this.pendingMove) {
        this.executeMove({
          from: this.pendingMove.from,
          to: this.pendingMove.to,
          promotion: pieceChoice
        });
        this.pendingMove = null;
      }
    };

    grid.addEventListener('click', handleClick);
    modal.classList.add('open');
  }

  executeMove(moveObj) {
    // If in tutorial mode, verify against tutorial step
    if (this.mode === 'tutorial') {
      this.handleTutorialMove(moveObj);
      return;
    }

    // Normal play move
    const result = this.game.move(moveObj);
    if (!result) return;

    // If we were viewing past history, truncate redo stack
    if (this.historyIndex < this.historyStack.length - 1) {
      this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
    }

    this.historyStack.push({
      fen: this.game.fen(),
      move: result,
      pgn: this.game.pgn()
    });
    this.historyIndex = this.historyStack.length - 1;

    // Play sound effect
    this.playSoundForMove(result);

    this.updateGameState();

    // In 2-player mode, handle auto-flip
    if (this.mode === 'two-player' && this.autoFlip) {
      setTimeout(() => {
        this.boardUI.setOrientation(this.game.turn());
      }, 300);
    }

    // In vs-AI mode, trigger AI reply if game is ongoing
    if (this.mode === 'vs-ai' && !this.game.isGameOver() && this.game.turn() !== this.playerColor) {
      this.triggerAiMove();
    }
  }

  playSoundForMove(moveResult) {
    if (this.game.isGameOver()) {
      sounds.playGameOver(this.game.isCheckmate());
    } else if (this.game.inCheck()) {
      sounds.playCheck();
    } else if (moveResult.captured) {
      sounds.playCapture();
    } else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
      sounds.playCastle();
    } else {
      sounds.playMove();
    }
  }

  triggerAiMove() {
    if (this.isAiThinking) return;
    this.isAiThinking = true;
    this.boardUI.setInteractive(false);
    this.updatePlayerBarTitles();

    const currentTurnId = ++this.aiTurnId;
    const startTime = Date.now();
    // 敵人稍微慢一點點思考：保證至少 550 ~ 750ms 的自然思考停頓，營造擬真對弈節奏
    const minThinkingTime = 550 + Math.floor(Math.random() * 200);

    findBestMove(this.game, this.aiDifficulty).then(aiMove => {
      if (this.aiTurnId !== currentTurnId) {
        this.isAiThinking = false;
        return;
      }

      if (!aiMove) {
        this.isAiThinking = false;
        this.boardUI.setInteractive(true);
        this.updatePlayerBarTitles();
        return;
      }

      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, minThinkingTime - elapsed);

      setTimeout(() => {
        if (this.aiTurnId !== currentTurnId) {
          this.isAiThinking = false;
          return;
        }

        // 解析著法的起點、終點與是否為王車易位
        let fromSquare = null;
        let toSquare = null;
        let isCastle = false;

        if (typeof aiMove === 'object' && aiMove.from && aiMove.to) {
          fromSquare = aiMove.from;
          toSquare = aiMove.to;
        }

        // 查詢合法著法列表（支援字串代數記譜如開局庫返回的 'e4', 'Nf3', 'O-O'）
        const legalMoves = this.game.moves({ verbose: true });
        const matched = legalMoves.find(m => {
          if (typeof aiMove === 'string') return m.san === aiMove;
          return m.from === aiMove.from && m.to === aiMove.to && (!aiMove.promotion || m.promotion === aiMove.promotion);
        });

        if (matched) {
          fromSquare = matched.from;
          toSquare = matched.to;
          isCastle = matched.flags.includes('k') || matched.flags.includes('q');
        }

        const finalizeAiMove = () => {
          if (this.aiTurnId !== currentTurnId) {
            this.isAiThinking = false;
            return;
          }

          this.isAiThinking = false;
          this.boardUI.setInteractive(true);

          const result = this.game.move(aiMove);
          if (result) {
            if (this.historyIndex < this.historyStack.length - 1) {
              this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
            }

            this.historyStack.push({
              fen: this.game.fen(),
              move: result,
              pgn: this.game.pgn()
            });
            this.historyIndex = this.historyStack.length - 1;

            this.playSoundForMove(result);
            this.updateGameState();
          }
        };

        // 觸發敵人棋子平滑移動動畫 (280ms)
        if (this.boardUI && typeof this.boardUI.animateMove === 'function') {
          this.boardUI.animateMove(fromSquare, toSquare, { isCastle, duration: 280 }, finalizeAiMove);
        } else {
          finalizeAiMove();
        }
      }, remainingDelay);
    });
  }

  // Undo (悔棋): Allows undoing all the way back to the start!
  handleUndo() {
    if (this.isAiThinking) return;
    if (this.historyIndex < 0 && this.historyStack.length === 0) return;
    if (this.historyIndex === -1) return;

    if (this.mode === 'vs-ai') {
      if (this.playerColor === 'w') {
        // Player is White. If it is White's turn, step back 2 plies to White's previous turn
        if (this.game.turn() === 'w') {
          this.historyIndex = Math.max(-1, this.historyIndex - 2);
        } else {
          this.historyIndex = Math.max(-1, this.historyIndex - 1);
        }
      } else {
        // Player is Black. If it is Black's turn, step back 2 plies
        if (this.game.turn() === 'b') {
          if (this.historyIndex === 0) {
            this.historyIndex = -1;
          } else {
            this.historyIndex = Math.max(0, this.historyIndex - 2);
          }
        } else {
          this.historyIndex = Math.max(-1, this.historyIndex - 1);
        }
      }
    } else {
      // 2-player or tutorial: step back 1 ply
      this.historyIndex = Math.max(-1, this.historyIndex - 1);
    }

    this.applyHistoryPosition();

    // If player is Black and undid to -1, AI should make a move
    if (this.mode === 'vs-ai' && this.playerColor === 'b' && this.historyIndex === -1) {
      setTimeout(() => {
        if (this.historyIndex === -1 && this.game.turn() === 'w') {
          this.triggerAiMove();
        }
      }, 300);
    }
  }

  // Redo (前進下一步)
  handleRedo() {
    if (this.isAiThinking) return;
    if (this.historyIndex >= this.historyStack.length - 1) return;

    if (this.mode === 'vs-ai' && this.historyIndex + 2 < this.historyStack.length) {
      this.historyIndex += 2;
    } else {
      this.historyIndex += 1;
    }

    this.applyHistoryPosition();
  }

  // Jump to the very beginning
  jumpToStart() {
    if (this.isAiThinking) return;
    if (this.historyIndex === -1) return;
    this.historyIndex = -1;
    this.applyHistoryPosition();
    if (this.mode === 'vs-ai' && this.playerColor === 'b') {
      setTimeout(() => {
        if (this.historyIndex === -1 && this.game.turn() === 'w') {
          this.triggerAiMove();
        }
      }, 300);
    }
  }

  // Jump to the latest move
  jumpToEnd() {
    if (this.isAiThinking) return;
    if (this.historyIndex === this.historyStack.length - 1) return;
    this.historyIndex = this.historyStack.length - 1;
    this.applyHistoryPosition();
  }

  applyHistoryPosition() {
    this.aiTurnId = (this.aiTurnId || 0) + 1;
    this.isAiThinking = false;
    this.boardUI.setInteractive(true);
    if (this.boardUI && typeof this.boardUI.setStalemateSquare === 'function') {
      this.boardUI.setStalemateSquare(null);
    }

    if (this.historyIndex === -1) {
      this.game.reset();
      this.boardUI.setLastMove(null, null);
    } else {
      const targetState = this.historyStack[this.historyIndex];
      this.game.load(targetState.fen);
      this.boardUI.setLastMove(targetState.move.from, targetState.move.to);
    }

    sounds.playMove();
    this.updateGameState();
  }

  updateGameState() {
    // 1. Update Board Rendering
    this.boardUI.render();

    // 2. King in Check highlight
    if (this.game.inCheck()) {
      const checkColor = this.game.turn();
      const kingSquare = this.findKingSquare(checkColor);
      this.boardUI.setCheckSquare(kingSquare);
    } else {
      this.boardUI.setCheckSquare(null);
    }

    // 3. Last move highlight
    if (this.historyIndex >= 0 && this.historyStack[this.historyIndex]) {
      const m = this.historyStack[this.historyIndex].move;
      this.boardUI.setLastMove(m.from, m.to);
    }

    // 4. Update Material, Captured Pieces & Evaluation
    this.updateScoresAndMaterial();

    // 5. Update Status Banner & Check Game Over
    this.updateStatusBanner();

    // 6. Update PGN Notation List
    this.renderMoveHistoryTable();

    // 7. Update Navigation buttons enabled/disabled states
    this.updateNavButtons();
  }

  findKingSquare(color) {
    const board = this.game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === color) {
          const file = String.fromCharCode(97 + c);
          const rank = 8 - r;
          return `${file}${rank}`;
        }
      }
    }
    return null;
  }

  updateScoresAndMaterial() {
    // Count pieces on board vs initial (8 pawns, 2 knights, 2 bishops, 2 rooks, 1 queen)
    const initialCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const currentCounts = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
    };

    const board = this.game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type !== 'k') {
          currentCounts[piece.color][piece.type]++;
        }
      }
    }

    // Captured by White = Black pieces lost
    // Captured by Black = White pieces lost
    const capturedByWhite = [];
    const capturedByBlack = [];

    let whiteMaterial = 0;
    let blackMaterial = 0;

    ['q', 'r', 'b', 'n', 'p'].forEach(type => {
      const lostByBlack = initialCounts[type] - currentCounts.b[type];
      for (let i = 0; i < lostByBlack; i++) {
        capturedByWhite.push({ color: 'b', type });
      }

      const lostByWhite = initialCounts[type] - currentCounts.w[type];
      for (let i = 0; i < lostByWhite; i++) {
        capturedByBlack.push({ color: 'w', type });
      }

      whiteMaterial += currentCounts.w[type] * PIECE_VALUES[type];
      blackMaterial += currentCounts.b[type] * PIECE_VALUES[type];
    });

    const netAdvantage = whiteMaterial - blackMaterial;

    // Render Captures to DOM
    const topCapturesEl = document.getElementById('top-player-captures');
    const bottomCapturesEl = document.getElementById('bottom-player-captures');
    const topBadgeEl = document.getElementById('top-material-badge');
    const bottomBadgeEl = document.getElementById('bottom-material-badge');

    const isTopWhite = this.boardUI.orientation === 'b';
    const topCaptures = isTopWhite ? capturedByWhite : capturedByBlack;
    const bottomCaptures = isTopWhite ? capturedByBlack : capturedByWhite;

    topCapturesEl.innerHTML = topCaptures.map(p => `
      <span class="captured-piece-mini">${getPieceSvg(p.color, p.type)}</span>
    `).join('');

    bottomCapturesEl.innerHTML = bottomCaptures.map(p => `
      <span class="captured-piece-mini">${getPieceSvg(p.color, p.type)}</span>
    `).join('');

    // Advantage badges
    const whiteAdv = netAdvantage > 0 ? `+${netAdvantage}` : '0';
    const blackAdv = netAdvantage < 0 ? `+${Math.abs(netAdvantage)}` : '0';

    if (isTopWhite) {
      topBadgeEl.textContent = whiteAdv;
      topBadgeEl.className = `material-badge ${netAdvantage > 0 ? 'positive' : ''}`;
      bottomBadgeEl.textContent = blackAdv;
      bottomBadgeEl.className = `material-badge ${netAdvantage < 0 ? 'positive' : ''}`;
    } else {
      topBadgeEl.textContent = blackAdv;
      topBadgeEl.className = `material-badge ${netAdvantage < 0 ? 'positive' : ''}`;
      bottomBadgeEl.textContent = whiteAdv;
      bottomBadgeEl.className = `material-badge ${netAdvantage > 0 ? 'positive' : ''}`;
    }

    // Evaluation Bar calculation
    const evalScore = evaluateBoard(this.game);
    const scoreInPawns = (evalScore / 100).toFixed(1);

    // Map centipawns to bar height percent (clamped between 5% and 95%)
    // -1000 CP => 5%, 0 CP => 50%, +1000 CP => 95%
    const winRate = 1 / (1 + Math.pow(10, -evalScore / 400));
    const fillPercent = Math.min(95, Math.max(5, winRate * 100));

    document.getElementById('eval-bar-fill').style.height = `${fillPercent}%`;
    const scoreText = (evalScore > 0 ? `+${scoreInPawns}` : scoreInPawns);
    document.getElementById('eval-bar-score').textContent = scoreText;

    this.renderScores();
  }

  renderScores() {
    document.getElementById('score-white-wins').textContent = this.scores.w;
    document.getElementById('score-black-wins').textContent = this.scores.b;
    document.getElementById('score-draws').textContent = this.scores.d;
  }

  updatePlayerBarTitles() {
    const topBar = document.getElementById('top-player-bar');
    const bottomBar = document.getElementById('bottom-player-bar');
    const topTurn = document.getElementById('top-turn-pill');
    const bottomTurn = document.getElementById('bottom-turn-pill');

    const turn = this.game.turn();
    const isTopWhite = this.boardUI.orientation === 'b';
    const isTopTurn = (turn === 'w' && isTopWhite) || (turn === 'b' && !isTopWhite);

    topBar.classList.toggle('active-turn', isTopTurn);
    bottomBar.classList.toggle('active-turn', !isTopTurn);
    topTurn.style.display = isTopTurn ? 'flex' : 'none';
    bottomTurn.style.display = isTopTurn ? 'none' : 'flex';

    if (this.mode === 'vs-ai') {
      const config = DIFFICULTY_CONFIG[this.aiDifficulty] || DIFFICULTY_CONFIG[3];
      const diffLabel = `${config.shortName} (${config.elo})`;
      if (this.playerColor === 'w') {
        document.getElementById('top-player-avatar').textContent = '🤖';
        document.getElementById('top-player-name').textContent = '電腦 AI (黑方)';
        document.getElementById('top-player-subtitle').textContent = this.isAiThinking ? '思考走法中...' : diffLabel;
        document.getElementById('bottom-player-avatar').textContent = '👤';
        document.getElementById('bottom-player-name').textContent = '玩家 (白方)';
        document.getElementById('bottom-player-subtitle').textContent = '執白先手';
      } else {
        document.getElementById('top-player-avatar').textContent = '🤖';
        document.getElementById('top-player-name').textContent = '電腦 AI (白方)';
        document.getElementById('top-player-subtitle').textContent = this.isAiThinking ? '思考走法中...' : diffLabel;
        document.getElementById('bottom-player-avatar').textContent = '👤';
        document.getElementById('bottom-player-name').textContent = '玩家 (黑方)';
        document.getElementById('bottom-player-subtitle').textContent = '執黑後手';
      }
    } else if (this.mode === 'two-player') {
      document.getElementById('top-player-avatar').textContent = '👥';
      document.getElementById('top-player-name').textContent = isTopWhite ? '玩家一 (白方)' : '玩家二 (黑方)';
      document.getElementById('top-player-subtitle').textContent = '同機對局';
      document.getElementById('bottom-player-avatar').textContent = '👤';
      document.getElementById('bottom-player-name').textContent = isTopWhite ? '玩家二 (黑方)' : '玩家一 (白方)';
      document.getElementById('bottom-player-subtitle').textContent = '同機對局';
    } else {
      document.getElementById('top-player-avatar').textContent = '🎓';
      document.getElementById('top-player-name').textContent = '開局對手 (引導)';
      document.getElementById('top-player-subtitle').textContent = '示範著法';
      document.getElementById('bottom-player-avatar').textContent = '👤';
      document.getElementById('bottom-player-name').textContent = '學員練習 (您)';
      document.getElementById('bottom-player-subtitle').textContent = '請按照教學提示走棋';
    }
  }

  updateStatusBanner() {
    const banner = document.getElementById('game-status-banner');
    const textEl = document.getElementById('game-status-text');
    banner.className = 'game-status-banner';
    if (this.boardUI && typeof this.boardUI.setStalemateSquare === 'function') {
      this.boardUI.setStalemateSquare(null);
    }

    if (this.game.isCheckmate()) {
      banner.classList.add('alert-mate');
      const winner = this.game.turn() === 'w' ? '黑方' : '白方';
      textEl.textContent = `🏆 將死 (Checkmate)！${winner} 獲得勝利！`;
      this.handleGameOver(winner === '白方' ? 'w' : 'b', '將死勝出');
      return;
    }

    if (this.game.isDraw()) {
      banner.classList.add('alert-draw');
      let reason = '雙方和局';
      let detail = '雙方勢均力敵，判定為和局。';

      if (this.game.isStalemate()) {
        reason = '逼和 (Stalemate)';
        detail = '逼和 (Stalemate)：輪到走棋方未受將軍，但無任何合法棋步可走。依國際象棋標準規則判定為和局！';
        const trappedSide = this.game.turn();
        const kingSq = this.findKingSquare(trappedSide);
        if (this.boardUI && typeof this.boardUI.setStalemateSquare === 'function') {
          this.boardUI.setStalemateSquare(kingSq);
        }
      } else if (this.game.isThreefoldRepetition()) {
        reason = '三次重複局面和局';
        detail = '三次重複局面 (Threefold Repetition)：相同盤面格局累計重複出現三次，依規則判定為和局！';
      } else if (this.game.isInsufficientMaterial()) {
        reason = '子力不足以致勝和局';
        detail = '子力不足 (Insufficient Material)：雙方剩餘子力無法形成將死，依規則判定為和局！';
      }

      textEl.textContent = `🤝 對局結束：${reason}！`;
      this.handleGameOver('d', detail);
      return;
    }

    if (this.game.inCheck()) {
      banner.classList.add('alert-check');
      const side = this.game.turn() === 'w' ? '白方' : '黑方';
      textEl.textContent = `⚠️ 將軍 (Check)！${side} 國王受到攻擊！`;
      return;
    }

    const currentTurn = this.game.turn() === 'w' ? '白方' : '黑方';
    textEl.textContent = `對局進行中，輪到 ${currentTurn} 走棋`;
  }

  handleGameOver(result, reason) {
    // Only record score once when reached the end of history
    if (this.historyIndex === this.historyStack.length - 1 && !this.gameRecorded) {
      this.gameRecorded = true;
      if (result === 'w') this.scores.w++;
      else if (result === 'b') this.scores.b++;
      else this.scores.d++;
      this.saveScores();

      setTimeout(() => {
        const modal = document.getElementById('gameover-modal');
        const icon = document.getElementById('gameover-icon');
        const title = document.getElementById('gameover-title');
        const desc = document.getElementById('gameover-desc');

        if (result === 'w') {
          icon.textContent = '🏆';
          title.textContent = '白方獲勝！';
          desc.textContent = `白方成功將死黑方 (${reason})`;
        } else if (result === 'b') {
          icon.textContent = '🏆';
          title.textContent = '黑方獲勝！';
          desc.textContent = `黑方成功將死白方 (${reason})`;
        } else {
          icon.textContent = '🤝';
          title.textContent = '對局和棋！';
          desc.textContent = reason;
        }

        modal.classList.add('open');
      }, 400);
    }
  }

  renderMoveHistoryTable() {
    const tbody = document.getElementById('move-history-tbody');
    tbody.innerHTML = '';

    const moves = this.historyStack.map(s => s.move);
    for (let i = 0; i < moves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = moves[i];
      const blackMove = moves[i + 1];

      const whiteIdx = i;
      const blackIdx = i + 1;

      const isWhiteActive = this.historyIndex === whiteIdx;
      const isBlackActive = this.historyIndex === blackIdx;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="move-num-col">${moveNum}.</td>
        <td>
          <span class="move-cell ${isWhiteActive ? 'active-history' : ''}" data-idx="${whiteIdx}">
            ${whiteMove.san}
          </span>
        </td>
        <td>
          ${blackMove ? `
            <span class="move-cell ${isBlackActive ? 'active-history' : ''}" data-idx="${blackIdx}">
              ${blackMove.san}
            </span>
          ` : ''}
        </td>
      `;

      tbody.appendChild(tr);
    }

    // Bind click to jump to history
    tbody.querySelectorAll('.move-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const idx = parseInt(cell.dataset.idx, 10);
        if (!isNaN(idx) && idx !== this.historyIndex && !this.isAiThinking) {
          this.historyIndex = idx;
          this.applyHistoryPosition();
        }
      });
    });

    // Auto scroll to bottom
    const container = document.getElementById('move-history-container');
    container.scrollTop = container.scrollHeight;
  }

  updateNavButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnStart = document.getElementById('btn-jump-start');
    const btnEnd = document.getElementById('btn-jump-end');

    const canUndo = this.historyIndex >= 0;
    const canRedo = this.historyIndex < this.historyStack.length - 1;

    btnUndo.disabled = !canUndo || this.isAiThinking;
    btnStart.disabled = !canUndo || this.isAiThinking;
    btnRedo.disabled = !canRedo || this.isAiThinking;
    btnEnd.disabled = !canRedo || this.isAiThinking;
  }

  // ==================== TUTORIAL MODE LOGIC ====================
  loadTutorialOpening(openingId) {
    this.currentOpening = getOpeningById(openingId);
    this.tutorialStepIndex = 0;
    this.game.reset();
    this.historyStack = [];
    this.historyIndex = -1;

    // Reset UI to Tutorial Mode
    document.getElementById('tutorial-opening-select').value = this.currentOpening.id;
    document.getElementById('tut-cat-badge').textContent = this.currentOpening.category;

    // Render principles
    const principlesList = document.getElementById('tut-principles-list');
    principlesList.innerHTML = this.currentOpening.principles.map(p => `<li>${p}</li>`).join('');

    this.boardUI.setOrientation('w');
    this.renderTutorialStep();
  }

  renderTutorialStep() {
    const steps = this.currentOpening.moves;
    const currentStep = steps[this.tutorialStepIndex];

    const progressPercent = ((this.tutorialStepIndex) / steps.length) * 100;
    document.getElementById('tut-progress-fill').style.width = `${progressPercent}%`;

    if (!currentStep) {
      // Completed tutorial!
      document.getElementById('tut-step-badge').textContent = '恭喜完成！';
      document.getElementById('tut-step-san').textContent = '開局教學完成 🎉';
      document.getElementById('tut-step-explanation').textContent = `
        您已經成功學會了「${this.currentOpening.name}」的核心著法！您現在可以點擊「重來」再次練習，或切換至「電腦對戰」模式在實戰中大顯身手！
      `;
      document.getElementById('tut-concept-text').textContent = '融會貫通';
      this.boardUI.setTutorialHint(null, null);
      this.boardUI.render();
      return;
    }

    // Display step details
    document.getElementById('tut-step-badge').textContent = `第 ${this.tutorialStepIndex + 1} / ${steps.length} 步 (${currentStep.side === 'w' ? '白方' : '黑方'})`;
    document.getElementById('tut-step-san').textContent = currentStep.title;
    document.getElementById('tut-step-explanation').textContent = currentStep.explanation;
    document.getElementById('tut-concept-text').textContent = currentStep.concept;

    // Highlight source and target with green arrow
    this.boardUI.render();
    this.boardUI.setTutorialHint(currentStep.from, currentStep.to);

    // Update player bars
    this.updatePlayerBarTitles();
  }

  handleTutorialMove(moveObj) {
    const currentStep = this.currentOpening.moves[this.tutorialStepIndex];
    if (!currentStep) return;

    // Normalize castling moves for tutorial verification
    let from = moveObj.from;
    let to = moveObj.to;
    if (from === 'e1' && to === 'h1') to = 'g1';
    else if (from === 'e1' && to === 'a1') to = 'c1';
    else if (from === 'e8' && to === 'h8') to = 'g8';
    else if (from === 'e8' && to === 'a8') to = 'c8';
    else if (from === 'h1' && to === 'e1') { from = 'e1'; to = 'g1'; }
    else if (from === 'a1' && to === 'e1') { from = 'e1'; to = 'c1'; }
    else if (from === 'h8' && to === 'e8') { from = 'e8'; to = 'g8'; }
    else if (from === 'a8' && to === 'e8') { from = 'e8'; to = 'c8'; }

    // Did user match the required move?
    if (from === currentStep.from && to === currentStep.to) {
      // Valid move!
      const result = this.game.move({
        from: currentStep.from,
        to: currentStep.to,
        promotion: 'q'
      });

      if (result) {
        this.playSoundForMove(result);
        this.tutorialStepIndex++;
        this.renderTutorialStep();

        // Check if next move is opponent's move in tutorial (and auto-advance smoothly)
        const nextStep = this.currentOpening.moves[this.tutorialStepIndex];
        if (nextStep && nextStep.side === 'b') {
          setTimeout(() => {
            this.tutorialShowCurrentStep();
          }, 800);
        }
      }
    } else {
      // Incorrect move
      alert(`💡 這是開局教學模式！\n目前推薦著法是：${currentStep.title}\n請將棋子從 ${currentStep.from.toUpperCase()} 移動到 ${currentStep.to.toUpperCase()}，或點擊「示範此步」。`);
      this.boardUI.render();
      this.boardUI.setTutorialHint(currentStep.from, currentStep.to);
    }
  }

  tutorialShowCurrentStep() {
    const currentStep = this.currentOpening.moves[this.tutorialStepIndex];
    if (!currentStep) return;

    const isCastle = (currentStep.from === 'e1' && (currentStep.to === 'g1' || currentStep.to === 'c1')) ||
                     (currentStep.from === 'e8' && (currentStep.to === 'g8' || currentStep.to === 'c8'));

    const applyTutorialMove = () => {
      const result = this.game.move({
        from: currentStep.from,
        to: currentStep.to,
        promotion: 'q'
      });

      if (result) {
        this.playSoundForMove(result);
        this.tutorialStepIndex++;
        this.renderTutorialStep();
      }
    };

    if (this.boardUI && typeof this.boardUI.animateMove === 'function') {
      this.boardUI.animateMove(currentStep.from, currentStep.to, { isCastle, duration: 280 }, applyTutorialMove);
    } else {
      applyTutorialMove();
    }
  }

  tutorialPrevStep() {
    if (this.tutorialStepIndex <= 0) return;
    this.tutorialStepIndex--;
    this.game.undo();
    sounds.playMove();
    this.renderTutorialStep();
  }

  tutorialNextStep() {
    this.tutorialShowCurrentStep();
  }
}

// Start app on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.chessApp = new ChessApp();
});
