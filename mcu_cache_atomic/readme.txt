================================================================================
Dual-Core RV32IA Microarchitecture Emulator (C & Verilog RTL + Web UI)
Store Buffer, L1 MESI Cache Coherence, Hardware Atomics (LR/SC & AMO), and OoO Reordering
================================================================================

1. 專案目標與核心特色
--------------------------------------------------------------------------------
本專案實作了一個雙核心 RISC-V (RV32IA) 週期精確 (Cycle-Accurate) 模擬器，同時提供：
  (1) C 語言版本模擬器 (emu_c/)
  (2) Verilog RTL 硬體描述語言版本模擬器 (emu_verilog/，使用 Icarus Verilog 編譯執行)
  (3) 真實 RISC-V 雙核韌體 Demo (fw/，使用 riscv32-unknown-elf-gcc 編譯)
  (4) 互動式 Web UI 視覺化介面 (web_ui/)

C 版本與 Verilog RTL 版本採用完全相同的微架構狀態機設計，載入相同的 .hex 韌體映像檔，
並在每個 Clock Cycle 產生 100% 一致的硬體狀態（包含暫存器、ROB、Store Buffer、
L1 Cache MESI 狀態、LR/SC Reservation Register、Coherence Bus 訊號與 Shared Memory）。
Web UI 直接讀取 C 與 Verilog 實際模擬輸出的 Cycle-by-Cycle JSON Trace，確保 UI 呈現的
每個細節與底層硬體實際運行原理完全一致。


2. 快速編譯與執行方式 (Quick Start)
--------------------------------------------------------------------------------
在專案根目錄執行主腳本，即可一鍵完成：
  1. 編譯所有 RV32IA 韌體 Demo (.elf, .dump, .hex)
  2. 編譯 C 語言雙核心模擬器 (emu_c/emu_c)
  3. 編譯 Verilog RTL 雙核心模擬器 (emu_verilog/sim_soc.vvp)
  4. 在 C 與 Verilog 兩套模擬器上執行三組 Demo，輸出 JSON Traces 與 .vcd 波形檔
  5. 自動執行逐週期等價性驗證 (驗證 C == Verilog 在所有 Cycle 100% 吻合)
  6. 啟動互動式 Web UI 伺服器 (預設 Port 8080)

執行指令：
  chmod +x build_and_run.sh
  ./build_and_run.sh

若只想編譯、執行與驗證，不啟動 Web Server：
  ./build_and_run.sh --no-server

啟動 Web UI 後，請用瀏覽器開啟：
  http://localhost:8080


3. 目錄與檔案結構說明
--------------------------------------------------------------------------------
.
├── build_and_run.sh          # 一鍵編譯、執行、驗證 C==Verilog 並啟動 Web UI 的主腳本
├── readme.txt                # 本說明文件 (詳細架構、FW/HW 原理解析與週期導覽)
├── README.md                 # Markdown 版簡介
├── fw/                       # RISC-V (RV32IA) 韌體目錄
│   ├── Makefile              # 使用 riscv32-unknown-elf-gcc 編譯韌體
│   ├── link.ld               # Linker Script (0x0000 ROM, 0x1000 Shared RAM, 0x2000 Local Stack)
│   ├── start.S               # 啟動組語：讀取 mhartid (CSR 0xF14)，設定各 Core 獨立 Stack 後跳入 main()
│   ├── atomic_spinlock.h     # 實作 LR/SC Spinlock、AMOSWAP Spinlock、Naive Lock、FENCE 與 CSR 控制
│   ├── demo1_sb_mesi.c       # Demo 1：Store Buffer Forwarding、Drain 與 MESI (I->E->M->S->I) 轉換
│   ├── demo2_spinlock.c      # Demo 2：Naive Lock 失敗案例 vs LR/SC & AMOSWAP Spinlock 保護共享記憶體
│   ├── demo3_reorder.c       # Demo 3：CPU 指令重排 (4-Entry ROB 亂序執行 + Store-Load Reordering Litmus Test)
│   └── bin2hex.py            # 將 ELF/Binary 轉為 .hex 並擷取 objdump 反組譯資訊供 UI 同步顯示
├── emu_c/                    # C 語言雙核心模擬器
│   ├── Makefile
│   ├── soc.h                 # 硬體結構定義 (Core, ROB, Store Buffer, L1 Cache, MESI Bus, Shared RAM)
│   ├── soc.c                 # 週期精確的硬體步進引擎 (soc_step_cycle)
│   └── main.c                # CLI 執行器與 JSON Trace 匯出工具
├── emu_verilog/              # Verilog RTL 雙核心模擬器 (Icarus Verilog)
│   ├── Makefile
│   ├── defines.vh            # MESI、Bus Command、ROB 狀態常數定義
│   ├── rv32_core.v           # RV32IA Core (含 4-Entry ROB、Reservation Set、CSR、Local DTCM)
│   ├── store_buffer.v        # 4-Entry FIFO Store Buffer (含組合邏輯 Store-to-Load Forwarding)
│   ├── l1_cache.v            # 8-Line Direct-Mapped L1 Data Cache (含 MESI 狀態與 Bus Snoop 查詢埠)
│   ├── mesi_bus.v            # MESI Snooping Coherence Bus 狀態暫存器
│   ├── dual_core_soc.v       # 雙核心 SoC 頂層模組與同步時脈狀態機
│   └── tb_soc.v              # Testbench：載入 .hex、輸出 .vcd 波形檔與 JSON Trace
├── traces/                   # 執行後產生的 C / Verilog JSON Traces 與 .vcd 波形檔
└── web_ui/                   # 互動式 Web UI
    ├── server.py             # Python HTTP Server，提供 Trace 載入與即時重新編譯 API
    └── index.html            # 雙核心微架構視覺化介面


