#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "m3_debug_bridge.h"
#include "wasm3.h"
#include "m3_env.h"
#include "m3_compile.h"
#include "m3_function.h"
#include "m3_code.h"
#include "m3_core.h"

typedef struct W3TraceEntry {
    uint32_t traceId;
    uint32_t funcIndex;
    uint32_t wasmByteOffset;
    uint16_t opcode;
    uint16_t numLocals;
    uint16_t stackDepth;
    uint16_t localSlots[W3DBG_MAX_LOCALS];
    uint8_t  localTypes[W3DBG_MAX_LOCALS];
    uint16_t operandSlots[W3DBG_MAX_STACK];
    uint8_t  operandTypes[W3DBG_MAX_STACK];
    uint32_t m3CodePageSeq;
    uint32_t m3CodePageLineIndex;
} W3TraceEntry;

typedef struct W3CallFrame {
    IM3Function func;
    uint32_t    funcIndex;
    uint32_t    wasmByteOffset;
    uint64_t*   sp;
    int32_t     spSlotOffset;
} W3CallFrame;

static IM3Environment     g_env = NULL;
static IM3Runtime         g_runtime = NULL;
static IM3Module          g_module = NULL;
static uint8_t*           g_wasmCopy = NULL;
static uint32_t           g_wasmLen = 0;

static W3ReadRegisterFn   g_readRegCb = NULL;
static W3WriteRegisterFn  g_writeRegCb = NULL;
static W3ConsoleLogFn     g_consoleCb = NULL;

static W3TraceEntry*      g_traces = NULL;
static uint32_t           g_traceCount = 0;
static uint32_t           g_traceCap = 0;

static LPVOID             g_mainFiber = NULL;
static LPVOID             g_wasmFiber = NULL;
static IM3Function        g_entryFunc = NULL;
static int32_t            g_entryArgc = 0;
static int32_t            g_entryArgv[16];

static volatile int32_t   g_status = W3DBG_STATUS_IDLE;
static volatile int       g_steppingEnabled = 0;
static volatile int       g_abortRequested = 0;
static volatile uint32_t  g_stepsBudget = 0;
static volatile uint64_t  g_stepCount = 0;

static const uint32_t*    g_stopOffsets = NULL;
static uint32_t           g_stopCount = 0;
static uint32_t           g_maxStopCallDepth = 0xFFFFFFFFu;

static uint32_t           g_curTraceId = 0;
static pc_t               g_curPc = NULL;
static uint64_t*          g_curSp = NULL;
static M3MemoryHeader*    g_curMem = NULL;
static int64_t            g_curR0 = 0;
static double             g_curFp0 = 0.0;

static W3CallFrame        g_callStack[W3DBG_MAX_CALL_DEPTH];
static uint32_t           g_callDepth = 0;

static int64_t            g_returnValue = 0;
static uint8_t            g_hasReturnValue = 0;
static uint8_t            g_returnType = 0;
static char               g_trapMessage[256];

static void SetErrBuf(char* outBuf, uint32_t cap, const char* msg) {
    if (!outBuf || cap == 0) return;
    if (!msg) {
        outBuf[0] = '\0';
        return;
    }
    snprintf(outBuf, cap, "%s", msg);
}

static void EnsureFiberOnCurrentThread(void) {
    if (IsThreadAFiber()) {
        g_mainFiber = GetCurrentFiber();
    } else {
        g_mainFiber = ConvertThreadToFiber(NULL);
    }
}

static void AbortActiveFiberIfAny(void) {
    if (g_wasmFiber != NULL) {
        if (g_status == W3DBG_STATUS_PAUSED) {
            EnsureFiberOnCurrentThread();
            g_abortRequested = 1;
            g_steppingEnabled = 1;
            g_stepsBudget = 0xFFFFFFFFu;
            g_stopOffsets = NULL;
            g_stopCount = 0;
            SwitchToFiber(g_wasmFiber);
        }
        DeleteFiber(g_wasmFiber);
        g_wasmFiber = NULL;
    }
    g_abortRequested = 0;
    g_steppingEnabled = 0;
    g_callDepth = 0;
}

