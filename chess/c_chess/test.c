#include <assert.h>
#include <stdio.h>
#include "logic.h"

int main() {
    Board board;
    init_board(&board);
    
    // Test Initial state
    assert(board.state[0][0].exists == true);
    printf("Initial board state test passed.\n");

    // Test Rook Movement (Valid to an empty square)
    assert(is_valid_move(&board, 0, 0, 2, 0) == true);
    printf("Rook movement validation test passed.\n");

    // Test Horse Movement (Valid L-shape)
    assert(is_valid_move(&board, 0, 1, 2, 2) == true);
    printf("Horse movement validation test passed.\n");

    printf("All C tests passed successfully.\n");
    return 0;
}
