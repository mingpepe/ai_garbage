using Xunit;
using Chess.Logic;

namespace Chess.Tests
{
    public class LogicTests
    {
        [Fact]
        public void InitialBoard_HasPieces()
        {
            var board = new Board();
            // Check some key pieces
            Assert.NotNull(board.State[0, 0]);
            Assert.Equal('車', board.State[0, 0]!.Char);
            Assert.Equal('俥', board.State[9, 0]!.Char);
        }

        [Fact]
        public void Move_ShouldWork()
        {
            var board = new Board();
            // Rook move from (0,0) to (2,0) is valid in initial setup
            bool valid = board.IsValidMove(0, 0, 2, 0);
            Assert.True(valid);
        }

        [Fact]
        public void InvalidMove_CaptureOwnPiece_ShouldFail()
        {
            var board = new Board();
            // Rook (0,0) trying to capture Horse (0,1)
            bool valid = board.IsValidMove(0, 0, 0, 1);
            Assert.False(valid);
        }
    }
}
