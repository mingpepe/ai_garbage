using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using WasmIde.Interop;

namespace WasmIde.Services;

public sealed class Wasm3DebugSessionService : IDisposable
{
    private readonly WasmCompilerService _compiler;
    private readonly HardwareRegisterService _registers;
    private readonly WasmSpecService _spec;

    private readonly BlockingCollection<(Func<object?> Work, TaskCompletionSource<object?> Tcs)> _queue = new();
    private readonly Thread _workerThread;

    // Keep native callback delegates alive for the lifetime of the service
    private readonly Wasm3Native.ReadRegisterCallback _readRegDelegate;
    private readonly Wasm3Native.WriteRegisterCallback _writeRegDelegate;
    private readonly Wasm3Native.ConsoleLogCallback _consoleDelegate;

    private CompilationResult? _currentCompilation;
    private byte[] _lastMemorySnapshot = Array.Empty<byte>();
    private readonly HashSet<int> _cLineBreakpoints = new();
    private readonly HashSet<int> _wasmOffsetBreakpoints = new();
    private string _entryFunction = "main";
    private string _lastSourceCode = "";
    private string _lastOptLevel = "O0";

    public Wasm3DebugSessionService(
        WasmCompilerService compiler,
        HardwareRegisterService registers,
        WasmSpecService spec)
    {
        _compiler = compiler;
        _registers = registers;
        _spec = spec;

        _readRegDelegate = OnReadRegister;
        _writeRegDelegate = OnWriteRegister;
        _consoleDelegate = OnConsoleLog;

        _workerThread = new Thread(WorkerLoop)
        {
            IsBackground = true,
            Name = "Wasm3FiberDebuggerThread"
        };
        _workerThread.Start();
    }

    private void WorkerLoop()
    {
        foreach (var (work, tcs) in _queue.GetConsumingEnumerable())
        {
            try
            {
                tcs.SetResult(work());
            }
            catch (Exception ex)
            {
                tcs.SetException(ex);
            }
        }
    }

    private Task<T> RunOnDebuggerThread<T>(Func<T> func)
    {
        var tcs = new TaskCompletionSource<object?>(TaskCreationOptions.RunContinuationsAsynchronously);
        _queue.Add((() => func(), tcs));
        return tcs.Task.ContinueWith(t => (T)t.Result!, TaskContinuationOptions.ExecuteSynchronously);
    }

    private byte OnReadRegister(byte address) => _registers.ReadRegister(address);

    private void OnWriteRegister(byte address, byte data) => _registers.WriteRegister(address, data);

    private void OnConsoleLog(int kind, int arg0, IntPtr textPtr)
    {
        string? txt = textPtr != IntPtr.Zero ? Marshal.PtrToStringUTF8(textPtr) : null;
        _registers.HandleWasmConsole(kind, arg0, txt);
    }

