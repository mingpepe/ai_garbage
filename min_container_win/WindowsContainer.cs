using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace MinContainerWin;

public sealed class ContainerConfig
{
    public string CommandLine { get; init; } = "cmd.exe";
    public string? RootFsPath { get; init; }
    public int CpuPercentLimit { get; init; } = 0;         // 0 = unlimited, 1-100 = percentage cap
    public long MemoryLimitBytes { get; init; } = 0;       // 0 = unlimited, max committed memory for job
    public uint MaxActiveProcesses { get; init; } = 0;     // 0 = unlimited
    public ulong NetMaxBandwidthBytesPerSec { get; init; } = 0; // 0 = unlimited
    public bool RestrictUi { get; init; } = true;          // Block clipboard, desktop, display, exit windows
    public bool DropPrivileges { get; init; } = true;      // Strip privileges & Administrators SID (LUA + DISABLE_MAX_PRIVILEGE)
    public bool LowIntegrity { get; init; } = false;       // Set token integrity to Low (S-1-16-4096)
    public bool CleanEnvironment { get; init; } = true;    // Sanitize environment variables inside rootfs
    public int TimeoutMs { get; init; } = -1;              // -1 = infinite
}

public sealed class ContainerMetrics
{
    public uint ExitCode { get; init; }
    public bool TimedOut { get; init; }
    public TimeSpan WallClockTime { get; init; }
    public TimeSpan TotalUserTime { get; init; }
    public TimeSpan TotalKernelTime { get; init; }
    public ulong PeakJobMemoryBytes { get; init; }
    public ulong PeakProcessMemoryBytes { get; init; }
    public uint TotalProcessesSpawned { get; init; }
    public uint ActiveProcesses { get; init; }
    public uint TotalPageFaults { get; init; }
    public ulong ReadTransferBytes { get; init; }
    public ulong WriteTransferBytes { get; init; }
}

public sealed class WindowsContainer : IDisposable
{
    private nint _hJob;
    private bool _disposed;

