using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;
using System.Text;

namespace MinClrCompiler;

public sealed class MsilEmitter
{
    private readonly Dictionary<string, MethodBuilder> _methods = new();
    private readonly Dictionary<string, FunctionDecl> _funcDecls = new();
    private readonly StringBuilder _ilText = new();

    private static Type ToClrType(MinType t) => t switch
    {
        MinType.Int => typeof(int),
        MinType.Bool => typeof(bool),
        MinType.String => typeof(string),
        MinType.Void => typeof(void),
        _ => throw new InvalidOperationException()
    };

    private static string ToIlType(MinType t) => t switch
    {
        MinType.Int => "int32",
        MinType.Bool => "bool",
        MinType.String => "string",
        MinType.Void => "void",
        _ => throw new InvalidOperationException()
    };

    public string Emit(ProgramNode program, string assemblyName, string outputDllPath, string outputIlPath)
    {
        var ab = new PersistedAssemblyBuilder(new AssemblyName(assemblyName), typeof(object).Assembly);
        var mb = ab.DefineDynamicModule(assemblyName);
        var tb = mb.DefineType("Program", TypeAttributes.Public | TypeAttributes.Abstract | TypeAttributes.Sealed);

        _ilText.Clear();
        _ilText.AppendLine($".assembly extern System.Runtime {{}}");
        _ilText.AppendLine($".assembly extern System.Console {{}}");
        _ilText.AppendLine($".assembly {assemblyName} {{}}");
        _ilText.AppendLine();
        _ilText.AppendLine(".class public abstract auto ansi sealed beforefieldinit Program extends [System.Runtime]System.Object");
        _ilText.AppendLine("{");

        foreach (var fn in program.Functions)
        {
            _funcDecls[fn.Name] = fn;
            var paramTypes = new Type[fn.Params.Count];
            for (int i = 0; i < fn.Params.Count; i++)
                paramTypes[i] = ToClrType(fn.Params[i].Type);

            string clrName = fn.Name == "main" ? "Main" : fn.Name;
            var method = tb.DefineMethod(
                clrName,
                MethodAttributes.Public | MethodAttributes.Static,
                ToClrType(fn.ReturnType),
                paramTypes);

            for (int i = 0; i < fn.Params.Count; i++)
                method.DefineParameter(i + 1, ParameterAttributes.None, fn.Params[i].Name);

            _methods[fn.Name] = method;
        }

        foreach (var fn in program.Functions)
        {
            EmitFunction(fn, _methods[fn.Name]);
        }

        _ilText.AppendLine("}");

        tb.CreateType();

        var entryMethod = _methods["main"];
        var metadataBuilder = ab.GenerateMetadata(out BlobBuilder ilStream, out BlobBuilder mappedFieldData);
        var entryPointHandle = MetadataTokens.MethodDefinitionHandle(entryMethod.MetadataToken);

        var peBuilder = new ManagedPEBuilder(
            header: PEHeaderBuilder.CreateExecutableHeader(),
            metadataRootBuilder: new MetadataRootBuilder(metadataBuilder),
            ilStream: ilStream,
            mappedFieldData: mappedFieldData,
            entryPoint: entryPointHandle);

        var peBlob = new BlobBuilder();
        peBuilder.Serialize(peBlob);

        using (var fs = new FileStream(outputDllPath, FileMode.Create, FileAccess.Write))
        {
            peBlob.WriteContentTo(fs);
        }

        File.WriteAllText(outputIlPath, _ilText.ToString());

        string runtimeConfigPath = Path.ChangeExtension(outputDllPath, ".runtimeconfig.json");
        string tfm = $"net{Environment.Version.Major}.{Environment.Version.Minor}";
        string fwVer = $"{Environment.Version.Major}.{Environment.Version.Minor}.0";
        File.WriteAllText(runtimeConfigPath, $$"""
        {
          "runtimeOptions": {
            "tfm": "{{tfm}}",
            "framework": {
              "name": "Microsoft.NETCore.App",
              "version": "{{fwVer}}"
            }
          }
        }
        """);

        return _ilText.ToString();
    }

    private sealed class FunctionEmitCtx
    {
        public readonly ILGenerator Il;
        public readonly StringBuilder Text;
        public readonly Dictionary<string, int> Params = new();
        public readonly Stack<Dictionary<string, LocalBuilder>> Locals = new();
        public int LabelCounter;

        public FunctionEmitCtx(ILGenerator il, StringBuilder text)
        {
            Il = il;
            Text = text;
        }

        public string NewLabelName(string prefix) => $"{prefix}_{LabelCounter++}";

        public LocalBuilder? LookupLocal(string name)
        {
            foreach (var scope in Locals)
            {
                if (scope.TryGetValue(name, out var loc))
                    return loc;
            }
            return null;
        }
    }

