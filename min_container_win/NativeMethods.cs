using System.Runtime.InteropServices;

namespace MinContainerWin;

internal static class NativeMethods
{
    public const uint INFINITE = 0xFFFFFFFF;
    public const uint FALSE = 0;
    public const uint TRUE = 1;

    // Process Creation Flags
    public const uint CREATE_BREAKAWAY_FROM_JOB = 0x01000000;
    public const uint CREATE_SUSPENDED = 0x00000004;
    public const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    public const uint CREATE_NEW_CONSOLE = 0x00000010;
    public const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;

    // Token Access Rights
    public const uint TOKEN_ASSIGN_PRIMARY = 0x0001;
    public const uint TOKEN_DUPLICATE = 0x0002;
    public const uint TOKEN_IMPERSONATE = 0x0004;
    public const uint TOKEN_QUERY = 0x0008;
    public const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
    public const uint TOKEN_ADJUST_GROUPS = 0x0040;
    public const uint TOKEN_ADJUST_DEFAULT = 0x0080;
    public const uint TOKEN_ADJUST_SESSIONID = 0x0100;
    public const uint TOKEN_ALL_ACCESS = 0xF01FF;

    // Restricted Token Flags
    public const uint DISABLE_MAX_PRIVILEGE = 0x1;
    public const uint SANDBOX_INERT = 0x2;
    public const uint LUA_TOKEN = 0x4;
    public const uint WRITE_RESTRICTED = 0x8;

    // Sid Attributes
    public const uint SE_GROUP_INTEGRITY = 0x00000020;
    public const uint SE_GROUP_INTEGRITY_ENABLED = 0x00000040;

    // Job Object Limit Flags
    public const uint JOB_OBJECT_LIMIT_WORKINGSET = 0x00000001;
    public const uint JOB_OBJECT_LIMIT_PROCESS_TIME = 0x00000002;
    public const uint JOB_OBJECT_LIMIT_JOB_TIME = 0x00000004;
    public const uint JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x00000008;
    public const uint JOB_OBJECT_LIMIT_AFFINITY = 0x00000010;
    public const uint JOB_OBJECT_LIMIT_PRIORITY_CLASS = 0x00000020;
    public const uint JOB_OBJECT_LIMIT_PRESERVE_JOB_TIME = 0x00000040;
    public const uint JOB_OBJECT_LIMIT_SCHEDULING_CLASS = 0x00000080;
    public const uint JOB_OBJECT_LIMIT_PROCESS_MEMORY = 0x00000100;
    public const uint JOB_OBJECT_LIMIT_JOB_MEMORY = 0x00000200;
    public const uint JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x00000400;
    public const uint JOB_OBJECT_LIMIT_BREAKAWAY_OK = 0x00000800;
    public const uint JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK = 0x00001000;
    public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;

    // Job Object UI Restrictions
    public const uint JOB_OBJECT_UILIMIT_HANDLES = 0x00000001;
    public const uint JOB_OBJECT_UILIMIT_READCLIPBOARD = 0x00000002;
    public const uint JOB_OBJECT_UILIMIT_WRITECLIPBOARD = 0x00000004;
    public const uint JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS = 0x00000008;
    public const uint JOB_OBJECT_UILIMIT_DISPLAYSETTINGS = 0x00000010;
    public const uint JOB_OBJECT_UILIMIT_GLOBALATOMS = 0x00000020;
    public const uint JOB_OBJECT_UILIMIT_DESKTOP = 0x00000040;
    public const uint JOB_OBJECT_UILIMIT_EXITWINDOWS = 0x00000080;
    public const uint JOB_OBJECT_UILIMIT_ALL = 0x000000FF;

    // Job Object CPU Rate Control Flags
    public const uint JOB_OBJECT_CPU_RATE_CONTROL_ENABLE = 0x1;
    public const uint JOB_OBJECT_CPU_RATE_CONTROL_WEIGHT_BASED = 0x2;
    public const uint JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP = 0x4;
    public const uint JOB_OBJECT_CPU_RATE_CONTROL_NOTIFY = 0x8;

    // Job Object Net Rate Control Flags
    public const uint JOB_OBJECT_NET_RATE_CONTROL_ENABLE = 0x1;
    public const uint JOB_OBJECT_NET_RATE_CONTROL_MAX_BANDWIDTH = 0x2;

