using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text;
using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Configs;
using BenchmarkDotNet.Jobs;
using BenchmarkDotNet.Running;

namespace BenchDemo;

public class Program
{
    public static void Main(string[] args)
    {
        string choice = "2";
        if (args.Length > 0)
        {
            choice = args[0];
        }
        else
        {
            Console.WriteLine("請選擇執行模式：");
            Console.WriteLine("1. 執行 BenchmarkDotNet 基準測試 (會自動進行暖機、統計採樣與記憶體分析)");
            Console.WriteLine("2. 執行自製 SimpleBenchmarkEngine (展示 BenchmarkDotNet 核心原理：暖機、迴圈展開、防死代碼消除、GC清理)");
            Console.WriteLine("3. 執行兩者依序展示");
            Console.Write("輸入選項 (1, 2 或 3，預設 2): ");
            choice = Console.ReadLine()?.Trim() ?? "2";
            if (string.IsNullOrEmpty(choice)) choice = "2";
        }

        if (choice == "1")
        {
            RunOfficialBenchmark();
        }
        else if (choice == "3")
        {
            Console.WriteLine("\n========================================================");
            Console.WriteLine("=== [步驟 1] 執行自製 SimpleBenchmarkEngine ===");
            Console.WriteLine("========================================================");
            MyBenchmarkRunner.RunAll();
            
            Console.WriteLine("\n========================================================");
            Console.WriteLine("=== [步驟 2] 執行官方 BenchmarkDotNet ===");
            Console.WriteLine("========================================================");
            RunOfficialBenchmark();
        }
        else
        {
            MyBenchmarkRunner.RunAll();
            Console.WriteLine("\n💡 提示：若要測試官方 BenchmarkDotNet，可執行：");
            Console.WriteLine("   dotnet run -c Release -- 1");
        }
    }

    private static void RunOfficialBenchmark()
    {
        // 為了讓測試在展示時更迅速，我們可套用 ShortRun 配置（減少 iteration 輪數，但保有完整流程）
        var config = ManualConfig.Create(DefaultConfig.Instance)
            .AddJob(Job.ShortRun);

        BenchmarkRunner.Run<StringComparisonBenchmark>(config);
    }
}

// -------------------------------------------------------------
// 1. 待測試的 Benchmark Class (符合 BenchmarkDotNet 標註規範)
// -------------------------------------------------------------
[MemoryDiagnoser] // 追蹤記憶體配置 (Gen0/1/2, Allocated bytes)
public class StringComparisonBenchmark
{
    private string[] _data = null!;

    [Params(200)] // 單一參數維度，快速完成比較
    public int Count { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        _data = new string[Count];
        for (int i = 0; i < Count; i++)
        {
            _data[i] = "Item_" + i;
        }
    }

    [Benchmark(Baseline = true)]
    public string PlusConcat()
    {
        string result = "";
        for (int i = 0; i < _data.Length; i++)
        {
            result += _data[i] + ",";
        }
        return result; // 確保有回傳值，供防最佳化機制使用
    }

    [Benchmark]
    public string StringBuilderConcat()
    {
        var sb = new StringBuilder();
        for (int i = 0; i < _data.Length; i++)
        {
            sb.Append(_data[i]).Append(',');
        }
        return sb.ToString();
    }

    [Benchmark]
    public string StringJoinConcat()
    {
        return string.Join(",", _data);
    }
}
