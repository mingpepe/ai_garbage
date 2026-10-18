# Dual-Core RV32IA Microarchitecture Emulator (C & Verilog RTL + Web UI)

一個雙核心 **RISC-V (RV32IA)** 週期精確 (Cycle-Accurate) 模擬器，同時提供 **C 語言版本 (`emu_c/`)** 與 **Verilog RTL 硬體描述語言版本 (`emu_verilog/`)**，並內建互動式 **Web UI (`web_ui/`)** 與 **雙核心 GDB Server (`emu_c/gdb_stub.c`)**。

本專案旨在從韌體 (FW) 與硬體 (HW) 兩個層面清楚展示：
1. **Atomic 指令與 Spinlock 實作**：韌體如何用 `lr.w`/`sc.w` 與 `amoswap.w` 實作 Spinlock，以及硬體需要哪些結構（Reservation Register、Cache Snoop Invalidation、Store Buffer Drain、Cache Line Exclusive Lock）。
2. **CPU → Store Buffer → L1 Cache → MESI Snooping Bus 通訊細節**：Store Buffer 寫入緩衝、Store-to-Load Forwarding（寫後讀直接轉發）、Silent Upgrade (`E -> M`)、Dirty Snoop Flush (`M -> S`) 與 Write Invalidate (`BusUpgr: S -> I`)。
3. **CPU 層級的 Instruction Reordering (指令重排)**：
   - **Pipeline Out-of-Order Execution (4-Entry ROB)**：當 `ROB[0]` 因 L1 Cache Miss 卡住 (`MEM_WAIT`) 時，有 RAW 依賴的指令進入 `WAIT_DEP`，而無依賴的後續 ALU 指令與 L1 Hit Load 會提前亂序執行 (`OOO_DONE`)。
   - **Store-Load Memory Reordering (Litmus Test `X=1; r0=Y` || `Y=1; r1=X`)**：Store 進入 Store Buffer 後，年輕的 Load 繞過 Store Buffer 直接命中 L1 Cache (`S` state)，導致兩個 Core 同時讀到舊值 (`r0 = 0, r1 = 0`)；以及 `fence rw, rw` 如何透過清空 Store Buffer 解決重排問題。

