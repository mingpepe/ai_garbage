# AI 即時對戰同步與建議檔案格式規範 (AI Bridge Format)

本文件定義網頁前端、本機伺服器（[`server.mjs`](file:///D:/K/github/ai_garbage/chess1/server.mjs)）與 CLI AI 之間即時對戰同步與建議推播的檔案格式與 API 協定。

---

## 1. 盤面狀態檔：`current_state.json`

- **方向**：網頁前端 (`app.js`) → `POST /api/state` → `server.mjs` 寫入至專案根目錄 `current_state.json`。
- **觸發時機**：每次 `updateGameState()` 執行時（開局、玩家落子、AI 落子、悔棋、重開局）。
- **讀取端**：CLI AI 讀取此檔案以獲取當前棋局狀態。

### JSON Schema

```json
{
  "updatedAt": "2026-11-17T13:55:48.183Z",
  "mode": "vs-ai",
  "playerColor": "w",
  "turn": "w",
  "fen": "1r4r1/p1p3R1/2k1p3/1p2P3/1P3P2/2P3P1/P5P1/RN2K1N1 w Q - 1 24",
  "pgn": "[Event \"?\"]\n...\n\n1. d4 Nc6 ...",
  "inCheck": false,
  "isGameOver": false,
  "lastMove": {
    "from": "e8",
    "to": "g8",
    "san": "Rg8"
  },
  "coachSummary": {
    "evalScore": "+1.2",
    "threats": ["e4 (兵 (Pawn)): ..."],
    "bestMove": "Bg3 [f4->g3]",
    "attackMoves": ["..."],
    "defenseMoves": ["..."]
  }
}
```

### 欄位說明

| 欄位 | 型別 | 說明 |
| :--- | :--- | :--- |
| `updatedAt` | `string` | ISO 8601 時間戳記 |
| `mode` | `string` | 目前模式：`"vs-ai"`、`"two-player"`、`"coach"`、`"tutorial"`、`"mrong"` |
| `playerColor` | `"w" \| "b"` | 玩家執子方（人機對戰／教練模式） |
| `turn` | `"w" \| "b"` | 當前輪到走棋方 |
| `fen` | `string` | 標準 FEN 盤面字串 |
| `pgn` | `string` | 標準 PGN 著法紀錄 |
| `inCheck` | `boolean` | 當前行動方是否正被將軍 |
| `isGameOver` | `boolean` | 對局是否已結束 |
| `lastMove` | `object \| null` | 上一手著法 `{ from, to, san }`，初始盤面為 `null` |
| `coachSummary` | `object \| null` | 若開啟教練模式或即時提示，附帶引擎評估摘要；否則為 `null` |

---

## 2. AI 建議推播：`ai_advice.json`（或 `POST /api/advice`）

- **極速路徑**：CLI AI 透過 `write_file` 寫入 `ai_advice.json`（不啟動外部 shell/Node.js）→ `server.mjs` 透過 `fs.watch` 偵測後立即經由 SSE (`GET /api/advice/stream`) 廣播至網頁前端，並**隨手刪除 `ai_advice.json`**。
- **HTTP 路徑**：亦保留 `POST /api/advice` 直接廣播。
- **前端行為**：
  - 棋盤上繪製起訖點高亮與帶 `★` 標記的推薦箭頭。
  - 右側欄頂部顯示 `🤖 AI 即時戰術建議` 卡片（`#cli-advice-card`）。
  - 當玩家落子或重新開局時，前端自動隱藏卡片並清除箭頭。

### JSON Schema

```json
{
  "from": "g7",
  "to": "g8",
  "san": "Rxg8",
  "color": "#a855f7",
  "label": "AI推薦",
  "explanation": "你目前已經多出整整兩隻騎士與四隻兵，黑方 23... Rg8 要求換車正是簡化局面的最佳時機。",
  "purpose": "主動走 24. Rxg8 換掉黑方一隻城堡，大幅降低對手反撲機會，進入必勝殘局。",
  "nextPlan": "黑方走 24... Rxg8 吃回後，你可走 25. Kf2（或 25. Ne2）順便保護 g3 兵，接著出 Nd2 並推進多出的兵升變皇后。"
}
```

### 欄位說明

| 欄位 | 必填 | 型別 | 說明 |
| :--- | :--- | :--- | :--- |
| `from` | 是 | `string` | 起始格代數座標（小寫，如 `"d1"`、`"f4"`） |
| `to` | 是 | `string` | 目標格代數座標（小寫，如 `"h1"`、`"g3"`） |
| `san` | 建議 | `string` | 標準代數記譜（如 `"Rdh1"`、`"Bxc6+"`），顯示於建議卡片標題 |
| `color` | 否 | `string` | 棋盤箭頭十六進位色碼，預設 `"#a855f7"`（紫色） |
| `label` | 否 | `string` | 標籤名稱（如 `"AI推薦"`） |
| `explanation` | 建議 | `string` | **🔍 為什麼這樣走**：分析威脅、子力交換與當前選擇原因 |
| `purpose` | 建議 | `string` | **🎯 戰術目的**：說明此步達到的核心戰略目標 |
| `nextPlan` | 建議 | `string` | **⏭️ 後續計畫**：預判對手應手與我方下一步連招 |

---

## 3. 求助請求檔：`help_request.json`（Ask AI for Help）

- **方向**：網頁前端點擊 `🤖 Ask AI for Help` → `POST /api/help` → `server.mjs` 寫入 `help_request.json`。
- **按鈕狀態流轉**：
  1. 玩家點擊 `🤖 Ask AI for Help`：按鈕變為 `⏳ 等待 AI 接收...`，伺服器寫入 `help_request.json`。
  2. CLI AI 偵測到 `help_request.json` 後，呼叫 `POST /api/help/ack`：伺服器刪除 `help_request.json` 並經由 SSE (`/api/advice/stream`) 推播 `{"status": "analyzing", "message": "🤖 AI 已收到請求，正在分析盤面..."}`，前端按鈕變為 `🧠 AI 分析中...`。
  3. CLI AI 完成分析並寫入 `ai_advice.json`：前端收到建議後繪製箭頭與建議卡片，按鈕恢復為 `🤖 Ask AI for Help`。

### `help_request.json` Schema

```json
{
  "requestId": "m3k9x1a",
  "requestedAt": "2026-11-17T14:08:00.000Z",
  "mode": "vs-ai",
  "playerColor": "w",
  "turn": "w",
  "fen": "...",
  "pgn": "...",
  "lastMove": { "from": "e8", "to": "g8", "san": "Rg8" }
}
```

---

## 4. 生命週期與清理機制

- **伺服器啟動**：`server.mjs` 啟動時會自動刪除殘留的 `help_request.json`。
- **重新開局**：前端呼叫 `resetGame()` 時會發送 `POST /api/reset`，伺服器刪除 `help_request.json` 並向所有 SSE 連線廣播 `{"cleared": true}`。
- **Git 忽略**：`chess1/current_state.json` 與 `chess1/help_request.json` 皆已列入 [`.gitignore`](file:///D:/K/github/ai_garbage/.gitignore)。
