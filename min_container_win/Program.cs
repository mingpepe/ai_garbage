using MinContainerWin;

if (args.Length == 0 || args[0] is "-h" or "--help" or "help")
{
    PrintUsage();
    return 0;
}

if (args[0] == "demo")
{
    return RunAutomatedDemo();
}

if (args[0] != "run")
{
    Console.Error.WriteLine($"Unknown subcommand: {args[0]}");
    PrintUsage();
    return 1;
}

int cpuPercent = 0;
long memLimitBytes = 0;
uint maxProcs = 0;
ulong netBw = 0;
string? rootFs = null;
bool restrictUi = true;
bool dropPrivs = true;
bool lowIntegrity = false;
bool cleanEnv = true;
int timeoutMs = -1;
var cmdParts = new List<string>();
bool parsingCmd = false;

for (int i = 1; i < args.Length; i++)
{
    if (parsingCmd)
    {
        cmdParts.Add(QuoteIfNeeded(args[i]));
        continue;
    }

    switch (args[i])
    {
        case "--":
            parsingCmd = true;
            break;
        case "--cpu":
            cpuPercent = int.Parse(args[++i]);
            break;
        case "--mem-mb":
            memLimitBytes = long.Parse(args[++i]) * 1024L * 1024L;
            break;
        case "--pids":
            maxProcs = uint.Parse(args[++i]);
            break;
        case "--net-kbps":
            netBw = ulong.Parse(args[++i]) * 1024UL;
            break;
        case "--rootfs":
            rootFs = args[++i];
            break;
        case "--timeout-ms":
            timeoutMs = int.Parse(args[++i]);
            break;
        case "--low-il":
            lowIntegrity = true;
            break;
        case "--no-ui-limit":
            restrictUi = false;
            break;
        case "--no-drop-priv":
            dropPrivs = false;
            break;
        case "--host-env":
            cleanEnv = false;
            break;
        default:
            parsingCmd = true;
            cmdParts.Add(QuoteIfNeeded(args[i]));
            break;
    }
}

string commandLine = cmdParts.Count > 0 ? string.Join(" ", cmdParts) : "cmd.exe";

var config = new ContainerConfig
{
    CommandLine = commandLine,
    RootFsPath = rootFs,
    CpuPercentLimit = cpuPercent,
    MemoryLimitBytes = memLimitBytes,
    MaxActiveProcesses = maxProcs,
    NetMaxBandwidthBytesPerSec = netBw,
    RestrictUi = restrictUi,
    DropPrivileges = dropPrivs,
    LowIntegrity = lowIntegrity,
    CleanEnvironment = cleanEnv,
    TimeoutMs = timeoutMs
};

PrintHeader(config);

try
{
    using var container = new WindowsContainer();
    ContainerMetrics metrics = container.Run(config);
    PrintMetrics(metrics);
    return (int)metrics.ExitCode;
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[CONTAINER ERROR] {ex.Message}");
    return 1;
}

static int RunAutomatedDemo()
{
    Console.WriteLine("=== Windows User-Mode Container Verification Suite ===\n");

    // Demo 1: Environment & Privilege Isolation
    Console.WriteLine("[Test 1] Privilege Stripping & Environment Sandbox");
    using (var c1 = new WindowsContainer())
    {
        var cfg1 = new ContainerConfig
        {
            CommandLine = "cmd.exe /c \"echo USERPROFILE=%USERPROFILE% & whoami /priv\"",
            CpuPercentLimit = 25,
            MemoryLimitBytes = 64 * 1024 * 1024,
            MaxActiveProcesses = 5
        };
        PrintHeader(cfg1);
        var m1 = c1.Run(cfg1);
        PrintMetrics(m1);
    }

    // Demo 2: Active Process Limit (Fork Bomb Prevention)
    Console.WriteLine("\n[Test 2] Active Process Limit (MaxPids = 2, attempting to spawn 3 nested processes)");
    using (var c2 = new WindowsContainer())
    {
        var cfg2 = new ContainerConfig
        {
            // cmd.exe (PID 1) -> cmd.exe (PID 2) -> whoami.exe (PID 3 -> BLOCKED by kernel Job Object)
            CommandLine = "cmd.exe /c \"cmd.exe /c whoami.exe\"",
            MaxActiveProcesses = 2
        };
        PrintHeader(cfg2);
        var m2 = c2.Run(cfg2);
        PrintMetrics(m2);
    }

    // Demo 3: Memory Commit Limit (OOM Enforcement)
    Console.WriteLine("\n[Test 3] Memory Commit Limit (MaxMemory = 32 MB, attempting to allocate 64 MB in PowerShell/dotnet)");
    using (var c3 = new WindowsContainer())
    {
        var cfg3 = new ContainerConfig
        {
            CommandLine = "powershell.exe -NoProfile -Command \"$a = New-Object byte[] (64MB)\"",
            MemoryLimitBytes = 32 * 1024 * 1024
        };
        PrintHeader(cfg3);
        var m3 = c3.Run(cfg3);
        PrintMetrics(m3);
    }

    return 0;
}