================================================================================
4. 核心硬體與韌體原理解析 (FW & HW Deep Dive)
================================================================================

--------------------------------------------------------------------------------
主題 A：Atomic 在韌體 (FW) 怎麼實作？在硬體 (HW) 需要哪些支援？
--------------------------------------------------------------------------------
對應檔案：fw/atomic_spinlock.h, fw/demo2_spinlock.c

【1. 為什麼一般的 Load/Store (Naive Lock) 在多核心會失敗？】
在 fw/atomic_spinlock.h 的 `naive_lock_acquire()` 中：
    1: lw   t0, 0(lock)     # 讀取 lock
       bnez t0, 1b          # 若 lock != 0 則繼續等待
       li   t0, 1
       sw   t0, 0(lock)     # 將 1 寫入 lock

為什麼在雙核心硬體上會失敗（對應 Demo 2 Phase 1，Cycle 11~35）？
  - 當 Core 0 與 Core 1 同時執行 `lw` 讀取 `0x1000 (LOCK_VAR)` 時，透過 MESI 協定，
    兩個 Core 的 L1 Cache 都可以合法地同時持有該 Cache Line 的 `S` (Shared) 狀態，
    因此兩個 Core 同時讀到 `LOCK_VAR == 0`！
  - 接著兩個 Core 同時執行 `sw 1, 0(lock)`。寫入指令會先進入各自的 **Store Buffer**，
    不會立刻阻擋對方。結果兩個 Core 都認為自己成功取得鎖，同時進入 Critical Section！
  - 在 Demo 2 Phase 1 中，Core 0 與 Core 1 都在 Critical Section 內把 `NAIVE_COUNTER (0x1004)`
    讀出 `0` 並寫回 `0 + 1 = 1`，發生 Race Condition (Lost Update)，最終 `NAIVE_COUNTER`
    結果為 `1`（正確應為 `2`）。

【2. 方法一：使用 Load-Reserved / Store-Conditional (`lr.w` / `sc.w`) 實作 Spinlock】
在 fw/atomic_spinlock.h 的 `spinlock_lrsc_acquire()` 中：
    1: lr.w.aq   t0, (lock)        # Load-Reserved：讀取 lock 並在硬體註冊 Reservation
       bnez      t0, 1b            # 若已被鎖住 (t0 != 0)，重試
       li        t1, 1
       sc.w.aqrl t1, t1, (lock)    # Store-Conditional：若 Reservation 仍有效則寫入 1 (t1=0)，否則失敗 (t1=1)
       bnez      t1, 1b            # 若 t1 != 0 代表期間被別的 Core 搶先修改過，跳回 1b 重試！

