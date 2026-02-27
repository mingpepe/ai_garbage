// Constants
const ROWS = 10;
const COLS = 9;

// Types
type Player = 'red' | 'black';
type PieceType = 'GENERAL' | 'ADVISOR' | 'ELEPHANT' | 'HORSE' | 'ROOK' | 'CANNON' | 'SOLDIER';

interface Piece {
    char: string;
    player: Player;
}

type Board = (Piece | null)[][];

interface Move {
    fR: number;
    fC: number;
    tR: number;
    tC: number;
}

// Global state
let board: Board = [];
let currentPlayer: Player = 'red';
let selectedPiece: { r: number, c: number } | null = null;
let lastMove: Move | null = null;
let gameOver: boolean = false;

const PIECE_VALUES: Record<PieceType, number> = {
    'GENERAL': 10000, 'ROOK': 100, 'HORSE': 45, 'CANNON': 50,
    'ELEPHANT': 20, 'ADVISOR': 20, 'SOLDIER': 10
};

const INITIAL_SETUP: string[][] = [
    ['車', '馬', '象', '士', '將', '士', '象', '馬', '車'],
    ['', '', '', '', '', '', '', '', ''],
    ['', '砲', '', '', '', '', '', '砲', ''],
    ['卒', '', '卒', '', '卒', '', '卒', '', '卒'],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['兵', '', '兵', '', '兵', '', '兵', '', '兵'],
    ['', '炮', '', '', '', '', '', '炮', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['俥', '傌', '相', '仕', '帥', '仕', '相', '傌', '俥']
];

export function isRedPiece(pieceChar: string): boolean {
    return ['俥', '傌', '相', '仕', '帥', '炮', '兵'].includes(pieceChar);
}

export function getPieceType(pieceChar: string): PieceType {
    const map: Record<string, PieceType> = {
        '俥': 'ROOK', '車': 'ROOK', '傌': 'HORSE', '馬': 'HORSE',
        '相': 'ELEPHANT', '象': 'ELEPHANT', '仕': 'ADVISOR', '士': 'ADVISOR',
        '帥': 'GENERAL', '將': 'GENERAL', '炮': 'CANNON', '砲': 'CANNON',
        '兵': 'SOLDIER', '卒': 'SOLDIER'
    };
    return map[pieceChar];
}

export function countBetween(r1: number, c1: number, r2: number, c2: number, currentBoard: Board): number {
    let count = 0;
    if (r1 === r2) {
        const minC = Math.min(c1, c2);
        const maxC = Math.max(c1, c2);
        for (let c = minC + 1; c < maxC; c++) {
            if (currentBoard[r1][c]) count++;
        }
    } else {
        const minR = Math.min(r1, r2);
        const maxR = Math.max(r1, r2);
        for (let r = minR + 1; r < maxR; r++) {
            if (currentBoard[r][c1]) count++;
        }
    }
    return count;
}

export function isMoveResultingInKingsMeeting(fR: number, fC: number, tR: number, tC: number, currentBoard: Board): boolean {
    const tempBoard = JSON.parse(JSON.stringify(currentBoard)) as Board;
    tempBoard[tR][tC] = tempBoard[fR][fC];
    tempBoard[fR][fC] = null;

    let redKing = null, blackKing = null;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const p = tempBoard[r][c];
            if (p) {
                if (p.char === '帥') redKing = { r, c };
                if (p.char === '將') blackKing = { r, c };
            }
        }
    }
    if (redKing && blackKing && redKing.c === blackKing.c) {
        if (countBetween(redKing.r, redKing.c, blackKing.r, blackKing.c, tempBoard) === 0) {
            return true;
        }
    }
    return false;
}

export function isValidMove(fR: number, fC: number, tR: number, tC: number, currentBoard: Board = board): boolean {
    const p = currentBoard[fR][fC];
    if (!p) return false;
    const target = currentBoard[tR][tC];
    const type = getPieceType(p.char);
    const dr = tR - fR;
    const dc = tC - fC;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);
    const isRed = p.player === 'red';

    if (target && target.player === p.player) return false;
    if (fR === tR && fC === tC) return false;

    switch (type) {
        case 'GENERAL':
            if (absDr + absDc !== 1) return false;
            if (tC < 3 || tC > 5) return false;
            if (isRed) { if (tR < 7 || tR > 9) return false; }
            else { if (tR < 0 || tR > 2) return false; }
            break;
        case 'ADVISOR':
            if (absDr !== 1 || absDc !== 1) return false;
            if (tC < 3 || tC > 5) return false;
            if (isRed) { if (tR < 7 || tR > 9) return false; }
            else { if (tR < 0 || tR > 2) return false; }
            break;
        case 'ELEPHANT':
            if (absDr !== 2 || absDc !== 2) return false;
            if (isRed) { if (tR < 5) return false; }
            else { if (tR > 4) return false; }
            if (currentBoard[fR + dr/2][fC + dc/2]) return false;
            break;
        case 'HORSE':
            if (!((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2))) return false;
            if (absDr === 2) { if (currentBoard[fR + dr/2][fC]) return false; }
            else { if (currentBoard[fR][fC + dc/2]) return false; }
            break;
        case 'ROOK':
            if (fR !== tR && fC !== tC) return false;
            if (countBetween(fR, fC, tR, tC, currentBoard) !== 0) return false;
            break;
        case 'CANNON':
            if (fR !== tR && fC !== tC) return false;
            const count = countBetween(fR, fC, tR, tC, currentBoard);
            if (target) { if (count !== 1) return false; }
            else { if (count !== 0) return false; }
            break;
        case 'SOLDIER':
            const moveDir = isRed ? -1 : 1;
            if (dr === moveDir && dc === 0) return true;
            const crossed = isRed ? fR <= 4 : fR >= 5;
            if (crossed && dr === 0 && absDc === 1) return true;
            return false;
    }

    if (isMoveResultingInKingsMeeting(fR, fC, tR, tC, currentBoard)) return false;
    return true;
}