    public WindowsContainer()
    {
        _hJob = NativeMethods.CreateJobObjectW(nint.Zero, null);
        if (_hJob == nint.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateJobObjectW failed.");
    }

    public unsafe void ApplyJobLimits(ContainerConfig config)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        // 1. Extended Limit Information (Memory, Active Process Count, Kill on Job Close, Die on Unhandled Exception)
        var extendedLimits = new NativeMethods.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        uint limitFlags = NativeMethods.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
                          NativeMethods.JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;

        if (config.MaxActiveProcesses > 0)
        {
            limitFlags |= NativeMethods.JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
            extendedLimits.BasicLimitInformation.ActiveProcessLimit = config.MaxActiveProcesses;
        }

        if (config.MemoryLimitBytes > 0)
        {
            limitFlags |= NativeMethods.JOB_OBJECT_LIMIT_JOB_MEMORY | NativeMethods.JOB_OBJECT_LIMIT_PROCESS_MEMORY;
            extendedLimits.JobMemoryLimit = (nuint)config.MemoryLimitBytes;
            extendedLimits.ProcessMemoryLimit = (nuint)config.MemoryLimitBytes;
        }

        extendedLimits.BasicLimitInformation.LimitFlags = limitFlags;

        if (!NativeMethods.SetInformationJobObject(
                _hJob,
                NativeMethods.JOBOBJECTINFOCLASS.JobObjectExtendedLimitInformation,
                (nint)(&extendedLimits),
                (uint)sizeof(NativeMethods.JOBOBJECT_EXTENDED_LIMIT_INFORMATION)))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "SetInformationJobObject(ExtendedLimitInformation) failed.");
        }

        // 2. CPU Hard Cap Control
        if (config.CpuPercentLimit is > 0 and <= 100)
        {
            var cpuLimit = new NativeMethods.JOBOBJECT_CPU_RATE_CONTROL_INFORMATION
            {
                ControlFlags = NativeMethods.JOB_OBJECT_CPU_RATE_CONTROL_ENABLE |
                               NativeMethods.JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP,
                CpuRate = (uint)(config.CpuPercentLimit * 100) // Units of 1/100th percent
            };

            if (!NativeMethods.SetInformationJobObject(
                    _hJob,
                    NativeMethods.JOBOBJECTINFOCLASS.JobObjectCpuRateControlInformation,
                    (nint)(&cpuLimit),
                    (uint)sizeof(NativeMethods.JOBOBJECT_CPU_RATE_CONTROL_INFORMATION)))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetInformationJobObject(CpuRateControlInformation) failed.");
            }
        }

        // 3. UI Restrictions (Clipboard, Window Handles, System Parameters, Desktop, ExitWindows)
        if (config.RestrictUi)
        {
            var uiLimit = new NativeMethods.JOBOBJECT_BASIC_UI_RESTRICTIONS
            {
                UIRestrictionsClass = NativeMethods.JOB_OBJECT_UILIMIT_ALL
            };

            if (!NativeMethods.SetInformationJobObject(
                    _hJob,
                    NativeMethods.JOBOBJECTINFOCLASS.JobObjectBasicUIRestrictions,
                    (nint)(&uiLimit),
                    (uint)sizeof(NativeMethods.JOBOBJECT_BASIC_UI_RESTRICTIONS)))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetInformationJobObject(BasicUIRestrictions) failed.");
            }
        }

        // 4. Network Rate Control (Requires administrative privilege if enabled)
        if (config.NetMaxBandwidthBytesPerSec > 0)
        {
            var netLimit = new NativeMethods.JOBOBJECT_NET_RATE_CONTROL_INFORMATION
            {
                ControlFlags = NativeMethods.JOB_OBJECT_NET_RATE_CONTROL_ENABLE |
                               NativeMethods.JOB_OBJECT_NET_RATE_CONTROL_MAX_BANDWIDTH,
                MaxBandwidth = config.NetMaxBandwidthBytesPerSec,
                DscpTag = 0
            };

            if (!NativeMethods.SetInformationJobObject(
                    _hJob,
                    NativeMethods.JOBOBJECTINFOCLASS.JobObjectNetRateControlInformation,
                    (nint)(&netLimit),
                    (uint)sizeof(NativeMethods.JOBOBJECT_NET_RATE_CONTROL_INFORMATION)))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetInformationJobObject(NetRateControlInformation) failed (Admin privilege required for network QoS).");
            }
        }
    }

    public ContainerMetrics Run(ContainerConfig config)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        ApplyJobLimits(config);

        string workingDir = PrepareRootFs(config.RootFsPath);
        nint hRestrictedToken = nint.Zero;
        nint hEnvBlock = nint.Zero;
        NativeMethods.PROCESS_INFORMATION pi = default;

        try
        {
            if (config.DropPrivileges || config.LowIntegrity)
            {
                hRestrictedToken = BuildRestrictedToken(config.LowIntegrity);
            }

            uint creationFlags = NativeMethods.CREATE_SUSPENDED;
            if (config.CleanEnvironment)
            {
                hEnvBlock = BuildEnvironmentBlock(workingDir);
                creationFlags |= NativeMethods.CREATE_UNICODE_ENVIRONMENT;
            }

            var si = new NativeMethods.STARTUPINFO
            {
                cb = Marshal.SizeOf<NativeMethods.STARTUPINFO>()
            };

            bool created;
            if (hRestrictedToken != nint.Zero)
            {
                created = NativeMethods.CreateProcessAsUserW(
                    hRestrictedToken,
                    null,
                    config.CommandLine,
                    nint.Zero,
                    nint.Zero,
                    false,
                    creationFlags,
                    hEnvBlock,
                    workingDir,
                    ref si,
                    out pi);
            }
            else
            {
                created = NativeMethods.CreateProcessW(
                    null,
                    config.CommandLine,
                    nint.Zero,
                    nint.Zero,
                    false,
                    creationFlags,
                    hEnvBlock,
                    workingDir,
                    ref si,
                    out pi);
            }

            if (!created)
                throw new Win32Exception(Marshal.GetLastWin32Error(), $"Failed to spawn process: {config.CommandLine}");

            // Bind suspended process to Job Object before its initial thread executes instructions
            if (!NativeMethods.AssignProcessToJobObject(_hJob, pi.hProcess))
            {
                NativeMethods.TerminateJobObject(_hJob, 1);
                throw new Win32Exception(Marshal.GetLastWin32Error(), "AssignProcessToJobObject failed.");
            }

            var sw = System.Diagnostics.Stopwatch.StartNew();

            if (NativeMethods.ResumeThread(pi.hThread) == unchecked((uint)-1))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "ResumeThread failed.");

            uint waitMs = config.TimeoutMs < 0 ? NativeMethods.INFINITE : (uint)config.TimeoutMs;
            uint waitResult = NativeMethods.WaitForSingleObject(pi.hProcess, waitMs);
            bool timedOut = false;

            if (waitResult == 0x00000102) // WAIT_TIMEOUT
            {
                timedOut = true;
                NativeMethods.TerminateJobObject(_hJob, 137);
                NativeMethods.WaitForSingleObject(pi.hProcess, 5000);
            }

            sw.Stop();

            if (!NativeMethods.GetExitCodeProcess(pi.hProcess, out uint exitCode))
                exitCode = 1;

            // Terminate any remaining background child processes inside the container job
            NativeMethods.TerminateJobObject(_hJob, exitCode);

            return CollectMetrics(exitCode, timedOut, sw.Elapsed);
        }
        finally
        {
            if (pi.hThread != nint.Zero) NativeMethods.CloseHandle(pi.hThread);
            if (pi.hProcess != nint.Zero) NativeMethods.CloseHandle(pi.hProcess);
            if (hRestrictedToken != nint.Zero) NativeMethods.CloseHandle(hRestrictedToken);
            if (hEnvBlock != nint.Zero) Marshal.FreeHGlobal(hEnvBlock);
        }
    }

    private static unsafe nint BuildRestrictedToken(bool setLowIntegrity)
    {
        if (!NativeMethods.OpenProcessToken(
                NativeMethods.GetCurrentProcess(),
                NativeMethods.TOKEN_DUPLICATE |
                NativeMethods.TOKEN_ASSIGN_PRIMARY |
                NativeMethods.TOKEN_QUERY |
                NativeMethods.TOKEN_ADJUST_DEFAULT |
                NativeMethods.TOKEN_ADJUST_PRIVILEGES,
                out nint hCurrentToken))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcessToken failed.");
        }

        try
        {
            // Strip all privileges except SeChangeNotifyPrivilege and disable Administrators SID
            uint flags = NativeMethods.DISABLE_MAX_PRIVILEGE | NativeMethods.LUA_TOKEN;
            if (!NativeMethods.CreateRestrictedToken(
                    hCurrentToken,
                    flags,
                    0, nint.Zero,
                    0, nint.Zero,
                    0, nint.Zero,
                    out nint hRestrictedToken))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateRestrictedToken failed.");
            }

            if (setLowIntegrity)
            {
                // S-1-16-4096 = Low Mandatory Level
                if (!NativeMethods.ConvertStringSidToSidW("S-1-16-4096", out nint pLowSid))
                {
                    NativeMethods.CloseHandle(hRestrictedToken);
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "ConvertStringSidToSidW(LowIntegrity) failed.");
                }

                try
                {
                    var tml = new NativeMethods.TOKEN_MANDATORY_LABEL
                    {
                        Label = new NativeMethods.SID_AND_ATTRIBUTES
                        {
                            Sid = pLowSid,
                            Attributes = NativeMethods.SE_GROUP_INTEGRITY
                        }
                    };

                    uint tmlSize = (uint)sizeof(NativeMethods.TOKEN_MANDATORY_LABEL) + NativeMethods.GetLengthSid(pLowSid);
                    if (!NativeMethods.SetTokenInformation(
                            hRestrictedToken,
                            NativeMethods.TOKEN_INFORMATION_CLASS.TokenIntegrityLevel,
                            (nint)(&tml),
                            tmlSize))
                    {
                        NativeMethods.CloseHandle(hRestrictedToken);
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "SetTokenInformation(TokenIntegrityLevel) failed.");
                    }
                }
                finally
                {
                    NativeMethods.LocalFree(pLowSid);
                }
            }

            return hRestrictedToken;
        }
        finally
        {
            NativeMethods.CloseHandle(hCurrentToken);
        }
    }

    private static string PrepareRootFs(string? rootFsPath)
    {
        string targetPath = string.IsNullOrWhiteSpace(rootFsPath)
            ? Path.Combine(Path.GetTempPath(), "min_container_rootfs", Guid.NewGuid().ToString("N")[..8])
            : Path.GetFullPath(rootFsPath);

        Directory.CreateDirectory(targetPath);
        Directory.CreateDirectory(Path.Combine(targetPath, "tmp"));
        Directory.CreateDirectory(Path.Combine(targetPath, "appdata"));
        return targetPath;
    }

    private static nint BuildEnvironmentBlock(string rootFs)
    {
        string systemRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? @"C:\Windows";
        string tmpDir = Path.Combine(rootFs, "tmp");
        string appDataDir = Path.Combine(rootFs, "appdata");

        var envVars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["CONTAINER"] = "1",
            ["CONTAINER_ROOT"] = rootFs,
            ["USERPROFILE"] = rootFs,
            ["HOMEDRIVE"] = Path.GetPathRoot(rootFs)?.TrimEnd('\\') ?? "C:",
            ["HOMEPATH"] = rootFs[2..],
            ["APPDATA"] = appDataDir,
            ["LOCALAPPDATA"] = appDataDir,
            ["TEMP"] = tmpDir,
            ["TMP"] = tmpDir,
            ["SystemRoot"] = systemRoot,
            ["windir"] = systemRoot,
            ["ComSpec"] = Path.Combine(systemRoot, "System32", "cmd.exe"),
            ["PATH"] = $"{Path.Combine(systemRoot, "System32")};{systemRoot};{Path.Combine(systemRoot, "System32", "Wbem")};{Path.Combine(systemRoot, "System32", "WindowsPowerShell", "v1.0")}",
            ["PATHEXT"] = ".COM;.EXE;.BAT;.CMD;.PS1"
        };

        // Win32 Unicode environment block requires null-terminated "KEY=VALUE\0" pairs followed by an extra '\0'
        var sb = new StringBuilder();
        foreach (var kv in envVars.OrderBy(k => k.Key, StringComparer.OrdinalIgnoreCase))
        {
            sb.Append(kv.Key).Append('=').Append(kv.Value).Append('\0');
        }
        sb.Append('\0');

        byte[] unicodeBytes = Encoding.Unicode.GetBytes(sb.ToString());
        nint ptr = Marshal.AllocHGlobal(unicodeBytes.Length);
        Marshal.Copy(unicodeBytes, 0, ptr, unicodeBytes.Length);
        return ptr;
    }

    private unsafe ContainerMetrics CollectMetrics(uint exitCode, bool timedOut, TimeSpan wallClock)
    {
        var accounting = new NativeMethods.JOBOBJECT_BASIC_AND_IO_ACCOUNTING_INFORMATION();
        NativeMethods.QueryInformationJobObject(
            _hJob,
            NativeMethods.JOBOBJECTINFOCLASS.JobObjectBasicAndIoAccountingInformation,
            (nint)(&accounting),
            (uint)sizeof(NativeMethods.JOBOBJECT_BASIC_AND_IO_ACCOUNTING_INFORMATION),
            out _);

        var extended = new NativeMethods.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        NativeMethods.QueryInformationJobObject(
            _hJob,
            NativeMethods.JOBOBJECTINFOCLASS.JobObjectExtendedLimitInformation,
            (nint)(&extended),
            (uint)sizeof(NativeMethods.JOBOBJECT_EXTENDED_LIMIT_INFORMATION),
            out _);

        return new ContainerMetrics
        {
            ExitCode = exitCode,
            TimedOut = timedOut,
            WallClockTime = wallClock,
            TotalUserTime = TimeSpan.FromTicks(accounting.BasicInfo.TotalUserTime),
            TotalKernelTime = TimeSpan.FromTicks(accounting.BasicInfo.TotalKernelTime),
            PeakJobMemoryBytes = extended.PeakJobMemoryUsed,
            PeakProcessMemoryBytes = extended.PeakProcessMemoryUsed,
            TotalProcessesSpawned = accounting.BasicInfo.TotalProcesses,
            ActiveProcesses = accounting.BasicInfo.ActiveProcesses,
            TotalPageFaults = accounting.BasicInfo.TotalPageFaultCount,
            ReadTransferBytes = accounting.IoInfo.ReadTransferCount,
            WriteTransferBytes = accounting.IoInfo.WriteTransferCount
        };
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            if (_hJob != nint.Zero)
            {
                NativeMethods.CloseHandle(_hJob);
                _hJob = nint.Zero;
            }
            _disposed = true;
        }
    }
}