    public async Task<object> CompileAndLoadAsync(string cSource, string optLevel = "O0", string? entryFunction = null)
    {
        var comp = await _compiler.CompileCAsync(cSource, optLevel);
        if (!comp.Success || comp.WasmBytes == null)
        {
            _registers.LogSystem("ERROR", comp.Error ?? "Compilation failed.");
            return new
            {
                compiled = false,
                error = comp.Error,
                compilerOutput = comp.CompilerOutput,
                state = BuildEmptyState()
            };
        }

        _lastSourceCode = cSource;
        _lastOptLevel = optLevel;
        _currentCompilation = comp;
        _entryFunction = string.IsNullOrWhiteSpace(entryFunction) ? comp.SuggestedEntryFunction : entryFunction;

        return await RunOnDebuggerThread(() =>
        {
            _registers.ClearRuntimeLogsOnly();
            _registers.LogSystem("COMPILE", comp.CompilerOutput);

            var errBuf = new byte[512];
            int initRc = Wasm3Native.w3dbg_InitSession(
                comp.WasmBytes,
                (uint)comp.WasmBytes.Length,
                _readRegDelegate,
                _writeRegDelegate,
                _consoleDelegate,
                errBuf,
                (uint)errBuf.Length);

            if (initRc != 0)
            {
                string err = Encoding.UTF8.GetString(errBuf).TrimEnd('\0');
                _registers.LogSystem("ERROR", $"Wasm3 init failed: {err}");
                return (object)new
                {
                    compiled = false,
                    error = err,
                    compilerOutput = comp.CompilerOutput,
                    state = BuildEmptyState()
                };
            }

            _registers.BeginStepDelta();
            _registers.SetCurrentStep(0);

            int startRc = Wasm3Native.w3dbg_StartFunction(_entryFunction, 0, null, errBuf, (uint)errBuf.Length);
            if (startRc < 0)
            {
                string err = Encoding.UTF8.GetString(errBuf).TrimEnd('\0');
                _registers.LogSystem("ERROR", $"Wasm3 start '{_entryFunction}' failed: {err}");
                return (object)new
                {
                    compiled = false,
                    error = err,
                    compilerOutput = comp.CompilerOutput,
                    state = BuildEmptyState()
                };
            }

            CaptureInitialMemoryBaseline();

            // If entry is at function prologue before first C line, advance to prologue_end when in O0
            // Keep raw Wasm start at instruction 0 so user sees the true first Wasm opcode too!
            _registers.LogSystem("INFO", $"Loaded {comp.WasmBytes.Length}B Wasm into Wasm3. Entry: '{_entryFunction}'. Paused at first instruction.");

            return (object)new
            {
                compiled = true,
                error = (string?)null,
                compilerOutput = comp.CompilerOutput,
                entryFunction = _entryFunction,
                parsedWasm = comp.ParsedWasm,
                lineEntries = comp.LineEntries,
                subprograms = comp.Subprograms,
                m3Internals = ReadM3Internals(),
                state = BuildStateLocked()
            };
        });
    }

    public Task<object> ResetExecutionAsync()
    {
        return RunOnDebuggerThread(() =>
        {
            if (_currentCompilation?.WasmBytes == null)
                return (object)new { ok = false, error = "No compiled Wasm module loaded." };

            _registers.ClearRuntimeLogsOnly();
            var errBuf = new byte[512];
            int initRc = Wasm3Native.w3dbg_InitSession(
                _currentCompilation.WasmBytes,
                (uint)_currentCompilation.WasmBytes.Length,
                _readRegDelegate,
                _writeRegDelegate,
                _consoleDelegate,
                errBuf,
                (uint)errBuf.Length);

            if (initRc != 0)
            {
                string err = Encoding.UTF8.GetString(errBuf).TrimEnd('\0');
                return (object)new { ok = false, error = err };
            }

            _registers.BeginStepDelta();
            _registers.SetCurrentStep(0);
            Wasm3Native.w3dbg_StartFunction(_entryFunction, 0, null, errBuf, (uint)errBuf.Length);
            CaptureInitialMemoryBaseline();
            _registers.LogSystem("INFO", $"Execution reset to entry '{_entryFunction}'.");

            return (object)new
            {
                ok = true,
                m3Internals = ReadM3Internals(),
                state = BuildStateLocked()
            };
        });
    }

    public Task<object> StepWasmAsync()
    {
        return RunOnDebuggerThread(() =>
        {
            if (_currentCompilation == null) return (object)BuildEmptyState();
            _registers.BeginStepDelta();
            Wasm3Native.w3dbg_StepNext();
            return (object)BuildStateLocked();
        });
    }