static void ClearTraces(void) {
    free(g_traces);
    g_traces = NULL;
    g_traceCount = 0;
    g_traceCap = 0;
}

/* Host functions injected from C# */
m3ApiRawFunction(w3dbg_host_ReadRegister) {
    m3ApiReturnType(uint32_t)
    m3ApiGetArg(uint32_t, address)
    uint8_t val = g_readRegCb ? g_readRegCb((uint8_t)(address & 0xFFu)) : 0;
    m3ApiReturn((uint32_t)val);
}

m3ApiRawFunction(w3dbg_host_WriteRegister) {
    m3ApiGetArg(uint32_t, address)
    m3ApiGetArg(uint32_t, data)
    if (g_writeRegCb) {
        g_writeRegCb((uint8_t)(address & 0xFFu), (uint8_t)(data & 0xFFu));
    }
    m3ApiSuccess();
}

m3ApiRawFunction(w3dbg_host_print_i32) {
    m3ApiGetArg(int32_t, val)
    if (g_consoleCb) {
        g_consoleCb(1, val, NULL);
    }
    m3ApiSuccess();
}

m3ApiRawFunction(w3dbg_host_print_hex) {
    m3ApiGetArg(int32_t, val)
    if (g_consoleCb) {
        g_consoleCb(2, val, NULL);
    }
    m3ApiSuccess();
}

m3ApiRawFunction(w3dbg_host_putc) {
    m3ApiGetArg(int32_t, ch)
    if (g_consoleCb) {
        g_consoleCb(3, ch, NULL);
    }
    m3ApiSuccess();
}

m3ApiRawFunction(w3dbg_host_print_str) {
    m3ApiGetArgMem(const char*, ptr)
    m3ApiGetArg(uint32_t, len)
    m3ApiCheckMem(ptr, len);
    if (g_consoleCb) {
        char buf[512];
        uint32_t copyLen = len < sizeof(buf) - 1 ? len : (uint32_t)(sizeof(buf) - 1);
        memcpy(buf, ptr, copyLen);
        buf[copyLen] = '\0';
        g_consoleCb(4, (int32_t)copyLen, buf);
    }
    m3ApiSuccess();
}

m3ApiRawFunction(w3dbg_host_puts) {
    m3ApiGetArgMem(const char*, ptr)
    m3ApiCheckMem(ptr, 1);
    if (g_consoleCb) {
        size_t memSz = m3_GetMemorySizeAt(_mem);
        size_t off = (size_t)((const uint8_t*)ptr - (const uint8_t*)_mem);
        size_t maxLen = memSz > off ? memSz - off : 0;
        char buf[512];
        size_t i = 0;
        while (i < maxLen && i < sizeof(buf) - 1 && ptr[i] != '\0') {
            buf[i] = ptr[i];
            i++;
        }
        buf[i] = '\0';
        g_consoleCb(5, (int32_t)i, buf);
    }
    m3ApiSuccess();
}