硬體 (HW) 為了支援 `lr.w` / `sc.w` 必須實作三個關鍵機制：
  (a) 每個 Core 內部的 **Reservation Register (`res_valid`, `res_addr`)**：
      當執行 `lr.w` 時，CPU 先排空本地 Store Buffer，從 L1 Cache 讀取資料，並將
      `res_valid <= 1`、`res_addr <= addr` 記錄下來。
  (b) **Cache Snoop 控制器與 Reservation Register 的連動 (Snoop Invalidation)**：
      當另一個 Core 對同一個位址發出寫入或獨佔請求（`BusRdX` 或 `BusUpgr`）時，
      本方 Core 的 Snoop 邏輯除了把本地 L1 Cache Line 設為 `I` (Invalid) 之外，
      還會檢查 `if (res_valid && res_addr == bus_addr)`，若吻合則強制把 **`res_valid <= 0`**！
  (c) **`sc.w` 的條件判斷與匯流排競爭**：
      當 Core 0 與 Core 1 同時讀到 `lr.w == 0` 並同時執行 `sc.w` 時，兩邊的 L1 Cache
      目前都是 `S` (Shared) 狀態，因此都需要向 MESI Bus 申請 `BusUpgr` 來升級為 `M` 狀態。
      匯流排仲裁器 (Arbiter) 一次只會授權給其中一個 Core（例如先給 Core 1）：
      - 贏家 (Core 1) 發出 `BusUpgr(0x1000)`，將 Core 0 的 L1 Line 作廢 (`S -> I`)，
        並同時清除 Core 0 的 `res_valid = 0`（見 **Demo 2 Cycle 69**）！
      - 贏家將 `1` 寫入自己的 L1 (`M` state)，清除自己的 `res_valid`，並將 `rd` 設為 `0`（成功進入 Critical Section）。
      - 輸家 (Core 0) 的 `sc.w` 發現自己的 `res_valid` 已經變成 `0`，硬體**直接放棄寫入**，
        不修改任何記憶體，並將 `rd` 設為 `1`（失敗），讓韌體 `bnez` 跳回 `lr.w` 重新等待！

【3. 方法二：使用 Atomic Memory Operation (`amoswap.w`) 實作 Spinlock】
在 fw/atomic_spinlock.h 的 `spinlock_amo_acquire()` 中：
    1: amoswap.w.aq t0, t1, (lock) # 將 t1 (1) 與 *lock 原子交換，舊值寫回 t0
       bnez         t0, 1b         # 若換出來的舊值 t0 == 1，代表鎖原本就被別人持有，繼續 Spin！
                                   # 若換出來的舊值 t0 == 0，代表我們成功把 0 換成 1，取得鎖！

硬體 (HW) 為了支援 `amoswap.w` / `amoadd.w` 必須實作的機制：
  (a) **Store Buffer Drain**：執行 AMO 前必須先等本地 Store Buffer 完全排空 (`sb_count == 0`)。
  (b) **獨佔取得 Cache Line (`M` state) + 不可分割的 Read-Modify-Write (RMW)**：
      若 L1 Cache 不是 `M` 或 `E` 狀態，L1 必須發出 `BusRdX` 或 `BusUpgr` 將另一個 Core 的
      快取行作廢 (`-> I`)，並取得最新資料。在匯流排完成交握的同一個原子階段內，
      硬體讀出舊值寫入目標暫存器 `rd`，同時經過 AMO ALU 計算新值寫入 L1 Cache (`M` state)，
      保證「讀取舊值」與「寫入新值」之間絕對不會被另一個 Core 的 Snoop 請求插入！

【4. Spinlock Release 時為什麼需要 `fence rw, w`（或 `.rl` Release 語意）？】
在 Critical Section 內部修改共享變數（例如 `LRSC_COUNTER = c + 1; SHARED_BALANCE = b + 100;`）時，
這些 `sw` 指令會先進入 **Store Buffer**。如果釋放鎖的 `sw zero, 0(lock)` 沒有搭配 `fence rw, w`
先將 Store Buffer 排空，或是讓鎖的釋放被重排到共享資料寫入之前，另一個 Core 可能已經看到鎖變成 `0`
而進入 Critical Section，卻讀到還沒從第一個 Core 的 Store Buffer 排出的舊資料！


--------------------------------------------------------------------------------
主題 B：CPU -> Store Buffer -> L1 Cache 與 Cache 間通訊協定 (MESI Protocol)
--------------------------------------------------------------------------------
對應檔案：emu_c/soc.c, emu_verilog/store_buffer.v, emu_verilog/l1_cache.v, fw/demo1_sb_mesi.c

