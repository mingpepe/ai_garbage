using System.Diagnostics;
using System.Diagnostics.Tracing;
using System.Reflection;
using System.Runtime.CompilerServices;

namespace BenchDemo;

/// <summary>
/// 極簡版 CLR JIT Tier-1 事件監聽器 (約 60 行)
/// 原理：
/// 1. 繼承 EventListener，向 CLR 註冊監聽 "Microsoft-Windows-DotNETRuntime"
/// 2. 指定 JitKeyword (0x10)，捕捉 MethodLoadVerbose 事件
/// 3. 從 MethodFlags 的 bits [7..9] 提取當前編譯的 Tier
///    tier == 4 即為 OptimizedTier1 (最高最佳化等級)
/// </summary>
public sealed class SimpleJitListener : EventListener
{
    private const string DotNetRuntimeSourceName = "Microsoft-Windows-DotNETRuntime";
    private const EventKeywords JitKeyword = (EventKeywords)0x10;

    private readonly string _targetMethodName;
    private readonly ManualResetEventSlim _tier1Ready = new(false);

    public bool IsTier1Promoted => _tier1Ready.IsSet;

    public SimpleJitListener(string targetMethodName)
    {
        _targetMethodName = targetMethodName;
    }

    protected override void OnEventSourceCreated(EventSource eventSource)
    {
        // 當發現 CLR Runtime 的 EventSource 時，訂閱 JIT 事件
        if (eventSource.Name == DotNetRuntimeSourceName)
        {
            EnableEvents(eventSource, EventLevel.Verbose, JitKeyword);
        }
    }

    protected override void OnEventWritten(EventWrittenEventArgs e)
    {
        // 只關注方法編譯事件 (MethodLoadVerbose_V1, V2 等)
        if (e.EventName == null || !e.EventName.StartsWith("MethodLoadVerbose", StringComparison.Ordinal))
            return;

        var payloadNames = e.PayloadNames;
        var payload = e.Payload;
        if (payloadNames == null || payload == null) return;

        int nameIdx = payloadNames.IndexOf("MethodName");
        int flagsIdx = payloadNames.IndexOf("MethodFlags");
        if (nameIdx < 0 || flagsIdx < 0) return;

        string? methodName = payload[nameIdx] as string;
        if (methodName != _targetMethodName) return;

        // 核心密碼：bits [7..9] 代表 Optimization Tier
        long flags = Convert.ToInt64(payload[flagsIdx]);
        long tier = (flags >> 7) & 0x7;

        string tierName = tier switch
        {
            1 => "MinOptJitted (無優化)",
            2 => "Optimized (直接最高優化)",
            3 => "QuickJittedTier0 (Tier-0 快速初版)",
            4 => "OptimizedTier1 (🔥 最高階 Tier-1 優化完成!)",
            5 => "OptimizedTier1OSR (熱迴圈 OSR 替換)",
            _ => $"Tier-{tier}"
        };

        Console.WriteLine($"\n      [CLR Event 攔截] 方法 '{methodName}' JIT 事件觸發 -> {tierName}");

        // 如果達到 Tier-1 (4) 或直接 Optimized (2)，代表達到最終最佳化
        if (tier == 4 || tier == 2)
        {
            _tier1Ready.Set();
        }
    }

    /// <summary>
    /// 等待 CLR 將此方法最佳化完畢（可指定逾時）
    /// </summary>
    public bool WaitForTier1(TimeSpan timeout)
    {
        return _tier1Ready.Wait(timeout);
    }
}
