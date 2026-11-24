namespace WasmIde.Services;

public sealed record WasmInstructionSpec(
    string OpcodeHex,
    string Mnemonic,
    string Category,
    string BinaryEncoding,
    string StackEffect,
    string Summary,
    string FormalExecution,
    string Traps,
    string Wasm3Internals,
    string SpecAnchor
);

public sealed class WasmSpecService
{
    private readonly IWebHostEnvironment _env;
    private readonly List<WasmInstructionSpec> _specs;
    private readonly Dictionary<string, WasmInstructionSpec> _byOpcode;
    private readonly Dictionary<string, WasmInstructionSpec> _byMnemonic;

    public WasmSpecService(IWebHostEnvironment env)
    {
        _env = env;
        _specs = BuildInstructionCatalog();
        _byOpcode = _specs.GroupBy(s => s.OpcodeHex, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        _byMnemonic = _specs.GroupBy(s => s.Mnemonic, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyList<WasmInstructionSpec> GetAllInstructions() => _specs;

    public WasmInstructionSpec? Lookup(string? opcodeHex, string? mnemonic)
    {
        if (!string.IsNullOrWhiteSpace(opcodeHex) && _byOpcode.TryGetValue(opcodeHex, out var byOp))
            return byOp;
        if (!string.IsNullOrWhiteSpace(mnemonic) && _byMnemonic.TryGetValue(mnemonic, out var byMn))
            return byMn;
        return null;
    }

    public object GetLocalSpecStatus()
    {
        string specDir = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"), "spec");
        var files = new[] { "wasm-core-1.html", "binary-instructions.html", "exec-instructions.html" }
            .Select(f =>
            {
                string p = Path.Combine(specDir, f);
                var fi = new FileInfo(p);
                return new
                {
                    file = f,
                    url = $"/spec/{f}",
                    exists = fi.Exists,
                    bytes = fi.Exists ? fi.Length : 0
                };
            }).ToList();

        return new
        {
            downloaded = files.All(f => f.exists && f.bytes > 0),
            files
        };
    }

    public async Task<object> DownloadOfficialSpecAsync(CancellationToken ct = default)
    {
        string specDir = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"), "spec");
        Directory.CreateDirectory(specDir);

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(45) };
        var targets = new (string Url, string FileName)[]
        {
            ("https://www.w3.org/TR/wasm-core-1/", "wasm-core-1.html"),
            ("https://webassembly.github.io/spec/core/binary/instructions.html", "binary-instructions.html"),
            ("https://webassembly.github.io/spec/core/exec/instructions.html", "exec-instructions.html")
        };

        foreach (var (url, file) in targets)
        {
            string html = await http.GetStringAsync(url, ct);
            await File.WriteAllTextAsync(Path.Combine(specDir, file), html, ct);
        }

        return GetLocalSpecStatus();
    }

    private static List<WasmInstructionSpec> BuildInstructionCatalog()
    {
        var list = new List<WasmInstructionSpec>();
        void Add(string op, string mn, string cat, string enc, string stack, string sum, string exec, string traps, string m3, string anchor)
            => list.Add(new WasmInstructionSpec(op, mn, cat, enc, stack, sum, exec, traps, m3, anchor));

        // Control Instructions
        Add("0x00", "unreachable", "Control", "0x00", "[*] -> [*]", "Denotes a point in code that should not be reachable; immediately traps.", "Immediately produces trap 'unreachable executed'. Polymorphic stack.", "Always traps.", "m3_compile.c: Compile_Unreachable emits op_Unreachable & marks block.isPolymorphic = true.", "binary-instructions.html#control-instructions");
        Add("0x01", "nop", "Control", "0x01", "[] -> []", "No operation; advances PC without affecting stack or state.", "Does nothing.", "None.", "m3_compile.c: Compile_Nop emits zero M3 ops in the code page.", "binary-instructions.html#control-instructions");
        Add("0x02", "block", "Control", "0x02 bt:blocktype instr* 0x0B", "[t1*] -> [t2*]", "Structured forward-branch target block with block signature bt.", "Enters block label whose continuation is after matching end (0x0B). br jumps to end.", "None.", "m3_compile.c: Compile_LoopOrBlock pushes M3CompilationScope; branches forward-patch into PatchBranches().", "binary-instructions.html#control-instructions");
        Add("0x03", "loop", "Control", "0x03 bt:blocktype instr* 0x0B", "[t1*] -> [t2*]", "Structured backward-branch loop block.", "Enters loop label whose continuation is the loop start. br jumps back to loop header.", "Native stack check.", "m3_compile.c emits op_Loop; m3_exec.h op_Loop loops while nextOpImpl() returns _pc (ContinueLoop sentinel).", "binary-instructions.html#control-instructions");
        Add("0x04", "if", "Control", "0x04 bt:blocktype instr* (0x05 instr*)? 0x0B", "[t1* i32] -> [t2*]", "Conditional structured control flow.", "Pops i32 c; if c != 0 executes then-arm, else executes else-arm (or skips to end).", "None.", "m3_compile.c emits op_If_r (if top in _r0) or op_If_s (if in slot) with else/end patch pointer.", "binary-instructions.html#control-instructions");
        Add("0x05", "else", "Control", "0x05", "[] -> []", "Separates then and else arms of an if block.", "At end of then-arm, jumps past matching end.", "None.", "m3_compile.c patches jump over else-arm and compiles else-arm in same M3CompilationScope.", "binary-instructions.html#control-instructions");
        Add("0x0B", "end", "Control", "0x0B", "[] -> []", "Terminates a block, loop, if, or function body.", "Exits structured block or returns from function body.", "None.", "m3_compile.c Compile_End patches forward branches; at depth 0 emits ReturnValues + op_Return.", "binary-instructions.html#control-instructions");
        Add("0x0C", "br", "Control", "0x0C l:labelidx (ULEB128)", "[t*] -> [*]", "Unconditional branch to structured label l (0 = innermost).", "Unwinds operand stack to target label arity, jumps to loop header or block end.", "None.", "m3_compile.c emits op_Branch (forward) or op_ContinueLoop (backward to loop pc).", "binary-instructions.html#control-instructions");
        Add("0x0D", "br_if", "Control", "0x0D l:labelidx (ULEB128)", "[t* i32] -> [t*]", "Conditional branch to label l if popped i32 != 0.", "Pops i32 c; if c != 0 performs br l, else falls through.", "None.", "m3_compile.c emits op_BranchIf_r/_s or op_ContinueLoopIf.", "binary-instructions.html#control-instructions");
        Add("0x0E", "br_table", "Control", "0x0E vec(l:labelidx) lN:labelidx", "[t* i32] -> [*]", "Multi-way jump table indexed by i32 operand.", "Pops i32 idx; branches to labels[idx] if idx < len, else labels[default].", "None.", "m3_compile.c emits op_BranchTable followed by inline pc_t target table.", "binary-instructions.html#control-instructions");
        Add("0x0F", "return", "Control", "0x0F", "[t*] -> [*]", "Returns immediately from the current function.", "Copies return values to caller result slots and exits function frame.", "None.", "m3_compile.c Compile_Return moves return values to slot 0..numRetSlots-1 and emits op_Return.", "binary-instructions.html#control-instructions");
        Add("0x10", "call", "Control", "0x10 x:funcidx (ULEB128)", "[t1*] -> [t2*]", "Invokes function x directly by static index.", "Pushes activation frame with params, runs function body, leaves results on stack.", "Call stack overflow.", "m3_compile.c emits op_Call (or op_Compile on lazy target) + callee pc_t + sp stackOffset.", "binary-instructions.html#control-instructions");
        Add("0x11", "call_indirect", "Control", "0x11 y:typeidx x:tableidx", "[t1* i32] -> [t2*]", "Indirect function call via table lookup with runtime signature check.", "Pops i32 elemIdx, reads table[x][elemIdx], verifies type == types[y], calls fn.", "Out-of-bounds table index, null funcref, signature mismatch.", "m3_exec.h op_CallIndirect checks table bounds, non-null IM3Function, type equality, then calls.", "binary-instructions.html#control-instructions");

        // Parametric
        Add("0x1A", "drop", "Parametric", "0x1A", "[t] -> []", "Discards top operand from the value stack.", "Pops 1 value and ignores it.", "None.", "m3_compile.c simply pops compiler typeStack (zero runtime instructions emitted!).", "binary-instructions.html#parametric-instructions");
        Add("0x1B", "select", "Parametric", "0x1B", "[t t i32] -> [t]", "Ternary value selector.", "Pops i32 c, val2, val1; pushes val1 if c != 0 else val2.", "None.", "m3_compile.c emits op_Select_*_rss/srs/ssr/sss based on register/slot allocation.", "binary-instructions.html#parametric-instructions");

        // Variable
        Add("0x20", "local.get", "Variable", "0x20 x:localidx (ULEB128)", "[] -> [t]", "Pushes value of local variable (or parameter) x onto stack.", "Reads frame.locals[x] and pushes onto operand stack.", "None.", "m3_compile.c zero-copy pushes local's M3 slot onto wasmStack (emits op_CopySlot only on overwrite).", "binary-instructions.html#variable-instructions");
        Add("0x21", "local.set", "Variable", "0x21 x:localidx (ULEB128)", "[t] -> []", "Pops top value and stores it into local x.", "Pops value v; sets frame.locals[x] = v.", "None.", "m3_compile.c emits op_SetSlot_* (or folds into producer op via d_m3FoldSetLocal).", "binary-instructions.html#variable-instructions");
        Add("0x22", "local.tee", "Variable", "0x22 x:localidx (ULEB128)", "[t] -> [t]", "Stores top value into local x while keeping it on the stack.", "Peeks top value v; sets frame.locals[x] = v without popping.", "None.", "m3_compile.c updates local slot like local.set and leaves slot/register live on wasmStack.", "binary-instructions.html#variable-instructions");
        Add("0x23", "global.get", "Variable", "0x23 x:globalidx (ULEB128)", "[] -> [t]", "Reads module global variable x (e.g. __stack_pointer) onto stack.", "Pushes store.globals[x].value.", "None.", "m3_compile.c emits op_GetGlobal_s32/_s64 or register variant pointing directly at M3Global*.", "binary-instructions.html#variable-instructions");
        Add("0x24", "global.set", "Variable", "0x24 x:globalidx (ULEB128)", "[t] -> []", "Writes top stack value into mutable global x.", "Pops v; sets store.globals[x].value = v.", "None.", "m3_compile.c emits op_SetGlobal_i32/_i64/_f32/_f64 with M3Global* immediate.", "binary-instructions.html#variable-instructions");

        // Memory
        Add("0x28", "i32.load", "Memory", "0x28 align:u32 offset:u32", "[i32] -> [i32]", "Loads 4-byte little-endian i32 from linear memory[ea].", "ea = (u64)addr + offset; checks ea + 4 <= mem.length; pushes LE i32.", "Out-of-bounds memory access.", "m3_exec.h op_i32_Load_i32 checks d_m3MemRangeOk(ea, 4, mem) and reads *(i32*)(data + ea).", "binary-instructions.html#memory-instructions");
        Add("0x29", "i64.load", "Memory", "0x29 align:u32 offset:u32", "[i32] -> [i64]", "Loads 8-byte little-endian i64 from linear memory.", "ea = (u64)addr + offset; checks ea + 8 <= mem.length; pushes LE i64.", "Out-of-bounds memory access.", "m3_exec.h op_i64_Load_i64 checks bounds and loads 64-bit word into _r0 or slot.", "binary-instructions.html#memory-instructions");
        Add("0x2A", "f32.load", "Memory", "0x2A align:u32 offset:u32", "[i32] -> [f32]", "Loads 4-byte IEEE-754 f32 from linear memory.", "ea = (u64)addr + offset; reads 4 bytes as f32.", "Out-of-bounds memory access.", "m3_exec.h op_f32_Load_f32 loads 32-bit float into _fp0 or slot.", "binary-instructions.html#memory-instructions");
        Add("0x2B", "f64.load", "Memory", "0x2B align:u32 offset:u32", "[i32] -> [f64]", "Loads 8-byte IEEE-754 f64 from linear memory.", "ea = (u64)addr + offset; reads 8 bytes as f64.", "Out-of-bounds memory access.", "m3_exec.h op_f64_Load_f64 loads 64-bit double into _fp0 or slot.", "binary-instructions.html#memory-instructions");
        Add("0x2C", "i32.load8_s", "Memory", "0x2C align:u32 offset:u32", "[i32] -> [i32]", "Loads 1 byte and sign-extends to i32.", "ea = addr + offset; pushes (i32)(i8)mem[ea].", "Out-of-bounds memory access.", "m3_exec.h op_i32_Load_i8 reads int8_t and sign-extends to m3reg_t.", "binary-instructions.html#memory-instructions");
        Add("0x2D", "i32.load8_u", "Memory", "0x2D align:u32 offset:u32", "[i32] -> [i32]", "Loads 1 byte and zero-extends to i32.", "ea = addr + offset; pushes (i32)(u8)mem[ea].", "Out-of-bounds memory access.", "m3_exec.h op_i32_Load_u8 reads uint8_t and zero-extends.", "binary-instructions.html#memory-instructions");
        Add("0x2E", "i32.load16_s", "Memory", "0x2E align:u32 offset:u32", "[i32] -> [i32]", "Loads 2 bytes LE and sign-extends to i32.", "ea = addr + offset; pushes (i32)(i16)mem16[ea].", "Out-of-bounds memory access.", "m3_exec.h op_i32_Load_i16 reads int16_t.", "binary-instructions.html#memory-instructions");
        Add("0x2F", "i32.load16_u", "Memory", "0x2F align:u32 offset:u32", "[i32] -> [i32]", "Loads 2 bytes LE and zero-extends to i32.", "ea = addr + offset; pushes (i32)(u16)mem16[ea].", "Out-of-bounds memory access.", "m3_exec.h op_i32_Load_u16 reads uint16_t.", "binary-instructions.html#memory-instructions");
        Add("0x36", "i32.store", "Memory", "0x36 align:u32 offset:u32", "[i32 i32] -> []", "Stores 4-byte little-endian i32 to linear memory[ea].", "Pops val, addr; ea = addr + offset; mem[ea..ea+4] = LE32(val).", "Out-of-bounds memory access.", "m3_exec.h op_i32_Store_i32_* checks bounds and stores 32-bit value.", "binary-instructions.html#memory-instructions");
        Add("0x37", "i64.store", "Memory", "0x37 align:u32 offset:u32", "[i32 i64] -> []", "Stores 8-byte little-endian i64 to linear memory.", "Pops val, addr; stores 8 bytes LE.", "Out-of-bounds memory access.", "m3_exec.h op_i64_Store_i64_* stores 64-bit word.", "binary-instructions.html#memory-instructions");
        Add("0x3A", "i32.store8", "Memory", "0x3A align:u32 offset:u32", "[i32 i32] -> []", "Stores low 8 bits of i32 to linear memory[ea].", "Pops val, addr; mem[addr + offset] = (u8)val.", "Out-of-bounds memory access.", "m3_exec.h op_i32_Store_u8_* writes 1 byte to linear memory.", "binary-instructions.html#memory-instructions");
        Add("0x3B", "i32.store16", "Memory", "0x3B align:u32 offset:u32", "[i32 i32] -> []", "Stores low 16 bits of i32 LE to linear memory.", "Pops val, addr; mem16[addr + offset] = (u16)val.", "Out-of-bounds memory access.", "m3_exec.h op_i32_Store_u16_* writes 2 bytes.", "binary-instructions.html#memory-instructions");
        Add("0x3F", "memory.size", "Memory", "0x3F memidx:u32 (0x00)", "[] -> [i32]", "Returns current linear memory size in 64KiB pages.", "Pushes memory.numPages.", "None.", "m3_exec.h op_MemSize sets _r0 = memory->numPages.", "binary-instructions.html#memory-instructions");
        Add("0x40", "memory.grow", "Memory", "0x40 memidx:u32 (0x00)", "[i32] -> [i32]", "Grows linear memory by delta pages; returns previous page count or -1.", "Pops delta; attempts page allocation; pushes old size or -1.", "None (returns -1 on failure).", "m3_exec.h op_MemGrow calls ResizeMemory() and updates M3MemoryHeader.", "binary-instructions.html#memory-instructions");

        // Constants
        Add("0x41", "i32.const", "Numeric (Const)", "0x41 n:i32 (SLEB128)", "[] -> [i32]", "Pushes a 32-bit signed-LEB128 integer constant.", "Pushes i32 value n onto operand stack.", "None.", "m3_compile.c stores small/repeated constants in constant table slots or emits op_Const32 into _r0/slot.", "binary-instructions.html#numeric-instructions");
        Add("0x42", "i64.const", "Numeric (Const)", "0x42 n:i64 (SLEB128)", "[] -> [i64]", "Pushes a 64-bit signed-LEB128 integer constant.", "Pushes i64 value n onto operand stack.", "None.", "m3_compile.c allocates constant slot or emits op_Const64.", "binary-instructions.html#numeric-instructions");
        Add("0x43", "f32.const", "Numeric (Const)", "0x43 z:f32 (4 bytes IEEE754)", "[] -> [f32]", "Pushes 32-bit float constant.", "Pushes f32 z.", "None.", "m3_compile.c emits constant slot or op_Const32 into _fp0.", "binary-instructions.html#numeric-instructions");
        Add("0x44", "f64.const", "Numeric (Const)", "0x44 z:f64 (8 bytes IEEE754)", "[] -> [f64]", "Pushes 64-bit double constant.", "Pushes f64 z.", "None.", "m3_compile.c emits constant slot or op_Const64 into _fp0.", "binary-instructions.html#numeric-instructions");

        // i32 Comparison & Arithmetic
        Add("0x45", "i32.eqz", "Numeric (i32)", "0x45", "[i32] -> [i32]", "Returns 1 if i32 == 0, else 0.", "Pops a; pushes (a == 0 ? 1 : 0).", "None.", "m3_exec.h op_i32_EqualToZero_r/_s.", "binary-instructions.html#numeric-instructions");
        Add("0x46", "i32.eq", "Numeric (i32)", "0x46", "[i32 i32] -> [i32]", "Signed/unsigned i32 equality comparison.", "Pops b, a; pushes (a == b ? 1 : 0).", "None.", "m3_exec.h op_i32_Equal_rs/_ss.", "binary-instructions.html#numeric-instructions");
        Add("0x47", "i32.ne", "Numeric (i32)", "0x47", "[i32 i32] -> [i32]", "i32 inequality comparison.", "Pops b, a; pushes (a != b ? 1 : 0).", "None.", "m3_exec.h op_i32_NotEqual_rs/_ss.", "binary-instructions.html#numeric-instructions");
        Add("0x48", "i32.lt_s", "Numeric (i32)", "0x48", "[i32 i32] -> [i32]", "Signed i32 less-than.", "Pops b, a; pushes ((i32)a < (i32)b ? 1 : 0).", "None.", "m3_exec.h op_i32_LessThan_rs/_sr/_ss.", "binary-instructions.html#numeric-instructions");
        Add("0x49", "i32.lt_u", "Numeric (i32)", "0x49", "[i32 i32] -> [i32]", "Unsigned i32 less-than.", "Pops b, a; pushes ((u32)a < (u32)b ? 1 : 0).", "None.", "m3_exec.h op_u32_LessThan_*.", "binary-instructions.html#numeric-instructions");
        Add("0x4A", "i32.gt_s", "Numeric (i32)", "0x4A", "[i32 i32] -> [i32]", "Signed i32 greater-than.", "Pops b, a; pushes ((i32)a > (i32)b ? 1 : 0).", "None.", "m3_exec.h op_i32_GreaterThan_*.", "binary-instructions.html#numeric-instructions");
        Add("0x4B", "i32.gt_u", "Numeric (i32)", "0x4B", "[i32 i32] -> [i32]", "Unsigned i32 greater-than.", "Pops b, a; pushes ((u32)a > (u32)b ? 1 : 0).", "None.", "m3_exec.h op_u32_GreaterThan_*.", "binary-instructions.html#numeric-instructions");
        Add("0x4C", "i32.le_s", "Numeric (i32)", "0x4C", "[i32 i32] -> [i32]", "Signed i32 less-or-equal.", "Pops b, a; pushes ((i32)a <= (i32)b ? 1 : 0).", "None.", "m3_exec.h op_i32_LessThanOrEqual_*.", "binary-instructions.html#numeric-instructions");
        Add("0x4D", "i32.le_u", "Numeric (i32)", "0x4D", "[i32 i32] -> [i32]", "Unsigned i32 less-or-equal.", "Pops b, a; pushes ((u32)a <= (u32)b ? 1 : 0).", "None.", "m3_exec.h op_u32_LessThanOrEqual_*.", "binary-instructions.html#numeric-instructions");
        Add("0x4E", "i32.ge_s", "Numeric (i32)", "0x4E", "[i32 i32] -> [i32]", "Signed i32 greater-or-equal.", "Pops b, a; pushes ((i32)a >= (i32)b ? 1 : 0).", "None.", "m3_exec.h op_i32_GreaterThanOrEqual_*.", "binary-instructions.html#numeric-instructions");
        Add("0x4F", "i32.ge_u", "Numeric (i32)", "0x4F", "[i32 i32] -> [i32]", "Unsigned i32 greater-or-equal.", "Pops b, a; pushes ((u32)a >= (u32)b ? 1 : 0).", "None.", "m3_exec.h op_u32_GreaterThanOrEqual_*.", "binary-instructions.html#numeric-instructions");

        Add("0x67", "i32.clz", "Numeric (i32)", "0x67", "[i32] -> [i32]", "Count leading zero bits (0..32).", "Pops a; pushes count of leading 0s.", "None.", "m3_exec.h op_u32_Clz_r/_s.", "binary-instructions.html#numeric-instructions");
        Add("0x68", "i32.ctz", "Numeric (i32)", "0x68", "[i32] -> [i32]", "Count trailing zero bits (0..32).", "Pops a; pushes count of trailing 0s.", "None.", "m3_exec.h op_u32_Ctz_r/_s.", "binary-instructions.html#numeric-instructions");
        Add("0x69", "i32.popcnt", "Numeric (i32)", "0x69", "[i32] -> [i32]", "Population count (number of 1 bits).", "Pops a; pushes Hamming weight.", "None.", "m3_exec.h op_u32_Popcnt_r/_s.", "binary-instructions.html#numeric-instructions");
        Add("0x6A", "i32.add", "Numeric (i32)", "0x6A", "[i32 i32] -> [i32]", "2's complement 32-bit integer addition (wraps mod 2^32).", "Pops b, a; pushes (a + b) mod 2^32.", "None.", "m3_exec.h op_i32_Add_rs/_ss writes result into _r0 (or folded local slot).", "binary-instructions.html#numeric-instructions");
        Add("0x6B", "i32.sub", "Numeric (i32)", "0x6B", "[i32 i32] -> [i32]", "2's complement 32-bit integer subtraction (wraps mod 2^32).", "Pops b, a; pushes (a - b) mod 2^32.", "None.", "m3_exec.h op_i32_Subtract_rs/_sr/_ss.", "binary-instructions.html#numeric-instructions");
        Add("0x6C", "i32.mul", "Numeric (i32)", "0x6C", "[i32 i32] -> [i32]", "32-bit integer multiplication (wraps mod 2^32).", "Pops b, a; pushes (a * b) mod 2^32.", "None.", "m3_exec.h op_i32_Multiply_rs/_ss.", "binary-instructions.html#numeric-instructions");
        Add("0x6D", "i32.div_s", "Numeric (i32)", "0x6D", "[i32 i32] -> [i32]", "Signed 32-bit division truncating toward zero.", "Pops b, a; pushes trunc((i32)a / (i32)b).", "Integer divide by zero; integer overflow (INT32_MIN / -1).", "m3_exec.h op_i32_Divide_* traps on divisor==0 or INT32_MIN/-1.", "binary-instructions.html#numeric-instructions");
        Add("0x6E", "i32.div_u", "Numeric (i32)", "0x6E", "[i32 i32] -> [i32]", "Unsigned 32-bit division.", "Pops b, a; pushes (u32)a / (u32)b.", "Integer divide by zero.", "m3_exec.h op_u32_Divide_* checks b == 0.", "binary-instructions.html#numeric-instructions");
        Add("0x6F", "i32.rem_s", "Numeric (i32)", "0x6F", "[i32 i32] -> [i32]", "Signed 32-bit remainder.", "Pops b, a; pushes (i32)a % (i32)b.", "Integer divide by zero.", "m3_exec.h op_i32_Remainder_*.", "binary-instructions.html#numeric-instructions");
        Add("0x70", "i32.rem_u", "Numeric (i32)", "0x70", "[i32 i32] -> [i32]", "Unsigned 32-bit remainder.", "Pops b, a; pushes (u32)a % (u32)b.", "Integer divide by zero.", "m3_exec.h op_u32_Remainder_*.", "binary-instructions.html#numeric-instructions");
        Add("0x71", "i32.and", "Numeric (i32)", "0x71", "[i32 i32] -> [i32]", "Bitwise AND.", "Pops b, a; pushes a & b.", "None.", "m3_exec.h op_u32_And_rs/_ss.", "binary-instructions.html#numeric-instructions");
        Add("0x72", "i32.or", "Numeric (i32)", "0x72", "[i32 i32] -> [i32]", "Bitwise OR.", "Pops b, a; pushes a | b.", "None.", "m3_exec.h op_u32_Or_rs/_ss.", "binary-instructions.html#numeric-instructions");
        Add("0x73", "i32.xor", "Numeric (i32)", "0x73", "[i32 i32] -> [i32]", "Bitwise XOR.", "Pops b, a; pushes a ^ b.", "None.", "m3_exec.h op_u32_Xor_rs/_ss.", "binary-instructions.html#numeric-instructions");
        Add("0x74", "i32.shl", "Numeric (i32)", "0x74", "[i32 i32] -> [i32]", "Shift left by (b & 31).", "Pops b, a; pushes a << (b mod 32).", "None.", "m3_exec.h op_u32_ShiftLeft_*.", "binary-instructions.html#numeric-instructions");
        Add("0x75", "i32.shr_s", "Numeric (i32)", "0x75", "[i32 i32] -> [i32]", "Arithmetic shift right by (b & 31).", "Pops b, a; pushes (i32)a >> (b mod 32).", "None.", "m3_exec.h op_i32_ShiftRight_*.", "binary-instructions.html#numeric-instructions");
        Add("0x76", "i32.shr_u", "Numeric (i32)", "0x76", "[i32 i32] -> [i32]", "Logical shift right by (b & 31).", "Pops b, a; pushes (u32)a >> (b mod 32).", "None.", "m3_exec.h op_u32_ShiftRight_*.", "binary-instructions.html#numeric-instructions");
        Add("0x77", "i32.rotl", "Numeric (i32)", "0x77", "[i32 i32] -> [i32]", "Rotate left by (b & 31).", "Pops b, a; pushes rotl32(a, b & 31).", "None.", "m3_exec.h op_u32_Rotl_*.", "binary-instructions.html#numeric-instructions");
        Add("0x78", "i32.rotr", "Numeric (i32)", "0x78", "[i32 i32] -> [i32]", "Rotate right by (b & 31).", "Pops b, a; pushes rotr32(a, b & 31).", "None.", "m3_exec.h op_u32_Rotr_*.", "binary-instructions.html#numeric-instructions");

        // i64 highlights
        Add("0x50", "i64.eqz", "Numeric (i64)", "0x50", "[i64] -> [i32]", "Returns 1 if i64 == 0, else 0.", "Pops i64 a; pushes i32 (a == 0).", "None.", "m3_exec.h op_i64_EqualToZero_*.", "binary-instructions.html#numeric-instructions");
        Add("0x7C", "i64.add", "Numeric (i64)", "0x7C", "[i64 i64] -> [i64]", "64-bit integer addition mod 2^64.", "Pops b, a; pushes (a + b) mod 2^64.", "None.", "m3_exec.h op_i64_Add_*.", "binary-instructions.html#numeric-instructions");
        Add("0x7D", "i64.sub", "Numeric (i64)", "0x7D", "[i64 i64] -> [i64]", "64-bit integer subtraction mod 2^64.", "Pops b, a; pushes (a - b) mod 2^64.", "None.", "m3_exec.h op_i64_Subtract_*.", "binary-instructions.html#numeric-instructions");
        Add("0x7E", "i64.mul", "Numeric (i64)", "0x7E", "[i64 i64] -> [i64]", "64-bit integer multiplication mod 2^64.", "Pops b, a; pushes (a * b) mod 2^64.", "None.", "m3_exec.h op_i64_Multiply_*.", "binary-instructions.html#numeric-instructions");
        Add("0xA7", "i32.wrap_i64", "Conversion", "0xA7", "[i64] -> [i32]", "Wraps 64-bit integer to lower 32 bits.", "Pops i64 a; pushes (i32)(a & 0xFFFFFFFF).", "None.", "m3_exec.h op_i32_Wrap_i64_*.", "binary-instructions.html#numeric-instructions");
        Add("0xAC", "i64.extend_i32_s", "Conversion", "0xAC", "[i32] -> [i64]", "Sign-extends i32 to i64.", "Pops i32 a; pushes (i64)a.", "None.", "m3_exec.h op_i64_Extend_i32_*.", "binary-instructions.html#numeric-instructions");
        Add("0xAD", "i64.extend_i32_u", "Conversion", "0xAD", "[i32] -> [i64]", "Zero-extends i32 to i64.", "Pops i32 a; pushes (u64)(u32)a.", "None.", "m3_exec.h op_i64_Extend_u32_*.", "binary-instructions.html#numeric-instructions");
        Add("0xC0", "i32.extend8_s", "Conversion", "0xC0", "[i32] -> [i32]", "Sign-extends low 8 bits of i32.", "Pops a; pushes (i32)(i8)a.", "None.", "m3_exec.h op_i32_Extend8_s_*.", "binary-instructions.html#numeric-instructions");
        Add("0xC1", "i32.extend16_s", "Conversion", "0xC1", "[i32] -> [i32]", "Sign-extends low 16 bits of i32.", "Pops a; pushes (i32)(i16)a.", "None.", "m3_exec.h op_i32_Extend16_s_*.", "binary-instructions.html#numeric-instructions");
        Add("0xFC0A", "memory.copy", "Memory (Bulk)", "0xFC 0x0A dstmem:u32 srcmem:u32", "[i32 i32 i32] -> []", "Copies n bytes within linear memory (memmove semantics).", "Pops n, src, dst; copies mem[src..src+n) to mem[dst..dst+n).", "Out-of-bounds memory access.", "m3_exec.h op_MemCopy validates both ranges and calls memmove.", "binary-instructions.html#memory-instructions");
        Add("0xFC0B", "memory.fill", "Memory (Bulk)", "0xFC 0x0B mem:u32", "[i32 i32 i32] -> []", "Fills n bytes in linear memory with byte val.", "Pops n, val, dst; sets mem[dst..dst+n) = (u8)val.", "Out-of-bounds memory access.", "m3_exec.h op_MemFill validates range and calls memset.", "binary-instructions.html#memory-instructions");

        // Automatically fill any remaining standard Wasm 1.0 opcodes from WasmBinaryInspector.OpcodeNames
        var existing = new HashSet<string>(list.Select(x => x.Mnemonic), StringComparer.OrdinalIgnoreCase);
        foreach (var kv in WasmBinaryInspector.OpcodeNames)
        {
            if (existing.Contains(kv.Value)) continue;
            string hex = $"0x{kv.Key:X2}";
            string mn = kv.Value;
            string cat = mn.StartsWith("f32.") ? "Numeric (f32)"
                : mn.StartsWith("f64.") ? "Numeric (f64)"
                : mn.StartsWith("i64.") ? "Numeric (i64)"
                : mn.StartsWith("i32.") ? "Numeric (i32)"
                : "Core";
            Add(hex, mn, cat, hex, "Per W3C spec", $"WebAssembly core instruction `{mn}`.", $"Executes `{mn}` according to W3C WebAssembly Core Specification semantics.", "See W3C spec trap rules.", $"m3_compile.c dispatches `{mn}` via c_operations[{hex}] to m3_exec.h threaded operation.", "binary-instructions.html#instructions");
        }

        return list;
    }
}
