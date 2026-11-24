using System.Text;

namespace WasmIde.Services;

public sealed record WasmSectionInfo(
    byte Id,
    string Name,
    int FileOffset,
    int PayloadOffset,
    int PayloadLength,
    string Summary
);

public sealed record WasmDisasmInstruction(
    int FileOffset,
    int CodeSectionOffset,
    int FuncIndex,
    string FuncName,
    int InstrIndex,
    ushort Opcode,
    string OpcodeHex,
    string Mnemonic,
    string Operands,
    string RawHex,
    int Depth,
    int? CLine,
    int? CColumn,
    bool IsPrologueEnd
);

public sealed record WasmFunctionSummary(
    int FuncIndex,
    string Name,
    bool IsImport,
    string ImportModule,
    string ImportField,
    string Signature,
    int BodyFileOffset,
    int BodyLength,
    List<string> Locals
);

public sealed record WasmGlobalSummary(
    int Index,
    string Type,
    bool Mutable,
    string InitExpr
);

public sealed record ParsedWasmBinary(
    string MagicHex,
    uint Version,
    int TotalBytes,
    int CodeSectionPayloadOffset,
    List<WasmSectionInfo> Sections,
    List<WasmFunctionSummary> Functions,
    List<WasmGlobalSummary> Globals,
    List<WasmDisasmInstruction> Instructions
);

