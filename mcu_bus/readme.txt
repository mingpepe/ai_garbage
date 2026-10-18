================================================================================
MCU Bus Architecture, Cycle-Accurate DMA Controller & GTKWave Waveform Suite
實作細節與操作說明文件 (readme.txt)
================================================================================

一、專案總覽 (Overview)
--------------------------------------------------------------------------------
本專案將微控制器 (MCU) 內部匯流排仲裁 (Bus Arbitration)、週邊通訊介面 (UART / I2C)、
記憶體 (SRAM)、中斷控制器 (NVIC) 以及核心的「直接記憶體存取控制器 (DMA Controller)」
進行 Cycle-Accurate (週期精確) 的硬體行為建模與視覺化模擬。

專案共包含四個完整且行為一致的實作版本，並內建類似 GTKWave 的數位邏輯波形檢視器與
標準 IEEE 1364 VCD (Value Change Dump) 波形檔案輸出：

1. c_mcu_bus/          : C (C99) 終端機模擬引擎 + 自動匯出 mcu_bus_c.vcd
2. csharp_wpf_mcu_bus/ : C# (.NET 10 + Avalonia XAML) 跨平台桌面 GUI (支援 Linux/Windows/macOS)
3. ts_web_mcu_bus/     : TypeScript + Vite + Canvas 互動式網頁版 GUI (支援載入 .vcd)
4. verilog_mcu_bus/    : 可合成 Verilog-2001 RTL 硬體描述與 Testbench (Icarus Verilog + GTKWave)


二、硬體架構與實作細節 (Hardware Implementation Details)
--------------------------------------------------------------------------------
1. 記憶體映射匯流排與仲裁器 (AHB-Lite Style System Bus & Arbiter)
   - 位址空間映射 (Memory Map)：
     * 0x4000_1000 : UART RX Data Register (讀取時觸發硬體 FIFO Pop)
     * 0x4000_1004 : UART Status Register (bit0: RX_NE 非空, bit1: RX_FULL, bit2: OVERRUN)
     * 0x4000_2000 : I2C TX Data Register (寫入時觸發硬體 FIFO Push)
     * 0x4000_2004 : I2C Status Register (bit0: TX_NF 未滿, bit1: TX_BUSY 傳送中)
     * 0x2000_0000 ~ 0x2000_00FF : 內部 SRAM (供 P2M 轉移儲存資料)
   - 仲裁演算法 (Priority + Round-Robin Anti-Starvation)：
     * 每個 Clock Cycle 可由多個 Master (CPU、DMA) 同時提出匯流排請求 (BusRequest)。
     * 仲裁器優先比較 Priority (數值越小優先權越高，預設 CPU 與 DMA 同為 Priority 0)。
     * 當 Priority 相同時，檢查上一個獲得授權的 Master (`lastGranted`)：優先將匯流排
       授權給「非上一次使用」的 Master，確保在 DMA 高速搬移期間 CPU 仍能交替取得
       Bus 存取權 (無飢餓現象 Starvation-Free)。
     * 落敗的 Master 會收到 `bus_stall` 訊號並自動在原狀態等待下一個 Cycle。

2. DMA 控制器 (Cycle-Accurate DMA Engine)
   - 暫存器介面：
     * `CCR`   (Control Register) : Enable、Direction (P2P / P2M / M2P)、SRC_INC、DST_INC、
                                    CIRC (循環模式)、TCIE (完成中斷)、HTIE (半完成中斷)
     * `CNDTR` (Count Register)   : 當前剩餘轉移筆數 (搭配 `ReloadCount` 支援 Circular 模式自動重載)
     * `CPAR` / `CMAR`            : 來源端與目的端 32-bit 實體位址指標
     * `ISR` / `IFCR`             : 中斷狀態旗標 (`TCIF` 全部完成、`HTIF` 一半完成、`TEIF` 匯流排錯誤)
   - 5 狀態有限狀態機 (5-State FSM)：
     * `IDLE` (0)       : 閒置狀態，等待軟體啟動 (`CCR.EN = 1`)。
     * `ARB_WAIT` (1)   : 等待硬體 DREQ 握手訊號就緒：
                          - 來源為 UART 時需等待 `uart_dreq_rx == 1` (RX FIFO 有資料)
                          - 目的為 I2C 時需等待 `i2c_dreq_tx == 1` (TX FIFO 未滿)
     * `READ_SRC` (2)   : 向 Bus 提出讀取 `CurrentSrcAddr` 請求；若贏得仲裁則將資料鎖存進
                          DMA 內部暫存器 `internalLatch` (1-Byte Buffer)，並進入 `WRITE_DST`。
                          若因仲裁落敗則維持在 `READ_SRC` (Stall)。
     * `WRITE_DST` (3)  : 向 Bus 提出寫入 `CurrentDstAddr` 請求；若贏得仲裁則將 `internalLatch`
                          寫入目標位址，並執行：
                          - 若設定 `SRC_INC` / `DST_INC`，對應位址指標 `+1`
                          - `CNDTR` 減 1
                          - 當 `CNDTR == ReloadCount / 2` 時觸發 `HTIF` 與 `DMA_HT` 中斷
                          - 當 `CNDTR == 0` 時：若開啟 `CIRC` 則自動重載計數與位址並回到 `ARB_WAIT`，
                            否則觸發 `TCIF` 與 `DMA_TC` 中斷並進入 `COMPLETE`。
     * `COMPLETE` (4)   : 傳輸結束，等待 CPU ISR 清除完成旗標。

