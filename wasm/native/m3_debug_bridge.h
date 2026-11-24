#ifndef M3_DEBUG_BRIDGE_H
#define M3_DEBUG_BRIDGE_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define W3DBG_MAX_LOCALS      64
#define W3DBG_MAX_STACK       32
#define W3DBG_MAX_RAW_SLOTS   64
#define W3DBG_MAX_CALL_DEPTH  64
#define W3DBG_MAX_GLOBALS     64

typedef enum W3DebugStatus {
    W3DBG_STATUS_IDLE      = 0,
    W3DBG_STATUS_PAUSED    = 1,
    W3DBG_STATUS_COMPLETED = 2,
    W3DBG_STATUS_TRAP      = 3
} W3DebugStatus;

typedef uint8_t (*W3ReadRegisterFn)(uint8_t address);
typedef void    (*W3WriteRegisterFn)(uint8_t address, uint8_t data);
typedef void    (*W3ConsoleLogFn)(int32_t kind, int32_t arg0, const char* text);

typedef struct W3DebugSnapshot {
    int32_t  status;
    uint32_t traceId;
    uint32_t funcIndex;
    uint32_t wasmByteOffset;
    uint16_t opcode;
    uint16_t reserved0;
    uint64_t stepCount;

    uint64_t m3Pc;
    uint64_t m3Sp;
    uint64_t m3StackOrigin;
    uint64_t m3MemHeader;
    uint64_t m3MemData;
    uint32_t m3MemSize;
    uint32_t m3StackSize;
    int64_t  m3R0;
    double   m3Fp0;
    int32_t  m3SpSlotOffset;
    uint32_t m3NumCodePages;
    uint32_t m3NumActiveCodePages;
    uint32_t m3MaxStackSlots;
    uint32_t m3NumLocalBytes;
    uint32_t m3NumConstantBytes;

    uint32_t numLocals;
    uint8_t  localTypes[W3DBG_MAX_LOCALS];
    uint16_t localSlots[W3DBG_MAX_LOCALS];
    uint64_t localValues[W3DBG_MAX_LOCALS];

    uint32_t stackDepth;
    uint8_t  operandTypes[W3DBG_MAX_STACK];
    uint16_t operandSlots[W3DBG_MAX_STACK];
    uint64_t operandValues[W3DBG_MAX_STACK];

    uint32_t rawSlotCount;
    uint64_t rawSlots[W3DBG_MAX_RAW_SLOTS];

    uint32_t numGlobals;
    uint8_t  globalTypes[W3DBG_MAX_GLOBALS];
    uint8_t  globalMutable[W3DBG_MAX_GLOBALS];
    uint64_t globalValues[W3DBG_MAX_GLOBALS];

    uint32_t callDepth;
    uint32_t frameFuncIndices[W3DBG_MAX_CALL_DEPTH];
    uint32_t frameWasmOffsets[W3DBG_MAX_CALL_DEPTH];
    int32_t  frameSpOffsets[W3DBG_MAX_CALL_DEPTH];

    int64_t  returnValue;
    uint8_t  hasReturnValue;
    uint8_t  returnType;

    char     funcName[128];
    char     trapMessage[256];
} W3DebugSnapshot;

/* Hooks called by instrumented wasm3 core (m3_compile.c / m3_exec.h) */
struct M3Compilation;
struct M3Function;
struct M3MemoryHeader;
typedef uint16_t m3opcode_t;

uint32_t w3dbg_RecordTraceEntry(void* compilationPtr, uint16_t opcode);
int      w3dbg_OnInstructionHit(uint32_t traceId, const void* pc, uint64_t* sp, void* mem, int64_t r0, double fp0);
void     w3dbg_OnEnterFrame(void* functionPtr, uint64_t* sp);
void     w3dbg_OnLeaveFrame(void);

/* Exported C API consumed by C# P/Invoke */
__declspec(dllexport) int32_t w3dbg_InitSession(
    const uint8_t* wasmBytes,
    uint32_t wasmLen,
    W3ReadRegisterFn readRegCb,
    W3WriteRegisterFn writeRegCb,
    W3ConsoleLogFn consoleCb,
    char* outError,
    uint32_t outErrorCap);

__declspec(dllexport) int32_t w3dbg_StartFunction(
    const char* funcName,
    int32_t argc,
    const int32_t* argv,
    char* outError,
    uint32_t outErrorCap);

__declspec(dllexport) int32_t w3dbg_StepNext(void);

__declspec(dllexport) int32_t w3dbg_RunUntil(
    const uint32_t* stopWasmOffsets,
    uint32_t stopCount,
    uint32_t maxSteps,
    uint32_t maxCallDepth);

__declspec(dllexport) void w3dbg_GetSnapshot(W3DebugSnapshot* outSnapshot);

__declspec(dllexport) uint32_t w3dbg_GetMemorySize(void);

__declspec(dllexport) uint32_t w3dbg_ReadMemory(uint32_t offset, uint8_t* dest, uint32_t len);

__declspec(dllexport) int32_t w3dbg_GetM3InternalsJson(char* outBuf, uint32_t bufCap);

__declspec(dllexport) void w3dbg_DestroySession(void);

#ifdef __cplusplus
}
#endif

#endif
