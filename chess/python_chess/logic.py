# -*- coding: utf-8 -*-
import copy

class Board:
    def __init__(self):
        self.ROWS = 10
        self.COLS = 9
        self.state = [[None for _ in range(self.COLS)] for _ in range(self.ROWS)]
        self.current_player = 'red'
        self.game_over = False
        self.setup()

    def setup(self):
        initial = [
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
        ]
        for r in range(self.ROWS):
            for c in range(self.COLS):
                char = initial[r][c]
                if char:
                    player = 'red' if char in '俥傌相仕帥炮兵' else 'black'
                    self.state[r][c] = {'char': char, 'player': player, 'type': get_piece_type(char)}

def get_piece_type(char):
    mapping = {
        '俥': 'ROOK', '車': 'ROOK', '傌': 'HORSE', '馬': 'HORSE',
        '相': 'ELEPHANT', '象': 'ELEPHANT', '仕': 'ADVISOR', '士': 'ADVISOR',
        '帥': 'GENERAL', '將': 'GENERAL', '炮': 'CANNON', '砲': 'CANNON',
        '兵': 'SOLDIER', '卒': 'SOLDIER'
    }
    return mapping.get(char)

def count_between(state, r1, c1, r2, c2):
    count = 0
    if r1 == r2:
        for c in range(min(c1, c2) + 1, max(c1, c2)):
            if state[r1][c]: count += 1
    else:
        for r in range(min(r1, r2) + 1, max(r1, r2)):
            if state[r][c1]: count += 1
    return count

def is_kings_meeting(state, fr, fc, tr, tc):
    # Simulate move
    temp_state = copy.deepcopy(state)
    temp_state[tr][tc] = temp_state[fr][fc]
    temp_state[fr][fc] = None

    rK, bK = None, None
    for r in range(10):
        for c in range(9):
            p = temp_state[r][c]
            if p and p['type'] == 'GENERAL':
                if p['player'] == 'red': rK = (r, c)
                else: bK = (r, c)
    
    if rK and bK and rK[1] == bK[1]:
        if count_between(temp_state, rK[0], rK[1], bK[0], bK[1]) == 0:
            return True
    return False

def is_valid_move(board_obj, fr, fc, tr, tc):
    state = board_obj.state
    p = state[fr][fc]
    if not p or board_obj.game_over: return False
    target = state[tr][tc]
    
    if target and target['player'] == p['player']: return False
    if fr == tr and fc == tc: return False

    ptype = p['type']
    dr, dc = tr - fr, tc - fc
    abs_dr, abs_dc = abs(dr), abs(dc)
    is_red = p['player'] == 'red'

    possible = False
    if ptype == 'GENERAL':
        if abs_dr + abs_dc == 1 and 3 <= tc <= 5:
            possible = (7 <= tr <= 9) if is_red else (0 <= tr <= 2)
    elif ptype == 'ADVISOR':
        if abs_dr == 1 and abs_dc == 1 and 3 <= tc <= 5:
            possible = (7 <= tr <= 9) if is_red else (0 <= tr <= 2)
    elif ptype == 'ELEPHANT':
        if abs_dr == 2 and abs_dc == 2:
            if (is_red and tr >= 5) or (not is_red and tr <= 4):
                if not state[fr + dr//2][fc + dc//2]: possible = True
    elif ptype == 'HORSE':
        if (abs_dr == 2 and abs_dc == 1) or (abs_dr == 1 and abs_dc == 2):
            if abs_dr == 2: possible = not state[fr + dr//2][fc]
            else: possible = not state[fr][fc + dc//2]
    elif ptype == 'ROOK':
        if (fr == tr or fc == tc) and count_between(state, fr, fc, tr, tc) == 0:
            possible = True
    elif ptype == 'CANNON':
        if fr == tr or fc == tc:
            cnt = count_between(state, fr, fc, tr, tc)
            possible = (cnt == 1) if target else (cnt == 0)
    elif ptype == 'SOLDIER':
        if dr == (-1 if is_red else 1) and dc == 0: possible = True
        else:
            crossed = (fr <= 4) if is_red else (fr >= 5)
            if crossed and dr == 0 and abs_dc == 1: possible = True

    if not possible: return False
    return not is_kings_meeting(state, fr, fc, tr, tc)

def get_computer_move(board_obj):
    PIECE_VALUES = {'GENERAL': 10000, 'ROOK': 100, 'HORSE': 45, 'CANNON': 50, 'ELEPHANT': 20, 'ADVISOR': 20, 'SOLDIER': 10}
    best_moves = []
    max_score = -1

    for r in range(10):
        for c in range(9):
            p = board_obj.state[r][c]
            if p and p['player'] == 'black':
                for tr in range(10):
                    for tc in range(9):
                        if is_valid_move(board_obj, r, c, tr, tc):
                            target = board_obj.state[tr][tc]
                            score = PIECE_VALUES[target['type']] if target else 0
                            if score > max_score:
                                max_score = score
                                best_moves = [(r, c, tr, tc)]
                            elif score == max_score:
                                best_moves.append((r, c, tr, tc))
    
    import random
    return random.choice(best_moves) if best_moves else None