public sealed class WasmBinaryInspector
{
    public ParsedWasmBinary Inspect(byte[] bytes)
    {
        if (bytes.Length < 8 || bytes[0] != 0x00 || bytes[1] != 0x61 || bytes[2] != 0x73 || bytes[3] != 0x6D)
            throw new InvalidOperationException("Invalid Wasm magic header (expected 00 61 73 6D).");

        uint version = BitConverter.ToUInt32(bytes, 4);
        var sections = new List<WasmSectionInfo>();
        var types = new List<(string[] Params, string[] Results, string Sig)>();
        var funcs = new List<WasmFunctionSummary>();
        var globals = new List<WasmGlobalSummary>();
        var exportNames = new Dictionary<int, List<string>>();
        var funcNames = new Dictionary<int, string>();
        var instructions = new List<WasmDisasmInstruction>();
        int codeSectionPayloadOffset = 0;

        int pos = 8;
        int importedFuncCount = 0;
        var definedTypeIndices = new List<int>();
        byte[]? codeSectionRange = null;
        int codePayloadStart = 0;

        while (pos < bytes.Length)
        {
            int secStart = pos;
            byte secId = bytes[pos++];
            uint secLen = ReadULEB128(bytes, ref pos);
            int payloadStart = pos;
            int payloadEnd = Math.Min(bytes.Length, pos + (int)secLen);
            string secName = SectionIdToName(secId);
            string summary = "";

            if (secId == 0)
            {
                int p = payloadStart;
                string customName = ReadUtf8(bytes, ref p);
                secName = $"CUSTOM ({customName})";
                summary = $"Custom section '{customName}' ({secLen} bytes)";
                if (customName == "name")
                {
                    ParseNameSection(bytes, p, payloadEnd, funcNames);
                }
            }
            else if (secId == 1) // Type
            {
                int p = payloadStart;
                uint count = ReadULEB128(bytes, ref p);
                for (uint i = 0; i < count && p < payloadEnd; i++)
                {
                    byte form = bytes[p++]; // 0x60
                    uint np = ReadULEB128(bytes, ref p);
                    var prms = new string[np];
                    for (uint j = 0; j < np; j++) prms[j] = ValTypeName(bytes[p++]);
                    uint nr = ReadULEB128(bytes, ref p);
                    var rts = new string[nr];
                    for (uint j = 0; j < nr; j++) rts[j] = ValTypeName(bytes[p++]);
                    string sig = $"({string.Join(", ", prms)}) -> ({string.Join(", ", rts)})";
                    types.Add((prms, rts, sig));
                }
                summary = $"{count} function type(s)";
            }
            else if (secId == 2) // Import
            {
                int p = payloadStart;
                uint count = ReadULEB128(bytes, ref p);
                for (uint i = 0; i < count && p < payloadEnd; i++)
                {
                    string mod = ReadUtf8(bytes, ref p);
                    string field = ReadUtf8(bytes, ref p);
                    byte kind = bytes[p++];
                    if (kind == 0)
                    {
                        int typeIdx = (int)ReadULEB128(bytes, ref p);
                        string sig = typeIdx < types.Count ? types[typeIdx].Sig : $"type#{typeIdx}";
                        funcs.Add(new WasmFunctionSummary(importedFuncCount, $"{mod}.{field}", true, mod, field, sig, 0, 0, new List<string>()));
                        importedFuncCount++;
                    }
                    else if (kind == 1) { p++; ReadLimits(bytes, ref p); }
                    else if (kind == 2) { ReadLimits(bytes, ref p); }
                    else if (kind == 3) { p += 2; }
                }
                summary = $"{count} import(s) ({importedFuncCount} func)";
            }
            else if (secId == 3) // Function
            {
                int p = payloadStart;
                uint count = ReadULEB128(bytes, ref p);
                for (uint i = 0; i < count && p < payloadEnd; i++)
                {
                    definedTypeIndices.Add((int)ReadULEB128(bytes, ref p));
                }
                summary = $"{count} defined function(s)";
            }
            else if (secId == 5) // Memory
            {
                int p = payloadStart;
                uint count = ReadULEB128(bytes, ref p);
                summary = $"{count} linear memory";
            }
            else if (secId == 6) // Global
            {
                int p = payloadStart;
                uint count = ReadULEB128(bytes, ref p);
                for (uint i = 0; i < count && p < payloadEnd; i++)
                {
                    string vt = ValTypeName(bytes[p++]);
                    bool mut = bytes[p++] != 0;
                    string initExpr = ReadInitExpr(bytes, ref p, payloadEnd);
                    globals.Add(new WasmGlobalSummary((int)i, vt, mut, initExpr));
                }
                summary = $"{count} global(s)";
            }
            else if (secId == 7) // Export
            {
                int p = payloadStart;
                uint count = ReadULEB128(bytes, ref p);
                for (uint i = 0; i < count && p < payloadEnd; i++)
                {
                    string ename = ReadUtf8(bytes, ref p);
                    byte kind = bytes[p++];
                    int idx = (int)ReadULEB128(bytes, ref p);
                    if (kind == 0)
                    {
                        if (!exportNames.TryGetValue(idx, out var list))
                        {
                            list = new List<string>();
                            exportNames[idx] = list;
                        }
                        list.Add(ename);
                    }
                }
                summary = $"{count} export(s)";
            }
            else if (secId == 10) // Code
            {
                codeSectionPayloadOffset = payloadStart;
                codePayloadStart = payloadStart;
                codeSectionRange = bytes;
                summary = $"Executable bytecode ({secLen} bytes)";
            }
            else if (secId == 11) // Data
            {
                int p = payloadStart;
                uint count = ReadULEB128(bytes, ref p);
                summary = $"{count} data segment(s)";
            }
            else
            {
                summary = $"{secLen} bytes";
            }

            sections.Add(new WasmSectionInfo(secId, secName, secStart, payloadStart, payloadEnd - payloadStart, summary));
            pos = payloadEnd;
        }

        // Build defined function entries and disassemble Code section
        if (codeSectionRange != null && codePayloadStart > 0)
        {
            int p = codePayloadStart;
            uint bodyCount = ReadULEB128(bytes, ref p);
            for (uint i = 0; i < bodyCount; i++)
            {
                int funcIdx = importedFuncCount + (int)i;
                uint bodySize = ReadULEB128(bytes, ref p);
                int bodyStart = p;
                int bodyEnd = Math.Min(bytes.Length, p + (int)bodySize);

                string resolvedName = funcNames.TryGetValue(funcIdx, out var n) ? n
                    : (exportNames.TryGetValue(funcIdx, out var exs) && exs.Count > 0 ? exs[0] : $"func_{funcIdx}");

                int typeIdx = (int)i < definedTypeIndices.Count ? definedTypeIndices[(int)i] : -1;
                string sig = (typeIdx >= 0 && typeIdx < types.Count) ? types[typeIdx].Sig : "() -> ()";

                int lp = p;
                uint localDeclGroups = ReadULEB128(bytes, ref lp);
                var locals = new List<string>();
                for (uint g = 0; g < localDeclGroups && lp < bodyEnd; g++)
                {
                    uint cnt = ReadULEB128(bytes, ref lp);
                    string vt = ValTypeName(bytes[lp++]);
                    for (uint k = 0; k < cnt; k++) locals.Add(vt);
                }

                funcs.Add(new WasmFunctionSummary(funcIdx, resolvedName, false, "", "", sig, bodyStart, (int)bodySize, locals));

                DisassembleBody(bytes, lp, bodyEnd, codeSectionPayloadOffset, funcIdx, resolvedName, instructions);
                p = bodyEnd;
            }
        }

        return new ParsedWasmBinary(
            "00 61 73 6D",
            version,
            bytes.Length,
            codeSectionPayloadOffset,
            sections,
            funcs,
            globals,
            instructions
        );
    }

