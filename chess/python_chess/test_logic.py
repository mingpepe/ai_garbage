# -*- coding: utf-8 -*-
import unittest
from logic import Board, is_valid_move

class TestChessLogic(unittest.TestCase):
    def setUp(self):
        self.board = Board()

    def test_piece_initialization(self):
        self.assertEqual(self.board.get_piece(0, 0)['char'], '車')
        self.assertEqual(self.board.get_piece(9, 8)['char'], '俥')

    def test_rook_movement(self):
        self.assertTrue(is_valid_move(self.board, 0, 0, 2, 0))
        self.assertFalse(is_valid_move(self.board, 0, 0, 3, 0))

    def test_horse_movement(self):
        self.assertTrue(is_valid_move(self.board, 0, 1, 2, 2))
        self.board.state[1][1] = {'char': '兵', 'player': 'black'}
        self.assertFalse(is_valid_move(self.board, 0, 1, 2, 2))

if __name__ == '__main__':
    unittest.main()