    public Task<object> StepOverWasmAsync()
    {
        return RunOnDebuggerThread(() =>
        {
            if (_currentCompilation?.ParsedWasm == null) return (object)BuildEmptyState();
            _registers.BeginStepDelta();

            Wasm3Native.w3dbg_GetSnapshot(out var snap);
            if (snap.Status != Wasm3Native.StatusPaused) return (object)BuildStateLocked();

            // If current instruction is call (0x10) or call_indirect (0x11), run until we return to same/lower callDepth
            if (snap.Opcode == 0x10 || snap.Opcode == 0x11)
            {
                var instrs = _currentCompilation.ParsedWasm.Instructions;
                int idx = instrs.FindIndex(i => i.FileOffset == (int)snap.WasmByteOffset);
                if (idx >= 0 && idx + 1 < instrs.Count && instrs[idx + 1].FuncIndex == instrs[idx].FuncIndex)
                {
                    uint nextOffset = (uint)instrs[idx + 1].FileOffset;
                    Wasm3Native.w3dbg_RunUntil(new[] { nextOffset }, 1, 100000, snap.CallDepth);
                    return (object)BuildStateLocked();
                }
            }

            Wasm3Native.w3dbg_StepNext();
            return (object)BuildStateLocked();
        });
    }

    public Task<object> StepCLineAsync(bool stepOver)
    {
        return RunOnDebuggerThread(() =>
        {
            if (_currentCompilation?.ParsedWasm == null) return (object)BuildEmptyState();
            _registers.BeginStepDelta();

            Wasm3Native.w3dbg_GetSnapshot(out var snap);
            if (snap.Status != Wasm3Native.StatusPaused) return (object)BuildStateLocked();

            var instrs = _currentCompilation.ParsedWasm.Instructions;
            var curInstr = instrs.FirstOrDefault(i => i.FileOffset == (int)snap.WasmByteOffset);
            int? currentCLine = curInstr?.CLine;

            // Collect candidate Wasm instruction offsets that represent the start of a different C line (or any breakpoint)
            var stopOffsets = new HashSet<uint>();

            // Build set of offsets where C line changes from its predecessor or is marked prologue_end
            int? prevLine = null;
            int prevFunc = -1;
            foreach (var instr in instrs)
            {
                if (instr.FuncIndex != prevFunc)
                {
                    prevLine = null;
                    prevFunc = instr.FuncIndex;
                }

                if (instr.CLine.HasValue && instr.CLine.Value != currentCLine)
                {
                    if (instr.IsPrologueEnd || prevLine != instr.CLine)
                    {
                        stopOffsets.Add((uint)instr.FileOffset);
                    }
                }
                prevLine = instr.CLine;
            }

            foreach (var bp in _wasmOffsetBreakpoints) stopOffsets.Add((uint)bp);
            foreach (var cBp in _cLineBreakpoints)
            {
                var first = instrs.FirstOrDefault(i => i.CLine == cBp);
                if (first != null) stopOffsets.Add((uint)first.FileOffset);
            }

            // Never immediately stop on the current instruction offset
            stopOffsets.Remove(snap.WasmByteOffset);

            uint maxDepth = stepOver ? snap.CallDepth : uint.MaxValue;
            if (stopOffsets.Count > 0)
            {
                Wasm3Native.w3dbg_RunUntil(stopOffsets.ToArray(), (uint)stopOffsets.Count, 100000, maxDepth);
            }
            else
            {
                Wasm3Native.w3dbg_StepNext();
            }

            return (object)BuildStateLocked();
        });
    }

    public Task<object> StepOutAsync()
    {
        return RunOnDebuggerThread(() =>
        {
            if (_currentCompilation?.ParsedWasm == null) return (object)BuildEmptyState();
            _registers.BeginStepDelta();

            Wasm3Native.w3dbg_GetSnapshot(out var snap);
            if (snap.Status != Wasm3Native.StatusPaused) return (object)BuildStateLocked();

            if (snap.CallDepth <= 1)
            {
                // Run to completion or breakpoint
                var bps = CollectBreakpointOffsets();
                Wasm3Native.w3dbg_RunUntil(bps.Length > 0 ? bps : null, (uint)bps.Length, 200000, uint.MaxValue);
            }
            else
            {
                var allOffsets = _currentCompilation.ParsedWasm.Instructions.Select(i => (uint)i.FileOffset).ToArray();
                Wasm3Native.w3dbg_RunUntil(allOffsets, (uint)allOffsets.Length, 100000, snap.CallDepth - 1);
            }

            return (object)BuildStateLocked();
        });
    }

