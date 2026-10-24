# Dual-Core RISC-V SoC (Verilog RTL + Firmware + I2C Register Bank + Report Buffer + C# Simulator + VSCode GDB Debug)

本專案實作一個完整的 **雙核心 RISC-V (`RV32IMA_Zicsr`) SoC**，包含：
1. **Verilog 硬體設計 (`rtl/`)**：
   - 兩個獨立的 RISC-V Core (`u_core0`, `u_core1`)、各自的專屬 Local SRAM (`u_sram_core0`, `u_sram_core1`)、共用記憶體 (`u_shared_sram`)。
   - 支援 RV32A 原子指令 (`amoswap.w`, `lr.w`/`sc.w`, `amoadd.w` 等) 的匯流排仲裁器 (`u_interconnect`)。
   - IPI (Inter-Processor Interrupt) 中斷控制器與 Core 1 Boot Controller (`u_clint`)。
   - **雙 Register Bank (`Bank 0` & `Bank 1`, 各 `0x7F` bytes)、`0x7F` 切 Bank 暫存器、Host (I2C) 與 FW 硬體仲裁器、256-byte Report Buffer 及 `Bank 0 Reg 0x0F` 特殊導向埠 (`rtl/i2c_regbank_subsys.v`)**。
2. **雙核心韌體 (`fw/`)**：
   - **Core 0 (`fw_core0`)**：於 SoC Reset 釋放後由 **SoC 硬體自動啟動 (`0x0000_0000`)**，初始化 Shared Memory 後透過 `REG_CORE1_BOOT_ADDR` / `REG_CORE1_BOOT_CTRL` **啟動 Core 1 (`0x0001_0000`)**；完成雙核 Spinlock 與 IPI 後，切換 Bank 0 / Bank 1 寫入狀態、將 32-byte 大塊資料寫入 **Report Buffer**，並寫入 `Bank 0 Reg 0x04 (B0_RPT_STATUS = 1)` 通知 Host。
   - **Core 1 (`fw_core1`)**：由 **Core 0 啟動**，發送 Boot-Ack IPI 給 Core 0，與 Core 0 透過 **RV32A Atomic 指令 + Shared Memory Spinlock** 保護臨界區間更新計數器，並進行雙向 IPI Ping-Pong 通訊。
3. **VCD 波形產生與 GTKWave 檢視 (`tb/`)**：Testbench 同時模擬雙核 SoC 與外部 **Host I2C Master**（透過 `SCL`/`SDA` 切換 `0x7F` Bank、Polling `0x04`、並由 `Bank 0 0x0F` 讀取整塊 Report Buffer），自動輸出 `soc_wave.vcd` 與 `tb/view_wave.gtkw`。
4. **VSCode 單步除錯 (`.vscode/` + 內建 GDB RSP Server)**：支援直接於 VSCode 按 `F5` 透過 `riscv32-unknown-elf-gdb` 進行 C / Assembly 單步除錯 (Single-Step)。
5. **C# 多執行緒模擬器 (`csharp_soc/`)**：包含 **SoC 雙核執行緒 (`RISCV-Core0-Thread`, `RISCV-Core1-Thread`) + I2C Bus 模擬 (`I2cBusSimulator.cs`) + Register Bank / Report Buffer 仲裁模組 (`I2cRegBankSubsystem.cs`) + Host Application 執行緒 (`HostApplication.cs`)**，行為與 Verilog 100% 一致。

---

## 記憶體映射 (Memory Map)

| 位址範圍 | 大小 | 模組 | 說明 |
| :--- | :--- | :--- | :--- |
| `0x0000_0000` - `0x0000_3FFF` | 16 KB | `u_sram_core0` | **Core 0 專屬 SRAM** (存放 `fw_core0` 程式碼、資料與 Stack) |
| `0x0001_0000` - `0x0001_3FFF` | 16 KB | `u_sram_core1` | **Core 1 專屬 SRAM** (存放 `fw_core1` 程式碼、資料與 Stack) |
| `0x1000_0000` - `0x1000_3FFF` | 16 KB | `u_shared_sram` | **Shared Memory** (支援 Atomic RMW 及 LR/SC 硬體 Reservation) |
| `0x2000_0000` - `0x2000_0FFF` | 4 KB | `u_clint` | **IPI 中斷與雙核 Boot 控制器** (`MSIP_CORE0/1`, `CORE1_BOOT_CTRL`) |
| `0x3000_0000` - `0x3000_0FFF` | 4 KB | `UART / Trace` | **UART Console 輸出** (`0x3000_0000`) 與 `REG_DBG_TRACE` (`0x3000_0008`) |
| `0x4000_0000` - `0x4000_007F` | 128 B | `u_regbank_subsys` | **雙 Register Bank 視窗** (`0x00..0x7E` 為當前 Bank 暫存器，`0x7F` 為切 Bank) |
| `0x4000_1000` - `0x4000_10FF` | 256 B | `u_regbank_subsys` | **Report Buffer 記憶體視窗** (供 FW 寫入大塊 Report 資料) |

---

## Dual Register Bank (`Bank 0` & `Bank 1`) 與 `0x0F` Report Buffer 機制

- **I2C Slave Address**: `0x42` (7-bit)
- **Bank Size**: 每個 Bank 大小為 **`0x7F` bytes (`0x00 .. 0x7E`)**。
- **切 Bank 暫存器 (`0x7F`)**：寫入 `0x00` 切換至 **Bank 0**；寫入 `0x01` 切換至 **Bank 1**。
- **Host (I2C) 與 FW 存取仲裁 (Arbiter)**：
  - 硬體內建 Round-Robin 仲裁器 ([rtl/i2c_regbank_subsys.v](file:///home/kk/ai_garbage/mcu/rtl/i2c_regbank_subsys.v#L89-L97) / [csharp_soc/I2cRegBankSubsystem.cs](file:///home/kk/ai_garbage/mcu/csharp_soc/I2cRegBankSubsystem.cs#L24-L36))，當 Host I2C 與 FW 同時存取 Register Bank 時自動進行互斥仲裁。
- **Special Port `Bank 0, Reg 0x0F`**：
  - 在 **Bank 0** 中，`0x0F` **不是一般暫存器**，而是硬體重導向至 **Report Buffer** 的特殊資料埠！
  - 當 FW 寫入好 32-byte Report Buffer 後，將 `Bank 0 Reg 0x04 (B0_RPT_STATUS)` 設為 `0x01`（同時硬體自動將 `rpt_rd_ptr` 歸零）。
  - Host Application 透過 I2C Polling `Bank 0 Reg 0x04` 發現值為 `0x01` 後，直接對 **`Bank 0 Reg 0x0F`** 進行讀取（支援單筆或 I2C Burst Read），硬體每次讀取自動吐出 `report_buffer[rpt_rd_ptr++]`！
  - 在 **Bank 1** 中，`0x0F` 則維持為一般普通暫存器（測試中寫入 `0xA5` 驗證區隔）。

---

## 快速開始指令

```bash
# 1. 編譯 FW + 執行 Verilog 模擬 (產生 soc_wave.vcd) + 執行 C# 多執行緒模擬
make all

# 2. 用 GTKWave 查看 VCD 波形 (含 I2C SCL/SDA、Bank 切換、Arbiter、Report Buffer 指標)
make wave

# 3. 單獨執行 C# 模擬器 (包含 Dual-Core Threads + I2C Bus + Host Application Thread)
make csharp

# 4. 執行 GDB 單步除錯驗證
make gdb-test
```
