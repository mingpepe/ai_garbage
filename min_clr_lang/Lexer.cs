using System;
using System.Collections.Generic;
using System.Text;

namespace MinClrCompiler;

public enum TokenKind
{
    Eof,
    Ident,
    IntLit,
    StringLit,
    // Keywords
    Fn,
    Let,
    If,
    Else,
    While,
    Return,
    True,
    False,
    IntKw,
    BoolKw,
    StringKw,
    VoidKw,
    // Punctuation
    LParen,
    RParen,
    LBrace,
    RBrace,
    Comma,
    Colon,
    Semicolon,
    Arrow, // ->
    // Operators
    Assign, // =
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Eq,  // ==
    Neq, // !=
    Lt,  // <
    Le,  // <=
    Gt,  // >
    Ge,  // >=
    And, // &&
    Or,  // ||
    Bang // !
}

public sealed record Token(TokenKind Kind, string Text, int Line, int Column);

public sealed class LexerException : Exception
{
    public LexerException(string message, int line, int col)
        : base($"Lexer error at {line}:{col}: {message}") { }
}

public sealed class Lexer
{
    private readonly string _src;
    private int _pos;
    private int _line = 1;
    private int _col = 1;

    private static readonly Dictionary<string, TokenKind> Keywords = new()
    {
        ["fn"] = TokenKind.Fn,
        ["let"] = TokenKind.Let,
        ["if"] = TokenKind.If,
        ["else"] = TokenKind.Else,
        ["while"] = TokenKind.While,
        ["return"] = TokenKind.Return,
        ["true"] = TokenKind.True,
        ["false"] = TokenKind.False,
        ["int"] = TokenKind.IntKw,
        ["bool"] = TokenKind.BoolKw,
        ["string"] = TokenKind.StringKw,
        ["void"] = TokenKind.VoidKw,
    };

    public Lexer(string src)
    {
        _src = src;
    }

    private char Peek(int offset = 0)
    {
        int idx = _pos + offset;
        return idx < _src.Length ? _src[idx] : '\0';
    }

    private char Advance()
    {
        char c = _src[_pos++];
        if (c == '\n')
        {
            _line++;
            _col = 1;
        }
        else
        {
            _col++;
        }
        return c;
    }

    public List<Token> Tokenize()
    {
        var tokens = new List<Token>();
        while (_pos < _src.Length)
        {
            char c = Peek();
            if (char.IsWhiteSpace(c))
            {
                Advance();
                continue;
            }
            if (c == '/' && Peek(1) == '/')
            {
                while (_pos < _src.Length && Peek() != '\n') Advance();
                continue;
            }
            if (c == '/' && Peek(1) == '*')
            {
                Advance(); Advance();
                while (_pos < _src.Length && !(Peek() == '*' && Peek(1) == '/')) Advance();
                if (_pos >= _src.Length) throw new LexerException("Unterminated block comment", _line, _col);
                Advance(); Advance();
                continue;
            }

            int line = _line, col = _col;

            if (char.IsDigit(c))
            {
                var sb = new StringBuilder();
                while (char.IsDigit(Peek())) sb.Append(Advance());
                tokens.Add(new Token(TokenKind.IntLit, sb.ToString(), line, col));
                continue;
            }

            if (char.IsLetter(c) || c == '_')
            {
                var sb = new StringBuilder();
                while (char.IsLetterOrDigit(Peek()) || Peek() == '_') sb.Append(Advance());
                string word = sb.ToString();
                var kind = Keywords.TryGetValue(word, out var kw) ? kw : TokenKind.Ident;
                tokens.Add(new Token(kind, word, line, col));
                continue;
            }

            if (c == '"')
            {
                Advance();
                var sb = new StringBuilder();
                while (_pos < _src.Length && Peek() != '"')
                {
                    char sc = Advance();
                    if (sc == '\\')
                    {
                        if (_pos >= _src.Length) throw new LexerException("Unterminated escape", _line, _col);
                        char esc = Advance();
                        sb.Append(esc switch
                        {
                            'n' => '\n',
                            'r' => '\r',
                            't' => '\t',
                            '\\' => '\\',
                            '"' => '"',
                            _ => throw new LexerException($"Unknown escape \\{esc}", _line, _col)
                        });
                    }
                    else
                    {
                        sb.Append(sc);
                    }
                }
                if (_pos >= _src.Length) throw new LexerException("Unterminated string literal", line, col);
                Advance();
                tokens.Add(new Token(TokenKind.StringLit, sb.ToString(), line, col));
                continue;
            }

            // Two-char operators
            if (c == '-' && Peek(1) == '>') { Advance(); Advance(); tokens.Add(new Token(TokenKind.Arrow, "->", line, col)); continue; }
            if (c == '=' && Peek(1) == '=') { Advance(); Advance(); tokens.Add(new Token(TokenKind.Eq, "==", line, col)); continue; }
            if (c == '!' && Peek(1) == '=') { Advance(); Advance(); tokens.Add(new Token(TokenKind.Neq, "!=", line, col)); continue; }
            if (c == '<' && Peek(1) == '=') { Advance(); Advance(); tokens.Add(new Token(TokenKind.Le, "<=", line, col)); continue; }
            if (c == '>' && Peek(1) == '=') { Advance(); Advance(); tokens.Add(new Token(TokenKind.Ge, ">=", line, col)); continue; }
            if (c == '&' && Peek(1) == '&') { Advance(); Advance(); tokens.Add(new Token(TokenKind.And, "&&", line, col)); continue; }
            if (c == '|' && Peek(1) == '|') { Advance(); Advance(); tokens.Add(new Token(TokenKind.Or, "||", line, col)); continue; }

            // Single-char tokens
            Advance();
            TokenKind single = c switch
            {
                '(' => TokenKind.LParen,
                ')' => TokenKind.RParen,
                '{' => TokenKind.LBrace,
                '}' => TokenKind.RBrace,
                ',' => TokenKind.Comma,
                ':' => TokenKind.Colon,
                ';' => TokenKind.Semicolon,
                '=' => TokenKind.Assign,
                '+' => TokenKind.Plus,
                '-' => TokenKind.Minus,
                '*' => TokenKind.Star,
                '/' => TokenKind.Slash,
                '%' => TokenKind.Percent,
                '<' => TokenKind.Lt,
                '>' => TokenKind.Gt,
                '!' => TokenKind.Bang,
                _ => throw new LexerException($"Unexpected character '{c}'", line, col)
            };
            tokens.Add(new Token(single, c.ToString(), line, col));
        }

        tokens.Add(new Token(TokenKind.Eof, "", _line, _col));
        return tokens;
    }
}