    public Task<object> ContinueAsync()
    {
        return RunOnDebuggerThread(() =>
        {
            if (_currentCompilation?.ParsedWasm == null) return (object)BuildEmptyState();
            _registers.BeginStepDelta();

            Wasm3Native.w3dbg_GetSnapshot(out var snap);
            if (snap.Status != Wasm3Native.StatusPaused) return (object)BuildStateLocked();

            // Advance 1 step past current breakpoint first if needed
            var bps = CollectBreakpointOffsets();
            if (bps.Contains(snap.WasmByteOffset))
            {
                int st = Wasm3Native.w3dbg_StepNext();
                if (st != Wasm3Native.StatusPaused) return (object)BuildStateLocked();
            }

            Wasm3Native.w3dbg_RunUntil(bps.Length > 0 ? bps : null, (uint)bps.Length, 250000, uint.MaxValue);
            return (object)BuildStateLocked();
        });
    }

    public Task<object> SetBreakpointsAsync(int[]? cLines, int[]? wasmOffsets)
    {
        return RunOnDebuggerThread(() =>
        {
            _cLineBreakpoints.Clear();
            if (cLines != null)
            {
                foreach (var l in cLines) _cLineBreakpoints.Add(l);
            }

            _wasmOffsetBreakpoints.Clear();
            if (wasmOffsets != null)
            {
                foreach (var o in wasmOffsets) _wasmOffsetBreakpoints.Add(o);
            }

            return (object)new
            {
                cLines = _cLineBreakpoints.OrderBy(x => x).ToArray(),
                wasmOffsets = _wasmOffsetBreakpoints.OrderBy(x => x).ToArray()
            };
        });
    }

    public Task<object> GetStateAsync()
    {
        return RunOnDebuggerThread(() => (object)BuildStateLocked());
    }

    public Task<object> GetMemorySliceAsync(uint offset, uint length)
    {
        return RunOnDebuggerThread(() =>
        {
            uint total = Wasm3Native.w3dbg_GetMemorySize();
            if (total == 0 || offset >= total)
                return (object)new { totalSize = total, offset, bytes = Array.Empty<byte>(), changedOffsets = Array.Empty<int>() };

            uint toRead = Math.Min(length, total - offset);
            var buf = new byte[toRead];
            uint read = Wasm3Native.w3dbg_ReadMemory(offset, buf, toRead);

            var changed = new List<int>();
            for (int i = 0; i < (int)read; i++)
            {
                int abs = (int)(offset + i);
                if (abs < _lastMemorySnapshot.Length && _lastMemorySnapshot[abs] != buf[i])
                    changed.Add(abs);
            }

            return (object)new
            {
                totalSize = total,
                offset,
                bytes = buf,
                changedOffsets = changed
            };
        });
    }

    private uint[] CollectBreakpointOffsets()
    {
        var set = new HashSet<uint>();
        if (_currentCompilation?.ParsedWasm != null)
        {
            var instrs = _currentCompilation.ParsedWasm.Instructions;
            foreach (var cl in _cLineBreakpoints)
            {
                var first = instrs.FirstOrDefault(i => i.CLine == cl);
                if (first != null) set.Add((uint)first.FileOffset);
            }
        }
        foreach (var wo in _wasmOffsetBreakpoints)
            set.Add((uint)wo);
        return set.ToArray();
    }

    private void CaptureInitialMemoryBaseline()
    {
        uint total = Wasm3Native.w3dbg_GetMemorySize();
        if (total == 0)
        {
            _lastMemorySnapshot = Array.Empty<byte>();
            return;
        }
        uint cap = Math.Min(total, 65536u * 4u);
        _lastMemorySnapshot = new byte[cap];
        Wasm3Native.w3dbg_ReadMemory(0, _lastMemorySnapshot, cap);
    }

