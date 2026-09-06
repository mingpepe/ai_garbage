# 🌿 3D 多層次立體立交迷宮 (Multi-layer Weave Maze Web App)

一個基於 **TypeScript + React + HTML5 Canvas + Web Audio API + Tailwind CSS** 開發的立體立交迷宮遊戲，完美呈現兒童繪本中具有高架橋（Bridge / Overpass）與地下涵洞（Tunnel / Underpass）真實立體深度視覺效果的迷宮！

---

## 🌟 核心特色 (Core Features)

### 1. 🌉 立體重疊結構與生成演算法 (Weave Maze Generation)
- **多層次立交通道**：道路在十字交會處以「垂直立體交叉」方式延伸，上層為高架橋樑、下層為地下隧道，兩者互不連通。
- **改進型 DFS 回溯演算法 (Recursive Backtracker with Weave Jumps)**：
  - 生成時動態探測垂直走廊，並依據設定的「重疊率 (Weave Rate)」將交點轉化為立交橋與涵洞。
  - 保證起點（Start）到終點（End）必定存在合法可通行的解法路徑。
  - 支援「環狀通路率 (Braid Factor)」（工程模式），可消除死路創造豐富的多重迴路。

### 2. 🎨 俯視角 2D 自然立體渲染 (Natural Layered Canvas Rendering)
- **連續自然的下層道路 (Continuous Underpass Road)**：底層道路與地面道路一體成形，自然貫通於橋下，並由高架橋在上方向下投射真實柔和陰影。
- **立體高架橋 (Elevated Timber Bridge)**：頂層高架橋樑帶有投射在下層道路與地面的立體投影（Drop Shadow）、木質橋板紋理與立體安全護欄。
- **真實 3D 深度遮擋**：當小青蛙穿越涵洞時，角色自然在橋樑下方通過，形成驚豔的立體穿行視覺效果。
- **精美繪本角色與目標**：
  - 起點：可愛跳躍小青蛙 🐸（具備平滑位移內插、流暢跳躍拋物線、眨眼與朝向旋轉動畫）。
  - 終點：盛開荷花池塘 🪷（具備動態水波漣漪、花瓣搖曳與金色光暈）。

### 3. 🏃‍♂️ 流暢連續移動 (Smooth Continuous Gliding Controls)
- **非單格跳躍的滑順移動**：
  - 角色移動具備 60 FPS 連續座標推進，告別生硬的單格瞬移。
  - 長按鍵盤方向鍵（WASD 或 ↑ ↓ ← →）時，小青蛙順著廊道流暢滑行並自然轉彎。
  - 滑鼠或手指在畫面上拖曳劃線時，角色以連續速度跟隨前進。
- **虛擬十字鍵 (Virtual D-Pad)**：為觸控與行動裝置提供螢幕方向控制器。
- **通關慶祝與評分**：抵達終點時觸發彩色紙花動畫（Confetti）、三星評級與通關數據統計。

### 4. 🛠️ 工程模式 (Engineering / Dev Mode)
- 平時提供極簡乾淨的遊戲介面，無多餘雜訊干擾。
- 點擊頂部 **「🛠️ 工程模式」** 按鈕可解鎖專業除錯與輔助功能：
  - 💡 **顯示/隱藏最佳解答路徑 (Show Solution Path)**：以霓虹發光路徑標示全域最佳解。
  - 🧭 **環狀通路率 (Braid Factor) 滑桿**：即時調整迷宮環狀迴路密度。
  - 📊 **圖論拓撲診斷**：即時查看總節點數、立體交錯點數量、最佳解步數。

---

## 🚀 啟動與建置 (Running & Building)

```bash
cd /home/kk/ai_garbage/weave-maze
npm install
npm run dev
```

啟動後在瀏覽器開啟 `http://localhost:5173` 即可遊玩！
生產打包指令：`npm run build`。
