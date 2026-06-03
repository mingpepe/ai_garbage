# UMDF v2 驅動程式與主機通訊概念驗證 (POC)

本專案是一個用來理解 **User-Mode Driver Framework (UMDF) v2** 運作原理的範例。專案包含一個簡單的 **UMDF v2 驅動程式**（負責接收字串並予以反轉）與一個**主機 Console 控制台應用程式**（透過 Win32 API 與驅動程式進行通訊）。

## 📂 專案檔案結構

* 📁 **[driver/](file:///D:/K/github/ai_garbage/umdf-demo/driver)**：UMDF v2 驅動程式專案
  * 📄 [driver.h](file:///D:/K/github/ai_garbage/umdf-demo/driver/driver.h)：介面 GUID、自訂 IOCTL 定義以及 WDF 回呼函式宣告。
  * 📄 [driver.cpp](file:///D:/K/github/ai_garbage/umdf-demo/driver/driver.cpp)：WDF 驅動程式進入點與 IOCTL 反轉字串的核心邏輯。
  * 📄 [MyUmdfDriver.inf](file:///D:/K/github/ai_garbage/umdf-demo/driver/MyUmdfDriver.inf)：驅動程式安裝設定檔，告知 Windows 該將此驅動掛載在 `WUDFHost.exe` 下執行。
* 📁 **[console-app/](file:///D:/K/github/ai_garbage/umdf-demo/console-app)**：通訊客戶端專案
  * 📄 [main.cpp](file:///D:/K/github/ai_garbage/umdf-demo/console-app/main.cpp)：利用 Windows Setup API 搜尋裝置，並透過 `CreateFile` 與 `DeviceIoControl` 與驅動程式對談。

---

## 🛠️ UMDF 是如何運作的？（架構解析）

傳統的核心模式驅動程式（KMDF/WDM）如果發生崩潰（例如指標錯誤），會直接導致整個 Windows 系統藍屏（BSOD）。
為了提高系統穩定度，Windows 推出了 **UMDF**，將非關鍵硬體（如 USB 裝置、感測器、智慧卡）的驅動程式移至**使用者模式 (User Mode)** 中執行。

### 🔄 運作與通訊流程

當你的控制台程式想要傳送資料給驅動程式時，資料的流向如下：

```
+-------------------------------------------------------------+
| 使用者模式 (User Mode)                                      |
|   +-------------------+             +---------------------+ |
|   |   Console App     |             |    WUDFHost.exe     | |
|   | (呼叫 Win32 API)   |             | (載入本驅動程式 DLL) | |
|   +---------+---------+             +----------^----------+ |
|             | 1. CreateFile                    | 3. ALPC 轉發
|             |    DeviceIoControl               |    給 WDF 佇列
|             v                                  |            |
+-------------+----------------------------------+-------------+
| 核心模式 (Kernel Mode)                          |            |
|             v                                  |            |
|     +------------------------------------------v---+        |
|     |         重定向器 Reflector (WUDFRd.sys)       |        |
|     | (負責攔截使用者請求，並將其安全轉發至使用者空間) |        |
|     +----------------------------------------------+        |
+-------------------------------------------------------------+
```

1. **開啟裝置**：Console App 呼叫 `CreateFile` 打開驅動程式公開的「裝置介面 (Device Interface)」。
2. **攔截與轉發**：核心模式中的 **重定向器 (Reflector - `WUDFRd.sys`)** 攔截此 I/O 請求。
3. **主機載入**：Reflector 發現目標是 UMDF 驅動程式，便透過 ALPC 將請求轉發給運行在使用者空間的 **UMDF 驅動程式主機行程 (`WUDFHost.exe`)**。
4. **驅動程式處理**：
   * `WUDFHost.exe` 載入了我們的 `MyUmdfDriver.dll`。
   * WDF 框架接收到請求，呼叫 [driver.cpp](file:///D:/K/github/ai_garbage/umdf-demo/driver/driver.cpp) 中的 `EvtIoDeviceControl`。
   * 驅動程式反轉字串，呼叫 `WdfRequestCompleteWithInformation` 完成請求。
5. **回傳結果**：Reflector 將結果傳回給 Console App，Console App 成功印出反轉後的字串。

---

## 🏗️ 如何建置、安裝與執行？

由於驅動程式開發需要特定的 SDK/WDK 工具鏈，以下是建置與安裝的具體步驟：

### 第一步：建置專案 (Build)
1. 安裝 **Visual Studio**（含 C++ 開發套件）與 **WDK (Windows Driver Kit)**。
2. **建置驅動程式**：
   * 在 Visual Studio 中建立一個 **User Mode Driver, Empty (UMDF V2)** 專案。
   * 將 [driver.h](file:///D:/K/github/ai_garbage/umdf-demo/driver/driver.h)、[driver.cpp](file:///D:/K/github/ai_garbage/umdf-demo/driver/driver.cpp) 與 [MyUmdfDriver.inf](file:///D:/K/github/ai_garbage/umdf-demo/driver/MyUmdfDriver.inf) 加入專案。
   * 將建置配置設為 `x64` 和 `Release`，進行建置，會生成 `MyUmdfDriver.dll` 與 `MyUmdfDriver.inf`。
3. **建置主機程式**：
   * 建立一個標準的 C++ Console 專案。
   * 加入 [main.cpp](file:///D:/K/github/ai_garbage/umdf-demo/console-app/main.cpp)。
   * 在專案屬性中連結 `setupapi.lib`，建置產生 `ConsoleApp.exe`。

### 第二步：安裝驅動程式 (Install)
由於此驅動程式是虛擬的軟體裝置，你可以使用 Windows 的 `devcon.exe` (WDK 內建工具) 來手動安裝它：

1. 以系統管理員身分開啟命令提示字元 (cmd)。
2. 執行以下指令進行安裝：
   ```cmd
   devcon.exe install MyUmdfDriver.inf Root\UMDF_Demo_Device
   ```
   *（或者，你也可以在 **「裝置管理員」** 選擇「動作」->「新增偵測到的硬體」-> 手動選擇此 INF 進行安裝。）*
3. 安裝成功後，你可以在裝置管理員的 **「Sample」** 類別下看到「*User-Mode Driver Framework (UMDF) v2 Demo Device*」。
4. 此時系統會在背景啟動 `WUDFHost.exe` 並載入你的 DLL。

### 第三步：執行測試 (Run)
1. 執行 `ConsoleApp.exe`。
2. 程式會自動搜尋並顯示找到的裝置路徑：`\\?\root#sample#0000#{7c3a0df4-df82-4f36-a191-236b3f7f8936}`。
3. 輸入一段文字（例如：`Hello UMDF Driver`）。
4. 控制台將印出驅動程式反轉後的結果：
   ```text
   ==================================================
    原始字串: "Hello UMDF Driver"
    驅動處理 (反轉): "revirD FDMU olleH"
   ==================================================
   ```

---

## 💎 UMDF v2 的核心優勢
1. **安全性與穩定性**：驅動程式指針越界或崩潰時，僅會重啟 `WUDFHost.exe`，系統不會藍屏。
2. **容易偵錯**：你可以直接使用 Visual Studio 將偵錯器掛載 (Attach) 到 `WUDFHost.exe` 進行單步執行與中斷點偵錯，就像除錯一般 Windows App 一樣容易！
3. **API 統一性**：UMDF v2 使用與核心模式 (KMDF) 極度相似的 C 語言 WDF API，使得驅動程式在使用者模式與核心模式之間的移植變得極為簡單。