    private void EmitFunction(FunctionDecl fn, MethodBuilder method)
    {
        string clrName = fn.Name == "main" ? "Main" : fn.Name;
        var paramList = new List<string>();
        foreach (var p in fn.Params)
            paramList.Add($"{ToIlType(p.Type)} {p.Name}");

        _ilText.AppendLine($"  .method public hidebysig static {ToIlType(fn.ReturnType)} {clrName}({string.Join(", ", paramList)}) cil managed");
        _ilText.AppendLine("  {");
        if (fn.Name == "main")
            _ilText.AppendLine("    .entrypoint");

        var ctx = new FunctionEmitCtx(method.GetILGenerator(), _ilText);
        for (int i = 0; i < fn.Params.Count; i++)
            ctx.Params[fn.Params[i].Name] = i;

        ctx.Locals.Push(new Dictionary<string, LocalBuilder>());
        EmitBlock(ctx, fn.Body, createScope: false);
        ctx.Locals.Pop();

        if (fn.ReturnType == MinType.Void)
        {
            ctx.Il.Emit(OpCodes.Ret);
            _ilText.AppendLine("    ret");
        }
        else
        {
            // Fallback return for non-void if control reaches end
            ctx.Il.Emit(OpCodes.Ldc_I4_0);
            ctx.Il.Emit(OpCodes.Ret);
            _ilText.AppendLine("    ldc.i4.0");
            _ilText.AppendLine("    ret");
        }

        _ilText.AppendLine("  }");
        _ilText.AppendLine();
    }

    private void EmitBlock(FunctionEmitCtx ctx, BlockStmt block, bool createScope = true)
    {
        if (createScope) ctx.Locals.Push(new Dictionary<string, LocalBuilder>());
        foreach (var stmt in block.Statements)
            EmitStmt(ctx, stmt);
        if (createScope) ctx.Locals.Pop();
    }

    private void EmitStmt(FunctionEmitCtx ctx, Stmt stmt)
    {
        switch (stmt)
        {
            case BlockStmt b:
                EmitBlock(ctx, b);
                break;

            case LetStmt l:
            {
                EmitExpr(ctx, l.Init);
                var loc = ctx.Il.DeclareLocal(ToClrType(l.Init.ResolvedType));
                ctx.Locals.Peek()[l.Name] = loc;
                ctx.Il.Emit(OpCodes.Stloc, loc);
                ctx.Text.AppendLine($"    stloc.{loc.LocalIndex} // {l.Name}");
                break;
            }

            case AssignStmt a:
            {
                EmitExpr(ctx, a.Value);
                var loc = ctx.LookupLocal(a.Name);
                if (loc is not null)
                {
                    ctx.Il.Emit(OpCodes.Stloc, loc);
                    ctx.Text.AppendLine($"    stloc.{loc.LocalIndex} // {a.Name}");
                }
                else
                {
                    int argIdx = ctx.Params[a.Name];
                    ctx.Il.Emit(OpCodes.Starg, argIdx);
                    ctx.Text.AppendLine($"    starg.s {argIdx} // {a.Name}");
                }
                break;
            }

            case IfStmt i:
            {
                var elseLabel = ctx.Il.DefineLabel();
                var endLabel = ctx.Il.DefineLabel();
                string elseName = ctx.NewLabelName("ELSE");
                string endName = ctx.NewLabelName("ENDIF");

                EmitExpr(ctx, i.Condition);
                ctx.Il.Emit(OpCodes.Brfalse, i.ElseBranch is not null ? elseLabel : endLabel);
                ctx.Text.AppendLine($"    brfalse {(i.ElseBranch is not null ? elseName : endName)}");

                EmitBlock(ctx, i.ThenBranch);

                if (i.ElseBranch is not null)
                {
                    ctx.Il.Emit(OpCodes.Br, endLabel);
                    ctx.Text.AppendLine($"    br {endName}");
                    ctx.Il.MarkLabel(elseLabel);
                    ctx.Text.AppendLine($"  {elseName}:");
                    EmitBlock(ctx, i.ElseBranch);
                }

                ctx.Il.MarkLabel(endLabel);
                ctx.Text.AppendLine($"  {endName}:");
                break;
            }

            case WhileStmt w:
            {
                var condLabel = ctx.Il.DefineLabel();
                var endLabel = ctx.Il.DefineLabel();
                string condName = ctx.NewLabelName("WHILE_COND");
                string endName = ctx.NewLabelName("WHILE_END");

                ctx.Il.MarkLabel(condLabel);
                ctx.Text.AppendLine($"  {condName}:");
                EmitExpr(ctx, w.Condition);
                ctx.Il.Emit(OpCodes.Brfalse, endLabel);
                ctx.Text.AppendLine($"    brfalse {endName}");

                EmitBlock(ctx, w.Body);
                ctx.Il.Emit(OpCodes.Br, condLabel);
                ctx.Text.AppendLine($"    br {condName}");

                ctx.Il.MarkLabel(endLabel);
                ctx.Text.AppendLine($"  {endName}:");
                break;
            }

            case ReturnStmt r:
            {
                if (r.Value is not null)
                    EmitExpr(ctx, r.Value);
                ctx.Il.Emit(OpCodes.Ret);
                ctx.Text.AppendLine("    ret");
                break;
            }

            case ExprStmt e:
            {
                EmitExpr(ctx, e.Expression);
                if (e.Expression.ResolvedType != MinType.Void)
                {
                    ctx.Il.Emit(OpCodes.Pop);
                    ctx.Text.AppendLine("    pop");
                }
                break;
            }
        }
    }

