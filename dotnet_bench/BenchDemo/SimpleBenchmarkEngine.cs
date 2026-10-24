using System.Diagnostics;
using System.Runtime.CompilerServices;

namespace BenchDemo;

/// <summary>
/// 自製的精簡版基準測試引擎 (SimpleBenchmarkEngine)
/// 展示 BenchmarkDotNet 的底層原理：
/// 1. Warmup (暖機): 觸發 JIT 編譯與 Tier-1 優化，消除冷啟動偏差
/// 2. Pilot Stage (試探階段): 自動尋找合適的 iteration 執行次數，保證每次採樣時間足以克服時鐘精度問題
/// 3. Overhead Deduction (扣除迴圈本底開銷): 消除計時與迴圈本身的額外損耗
/// 4. Loop Unrolling (迴圈展開): 減少 jump/condition 指令對超微小操作測量的干擾
/// 5. Anti-DCE (防死代碼消除): 避免 JIT 判定結果未被使用而把整個方法優化蒸發
/// 6. GC Isolation (垃圾回收隔離與統計): 測量前後強制 GC 清理，並採樣配置量
/// 7. Statistical Aggregation (統計指標): 計算 Mean, StdDev, Median 等
/// </summary>
public static class MyBenchmarkRunner
{
    public static void RunAll()
    {
        Console.WriteLine("\n[SimpleBenchmarkEngine] 正在對字串串接方法執行基準測試 (資料量: 500 筆)");
        Console.WriteLine(new string('-', 85));

        var bench = new StringComparisonBenchmark { Count = 500 };
        bench.Setup();

        // 比較三個方法
        var r1 = RunBenchmark("String (+ Concat)", () => bench.PlusConcat());
        var r2 = RunBenchmark("StringBuilder", () => bench.StringBuilderConcat());
        var r3 = RunBenchmark("String.Join", () => bench.StringJoinConcat());

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

    public static BenchmarkResult RunBenchmark<T>(string name, Func<T> action)
    {
        Console.Write($"--> 正在測試 [{name}] ... ");

        // ==========================================
        // 原理 1: Warmup (暖機階段)
        // ==========================================
        // 目的：讓 JIT 即時編譯函式、載入相關組件、填滿 CPU Cache，避免 Cold Start 嚴重拉高數值
        for (int i = 0; i < 50; i++)
        {
            T warmResult = action();
            DeadCodeEliminationHelper.KeepAliveWithoutBoxing(warmResult);
        }

        // ==========================================
        // 原理 2: Pilot 階段 (動態決定每個 Iteration 的 Invoke 次數)
        // ==========================================
        // 為了達到足夠的測量解析度（例如每次測量至少 10ms ~ 30ms），
        // 必須讓極快的方法在一輪 iteration 內執行多次。
        int unrollFactor = 16; // BenchmarkDotNet 預設常用 16 展開
        long invokeCount = DetermineInvokeCount(action, targetIterationMs: 20, unrollFactor);

        // ==========================================
        // 原理 3: 測量 Overhead (空迴圈開銷)
        // ==========================================
        // 迴圈本身與時間戳獲取也有成本，需計算並在稍後扣除
        double overheadPerOpNs = MeasureOverhead(invokeCount, unrollFactor);

        // ==========================================
        // 原理 4: 記憶體配置測量 (GC Diagnoser 原理)
        // ==========================================
        ForceGarbageCollection();
        long memBefore = GC.GetAllocatedBytesForCurrentThread();
        T memSample = action();
        DeadCodeEliminationHelper.KeepAliveWithoutBoxing(memSample);
        long memAfter = GC.GetAllocatedBytesForCurrentThread();
        long allocatedBytes = memAfter - memBefore;

        // ==========================================
        // 原理 5: Actual Iterations 實際統計測量
        // ==========================================
        int iterationCount = 15;
        double[] iterationTimePerOpNs = new double[iterationCount];

        for (int iter = 0; iter < iterationCount; iter++)
        {
            // 每次 iteration 前強制穩定記憶體環境
            ForceGarbageCollection();

            long totalOps = invokeCount * unrollFactor;
            var sw = Stopwatch.StartNew();

            // 迴圈展開執行
            for (long i = 0; i < invokeCount; i++)
            {
                // Unroll 16 次
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

            double totalNs = (sw.Elapsed.TotalMilliseconds * 1_000_000.0);
            double netNsPerOp = (totalNs / totalOps) - overheadPerOpNs;
            if (netNsPerOp < 0) netNsPerOp = 0;

            iterationTimePerOpNs[iter] = netNsPerOp;
        }

        // ==========================================
        // 原理 6: 統計匯總 (Mean, StdDev)
        // ==========================================
        double mean = iterationTimePerOpNs.Average();
        double sumSquares = iterationTimePerOpNs.Select(val => Math.Pow(val - mean, 2)).Sum();
        double stdDev = Math.Sqrt(sumSquares / (iterationCount - 1));

        Console.WriteLine("完成！");
        return new BenchmarkResult(name, mean, stdDev, allocatedBytes);
    }

    private static long DetermineInvokeCount<T>(Func<T> action, double targetIterationMs, int unrollFactor)
    {
        // 快速試跑 1 次評估單次耗時
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
            // 空操作，測量純迴圈與計時本身耗時
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

/// <summary>
/// 原理 7: 防死代碼消除 (Dead Code Elimination Helper)
/// 參考 BenchmarkDotNet.Engines.DeadCodeEliminationHelper 的實作。
/// 透過 [MethodImpl(MethodImplOptions.NoInlining)] 強制不內聯，
/// 讓 JIT 編譯器不敢隨意將運算結果或函式呼叫整段裁掉。
/// </summary>
public static class DeadCodeEliminationHelper
{
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static void KeepAliveWithoutBoxing<T>(T value)
    {
        // 空函式體，但編譯器不能將傳遞給此方法的參數視為未使用而裁減掉！
    }
}