/* Compile-time trace recording called from m3_compile.c */
uint32_t w3dbg_RecordTraceEntry(void* compilationPtr, uint16_t opcode) {
    IM3Compilation o = (IM3Compilation)compilationPtr;
    if (!o || !o->function || !o->module || !o->page) {
        return UINT32_MAX;
    }

    if (g_traceCount == g_traceCap) {
        uint32_t newCap = g_traceCap ? g_traceCap * 2 : 256;
        W3TraceEntry* grown = (W3TraceEntry*)realloc(g_traces, newCap * sizeof(W3TraceEntry));
        if (!grown) return UINT32_MAX;
        g_traces = grown;
        g_traceCap = newCap;
    }

    uint32_t id = g_traceCount++;
    W3TraceEntry* e = &g_traces[id];
    memset(e, 0, sizeof(*e));

    e->traceId = id;
    e->funcIndex = (uint32_t)(o->function - o->module->functions);
    e->wasmByteOffset = (uint32_t)(o->lastOpcodeStart - o->module->wasmStart);
    e->opcode = opcode;
    e->m3CodePageSeq = o->page->info.sequence;
    e->m3CodePageLineIndex = o->page->info.lineIndex;

    uint32_t numArgsAndLocals = GetFunctionNumArgsAndLocals(o->function);
    if (numArgsAndLocals > W3DBG_MAX_LOCALS) numArgsAndLocals = W3DBG_MAX_LOCALS;
    e->numLocals = (uint16_t)numArgsAndLocals;

    for (uint32_t i = 0; i < numArgsAndLocals; ++i) {
        e->localSlots[i] = o->wasmStack[i];
        e->localTypes[i] = BaseTypeOf(o->typeStack[i]);
    }

    uint16_t depth = 0;
    for (uint16_t i = o->stackFirstDynamicIndex; i < o->stackIndex && depth < W3DBG_MAX_STACK; ++i) {
        /* Filter out block landing pad slots belonging to enclosing scopes */
        bool isLive = true;
        for (IM3CompilationScope scope = &o->block; scope && scope->outer; scope = scope->outer) {
            if (i >= scope->exitStackIndex && i < scope->blockStackIndex) {
                isLive = false;
                break;
            }
        }
        if (isLive) {
            e->operandSlots[depth] = o->wasmStack[i];
            e->operandTypes[depth] = BaseTypeOf(o->typeStack[i]);
            depth++;
        }
    }
    e->stackDepth = depth;

    return id;
}

void w3dbg_OnEnterFrame(void* functionPtr, uint64_t* sp) {
    if (!g_steppingEnabled) return;
    IM3Function fn = (IM3Function)functionPtr;
    if (g_callDepth < W3DBG_MAX_CALL_DEPTH) {
        W3CallFrame* f = &g_callStack[g_callDepth++];
        f->func = fn;
        f->funcIndex = (fn && fn->module) ? (uint32_t)(fn - fn->module->functions) : 0;
        f->wasmByteOffset = (fn && fn->module && fn->wasm) ? (uint32_t)(fn->wasm - fn->module->wasmStart) : 0;
        f->sp = sp;
        f->spSlotOffset = (g_runtime && g_runtime->originStack && sp)
            ? (int32_t)((m3slot_t*)sp - (m3slot_t*)g_runtime->originStack)
            : 0;
    }
}

void w3dbg_OnLeaveFrame(void) {
    if (!g_steppingEnabled) return;
    if (g_callDepth > 0) {
        g_callDepth--;
    }
}

static bool IsStopOffsetMatch(uint32_t wasmByteOffset) {
    if (!g_stopOffsets || g_stopCount == 0) return false;
    if (g_callDepth > g_maxStopCallDepth) return false;
    for (uint32_t i = 0; i < g_stopCount; ++i) {
        if (g_stopOffsets[i] == wasmByteOffset) {
            return true;
        }
    }
    return false;
}

int w3dbg_OnInstructionHit(uint32_t traceId, const void* pc, uint64_t* sp, void* mem, int64_t r0, double fp0) {
    if (!g_steppingEnabled) return 0;
    if (g_abortRequested) return 1;
    if (traceId >= g_traceCount) return 0;

    W3TraceEntry* e = &g_traces[traceId];
    g_curTraceId = traceId;
    g_curPc = (pc_t)pc;
    g_curSp = sp;
    g_curMem = (M3MemoryHeader*)mem;
    g_curR0 = r0;
    g_curFp0 = fp0;
    g_stepCount++;

    if (g_callDepth > 0) {
        g_callStack[g_callDepth - 1].wasmByteOffset = e->wasmByteOffset;
        g_callStack[g_callDepth - 1].funcIndex = e->funcIndex;
    }

    bool shouldPause = false;
    if (g_stepsBudget > 0) {
        g_stepsBudget--;
        if (g_stepsBudget == 0) {
            shouldPause = true;
        }
    }
    if (!shouldPause && IsStopOffsetMatch(e->wasmByteOffset)) {
        shouldPause = true;
    }

    if (shouldPause && g_mainFiber) {
        g_status = W3DBG_STATUS_PAUSED;
        SwitchToFiber(g_mainFiber);
        if (g_abortRequested) {
            return 1;
        }
    }
    return 0;
}

