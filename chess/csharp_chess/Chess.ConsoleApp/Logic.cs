using System;
using System.Collections.Generic;
using System.Linq;

namespace Chess.Logic
{
    public enum Player { Red, Black }
    public enum PieceType { General, Advisor, Elephant, Horse, Rook, Cannon, Soldier }

    public class Piece
    {
        public char Char { get; set; }
        public Player Color { get; set; }
        public PieceType Type { get; set; }
    }

    public partial class Board
    {
        public Piece? [,] State = new Piece?[10, 9];

        public Board()
        {
            Reset();
        }

        public void Reset()
        {
            string[,] initial = new string[10, 9] {
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

            for (int r = 0; r < 10; r++)
            {
                for (int c = 0; c < 9; c++)
                {
                    if (!string.IsNullOrEmpty(initial[r, c]))
                    {
                        char ch = initial[r, c][0];
                        State[r, c] = new Piece
                        {
                            Char = ch,
                            Color = "俥傌相仕帥炮兵".Contains(ch) ? Player.Red : Player.Black,
                            Type = MapType(ch)
                        };
                    }
                    else State[r, c] = null;
                }
            }
        }

        private PieceType MapType(char c)
        {
            if ("俥車".Contains(c)) return PieceType.Rook;
            if ("傌馬".Contains(c)) return PieceType.Horse;
            if ("相象".Contains(c)) return PieceType.Elephant;
            if ("仕士".Contains(c)) return PieceType.Advisor;
            if ("帥將".Contains(c)) return PieceType.General;
            if ("炮砲".Contains(c)) return PieceType.Cannon;
            return PieceType.Soldier;
        }

        public bool IsValidMove(int fr, int fc, int tr, int tc)
        {
            Piece? p = State[fr, fc];
            if (p == null) return false;
            Piece? target = State[tr, tc];

            if (target != null && target.Color == p.Color) return false;
            if (fr == tr && fc == tc) return false;

            int dr = tr - fr;
            int dc = tc - fc;
            int absDr = Math.Abs(dr);
            int absDc = Math.Abs(dc);

            bool possible = false;
            switch (p.Type)
            {
                case PieceType.General:
                    if (absDr + absDc == 1 && tc >= 3 && tc <= 5)
                        possible = p.Color == Player.Red ? (tr >= 7 && tr <= 9) : (tr >= 0 && tr <= 2);
                    break;
                case PieceType.Advisor:
                    if (absDr == 1 && absDc == 1 && tc >= 3 && tc <= 5)
                        possible = p.Color == Player.Red ? (tr >= 7 && tr <= 9) : (tr >= 0 && tr <= 2);
                    break;
                case PieceType.Elephant:
                    if (absDr == 2 && absDc == 2) {
                        if (p.Color == Player.Red && tr >= 5 && State[fr + dr/2, fc + dc/2] == null) possible = true;
                        if (p.Color == Player.Black && tr <= 4 && State[fr + dr/2, fc + dc/2] == null) possible = true;
                    }
                    break;
                case PieceType.Horse:
                    if ((absDr == 2 && absDc == 1) || (absDr == 1 && absDc == 2)) {
                        possible = (absDr == 2) ? (State[fr + dr/2, fc] == null) : (State[fr, fc + dc/2] == null);
                    }
                    break;
                case PieceType.Rook:
                    if ((fr == tr || fc == tc) && CountBetween(fr, fc, tr, tc) == 0) possible = true;
                    break;
                case PieceType.Cannon:
                    if (fr == tr || fc == tc) {
                        int count = CountBetween(fr, fc, tr, tc);
                        possible = target != null ? (count == 1) : (count == 0);
                    }
                    break;
                case PieceType.Soldier:
                    int dir = p.Color == Player.Red ? -1 : 1;
                    if (dr == dir && dc == 0) possible = true;
                    else {
                        bool crossed = p.Color == Player.Red ? fr <= 4 : fr >= 5;
                        if (crossed && dr == 0 && absDc == 1) possible = true;
                    }
                    break;
            }

            if (!possible) return false;
            return !IsKingsMeeting(fr, fc, tr, tc);
        }

        public int CountBetween(int r1, int c1, int r2, int c2)
        {
            int count = 0;
            if (r1 == r2)
            {
                for (int c = Math.Min(c1, c2) + 1; c < Math.Max(c1, c2); c++)
                    if (State[r1, c] != null) count++;
            }
            else
            {
                for (int r = Math.Min(r1, r2) + 1; r < Math.Max(r1, r2); r++)
                    if (State[r, c1] != null) count++;
            }
            return count;
        }

        private bool IsKingsMeeting(int fr, int fc, int tr, int tc)
        {
            Piece? oldFrom = State[fr, fc];
            Piece? oldTo = State[tr, tc];
            State[tr, tc] = oldFrom;
            State[fr, fc] = null;

            int rKr = -1, rKc = -1, bKr = -1, bKc = -1;
            for (int r = 0; r < 10; r++)
            {
                for (int c = 0; c < 9; c++)
                {
                    var piece = State[r, c];
                    if (piece == null) continue;
                    if (piece.Type == PieceType.General)
                    {
                        if (piece.Color == Player.Red) { rKr = r; rKc = c; }
                        else { bKr = r; bKc = c; }
                    }
                }
            }

            bool meeting = false;
            if (rKc != -1 && bKc != -1 && rKc == bKc)
                if (CountBetween(rKr, rKc, bKr, bKc) == 0) meeting = true;

            State[fr, fc] = oldFrom;
            State[tr, tc] = oldTo;
            return meeting;
        }
    }
}