    private static void DisassembleBody(
        byte[] bytes,
        int start,
        int end,
        int codeSectionPayloadOffset,
        int funcIdx,
        string funcName,
        List<WasmDisasmInstruction> outInstrs)
    {
        int p = start;
        int depth = 1;
        int instrIndex = 0;

        while (p < end)
        {
            int instrStart = p;
            byte opByte = bytes[p++];
            ushort opcode = opByte;
            int nextDepth = depth;
            int displayDepth = depth;

            string mnemonic = OpcodeNames.TryGetValue(opByte, out var m) ? m : $"op_0x{opByte:x2}";
            string operands = "";

            switch (opByte)
            {
                case 0x02: // block
                case 0x03: // loop
                case 0x04: // if
                {
                    operands = ReadBlockType(bytes, ref p);
                    nextDepth = depth + 1;
                    break;
                }
                case 0x05: // else
                    displayDepth = Math.Max(0, depth - 1);
                    break;
                case 0x0B: // end
                    depth = Math.Max(0, depth - 1);
                    displayDepth = depth;
                    nextDepth = depth;
                    break;
                case 0x0C: // br
                case 0x0D: // br_if
                case 0x10: // call
                case 0x20: // local.get
                case 0x21: // local.set
                case 0x22: // local.tee
                case 0x23: // global.get
                case 0x24: // global.set
                case 0x25: // table.get
                case 0x26: // table.set
                {
                    uint idx = ReadULEB128(bytes, ref p);
                    operands = idx.ToString();
                    break;
                }
                case 0x0E: // br_table
                {
                    uint cnt = ReadULEB128(bytes, ref p);
                    var targets = new List<uint>();
                    for (uint k = 0; k < cnt && p < end; k++) targets.Add(ReadULEB128(bytes, ref p));
                    uint def = ReadULEB128(bytes, ref p);
                    operands = $"[{string.Join(" ", targets)}] default={def}";
                    break;
                }
                case 0x11: // call_indirect
                {
                    uint typeIdx = ReadULEB128(bytes, ref p);
                    uint tableIdx = ReadULEB128(bytes, ref p);
                    operands = $"type={typeIdx} table={tableIdx}";
                    break;
                }
                case 0x1C: // select t*
                {
                    uint cnt = ReadULEB128(bytes, ref p);
                    var ts = new List<string>();
                    for (uint k = 0; k < cnt && p < end; k++) ts.Add(ValTypeName(bytes[p++]));
                    operands = string.Join(" ", ts);
                    break;
                }
                case >= 0x28 and <= 0x3E: // memory load/store
                {
                    uint align = ReadULEB128(bytes, ref p);
                    uint memOffset = ReadULEB128(bytes, ref p);
                    operands = memOffset != 0 ? $"offset={memOffset} align={1u << (int)(align & 0x3F)}" : $"align={1u << (int)(align & 0x3F)}";
                    break;
                }
                case 0x3F: // memory.size
                case 0x40: // memory.grow
                {
                    uint memIdx = ReadULEB128(bytes, ref p);
                    operands = memIdx == 0 ? "" : memIdx.ToString();
                    break;
                }
                case 0x41: // i32.const
                    operands = ReadSLEB128_i32(bytes, ref p).ToString();
                    break;
                case 0x42: // i64.const
                    operands = ReadSLEB128_i64(bytes, ref p).ToString();
                    break;
                case 0x43: // f32.const
                {
                    if (p + 4 <= end)
                    {
                        float fv = BitConverter.ToSingle(bytes, p);
                        p += 4;
                        operands = fv.ToString("G");
                    }
                    break;
                }
                case 0x44: // f64.const
                {
                    if (p + 8 <= end)
                    {
                        double dv = BitConverter.ToDouble(bytes, p);
                        p += 8;
                        operands = dv.ToString("G");
                    }
                    break;
                }
                case 0xFC:
                {
                    uint sub = ReadULEB128(bytes, ref p);
                    opcode = (ushort)(0xFC00 | (sub & 0xFF));
                    mnemonic = ExtendedOpcodeNames.TryGetValue(sub, out var em) ? em : $"0xfc.{sub}";
                    if (sub == 8) // memory.init
                    {
                        uint dataIdx = ReadULEB128(bytes, ref p);
                        uint memIdx = bytes[p++];
                        operands = $"data={dataIdx} mem={memIdx}";
                    }
                    else if (sub == 9) operands = ReadULEB128(bytes, ref p).ToString();
                    else if (sub == 10) { p += 2; operands = "0 0"; }
                    else if (sub == 11) { p += 1; operands = "0"; }
                    break;
                }
            }

            int byteLen = Math.Max(1, p - instrStart);
            var hexSb = new StringBuilder(byteLen * 3);
            for (int k = 0; k < byteLen; k++)
            {
                if (k > 0) hexSb.Append(' ');
                hexSb.Append(bytes[instrStart + k].ToString("x2"));
            }

            outInstrs.Add(new WasmDisasmInstruction(
                FileOffset: instrStart,
                CodeSectionOffset: instrStart - codeSectionPayloadOffset,
                FuncIndex: funcIdx,
                FuncName: funcName,
                InstrIndex: instrIndex++,
                Opcode: opcode,
                OpcodeHex: opcode > 0xFF ? $"0x{opcode:X4}" : $"0x{opcode:X2}",
                Mnemonic: mnemonic,
                Operands: operands,
                RawHex: hexSb.ToString(),
                Depth: displayDepth,
                CLine: null,
                CColumn: null,
                IsPrologueEnd: false
            ));

            depth = nextDepth;
        }
    }