if (typeof document !== 'undefined') {
    const boardElement = document.getElementById('board')!;
    const statusElement = document.getElementById('status')!;

    const createPalaceLines = (): void => {
        const lines = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        lines.forEach(type => {
            const line = document.createElement('div');
            line.className = `palace-line ${type}`;
            boardElement.appendChild(line);
        });
    }

    const initBoard = (): void => {
        boardElement.innerHTML = '';
        createPalaceLines();
        gameOver = false;
        currentPlayer = 'red';
        selectedPiece = null;
        lastMove = null;
        statusElement.textContent = 'Red Turn';
        statusElement.style.color = '#d32f2f';

        for (let r = 0; r < ROWS; r++) {
            board[r] = [];
            for (let c = 0; c < COLS; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.r = r.toString();
                cell.dataset.c = c.toString();
                cell.addEventListener('click', () => handleCellClick(r, c));
                const pieceChar = INITIAL_SETUP[r][c];
                if (pieceChar) {
                    board[r][c] = { char: pieceChar, player: isRedPiece(pieceChar) ? 'red' : 'black' };
                } else {
                    board[r][c] = null;
                }
                boardElement.appendChild(cell);
            }
        }
        renderBoard();
    };

    const renderBoard = (): void => {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            const el = cell as HTMLElement;
            el.innerHTML = '';
            const r = parseInt(el.dataset.r!);
            const c = parseInt(el.dataset.c!);
            el.classList.remove('last-move-from', 'last-move-to');
            if (lastMove) {
                if (r === lastMove.fR && c === lastMove.fC) el.classList.add('last-move-from');
                if (r === lastMove.tR && c === lastMove.tC) el.classList.add('last-move-to');
            }
            const pieceData = board[r][c];
            if (pieceData) {
                const piece = document.createElement('div');
                piece.className = `piece ${pieceData.player}`;
                if (selectedPiece && selectedPiece.r === r && selectedPiece.c === c) piece.classList.add('selected');
                piece.textContent = pieceData.char;
                el.appendChild(piece);
            }
        });
    };

    const handleCellClick = (r: number, c: number): void => {
        if (gameOver || currentPlayer === 'black') return;
        const pieceData = board[r][c];
        if (selectedPiece) {
            if (pieceData && pieceData.player === currentPlayer) {
                selectedPiece = { r, c }; renderBoard();
            } else {
                if (isValidMove(selectedPiece.r, selectedPiece.c, r, c)) movePiece(selectedPiece.r, selectedPiece.c, r, c);
            }
        } else if (pieceData && pieceData.player === currentPlayer) {
            selectedPiece = { r, c }; renderBoard();
        }
    };

    const movePiece = (fromR: number, fromC: number, toR: number, toC: number): void => {
        const target = board[toR][toC];
        if (target && getPieceType(target.char) === 'GENERAL') {
            gameOver = true;
            statusElement.textContent = (currentPlayer === 'red' ? 'Red Wins!' : 'Computer Wins!');
            statusElement.style.color = '#ff9800';
        }
        lastMove = { fR: fromR, fC: fromC, tR: toR, tC: toC };
        board[toR][toC] = board[fromR][fromC];
        board[fromR][fromC] = null;
        selectedPiece = null;
        if (!gameOver) {
            currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
            statusElement.textContent = currentPlayer === 'red' ? 'Red Turn' : 'Thinking...';
            statusElement.style.color = currentPlayer === 'red' ? '#d32f2f' : '#555';
            if (currentPlayer === 'black') setTimeout(makeComputerMove, 1200);
        }
        renderBoard();
    };

    const makeComputerMove = (): void => {
        if (gameOver) return;
        const allMoves: { fR: number, fC: number, tR: number, tC: number, score: number }[] = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const p = board[r][c];
                if (p && p.player === 'black') {
                    for (let tr = 0; tr < ROWS; tr++) {
                        for (let tc = 0; tc < COLS; tc++) {
                            if (isValidMove(r, c, tr, tc)) {
                                let score = 0;
                                const target = board[tr][tc];
                                if (target) score = PIECE_VALUES[getPieceType(target.char)];
                                score += Math.random() * 5;
                                allMoves.push({ fR: r, fC: c, tR: tr, tC: tc, score });
                            }
                        }
                    }
                }
            }
        }
        if (allMoves.length === 0) {
            gameOver = true;
            statusElement.textContent = "Red Wins! (Stalemate)";
            return;
        }
        allMoves.sort((a, b) => b.score - a.score);
        const best = allMoves[0];
        movePiece(best.fR, best.fC, best.tR, best.tC);
    };

    (window as any).initBoard = initBoard;
    initBoard();
}
