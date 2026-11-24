using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace WasmIde.Services;

public sealed record DwarfLineEntry(
    int CodeOffset,
    int FileOffset,
    int Line,
    int Column,
    int FileIndex,
    bool IsStmt,
    bool IsPrologueEnd,
    bool IsEndSequence
);

public sealed record DwarfVariableInfo(
    string Name,
    string TypeName,
    int ByteSize,
    bool IsSigned,
    bool IsFloat,
    int DeclLine,
    int? FbregOffset,
    int? WasmLocalIndex,
    uint? GlobalDataAddress
);

public sealed record DwarfSubprogramInfo(
    string Name,
    int LowFileOffset,
    int HighFileOffset,
    int? FrameBaseLocalIndex,
    List<DwarfVariableInfo> Variables
);

public sealed record CompilationResult(
    bool Success,
    string? Error,
    string CompilerOutput,
    byte[]? WasmBytes,
    ParsedWasmBinary? ParsedWasm,
    List<DwarfLineEntry> LineEntries,
    List<DwarfSubprogramInfo> Subprograms,
    string SuggestedEntryFunction
);

public sealed class WasmCompilerService
{
    private const string ClangPath = @"C:\Users\pepe\AppData\Local\Android\Sdk\ndk\28.2.13676358\toolchains\llvm\prebuilt\windows-x86_64\bin\clang.exe";
    private const string DwarfdumpPath = @"C:\Users\pepe\AppData\Local\Android\Sdk\ndk\28.2.13676358\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-dwarfdump.exe";

    private readonly WasmBinaryInspector _inspector;

    public const string HalHeaderContent = """
        #ifndef WASM_HAL_H
        #define WASM_HAL_H

        typedef unsigned char byte;
        typedef unsigned char uint8_t;
        typedef signed char int8_t;
        typedef unsigned short uint16_t;
        typedef short int16_t;
        typedef unsigned int uint32_t;
        typedef int int32_t;
        typedef unsigned long long uint64_t;
        typedef long long int64_t;

        __attribute__((import_module("env"), import_name("ReadRegister")))
        extern byte ReadRegister(byte address);

        __attribute__((import_module("env"), import_name("WriteRegister")))
        extern void WriteRegister(byte address, byte data);

        __attribute__((import_module("env"), import_name("print_i32")))
        extern void print_i32(int val);

        __attribute__((import_module("env"), import_name("print_hex")))
        extern void print_hex(int val);

        __attribute__((import_module("env"), import_name("putc")))
        extern void putc(int ch);

        __attribute__((import_module("env"), import_name("print_str")))
        extern void print_str(const char* ptr, unsigned int len);

        __attribute__((import_module("env"), import_name("puts")))
        extern int puts(const char* s);

        #endif
        """;

    public WasmCompilerService(WasmBinaryInspector inspector)
    {
        _inspector = inspector;
    }