    private static string ReadBlockType(byte[] bytes, ref int p)
    {
        if (p >= bytes.Length) return "";
        byte b = bytes[p];
        if (b == 0x40) { p++; return ""; }
        if (b == 0x7F || b == 0x7E || b == 0x7D || b == 0x7C || b == 0x70 || b == 0x6F)
        {
            p++;
            return $"(result {ValTypeName(b)})";
        }
        long idx = ReadSLEB128_i64(bytes, ref p);
        return $"(type {idx})";
    }

    private static string ReadInitExpr(byte[] bytes, ref int p, int end)
    {
        var parts = new List<string>();
        while (p < end)
        {
            byte op = bytes[p++];
            if (op == 0x0B) break;
            if (op == 0x41) parts.Add($"i32.const {ReadSLEB128_i32(bytes, ref p)}");
            else if (op == 0x42) parts.Add($"i64.const {ReadSLEB128_i64(bytes, ref p)}");
            else if (op == 0x43 && p + 4 <= end) { parts.Add($"f32.const {BitConverter.ToSingle(bytes, p)}"); p += 4; }
            else if (op == 0x44 && p + 8 <= end) { parts.Add($"f64.const {BitConverter.ToDouble(bytes, p)}"); p += 8; }
            else if (op == 0x23) parts.Add($"global.get {ReadULEB128(bytes, ref p)}");
            else parts.Add($"0x{op:X2}");
        }
        return string.Join(" ", parts);
    }