> 完整硬體/韌體深度原理與週期導覽亦同步記錄於 [`readme.txt`](file:///home/kk/ai_garbage/mcu_cache_atomic/readme.txt)。

---

## 1. 快速開始 (Quick Start)

執行主腳本即可一鍵編譯 RISC-V 韌體、C 模擬器、Verilog RTL 模擬器、執行所有測試、驗證 C 與 Verilog 100% 週期等價，並啟動 Web UI：

```bash
chmod +x build_and_run.sh
./build_and_run.sh
```

若僅需編譯、執行與驗證（不啟動 Web Server）：

```bash
./build_and_run.sh --no-server
```

啟動後請在瀏覽器開啟：**http://localhost:8080**

---

## 2. 如何在 VS Code 中 Single-Step Debug 韌體 (FW) 與硬體模擬器

本專案已在 C 模擬器 (`emu_c`) 內建雙核心 **GDB Remote Serial Protocol (RSP) Server** ([`emu_c/gdb_stub.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_c/gdb_stub.c))，並已設定好 [`.vscode/launch.json`](file:///home/kk/ai_garbage/mcu_cache_atomic/.vscode/launch.json)、[`.vscode/tasks.json`](file:///home/kk/ai_garbage/mcu_cache_atomic/.vscode/tasks.json) 與 [`scripts/start_gdb_server.sh`](file:///home/kk/ai_garbage/mcu_cache_atomic/scripts/start_gdb_server.sh)。

### 方法一：直接在 VS Code 中 Single-Step 除錯 RISC-V 韌體 (`.c` / `.h` / `.S`)
1. 用 VS Code 開啟本專案目錄 (`/home/kk/ai_garbage/mcu_cache_atomic`)，確認已安裝官方 `C/C++` (`ms-vscode.cpptools`) 擴充套件。
2. 開啟韌體原始碼（[`fw/demo1_sb_mesi.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/fw/demo1_sb_mesi.c)、[`fw/demo2_spinlock.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/fw/demo2_spinlock.c)、[`fw/demo3_reorder.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/fw/demo3_reorder.c) 或 [`fw/atomic_spinlock.h`](file:///home/kk/ai_garbage/mcu_cache_atomic/fw/atomic_spinlock.h)），在行號左側點擊設定中斷點 (Breakpoint)。
3. 切換到左側 **Run and Debug (`Ctrl+Shift+D`)** 面板，在下拉選單選擇：
   - `[RISC-V FW] Debug Demo 2: Spinlock LR/SC & AMO (Dual-Core)`
   - `[RISC-V FW] Debug Demo 1: Store Buffer & MESI (Dual-Core)`
   - `[RISC-V FW] Debug Demo 3: CPU Instruction Reordering (Dual-Core)`
4. 按下 **`F5` (Start Debugging)**：
   - VS Code 會自動執行 `preLaunchTask` 編譯含 `-gdwarf-4` 除錯符號的 `.elf`，在背景啟動 `./emu_c/emu_c <demo>.hex --gdb 3333`，並用 `/opt/riscv/bin/riscv32-unknown-elf-gdb` 連線停在 `main()`。
5. **雙核心切換與單步執行技巧**：
   - **C 語言單步執行**：按 **`F10` (Step Over)** 或 **`F11` (Step Into)** 即可進入 `atomic_spinlock.h`。
   - **組語指令級單步執行**：在程式碼視窗按右鍵選 **`Open Disassembly View`**，即可逐條指令執行 `lr.w.aq`、`sc.w.aqrl`、`amoswap.w`、`fence`。
   - **切換 Core 0 與 Core 1**：在左側 **CALL STACK / THREADS** 面板中會顯示兩顆核心：
     - `Thread 1: Core 0 (Hart 0 | Phase X | SB=Y | Res=...)`
     - `Thread 2: Core 1 (Hart 1 | Phase X | SB=Y | Res=...)`
     點擊任一 Thread 即可切換觀察該 Core 的暫存器 (`a0..a6`, `t0`, `pc`, `sp`) 與堆疊。
   - **在 VS Code `DEBUG CONSOLE` 即時檢視底層硬體狀態**：
     - `-exec monitor status`：印出當前 Cycle 雙核心的 **ROB、Store Buffer、L1 MESI 狀態、LR Reservation 與 Shared RAM**。
     - `-exec monitor cycle`：精確只推進 **1 個硬體 Clock Cycle**（可觀察 Store Buffer 排入 L1 或 MESI Bus Phase 1 → Phase 2）。
     - `-exec monitor reset`：將雙核 SoC 重置回 Cycle 1 (`PC = 0x0000`)。

### 方法二：在 VS Code 中 Single-Step 除錯硬體模擬器本身 (`emu_c/soc.c`)
- 在 [`emu_c/soc.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_c/soc.c) 的 [`soc_step_cycle`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_c/soc.c#L236) 設定中斷點，於 Run and Debug 選擇 **`[HW C Emulator] Step Hardware Engine soc_step_cycle() in C`** 並按 **`F5`**。

### 方法三：在 Terminal 手動使用 `riscv32-unknown-elf-gdb` 連線
```bash
# 終端機 1：啟動內建 GDB Server
./emu_c/emu_c fw/build/demo2_spinlock.hex --gdb 3333

# 終端機 2：啟動 RISC-V GDB 連線
/opt/riscv/bin/riscv32-unknown-elf-gdb fw/build/demo2_spinlock.elf
(gdb) target remote 127.0.0.1:3333
(gdb) info threads
(gdb) b main
(gdb) c
(gdb) next
(gdb) monitor status
(gdb) monitor cycle
(gdb) thread 2
(gdb) stepi
```

---

## 3. 目錄結構 (Project Structure)

- [`build_and_run.sh`](file:///home/kk/ai_garbage/mcu_cache_atomic/build_and_run.sh)：一鍵編譯、執行、驗證 C == Verilog 等價性並啟動 Web UI 的腳本。
- [`readme.txt`](file:///home/kk/ai_garbage/mcu_cache_atomic/readme.txt)：完整硬體/韌體原理解析、各 Demo 關鍵週期導覽與 VS Code 除錯教學。
- [`fw/`](file:///home/kk/ai_garbage/mcu_cache_atomic/fw)：使用 `riscv32-unknown-elf-gcc (-march=rv32ia_zicsr -gdwarf-4)` 編譯的真實雙核韌體：
  - [`atomic_spinlock.h`](file:///home/kk/ai_garbage/mcu_cache_atomic/fw/atomic_spinlock.h)：實作 `spinlock_lrsc_acquire/release`、`spinlock_amo_acquire/release`、`naive_lock` 與 `fence`。
  - [`demo1_sb_mesi.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/fw/demo1_sb_mesi.c)：展示 Store-to-Load Forwarding、Store Buffer Drain 與完整 MESI 狀態轉換 (`I -> E -> M -> S -> I`)。
  - [`demo2_spinlock.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/fw/demo2_spinlock.c)：對比一般 `lw`/`sw` Naive Lock 的 Race Condition 失敗案例，以及 `lr.w`/`sc.w` 與 `amoswap.w` Spinlock 保護共享記憶體。
  - [`demo3_reorder.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/fw/demo3_reorder.c)：展示 4-Entry ROB 亂序執行 (`OOO_DONE` vs `WAIT_DEP`)，以及無 `fence` 與有 `fence rw, rw` 下的 Store-Load Memory Reordering Litmus Test。
- [`emu_c/`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_c)：週期精確的 C 語言雙核心模擬器 ([`soc.h`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_c/soc.h), [`soc.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_c/soc.c), [`gdb_stub.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_c/gdb_stub.c), [`main.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_c/main.c))。
- [`emu_verilog/`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_verilog)：使用 Icarus Verilog (`iverilog` + `vvp`) 編譯執行的 Verilog RTL 模擬器 ([`rv32_core.v`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_verilog/rv32_core.v), [`store_buffer.v`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_verilog/store_buffer.v), [`l1_cache.v`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_verilog/l1_cache.v), [`mesi_bus.v`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_verilog/mesi_bus.v), [`dual_core_soc.v`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_verilog/dual_core_soc.v), [`tb_soc.v`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_verilog/tb_soc.v))。
- [`web_ui/`](file:///home/kk/ai_garbage/mcu_cache_atomic/web_ui)：互動式視覺化介面 ([`index.html`](file:///home/kk/ai_garbage/mcu_cache_atomic/web_ui/index.html), [`server.py`](file:///home/kk/ai_garbage/mcu_cache_atomic/web_ui/server.py))。