static void WINAPI WasmFiberProc(LPVOID lpParam) {
    (void)lpParam;
    if (!g_runtime || !g_entryFunc) {
        g_status = W3DBG_STATUS_TRAP;
        snprintf(g_trapMessage, sizeof(g_trapMessage), "No entry function");
        SwitchToFiber(g_mainFiber);
        return;
    }

    /* Reset native stack limit inside this Win32 fiber */
    g_runtime->stackLimit = NULL;

    const void* argPtrs[16];
    for (int32_t i = 0; i < g_entryArgc && i < 16; ++i) {
        argPtrs[i] = &g_entryArgv[i];
    }

    M3Result res = m3_Call(g_entryFunc, (uint32_t)g_entryArgc, argPtrs);
    if (g_abortRequested) {
        g_status = W3DBG_STATUS_IDLE;
        SwitchToFiber(g_mainFiber);
        return;
    }

    if (res == m3Err_none) {
        g_status = W3DBG_STATUS_COMPLETED;
        uint16_t numRets = GetFunctionNumReturns(g_entryFunc);
        if (numRets > 0) {
            uint64_t retVal = 0;
            const void* retPtrs[1] = { &retVal };
            if (m3_GetResults(g_entryFunc, 1, retPtrs) == m3Err_none) {
                g_hasReturnValue = 1;
                g_returnType = GetFunctionReturnType(g_entryFunc, 0);
                g_returnValue = (int64_t)retVal;
            }
        }
    } else {
        g_status = W3DBG_STATUS_TRAP;
        const char* errMsg = g_runtime->error_message[0] ? g_runtime->error_message : res;
        snprintf(g_trapMessage, sizeof(g_trapMessage), "%s: %s", res, errMsg ? errMsg : "");
    }

    SwitchToFiber(g_mainFiber);
}

static void LinkOptionalHostFn(IM3Module mod, const char* name, const char* sig, M3RawCall fn) {
    m3_LinkRawFunction(mod, "*", name, sig, fn);
}