    public enum JOBOBJECTINFOCLASS
    {
        JobObjectBasicAccountingInformation = 1,
        JobObjectBasicLimitInformation = 2,
        JobObjectBasicProcessIdList = 3,
        JobObjectBasicUIRestrictions = 4,
        JobObjectSecurityLimitInformation = 5,
        JobObjectEndOfJobTimeInformation = 6,
        JobObjectAssociateCompletionPortInformation = 7,
        JobObjectBasicAndIoAccountingInformation = 8,
        JobObjectExtendedLimitInformation = 9,
        JobObjectCpuRateControlInformation = 15,
        JobObjectNetRateControlInformation = 32
    }

    public enum TOKEN_INFORMATION_CLASS
    {
        TokenUser = 1,
        TokenGroups,
        TokenPrivileges,
        TokenOwner,
        TokenPrimaryGroup,
        TokenDefaultDacl,
        TokenSource,
        TokenType,
        TokenImpersonationLevel,
        TokenStatistics,
        TokenRestrictedSids,
        TokenSessionId,
        TokenGroupsAndPrivileges,
        TokenSessionReference,
        TokenSandBoxInert,
        TokenAuditPolicy,
        TokenOrigin,
        TokenElevationType,
        TokenLinkedToken,
        TokenElevation,
        TokenHasRestrictions,
        TokenAccessInformation,
        TokenVirtualizationAllowed,
        TokenVirtualizationEnabled,
        TokenIntegrityLevel,
        TokenUIAccess,
        TokenMandatoryPolicy,
        TokenLogonSid
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public nuint MinimumWorkingSetSize;
        public nuint MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public nuint Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public nuint ProcessMemoryLimit;
        public nuint JobMemoryLimit;
        public nuint PeakProcessMemoryUsed;
        public nuint PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_UI_RESTRICTIONS
    {
        public uint UIRestrictionsClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_CPU_RATE_CONTROL_INFORMATION
    {
        public uint ControlFlags;
        public uint CpuRate; // 1-10000 (100 = 1%, 10000 = 100%)
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_NET_RATE_CONTROL_INFORMATION
    {
        public ulong MaxBandwidth;
        public uint ControlFlags;
        public byte DscpTag;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_AND_IO_ACCOUNTING_INFORMATION
    {
        public JOBOBJECT_BASIC_ACCOUNTING_INFORMATION BasicInfo;
        public IO_COUNTERS IoInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SID_AND_ATTRIBUTES
    {
        public nint Sid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct TOKEN_MANDATORY_LABEL
    {
        public SID_AND_ATTRIBUTES Label;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO
    {
        public int cb;
        public string? lpReserved;
        public string? lpDesktop;
        public string? lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public nint lpReserved2;
        public nint hStdInput;
        public nint hStdOutput;
        public nint hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION
    {
        public nint hProcess;
        public nint hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern nint CreateJobObjectW(nint lpJobAttributes, string? lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetInformationJobObject(
        nint hJob,
        JOBOBJECTINFOCLASS JobObjectInfoClass,
        nint lpJobObjectInfo,
        uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool QueryInformationJobObject(
        nint hJob,
        JOBOBJECTINFOCLASS JobObjectInfoClass,
        nint lpJobObjectInfo,
        uint cbJobObjectInfoLength,
        out uint lpReturnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool AssignProcessToJobObject(nint hJob, nint hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool TerminateJobObject(nint hJob, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern nint GetCurrentProcess();

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool OpenProcessToken(
        nint ProcessHandle,
        uint DesiredAccess,
        out nint TokenHandle);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CreateRestrictedToken(
        nint ExistingTokenHandle,
        uint Flags,
        uint DisableSidCount,
        nint SidsToDisable,
        uint DeletePrivilegeCount,
        nint PrivilegesToDelete,
        uint RestrictedSidCount,
        nint SidsToRestrict,
        out nint NewTokenHandle);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ConvertStringSidToSidW(
        string StringSid,
        out nint pSid);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern uint GetLengthSid(nint pSid);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetTokenInformation(
        nint TokenHandle,
        TOKEN_INFORMATION_CLASS TokenInformationClass,
        nint TokenInformation,
        uint TokenInformationLength);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CreateProcessAsUserW(
        nint hToken,
        string? lpApplicationName,
        string lpCommandLine,
        nint lpProcessAttributes,
        nint lpThreadAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool bInheritHandles,
        uint dwCreationFlags,
        nint lpEnvironment,
        string? lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CreateProcessW(
        string? lpApplicationName,
        string lpCommandLine,
        nint lpProcessAttributes,
        nint lpThreadAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool bInheritHandles,
        uint dwCreationFlags,
        nint lpEnvironment,
        string? lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint ResumeThread(nint hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(nint hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetExitCodeProcess(nint hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(nint hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern nint LocalFree(nint hMem);
}
