using System;
using System.Collections.Generic;

namespace MinClrCompiler;

public sealed class ParseException : Exception
{
    public ParseException(string message, int line, int col)
        : base($"Parse error at {line}:{col}: {message}") { }
}

public sealed class Parser
{
    private readonly List<Token> _tokens;
    private int _pos;

    public Parser(List<Token> tokens)
    {
        _tokens = tokens;
    }

    private Token Peek(int offset = 0)
    {
        int idx = _pos + offset;
        return idx < _tokens.Count ? _tokens[idx] : _tokens[^1];
    }

    private Token Advance() => _tokens[_pos++];

    private bool Check(TokenKind kind) => Peek().Kind == kind;

    private bool Match(TokenKind kind)
    {
        if (!Check(kind)) return false;
        Advance();
        return true;
    }

    private Token Expect(TokenKind kind, string message)
    {
        if (Check(kind)) return Advance();
        var t = Peek();
        throw new ParseException($"{message} (got {t.Kind} '{t.Text}')", t.Line, t.Column);
    }

    public ProgramNode ParseProgram()
    {
        var funcs = new List<FunctionDecl>();
        while (!Check(TokenKind.Eof))
        {
            funcs.Add(ParseFunction());
        }
        return new ProgramNode(funcs);
    }

    private MinType ParseType()
    {
        var t = Advance();
        return t.Kind switch
        {
            TokenKind.IntKw => MinType.Int,
            TokenKind.BoolKw => MinType.Bool,
            TokenKind.StringKw => MinType.String,
            TokenKind.VoidKw => MinType.Void,
            _ => throw new ParseException($"Expected type, got '{t.Text}'", t.Line, t.Column)
        };
    }

    private FunctionDecl ParseFunction()
    {
        var fnTok = Expect(TokenKind.Fn, "Expected 'fn'");
        var nameTok = Expect(TokenKind.Ident, "Expected function name");
        Expect(TokenKind.LParen, "Expected '('");

        var parameters = new List<Param>();
        if (!Check(TokenKind.RParen))
        {
            do
            {
                var pName = Expect(TokenKind.Ident, "Expected parameter name");
                Expect(TokenKind.Colon, "Expected ':' after parameter name");
                var pType = ParseType();
                parameters.Add(new Param(pName.Text, pType, pName.Line, pName.Column));
            } while (Match(TokenKind.Comma));
        }
        Expect(TokenKind.RParen, "Expected ')'");

        MinType retType = MinType.Void;
        if (Match(TokenKind.Arrow))
        {
            retType = ParseType();
        }

        var body = ParseBlock();
        return new FunctionDecl(nameTok.Text, parameters, retType, body, fnTok.Line, fnTok.Column);
    }

    private BlockStmt ParseBlock()
    {
        var lb = Expect(TokenKind.LBrace, "Expected '{'");
        var stmts = new List<Stmt>();
        while (!Check(TokenKind.RBrace) && !Check(TokenKind.Eof))
        {
            stmts.Add(ParseStmt());
        }
        Expect(TokenKind.RBrace, "Expected '}'");
        return new BlockStmt(stmts, lb.Line, lb.Column);
    }

    private Stmt ParseStmt()
    {
        var t = Peek();
        if (Match(TokenKind.Let))
        {
            var name = Expect(TokenKind.Ident, "Expected variable name");
            MinType? declType = null;
            if (Match(TokenKind.Colon))
            {
                declType = ParseType();
            }
            Expect(TokenKind.Assign, "Expected '=' in let binding");
            var init = ParseExpr();
            Expect(TokenKind.Semicolon, "Expected ';'");
            return new LetStmt(name.Text, declType, init, t.Line, t.Column);
        }

        if (Match(TokenKind.If))
        {
            Expect(TokenKind.LParen, "Expected '(' after 'if'");
            var cond = ParseExpr();
            Expect(TokenKind.RParen, "Expected ')' after if condition");
            var thenBranch = ParseBlock();
            BlockStmt? elseBranch = null;
            if (Match(TokenKind.Else))
            {
                elseBranch = ParseBlock();
            }
            return new IfStmt(cond, thenBranch, elseBranch, t.Line, t.Column);
        }

        if (Match(TokenKind.While))
        {
            Expect(TokenKind.LParen, "Expected '(' after 'while'");
            var cond = ParseExpr();
            Expect(TokenKind.RParen, "Expected ')' after while condition");
            var body = ParseBlock();
            return new WhileStmt(cond, body, t.Line, t.Column);
        }

        if (Match(TokenKind.Return))
        {
            Expr? val = null;
            if (!Check(TokenKind.Semicolon))
            {
                val = ParseExpr();
            }
            Expect(TokenKind.Semicolon, "Expected ';'");
            return new ReturnStmt(val, t.Line, t.Column);
        }

        if (Check(TokenKind.Ident) && Peek(1).Kind == TokenKind.Assign)
        {
            var name = Advance();
            Advance(); // '='
            var val = ParseExpr();
            Expect(TokenKind.Semicolon, "Expected ';'");
            return new AssignStmt(name.Text, val, name.Line, name.Column);
        }

        var expr = ParseExpr();
        Expect(TokenKind.Semicolon, "Expected ';'");
        return new ExprStmt(expr, t.Line, t.Column);
    }

