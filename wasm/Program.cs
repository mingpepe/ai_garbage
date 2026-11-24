using WasmIde.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<HardwareRegisterService>();
builder.Services.AddSingleton<WasmBinaryInspector>();
builder.Services.AddSingleton<WasmCompilerService>();
builder.Services.AddSingleton<WasmSpecService>();
builder.Services.AddSingleton<Wasm3DebugSessionService>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/presets", () => Results.Ok(Presets.All));

app.MapPost("/api/compile", async (CompileRequest req, Wasm3DebugSessionService session) =>
{
    var res = await session.CompileAndLoadAsync(req.Code ?? "", req.OptLevel ?? "O0", req.EntryFunction);
    return Results.Ok(res);
});

app.MapPost("/api/debug/step-wasm", async (Wasm3DebugSessionService session) =>
    Results.Ok(await session.StepWasmAsync()));

app.MapPost("/api/debug/step-over-wasm", async (Wasm3DebugSessionService session) =>
    Results.Ok(await session.StepOverWasmAsync()));

app.MapPost("/api/debug/step-c", async (Wasm3DebugSessionService session) =>
    Results.Ok(await session.StepCLineAsync(stepOver: false)));

app.MapPost("/api/debug/step-over-c", async (Wasm3DebugSessionService session) =>
    Results.Ok(await session.StepCLineAsync(stepOver: true)));

app.MapPost("/api/debug/step-out", async (Wasm3DebugSessionService session) =>
    Results.Ok(await session.StepOutAsync()));

app.MapPost("/api/debug/continue", async (Wasm3DebugSessionService session) =>
    Results.Ok(await session.ContinueAsync()));

app.MapPost("/api/debug/reset", async (Wasm3DebugSessionService session) =>
    Results.Ok(await session.ResetExecutionAsync()));

app.MapPost("/api/debug/breakpoints", async (BreakpointsRequest req, Wasm3DebugSessionService session) =>
    Results.Ok(await session.SetBreakpointsAsync(req.CLines, req.WasmOffsets)));

app.MapGet("/api/debug/state", async (Wasm3DebugSessionService session) =>
    Results.Ok(await session.GetStateAsync()));

app.MapGet("/api/debug/memory", async (uint offset, uint length, Wasm3DebugSessionService session) =>
{
    uint safeLen = length == 0 ? 256u : Math.Min(length, 4096u);
    return Results.Ok(await session.GetMemorySliceAsync(offset, safeLen));
});

app.MapGet("/api/registers", (HardwareRegisterService regs) =>
    Results.Ok(regs.GetStateSnapshot()));

app.MapPost("/api/registers/write", (RegisterWriteRequest req, HardwareRegisterService regs) =>
{
    regs.HostSetRegister(req.Address, req.Data);
    return Results.Ok(regs.GetStateSnapshot());
});

app.MapPost("/api/registers/reset", (HardwareRegisterService regs) =>
{
    regs.ResetDefaults();
    return Results.Ok(regs.GetStateSnapshot());
});

app.MapGet("/api/spec/instructions", (string? q, WasmSpecService spec) =>
{
    var all = spec.GetAllInstructions();
    if (!string.IsNullOrWhiteSpace(q))
    {
        all = all.Where(s =>
            s.Mnemonic.Contains(q, StringComparison.OrdinalIgnoreCase) ||
            s.OpcodeHex.Contains(q, StringComparison.OrdinalIgnoreCase) ||
            s.Category.Contains(q, StringComparison.OrdinalIgnoreCase) ||
            s.Summary.Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();
    }
    return Results.Ok(new
    {
        specFiles = spec.GetLocalSpecStatus(),
        instructions = all
    });
});

app.MapPost("/api/spec/download", async (WasmSpecService spec, CancellationToken ct) =>
    Results.Ok(await spec.DownloadOfficialSpecAsync(ct)));

app.Run();

public sealed record CompileRequest(string? Code, string? OptLevel, string? EntryFunction);
public sealed record BreakpointsRequest(int[]? CLines, int[]? WasmOffsets);
public sealed record RegisterWriteRequest(byte Address, byte Data);

public static class Presets
{
    public static readonly object[] All =
    {
        new
        {
            id = "hardware_io",
            title = "I. Hardware Register I/O & Checksum (ReadRegister / WriteRegister)",
            description = "Demonstrates ReadRegister/WriteRegister C# host calls, C local variables, and UART console output.",
            code = """
                // ReadRegister(addr) & WriteRegister(addr, data) are injected from C#
                int compute_checksum(byte a, byte b) {
                    int sum = a + b;
                    return (sum ^ 0x5A) & 0xFF;
                }

                int main(void) {
                    byte status = ReadRegister(0x00);
                    byte sensor = ReadRegister(0x10);
                    byte adc    = ReadRegister(0x12);

                    int result = compute_checksum(sensor, adc);
                    WriteRegister(0x11, (byte)result);
                    WriteRegister(0x18, (byte)(status | 0x80));

                    // Emit to C# UART console (0x20 = char, 0x21 = hex)
                    WriteRegister(0x20, 'O');
                    WriteRegister(0x20, 'K');
                    WriteRegister(0x20, '\n');
                    WriteRegister(0x21, (byte)result);

                    print_i32(result);
                    print_hex(result);
                    return result;
                }
                """
        },
        new
        {
            id = "recursion_stack",
            title = "II. Recursion & Shadow Stack Frame",
            description = "Inspect multi-level Wasm Call Stack frames, Wasm3 _sp offsets, and Clang shadow stack (__stack_pointer).",
            code = """
                int factorial(int n) {
                    if (n <= 1) {
                        return 1;
                    }
                    int sub = factorial(n - 1);
                    int acc = n * sub;
                    WriteRegister((byte)(0x30 + n), (byte)(acc & 0xFF));
                    return acc;
                }

                int main(void) {
                    byte seed = ReadRegister(0x10);
                    int n = (seed % 5) + 3;
                    int ans = factorial(n);
                    WriteRegister(0x11, (byte)(ans & 0xFF));
                    print_i32(ans);
                    return ans;
                }
                """
        },
        new
        {
            id = "linear_memory",
            title = "III. Linear Memory & Ring Buffer",
            description = "Explore i32.store8 / i32.load8_u instructions and live Linear Memory hex inspection.",
            code = """
                static byte ring_buf[16];

                int main(void) {
                    byte base_val = ReadRegister(0x10);
                    int crc = 0;

                    for (int i = 0; i < 8; i++) {
                        byte v = (byte)((base_val + i * 7) & 0xFF);
                        ring_buf[i] = v;
                        crc = (crc + v) & 0xFF;
                    }

                    WriteRegister(0x11, (byte)crc);
                    WriteRegister(0x19, ring_buf[7]);
                    print_hex((int)(unsigned int)&ring_buf[0]);
                    print_i32(crc);
                    return crc;
                }
                """
        }
    };
}