3. 週邊模組 (Peripherals & NVIC)
   - UART RX 模組：
     * 內建深度為 4 Bytes 的硬體 Ring FIFO，支援預設排程在指定 Cycle 注入外部串列資料，
       或透過 UI 手動即時注入 Byte。
     * 當 FIFO 已滿又收到新 Byte 時，會觸發硬體 `UART_OVERRUN` 中斷並記錄遺失資料。
   - I2C TX 模組：
     * 內建深度為 2 Bytes 的硬體 TX FIFO，每傳送 1 Byte 需耗時 4 個系統 Clock Cycles
       (`shiftProgress: 0 -> 4`)。
     * 由於 I2C 傳送速率比 UART 接收速率慢，能清楚觀察到 I2C TX FIFO 填滿後透過
       `i2c_dreq_tx = 0` 對 DMA 產生硬體背壓 (Backpressure) 的真實現象。
   - NVIC 中斷控制器與 CPU：
     * 支援中斷遮罩與佇列 (`DMA_HT`、`DMA_TC`、`UART_OVERRUN`)。
     * CPU 在非 ISR 期間每 3 個 Cycle 會向 Bus 發起一次輪詢讀取 `I2C_STATUS (0x40002004)`，
       用以製造真實的 CPU vs. DMA 匯流排競爭情境。


三、GTKWave 風格數位波形檢視器實作細節 (Waveform Viewer & VCD)
--------------------------------------------------------------------------------
1. 觀測訊號列表 (Internal Signals Monitored)
   - Clock & Bus : `sys_clk`、`bus_Idle`、`bus_Master`、`bus_Addr[31:0]`、`bus_Data[7:0]`、`bus_Stall`
   - DMA Engine  : `dma_State` (`IDLE`/`WAIT`/`RD_SRC`/`WR_DST`/`DONE`)、`dma_Latch[7:0]`、`dma_CNDTR`、`dma_TCIF`、`dma_HTIF`
   - Peripherals : `uart_DREQ`、`uart_RxCnt`、`i2c_DREQ`、`i2c_TxCnt`、`i2c_Shift`
   - CPU & NVIC  : `cpu_ISR`、`irq_Active`

2. 視覺化與游標量測功能
   - Single-bit 訊號以高低邏輯步階波 (Step Trace) 繪製，高準位帶有半透明填色。
   - Multi-bit 匯流排與 FSM 狀態以六角形轉折框 (Hexagonal Bus Envelope) 繪製，並根據
     狀態自動切換顏色 (例如 `RD_SRC` 為青色、`WR_DST` 為橘色、`STALL` 為紅色)。
   - 支援雙時間游標量測：
     * 黃色主游標 (Primary Cursor `T1`)：顯示該 Cycle 所有內部訊號的即時數值於左側欄。
     * 青色測量游標 (Measure Cursor `T2`)：自動計算並顯示兩游標間的週期差 `|ΔT| = |T2 - T1| cycles`。


