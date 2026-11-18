using System;
using System.IO;

namespace MinClrCompiler;

public static class Program
{
    public static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("Usage: MinClrCompiler <source.ml> [-o <out_dir>]");
            return 1;
        }

        string inputPath = args[0];
        if (!File.Exists(inputPath))
        {
            Console.Error.WriteLine($"File not found: {inputPath}");
            return 1;
        }

        string outDir = Path.GetDirectoryName(Path.GetFullPath(inputPath)) ?? ".";
        for (int i = 1; i < args.Length - 1; i++)
        {
            if (args[i] == "-o")
                outDir = args[i + 1];
        }

        Directory.CreateDirectory(outDir);
        string baseName = Path.GetFileNameWithoutExtension(inputPath);
        string dllPath = Path.Combine(outDir, baseName + ".dll");
        string ilPath = Path.Combine(outDir, baseName + ".il");

        try
        {
            string source = File.ReadAllText(inputPath);
            var tokens = new Lexer(source).Tokenize();
            var ast = new Parser(tokens).ParseProgram();
            new TypeChecker().Check(ast);
            new MsilEmitter().Emit(ast, baseName, dllPath, ilPath);

            Console.WriteLine($"Compiled: {dllPath}");
            Console.WriteLine($"MSIL:     {ilPath}");
            return 0;
        }
        catch (Exception ex) when (ex is LexerException or ParseException or TypeCheckException)
        {
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
    }
}