__declspec(dllexport) int32_t w3dbg_InitSession(
    const uint8_t* wasmBytes,
    uint32_t wasmLen,
    W3ReadRegisterFn readRegCb,
    W3WriteRegisterFn writeRegCb,
    W3ConsoleLogFn consoleCb,
    char* outError,
    uint32_t outErrorCap)
{
    w3dbg_DestroySession();
    SetErrBuf(outError, outErrorCap, "");

    if (!wasmBytes || wasmLen == 0) {
        SetErrBuf(outError, outErrorCap, "Empty Wasm binary");
        return -1;
    }

    g_readRegCb = readRegCb;
    g_writeRegCb = writeRegCb;
    g_consoleCb = consoleCb;

    g_wasmCopy = (uint8_t*)malloc(wasmLen);
    if (!g_wasmCopy) {
        SetErrBuf(outError, outErrorCap, "Out of memory copying Wasm bytes");
        return -1;
    }
    memcpy(g_wasmCopy, wasmBytes, wasmLen);
    g_wasmLen = wasmLen;

    g_env = m3_NewEnvironment();
    if (!g_env) {
        SetErrBuf(outError, outErrorCap, "m3_NewEnvironment failed");
        w3dbg_DestroySession();
        return -1;
    }

    g_runtime = m3_NewRuntime(g_env, 64 * 1024, NULL);
    if (!g_runtime) {
        SetErrBuf(outError, outErrorCap, "m3_NewRuntime failed");
        w3dbg_DestroySession();
        return -1;
    }

    M3Result res = m3_ParseModule(g_env, &g_module, g_wasmCopy, g_wasmLen);
    if (res) {
        SetErrBuf(outError, outErrorCap, res);
        w3dbg_DestroySession();
        return -1;
    }

    res = m3_LoadModule(g_runtime, g_module);
    if (res) {
        SetErrBuf(outError, outErrorCap, res);
        m3_FreeModule(g_module);
        g_module = NULL;
        w3dbg_DestroySession();
        return -1;
    }

    LinkOptionalHostFn(g_module, "ReadRegister",  "i(i)",  w3dbg_host_ReadRegister);
    LinkOptionalHostFn(g_module, "WriteRegister", "v(ii)", w3dbg_host_WriteRegister);
    LinkOptionalHostFn(g_module, "print_i32",     "v(i)",  w3dbg_host_print_i32);
    LinkOptionalHostFn(g_module, "print_hex",     "v(i)",  w3dbg_host_print_hex);
    LinkOptionalHostFn(g_module, "putc",          "v(i)",  w3dbg_host_putc);
    LinkOptionalHostFn(g_module, "print_str",     "v(ii)", w3dbg_host_print_str);
    LinkOptionalHostFn(g_module, "puts",          "i(i)",  w3dbg_host_puts);

    /* Eagerly compile all defined functions so M3CodePage & trace tables are complete */
    g_steppingEnabled = 0;
    res = m3_CompileModule(g_module);
    if (res) {
        const char* detail = g_runtime->error_message[0] ? g_runtime->error_message : res;
        SetErrBuf(outError, outErrorCap, detail);
        w3dbg_DestroySession();
        return -1;
    }

    /* Run start function (if any) without pausing */
    res = m3_RunStart(g_module);
    if (res) {
        const char* detail = g_runtime->error_message[0] ? g_runtime->error_message : res;
        SetErrBuf(outError, outErrorCap, detail);
        w3dbg_DestroySession();
        return -1;
    }

    g_status = W3DBG_STATUS_IDLE;
    g_stepCount = 0;
    g_callDepth = 0;
    g_hasReturnValue = 0;
    g_trapMessage[0] = '\0';
    return 0;
}

__declspec(dllexport) int32_t w3dbg_StartFunction(
    const char* funcName,
    int32_t argc,
    const int32_t* argv,
    char* outError,
    uint32_t outErrorCap)
{
    SetErrBuf(outError, outErrorCap, "");
    if (!g_runtime || !g_module) {
        SetErrBuf(outError, outErrorCap, "Session not initialized");
        return -1;
    }

    AbortActiveFiberIfAny();

    IM3Function fn = NULL;
    M3Result res = m3_FindFunction(&fn, g_runtime, funcName ? funcName : "main");
    if (res || !fn) {
        SetErrBuf(outError, outErrorCap, res ? res : "Entry function not found");
        return -1;
    }

    g_entryFunc = fn;
    g_entryArgc = (argc > 16) ? 16 : (argc < 0 ? 0 : argc);
    for (int32_t i = 0; i < g_entryArgc; ++i) {
        g_entryArgv[i] = argv ? argv[i] : 0;
    }

    g_stepCount = 0;
    g_callDepth = 0;
    g_curTraceId = 0;
    g_curPc = NULL;
    g_curSp = (uint64_t*)g_runtime->originStack;
    g_curMem = g_module->memory0 ? g_module->memory0->mallocated : NULL;
    g_curR0 = 0;
    g_curFp0 = 0.0;
    g_hasReturnValue = 0;
    g_returnValue = 0;
    g_returnType = 0;
    g_trapMessage[0] = '\0';

    EnsureFiberOnCurrentThread();
    g_wasmFiber = CreateFiber(256 * 1024, WasmFiberProc, NULL);
    if (!g_wasmFiber) {
        SetErrBuf(outError, outErrorCap, "CreateFiber failed");
        return -1;
    }

    /* Pause immediately on the very first Wasm instruction */
    g_steppingEnabled = 1;
    g_abortRequested = 0;
    g_stepsBudget = 1;
    g_stopOffsets = NULL;
    g_stopCount = 0;
    g_maxStopCallDepth = 0xFFFFFFFFu;
    g_status = W3DBG_STATUS_PAUSED;

    SwitchToFiber(g_wasmFiber);
    return g_status;
}

