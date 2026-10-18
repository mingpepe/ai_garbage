# Microcontroller Bus & DMA Hardware-Level Simulator (Verilog RTL / C / C# WPF / TypeScript Web)

本專案提供高擬真度的 **微控制器 (MCU) 系統匯流排 (AHB-style System Bus) 與 DMA 控制器** 週期精確 (Cycle-Accurate) 硬體模擬實作，包含：
1. **Verilog RTL 與 Testbench (`verilog_mcu_bus`)**：完整可合成風格 RTL（`bus_arbiter.v`, `dma_controller.v`, `uart_rx.v`, `i2c_tx.v`, `cpu_core.v`, `nvic.v`, `sram.v`, `mcu_top.v`）與自動化 Testbench（`tb_mcu_top.v`），產生標準 IEEE 1364 `mcu_bus.vcd` 波形檔與 `mcu_bus.gtkw` 設定檔。
2. **C 語言硬體引擎 (`c_mcu_bus`)**：純 C99 實作，支援 ANSI 彩色週期間追蹤表並自動輸出 `mcu_bus_c.vcd`。
3. **C# .NET WPF 桌面視覺化應用 (`csharp_wpf_mcu_bus`)**：完整 MVVM 儀表板，內建自訂 **GTKWave 風格內部訊號波形檢視器 (`GtkWaveControl`)**。
4. **TypeScript 現代 Web App UI (`ts_web_mcu_bus`)**：搭載高解析度 **GTKWave 風格多軌波形分析儀 (`GtkWaveViewer`)**，支援即時模擬波形繪製，亦可直接載入 Verilog 產生的 `mcu_bus.vcd` 或任意 `.vcd` 檔案！

---

## 一鍵執行腳本 (`run_sim.sh`)

根目錄與 `verilog_mcu_bus/` 皆提供自動化腳本 [`run_sim.sh`](file:///home/kk/ai_garbage/mcu_bus/run_sim.sh)：

```bash
# 一次執行 Verilog 模擬 (產生 mcu_bus.vcd)、C 模擬 (產生 mcu_bus_c.vcd)、C# 編譯與 TypeScript Web 打包
./run_sim.sh

# 僅執行 Verilog RTL 模擬並產出 mcu_bus.vcd
./run_sim.sh --verilog

# 執行 Verilog 模擬並直接啟動原生 GTKWave 載入預先排好訊號階層的 mcu_bus.gtkw
./run_sim.sh --gtkwave

# 執行 Verilog 模擬、同步 VCD 並啟動 TypeScript Web UI 開發伺服器
./run_sim.sh --web
```

---

## GTKWave 風格內部訊號波形 UI (`GtkWaveViewer` & `GtkWaveControl`)

在 **TypeScript Web UI** 與 **C# WPF UI** 中，皆內建仿 **GTKWave** 的多軌內部訊號波形檢視器：
- **左側訊號階層與游標數值欄 (`Signals` & `Value @ Marker`)**：
  - 分組展示內部階層訊號：`[CLK] clk`, `[BUS] bus_master[1:0]`, `u_arb.cpu_req`, `u_arb.dma_req`, `haddr[31:0]`, `hwrite`, `hwdata[7:0]`, `hrdata[7:0]`, `[DMA] u_dma.state[2:0]`, `u_dma.cndtr[15:0]`, `u_dma.data_latch[7:0]`, `dreq_uart_rx`, `dreq_i2c_tx`, `irq_dma_tc`, `[UART] u_uart.fifo_cnt[2:0]`, `[I2C] u_i2c.fifo_cnt[1:0]`, `u_i2c.is_transmitting`, `u_i2c.shift_byte[7:0]`, `i2c_sda`, `[CPU] u_cpu.state[1:0]`, `[NVIC] u_nvic.ispr[3:0]`, `[SRAM] u_sram.mem[0][7:0]`。
- **右側經典 GTKWave 波形畫布**：
  - **1-bit 數位信號**：亮綠/亮彩階梯波，高電位帶半透明底色填充。
  - **Multi-bit 匯流排與狀態向量**：經典 GTKWave **六角形交叉轉態封包 (Hexagonal Bus Crossover Envelope)**，並在穩定區間內置中顯示十六進位值或狀態名稱（如 `0x40000008`, `WAIT_REQ`, `REQ_SRC`, `REQ_DST`, `0x11`）。
  - **互動式游標與時間差測量**：
    - **左鍵點擊 / 拖曳**：移動**紅色主游標 (Primary Marker)**，左側訊號列表即時刷新該時間點所有內部訊號數值。
    - **Shift + 左鍵 / 右鍵點擊 (Web UI)**：放置**琥珀色基準線 (Baseline Marker)**，自動計算兩時間點之差值 `Δt (ns)`。
    - **縮放與捲動**：支援 `🔍+ Zoom In`、`🔍- Zoom Out`、`[ ] Zoom Fit`、`Ctrl + 滾輪縮放` 與 `滾輪水平捲動`。
  - **直接讀取 Verilog VCD**：Web UI 點擊 **`📂 Load Verilog VCD (mcu_bus.vcd)`** 即可將 `iverilog` 跑出的 72 週期完整 RTL 波形（含 P2P 與 P2M 兩大測試場景）載入瀏覽器檢視！

---

## 目錄結構

```
mcu_bus/
├── run_sim.sh                 # 主自動化模擬與建置腳本
├── verilog_mcu_bus/           # Verilog RTL 與 Testbench 實作
│   ├── Makefile
│   ├── run_sim.sh             # Verilog 編譯、vvp 模擬與 VCD 同步腳本
│   ├── mcu_bus.gtkw           # GTKWave 預設訊號分組設定檔
│   ├── rtl/
│   │   ├── bus_arbiter.v      # AHB 匯流排仲裁器 (Priority + Round-Robin)
│   │   ├── dma_controller.v   # 硬體 DMA 控制器 (狀態機、鎖存器、CPAR/CMAR/CNDTR/CCR)
│   │   ├── uart_rx.v          # UART0 接收器 (4-byte RX FIFO, RXNE DREQ, Overrun)
│   │   ├── i2c_tx.v           # I2C0 發送器 (2-byte TX FIFO, TXE DREQ, SCL/SDA 串列移位器)
│   │   ├── cpu_core.v         # CPU 核心 (背景輪詢與硬體 ISR 自動清除旗標)
│   │   ├── nvic.v             # NVIC 中斷控制器 (邊緣觸發掛起與優先權編碼)
│   │   ├── sram.v             # 256-byte SRAM 記憶體模組
│   │   └── mcu_top.v          # Top-level SoC 整合與 MMIO 解碼器
│   └── tb/
│       └── tb_mcu_top.v       # 完整自檢 Testbench (P2P + P2M 測試並輸出 mcu_bus.vcd)
│
├── c_mcu_bus/                 # C99 硬體模擬核心 (輸出彩色表格與 mcu_bus_c.vcd)
├── csharp_wpf_mcu_bus/        # C# .NET WPF 桌面應用 (含 Controls/GtkWaveControl.cs)
└── ts_web_mcu_bus/            # TypeScript Web App (含 src/ui/gtkwaveViewer.ts 與 VCD 解析器)
```
