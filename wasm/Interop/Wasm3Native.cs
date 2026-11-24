using System.Runtime.InteropServices;
using System.Text;

namespace WasmIde.Interop;

public static unsafe class Wasm3Native
{
    private const string DllName = "wasm3.dll";

    public const int MaxLocals = 64;
    public const int MaxStack = 32;
    public const int MaxRawSlots = 64;
    public const int MaxCallDepth = 64;
    public const int MaxGlobals = 64;

    public const int StatusIdle = 0;
    public const int StatusPaused = 1;
    public const int StatusCompleted = 2;
    public const int StatusTrap = 3;

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate byte ReadRegisterCallback(byte address);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate void WriteRegisterCallback(byte address, byte data);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate void ConsoleLogCallback(int kind, int arg0, IntPtr textPtr);

    [StructLayout(LayoutKind.Sequential)]
    public struct W3DebugSnapshot
    {
        public int Status;
        public uint TraceId;
        public uint FuncIndex;
        public uint WasmByteOffset;
        public ushort Opcode;
        public ushort Reserved0;
        public ulong StepCount;

        public ulong M3Pc;
        public ulong M3Sp;
        public ulong M3StackOrigin;
        public ulong M3MemHeader;
        public ulong M3MemData;
        public uint M3MemSize;
        public uint M3StackSize;
        public long M3R0;
        public double M3Fp0;
        public int M3SpSlotOffset;
        public uint M3NumCodePages;
        public uint M3NumActiveCodePages;
        public uint M3MaxStackSlots;
        public uint M3NumLocalBytes;
        public uint M3NumConstantBytes;

        public uint NumLocals;
        public fixed byte LocalTypes[MaxLocals];
        public fixed ushort LocalSlots[MaxLocals];
        public fixed ulong LocalValues[MaxLocals];

        public uint StackDepth;
        public fixed byte OperandTypes[MaxStack];
        public fixed ushort OperandSlots[MaxStack];
        public fixed ulong OperandValues[MaxStack];

        public uint RawSlotCount;
        public fixed ulong RawSlots[MaxRawSlots];

        public uint NumGlobals;
        public fixed byte GlobalTypes[MaxGlobals];
        public fixed byte GlobalMutable[MaxGlobals];
        public fixed ulong GlobalValues[MaxGlobals];

        public uint CallDepth;
        public fixed uint FrameFuncIndices[MaxCallDepth];
        public fixed uint FrameWasmOffsets[MaxCallDepth];
        public fixed int FrameSpOffsets[MaxCallDepth];

        public long ReturnValue;
        public byte HasReturnValue;
        public byte ReturnType;

        public fixed byte FuncName[128];
        public fixed byte TrapMessage[256];
    }

    public static string ReadFixedString(byte* ptr, int maxLen)
    {
        int len = 0;
        while (len < maxLen && ptr[len] != 0)
        {
            len++;
        }
        return len == 0 ? string.Empty : Encoding.UTF8.GetString(ptr, len);
    }

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int w3dbg_InitSession(
        byte[] wasmBytes,
        uint wasmLen,
        ReadRegisterCallback readRegCb,
        WriteRegisterCallback writeRegCb,
        ConsoleLogCallback consoleCb,
        byte[] outError,
        uint outErrorCap);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern int w3dbg_StartFunction(
        string funcName,
        int argc,
        int[]? argv,
        byte[] outError,
        uint outErrorCap);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int w3dbg_StepNext();

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int w3dbg_RunUntil(
        uint[]? stopWasmOffsets,
        uint stopCount,
        uint maxSteps,
        uint maxCallDepth);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern void w3dbg_GetSnapshot(out W3DebugSnapshot outSnapshot);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern uint w3dbg_GetMemorySize();

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern uint w3dbg_ReadMemory(uint offset, byte[] dest, uint len);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int w3dbg_GetM3InternalsJson(byte[] outBuf, uint bufCap);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern void w3dbg_DestroySession();
}
