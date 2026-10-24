# HID over I2C (HIDI2C) Protocol Simulator & Host Controller

> 一個用 C# (.NET 10) 撰寫的高精確度 **HID over I2C (HIDI2C)** Host 與 Device 模擬器。包含硬體腳位模擬（SCL、SDA、INT#、RESET#）、虛擬邏輯分析儀、ACPI `_DSM` 探索、30-Byte HID 描述元、USB-IF Report 描述元解析器與自動化協定合規測試套件。

---

## 目錄 (Table of Contents)
1. [HID 與 HID over I2C 的起源與定義者](#1-hid-與-hid-over-i2c-的起源與定義者)
2. [HID over I2C vs USB HID 詳細差異比較](#2-hid-over-i2c-vs-usb-hid-詳細差異比較)
3. [硬體訊號線與 Pin 腳定義 (Hardware Pinout)](#3-硬體訊號線與-pin-腳定義-hardware-pinout)
4. [通訊協定細節 (Protocol Deep-Dive)](#4-通訊協定細節-protocol-deep-dive)
   - [ACPI 探索與 `_DSM` GUID](#acpi-探索與-_dsm-guid)
   - [30-Byte Microsoft HID Descriptor 結構](#30-byte-microsoft-hid-descriptor-結構)
   - [Command Register 暫存器架構](#command-register-暫存器架構)
   - [封包框架：2-Byte Length Prefix](#封包框架2-byte-length-prefix)
5. [HID over I2C 的應用場景](#5-hid-over-i2c-的應用場景)
6. [程式碼架構與模組說明 (Project Architecture)](#6-程式碼架構與模組說明-project-architecture)
7. [操作指南 (How to Run & User Guide)](#7-操作指南-how-to-run--user-guide)
8. [協定流程 ASCII 時序圖 (Protocol Timing Diagram)](#8-協定流程-ascii-時序圖-protocol-timing-diagram)

---

## 1. HID 與 HID over I2C 的起源與定義者

### 1.1 什麼是 HID？誰定義的？
- **定義者**：**USB-IF (USB Implementers Forum)**。
- **發表時間**：1997 年 (v1.0)，2001 年發布廣泛沿用的 **USB HID Specification v1.11**。
- **設計核心**：「**自描述硬體 (Self-Describing Hardware)**」。
  - 在 HID 出現前，作業系統針對每家廠商的滑鼠或鍵盤都需要專屬驅動程式。
  - HID 定義了 **Report Descriptor（報告描述元）** 位元組碼（Bytecode）。硬體在連線時會將這份二進位表傳給 Host，描述內部每個按鈕、X/Y 座標的位元長度（Report Size）、數量（Report Count）、數值上下限（Logical Min/Max）與物理單位。
  - 作業系統的標準通用驅動程式（如 Windows 的 `hidclass.sys` 或 Linux 的 `hid-core`）只需解析這份報告描述元，就能立即操控該裝置，無需第三方驅動程式。

### 1.2 什麼是 HID over I2C？誰定義的？
- **定義者**：**微軟公司 (Microsoft Corporation)**。
- **發表時間**：2011～2012 年（配合 Windows 8 發表，正式規範名稱為 *HID Over I2C Protocol Specification Version 1.00*）。
- **制定背景**：
  - Windows 8 主打觸控平板電腦（Tablet）、變形筆電（2-in-1）與輕薄筆電（Ultrabook）。
  - 若在筆電內部將觸控板（Touchpad）、觸控螢幕（Touchscreen）接在 USB 匯流排上，USB 控制器持續發送 SOF（Start of Frame）Token 會阻止 CPU 進入深層睡眠（C-States），造成嚴重耗電與電池壽命縮短。
  - 微軟因此將 **USB-IF 成熟的 HID 資料模型直接嫁接到低功耗的 I2C 匯流排**上，制定了 HIDI2C 標準。
  - 作業系統內建驅動程式：
    - **Windows**：內建收件匣驅動程式 `hidi2c.sys`。
    - **Linux**：核心內建驅動程式 `drivers/hid/i2c-hid/i2c-hid-core.c`。

---

## 2. HID over I2C vs USB HID 詳細差異比較

| 比較維度 | USB HID (通用序列匯流排) | HID over I2C (HIDI2C) |
| :--- | :--- | :--- |
| **定義組織** | USB Implementers Forum (USB-IF) | Microsoft Corporation |
| **實體線路數** | 至少 4 條（D+, D-, VBUS, GND） | 5 ~ 6 條（SCL, SDA, INT#, RESET#, VDD, GND） |
| **訊號型態** | 差動訊號（Differential NRZI, USB PHY） | 單端開漏極（Open-Drain，需上拉電阻） |
| **匯流排拓撲** | 以 Host / Hub 為中心的星狀拓撲（Star） | 多裝置共用的多點匯流排（Multi-drop Bus） |
| **傳輸速率** | 1.5 Mbps (Low) / 12 Mbps (Full) / 480 Mbps | 100 kHz (Standard) / 400 kHz (Fast) / 1 MHz (FM+) |
| **中斷機制** | **Polling 輪詢機制**：Host 定期發送 `IN` Token | **硬體中斷 (IRQ)**：Slave 主動將 `INT#` 腳位拉低 (LOW) |
| **待機耗電量** | 較高（毫安培等級 mA，持續 USB SOF 封包） | **極低（微安培等級 µA，匯流排完全靜默 0 Hz）** |
| **裝置探索** | 動態熱插拔列舉（USB Standard Requests） | **靜態描述**（x86 由 ACPI `_DSM` 提供；ARM 由 Device Tree 提供） |
| **封包標頭** | USB 封包框架（Token, Data, Handshake, CRC） | **2-Byte Length Prefix**（封包開頭即為 16-bit 總長度） |
| **晶片複雜度與成本** | 較高（需 USB 控制器、振盪晶體、PLL） | 極低（僅需簡易 I2C Slave 狀態機，成本極低） |
| **主要應用場景** | 外接滑鼠、外接鍵盤、遊戲手把、飛行搖桿 | **筆電內部觸控板 (Precision Touchpad)、觸控螢幕、感測器** |

---

## 3. 硬體訊號線與 Pin 腳定義 (Hardware Pinout)

HID over I2C 運作時，Host（主機 SoC）與 Peripheral（周邊裝置，如觸控板晶片）之間需要以下 **5 到 6 條腳位**：

```text
+---------------------------------------------------------------------------------+
|                          HID OVER I2C 硬體連接圖與腳位定義                      |
+---------------------------------------------------------------------------------+
|                                                                                 |
|   HOST PROCESSOR (SoC)                                   HIDI2C SLAVE DEVICE    |
|   (e.g., Intel / AMD / ARM)                              (Touchpad/Touchscreen) |
|   +--------------------+                                 +--------------------+ |
|   |                    |           VDD (1.8V / 3.3V)     |                    | |
|   |                    |           +------+              |                    | |
|   |                    |                  |              |                    | |
|   |                    |                 [R] ~2.2k-4.7k  |                    | |
|   |                    |                  |              |                    | |
|   |        I2C_SCL ----+------------------+------------> | SCL                | |
|   |                    |                  |              |                    | |
|   |                    |                 [R] ~2.2k-4.7k  |                    | |
|   |                    |                  |              |                    | |
|   |        I2C_SDA <---+------------------+------------> | SDA (Open-Drain)   | |
|   |                    |                  |              |                    | |
|   |                    |                 [R] ~10k Pull-up|                    | |
|   |                    |                  |              |                    | |
|   |       GPIO_INT <---+------------------+------------- | INT# / IRQ#        | |
|   |                    |                                 | (Active-LOW)       | |
|   |                    |                                 |                    | |
|   |      GPIO_RST# ----+-------------------------------> | RESET# (Opt/ActiveL| |
|   |                    |                                 |                    | |
|   |                VDD +--------------------------------> VDD                 | |
|   |                GND +--------------------------------> GND                 | |
|   +--------------------+                                 +--------------------+ |
+---------------------------------------------------------------------------------+
```

### 腳位詳細說明：
1. **SCL (Serial Clock - 序列時脈線)**：
   - **方向**：Host (Master) $\to$ Peripheral (Slave)。
   - **電氣特性**：開漏極（Open-Drain），由外部上拉電阻（通常為 2.2kΩ ~ 4.7kΩ）拉至 VDD。
   - **工作頻率**：通常為 400 kHz (Fast-Mode) 或 1 MHz (Fast-Mode Plus)。

2. **SDA (Serial Data - 序列資料線)**：
   - **方向**：雙向（Bidirectional）。
   - **電氣特性**：開漏極（Open-Drain），同樣需上拉電阻（2.2kΩ ~ 4.7kΩ）。

3. **INT# / IRQ# (Interrupt - 硬體中斷線，最關鍵的一根腳位！)**：
   - **方向**：Peripheral (Slave) $\to$ Host (Master)。
   - **電氣特性**：**Active-LOW（低電位觸發）**，平時透過 10kΩ 上拉電阻保持高電位（HIGH）。
   - **核心原理**：因為 I2C 匯流排是嚴格的「主機驅動（Master-driven）」架構，Slave 沒被叫號前不能主動傳輸。**當使用者碰觸觸控板時，周邊晶片將 INT# 腳位拉低（LOW）**，通知 Host 的 GPIO 中斷控制器觸發 ISR（中斷服務常式），Host 才會發起 I2C Read 讀取資料！讀取完畢後，INT# 釋放回高電位。

4. **RESET# (Hardware Reset - 硬體重設線，建議具備)**：
   - **方向**：Host (Master) $\to$ Peripheral (Slave)。
   - **電氣特性**：Active-LOW。Host 於開機或異常復原時將其拉低 $\ge 10\text{ms}$，強制周邊晶片硬體重新啟動。

5. **VDD / VCC (電源供應線)**：
   - 現代筆電內部周邊多採用 **1.8V** 邏輯電位（以達到超低功耗），亦有部分系統採用 **3.3V**。

6. **GND (共用接地)**：
   - 提供訊號回路的參考零電位。

---

## 4. 通訊協定細節 (Protocol Deep-Dive)

### ACPI 探索與 `_DSM` GUID
I2C 匯流排不像 USB 具有即插即用探索能力，Host 開機時如何知道 Slave 的位置與暫存器？
在 x86 系統（Intel / AMD）中，主機板 BIOS/UEFI 透過 **ACPI DSDT 表** 定義：
- **硬體識別碼**：`_HID = "PNP0C50"`（代表微軟標準 HID-over-I2C 裝置）。
- **資源設定 (`_CRS`)**：指定 I2C 7-bit 奴隸位址（如 `0x20`）與連接的 GPIO 中斷腳位。
- **微軟專用方法 (`_DSM`)**：
  - **GUID**：`3CDFF6F7-4267-4555-AD05-B30A3D8938DE`
  - **Function 1**：回傳一個 16-bit 數值，告訴作業系統「**30-Byte Microsoft HID Descriptor 的暫存器位址**」（本專案為 `0x0001`）。

### 30-Byte Microsoft HID Descriptor 結構
驅動程式讀取 ACPI 指定的暫存器（如 `0x0001`）後，周邊會回傳精確的 **30 個位元組（Little-Endian）**：

```text
Offset | 欄位名稱             | 長度 (Bytes) | 說明
-------+----------------------+--------------+-----------------------------------------
 0..1  | wHIDDescLength       | 2            | 本描述元長度（固定為 30 / 0x001E）
 2..3  | bcdVersion           | 2            | 規範版本（0x0100 代表 v1.00）
 4..5  | wReportDescLength    | 2            | USB-IF Report 描述元的總位元組長度
 6..7  | wReportDescRegister  | 2            | 讀取 Report 描述元的 16-bit 暫存器位址 (0x0020)
 8..9  | wInputRegister       | 2            | 讀取 Input 報告的 16-bit 暫存器位址 (0x0005)
10..11 | wMaxInputLength      | 2            | 最大 Input 報告位元組長度
12..13 | wOutputRegister      | 2            | 寫入 Output 報告的 16-bit 暫存器位址 (0x0006)
14..15 | wMaxOutputLength     | 2            | 最大 Output 報告位元組長度
16..17 | wCommandRegister     | 2            | 下達 HID 指令的 16-bit 暫存器位址 (0x0007)
18..19 | wDataRegister        | 2            | 指令資料交換的 16-bit 暫存器位址 (0x0008)
20..21 | wVendorID            | 2            | USB-IF 廠商代號 (VID, 例如 0x04F3)
22..23 | wProductID           | 2            | 產品代號 (PID, 例如 0x2718)
24..25 | wVersionID           | 2            | 韌體版本號 (REV, 例如 0x0100)
26..29 | Reserved             | 4            | 保留欄位，必須填 0x00000000
```

### Command Register 暫存器架構
Host 寫入 `wCommandRegister`（2 個位元組）來控制周邊裝置：
```text
+---------------+---------------+---------------+---------------+
| 15 14 13 12   | 11 10  9  8   |  7  6  5  4   |  3  2  1  0   |
|   Reserved    |    OpCode     |  Report Type  |   Report ID   |
|    (0000)     |  (4 bits)     |  (4 bits)     |   (4 bits)    |
+---------------+---------------+---------------+---------------+
```
- **OpCode 定義**：
  - `0x01`：**RESET**（軟體重設）。
  - `0x02`：**GET_REPORT**。
  - `0x03`：**SET_REPORT**。
  - `0x08`：**SET_POWER**（電源控制：`0` = 開啟 ON，`1` = 進入省電睡眠 SLEEP）。

### 封包框架：2-Byte Length Prefix
在 I2C 匯流排上傳遞的所有 HID 資料（Input, Output, Feature Reports），都**必須在最前方加上 2 個位元組的長度標頭**：
```text
+----------------+----------------+----------------+-------------------------+
|  Byte 0 (LSB)  |  Byte 1 (MSB)  |  Byte 2 (Opt)  |  Byte 3 .. N            |
+----------------+----------------+----------------+-------------------------+
|       Total Packet Length       |   Report ID    | HID Report Payload Data |
| (包含這 2 個長度位元組本身)    | (若有定義)     | (由 ReportDesc 定義)    |
+----------------+----------------+----------------+-------------------------+
```
> **注意**：如果 Host 讀取 `wInputRegister` 時收到 `Length = 0x0000` 或 `Length = 0x0002`（無額外資料），代表裝置目前沒有待處理的報告。

---

## 5. HID over I2C 的應用場景

1. **筆記型電腦 Precision Touchpad (精確觸控板)**：
   - 包含 ThinkPad、Dell XPS、Surface Laptop、HP Spectre 等所有現代 Windows 筆電的觸控板，內部幾乎全面採用 HIDI2C 與 SoC 連接。
2. **電容式多點觸控螢幕 (Capacitive Touchscreens)**：
   - 平板電腦、2 合 1 筆電的十點觸控面板與主動式觸控筆（Active Stylus / Digitizer）。
3. **整合式感測器中樞 (Integrated Sensor Hub - ISH)**：
   - 陀螺儀（Gyroscope）、加速度計（Accelerometer）、環境光感測器（ALS）、電子羅盤（Magnetometer）。
4. **二合一鍵盤與熱鍵控制器 (Convertible Folio Keyboards)**：
   - Surface Pro 鍵盤保護蓋、翻轉筆電的折疊角度感測與快捷按鈕。
5. **車用資訊娛樂系統 (Automotive IVI & Center Display)**：
   - 車用中控觸控螢幕、空調實體按鍵模擬面板。

---

## 6. 程式碼架構與模組說明 (Project Architecture)

專案採用嚴謹的物件導向與硬體分層架構設計，各模組職責清晰：

```text
hidi2c/
├── Protocol/
│   ├── HidI2cDefinitions.cs       # HIDI2C v1.00 規範常數、30-Byte 結構、OpCode、封包標頭
│   └── HidReportParser.cs         # USB-IF Report 描述元 Bytecode 生成器、解譯器與 Payload 解碼
├── Hardware/
│   ├── GpioPin.cs                 # GPIO 腳位模擬（支援 Open-Drain、上拉電阻、邊緣與電位觸發）
│   └── I2CBus.cs                  # I2C 實體匯流排模擬（START, SLA+W, ACK, Sr, SLA+R, STOP, 邏輯分析儀追蹤）
├── Device/
│   └── HidI2cDevice.cs            # 周邊晶片模擬（Elan Precision Touchpad，含暫存器對應表與 INT# 觸發）
├── Host/
│   └── HidI2cHostDriver.cs        # 作業系統驅動層模擬（Windows hidi2c.sys / Linux i2c-hid 行為）
├── Docs/
│   └── ArchitectureKnowledgeBase.cs # 內建完整知識庫與 ACPI ASL DSDT 範例程式碼
├── Program.cs                     # 互動式主選單、步進式引導教學、觸控實驗室與自動化測試套件
├── HidI2cSimulation.csproj        # .NET 10 專案檔
└── README.md                      # 本說明文件
```

---

## 7. 操作指南 (How to Run & User Guide)

### 7.1 環境需求
- [.NET 10 SDK](https://dotnet.microsoft.com/) 或更新版本。

### 7.2 編譯與執行
在終端機切換至本專案目錄：
```bash
# 編譯專案
dotnet build

# 執行模擬器
dotnet run
```

### 7.3 功能選單說明
啟動後會出現主控制台選單：
```text
====================================================================================================
           HID OVER I2C (HIDI2C) PROTOCOL SIMULATOR & EDUCATIONAL HOST CONTROLLER
====================================================================================================
 Hardware Wiring:
   [Host SoC] --- SCL (I2C Clock) ---------> [Slave Device: 0x20]
   [Host SoC] <-> SDA (Bidirectional Data) -> [Slave Device: 0x20]
   [Host SoC] <-- INT# (Active-Low IRQ) ----- [Slave Device: 0x20] (Pulled HIGH via 10k)
   [Host SoC] --- RESET# (Hardware Reset) --> [Slave Device: 0x20]
====================================================================================================
 Select an option:
  [1] Guided Step-by-Step Walkthrough (Boot -> ACPI -> Enumerate -> Touch)
  [2] Interactive Touchpad Laboratory (Tap, Drag, Multi-touch, Click)
  [3] Virtual Logic Analyzer / Wire Protocol Trace Viewer
  [4] USB-IF HID Report Descriptor Disassembler & Bytecode Inspector
  [5] Architecture Knowledge Base, Pinout & USB vs I2C Comparison
  [6] Run Automated Protocol Compliance Test Suite
  [7] Exit
```

1. **[1] 步進式引導教學 (Guided Step-by-Step Walkthrough)**：
   - 帶領您從硬體開機、RESET# 脈衝、ACPI `_DSM` 探索、讀取 30 位元組 HID 描述元、下達軟體 RESET、讀取 USB-IF Report 描述元、喚醒電源 (SET_POWER ON)，到手指碰觸時 INT# 觸發中斷與資料解碼的全過程。
2. **[2] 互動式觸控實驗室 (Interactive Touchpad Laboratory)**：
   - 可即時模擬單指點擊（Tap）、手指拖曳畫線（Drag）、雙指滾動手勢（Two-Finger Scroll）、實體左右鍵點擊，以及透過 Feature Report 調整觸覺震動回饋強度（Haptic Click Intensity）。
3. **[3] 虛擬邏輯分析儀 (Virtual Logic Analyzer)**：
   - 印出 SDA、SCL 匯流排上傳遞的每一個 Byte、START、REPEATED START、ACK、NACK 與 STOP 條件。
4. **[4] Report 描述元反組譯器 (Report Descriptor Disassembler)**：
   - 將 134 位元組的二進位 Report Descriptor 反組譯成直觀的樹狀階層結構。
5. **[5] 知識庫與 ACPI ASL 範例 (Architecture Knowledge Base)**：
   - 查看詳細的規格說明、歷史沿革與 ACPI DSDT 程式碼範例。
6. **[6] 自動化協定合規測試 (Automated Test Suite)**：
   - 一鍵執行 13 項協定驗證測試，確保所有暫存器與時序符合 Microsoft 規範。

---

## 8. 協定流程 ASCII 時序圖 (Protocol Timing Diagram)

### 手指碰觸觸控板時的完整硬體訊號流：
```text
           [1] 使用者手指碰觸
           -----------------> [周邊偵測電容改變]
                                      |
                                      | [2] 產生 8-Byte Input Report 並放入 FIFO
                                      v
 INT# Line: --------------------\                                    /---------------------
 (Active-Low)                    \__________________________________/  [6] 佇列清空，釋放 INT#
                                  ^ [3] INT# 拉低 (LOW)
                                  |
                                  v
 Host SoC:  [正常運作/睡眠]        [GPIO 偵測到下降邊緣]
                                  [觸發 Driver ISR]
                                          |
                                          | [4] Host 發起 I2C 讀取 (Reg 0x0005)
                                          v
 I2C Bus:   --[START]--[SLA+W 0x40]--[REG 0x05 0x00]--[Sr]--[SLA+R 0x41]--[DATA 10 BYTES]--[STOP]--
                                                                               ^
                                                                               | [5] 傳回包含 2-byte Length
                                                                               |     前綴的封包
 Host OS:                                                                      v
                                                                 [OS 輸入子系統解析 X/Y/按鈕]
                                                                 [滑鼠游標移動 / 產生點擊事件]
```