    private static void ParseNameSection(byte[] bytes, int p, int end, Dictionary<int, string> funcNames)
    {
        while (p < end)
        {
            byte subId = bytes[p++];
            uint subLen = ReadULEB128(bytes, ref p);
            int subEnd = Math.Min(end, p + (int)subLen);
            if (subId == 1)
            {
                uint count = ReadULEB128(bytes, ref p);
                for (uint i = 0; i < count && p < subEnd; i++)
                {
                    int idx = (int)ReadULEB128(bytes, ref p);
                    string name = ReadUtf8(bytes, ref p);
                    funcNames[idx] = name;
                }
            }
            p = subEnd;
        }
    }

    private static void ReadLimits(byte[] bytes, ref int p)
    {
        byte flags = bytes[p++];
        ReadULEB128(bytes, ref p);
        if ((flags & 0x01) != 0) ReadULEB128(bytes, ref p);
    }

    private static string ReadUtf8(byte[] bytes, ref int p)
    {
        uint len = ReadULEB128(bytes, ref p);
        int actual = Math.Min((int)len, bytes.Length - p);
        string s = Encoding.UTF8.GetString(bytes, p, actual);
        p += actual;
        return s;
    }

    private static uint ReadULEB128(byte[] bytes, ref int p)
    {
        uint result = 0;
        int shift = 0;
        while (p < bytes.Length)
        {
            byte b = bytes[p++];
            result |= (uint)(b & 0x7F) << shift;
            if ((b & 0x80) == 0) break;
            shift += 7;
        }
        return result;
    }

    private static int ReadSLEB128_i32(byte[] bytes, ref int p)
    {
        int result = 0;
        int shift = 0;
        byte b = 0;
        while (p < bytes.Length)
        {
            b = bytes[p++];
            result |= (b & 0x7F) << shift;
            shift += 7;
            if ((b & 0x80) == 0) break;
        }
        if (shift < 32 && (b & 0x40) != 0) result |= -(1 << shift);
        return result;
    }

    private static long ReadSLEB128_i64(byte[] bytes, ref int p)
    {
        long result = 0;
        int shift = 0;
        byte b = 0;
        while (p < bytes.Length)
        {
            b = bytes[p++];
            result |= (long)(b & 0x7F) << shift;
            shift += 7;
            if ((b & 0x80) == 0) break;
        }
        if (shift < 64 && (b & 0x40) != 0) result |= -(1L << shift);
        return result;
    }

    private static string SectionIdToName(byte id) => id switch
    {
        0 => "CUSTOM",
        1 => "TYPE",
        2 => "IMPORT",
        3 => "FUNCTION",
        4 => "TABLE",
        5 => "MEMORY",
        6 => "GLOBAL",
        7 => "EXPORT",
        8 => "START",
        9 => "ELEMENT",
        10 => "CODE",
        11 => "DATA",
        12 => "DATACOUNT",
        _ => $"SEC_{id}"
    };

    private static string ValTypeName(byte b) => b switch
    {
        0x7F => "i32",
        0x7E => "i64",
        0x7D => "f32",
        0x7C => "f64",
        0x7B => "v128",
        0x70 => "funcref",
        0x6F => "externref",
        _ => $"0x{b:X2}"
    };