    private object? ReadM3Internals()
    {
        var buf = new byte[262144];
        int len = Wasm3Native.w3dbg_GetM3InternalsJson(buf, (uint)buf.Length);
        if (len <= 0) return null;
        try
        {
            string json = Encoding.UTF8.GetString(buf, 0, len);
            return JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch
        {
            return null;
        }
    }

    private unsafe object BuildStateLocked()
    {
        if (_currentCompilation == null) return BuildEmptyState();

        Wasm3Native.w3dbg_GetSnapshot(out var snap);
        _registers.SetCurrentStep(snap.StepCount);

        string statusStr = snap.Status switch
        {
            Wasm3Native.StatusPaused => "paused",
            Wasm3Native.StatusCompleted => "completed",
            Wasm3Native.StatusTrap => "trap",
            _ => "idle"
        };

        string funcName = Wasm3Native.ReadFixedString(snap.FuncName, 128);
        string trapMessage = Wasm3Native.ReadFixedString(snap.TrapMessage, 256);
        uint curWasmOffset = snap.WasmByteOffset;

        // Lookup current Wasm instruction & C source line
        var curInstr = _currentCompilation.ParsedWasm?.Instructions
            .FirstOrDefault(i => i.FileOffset == (int)curWasmOffset);

        int? curCLine = curInstr?.CLine;
        int? curCCol = curInstr?.CColumn;
        string opcodeHex = snap.Opcode > 0xFF ? $"0x{snap.Opcode:X4}" : $"0x{snap.Opcode:X2}";
        var curSpec = _spec.Lookup(opcodeHex, curInstr?.Mnemonic);

        // Extract Wasm Locals
        var wasmLocals = new List<object>();
        for (int i = 0; i < (int)snap.NumLocals && i < Wasm3Native.MaxLocals; i++)
        {
            byte t = snap.LocalTypes[i];
            ulong raw = snap.LocalValues[i];
            wasmLocals.Add(new
            {
                index = i,
                type = M3TypeName(t),
                m3Slot = snap.LocalSlots[i],
                storage = snap.LocalSlots[i] >= 60000 ? (snap.LocalSlots[i] == 60002 ? "_fp0" : "_r0") : $"_sp[{snap.LocalSlots[i]}]",
                rawU64 = raw,
                formatted = FormatValue(t, raw)
            });
        }

        // Extract Wasm Operand Stack
        var operandStack = new List<object>();
        for (int i = 0; i < (int)snap.StackDepth && i < Wasm3Native.MaxStack; i++)
        {
            byte t = snap.OperandTypes[i];
            ulong raw = snap.OperandValues[i];
            ushort sl = snap.OperandSlots[i];
            operandStack.Add(new
            {
                depthIndex = i,
                type = M3TypeName(t),
                m3Slot = sl,
                storage = sl == 60000 ? "M3 Reg _r0" : (sl == 60002 ? "M3 Reg _fp0" : $"M3 Slot _sp[{sl}]"),
                rawU64 = raw,
                formatted = FormatValue(t, raw)
            });
        }

        // Extract Wasm Globals
        var wasmGlobals = new List<object>();
        for (int i = 0; i < (int)snap.NumGlobals && i < Wasm3Native.MaxGlobals; i++)
        {
            byte t = snap.GlobalTypes[i];
            ulong raw = snap.GlobalValues[i];
            wasmGlobals.Add(new
            {
                index = i,
                name = i == 0 ? "__stack_pointer" : $"global_{i}",
                type = M3TypeName(t),
                mutable = snap.GlobalMutable[i] != 0,
                rawU64 = raw,
                formatted = FormatValue(t, raw)
            });
        }

        // Extract Raw M3 Slots
        var rawSlots = new List<object>();
        for (int i = 0; i < (int)snap.RawSlotCount && i < Wasm3Native.MaxRawSlots; i++)
        {
            ulong raw = snap.RawSlots[i];
            rawSlots.Add(new
            {
                slot = i,
                hex = $"0x{raw:X16}",
                i32 = unchecked((int)(uint)raw),
                i64 = unchecked((long)raw)
            });
        }

