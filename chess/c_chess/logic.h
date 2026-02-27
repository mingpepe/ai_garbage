#ifndef CHESS_LOGIC_H
#define CHESS_LOGIC_H

#include <stdbool.h>

typedef enum { RED = 0, BLACK = 1 } Player;
typedef enum { GENERAL, ADVISOR, ELEPHANT, HORSE, ROOK, CANNON, SOLDIER, NONE } PieceType;

typedef struct {
    char piece_char[8]; // UTF-8 char
    Player player;
    PieceType type;
    bool exists;
} Piece;

typedef struct {
    Piece state[10][9];
    Player current_player;
    bool game_over;
} Board;

void init_board(Board *board);
bool is_valid_move(Board *board, int fr, int fc, int tr, int tc);
bool make_move(Board *board, int fr, int fc, int tr, int tc);
void computer_move(Board *board);

#endif