__declspec(dllexport) int32_t w3dbg_StepNext(void) {
    if (!g_wasmFiber || g_status != W3DBG_STATUS_PAUSED) {
        return g_status;
    }
    EnsureFiberOnCurrentThread();
    g_stepsBudget = 1;
    g_stopOffsets = NULL;
    g_stopCount = 0;
    g_maxStopCallDepth = 0xFFFFFFFFu;
    SwitchToFiber(g_wasmFiber);
    return g_status;
}

__declspec(dllexport) int32_t w3dbg_RunUntil(
    const uint32_t* stopWasmOffsets,
    uint32_t stopCount,
    uint32_t maxSteps,
    uint32_t maxCallDepth)
{
    if (!g_wasmFiber || g_status != W3DBG_STATUS_PAUSED) {
        return g_status;
    }
    EnsureFiberOnCurrentThread();
    g_stepsBudget = maxSteps > 0 ? maxSteps : 100000u;
    g_stopOffsets = stopWasmOffsets;
    g_stopCount = stopCount;
    g_maxStopCallDepth = maxCallDepth > 0 ? maxCallDepth : 0xFFFFFFFFu;
    SwitchToFiber(g_wasmFiber);
    g_stopOffsets = NULL;
    g_stopCount = 0;
    return g_status;
}

static uint64_t ReadSlotOrRegValue(uint16_t slot, uint8_t type, uint64_t* sp, int64_t r0, double fp0) {
    if (slot == d_m3Reg0SlotAlias) {
        return (uint64_t)r0;
    }
    if (slot == d_m3Fp0SlotAlias) {
        uint64_t bits = 0;
        if (type == c_m3Type_f32) {
            float f = (float)fp0;
            memcpy(&bits, &f, sizeof(f));
        } else {
            memcpy(&bits, &fp0, sizeof(fp0));
        }
        return bits;
    }
    if (!sp || slot >= d_m3MaxFunctionSlots) return 0;
    m3slot_t* base = (m3slot_t*)sp;
    uint64_t val = 0;
#if d_m3Use32BitSlots
    if (type == c_m3Type_i64 || type == c_m3Type_f64) {
        memcpy(&val, &base[slot], sizeof(uint64_t));
    } else {
        uint32_t v32 = base[slot];
        val = (uint64_t)v32;
    }
#else
    val = base[slot];
    (void)type;
#endif
    return val;
}