static void PrintHeader(ContainerConfig cfg)
{
    Console.WriteLine("----------------------------------------------------------------");
    Console.WriteLine($"[Container Spec] Cmd      : {cfg.CommandLine}");
    Console.WriteLine($"[Container Spec] CPU Cap  : {(cfg.CpuPercentLimit > 0 ? $"{cfg.CpuPercentLimit}%" : "Unlimited")}");
    Console.WriteLine($"[Container Spec] Mem Cap  : {(cfg.MemoryLimitBytes > 0 ? $"{cfg.MemoryLimitBytes / (1024 * 1024)} MB" : "Unlimited")}");
    Console.WriteLine($"[Container Spec] PID Cap  : {(cfg.MaxActiveProcesses > 0 ? cfg.MaxActiveProcesses.ToString() : "Unlimited")}");
    Console.WriteLine($"[Container Spec] Security : DropPrivs={cfg.DropPrivileges}, LowIL={cfg.LowIntegrity}, UIRestrict={cfg.RestrictUi}");
    Console.WriteLine("----------------------------------------------------------------");
}

static void PrintMetrics(ContainerMetrics m)
{
    Console.WriteLine("----------------------------------------------------------------");
    Console.WriteLine($"[Container Exit] Code     : 0x{m.ExitCode:X8} ({m.ExitCode}){(m.TimedOut ? " [TIMED OUT / KILLED]" : "")}");
    Console.WriteLine($"[Container Stat] WallTime : {m.WallClockTime.TotalMilliseconds:F1} ms (User: {m.TotalUserTime.TotalMilliseconds:F1} ms, Kernel: {m.TotalKernelTime.TotalMilliseconds:F1} ms)");
    Console.WriteLine($"[Container Stat] Peak Mem : Job={m.PeakJobMemoryBytes / 1024.0:F1} KB, Proc={m.PeakProcessMemoryBytes / 1024.0:F1} KB");
    Console.WriteLine($"[Container Stat] Processes: TotalSpawned={m.TotalProcessesSpawned}, PageFaults={m.TotalPageFaults}");
    Console.WriteLine($"[Container Stat] I/O Bytes: Read={m.ReadTransferBytes} B, Write={m.WriteTransferBytes} B");
    Console.WriteLine("----------------------------------------------------------------");
}

static string QuoteIfNeeded(string arg) =>
    arg.Contains(' ') && !arg.StartsWith('"') ? $"\"{arg}\"" : arg;

static void PrintUsage()
{
    Console.WriteLine("""
        MinContainerWin - Windows User-Mode Process Container (Job Objects + Restricted Tokens)

        Usage:
          MinContainerWin run [options] -- <command> [args...]
          MinContainerWin demo

        Options:
          --cpu <1-100>       Hard CPU rate limit percentage (JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP)
          --mem-mb <MB>       Hard virtual memory commit limit in MB (JOB_OBJECT_LIMIT_JOB_MEMORY)
          --pids <count>      Maximum concurrent active processes (JOB_OBJECT_LIMIT_ACTIVE_PROCESS)
          --net-kbps <KB/s>   Maximum egress network bandwidth in KB/s (Requires Admin)
          --rootfs <path>     Isolated directory mapped as working dir, USERPROFILE, APPDATA, and TEMP
          --timeout-ms <ms>   Execution timeout in milliseconds before container kill
          --low-il            Set Mandatory Integrity Level to Low (S-1-16-4096)
          --no-ui-limit       Disable UI restrictions (Clipboard, Desktop, DisplaySettings, ExitWindows)
          --no-drop-priv      Do not strip token privileges or Administrators SID
          --host-env          Inherit host environment variables instead of isolated environment block
        """);
}
