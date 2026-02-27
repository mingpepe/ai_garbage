import { isRedPiece, getPieceType, isValidMove } from '../src/script';

describe('Chinese Chess Logic Tests', () => {
    let mockBoard: any[][];

    beforeEach(() => {
        mockBoard = Array(10).fill(null).map(() => Array(9).fill(null));
    });

    test('Should correctly identify piece types', () => {
        expect(getPieceType('俥')).toBe('ROOK');
        expect(getPieceType('車')).toBe('ROOK');
        expect(getPieceType('傌')).toBe('HORSE');
        expect(getPieceType('帥')).toBe('GENERAL');
        expect(getPieceType('卒')).toBe('SOLDIER');
    });

    test('Rook (俥) should move in straight lines and not jump over pieces', () => {
        mockBoard[0][0] = { char: '俥', player: 'red' };
        expect(isValidMove(0, 0, 5, 0, mockBoard)).toBe(true);
        expect(isValidMove(0, 0, 0, 8, mockBoard)).toBe(true);
        
        mockBoard[2][0] = { char: '兵', player: 'red' };
        expect(isValidMove(0, 0, 5, 0, mockBoard)).toBe(false);
    });

    test('Horse (傌) should follow the L-shape and be blocked by its leg', () => {
        mockBoard[5][5] = { char: '傌', player: 'red' };
        expect(isValidMove(5, 5, 3, 4, mockBoard)).toBe(true);
        expect(isValidMove(5, 5, 3, 6, mockBoard)).toBe(true);
        
        mockBoard[4][5] = { char: '兵', player: 'red' };
        expect(isValidMove(5, 5, 3, 4, mockBoard)).toBe(false);
        expect(isValidMove(5, 5, 3, 6, mockBoard)).toBe(false);
    });

    test('Elephant (相) should move diagonally two steps and not cross the river', () => {
        mockBoard[9][2] = { char: '相', player: 'red' };
        expect(isValidMove(9, 2, 7, 0, mockBoard)).toBe(true);
        expect(isValidMove(9, 2, 7, 4, mockBoard)).toBe(true);
        
        mockBoard[8][3] = { char: '兵', player: 'red' };
        expect(isValidMove(9, 2, 7, 4, mockBoard)).toBe(false);
        
        mockBoard[5][6] = { char: '相', player: 'red' };
        expect(isValidMove(5, 6, 3, 4, mockBoard)).toBe(false);
    });

    test('Soldier (兵) movement rules before and after crossing river', () => {
        mockBoard[6][4] = { char: '兵', player: 'red' };
        expect(isValidMove(6, 4, 5, 4, mockBoard)).toBe(true);
        expect(isValidMove(6, 4, 6, 3, mockBoard)).toBe(false);
        
        mockBoard[4][4] = { char: '兵', player: 'red' };
        expect(isValidMove(4, 4, 3, 4, mockBoard)).toBe(true);
        expect(isValidMove(4, 4, 4, 3, mockBoard)).toBe(true);
        expect(isValidMove(4, 4, 5, 4, mockBoard)).toBe(false);
    });

    test('Cannot capture own piece', () => {
        mockBoard[0][0] = { char: '俥', player: 'red' };
        mockBoard[0][1] = { char: '傌', player: 'red' };
        expect(isValidMove(0, 0, 0, 1, mockBoard)).toBe(false);
    });
});