__declspec(dllexport) void w3dbg_GetSnapshot(W3DebugSnapshot* out) {
    if (!out) return;
    memset(out, 0, sizeof(*out));

    out->status = g_status;
    out->stepCount = g_stepCount;
    out->m3Pc = (uint64_t)(uintptr_t)g_curPc;
    out->m3Sp = (uint64_t)(uintptr_t)g_curSp;
    out->m3StackOrigin = g_runtime ? (uint64_t)(uintptr_t)g_runtime->originStack : 0;
    out->m3StackSize = g_runtime ? g_runtime->stackSize : 0;
    out->m3MemHeader = (uint64_t)(uintptr_t)g_curMem;
    out->m3MemData = g_curMem ? (uint64_t)(uintptr_t)m3MemData(g_curMem) : 0;
    out->m3MemSize = g_curMem ? (uint32_t)g_curMem->length : 0;
    out->m3R0 = g_curR0;
    out->m3Fp0 = g_curFp0;
    out->m3SpSlotOffset = (g_runtime && g_runtime->originStack && g_curSp)
        ? (int32_t)((m3slot_t*)g_curSp - (m3slot_t*)g_runtime->originStack)
        : 0;
    out->m3NumCodePages = g_runtime ? g_runtime->numCodePages : 0;
    out->m3NumActiveCodePages = g_runtime ? g_runtime->numActiveCodePages : 0;
    out->hasReturnValue = g_hasReturnValue;
    out->returnValue = g_returnValue;
    out->returnType = g_returnType;
    snprintf(out->trapMessage, sizeof(out->trapMessage), "%s", g_trapMessage);

    if (g_curTraceId < g_traceCount && g_traces) {
        W3TraceEntry* e = &g_traces[g_curTraceId];
        out->traceId = e->traceId;
        out->funcIndex = e->funcIndex;
        out->wasmByteOffset = e->wasmByteOffset;
        out->opcode = e->opcode;

        if (g_module && e->funcIndex < g_module->numFunctions) {
            IM3Function fn = &g_module->functions[e->funcIndex];
            const char* fname = m3_GetFunctionName(fn);
            snprintf(out->funcName, sizeof(out->funcName), "%s", fname ? fname : "");
            out->m3MaxStackSlots = fn->maxStackSlots;
            out->m3NumLocalBytes = fn->numLocalBytes;
            out->m3NumConstantBytes = fn->numConstantBytes;
        }

        out->numLocals = e->numLocals;
        for (uint32_t i = 0; i < e->numLocals && i < W3DBG_MAX_LOCALS; ++i) {
            out->localTypes[i] = e->localTypes[i];
            out->localSlots[i] = e->localSlots[i];
            out->localValues[i] = ReadSlotOrRegValue(e->localSlots[i], e->localTypes[i], g_curSp, g_curR0, g_curFp0);
        }

        out->stackDepth = e->stackDepth;
        for (uint32_t i = 0; i < e->stackDepth && i < W3DBG_MAX_STACK; ++i) {
            out->operandTypes[i] = e->operandTypes[i];
            out->operandSlots[i] = e->operandSlots[i];
            out->operandValues[i] = ReadSlotOrRegValue(e->operandSlots[i], e->operandTypes[i], g_curSp, g_curR0, g_curFp0);
        }
    }

    if (g_curSp) {
        uint32_t rawCnt = out->m3MaxStackSlots > 0 ? out->m3MaxStackSlots : 16;
        if (rawCnt > W3DBG_MAX_RAW_SLOTS) rawCnt = W3DBG_MAX_RAW_SLOTS;
        out->rawSlotCount = rawCnt;
        m3slot_t* base = (m3slot_t*)g_curSp;
        for (uint32_t i = 0; i < rawCnt; ++i) {
            out->rawSlots[i] = (uint64_t)base[i];
        }
    }

    if (g_module) {
        uint32_t ng = g_module->numGlobals;
        if (ng > W3DBG_MAX_GLOBALS) ng = W3DBG_MAX_GLOBALS;
        out->numGlobals = ng;
        for (uint32_t i = 0; i < ng; ++i) {
            M3Global* g = g_module->globals[i].resolved ? g_module->globals[i].resolved : &g_module->globals[i];
            out->globalTypes[i] = BaseTypeOf(g->type);
            out->globalMutable[i] = g->isMutable ? 1 : 0;
            out->globalValues[i] = (uint64_t)g->i64Value;
        }
    }

    out->callDepth = g_callDepth;
    for (uint32_t i = 0; i < g_callDepth && i < W3DBG_MAX_CALL_DEPTH; ++i) {
        out->frameFuncIndices[i] = g_callStack[i].funcIndex;
        out->frameWasmOffsets[i] = g_callStack[i].wasmByteOffset;
        out->frameSpOffsets[i] = g_callStack[i].spSlotOffset;
    }
}

__declspec(dllexport) uint32_t w3dbg_GetMemorySize(void) {
    if (!g_module) return 0;
    size_t size = 0;
    m3_GetMemory(g_module, &size, 0);
    return (uint32_t)size;
}

__declspec(dllexport) uint32_t w3dbg_ReadMemory(uint32_t offset, uint8_t* dest, uint32_t len) {
    if (!g_module || !dest || len == 0) return 0;
    size_t size = 0;
    uint8_t* mem = m3_GetMemory(g_module, &size, 0);
    if (!mem || offset >= size) return 0;
    uint32_t avail = (uint32_t)size - offset;
    uint32_t toRead = len < avail ? len : avail;
    memcpy(dest, mem + offset, toRead);
    return toRead;
}