    public async Task<CompilationResult> CompileCAsync(string cSource, string optLevel = "O0", CancellationToken ct = default)
    {
        string safeOpt = optLevel switch
        {
            "O0" => "-O0",
            "O1" => "-O1",
            "O2" => "-O2",
            _ => "-O0"
        };

        string tempDir = Path.Combine(Path.GetTempPath(), "wasm_ide_" + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(tempDir);

        try
        {
            string halPath = Path.Combine(tempDir, "wasm_hal.h");
            string cPath = Path.Combine(tempDir, "user_prog.c");
            string wasmPath = Path.Combine(tempDir, "user_prog.wasm");

            await File.WriteAllTextAsync(halPath, HalHeaderContent, new UTF8Encoding(false), ct);
            await File.WriteAllTextAsync(cPath, cSource, new UTF8Encoding(false), ct);

            var clangArgs = new[]
            {
                "--target=wasm32",
                "-g",
                safeOpt,
                "-nostdlib",
                "-include", halPath,
                "-Wl,--no-entry",
                "-Wl,--export-all",
                "-Wl,--allow-undefined",
                "-o", wasmPath,
                cPath
            };

            var (clangExit, clangOut, clangErr) = await RunProcessAsync(ClangPath, clangArgs, tempDir, ct);
            string combinedOut = string.Join("\n", new[] { clangOut, clangErr }.Where(s => !string.IsNullOrWhiteSpace(s)));

            if (clangExit != 0 || !File.Exists(wasmPath))
            {
                return new CompilationResult(
                    false,
                    string.IsNullOrWhiteSpace(combinedOut) ? $"clang exited with code {clangExit}" : combinedOut,
                    combinedOut,
                    null, null, new(), new(), "main"
                );
            }

            byte[] wasmBytes = await File.ReadAllBytesAsync(wasmPath, ct);
            var parsed = _inspector.Inspect(wasmBytes);

            var (_, dwarfOut, dwarfErr) = await RunProcessAsync(
                DwarfdumpPath,
                new[] { "--debug-line", "--debug-info", wasmPath },
                tempDir,
                ct
            );

            var lineEntries = ParseDebugLine(dwarfOut, parsed.CodeSectionPayloadOffset);
            var subprograms = ParseDebugInfo(dwarfOut, parsed.CodeSectionPayloadOffset);

            var enrichedInstrs = AttachLineInfoToDisassembly(parsed.Instructions, lineEntries);
            parsed = parsed with { Instructions = enrichedInstrs };

            string entryFn = "main";
            if (parsed.Functions.Any(f => f.Name == "__original_main"))
                entryFn = "__original_main";
            else if (parsed.Functions.Any(f => f.Name == "main"))
                entryFn = "main";
            else if (parsed.Functions.FirstOrDefault(f => !f.IsImport) is { } firstDef)
                entryFn = firstDef.Name;

            return new CompilationResult(
                true,
                null,
                string.IsNullOrWhiteSpace(combinedOut) ? $"Compiled {wasmBytes.Length} bytes ({safeOpt} -g)" : combinedOut,
                wasmBytes,
                parsed,
                lineEntries,
                subprograms,
                entryFn
            );
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    private static List<WasmDisasmInstruction> AttachLineInfoToDisassembly(
        List<WasmDisasmInstruction> instrs,
        List<DwarfLineEntry> lineEntries)
    {
        if (lineEntries.Count == 0) return instrs;

        // Find the active line entry per file offset within [entry.FileOffset, nextEntry.FileOffset)
        var sorted = lineEntries.OrderBy(e => e.FileOffset).ToList();
        var result = new List<WasmDisasmInstruction>(instrs.Count);

        foreach (var instr in instrs)
        {
            DwarfLineEntry? match = null;
            for (int i = sorted.Count - 1; i >= 0; i--)
            {
                if (sorted[i].FileOffset <= instr.FileOffset)
                {
                    if (!sorted[i].IsEndSequence && sorted[i].Line > 0)
                        match = sorted[i];
                    break;
                }
            }

            if (match != null)
            {
                result.Add(instr with
                {
                    CLine = match.Line,
                    CColumn = match.Column,
                    IsPrologueEnd = match.IsPrologueEnd && instr.FileOffset == match.FileOffset
                });
            }
            else
            {
                result.Add(instr);
            }
        }

        return result;
    }

    private static List<DwarfLineEntry> ParseDebugLine(string dwarfText, int codePayloadOffset)
    {
        var list = new List<DwarfLineEntry>();
        var userFileIndices = new HashSet<int>();

        // Capture file_names table entries matching user_prog.c
        var lines = dwarfText.Split('\n');
        int currentFileNum = -1;
        bool inLineTable = false;

        var fileIdxRegex = new Regex(@"file_names\[\s*(\d+)\]:", RegexOptions.Compiled);
        var rowRegex = new Regex(
            @"^0x([0-9a-fA-F]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s*(.*)$",
            RegexOptions.Compiled);

        foreach (var raw in lines)
        {
            string line = raw.TrimEnd('\r');
            var fm = fileIdxRegex.Match(line);
            if (fm.Success)
            {
                currentFileNum = int.Parse(fm.Groups[1].Value, CultureInfo.InvariantCulture);
                continue;
            }
            if (currentFileNum >= 0 && line.Contains("name:") && line.Contains("user_prog.c", StringComparison.OrdinalIgnoreCase))
            {
                userFileIndices.Add(currentFileNum);
                currentFileNum = -1;
                continue;
            }
            if (line.StartsWith("Address") && line.Contains("Line") && line.Contains("Column"))
            {
                inLineTable = true;
                continue;
            }
            if (inLineTable)
            {
                if (string.IsNullOrWhiteSpace(line) || line.StartsWith("debug_line["))
                {
                    if (line.StartsWith("debug_line[")) inLineTable = false;
                    continue;
                }
                var rm = rowRegex.Match(line.Trim());
                if (rm.Success)
                {
                    int addr = int.Parse(rm.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                    int srcLine = int.Parse(rm.Groups[2].Value, CultureInfo.InvariantCulture);
                    int srcCol = int.Parse(rm.Groups[3].Value, CultureInfo.InvariantCulture);
                    int fileIdx = int.Parse(rm.Groups[4].Value, CultureInfo.InvariantCulture);
                    string flags = rm.Groups[5].Value;

                    if (userFileIndices.Count == 0 || userFileIndices.Contains(fileIdx))
                    {
                        list.Add(new DwarfLineEntry(
                            CodeOffset: addr,
                            FileOffset: codePayloadOffset + addr,
                            Line: srcLine,
                            Column: srcCol,
                            FileIndex: fileIdx,
                            IsStmt: flags.Contains("is_stmt"),
                            IsPrologueEnd: flags.Contains("prologue_end"),
                            IsEndSequence: flags.Contains("end_sequence")
                        ));
                    }
                }
            }
        }

        return list;
    }

    private static List<DwarfSubprogramInfo> ParseDebugInfo(string dwarfText, int codePayloadOffset)
    {
        var subprograms = new List<DwarfSubprogramInfo>();
        var typeMap = new Dictionary<string, (string Name, int ByteSize, bool IsSigned, bool IsFloat)>();

        // First pass: collect DW_TAG_base_type, DW_TAG_pointer_type, DW_TAG_typedef
        var tagMatches = dwarfText.Split('\n');
        var typedefLinks = new Dictionary<string, (string Name, string? TargetAddr)>();
        string? curTagAddr = null;
        string? curTagKind = null;
        string? tName = null;
        string? tTargetAddr = null;
        int tSize = 4;
        bool tSigned = true;
        bool tFloat = false;

        void FlushType()
        {
            if (curTagAddr == null) return;
            if (curTagKind == "DW_TAG_base_type" || curTagKind == "DW_TAG_pointer_type")
            {
                string name = curTagKind == "DW_TAG_pointer_type" ? (tName != null ? $"{tName}*" : "void*") : (tName ?? "i32");
                typeMap[curTagAddr] = (name, tSize, tSigned, tFloat);
            }
            else if (curTagKind == "DW_TAG_typedef")
            {
                typedefLinks[curTagAddr] = (tName ?? "typedef", tTargetAddr);
            }
        }

        var tagHeaderRx = new Regex(@"^(0x[0-9a-fA-F]+):\s+(DW_TAG_\w+)", RegexOptions.Compiled);
        var hexValRx = new Regex(@"\(0x([0-9a-fA-F]+)\)", RegexOptions.Compiled);
        var strValRx = new Regex(@"\(""([^""]*)""\)", RegexOptions.Compiled);
        var typeRefRx = new Regex(@"\((0x[0-9a-fA-F]+)\s*""([^""]*)""\)", RegexOptions.Compiled);

        foreach (var raw in tagMatches)
        {
            string trimmed = raw.Trim();
            var tm = tagHeaderRx.Match(trimmed);
            if (tm.Success)
            {
                FlushType();
                curTagAddr = tm.Groups[1].Value;
                curTagKind = tm.Groups[2].Value;
                tName = null;
                tTargetAddr = null;
                tSize = 4;
                tSigned = true;
                tFloat = false;
                continue;
            }

            if (curTagKind == "DW_TAG_base_type" || curTagKind == "DW_TAG_pointer_type" || curTagKind == "DW_TAG_typedef")
            {
                if (trimmed.StartsWith("DW_AT_name"))
                {
                    var m = strValRx.Match(trimmed);
                    if (m.Success) tName = m.Groups[1].Value;
                }
                else if (trimmed.StartsWith("DW_AT_byte_size"))
                {
                    var m = hexValRx.Match(trimmed);
                    if (m.Success) tSize = int.Parse(m.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                }
                else if (trimmed.StartsWith("DW_AT_encoding"))
                {
                    tFloat = trimmed.Contains("DW_ATE_float");
                    tSigned = !trimmed.Contains("DW_ATE_unsigned");
                }
                else if (trimmed.StartsWith("DW_AT_type"))
                {
                    var m = typeRefRx.Match(trimmed);
                    if (m.Success)
                    {
                        tTargetAddr = m.Groups[1].Value;
                        if (curTagKind == "DW_TAG_pointer_type") tName = m.Groups[2].Value;
                    }
                }
            }
        }
        FlushType();

        // Resolve typedef chains (e.g. byte -> unsigned char)
        foreach (var kv in typedefLinks)
        {
            string? target = kv.Value.TargetAddr;
            int guard = 0;
            while (target != null && !typeMap.ContainsKey(target) && typedefLinks.TryGetValue(target, out var next) && guard++ < 8)
                target = next.TargetAddr;
            if (target != null && typeMap.TryGetValue(target, out var resolved))
                typeMap[kv.Key] = (kv.Value.Name, resolved.ByteSize, resolved.IsSigned, resolved.IsFloat);
        }

        // Second pass: collect DW_TAG_subprogram and child variables/params
        DwarfSubprogramInfo? curSub = null;
        string? subName = null;
        int subLow = 0, subHigh = 0;
        int? subFrameBase = null;
        var subVars = new List<DwarfVariableInfo>();

        bool inVar = false;
        string? varName = null;
        string varType = "int";
        int varSize = 4;
        bool varSigned = true;
        bool varFloat = false;
        int varLine = 0;
        int? varFbreg = null;
        int? varLocal = null;
        uint? varGlobalAddr = null;

        void FlushVar()
        {
            if (inVar && curSub != null && !string.IsNullOrEmpty(varName))
            {
                curSub.Variables.Add(new DwarfVariableInfo(
                    varName!, varType, varSize, varSigned, varFloat, varLine, varFbreg, varLocal, varGlobalAddr));
            }
            inVar = false;
            varName = null;
            varType = "int";
            varSize = 4;
            varSigned = true;
            varFloat = false;
            varLine = 0;
            varFbreg = null;
            varLocal = null;
            varGlobalAddr = null;
        }

        void FlushSub()
        {
            FlushVar();
            if (curSub != null)
            {
                subprograms.Add(curSub with
                {
                    Name = subName ?? curSub.Name,
                    LowFileOffset = codePayloadOffset + subLow,
                    HighFileOffset = codePayloadOffset + subHigh,
                    FrameBaseLocalIndex = subFrameBase
                });
                curSub = null;
            }
        }

        foreach (var raw in tagMatches)
        {
            string trimmed = raw.Trim();
            var tm = tagHeaderRx.Match(trimmed);
            if (tm.Success)
            {
                string tag = tm.Groups[2].Value;
                if (tag == "DW_TAG_subprogram")
                {
                    FlushSub();
                    subName = "func";
                    subLow = 0;
                    subHigh = 0;
                    subFrameBase = null;
                    subVars = new List<DwarfVariableInfo>();
                    curSub = new DwarfSubprogramInfo("func", 0, 0, null, subVars);
                }
                else if ((tag == "DW_TAG_variable" || tag == "DW_TAG_formal_parameter") && curSub != null)
                {
                    FlushVar();
                    inVar = true;
                }
                else
                {
                    FlushVar();
                }
                continue;
            }

            if (trimmed == "NULL")
            {
                if (inVar) FlushVar();
                continue;
            }

            if (inVar)
            {
                if (trimmed.StartsWith("DW_AT_name"))
                {
                    var m = strValRx.Match(trimmed);
                    if (m.Success) varName = m.Groups[1].Value;
                }
                else if (trimmed.StartsWith("DW_AT_decl_line"))
                {
                    var m = Regex.Match(trimmed, @"\((\d+)\)");
                    if (m.Success) varLine = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
                }
                else if (trimmed.StartsWith("DW_AT_type"))
                {
                    var m = typeRefRx.Match(trimmed);
                    if (m.Success)
                    {
                        string tAddr = m.Groups[1].Value;
                        varType = m.Groups[2].Value;
                        if (typeMap.TryGetValue(tAddr, out var info))
                        {
                            varType = info.Name;
                            varSize = info.ByteSize;
                            varSigned = info.IsSigned;
                            varFloat = info.IsFloat;
                        }
                    }
                }
                else if (trimmed.StartsWith("DW_AT_location"))
                {
                    var fbM = Regex.Match(trimmed, @"DW_OP_fbreg\s+([+-]?\d+)");
                    if (fbM.Success) varFbreg = int.Parse(fbM.Groups[1].Value, CultureInfo.InvariantCulture);

                    var wlM = Regex.Match(trimmed, @"DW_OP_WASM_location\s+0x0\s+0x([0-9a-fA-F]+)");
                    if (wlM.Success) varLocal = int.Parse(wlM.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);

                    var addrM = Regex.Match(trimmed, @"DW_OP_addr\s+0x([0-9a-fA-F]+)");
                    if (addrM.Success) varGlobalAddr = uint.Parse(addrM.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                }
            }
            else if (curSub != null)
            {
                if (trimmed.StartsWith("DW_AT_name"))
                {
                    var m = strValRx.Match(trimmed);
                    if (m.Success) subName = m.Groups[1].Value;
                }
                else if (trimmed.StartsWith("DW_AT_low_pc"))
                {
                    var m = hexValRx.Match(trimmed);
                    if (m.Success) subLow = int.Parse(m.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                }
                else if (trimmed.StartsWith("DW_AT_high_pc"))
                {
                    var m = hexValRx.Match(trimmed);
                    if (m.Success) subHigh = int.Parse(m.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                }
                else if (trimmed.StartsWith("DW_AT_frame_base"))
                {
                    var m = Regex.Match(trimmed, @"DW_OP_WASM_location\s+0x0\s+0x([0-9a-fA-F]+)");
                    if (m.Success)
                        subFrameBase = int.Parse(m.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                }
            }
        }
        FlushSub();

        return subprograms;
    }

    private static async Task<(int ExitCode, string StdOut, string StdErr)> RunProcessAsync(
        string fileName,
        IEnumerable<string> args,
        string workingDir,
        CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            WorkingDirectory = workingDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var proc = Process.Start(psi) ?? throw new InvalidOperationException($"Failed to start {fileName}");
        var outTask = proc.StandardOutput.ReadToEndAsync(ct);
        var errTask = proc.StandardError.ReadToEndAsync(ct);
        await proc.WaitForExitAsync(ct);
        return (proc.ExitCode, await outTask, await errTask);
    }
}
