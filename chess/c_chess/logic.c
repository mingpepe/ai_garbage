#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdlib.h>
#include <time.h>
#include "logic.h"

static const int PIECE_VALUES[] = { 10000, 20, 20, 45, 100, 50, 10, 0 };

static PieceType get_type_from_char(const char* c) {
    if (strstr("俥車", c)) return ROOK;
    if (strstr("傌馬", c)) return HORSE;
    if (strstr("相象", c)) return ELEPHANT;
    if (strstr("仕士", c)) return ADVISOR;
    if (strstr("帥將", c)) return GENERAL;
    if (strstr("炮砲", c)) return CANNON;
    if (strstr("兵卒", c)) return SOLDIER;
    return NONE;
}

void init_board(Board *board) {
    memset(board->state, 0, sizeof(board->state));
    const char *initial[10][9] = {
        {"車", "馬", "象", "士", "將", "士", "象", "馬", "車"},
        {"", "", "", "", "", "", "", "", ""},
        {"", "砲", "", "", "", "", "", "砲", ""},
        {"卒", "", "卒", "", "卒", "", "卒", "", "卒"},
        {"", "", "", "", "", "", "", "", ""},
        {"", "", "", "", "", "", "", "", ""},
        {"兵", "", "兵", "", "兵", "", "兵", "", "兵"},
        {"", "炮", "", "", "", "", "", "炮", ""},
        {"", "", "", "", "", "", "", "", ""},
        {"俥", "傌", "相", "仕", "帥", "仕", "相", "傌", "俥"}
    };

    for (int r = 0; r < 10; r++) {
        for (int c = 0; c < 9; c++) {
            if (strlen(initial[r][c]) > 0) {
                strcpy(board->state[r][c].piece_char, initial[r][c]);
                board->state[r][c].exists = true;
                board->state[r][c].player = strstr("俥傌相仕帥炮兵", initial[r][c]) ? RED : BLACK;
                board->state[r][c].type = get_type_from_char(initial[r][c]);
            }
        }
    }
    board->current_player = RED;
    board->game_over = false;
    srand(time(NULL));
}

static int count_between(Board *board, int r1, int c1, int r2, int c2) {
    int count = 0;
    if (r1 == r2) {
        int min_c = c1 < c2 ? c1 : c2, max_c = c1 > c2 ? c1 : c2;
        for (int c = min_c + 1; c < max_c; c++) if (board->state[r1][c].exists) count++;
    } else {
        int min_r = r1 < r2 ? r1 : r2, max_r = r1 > r2 ? r1 : r2;
        for (int r = min_r + 1; r < max_r; r++) if (board->state[r][c1].exists) count++;
    }
    return count;
}

static bool is_kings_meeting(Board *board, int fr, int fc, int tr, int tc) {
    Piece old_from = board->state[fr][fc], old_to = board->state[tr][tc];
    board->state[tr][tc] = old_from; board->state[fr][fc].exists = false;
    int rKr = -1, rKc = -1, bKr = -1, bKc = -1;
    for (int r = 0; r < 10; r++) for (int c = 0; c < 9; c++) {
        if (!board->state[r][c].exists) continue;
        if (board->state[r][c].type == GENERAL) {
            if (board->state[r][c].player == RED) { rKr = r; rKc = c; }
            else { bKr = r; bKc = c; }
        }
    }
    bool meeting = (rKc == bKc && rKc != -1 && count_between(board, rKr, rKc, bKr, bKc) == 0);
    board->state[fr][fc] = old_from; board->state[tr][tc] = old_to;
    return meeting;
}

bool is_valid_move(Board *board, int fr, int fc, int tr, int tc) {
    if (!board->state[fr][fc].exists || board->game_over) return false;
    Piece *p = &board->state[fr][fc], *target = &board->state[tr][tc];
    if (target->exists && target->player == p->player) return false;
    if (fr == tr && fc == tc) return false;
    int dr = tr - fr, dc = tc - fc, absDr = abs(dr), absDc = abs(dc);
    bool is_red = (p->player == RED), possible = false;

    switch (p->type) {
        case GENERAL:
            if (absDr + absDc == 1 && tc >= 3 && tc <= 5)
                possible = is_red ? (tr >= 7 && tr <= 9) : (tr >= 0 && tr <= 2);
            break;
        case ADVISOR:
            if (absDr == 1 && absDc == 1 && tc >= 3 && tc <= 5)
                possible = is_red ? (tr >= 7 && tr <= 9) : (tr >= 0 && tr <= 2);
            break;
        case ELEPHANT:
            if (absDr == 2 && absDc == 2) {
                if (is_red && tr < 5) return false;
                if (!is_red && tr > 4) return false;
                possible = !board->state[fr + dr/2][fc + dc/2].exists;
            }
            break;
        case HORSE:
            if ((absDr == 2 && absDc == 1) || (absDr == 1 && absDc == 2))
                possible = absDr == 2 ? !board->state[fr + dr/2][fc].exists : !board->state[fr][fc + dc/2].exists;
            break;
        case ROOK:
            if ((fr == tr || fc == tc) && count_between(board, fr, fc, tr, tc) == 0) possible = true;
            break;
        case CANNON:
            if (fr == tr || fc == tc) {
                int cnt = count_between(board, fr, fc, tr, tc);
                possible = target->exists ? (cnt == 1) : (cnt == 0);
            }
            break;
        case SOLDIER:
            if (dr == (is_red ? -1 : 1) && dc == 0) possible = true;
            else if ((is_red ? fr <= 4 : fr >= 5) && dr == 0 && absDc == 1) possible = true;
            break;
        default: break;
    }
    return possible && !is_kings_meeting(board, fr, fc, tr, tc);
}

bool make_move(Board *board, int fr, int fc, int tr, int tc) {
    if (!is_valid_move(board, fr, fc, tr, tc)) return false;
    if (board->state[tr][tc].exists && board->state[tr][tc].type == GENERAL) board->game_over = true;
    board->state[tr][tc] = board->state[fr][fc];
    board->state[fr][fc].exists = false;
    board->current_player = (board->current_player == RED) ? BLACK : RED;
    return true;
}

void computer_move(Board *board) {
    if (board->game_over) return;
    int best_score = -1, best_fr, best_fc, best_tr, best_tc;
    int move_count = 0;
    typedef struct { int fr, fc, tr, tc; } Move;
    Move moves[256];

    for (int r = 0; r < 10; r++) for (int c = 0; c < 9; c++) {
        if (board->state[r][c].exists && board->state[r][c].player == BLACK) {
            for (int tr = 0; tr < 10; tr++) for (int tc = 0; tc < 9; tc++) {
                if (is_valid_move(board, r, c, tr, tc)) {
                    int score = board->state[tr][tc].exists ? PIECE_VALUES[board->state[tr][tc].type] : 0;
                    if (score > best_score) {
                        best_score = score; move_count = 0;
                    }
                    if (score == best_score && move_count < 256) {
                        moves[move_count++] = (Move){r, c, tr, tc};
                    }
                }
            }
        }
    }
    if (move_count > 0) {
        Move m = moves[rand() % move_count];
        make_move(board, m.fr, m.fc, m.tr, m.tc);
    }
}
