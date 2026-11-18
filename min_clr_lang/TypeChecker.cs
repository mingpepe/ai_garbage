using System;
using System.Collections.Generic;

namespace MinClrCompiler;

public sealed class TypeCheckException : Exception
{
    public TypeCheckException(string message, int line, int col)
        : base($"Type error at {line}:{col}: {message}") { }
}

public sealed class TypeChecker
{
    private readonly Dictionary<string, FunctionDecl> _functions = new();
    private readonly Stack<Dictionary<string, MinType>> _scopes = new();
    private MinType _currentReturnType = MinType.Void;

    public void Check(ProgramNode program)
    {
        foreach (var fn in program.Functions)
        {
            if (fn.Name == "print")
                throw new TypeCheckException("Cannot redefine built-in function 'print'", fn.Line, fn.Column);
            if (!_functions.TryAdd(fn.Name, fn))
                throw new TypeCheckException($"Duplicate function '{fn.Name}'", fn.Line, fn.Column);
        }

        if (!_functions.TryGetValue("main", out var mainFn))
            throw new TypeCheckException("Program must define a 'main' function", 1, 1);

        if (mainFn.Params.Count != 0 || (mainFn.ReturnType != MinType.Void && mainFn.ReturnType != MinType.Int))
            throw new TypeCheckException("'main' must take 0 parameters and return 'void' or 'int'", mainFn.Line, mainFn.Column);

        foreach (var fn in program.Functions)
        {
            CheckFunction(fn);
        }
    }

    private void CheckFunction(FunctionDecl fn)
    {
        _currentReturnType = fn.ReturnType;
        _scopes.Clear();
        PushScope();

        foreach (var p in fn.Params)
        {
            if (p.Type == MinType.Void)
                throw new TypeCheckException($"Parameter '{p.Name}' cannot have type 'void'", p.Line, p.Column);
            if (!_scopes.Peek().TryAdd(p.Name, p.Type))
                throw new TypeCheckException($"Duplicate parameter '{p.Name}'", p.Line, p.Column);
        }

        CheckBlock(fn.Body, createScope: false);
        PopScope();
    }

    private void PushScope() => _scopes.Push(new Dictionary<string, MinType>());
    private void PopScope() => _scopes.Pop();

    private MinType? LookupVar(string name)
    {
        foreach (var scope in _scopes)
        {
            if (scope.TryGetValue(name, out var t))
                return t;
        }
        return null;
    }

    private void CheckBlock(BlockStmt block, bool createScope = true)
    {
        if (createScope) PushScope();
        foreach (var stmt in block.Statements)
        {
            CheckStmt(stmt);
        }
        if (createScope) PopScope();
    }

    private void CheckStmt(Stmt stmt)
    {
        switch (stmt)
        {
            case BlockStmt b:
                CheckBlock(b);
                break;

            case LetStmt l:
            {
                var initType = CheckExpr(l.Init);
                if (initType == MinType.Void)
                    throw new TypeCheckException($"Cannot initialize variable '{l.Name}' with 'void'", l.Line, l.Column);
                if (l.DeclaredType is MinType dt && dt != initType)
                    throw new TypeCheckException($"Cannot assign {initType} to variable '{l.Name}' of type {dt}", l.Line, l.Column);
                if (!_scopes.Peek().TryAdd(l.Name, l.DeclaredType ?? initType))
                    throw new TypeCheckException($"Variable '{l.Name}' already declared in this scope", l.Line, l.Column);
                break;
            }

            case AssignStmt a:
            {
                var existing = LookupVar(a.Name)
                    ?? throw new TypeCheckException($"Undeclared variable '{a.Name}'", a.Line, a.Column);
                var valType = CheckExpr(a.Value);
                if (existing != valType)
                    throw new TypeCheckException($"Cannot assign {valType} to '{a.Name}' of type {existing}", a.Line, a.Column);
                break;
            }

            case IfStmt i:
            {
                var condType = CheckExpr(i.Condition);
                if (condType != MinType.Bool)
                    throw new TypeCheckException($"'if' condition must be bool, got {condType}", i.Condition.Line, i.Condition.Column);
                CheckBlock(i.ThenBranch);
                if (i.ElseBranch is not null) CheckBlock(i.ElseBranch);
                break;
            }

            case WhileStmt w:
            {
                var condType = CheckExpr(w.Condition);
                if (condType != MinType.Bool)
                    throw new TypeCheckException($"'while' condition must be bool, got {condType}", w.Condition.Line, w.Condition.Column);
                CheckBlock(w.Body);
                break;
            }

            case ReturnStmt r:
            {
                if (_currentReturnType == MinType.Void)
                {
                    if (r.Value is not null)
                        throw new TypeCheckException("Void function cannot return a value", r.Line, r.Column);
                }
                else
                {
                    if (r.Value is null)
                        throw new TypeCheckException($"Expected return value of type {_currentReturnType}", r.Line, r.Column);
                    var valType = CheckExpr(r.Value);
                    if (valType != _currentReturnType)
                        throw new TypeCheckException($"Expected return type {_currentReturnType}, got {valType}", r.Line, r.Column);
                }
                break;
            }

            case ExprStmt e:
                CheckExpr(e.Expression);
                break;
        }
    }