四、目錄結構說明 (Directory Structure)
--------------------------------------------------------------------------------
mcu_bus/
├── readme.txt                  # 本實作細節與操作說明文件
├── README.md                   # Markdown 格式說明文件
├── run_sim.sh                  # 一鍵整合執行腳本 (支援 all / verilog / c / web / csharp / gtkwave)
├── c_mcu_bus/                  # [1] C99 終端機模擬器與 VCD 產生器
│   ├── Makefile
│   └── src/
│       ├── mcu_bus.h           # 硬體暫存器、FSM 與資料結構定義
│       ├── mcu_bus.c           # Cycle-accurate 模擬核心與 IEEE 1364 VCD 輸出器
│       └── main.c              # 測試情境 (P2P 與 P2M) 與 ANSI 彩色波形表輸出
├── csharp_wpf_mcu_bus/         # [2] C# (.NET 10 + Avalonia XAML) 跨平台桌面 GUI
│   ├── McuBusWpf.csproj        # 專案檔 (TargetFramework: net10.0，跨平台支援 Linux/Windows/macOS)
│   ├── Program.cs              # 桌面視窗啟動進入點
│   ├── App.axaml / .cs         # XAML Application 資源與深色主題設定
│   ├── MainWindow.axaml / .cs  # 主視窗 XAML 版面 (方塊圖 + GTKWave 波形檢視器 + FIFO/SRAM 面板)
│   ├── Controls/
│   │   └── GtkWaveControl.cs   # 自訂 DrawingContext 數位波形繪製與雙游標互動控制項
│   ├── Models/
│   │   └── McuHardware.cs      # C# Cycle-Accurate 硬體模擬引擎
│   └── ViewModels/
│       └── MainViewModel.cs    # MVVM 狀態綁定與計時器控制
├── ts_web_mcu_bus/             # [3] TypeScript + Vite 網頁互動式 GUI 與 VCD 檢視器
│   ├── package.json
│   ├── index.html              # 介面佈局與雙頁籤 (GTKWave Waveform / Hardware Architecture)
│   └── src/
│       ├── main.ts             # UI 事件綁定與 VCD 匯入/匯出控制
│       ├── engine/mcuEngine.ts # TypeScript 硬體模擬引擎
│       └── ui/
│           ├── canvasRenderer.ts # 硬體架構動態粒子動畫渲染器
│           └── gtkwaveViewer.ts  # HTML5 Canvas GTKWave 波形檢視器與 IEEE 1364 VCD 解析器
└── verilog_mcu_bus/            # [4] Verilog-2001 RTL 與 Testbench
    ├── run_sim.sh              # Verilog 專用編譯與模擬腳本
    ├── mcu_bus.gtkw            # GTKWave 訊號群組與顏色設定檔
    ├── rtl/
    │   ├── mcu_top.v           # Top-level MCU 整合模組
    │   ├── bus_arbiter.v       # 優先權 + Round-Robin 匯流排仲裁器
    │   ├── dma_controller.v    # 5-State FSM DMA 控制器
    │   ├── uart_rx.v           # 4-Byte FIFO UART 接收器
    │   ├── i2c_tx.v            # 2-Byte FIFO I2C 發送器 (4 Cycles/Byte)
    │   ├── sram.v              # 256-Byte 同步 SRAM
    │   ├── nvic.v              # 中斷控制器
    │   └── cpu_core.v          # CPU 匯流排輪詢與 ISR 處理核心
    └── tb/
        └── tb_mcu_top.v        # 自動化驗證 Testbench (產生 mcu_bus.vcd)


五、操作方式與執行指令 (How to Build & Run)
--------------------------------------------------------------------------------

【方式 A：使用根目錄一鍵腳本 `run_sim.sh`】
在專案根目錄 `/home/kk/ai_garbage/mcu_bus` 下可直接執行：

