using System;
using System.Collections.Generic;
using System.Linq;
using Chess.Logic;

namespace Chess.ConsoleApp
{
    class Program
    {
        static void Main(string[] args)
        {
            var board = new Board();
            while (!board.game_over)
            {
                PrintBoard(board);
                if (board.current_player == Player.Red)
                {
                    Console.Write("Red Move (fr fc tr tc): ");
                    string input = Console.ReadLine();
                    string[] parts = input?.Split(' ');
                    if (parts?.Length == 4 && 
                        int.TryParse(parts[0], out int fr) && int.TryParse(parts[1], out int fc) &&
                        int.TryParse(parts[2], out int tr) && int.TryParse(parts[3], out int tc))
                    {
                        if (!board.MakeMove(fr, fc, tr, tc))
                        {
                            Console.WriteLine("Invalid move! Press any key.");
                            Console.ReadKey();
                        }
                    }
                }
                else
                {
                    Console.WriteLine("Computer (Black) is thinking...");
                    System.Threading.Thread.Sleep(1000);
                    board.MakeComputerMove();
                }
            }
            PrintBoard(board);
            Console.WriteLine("Game Over!");
        }

        static void PrintBoard(Board board)
        {
            Console.Clear();
            Console.WriteLine("  0 1 2 3 4 5 6 7 8");
            for (int r = 0; r < 10; r++)
            {
                Console.Write(r + " ");
                for (int c = 0; c < 9; c++)
                {
                    var p = board.State[r, c];
                    if (p == null) Console.Write(". ");
                    else
                    {
                        Console.ForegroundColor = p.Color == Player.Red ? ConsoleColor.Red : ConsoleColor.Gray;
                        Console.Write(p.Char + " ");
                        Console.ResetColor();
                    }
                }
                Console.WriteLine();
            }
            Console.WriteLine($"Turn: {board.current_player}");
        }
    }
}
namespace Chess.Logic {
    public partial class Board {
        public Player current_player = Player.Red;
        public bool game_over = false;
        private static Dictionary<PieceType, int> PIECE_VALUES = new Dictionary<PieceType, int> {
            {PieceType.General, 10000}, {PieceType.Rook, 100}, {PieceType.Horse, 45}, 
            {PieceType.Cannon, 50}, {PieceType.Elephant, 20}, {PieceType.Advisor, 20}, {PieceType.Soldier, 10}
        };

        public bool MakeMove(int fr, int fc, int tr, int tc) {
            if (!IsValidMove(fr, fc, tr, tc)) return false;
            if (State[tr, tc]?.Type == PieceType.General) game_over = true;
            State[tr, tc] = State[fr, fc];
            State[fr, fc] = null;
            current_player = current_player == Player.Red ? Player.Black : Player.Red;
            return true;
        }

        public void MakeComputerMove() {
            var moves = new List<(int fr, int fc, int tr, int tc, int score)>();
            for (int r = 0; r < 10; r++) for (int c = 0; c < 9; c++) {
                if (State[r, c]?.Color == Player.Black) {
                    for (int tr = 0; tr < 10; tr++) for (int tc = 0; tc < 9; tc++) {
                        if (IsValidMove(r, c, tr, tc)) {
                            int score = State[tr, tc] != null ? PIECE_VALUES[State[tr, tc].Type] : 0;
                            moves.Add((r, c, tr, tc, score));
                        }
                    }
                }
            }
            if (moves.Count == 0) { game_over = true; return; }
            var best = moves.OrderByDescending(m => m.score).ThenBy(_ => Guid.NewGuid()).First();
            MakeMove(best.fr, best.fc, best.tr, best.tc);
        }
    }
}
