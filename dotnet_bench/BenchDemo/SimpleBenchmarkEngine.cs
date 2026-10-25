using System.Diagnostics;
using System.Runtime.CompilerServices;

namespace BenchDemo;

/// <summary>
/// 自製的精簡版基準測試引擎 (SimpleBenchmarkEngine)
/// 展示 BenchmarkDotNet 的底層原理：
/// 1. CLR JIT Event 監聽 (JitListener): 精確捕捉 Tier-0 到 Tier-1 的轉變
/// 2. Warmup (暖機): 連續呼叫直到 CLR 發送 Tier-1 事件或達到最大次數
/// 3. Pilot Stage (試探階段): 動態推算迭代次數以克服時鐘精度限制
/// 4. Overhead Deduction (扣除迴圈本底開銷): 消除計時與迴圈本身的額外損耗
/// 5. Loop Unrolling (迴圈展開): 減少 jump/condition 指令對超微小操作測量的干擾
/// 6. Anti-DCE (防死代碼消除): 避免 JIT 判定結果未被使用而把整個方法優化蒸發
/// 7. GC Isolation (垃圾回收隔離與統計): 測量前後強制 GC 清理，並採樣配置量
/// </summary>
public static class MyBenchmarkRunner
{
    public static void RunAll()
    {
        Console.WriteLine("\n[SimpleBenchmarkEngine] 正在對字串串接方法執行基準測試 (資料量: 500 筆)");
        Console.WriteLine(new string('-', 85));

        var bench = new StringComparisonBenchmark { Count = 500 };
        bench.Setup();

        // 比較三個方法，並傳入方法名稱供 CLR EventSource 監聽比對
        var r1 = RunBenchmark("String (+ Concat)", "PlusConcat", () => bench.PlusConcat());
        var r2 = RunBenchmark("StringBuilder", "StringBuilderConcat", () => bench.StringBuilderConcat());
        var r3 = RunBenchmark("String.Join", "StringJoinConcat", () => bench.StringJoinConcat());

        // 印出對比報表
        Console.WriteLine("\n" + new string('=', 85));
        Console.WriteLine($"{"Method",-22} | {"Mean (ns)",14} | {"StdDev (ns)",12} | {"Allocated (Bytes)",18} | {"Ratio",8}");
        Console.WriteLine(new string('-', 85));

        PrintRow(r1, r1.MeanNs);
        PrintRow(r2, r1.MeanNs);
        PrintRow(r3, r1.MeanNs);
        Console.WriteLine(new string('=', 85));
    }

    private static void PrintRow(BenchmarkResult r, double baselineMean)
    {
        double ratio = r.MeanNs / baselineMean;
        Console.WriteLine($"{r.Name,-22} | {r.MeanNs,14:F2} | {r.StdDevNs,12:F2} | {r.AllocatedBytes,18:N0} | {ratio,8:F2}x");
    }

    public record BenchmarkResult(string Name, double MeanNs, double StdDevNs, long AllocatedBytes);