【1. 為什麼 CPU 與 L1 Cache 之間需要 Store Buffer？】
  - 在多核心系統中，`sw` (Store) 若直接寫入 L1 Cache，一旦遇到 L1 Cache Miss (狀態為 `I`)
    或該行處於共享狀態 (`S`)，就必須透過匯流排發出 `BusRdX` 或 `BusUpgr` 通知其他 Core 作廢快取，
    這會花費數個到數十個 Clock Cycles。
  - 為了不讓 CPU Pipeline 因等待寫入而頻繁卡死 (Stall)，CPU 執行 `sw` 時只需 1 個 Cycle 把
    `(addr, data, pc)` 推入 4-Entry FIFO **Store Buffer** 即可立刻 Retire 並繼續執行後續指令；
    Store Buffer 會在背景自動將最舊的項目 (`SB[0]`) 排入 (Drain) L1 Cache。

【2. 什麼是 Store-to-Load Forwarding（寫後讀直接轉發）？】
  - 當同一個 Core 剛執行完 `sw t0, 0(a5)`（資料還在 Store Buffer 中，尚未寫入 L1 Cache），
    緊接著馬上執行 `lw a2, 0(a5)` 讀取同一個位址時，如果直接去讀 L1 Cache 會讀到過期的舊值！
  - 因此每次 CPU 執行 `lw` 時，硬體會先以組合邏輯同時搜尋本地 Store Buffer（由新到舊比對位址）。
    一旦發現位址吻合（如 **Demo 1 Cycle 18**），Store Buffer 會直接把 `0x11110001` 在 1 個 Cycle 內
    轉發 (Forward) 給 CPU 的 `a2` 暫存器，完全不必等待 Store Buffer 排入 L1！

