using System.Collections.Generic;

namespace MinClrCompiler;

public enum MinType
{
    Int,
    Bool,
    String,
    Void
}

public sealed record Param(string Name, MinType Type, int Line, int Column);

public sealed record FunctionDecl(
    string Name,
    List<Param> Params,
    MinType ReturnType,
    BlockStmt Body,
    int Line,
    int Column);

public sealed record ProgramNode(List<FunctionDecl> Functions);

public abstract record Stmt(int Line, int Column);
public sealed record BlockStmt(List<Stmt> Statements, int Line, int Column) : Stmt(Line, Column);
public sealed record LetStmt(string Name, MinType? DeclaredType, Expr Init, int Line, int Column) : Stmt(Line, Column);
public sealed record AssignStmt(string Name, Expr Value, int Line, int Column) : Stmt(Line, Column);
public sealed record IfStmt(Expr Condition, BlockStmt ThenBranch, BlockStmt? ElseBranch, int Line, int Column) : Stmt(Line, Column);
public sealed record WhileStmt(Expr Condition, BlockStmt Body, int Line, int Column) : Stmt(Line, Column);
public sealed record ReturnStmt(Expr? Value, int Line, int Column) : Stmt(Line, Column);
public sealed record ExprStmt(Expr Expression, int Line, int Column) : Stmt(Line, Column);

public abstract record Expr(int Line, int Column)
{
    public MinType ResolvedType { get; set; } = MinType.Void;
}

public sealed record IntLitExpr(int Value, int Line, int Column) : Expr(Line, Column);
public sealed record BoolLitExpr(bool Value, int Line, int Column) : Expr(Line, Column);
public sealed record StringLitExpr(string Value, int Line, int Column) : Expr(Line, Column);
public sealed record VarExpr(string Name, int Line, int Column) : Expr(Line, Column);
public sealed record UnaryExpr(string Op, Expr Operand, int Line, int Column) : Expr(Line, Column);
public sealed record BinaryExpr(string Op, Expr Left, Expr Right, int Line, int Column) : Expr(Line, Column);
public sealed record CallExpr(string Callee, List<Expr> Args, int Line, int Column) : Expr(Line, Column);