    private void EmitExpr(FunctionEmitCtx ctx, Expr expr)
    {
        switch (expr)
        {
            case IntLitExpr i:
                ctx.Il.Emit(OpCodes.Ldc_I4, i.Value);
                ctx.Text.AppendLine($"    ldc.i4 {i.Value}");
                break;

            case BoolLitExpr b:
                ctx.Il.Emit(b.Value ? OpCodes.Ldc_I4_1 : OpCodes.Ldc_I4_0);
                ctx.Text.AppendLine(b.Value ? "    ldc.i4.1" : "    ldc.i4.0");
                break;

            case StringLitExpr s:
                ctx.Il.Emit(OpCodes.Ldstr, s.Value);
                ctx.Text.AppendLine($"    ldstr \"{s.Value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n")}\"");
                break;

            case VarExpr v:
            {
                var loc = ctx.LookupLocal(v.Name);
                if (loc is not null)
                {
                    ctx.Il.Emit(OpCodes.Ldloc, loc);
                    ctx.Text.AppendLine($"    ldloc.{loc.LocalIndex} // {v.Name}");
                }
                else
                {
                    int argIdx = ctx.Params[v.Name];
                    ctx.Il.Emit(OpCodes.Ldarg, argIdx);
                    ctx.Text.AppendLine($"    ldarg.s {argIdx} // {v.Name}");
                }
                break;
            }

            case UnaryExpr u:
            {
                EmitExpr(ctx, u.Operand);
                if (u.Op == "-")
                {
                    ctx.Il.Emit(OpCodes.Neg);
                    ctx.Text.AppendLine("    neg");
                }
                else if (u.Op == "!")
                {
                    ctx.Il.Emit(OpCodes.Ldc_I4_0);
                    ctx.Il.Emit(OpCodes.Ceq);
                    ctx.Text.AppendLine("    ldc.i4.0");
                    ctx.Text.AppendLine("    ceq");
                }
                break;
            }

            case BinaryExpr b:
                EmitBinary(ctx, b);
                break;