        // Extract Call Stack Frames
        var callStack = new List<object>();
        for (int i = 0; i < (int)snap.CallDepth && i < Wasm3Native.MaxCallDepth; i++)
        {
            uint fIdx = snap.FrameFuncIndices[i];
            uint fOff = snap.FrameWasmOffsets[i];
            int spOff = snap.FrameSpOffsets[i];
            var fnSum = _currentCompilation.ParsedWasm?.Functions.FirstOrDefault(f => f.FuncIndex == (int)fIdx);
            var instrAt = _currentCompilation.ParsedWasm?.Instructions.FirstOrDefault(x => x.FileOffset == (int)fOff);
            callStack.Add(new
            {
                depth = i,
                funcIndex = fIdx,
                funcName = fnSum?.Name ?? $"func_{fIdx}",
                wasmOffset = fOff,
                wasmOffsetHex = $"0x{fOff:X4}",
                cLine = instrAt?.CLine,
                spSlotOffset = spOff,
                isActive = i == (int)snap.CallDepth - 1
            });
        }

        // Read linear memory (up to 512KB) for diff & C stack-frame variable inspection
        uint memTotal = Wasm3Native.w3dbg_GetMemorySize();
        uint memInspectLen = Math.Min(memTotal, 512u * 1024u);
        byte[] memBytes = memInspectLen > 0 ? new byte[memInspectLen] : Array.Empty<byte>();
        if (memInspectLen > 0)
        {
            Wasm3Native.w3dbg_ReadMemory(0, memBytes, memInspectLen);
        }

        var changedMemOffsets = new List<int>();
        for (int i = 0; i < memBytes.Length; i++)
        {
            if (i < _lastMemorySnapshot.Length && _lastMemorySnapshot[i] != memBytes[i])
                changedMemOffsets.Add(i);
        }
        _lastMemorySnapshot = memBytes;

        // Evaluate DWARF C Variables for current function
        var cVariables = EvaluateDwarfVariables(funcName, snap.WasmByteOffset, snap.NumLocals, ref snap, memBytes);

        // Return value if completed
        object? retObj = snap.HasReturnValue != 0
            ? new
            {
                type = M3TypeName(snap.ReturnType),
                raw = snap.ReturnValue,
                formatted = FormatValue(snap.ReturnType, unchecked((ulong)snap.ReturnValue))
            }
            : null;

        return new
        {
            status = statusStr,
            stepCount = snap.StepCount,
            traceId = snap.TraceId,
            funcIndex = snap.FuncIndex,
            funcName,
            wasmOffset = snap.WasmByteOffset,
            wasmOffsetHex = $"0x{snap.WasmByteOffset:X4}",
            codeSectionOffset = curInstr?.CodeSectionOffset,
            opcodeHex,
            mnemonic = curInstr?.Mnemonic ?? string.Empty,
            operands = curInstr?.Operands ?? string.Empty,
            cLine = curCLine,
            cColumn = curCCol,
            trapMessage,
            returnValue = retObj,
            instructionSpec = curSpec,
            wasmLocals,
            operandStack,
            wasmGlobals,
            callStack,
            cVariables,
            wasm3State = new
            {
                pc = $"0x{snap.M3Pc:X16}",
                sp = $"0x{snap.M3Sp:X16}",
                stackOrigin = $"0x{snap.M3StackOrigin:X16}",
                spSlotOffset = snap.M3SpSlotOffset,
                stackSizeBytes = snap.M3StackSize,
                memHeader = $"0x{snap.M3MemHeader:X16}",
                memData = $"0x{snap.M3MemData:X16}",
                memSizeBytes = snap.M3MemSize,
                r0 = snap.M3R0,
                r0Hex = $"0x{unchecked((ulong)snap.M3R0):X16}",
                fp0 = snap.M3Fp0,
                numCodePages = snap.M3NumCodePages,
                numActiveCodePages = snap.M3NumActiveCodePages,
                maxStackSlots = snap.M3MaxStackSlots,
                numLocalBytes = snap.M3NumLocalBytes,
                numConstantBytes = snap.M3NumConstantBytes,
                rawSlots
            },
            memory = new
            {
                totalSize = memTotal,
                changedCount = changedMemOffsets.Count,
                changedOffsets = changedMemOffsets.Take(128).ToArray(),
                stackPointer = wasmGlobals.Count > 0 ? (long)snap.GlobalValues[0] : 0
            },
            hardware = _registers.GetStateSnapshot(),
            breakpoints = new
            {
                cLines = _cLineBreakpoints.OrderBy(x => x).ToArray(),
                wasmOffsets = _wasmOffsetBreakpoints.OrderBy(x => x).ToArray()
            }
        };
    }