__declspec(dllexport) int32_t w3dbg_GetM3InternalsJson(char* outBuf, uint32_t bufCap) {
    if (!outBuf || bufCap == 0) return -1;
    if (!g_module || !g_runtime) {
        snprintf(outBuf, bufCap, "{\"functions\":[],\"codePages\":[]}");
        return 0;
    }

    size_t pos = 0;
    int n = snprintf(outBuf + pos, bufCap - pos,
        "{\"numCodePages\":%u,\"numActiveCodePages\":%u,\"stackSize\":%u,\"numStackSlots\":%u,\"functions\":[",
        g_runtime->numCodePages, g_runtime->numActiveCodePages, g_runtime->stackSize, g_runtime->numStackSlots);
    if (n < 0 || pos + (size_t)n >= bufCap) return -1;
    pos += (size_t)n;

    bool firstFn = true;
    for (uint32_t f = 0; f < g_module->numFunctions; ++f) {
        IM3Function fn = &g_module->functions[f];
        if (!fn->compiled && !fn->import.fieldUtf8) continue;

        const char* name = m3_GetFunctionName(fn);
        n = snprintf(outBuf + pos, bufCap - pos,
            "%s{\"index\":%u,\"name\":\"%s\",\"isImport\":%s,\"numArgs\":%u,\"numRets\":%u,\"numLocals\":%u,\"numRetSlots\":%u,\"numRetAndArgSlots\":%u,\"maxStackSlots\":%u,\"numLocalBytes\":%u,\"numConstantBytes\":%u,\"compiledPc\":\"0x%llx\",\"traces\":[",
            firstFn ? "" : ",",
            f,
            name ? name : "",
            fn->import.fieldUtf8 ? "true" : "false",
            GetFunctionNumArgs(fn),
            GetFunctionNumReturns(fn),
            fn->numLocals,
            fn->numRetSlots,
            fn->numRetAndArgSlots,
            fn->maxStackSlots,
            fn->numLocalBytes,
            fn->numConstantBytes,
            (unsigned long long)(uintptr_t)fn->compiled);
        if (n < 0 || pos + (size_t)n >= bufCap) break;
        pos += (size_t)n;
        firstFn = false;

        bool firstTr = true;
        for (uint32_t t = 0; t < g_traceCount; ++t) {
            if (g_traces[t].funcIndex != f) continue;
            W3TraceEntry* tr = &g_traces[t];
            n = snprintf(outBuf + pos, bufCap - pos,
                "%s{\"id\":%u,\"wasmOffset\":%u,\"opcode\":%u,\"pageSeq\":%u,\"pageLine\":%u,\"stackDepth\":%u}",
                firstTr ? "" : ",",
                tr->traceId, tr->wasmByteOffset, tr->opcode, tr->m3CodePageSeq, tr->m3CodePageLineIndex, tr->stackDepth);
            if (n < 0 || pos + (size_t)n >= bufCap) break;
            pos += (size_t)n;
            firstTr = false;
        }
        n = snprintf(outBuf + pos, bufCap - pos, "]}");
        if (n < 0 || pos + (size_t)n >= bufCap) break;
        pos += (size_t)n;
    }

    n = snprintf(outBuf + pos, bufCap - pos, "]}");
    if (n > 0 && pos + (size_t)n < bufCap) pos += (size_t)n;
    return (int32_t)pos;
}

__declspec(dllexport) void w3dbg_DestroySession(void) {
    AbortActiveFiberIfAny();

    if (g_runtime) {
        m3_FreeRuntime(g_runtime);
        g_runtime = NULL;
        g_module = NULL;
    }
    if (g_env) {
        m3_FreeEnvironment(g_env);
        g_env = NULL;
    }
    free(g_wasmCopy);
    g_wasmCopy = NULL;
    g_wasmLen = 0;
    ClearTraces();

    g_entryFunc = NULL;
    g_status = W3DBG_STATUS_IDLE;
    g_curTraceId = 0;
    g_curPc = NULL;
    g_curSp = NULL;
    g_curMem = NULL;
    g_stepCount = 0;
    g_callDepth = 0;
}