    private MinType CheckExpr(Expr expr)
    {
        MinType t = expr switch
        {
            IntLitExpr => MinType.Int,
            BoolLitExpr => MinType.Bool,
            StringLitExpr => MinType.String,
            VarExpr v => LookupVar(v.Name)
                ?? throw new TypeCheckException($"Undeclared variable '{v.Name}'", v.Line, v.Column),
            UnaryExpr u => CheckUnary(u),
            BinaryExpr b => CheckBinary(b),
            CallExpr c => CheckCall(c),
            _ => throw new InvalidOperationException($"Unknown expr {expr.GetType().Name}")
        };
        expr.ResolvedType = t;
        return t;
    }

    private MinType CheckUnary(UnaryExpr u)
    {
        var t = CheckExpr(u.Operand);
        return u.Op switch
        {
            "-" when t == MinType.Int => MinType.Int,
            "!" when t == MinType.Bool => MinType.Bool,
            _ => throw new TypeCheckException($"Invalid unary operator '{u.Op}' for type {t}", u.Line, u.Column)
        };
    }

    private MinType CheckBinary(BinaryExpr b)
    {
        var lt = CheckExpr(b.Left);
        var rt = CheckExpr(b.Right);

        return b.Op switch
        {
            "+" when lt == MinType.Int && rt == MinType.Int => MinType.Int,
            "+" when lt == MinType.String && rt == MinType.String => MinType.String,
            "-" or "*" or "/" or "%" when lt == MinType.Int && rt == MinType.Int => MinType.Int,
            "<" or "<=" or ">" or ">=" when lt == MinType.Int && rt == MinType.Int => MinType.Bool,
            "==" or "!=" when lt == rt && lt != MinType.Void => MinType.Bool,
            "&&" or "||" when lt == MinType.Bool && rt == MinType.Bool => MinType.Bool,
            _ => throw new TypeCheckException($"Invalid binary operator '{b.Op}' for {lt} and {rt}", b.Line, b.Column)
        };
    }

    private MinType CheckCall(CallExpr c)
    {
        if (c.Callee == "print")
        {
            if (c.Args.Count != 1)
                throw new TypeCheckException($"'print' expects 1 argument, got {c.Args.Count}", c.Line, c.Column);
            var argType = CheckExpr(c.Args[0]);
            if (argType == MinType.Void)
                throw new TypeCheckException("Cannot print 'void'", c.Line, c.Column);
            return MinType.Void;
        }

        if (!_functions.TryGetValue(c.Callee, out var fn))
            throw new TypeCheckException($"Undeclared function '{c.Callee}'", c.Line, c.Column);

        if (c.Args.Count != fn.Params.Count)
            throw new TypeCheckException($"Function '{c.Callee}' expects {fn.Params.Count} arguments, got {c.Args.Count}", c.Line, c.Column);

        for (int i = 0; i < c.Args.Count; i++)
        {
            var argType = CheckExpr(c.Args[i]);
            if (argType != fn.Params[i].Type)
                throw new TypeCheckException($"Argument {i + 1} of '{c.Callee}' expects {fn.Params[i].Type}, got {argType}", c.Args[i].Line, c.Args[i].Column);
        }

        return fn.ReturnType;
    }
}