    private unsafe List<object> EvaluateDwarfVariables(
        string funcName,
        uint wasmOffset,
        uint numLocals,
        ref Wasm3Native.W3DebugSnapshot snap,
        byte[] mem)
    {
        var result = new List<object>();
        if (_currentCompilation == null) return result;

        var sub = _currentCompilation.Subprograms.FirstOrDefault(s =>
            (wasmOffset >= s.LowFileOffset && wasmOffset <= s.HighFileOffset) ||
            string.Equals(s.Name, funcName, StringComparison.Ordinal) ||
            (funcName == "__original_main" && s.Name == "main"));

        if (sub == null) return result;

        uint? frameBase = null;
        if (sub.FrameBaseLocalIndex.HasValue && sub.FrameBaseLocalIndex.Value < numLocals)
        {
            frameBase = (uint)snap.LocalValues[sub.FrameBaseLocalIndex.Value];
        }

        foreach (var v in sub.Variables)
        {
            string valStr = "<unavailable>";
            string locStr = "";
            string hexStr = "";

            if (v.FbregOffset.HasValue && frameBase.HasValue)
            {
                long addr = (long)frameBase.Value + v.FbregOffset.Value;
                locStr = $"mem[fp{v.FbregOffset.Value:+0;-0;+0}] = 0x{addr:X4}";
                if (addr >= 0 && addr + v.ByteSize <= mem.Length)
                {
                    (valStr, hexStr) = ReadMemTyped(mem, (int)addr, v.ByteSize, v.IsSigned, v.IsFloat);
                }
                else
                {
                    valStr = "<out of frame>";
                }
            }
            else if (v.WasmLocalIndex.HasValue && v.WasmLocalIndex.Value < numLocals)
            {
                int idx = v.WasmLocalIndex.Value;
                ulong raw = snap.LocalValues[idx];
                locStr = $"local[{idx}]";
                valStr = FormatCValue(raw, v.ByteSize, v.IsSigned, v.IsFloat);
                hexStr = $"0x{raw:X}";
            }
            else if (v.GlobalDataAddress.HasValue)
            {
                uint addr = v.GlobalDataAddress.Value;
                locStr = $"mem[0x{addr:X4}]";
                if (addr + v.ByteSize <= mem.Length)
                {
                    (valStr, hexStr) = ReadMemTyped(mem, (int)addr, v.ByteSize, v.IsSigned, v.IsFloat);
                }
            }

            result.Add(new
            {
                name = v.Name,
                type = v.TypeName,
                declLine = v.DeclLine,
                location = locStr,
                value = valStr,
                hex = hexStr
            });
        }

        return result;
    }

