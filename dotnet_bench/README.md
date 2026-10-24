# C# Benchmark & BenchmarkDotNet 原理剖析與自製引擎

本專案示範如何使用 C# 與 **BenchmarkDotNet (BDN)** 進行基準測試，並自製輕量版基準測試引擎以深入了解其核心原理。

---

## 快速開始

### 1. 下載 BenchmarkDotNet 原始碼（若想研讀官方 source code）
執行專案根目錄的 shell script：
```bash
./download_bdn_src.sh
```
此指令會以 `--depth 1` 快速 clone 最新版本的 BenchmarkDotNet 至 `benchmarkdotnet_src/` 目錄（該目錄已被 `.gitignore` 排除追蹤）。

### 2. 執行基準測試
進入 `BenchDemo` 資料夾：
```bash
cd BenchDemo
```

* **執行自製 SimpleBenchmarkEngine**：
  ```bash
  dotnet run -c Release -- 2
  ```
* **執行官方 BenchmarkDotNet 測試**：
  ```bash
  dotnet run -c Release -- 1
  ```
* **依序展示兩者對比**：
  ```bash
  dotnet run -c Release -- 3
  ```

---

## 專案結構

- [`BenchDemo/Program.cs`](./BenchDemo/Program.cs)：待測類別（包含字串 `+` 串接、`StringBuilder`、`String.Join` 的效能與記憶體對比）及官方 BenchmarkDotNet 啟動入口。
- [`BenchDemo/SimpleBenchmarkEngine.cs`](./BenchDemo/SimpleBenchmarkEngine.cs)：自製的迷你 Benchmark 引擎，包含 7 大核心步驟實作。
- [`download_bdn_src.sh`](./download_bdn_src.sh)：自動下載 BenchmarkDotNet 原始碼的腳本。

---

## 自製 Engine 步驟與 BDN 原始碼核心對照

| 步驟 | 核心原理 | 自製 Engine 實作 | BDN 原始碼位置 |
| :--- | :--- | :--- | :--- |
| **1. Warmup** | JIT 預熱、填滿 CPU Cache | `SimpleBenchmarkEngine.cs` L55-L63 | `Engines/EngineJitStage.cs`<br>`Engines/EngineWarmupStage.cs` |
| **2. Pilot** | 動態推算迭代次數以克服時鐘精度限制 | `DetermineInvokeCount()` | `Engines/EnginePilotStage.cs` |
| **3. Overhead** | 測量空迴圈與計時本身損耗並扣除 | `MeasureOverhead()` | `Engines/RunResults.cs`<br>`Code/DeclarationsProvider.cs` |
| **4. Loop Unrolling** | 迴圈展開降低跳轉指令比率 | 16 次展開調用 | `Code/CodeGenerator.cs` (`Unroll`) |
| **5. Anti-DCE** | 防止死代碼消除 (Dead Code Elimination) | `[MethodImpl(MethodImplOptions.NoInlining)]` | `Engines/DeadCodeEliminationHelper.cs`<br>`Engines/Consumer.cs` |
| **6. GC Isolation** | 記憶體隔離與每千次操作配置採樣 | `GC.GetAllocatedBytesForCurrentThread()` | `Engines/GcStats.cs`<br>`Diagnosers/MemoryDiagnoser.cs` |
| **7. JIT Event 監聽** | 透過 CLR EventSource 監聽確認進入 Tier-1 | （BDN 特有進階特性） | `Engines/JitListener.cs` |