    private Expr ParseExpr() => ParseOr();

    private Expr ParseOr()
    {
        var expr = ParseAnd();
        while (Match(TokenKind.Or))
        {
            var op = _tokens[_pos - 1];
            expr = new BinaryExpr("||", expr, ParseAnd(), op.Line, op.Column);
        }
        return expr;
    }

    private Expr ParseAnd()
    {
        var expr = ParseEquality();
        while (Match(TokenKind.And))
        {
            var op = _tokens[_pos - 1];
            expr = new BinaryExpr("&&", expr, ParseEquality(), op.Line, op.Column);
        }
        return expr;
    }

    private Expr ParseEquality()
    {
        var expr = ParseComparison();
        while (Check(TokenKind.Eq) || Check(TokenKind.Neq))
        {
            var op = Advance();
            expr = new BinaryExpr(op.Text, expr, ParseComparison(), op.Line, op.Column);
        }
        return expr;
    }

    private Expr ParseComparison()
    {
        var expr = ParseTerm();
        while (Check(TokenKind.Lt) || Check(TokenKind.Le) || Check(TokenKind.Gt) || Check(TokenKind.Ge))
        {
            var op = Advance();
            expr = new BinaryExpr(op.Text, expr, ParseTerm(), op.Line, op.Column);
        }
        return expr;
    }

    private Expr ParseTerm()
    {
        var expr = ParseFactor();
        while (Check(TokenKind.Plus) || Check(TokenKind.Minus))
        {
            var op = Advance();
            expr = new BinaryExpr(op.Text, expr, ParseFactor(), op.Line, op.Column);
        }
        return expr;
    }

    private Expr ParseFactor()
    {
        var expr = ParseUnary();
        while (Check(TokenKind.Star) || Check(TokenKind.Slash) || Check(TokenKind.Percent))
        {
            var op = Advance();
            expr = new BinaryExpr(op.Text, expr, ParseUnary(), op.Line, op.Column);
        }
        return expr;
    }

    private Expr ParseUnary()
    {
        if (Check(TokenKind.Minus) || Check(TokenKind.Bang))
        {
            var op = Advance();
            return new UnaryExpr(op.Text, ParseUnary(), op.Line, op.Column);
        }
        return ParsePrimary();
    }

    private Expr ParsePrimary()
    {
        var t = Peek();
        if (Match(TokenKind.IntLit))
        {
            if (!int.TryParse(t.Text, out int val))
                throw new ParseException($"Invalid int literal '{t.Text}'", t.Line, t.Column);
            return new IntLitExpr(val, t.Line, t.Column);
        }
        if (Match(TokenKind.True)) return new BoolLitExpr(true, t.Line, t.Column);
        if (Match(TokenKind.False)) return new BoolLitExpr(false, t.Line, t.Column);
        if (Match(TokenKind.StringLit)) return new StringLitExpr(t.Text, t.Line, t.Column);

        if (Match(TokenKind.Ident))
        {
            if (Match(TokenKind.LParen))
            {
                var args = new List<Expr>();
                if (!Check(TokenKind.RParen))
                {
                    do
                    {
                        args.Add(ParseExpr());
                    } while (Match(TokenKind.Comma));
                }
                Expect(TokenKind.RParen, "Expected ')' after arguments");
                return new CallExpr(t.Text, args, t.Line, t.Column);
            }
            return new VarExpr(t.Text, t.Line, t.Column);
        }

        if (Match(TokenKind.LParen))
        {
            var inner = ParseExpr();
            Expect(TokenKind.RParen, "Expected ')'");
            return inner;
        }

        throw new ParseException($"Unexpected token '{t.Text}'", t.Line, t.Column);
    }
}