            case CallExpr c:
                EmitCall(ctx, c);
                break;
        }
    }

    private void EmitBinary(FunctionEmitCtx ctx, BinaryExpr b)
    {
        if (b.Op == "&&")
        {
            var falseLabel = ctx.Il.DefineLabel();
            var endLabel = ctx.Il.DefineLabel();
            string falseName = ctx.NewLabelName("AND_FALSE");
            string endName = ctx.NewLabelName("AND_END");

            EmitExpr(ctx, b.Left);
            ctx.Il.Emit(OpCodes.Brfalse, falseLabel);
            ctx.Text.AppendLine($"    brfalse {falseName}");
            EmitExpr(ctx, b.Right);
            ctx.Il.Emit(OpCodes.Br, endLabel);
            ctx.Text.AppendLine($"    br {endName}");
            ctx.Il.MarkLabel(falseLabel);
            ctx.Text.AppendLine($"  {falseName}:");
            ctx.Il.Emit(OpCodes.Ldc_I4_0);
            ctx.Text.AppendLine("    ldc.i4.0");
            ctx.Il.MarkLabel(endLabel);
            ctx.Text.AppendLine($"  {endName}:");
            return;
        }

        if (b.Op == "||")
        {
            var trueLabel = ctx.Il.DefineLabel();
            var endLabel = ctx.Il.DefineLabel();
            string trueName = ctx.NewLabelName("OR_TRUE");
            string endName = ctx.NewLabelName("OR_END");

            EmitExpr(ctx, b.Left);
            ctx.Il.Emit(OpCodes.Brtrue, trueLabel);
            ctx.Text.AppendLine($"    brtrue {trueName}");
            EmitExpr(ctx, b.Right);
            ctx.Il.Emit(OpCodes.Br, endLabel);
            ctx.Text.AppendLine($"    br {endName}");
            ctx.Il.MarkLabel(trueLabel);
            ctx.Text.AppendLine($"  {trueName}:");
            ctx.Il.Emit(OpCodes.Ldc_I4_1);
            ctx.Text.AppendLine("    ldc.i4.1");
            ctx.Il.MarkLabel(endLabel);
            ctx.Text.AppendLine($"  {endName}:");
            return;
        }

        EmitExpr(ctx, b.Left);
        EmitExpr(ctx, b.Right);

        if (b.Op == "+" && b.Left.ResolvedType == MinType.String)
        {
            var concat = typeof(string).GetMethod("Concat", [typeof(string), typeof(string)])!;
            ctx.Il.Emit(OpCodes.Call, concat);
            ctx.Text.AppendLine("    call string [System.Runtime]System.String::Concat(string, string)");
            return;
        }

        switch (b.Op)
        {
            case "+": ctx.Il.Emit(OpCodes.Add); ctx.Text.AppendLine("    add"); break;
            case "-": ctx.Il.Emit(OpCodes.Sub); ctx.Text.AppendLine("    sub"); break;
            case "*": ctx.Il.Emit(OpCodes.Mul); ctx.Text.AppendLine("    mul"); break;
            case "/": ctx.Il.Emit(OpCodes.Div); ctx.Text.AppendLine("    div"); break;
            case "%": ctx.Il.Emit(OpCodes.Rem); ctx.Text.AppendLine("    rem"); break;
            case "<": ctx.Il.Emit(OpCodes.Clt); ctx.Text.AppendLine("    clt"); break;
            case ">": ctx.Il.Emit(OpCodes.Cgt); ctx.Text.AppendLine("    cgt"); break;
            case "==":
                if (b.Left.ResolvedType == MinType.String)
                {
                    var eq = typeof(string).GetMethod("op_Equality", [typeof(string), typeof(string)])!;
                    ctx.Il.Emit(OpCodes.Call, eq);
                    ctx.Text.AppendLine("    call bool [System.Runtime]System.String::op_Equality(string, string)");
                }
                else
                {
                    ctx.Il.Emit(OpCodes.Ceq);
                    ctx.Text.AppendLine("    ceq");
                }
                break;
            case "!=":
                if (b.Left.ResolvedType == MinType.String)
                {
                    var neq = typeof(string).GetMethod("op_Inequality", [typeof(string), typeof(string)])!;
                    ctx.Il.Emit(OpCodes.Call, neq);
                    ctx.Text.AppendLine("    call bool [System.Runtime]System.String::op_Inequality(string, string)");
                }
                else
                {
                    ctx.Il.Emit(OpCodes.Ceq);
                    ctx.Il.Emit(OpCodes.Ldc_I4_0);
                    ctx.Il.Emit(OpCodes.Ceq);
                    ctx.Text.AppendLine("    ceq");
                    ctx.Text.AppendLine("    ldc.i4.0");
                    ctx.Text.AppendLine("    ceq");
                }
                break;
            case "<=":
                ctx.Il.Emit(OpCodes.Cgt);
                ctx.Il.Emit(OpCodes.Ldc_I4_0);
                ctx.Il.Emit(OpCodes.Ceq);
                ctx.Text.AppendLine("    cgt");
                ctx.Text.AppendLine("    ldc.i4.0");
                ctx.Text.AppendLine("    ceq");
                break;
            case ">=":
                ctx.Il.Emit(OpCodes.Clt);
                ctx.Il.Emit(OpCodes.Ldc_I4_0);
                ctx.Il.Emit(OpCodes.Ceq);
                ctx.Text.AppendLine("    clt");
                ctx.Text.AppendLine("    ldc.i4.0");
                ctx.Text.AppendLine("    ceq");
                break;
        }
    }

    private void EmitCall(FunctionEmitCtx ctx, CallExpr c)
    {
        foreach (var arg in c.Args)
            EmitExpr(ctx, arg);

        if (c.Callee == "print")
        {
            var argType = ToClrType(c.Args[0].ResolvedType);
            var writeLine = typeof(Console).GetMethod("WriteLine", [argType])!;
            ctx.Il.Emit(OpCodes.Call, writeLine);
            ctx.Text.AppendLine($"    call void [System.Console]System.Console::WriteLine({ToIlType(c.Args[0].ResolvedType)})");
            return;
        }

        var target = _methods[c.Callee];
        ctx.Il.Emit(OpCodes.Call, target);
        var decl = _funcDecls[c.Callee];
        var sig = string.Join(", ", decl.Params.ConvertAll(p => ToIlType(p.Type)));
        ctx.Text.AppendLine($"    call {ToIlType(decl.ReturnType)} Program::{c.Callee}({sig})");
    }
}