    private static readonly Dictionary<uint, string> ExtendedOpcodeNames = new()
    {
        [0] = "i32.trunc_sat_f32_s",
        [1] = "i32.trunc_sat_f32_u",
        [2] = "i32.trunc_sat_f64_s",
        [3] = "i32.trunc_sat_f64_u",
        [4] = "i64.trunc_sat_f32_s",
        [5] = "i64.trunc_sat_f32_u",
        [6] = "i64.trunc_sat_f64_s",
        [7] = "i64.trunc_sat_f64_u",
        [8] = "memory.init",
        [9] = "data.drop",
        [10] = "memory.copy",
        [11] = "memory.fill",
        [12] = "table.init",
        [13] = "elem.drop",
        [14] = "table.copy",
        [15] = "table.grow",
        [16] = "table.size",
        [17] = "table.fill"
    };

    public static readonly Dictionary<byte, string> OpcodeNames = new()
    {
        [0x00] = "unreachable", [0x01] = "nop", [0x02] = "block", [0x03] = "loop",
        [0x04] = "if", [0x05] = "else", [0x0B] = "end", [0x0C] = "br",
        [0x0D] = "br_if", [0x0E] = "br_table", [0x0F] = "return", [0x10] = "call",
        [0x11] = "call_indirect", [0x1A] = "drop", [0x1B] = "select", [0x1C] = "select",
        [0x20] = "local.get", [0x21] = "local.set", [0x22] = "local.tee",
        [0x23] = "global.get", [0x24] = "global.set", [0x25] = "table.get", [0x26] = "table.set",
        [0x28] = "i32.load", [0x29] = "i64.load", [0x2A] = "f32.load", [0x2B] = "f64.load",
        [0x2C] = "i32.load8_s", [0x2D] = "i32.load8_u", [0x2E] = "i32.load16_s", [0x2F] = "i32.load16_u",
        [0x30] = "i64.load8_s", [0x31] = "i64.load8_u", [0x32] = "i64.load16_s", [0x33] = "i64.load16_u",
        [0x34] = "i64.load32_s", [0x35] = "i64.load32_u",
        [0x36] = "i32.store", [0x37] = "i64.store", [0x38] = "f32.store", [0x39] = "f64.store",
        [0x3A] = "i32.store8", [0x3B] = "i32.store16", [0x3C] = "i64.store8", [0x3D] = "i64.store16", [0x3E] = "i64.store32",
        [0x3F] = "memory.size", [0x40] = "memory.grow",
        [0x41] = "i32.const", [0x42] = "i64.const", [0x43] = "f32.const", [0x44] = "f64.const",
        [0x45] = "i32.eqz", [0x46] = "i32.eq", [0x47] = "i32.ne", [0x48] = "i32.lt_s", [0x49] = "i32.lt_u",
        [0x4A] = "i32.gt_s", [0x4B] = "i32.gt_u", [0x4C] = "i32.le_s", [0x4D] = "i32.le_u", [0x4E] = "i32.ge_s", [0x4F] = "i32.ge_u",
        [0x50] = "i64.eqz", [0x51] = "i64.eq", [0x52] = "i64.ne", [0x53] = "i64.lt_s", [0x54] = "i64.lt_u",
        [0x55] = "i64.gt_s", [0x56] = "i64.gt_u", [0x57] = "i64.le_s", [0x58] = "i64.le_u", [0x59] = "i64.ge_s", [0x5A] = "i64.ge_u",
        [0x5B] = "f32.eq", [0x5C] = "f32.ne", [0x5D] = "f32.lt", [0x5E] = "f32.gt", [0x5F] = "f32.le", [0x60] = "f32.ge",
        [0x61] = "f64.eq", [0x62] = "f64.ne", [0x63] = "f64.lt", [0x64] = "f64.gt", [0x65] = "f64.le", [0x66] = "f64.ge",
        [0x67] = "i32.clz", [0x68] = "i32.ctz", [0x69] = "i32.popcnt", [0x6A] = "i32.add", [0x6B] = "i32.sub",
        [0x6C] = "i32.mul", [0x6D] = "i32.div_s", [0x6E] = "i32.div_u", [0x6F] = "i32.rem_s", [0x70] = "i32.rem_u",
        [0x71] = "i32.and", [0x72] = "i32.or", [0x73] = "i32.xor", [0x74] = "i32.shl", [0x75] = "i32.shr_s",
        [0x76] = "i32.shr_u", [0x77] = "i32.rotl", [0x78] = "i32.rotr",
        [0x79] = "i64.clz", [0x7A] = "i64.ctz", [0x7B] = "i64.popcnt", [0x7C] = "i64.add", [0x7D] = "i64.sub",
        [0x7E] = "i64.mul", [0x7F] = "i64.div_s", [0x80] = "i64.div_u", [0x81] = "i64.rem_s", [0x82] = "i64.rem_u",
        [0x83] = "i64.and", [0x84] = "i64.or", [0x85] = "i64.xor", [0x86] = "i64.shl", [0x87] = "i64.shr_s",
        [0x88] = "i64.shr_u", [0x89] = "i64.rotl", [0x8A] = "i64.rotr",
        [0x8B] = "f32.abs", [0x8C] = "f32.neg", [0x8D] = "f32.ceil", [0x8E] = "f32.floor", [0x8F] = "f32.trunc",
        [0x90] = "f32.nearest", [0x91] = "f32.sqrt", [0x92] = "f32.add", [0x93] = "f32.sub", [0x94] = "f32.mul",
        [0x95] = "f32.div", [0x96] = "f32.min", [0x97] = "f32.max", [0x98] = "f32.copysign",
        [0x99] = "f64.abs", [0x9A] = "f64.neg", [0x9B] = "f64.ceil", [0x9C] = "f64.floor", [0x9D] = "f64.trunc",
        [0x9E] = "f64.nearest", [0x9F] = "f64.sqrt", [0xA0] = "f64.add", [0xA1] = "f64.sub", [0xA2] = "f64.mul",
        [0xA3] = "f64.div", [0xA4] = "f64.min", [0xA5] = "f64.max", [0xA6] = "f64.copysign",
        [0xA7] = "i32.wrap_i64", [0xA8] = "i32.trunc_f32_s", [0xA9] = "i32.trunc_f32_u",
        [0xAA] = "i32.trunc_f64_s", [0xAB] = "i32.trunc_f64_u",
        [0xAC] = "i64.extend_i32_s", [0xAD] = "i64.extend_i32_u",
        [0xAE] = "i64.trunc_f32_s", [0xAF] = "i64.trunc_f32_u",
        [0xB0] = "i64.trunc_f64_s", [0xB1] = "i64.trunc_f64_u",
        [0xB2] = "f32.convert_i32_s", [0xB3] = "f32.convert_i32_u", [0xB4] = "f32.convert_i64_s", [0xB5] = "f32.convert_i64_u",
        [0xB6] = "f32.demote_f64",
        [0xB7] = "f64.convert_i32_s", [0xB8] = "f64.convert_i32_u", [0xB9] = "f64.convert_i64_s", [0xBA] = "f64.convert_i64_u",
        [0xBB] = "f64.promote_f32",
        [0xBC] = "i32.reinterpret_f32", [0xBD] = "i64.reinterpret_f64", [0xBE] = "f32.reinterpret_i32", [0xBF] = "f64.reinterpret_i64",
        [0xC0] = "i32.extend8_s", [0xC1] = "i32.extend16_s", [0xC2] = "i64.extend8_s", [0xC3] = "i64.extend16_s", [0xC4] = "i64.extend32_s"
    };
}