【3. 兩個 Core 的 L1 Cache 如何透過 MESI 協定通訊？】
每條 L1 Cache Line 都維護 2-bit 的 MESI 狀態：
  - **M (Modified, 2'b11)**：資料已被本 Core 修改過（Dirty），只有本 Core 持有，Shared RAM 中的值是過期的 (Stale)。
  - **E (Exclusive, 2'b10)**：資料乾淨（與 RAM 一致），但目前只有本 Core 一人持有。
  - **S (Shared, 2'b01)**：資料乾淨，可能同時被多個 Core 的 L1 Cache 共同持有。
  - **I (Invalid, 2'b00)**：無效行（尚未載入或已被其他 Core 的寫入作廢）。

在 **Demo 1 (`demo1_sb_mesi.c`)** 中可以完整觀察到所有 MESI 狀態轉換：
  1. **Cold Read Miss (`I -> E`) — Demo 1 Cycle 14~15**：
     Core 0 執行 `lw` 讀取 `0x1000`。Core 0 L1 為 `I`，於是在匯流排發出 `BusRd(0x1000)`。
     Core 1 Snoop 檢查發現自己沒有 `0x1000` (`Snoop: MISS`)，因此 Core 0 從 RAM 取得資料後，
     狀態由 **`I -> E` (Exclusive)**（而不是 `S`）。
  2. **Silent Upgrade (`E -> M`) — Demo 1 Cycle 19**：
     當 Core 0 的 Store Buffer 將 `0x11110001` 排入 L1 Cache 的 `0x1000` 時，因為該行已經是
     `E` (Exclusive) 狀態（保證其他 Core 絕對沒有這行），Core 0 **不需要發出任何 Bus 訊號**，
     直接在 1 個 Cycle 內靜默升級為 **`E -> M` (Modified)**！
  3. **Dirty Snoop Flush / Intervention (`M -> S` & `I -> S`) — Demo 1 Cycle 39~40**：
     Core 1 執行 `lw` 讀取 `0x1000`。此時 RAM 裡的值還是舊的 `0`，而最新值 `0x11110002` 在
     Core 0 L1 的 `M` 狀態中。
     - Core 1 發出 `BusRd(0x1000)`。
     - Core 0 的 Snoop 控制器偵測到自己持有 `0x1000` 且為 `M` (`Snoop: M DIRTY-FLUSH`)！
     - Core 0 主動攔截並將髒資料 `0x11110002` 放到匯流排上同時寫回 Shared RAM，並將自己的狀態降為 **`M -> S`**。
     - Core 1 接收該資料並將狀態設為 **`I -> S`**。此時雙核皆為 `S` 且數值一致！
  4. **Shared Write Upgrade (`BusUpgr: S -> M` & Peer `S -> I`) — Demo 1 Cycle 48~49**：
     Core 1 寫入新值 `0x9999CAFE` 到 `0x1000`。當 Core 1 的 Store Buffer 要排入 L1 時，發現
     該行處於 `S` 狀態（代表 Core 0 也有一份）。
     - Core 1 發出 **`BusUpgr(0x1000)`**。
     - Core 0 監聽到 `BusUpgr`，立刻將自己的 `0x1000` 快取行作廢 (**`S -> I`**)。
     - Core 1 更新數值為 `0x9999CAFE` 並將狀態升級為 (**`S -> M`**)。


--------------------------------------------------------------------------------
主題 C：CPU 層級的 Instruction Reordering 是怎麼進行的？
--------------------------------------------------------------------------------
對應檔案：emu_c/soc.c, emu_verilog/rv32_core.v, fw/demo3_reorder.c

本專案在硬體中實作了兩個層級的 CPU 指令重排機制，並於 **Demo 3 (`demo3_reorder.c`)** 完整展示：

【1. Pipeline 亂序執行：4-Entry Reorder Buffer (ROB) / Issue Window (Demo 3 Phase 1)】
在每個 Core 中都有一個 4-Entry 的 **ROB (Reorder Buffer)**。當 `ROB[0]`（最舊的指令）因為
等待 L1 Cache Miss 而在 `MEM_WAIT` 狀態卡住數個 Cycle 時，Fetch 單元仍會繼續把後續指令放入
`ROB[1]`、`ROB[2]`、`ROB[3]`。
在 **Demo 3 Phase 1 (Cycle 16~23)** 中，Core 0 依序提取了以下 4 道指令進入 ROB：
  - `ROB[0]`: `lw   a3, 0(0x1014)`   --> `0x1014` 發生 **L1 Cache Miss**！狀態為 **`MEM_WAIT`**（等待匯流排 `BusRd`）。
  - `ROB[1]`: `addi a2, a3, 5`       --> 讀取 `a3`，但 `ROB[0]` 還沒讀回 `a3`（發生 **RAW Data Hazard**）！硬體將 `ROB[1]` 標記為 **`WAIT_DEP (RAW x13 a3)`**，禁止執行。
  - `ROB[2]`: `addi a1, zero, 0x77`  --> 與 `ROB[0]`、`ROB[1]` 完全無暫存器依賴！硬體在 Cycle 17 立刻讓 `ROB[2]` **提前亂序執行完成 (`OOO_DONE`)**！
  - `ROB[3]`: `lw   a6, 0(0x1018)`   --> 位址 `0x1018` 已經預先熱身在 Core 0 的 L1 Cache 中 (`M` state)，且與前面指令無依賴！硬體在 Cycle 18 讓 `ROB[3]` **提前亂序命中 L1 Cache 完成 (`OOO_DONE`)**！
最後當 `ROB[0]` 的匯流排讀取在 Cycle 20 完成時，`ROB[0]` 先 Commit，接著喚醒 `ROB[1]` 計算 `a3 + 5`，並依程式順序依序 Commit `ROB[1]`、`ROB[2]`、`ROB[3]`。

【2. Store-Load 記憶體重排：Store Buffer + Load Bypass (Demo 3 Phase 2 vs Phase 3)】
這是多核心處理器（x86 TSO、ARM、RISC-V RVWMO）最經典的記憶體重排現象（Litmus Test `SB`）：
初始狀態：`VAR_X (0x1000) = 0`，`VAR_Y (0x1004) = 0`，且兩個變數都已載入雙核 L1 Cache 的 **`S` (Shared)** 狀態。

  * **Phase 2：無 `fence` 的情況（Cycle 52~61）**
    - Core 0 執行：`sw 1 -> VAR_X (0x1000)`，緊接著執行 `lw r0 <- VAR_Y (0x1004)`
    - Core 1 執行：`sw 1 -> VAR_Y (0x1004)`，緊接著執行 `lw r1 <- VAR_X (0x1000)`
    發生了什麼事？
    1. 在 Cycle 52~54，Core 1 與 Core 0 的 `sw` 指令分別把 `Y = 1` 與 `X = 1` 放進各自的 **Store Buffer**。
       此時這兩筆寫入都還沒取得匯流排發出 `BusUpgr`，因此對另一個 Core 而言完全不可見！
    2. 在同一個 Cycle，兩個 Core 的下一道指令 `lw` 開始執行：
       - 先檢查本地 Store Buffer：因為 `0x1000 != 0x1004`，沒有命中本地 Store Buffer。
       - 接著查詢本地 L1 Cache：因為對方的 `BusUpgr` 還沒完成，本地 L1 Cache 中對方的變數依然處於 **`S` (Shared) 狀態且值為 `0`**！
       - 年輕的 `lw` 直接 **繞過 (Bypass) 正在排隊等匯流排的 Store Buffer**，在 1 個 Cycle 內命中本地 L1 Cache 讀出 `0`！
    3. 最終結果：**`NOFENCE_R0 (0x1008) == 0` 且 `NOFENCE_R1 (0x100C) == 0`**！
       從全域觀點來看，兩個 Core 的 `lw` 都被硬體重排到了 `sw` 生效之前執行！

  * **Phase 3：加上 `fence rw, rw` 的情況（Cycle 92~109）**
    - Core 0 執行：`sw 1 -> VAR_X; fence rw, rw; lw r0 <- VAR_Y;`
    - Core 1 執行：`sw 1 -> VAR_Y; fence rw, rw; lw r1 <- VAR_X;`
    發生了什麼事？
    1. 當 `sw` 進入 Store Buffer 後，下一道指令 `fence rw, rw` 進入 `ROB[0]`。
    2. 硬體規定 `fence` 必須卡在 `ROB[0]` (`MEM_WAIT`) 直到 **`sb_count == 0`（Store Buffer 完全排空至 L1 Cache）** 才能完成，因此後面的 `lw` 絕對無法提前偷跑！
    3. 等到 Store Buffer 透過 `BusUpgr` 排入 L1 Cache 時，對方 L1 Cache 中的舊 `S` 快取行已經被強制設為 `I` (Invalid)。
    4. 因此當 `fence` 結束、後續的 `lw` 開始執行時，必然讀取到更新後的 `1`（在 Demo 3 中 `FENCED_R1 (0x1014) == 1`），徹底消除了 `r0 == 0 && r1 == 0` 的重排現象！


================================================================================
5. Web UI 操作指南 (http://localhost:8080)
================================================================================
1. **上方控制列**：
   - **Firmware Demo 下拉選單**：可隨時切換 Demo 1 (Store Buffer & MESI)、Demo 2 (Spinlock) 與 Demo 3 (Instruction Reordering)。
   - **Backend Engine 按鈕**：可在 `C Emulator (emu_c)` 與 `Verilog RTL (iverilog)` 之間即時切換；旁邊的綠色徽章會即時驗證當前 Cycle 兩套模擬器的所有內部狀態是否 100% 相同。
   - **Quick Jump Milestones**：自動擷取該 Demo 最關鍵的硬體事件週期（如 `SB Forward`、`Dirty Snoop Flush`、`LR Reservation Snoop-Cleared`、`SC.W Failed`、`OoO Load Hit`），點擊即可一鍵跳轉到該 Cycle！
2. **中間三欄硬體架構圖**：
   - 左右兩側分別為 **Core 0** 與 **Core 1** 的內部微架構：包含暫存器、**4-Entry ROB 視窗**、**LR/SC Reservation 狀態徽章**、**4-Entry Store Buffer** 與 **8-Line L1 MESI Cache**。
   - 中間為 **MESI Snooping Coherence Bus** 動態封包顯示器、當前週期硬體動作解說，以及 **Shared Memory (0x1000..0x101C)**（當某個 Core 的 L1 為 `M` 狀態時，會自動標示 Shared RAM 中的值已過期 Stale）。
3. **下方分頁區**：
   - **Cycle-by-Cycle Event Timeline**：列出所有硬體事件，點擊任一行即可跳至該 Cycle。
   - **Firmware C Source & RV32IA Disassembly**：即時高亮顯示 Core 0 (藍色) 與 Core 1 (紫色) 當前正在執行的組語指令位址與 C 原始碼。
   - **Deep-Dive Guide**：整合硬體與韌體設計要點的隨查手冊。


================================================================================
6. 如何在 VS Code 中 Single-Step Debug 韌體 (FW) 與硬體模擬器
================================================================================
本專案已在 C 模擬器 (`emu_c`) 內建雙核心 **GDB Remote Serial Protocol (RSP) Server**
([`emu_c/gdb_stub.c`](file:///home/kk/ai_garbage/mcu_cache_atomic/emu_c/gdb_stub.c))，並已設定好 VS Code 的 [`.vscode/launch.json`](file:///home/kk/ai_garbage/mcu_cache_atomic/.vscode/launch.json) 與 [`.vscode/tasks.json`](file:///home/kk/ai_garbage/mcu_cache_atomic/.vscode/tasks.json)。

【前置需求】
  - VS Code 安裝官方 `C/C++` 擴充套件 (`ms-vscode.cpptools`)。

【方法一：直接在 VS Code 中 Single-Step 除錯 RISC-V 韌體 (.c / .h / .S)】
  1. 用 VS Code 開啟本專案目錄 (`/home/kk/ai_garbage/mcu_cache_atomic`)。
  2. 開啟韌體原始碼（例如 `fw/demo1_sb_mesi.c`、`fw/demo2_spinlock.c`、`fw/demo3_reorder.c` 或 `fw/atomic_spinlock.h`），在想觀察的行號左側點擊設定中斷點 (Breakpoint)。
  3. 切換到左側 **Run and Debug (`Ctrl+Shift+D`)** 面板，在上方下拉選單選擇以下任一組態：
     - `[RISC-V FW] Debug Demo 2: Spinlock LR/SC & AMO (Dual-Core)`
     - `[RISC-V FW] Debug Demo 1: Store Buffer & MESI (Dual-Core)`
     - `[RISC-V FW] Debug Demo 3: CPU Instruction Reordering (Dual-Core)`
  4. 按下 **`F5` (Start Debugging)**：
     - VS Code 會自動執行 `preLaunchTask`（呼叫 `scripts/start_gdb_server.sh` 編譯 `-gdwarf-4` 韌體並在背景啟動 `./emu_c/emu_c <demo>.hex --gdb 3333`），接著自動用 `/opt/riscv/bin/riscv32-unknown-elf-gdb` 連線並停在 `main()`！
  5. **雙核心切換與單步執行技巧**：
     - **Step Over (`F10`) / Step Into (`F11`)**：一行一行執行 C 程式碼或進入 `atomic_spinlock.h` 的 inline assembly。
     - **組語指令級單步 (Instruction Stepping)**：在程式碼視窗按右鍵選擇 **`Open Disassembly View`**，即可逐條執行 `lr.w.aq`、`sc.w.aqrl`、`amoswap.w`、`fence`。
     - **切換 Core 0 與 Core 1**：在左側 **CALL STACK / THREADS** 面板中，會看到兩個硬體執行緒：
       * `Thread 1: Core 0 (Hart 0 | Phase X | SB=Y | Res=...)`
       * `Thread 2: Core 1 (Hart 1 | Phase X | SB=Y | Res=...)`
       點擊任一 Thread 即可切換觀察該 Core 的暫存器 (`a0..a6`, `t0`, `pc`, `sp`) 與堆疊！
     - **在 VS Code Debug Console 即時檢視 Store Buffer / L1 MESI / ROB 硬體狀態**：
       在下方 `DEBUG CONSOLE` 輸入以下指令：
       * `-exec monitor status`  --> 印出當前 Cycle 雙核心的 ROB、Store Buffer、L1 MESI 狀態、LR Reservation 與 Shared RAM！
       * `-exec monitor cycle`   --> 精確只推進 **1 個硬體 Clock Cycle**（可觀察 Store Buffer 正在排入 L1 或 MESI Bus Phase 1 -> Phase 2）！
       * `-exec monitor reset`   --> 將雙核 SoC 重置回 Cycle 1 (`PC = 0x0000`)。

【方法二：在 VS Code 中 Single-Step 除錯硬體模擬器本身 (`emu_c/soc.c`)】
  - 若想觀察 C 語言模擬器內部如何計算每一個 Clock Cycle 的 ROB 亂序派發、Store Buffer 轉發與 MESI 狀態機：
    1. 在 `emu_c/soc.c` 的 `soc_step_cycle()` 設定中斷點。
    2. 在 VS Code Run and Debug 選擇 **`[HW C Emulator] Step Hardware Engine soc_step_cycle() in C`** 並按 **`F5`**。

【方法三：在 Terminal 中手動使用 riscv32-unknown-elf-gdb 連線除錯】
  若想在終端機直接操作 GDB：
    # 終端機 1：啟動內建 GDB Server (Port 3333)
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
