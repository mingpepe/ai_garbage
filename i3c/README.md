# MIPI I3C v1.1.1 SDR & Legacy I2C Coexistence Bus Emulator

這是一個依據 **MIPI I3C v1.1.1 規範** 所設計的完整匯流排模擬器，使用 **C# (.NET 10)** 開發。

本專案專門為**已經對 I2C 非常熟悉、但尚不了解 I3C 的韌體/硬體/系統工程師**設計。模擬器實作了週期精確（Cycle-Accurate，時鐘邊緣等級）的兩線實體層（SCL 與 SDA），具備電氣線與邏輯（Wired-AND）開漏仲裁與推挽短路衝突防護，並提供完整的的主機（Master/Controller）、多個不同特性的 I3C 從機（Slave/Target）與傳統 I2C 從機（Legacy Slave）。

---

## 目錄

- [1. I2C vs I3C 核心差異對照表](#1-i2c-vs-i3c-核心差異對照表)
- [2. Open-Drain 與 Push-Pull 的電氣原理與使用時機](#2-open-drain-與-push-pull-的電氣原理與使用時機)
- [3. 什麼時候分配 Slave ID（Dynamic Address）？](#3-什麼時候分配-slave-id-dynamic-address)
- [4. Slave 什麼時候發出 Interrupt？如何判斷與處理 Arbitration？](#4-slave-什麼時候發出-interrupt如何判斷與處理-arbitration)
- [5. 傳統 I2C Slave 如何在 12.5 MHz I3C 匯流排上相容存活？](#5-傳統-i2c-slave-如何在-125-mhz-i3c-匯流排上相容存活)
- [6. 專案架構與檔案清單](#6-專案架構與檔案清單)
- [7. 如何執行與驗證測試](#7-如何執行與驗證測試)

---

## 1. I2C vs I3C 核心差異對照表

| 項目 | 傳統 I2C | MIPI I3C (SDR Mode) |
| :--- | :--- | :--- |
| **實體線路** | SCL, SDA（兩條線） | SCL, SDA（完全相同的兩條線） |
| **SCL 時鐘驅動者** | Master 開漏驅動；Slave 允許拉低時鐘進行 **Clock Stretching** | **Controller 推挽（Push-Pull）全權驅動**，嚴格禁止任何裝置拉低 SCL（Zero Clock Stretching） |
| **SDA 資料驅動模式**| 永遠是開漏（Open-Drain）+ 外部上拉電阻 | 依欄位動態切換 **Open-Drain**（仲裁/ACK）與 **Push-Pull**（12.5 MHz 高速資料） |
| **最高傳輸速率** | 100 kHz (Sm), 400 kHz (Fm), 1 MHz (Fm+) | **12.5 MHz SDR**（推挽模式傳輸速率達 12.5 Mbps，另有 HDR 模式） |
| **從機地址** | 靜態（寫死於晶片或透過 A0/A1 接腳設定） | **動態地址（Dynamic Address）**：由 Controller 在開機運行時動態分配 |
| **裝置身分識別** | 無標準規範（各廠商自訂 WHO_AM_I 暫存器） | 標準化 **48-bit Provisional ID (PID)** + **8-bit BCR** + **8-bit DCR** |
| **寫入 Byte 的第 9 位** | 接收端的開漏 **ACK / NACK** 位元 | Controller 發送的 **T-Bit（奇同位元 Odd Parity）**，維持推挽高速不轉向 |
| **讀取 Byte 的第 9 位** | Master 發送的開漏 **ACK / NACK** | Target 發送的 **T-Bit**（`T=1` 還有資料，`T=0` 最後一 Byte），Controller 可在 T 位元終止傳輸 |
| **中斷通知機制** | 需要為每顆晶片拉額外的實體 GPIO 中斷引腳（INT#） | **In-Band Interrupt (IBI)**：直接在 SDA 上以帶內中斷仲裁通知 Controller |
| **動態熱插拔** | 規範未定義（插拔易造成匯流排鎖死） | **Hot-Join (HJ)**：新裝置上線後發送保留地址 `7'h02/W` 申請動態地址 |
| **匯流排管理** | 僅有極少用的 General Call (0x00) | 標準化 **Common Command Codes (CCC)**，以廣播地址 `7'h7E` 發送 |
| **傳統裝置相容** | - | **相容傳統 I2C Slave**（依賴 50 ns 類比尖波濾波器） |

---

## 2. Open-Drain 與 Push-Pull 的電氣原理與使用時機

### 2.1 硬體內部電路示意圖

在 I2C 中，所有裝置的 SDA 與 SCL 只有低側 NMOS（開漏）。而在 I3C 晶片的 SDA 接腳內，同時整合了**高側 PMOS**（推挽驅動）與**低側 NMOS**（開漏/推挽共用）：

```text
      VDD                         VDD (Controller 內部可切換上拉電阻，約 1~2 kΩ)
       |                           |
      [Rp]                        [Rp]   <-- 被動上拉電阻 (上升沿慢: tR ~ Rp * Cbus)
       |                           |
       +----------- SDA 實體線路 --+------------------------+
       |                           |                        |
       |        +------------------+-----+                  |
       |        |     I3C Device Pad     |                  |     +--------------------+
       |        |                        |                  |     |  Legacy I2C Pad    |
       |        |       VDD              |                  |     |                    |
       |        |        |               |                  |     |  (無 PMOS 驅動器)  |
       |        |    ||--+               |                  |     |                    |
       |        |    ||<-+ PMOS (高側)   |                  |     |                    |
       |        |    ||--+ 僅在推挽啟用! |                  |     |                    |
       |        |        |               |                  |     +--------+           |
       +--------+--------+               |                  +-----+        |           |
                |        |               |                        |        |           |
                |    ||--+               |                        |    ||--+           |
                |    ||->+ NMOS (低側)   |                        |    ||->+ NMOS (開漏)   |
                |    ||--+ OD 與 PP 共用 |                        |    ||--+               |
                |        |               |                        |        |           |
                |       GND              |                        |       GND          |
                +------------------------+                        +--------------------+
```

### 2.2 為什麼不能全程使用推挽（Push-Pull）？

假設兩顆裝置在同一個時鐘週期同時向 SDA 線送出訊號：Device A 想送 `'1'`，Device B 想送 `'0'`：

1. **若使用開漏模式（Open-Drain）：**
   * Device A（`'1'`）：NMOS 關閉（High-Z，放開線路）。
   * Device B（`'0'`）：NMOS 導通（將線路強制接地拉至 GND）。
   * **結果**：SDA 線呈現 **`'0'`（線與邏輯 Wired-AND）**。Device A 採樣線路發現 SDA 為 `'0'`，立刻知道**自己仲裁失敗**並安靜退讓，匯流排不會損壞。
2. **若使用推挽模式（Push-Pull）：**
   * Device A（`'1'`）：PMOS 強力導通（將 VDD 直通 SDA，阻抗僅約數十歐姆）。
   * Device B（`'0'`）：NMOS 強力導通（將 GND 直通 SDA）。
   * **結果**：**VDD 直接對 GND 短路（Shoot-Through Current）！** 線路電壓停滯在不可預期的中間準位，硬體可能燒毀。

### 2.3 I3C 的電氣黃金準則（Golden Rules）

| 欄位 / 階段 | 驅動者 | 驅動模式 | SCL 時鐘規格 | 採用原因 |
| :--- | :--- | :--- | :--- | :--- |
| **起始條件（S）後的 8-bit 地址 Header** | Controller 與欲中斷的 Target | **Open-Drain** | I3C-OD ($t_{LOW}=200\text{ns}, t_{HIGH}=40\text{ns}$) | Controller 與 Target 可能同時發送地址，需開漏線與仲裁 |
| **重複起始條件（Sr）後的 8-bit 地址 Header** | Controller 獨占 | **Push-Pull** | 12.5 MHz SDR ($40\text{ns} / 40\text{ns}$) | Target 被規範嚴禁在 Sr 後仲裁，Controller 獨占線路直接以推挽高速傳送 |
| **地址 Header 的第 9 位 ACK/NACK** | 被定址的 Target（或中斷時由 Controller） | **Open-Drain** | I3C-OD | 被定址者拉低表示 ACK，未回應者保持 High-Z 由上拉電阻形成 NACK |
| **CCC 指令碼、定義位元組、寫入資料** | Controller 獨占 | **Push-Pull** | 12.5 MHz SDR | 確定單一發送者，高速傳輸 |
| **寫入 Byte 的第 9 位（T-Bit）** | Controller 獨占 | **Push-Pull** | 12.5 MHz SDR | 傳送**奇同位檢查碼**，取代傳統 ACK，省去雙向轉向等待時間 |
| **讀取資料 Byte 與其第 9 位（T-Bit）** | 被定址的 Target 獨占 | **Push-Pull** | 12.5 MHz SDR | Target 獨占驅動；`T=1` 表示後續還有資料，`T=0` 表示最後一筆（EOD） |
| **ENTDAA 期間的 64-bit ID 傳輸** | 所有未分配地址的 Target | **Open-Drain** | I3C-OD | 所有未分配裝置同時在線上進行 64-bit 開漏仲裁 |
| **傳統 I2C 通訊的所有位元** | Controller 或 I2C Slave | **Open-Drain** | I2C-FM ($t_{LOW}=1300\text{ns}, t_{HIGH}=600\text{ns}$) | 遵循傳統 I2C 開漏與雙向 ACK 規範 |

---

## 3. 什麼時候分配 Slave ID（Dynamic Address）？

I3C 裝置上電時處於未初始化狀態，**沒有私有動態地址**。在分配動態地址前，裝置無法進行一般的私有讀寫。

Controller 會在系統啟動階段透過以下兩種方式分配 Slave ID：

### 方式 1：SETDASA（直接 CCC `0x87`）—— 具靜態地址的裝置

適用於具備傳統 I2C 靜態地址（Static Address, SA）的 I3C 裝置（例如由硬體引腳接地的感測器）。

```text
+---+--------+-----+----------+---+----+------+-----+---------------+---+---+
| S | 7E / W | ACK | CCC 0x87 | T | Sr | SA/W | ACK | (NewDA << 1)  | T | P |
+---+--------+-----+----------+---+----+------+-----+---------------+---+---+
  ^    ^-OD-^  ^OD^   ^---PP---^          ^-PP-^ ^OD^   ^-----PP------^
```

Controller 直接向該靜態地址發送指令，指定其採用新的動態地址，**完全不需參與 64-bit 仲裁，速度最快**。

### 方式 2：ENTDAA（廣播 CCC `0x07`）—— 純 I3C 裝置（無靜態地址）

純 I3C 裝置透過 `ENTDAA` 廣播指令進行多輪次線上身分競賽：

```text
Controller                                   Target A (PID=...010)       Target B (PID=...001)
    |                                                  |                           |
    |---- S -> 7E/W -> ACK -> ENTDAA (0x07) + T ------>|                           |
    |                                                  |                           |
 ===+================= 第一輪 (Round 1) ===============+===========================+================
    |---- Sr -> 7E/R --------------------------------->|                           |
    |<--- ACK (開漏 OD, A 與 B 同時拉低 SDA) ----------+---------------------------+
    |                                                  |                           |
    |     64-Bit Open-Drain PID+BCR+DCR 仲裁:          |                           |
    |     Target A 與 B 逐 bit 送出 ID (MSB 先送)...   |                           |
    |     在第 46 bit: A 送 '1' (放開), B 送 '0' (拉低)|                           |
    |     Target A 採樣到 SDA=0 -> A 仲裁落敗! 即刻退讓|                           |
    |     Target B 完整走完 64 bits -> TARGET B 獲勝!  |                           |
    |                                                  |                           |
    |---- 8-bit [新地址 0x08 | 奇同位元] (OD) --------->|-------------------------->| (僅 B 接收)
    |<--- ACK (Target B 驗證奇同位正確後，第 9 位拉低) |---------------------------|
    |     Target B 取得地址 0x08! (退出後續 ENTDAA 輪次)|                           |
    |                                                  |                           |
 ===+================= 第二輪 (Round 2) ===============+===========================+================
    |---- Sr -> 7E/R --------------------------------->| (僅剩 Target A 尚未分配)  |
    |<--- ACK (僅 Target A 驅動) ----------------------|                           |
    |     64-Bit 仲裁: Target A 單獨獲勝!              |                           |
    |---- 8-bit [新地址 0x09 | 奇同位元] ------------->|                           |
    |<--- ACK (Target A 驗證通過並 ACK) ---------------|                           |
    |     Target A 取得地址 0x09!                      |                           |
    |                                                  |                           |
 ===+================= 第三輪 (確認結束) ==============+===========================+================
    |---- Sr -> 7E/R --------------------------------->| (線上已無未分配裝置)      |
    |<--- NACK (1) (SDA 保持 High-Z，被上拉電阻拉高)---|                           |
    |                                                  |                           |
    |---- STOP (P) -> ENTDAA 完成! 匯流排全數初始化完成|                           |
```

> [!NOTE]
> **動態地址奇同位元（Error TE3 檢查）：**
> 在 ENTDAA 指令中，Controller 指派地址時發送 8 位元：`[DA6 DA5 DA4 DA3 DA2 DA1 DA0 Parity]`。
> 接收端 Target 必須先驗證此 8 位元的總 1 數量為奇數，驗證通過才在第 9 位發送 ACK，否則發送 NACK 拒絕該地址。

---

## 4. Slave 什麼時候發出 Interrupt？如何判斷與處理 Arbitration？

### 4.1 Slave 發出中斷的前提與時機

Target 不需要任何專用硬體中斷線。發送 In-Band Interrupt (IBI) 必須滿足以下條件：
1. 內部有待處理事件，且晶片具備 IBI 能力（`BCR[1] == 1`）。
2. 已取得 Dynamic Address。
3. Controller 先前已透過 `ENEC` 指令致能中斷（未被 `DISEC` 禁用）。

**發起中斷的兩大時機：**
* **時機 A（Bus Available 模式）：** 匯流排在 STOP 之後連續閒置達 $t_{AVAL} = 1.0\ \mu\text{s}$。Target 主動在開漏模式下拉低 SDA 產生 START 訊號，Controller 硬體邊緣中斷被喚醒，開始供應 SCL 時鐘。
* **時機 B（START 碰撞模式）：** Controller 準備開始自身傳輸而發出 START（S）時，Target 在緊接著的第一個開漏 Header 立即將自己的地址 `(DA << 1) | 1`（DA/R）送上 SDA 搶佔匯流排。

### 4.2 仲裁判斷機制（Wired-AND 線與邏輯）

```text
        Bit 7 (MSB)          Bit 6                Bit 5 (Target 獲勝!)
SCL :   __/\________         __/\________         __/\________
Master: 送出 '1' (放開)      送出 '1' (放開)      送出 '1' (欲送 7'h7E/W = 1111110_0b)
Target: 送出 '1' (放開)      送出 '1' (放開)      送出 '0' (NMOS 導通拉低，送 DA=0x09/R)
        ------------------   ------------------   -----------------------------------
SDA 線: SDA = 1 (Rp 上拉)    SDA = 1 (Rp 上拉)    SDA = 0 (Target 強制拉至 GND!)
                                                  ^
                                                  Master 在 SCL 上升沿採樣到 SDA=0!
                                                  「我送 1 卻看到 0 -> MASTER 仲裁落敗!」
                                                  Master 立刻關閉 SDA 驅動，轉為 Receiver
                                                  繼續產生 SCL 時鐘，讀取獲勝者的 Header (0x09/R)
```

* **判斷準則：** 裝置在開漏下發送 `'1'`（放開 SDA），但在 SCL 上升沿採樣時線路卻為 `'0'`（代表他人拉低），**判定仲裁落敗**。
* **落敗處理：** 落敗者必須立即關閉其 NMOS 開漏驅動（轉為 High-Z 監聽狀態），並保留其發送請求於佇列中，等待下次機會。
* **數值規則：** 地址由高位（MSB）向低位送出，`'0'` 永遠贏過 `'1'`。因此，**數值越小的 7-bit 地址，中斷優先級越高**（例如地址 `0x08` 必贏 `0x09`，兩者皆必贏廣播地址 `0x7E`）。

### 4.3 Controller 如何處理中斷？

1. **Header 結束與 ACK/NACK：**
   在 8 位元 Address Header 結束後的第 9 個時鐘，**由 Controller 驅動 ACK/NACK**。
2. **Controller 接受中斷（ACK = 0）：**
   * Controller 查詢該 Target 的 BCR 暫存器。若 `BCR[2] == 1`（具備強制資料位元組 MDB），Target **切換至推挽模式（12.5 MHz）**，送出 Mandatory Data Byte (MDB) 與可選的 Payload（每個 Byte 尾端帶有 T-Bit）。
   * Controller 發送 STOP（P）結束中斷服務。
   * **Controller 重試剛才被中斷打斷的自身任務**。
3. **Controller 拒絕中斷（NACK = 1）：**
   * Controller 若正處於高優先級時序要求下，可驅動 NACK（1）拒絕中斷，Target 保持中斷掛起。
   * 為防止 Target 不斷重試導致中斷風暴，Controller 可緊接著發送：
     `Repeated START (Sr) -> 7'h7E/W -> DISEC (0x81) -> Sr -> Target/W -> 0x01 -> P`。
     因為 Target 嚴禁在 Sr 後仲裁，此指令保證 100% 成功送達並停用該 Target 的中斷。

---

## 5. 傳統 I2C Slave 如何在 12.5 MHz I3C 匯流排上相容存活？

許多開發者最大的疑問是：**當 I3C Controller 在 SDA/SCL 上跑 12.5 MHz 高速推挽訊號時，掛在同一組線上的傳統 I2C EEPROM 或感測器會不會誤動作？**

I3C 規範透過三大機制確保 100% 相容：

### 5.1 50 ns 尖波濾波器（Spike Filter）機制

I2C Fast-Mode（400 kHz）規範要求相容裝置的 SCL/SDA 接腳必須具備**類比低通濾波器**，自動濾除寬度小於 50 ns 的電氣脈衝（$t_{SP} = 50\ \text{ns}$）。

I3C 巧妙地利用了這一點：

```text
               I3C Open-Drain (4.17 MHz)         I3C Push-Pull SDR (12.5 MHz)
                 tLOW=200ns, tHIGH=40ns            tLOW=40ns, tHIGH=40ns
SCL 實體線路:  ______/‾\__________/‾\__________   ____/‾\__/‾\__/‾\__/‾\____
                    40ns         40ns                40ns 40ns 40ns 40ns
                     |            |                   |    |    |    |
                     v            v                   v    v    v    v
              +------------------------------------------------------------+
              |    傳統 I2C Slave 的 50 ns 類比尖波濾波器 (Spike Filter)   |
              |    (任何 HIGH 脈衝寬度 < 50 ns 的訊號均無法通過 RC 門檻)  |
              +------------------------------------------------------------+
                                          |
                                          v
I2C 內部狀態機 _____________________________________________________________ (全程維持平坦 LOW!)
接收到的 SCL
```

因為 I3C 在正常運作下的 SCL 高電平脈衝寬度 **$t_{HIGH} \le 40\ \text{ns} < 50\ \text{ns}$**，傳統 I2C 晶片的內部狀態機**根本收不到任何時鐘上升沿**，有如隱形一般完全不受干擾。

### 5.2 開機喚醒與靜態地址隔離

* **首次喚醒廣播：** 雙模晶片（同時支援 I2C/I3C）開機時預設開啟 50 ns 濾波器。Controller 在開機發送的第一個廣播 `7'h7E` 會刻意放慢至 $t_{HIGH} = 200\ \text{ns} > 50\ \text{ns}$，使雙模晶片順利識別並切換進入 I3C 模式（關閉 50 ns 濾波器）。
* **傳統 I2C 的反應：** 傳統 I2C 晶片雖然也接收到這個慢速 `7'h7E`，但因 `0x7E` 屬於 I2C 保留地址，與自身地址不合，因此保持 NACK 並忽略後續資料。

### 5.3 Controller 與傳統 I2C 通訊時的動態切換

當 Controller 需要讀寫傳統 I2C 裝置時：
1. SCL 切換至傳統 I2C Fast-Mode 模式（$t_{LOW} = 1300\ \text{ns}, t_{HIGH} = 600\ \text{ns} \ge 50\ \text{ns}$）。
2. SDA 全程切換為 Open-Drain 模式。
3. 採用傳統 I2C 的 9th-Bit ACK/NACK 交握。
4. I3C 裝置雖然能看到此低速訊號，但由於地址不符合，會自動忽略直到 STOP（P）。

---

## 6. 專案架構與檔案清單

```text
I3CEmulator/
├── Docs/
│   └── 00_ReadMeFirst.cs           # 核心觀念總覽、I2C vs I3C 對照表、全域規則與時序圖表
├── Physical/
│   ├── Timing.cs                   # SCL 四種時鐘規格 (12.5MHz PP, 4.17MHz OD, 2.5MHz Init, 400kHz I2C)
│   └── I3CBus.cs                   # cycle-accurate 匯流排模型、Wired-AND 線與邏輯、推挽電氣衝突防護
├── Protocol/
│   ├── I3CAddresses.cs             # 7-bit 地址空間定義、7'h7E 廣播、7'h02 熱插拔、單 bit 錯誤防護 (TE0)
│   ├── Parity.cs                   # T-Bit 奇同位計算器與 ENTDAA 動態地址同位元驗證 (TE1, TE2, TE3)
│   ├── CccCode.cs                  # Common Command Codes：廣播 CCC (0x00~0x7F) vs 直接 CCC (0x80~0xFE)
│   └── DeviceRegisters.cs          # 48-bit PID、8-bit BCR、8-bit DCR 及 I2C 虛擬暫存器 LVR 定義
├── Devices/
│   ├── IBusDevice.cs               # 匯流排元件硬體接腳介面（SCL/SDA 邊緣回呼與驅動抽象化）
│   ├── I3CMaster.Bits.cs           # Controller 底層：S/Sr/P 產生、位元時鐘、Header 開漏仲裁偵測
│   ├── I3CMaster.Daa.cs            # Controller DAA：SETDASA 靜態轉動態、ENTDAA 64-bit 仲裁發現循環
│   ├── I3CMaster.Ibi.cs            # Controller IBI：帶內中斷處理、Hot-Join 處理、MDB 與 Payload 讀取
│   ├── I3CMaster.Ccc.cs            # Controller CCC 引擎：廣播與直接 CCC、自動處理 Header 中斷重試
│   ├── I3CMaster.Transfers.cs      # Controller 資料傳輸：12.5 MHz 私有讀寫 (PP)、傳統 I2C 400 kHz (OD)
│   ├── I3CSlave.cs                 # I3C Target 完整硬體狀態機：50ns 濾波切換、ENTDAA 仲裁退讓、IBI 請求
│   └── I2CSlave.cs                 # 傳統 I2C Target：50ns 類比尖波濾波器模擬、純開漏、每 Byte ACK
└── Program.cs                      # 完整 10 章情境驗證測試平台（含彩色 ASCII Trace 與斷言）
```

---

## 7. 如何執行與驗證測試

### 7.1 建置與執行指令

本專案使用標準 .NET SDK（已驗證於 .NET 10.0）：

```bash
# 切換至專案目錄
cd /home/kk/ai_garbage/i3c/I3CEmulator

# 建置專案
dotnet build

# 執行模擬器測試平台
dotnet run
```

### 7.2 模擬器執行的 10 大驗證情境

程式執行時將即時顯示 SCL/SDA 奈秒級時間戳記與硬體驅動狀態：

1. **Chapter 0: Physical Bus Setup & Device Topology**：初始化掛載 6 顆裝置（Master、3 顆純 I3C/雙模 Target、1 顆熱插拔 Target、1 顆 24C02 I2C EEPROM）。
2. **Chapter 1: Initial Wake-Up Broadcast (7'h7E) & 50 ns Spike Filter**：使用低速 $t_{HIGH} = 200\ \text{ns}$ 發送 `7'h7E`，使雙模 Target 關閉 50ns 濾波器，傳統 EEPROM 濾波器通過但地址不符而忽略。廣播 `RSTDAA (0x06)` 重置動態地址。
3. **Chapter 2: Static-to-Dynamic Address Assignment (SETDASA, CCC 0x87)**：將靜態地址為 `0x48` 的 Target B 透過 `SETDASA` 直接指派動態地址 `0x0A`。
4. **Chapter 3: Dynamic Address Assignment (ENTDAA, CCC 0x07) & 64-Bit Arbitration**：Target A 與 Target C 進行 64-bit 開漏仲裁。Target C（PID 較小）在第一輪第 18 bit 獲勝取得 `0x08`；Target A 在第二輪獲勝取得 `0x09`；第三輪無人回應 NACK 結束。
5. **Chapter 4: Direct CCCs & ENEC**：讀取 `GETPID`、`GETBCR`、`GETDCR` 驗證暫存器，並以廣播 `ENEC (0x00)` 開啟所有 Target 的中斷能力。
6. **Chapter 5: Private High-Speed I3C SDR Read & Write (12.5 MHz Push-Pull)**：以 12.5 MHz 推挽模式讀寫 Target A 暫存器，附帶奇同位 T-Bit 校驗。同時驗證 I2C EEPROM 的 50ns 濾波器成功攔截數百個高速窄脈衝。
7. **Chapter 6: Legacy I2C Slave Compatibility**：切換為 400 kHz 開漏時鐘，成功讀寫 24C02 EEPROM 內部暫存器。
8. **Chapter 7: In-Band Interrupt (IBI) Arbitration & Servicing**：
   * **情境 7A（Bus Available）：** Target A 在匯流排閒置 $1\ \mu\text{s}$ 後主動拉低 SDA 觸發中斷，Master 喚醒、ACK 並以推挽接收 MDB 與 Payload。
   * **情境 7B（START 碰撞仲裁）：** Master 發起私有寫入時，Target A (0x09) 與 Target C (0x08) 同時發起中斷，三方在第一個開漏 Header 競賽。優先級最高的 Target C 獲勝；Master 服務完後重試，Target A 接著獲勝；最後 Master 再度重試完成自身傳輸。
9. **Chapter 8: Controller NACKing an IBI & Runaway Interrupt Handling (DISEC)**：模擬 Master 忙碌而對中斷回覆 NACK，並立即以 `DISEC (0x81)` 關閉該裝置中斷防止中斷風暴。
10. **Chapter 9: Hot-Join (Connecting a New Device at Run-Time, 7'h02/W)**：Target D 熱插拔上線，等待匯流排閒置 $200\ \mu\text{s}$（$t_{IDLE}$）後發送 `7'h02/W`，Master 偵測並自動觸發 `ENTDAA` 為其分配動態地址 `0x0B`。
11. **Chapter 10: Bus Simulation Metrics & Summary Table**：印出匯流排整體統計數據（模擬奈秒、開漏位元數、推挽位元數、I2C 濾波攔截計數等），所有斷言 100% 通過。