    public static BenchmarkResult RunBenchmark<T>(string displayName, string methodName, Func<T> action)
    {
        Console.Write($"--> 正在測試 [{displayName}] ... ");

        // ==========================================
        // 原理 1: 建立極簡 CLR JIT Event 監聽器
        // ==========================================
        using var jitListener = new SimpleJitListener(methodName);

        // ==========================================
        // 原理 2: Warmup (暖機階段 + JIT 事件確認)
        // ==========================================
        // 持續呼叫方法觸發 CLR 分層編譯閥值 (預設約 30 次呼叫即觸發 Tier-1 編譯)
        int warmCount = 0;
        while (!jitListener.IsTier1Promoted && warmCount < 500)
        {
            T warmResult = action();
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(warmResult);
            warmCount++;
            // 稍作微小暫停讓 CLR 背景編譯執行緒有機會處理佇列
            if (warmCount % 50 == 0) Thread.Sleep(10);
        }

        // 如果在短時間內背景編譯已觸發，等待其訊號到位（最多等 100ms）
        jitListener.WaitForTier1(TimeSpan.FromMilliseconds(100));

        // ==========================================
        // 原理 3: Pilot 階段 (動態決定每個 Iteration 的 Invoke 次數)
        // ==========================================
        int unrollFactor = 16;
        long invokeCount = DetermineInvokeCount(action, targetIterationMs: 20, unrollFactor);

        // ==========================================
        // 原理 4: 測量 Overhead (空迴圈開銷)
        // ==========================================
        double overheadPerOpNs = MeasureOverhead(invokeCount, unrollFactor);

        // ==========================================
        // 原理 5: 記憶體配置測量 (GC Diagnoser 原理)
        // ==========================================
        ForceGarbageCollection();
        long memBefore = GC.GetAllocatedBytesForCurrentThread();
        T memSample = action();
        DeadCodeEliminationHelper.KeepAliveWithoutBoxing(memSample);
        long memAfter = GC.GetAllocatedBytesForCurrentThread();
        long allocatedBytes = memAfter - memBefore;

        // ==========================================
        // 原理 6: Actual Iterations 實際統計測量
        // ==========================================
        int iterationCount = 15;
        double[] iterationTimePerOpNs = new double[iterationCount];

        for (int iter = 0; iter < iterationCount; iter++)
        {
            ForceGarbageCollection();

            long totalOps = invokeCount * unrollFactor;
            var sw = Stopwatch.StartNew();

            for (long i = 0; i < invokeCount; i++)
            {
                // 迴圈展開 16 次
                T v0 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v0);
                T v1 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v1);
                T v2 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v2);
                T v3 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v3);
                T v4 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v4);
                T v5 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v5);
                T v6 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v6);
                T v7 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v7);
                T v8 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v8);
                T v9 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v9);
                T v10 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v10);
                T v11 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v11);
                T v12 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v12);
                T v13 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v13);
                T v14 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v14);
                T v15 = action(); DeadCodeEliminationHelper.KeepAliveWithoutBoxing(v15);
            }

            sw.Stop();

            double totalNs = sw.Elapsed.TotalMilliseconds * 1_000_000.0;
            double netNsPerOp = (totalNs / totalOps) - overheadPerOpNs;
            if (netNsPerOp < 0) netNsPerOp = 0;

            iterationTimePerOpNs[iter] = netNsPerOp;
        }

        // ==========================================
        // 原理 7: 統計匯總 (Mean, StdDev)
        // ==========================================
        double mean = iterationTimePerOpNs.Average();
        double sumSquares = iterationTimePerOpNs.Select(val => Math.Pow(val - mean, 2)).Sum();
        double stdDev = Math.Sqrt(sumSquares / (iterationCount - 1));

        Console.WriteLine($"完成！ (暖機次數: {warmCount}, Tier-1 狀態: {(jitListener.IsTier1Promoted ? "已晉升最高階" : "未晉升/即時編譯")})");
        return new BenchmarkResult(displayName, mean, stdDev, allocatedBytes);
    }

    private static long DetermineInvokeCount<T>(Func<T> action, double targetIterationMs, int unrollFactor)
    {
        var sw = Stopwatch.StartNew();
        T res = action();
        DeadCodeEliminationHelper.KeepAliveWithoutBoxing(res);
        sw.Stop();

        double elapsedMs = sw.Elapsed.TotalMilliseconds;
        if (elapsedMs <= 0.0001) elapsedMs = 0.0001;

        double neededInvocations = targetIterationMs / elapsedMs;
        long loopCount = (long)(neededInvocations / unrollFactor);
        return Math.Max(1, loopCount);
    }

    private static double MeasureOverhead(long invokeCount, int unrollFactor)
    {
        long totalOps = invokeCount * unrollFactor;
        var sw = Stopwatch.StartNew();
        for (long i = 0; i < invokeCount; i++)
        {
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(1);
        }
        sw.Stop();
        return (sw.Elapsed.TotalMilliseconds * 1_000_000.0) / totalOps;
    }

    private static void ForceGarbageCollection()
    {
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();
    }
}

public static class DeadCodeEliminationHelper
{
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static void KeepAliveWithoutBoxing<T>(T value) { }
}