    private static (string Value, string Hex) ReadMemTyped(byte[] mem, int addr, int size, bool signed, bool isFloat)
    {
        if (isFloat && size == 4)
        {
            float f = BitConverter.ToSingle(mem, addr);
            uint u = BitConverter.ToUInt32(mem, addr);
            return (f.ToString("G"), $"0x{u:X8}");
        }
        if (isFloat && size == 8)
        {
            double d = BitConverter.ToDouble(mem, addr);
            ulong u = BitConverter.ToUInt64(mem, addr);
            return (d.ToString("G"), $"0x{u:X16}");
        }
        return size switch
        {
            1 => (signed ? ((sbyte)mem[addr]).ToString() : mem[addr].ToString(), $"0x{mem[addr]:X2}"),
            2 => (signed ? BitConverter.ToInt16(mem, addr).ToString() : BitConverter.ToUInt16(mem, addr).ToString(),
                  $"0x{BitConverter.ToUInt16(mem, addr):X4}"),
            4 => (signed ? BitConverter.ToInt32(mem, addr).ToString() : BitConverter.ToUInt32(mem, addr).ToString(),
                  $"0x{BitConverter.ToUInt32(mem, addr):X8}"),
            8 => (signed ? BitConverter.ToInt64(mem, addr).ToString() : BitConverter.ToUInt64(mem, addr).ToString(),
                  $"0x{BitConverter.ToUInt64(mem, addr):X16}"),
            _ => ("?", "")
        };
    }

    private static string FormatCValue(ulong raw, int size, bool signed, bool isFloat)
    {
        if (isFloat && size == 4) return BitConverter.Int32BitsToSingle(unchecked((int)(uint)raw)).ToString("G");
        if (isFloat && size == 8) return BitConverter.Int64BitsToDouble(unchecked((long)raw)).ToString("G");
        return size switch
        {
            1 => signed ? ((sbyte)(raw & 0xFF)).ToString() : (raw & 0xFF).ToString(),
            2 => signed ? ((short)(raw & 0xFFFF)).ToString() : (raw & 0xFFFF).ToString(),
            4 => signed ? unchecked((int)(uint)raw).ToString() : ((uint)raw).ToString(),
            _ => signed ? unchecked((long)raw).ToString() : raw.ToString()
        };
    }

    private static string M3TypeName(byte t) => t switch
    {
        1 => "i32",
        2 => "i64",
        3 => "f32",
        4 => "f64",
        5 => "v128",
        6 => "funcref",
        7 => "externref",
        _ => "none"
    };

    private static string FormatValue(byte t, ulong raw) => t switch
    {
        1 => $"{unchecked((int)(uint)raw)} (0x{(uint)raw:X8})",
        2 => $"{unchecked((long)raw)} (0x{raw:X16})",
        3 => $"{BitConverter.Int32BitsToSingle(unchecked((int)(uint)raw)):G}",
        4 => $"{BitConverter.Int64BitsToDouble(unchecked((long)raw)):G}",
        _ => $"0x{raw:X}"
    };

    private object BuildEmptyState() => new
    {
        status = "idle",
        stepCount = 0,
        traceId = 0,
        funcIndex = 0,
        funcName = "",
        wasmOffset = 0,
        wasmOffsetHex = "0x0000",
        opcodeHex = "",
        mnemonic = "",
        operands = "",
        cLine = (int?)null,
        cColumn = (int?)null,
        trapMessage = "",
        returnValue = (object?)null,
        instructionSpec = (object?)null,
        wasmLocals = Array.Empty<object>(),
        operandStack = Array.Empty<object>(),
        wasmGlobals = Array.Empty<object>(),
        callStack = Array.Empty<object>(),
        cVariables = Array.Empty<object>(),
        wasm3State = (object?)null,
        memory = new { totalSize = 0, changedCount = 0, changedOffsets = Array.Empty<int>(), stackPointer = 0 },
        hardware = _registers.GetStateSnapshot(),
        breakpoints = new { cLines = Array.Empty<int>(), wasmOffsets = Array.Empty<int>() }
    };

    public void Dispose()
    {
        try
        {
            RunOnDebuggerThread(() =>
            {
                Wasm3Native.w3dbg_DestroySession();
                return 0;
            }).Wait(1000);
        }
        catch { }
        _queue.CompleteAdding();
    }
}