1. 一次編譯並驗證所有子專案 (Verilog + C99 + TypeScript Web + C# GUI)：
   $ ./run_sim.sh all

2. 單獨執行特定目標：
   $ ./run_sim.sh verilog   # 執行 Icarus Verilog 模擬並產生 verilog_mcu_bus/mcu_bus.vcd
   $ ./run_sim.sh c         # 編譯並執行 C99 模擬器，產生 c_mcu_bus/mcu_bus_c.vcd
   $ ./run_sim.sh csharp    # 啟動 C# 跨平台 XAML 桌面視窗程式
   $ ./run_sim.sh web       # 啟動 TypeScript Web 互動式介面 (http://localhost:5173)
   $ ./run_sim.sh gtkwave   # 使用原生 GTKWave 開啟 Verilog 產生的 mcu_bus.vcd 波形


【方式 B：各子專案獨立操作說明】

--------------------------------------------------------------------------------
1. C# 跨平台桌面 GUI (`csharp_wpf_mcu_bus`)
--------------------------------------------------------------------------------
本專案已設定為跨平台 `net10.0` (Avalonia XAML)，在 Ubuntu Linux (X11/Wayland)、
Windows 與 macOS 皆可直接透過 `dotnet run` 啟動視窗：

  $ cd ~/ai_garbage/mcu_bus/csharp_wpf_mcu_bus
  $ dotnet run

  [GUI 介面操作方式]：
  - 上方控制列：
    * 點擊「Step Cycle (+1)」：單步推進 1 個 Clock Cycle，細部觀察匯流排仲裁與 DMA 狀態轉換。
    * 點擊「Auto Run」 / 「Pause」：自動連續執行模擬；可透過「Speed (ms)」滑桿調整時脈速度。
    * 點擊「Reset」：重置所有硬體狀態並重新排程預設測試資料。
    * 「Transfer Mode」下拉選單：可切換 `P2P: UART -> I2C`、`P2M: UART -> SRAM (INC)`、
      `P2P Circular Ring` 等不同 DMA 模式。
    * 點擊「Inject UART Byte」：即時手動塞入一筆隨機 Byte 到 UART RX FIFO（若連按超過
      4 次可觀察到硬體 Overrun 中斷觸發）。
  - 中央 GTKWave 數位波形檢視器：
    * 【滑鼠左鍵點擊 / 拖曳】：移動黃色主游標 `T1`，左側清單會即時顯示 `T1` 時間點的各訊號數值。
    * 【滑鼠右鍵點擊】：設定青色測量游標 `T2`（再次右鍵可取消），自動在上方顯示週期差 `ΔT`。
    * 【滑鼠滾輪】或上方 `+` / `-` / `Fit` 按鈕：放大或縮小時間軸 (Pixels per Cycle)。
    * 勾選「Follow Latest Cycle」：在自動執行時讓波形視窗自動跟隨最新時脈。

--------------------------------------------------------------------------------
2. TypeScript 網頁版互動 GUI (`ts_web_mcu_bus`)
--------------------------------------------------------------------------------
啟動開發伺服器：

  $ cd ~/ai_garbage/mcu_bus/ts_web_mcu_bus
  $ npm install
  $ npm run dev

  瀏覽器開啟顯示之網址 (預設為 http://localhost:5173) 即可操作。

  [Web 介面特色與操作方式]：
  - 預設載入「GTKWave Signal Waveform (VCD)」分頁，可即時觀察模擬波形，亦可切換至
    「Hardware Architecture Diagram」分頁觀看 CPU/DMA/UART/I2C/SRAM 動態資料粒子流向。
  - 支援直接與 Verilog / C 模擬器聯動：
    * 點擊波形工具列上的「Load Verilog VCD」按鈕：直接載入由 Verilog Testbench 產生的
      真實 RTL 波形 (`mcu_bus.vcd`) 進行檢視與游標量測。
    * 點擊「Load .vcd File」：可從本機選擇任意 `.vcd` 檔案（例如 `c_mcu_bus/mcu_bus_c.vcd`）。
    * 點擊「Export .vcd」：將目前網頁模擬器的訊號紀錄匯出為標準 IEEE 1364 `.vcd` 檔案，
      可直接用桌面版 GTKWave 開啟。

--------------------------------------------------------------------------------
3. Verilog RTL 模擬與 GTKWave (`verilog_mcu_bus`)
--------------------------------------------------------------------------------
需要環境安裝 `iverilog` (Icarus Verilog) 與選配 `gtkwave`：

  $ cd ~/ai_garbage/mcu_bus/verilog_mcu_bus
  $ ./run_sim.sh

  手動編譯與執行指令：
  $ iverilog -g2012 -o mcu_sim rtl/bus_arbiter.v rtl/uart_rx.v rtl/i2c_tx.v \
      rtl/sram.v rtl/nvic.v rtl/cpu_core.v rtl/dma_controller.v rtl/mcu_top.v tb/tb_mcu_top.v
  $ vvp mcu_sim

  執行後會跑完 Test 1 (P2P UART -> I2C, 4 Bytes) 與 Test 2 (P2M UART -> SRAM, 3 Bytes)，
  並在目錄下產生 `mcu_bus.vcd`。若系統有安裝 GTKWave，可執行：
  $ gtkwave mcu_bus.vcd mcu_bus.gtkw

--------------------------------------------------------------------------------
4. C (C99) 模擬器 (`c_mcu_bus`)
--------------------------------------------------------------------------------
使用 GCC 與 Make 編譯並執行：

  $ cd ~/ai_garbage/mcu_bus/c_mcu_bus
  $ make run

  執行後會在終端機印出兩個測試案例每個 Cycle 的硬體匯流排仲裁結果、DMA 內部暫存器變化、
  最終的 ANSI 彩色時序邏輯表，以及自動產生 `c_mcu_bus/mcu_bus_c.vcd` 波形檔。
================================================================================
