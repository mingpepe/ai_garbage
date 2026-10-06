# SKYBOUND — 實作原理與系統架構

> 單檔 Three.js 自由飛行模擬器。所有邏輯位於 `index.html`（約 1955 行），
> 除 Three.js CDN 之外沒有任何外部資產。

---

## 1. 概述

SKYBOUND 是一個瀏覽器端即時 3D 自由飛行體驗。玩家操控一架程序化生成的戰鬥機，
在程序化生成的群島上空自由飛行，具備慣性飛行模型、輔助自動回平、三種相機、五種
時段（DAWN / MORNING / NOON / GOLDEN / NIGHT），以及桌面與觸控雙輸入。

**規模對照**

| 項目 | 數值 |
| --- | --- |
| 交付物 | 1 個 HTML 檔案，約 72 KB |
| 程式碼 | 約 1955 行（CSS + HTML + GLSL + JS 混排） |
| 外部相依 | 僅 `three@0.160.0`（import map 指向 jsDelivr） |
| 載入時間資產 | 0（無貼圖／模型檔，紋理由 Canvas 即時生成） |
| 頂點數（地形） | 441 × 441 ≈ 194 k（含頂點色） |
| 繪製呼叫 | 約 15（天空、海、地形、雲群、飛機 ~30、3 個粒子系統、星星） |

---

## 2. 核心設計原則

### 2.1 單檔自足（Single-file, zero-asset）
唯一的相依是 import map 指向的 Three.js。雲的紋理由 `CanvasRenderingContext2D`
即時繪製，星空是程序化 `BufferGeometry`，飛機是 `LatheGeometry` +
`ExtrudeGeometry` 組合，地形是雜訊取樣的 `PlaneGeometry`。
好處是可直接 `file://` 開啟或部署到任何靜態主機，沒有建置步驟。

### 2.2 模擬與渲染解耦
`integrateFlight(dt)` 是純函式式的物理積分器，只依賴 `flight`、`input`、
`CFG` 與高度場，不碰任何 `THREE.Object3D`。這讓物理可以被**離線確定性**測試：
在測試中繞過 `requestAnimationFrame`，直接以固定 `dt = 1/60` 呼叫數千次，
完全不受繪圖速度影響（見 §15）。

### 2.3 輸入聚合集中在單點
鍵盤、滑鼠、觸控三種來源各自寫入 `input.keyPitch` / `input.mouseRoll` /
`input.touchPitch` 等**獨立的原始欄位**，由 `integrateFlight()` 開頭統一聚合：

```js
input.pitch = clamp(input.keyPitch + input.touchPitch + input.mousePitch, -1, 1);
input.boost = input.keyBoost || input.touchBoost;
```

好處：每個輸入裝置的程式碼完全不需要知道其他來源的存在，且未來加遊戲手把
只需再加一個欄位。

### 2.4 一切指數平滑統一用 `damp()`
整份程式碼沒有任何線性 `lerp(a, b, 0.1)`。所有平滑都用：

```js
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
```

好處是**與幀率無關**——同一個 `rate` 在 30 fps 與 144 fps 下收斂速度相同。
若用固定係數線性插值，低幀率時動畫會變慢、高幀率時會變快。

### 2.5 共用單一真實來源
高度場函式 `terrainHeight(x, z)` 同時服務三件事：地形網格頂點高度、碰撞偵測、
地表顏色分層。永遠不會出現「看起來飛在地面上方，實際上已經撞進山裡」的不一致。
同理，時段參數只有 `TOD[]` 與 `skyState` 兩份，天空 shader、海水 shader、
方向光、半球光、霧、曝光、星星透明度全部從 `skyState` 單向供應。

### 2.6 非阻塞建構
地形 194k 頂點的取樣與著色如果同步執行會凍結主執行緒數秒。`buildTerrain()`
以 24 列為單位分批，每批之間 `await new Promise(r => setTimeout(r, 0))` 讓出
控制權，配合載入畫面的進度條。

---

## 3. 系統分層

```
┌──────────────────────────────────────────────────────────────┐
│  呈現層   HUD（DOM/CSS） · 載入畫面 · 觸控疊層                 │
├──────────────────────────────────────────────────────────────┤
│  主迴圈   tick() ─ dt = min(getDelta(), 0.05)                 │
│           readKeys → decaySticks → integrateFlight            │
│           → 視覺同步 → updateCamera → applyTimeOfDay          │
│           → updateHud → renderer.render                      │
├──────────────────────────────────────────────────────────────┤
│  控制層   相機系統（chase/cockpit/orbit） · 時段系統 TOD       │
│           輸入聚合（鍵盤/滑鼠/觸控）                           │
├──────────────────────────────────────────────────────────────┤
│  模擬層   飛行積分器（quat + omega + vel） · 世界約束          │
│           粒子積分（Trail）                                    │
├──────────────────────────────────────────────────────────────┤
│  世界層   Simplex 噪聲 → fbm/ridged → terrainHeight()           │
│           → 地形著色 colorTerrain()                            │
├──────────────────────────────────────────────────────────────┤
│  渲染層   WebGLRenderer · MeshStandardMaterial（地形）          │
│           自訂 GLSL（天空 / 海洋 / 星星 / 粒子）                 │
│           程序化幾何（飛機 / 雲 / 星空）                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 啟動流程

`boot()` 是 `async` 的建構序列，`tick()` 在它之前就已啟動但用 `ready` 旗標短路：

```js
tick();                      // 先啟動，ready=false 時立即 return
boot().catch(err => { ... }); // 建構完成後 ready = true
```

步驟：

1. **CARVING TERRAIN** — `buildTerrain()` 產出頂點高度、法線、頂點色。
2. **BUILDING AIRCRAFT** — `buildAirplane()` 組裝幾何；建立三個粒子系統。
3. **SEEDING CLOUDS** — `buildClouds()` 生成兩張雲紋理 + 230 團精靈。
4. **READY** — `resetFlight()` 定位飛機、`setCameraMode(0)`、`applyTimeOfDay(1)`
   強制把天色推到目標值（避免開場看到漸變中間態）。
5. 載入畫面淡出 0.7 s 後移除，HUD 淡入。

任何例外都被 `boot().catch()` 捕捉並顯示在載入畫面上，不會變成白畫面。

---

## 5. 世界生成：噪聲到高度場

### 5.1 Simplex 噪聲
`makeNoise(seed)` 回傳一個 2D simplex 取樣函式（`index.html:333`）。
以 xorshift 產生置換表 `perm[512]` 與梯度索引 `permG[512]`，輸入座標先做
skew 變換（`F2` / `G2` 常數）再取三個角落梯度。種子固定為 `20260214`，
因此**地形每次載入完全相同**（可重現，便於除錯）。

### 5.2 分形疊加
- `fbm(x, y, octaves)` — 標準分形布朗運動，`lac=2.0, gain=0.5`，用於大尺度地貌。
- `ridged(x, y, octaves)` — `n = 1 − |noise|; n²` 加權，產生銳利的山脊線。

### 5.3 高度場合成
`terrainHeight(x, z)`（`index.html:404`）把四層訊號疊起來：

```js
const cont  = fbm(x*0.00018, z*0.00018, 5);          // 大陸分布
const hills = fbm(x*0.0011,  z*0.0011,  4);          // 中尺度丘陵
const mask  = smoothstep(-0.12, 0.44, cont);        // 0=海洋 1=陸地
const ridge = ridged(x*0.00055, z*0.00055, 6);       // 山脊

let h = -190 + mask * 300;                            // 海床基準
h += mask * mask * Math.pow(ridge, 1.55) * 1520;      // 山脈（平方遮罩 = 只在陸地核心）
h += hills * 48 * mask;
h += fbm(x*0.006, z*0.006, 2) * 5;                   // 表面粗糙度

// 邊緣衰減，讓地形沉入海平面形成自然海岸線
const coast = fbm(x*0.00033, z*0.00033, 3) * 0.13;
const r = Math.hypot(x, z) / (terrainRadius * 0.99) + coast;
return h * (1 - smoothstep(0.56, 1.02, r));
```

`mask * mask` 是關鍵：單純的 mask 遮罩會讓海岸也長出山，`平方` 使山脈集中在
陸地核心，形成有內陸與海岸線對比的地形。`coast` 項讓邊界不規則，避免出現
完美的圓形島嶼。

`groundHeight(x, z) = max(terrainHeight(x, z), 0)` 提供水面（海平面 = 0）。

實測地形範圍約 −195 m ～ +1440 m。

---

## 6. 地形著色

地形是 `MeshStandardMaterial({ vertexColors: true, roughness: 0.97, dithering: true })`，
頂點色在**建構時**算好寫入 `BufferAttribute`，不是執行時 shader 運算——
省下每幀數萬次雜訊取樣。

`colorTerrain(h, slope, x, z, out)`（`index.html:696`）是分層混合，
**順序有意義**：

```js
out.copy(C_SAND).lerp(C_GRASS, smoothstep(2, 26, h));                    // ① 沙 → 草
tmpBlend.copy(C_GRASS).lerp(C_GRASS2, smoothstep(-0.4, 0.6, v));
out.lerp(tmpBlend, smoothstep(6, 60, h));                                // ② 草色變化
out.lerp(C_FOREST, ...);                                                 // ③ 森林（依 v 的負值）
tmpBlend.copy(C_GRASS).lerp(C_ROCK, smoothstep(260, 780, h));
out.lerp(tmpBlend, smoothstep(300, 900, h));                             // ④ 高處岩石
tmpBlend.copy(C_ROCK).lerp(C_ROCK2, smoothstep(0.5, 1.0, v));
out.lerp(tmpBlend, smoothstep(0.34, 0.68, slope)
                  * (1 - smoothstep(820, 1180, h)));                     // ⑤ 陡坡裸岩
out.lerp(C_SNOW, smoothstep(950, 1320, h));                              // ⑥ 雪線（最後，最優先）
```

`slope = 1 − normal.y`，0 代表水平、1 代表垂直。

**順序上的兩個關鍵決定**

- **雪線放在坡度岩層之後**：若反過來，陡峭的高山會被岩石覆蓋掉雪冠。
  實測修正前後：修正後 1250 m 以上的 26 個頂點全部是雪白色。
- **坡度岩層乘上高度衰減** `(1 − smoothstep(820, 1180, h))`：讓「越陡越岩石」
  這條規則在高處自動失效，保證山頂維持雪白。

> **陷阱**：`out` 參數與函式內部的暫存物件若為同一個 `THREE.Color`，
> `out.copy(A).lerp(B, t)` 會把中間混合目標覆蓋掉。此函式刻意使用
> **兩個不同的暫存物件**（`tmpColor` 作為 `out`，`tmpBlend` 作為中間值）。
> 這個錯誤曾讓整張地圖變成灰色岩石，畫面上完全看不出是哪一行壞掉。

---

## 7. 渲染管線

```js
renderer.outputColorSpace   = THREE.SRGBColorSpace;
renderer.toneMapping        = THREE.ACESFilmicToneMapping;   // 電影式高光滾降
renderer.toneMappingExposure = CFG.exposure;                  // 隨時段變動
renderer.shadowMap.enabled  = true;
renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
scene.fog = new THREE.FogExp2(0xbfd9ee, 0.00009);
```

**燈光**只有兩盞，因為是戶外空場景：

- `DirectionalLight` — 太陽，開啟陰影。2048² shadow map，正交視錐 ±420，
  `far = 3200`，`bias = −0.0008`、`normalBias = 1.2`。
  每幀把光源與 target 都平移到飛機周圍 1500 單位處（`index.html:1835`），
  讓只有 840×840 的陰影貼圖能覆蓋飛機附近，遠處山脈自然不投影。
- `HemisphereLight` — 天空／地面半球光，補上環境光避免陰影面死黑。

**自訂 GLSL 與色調對映的接線**：所有自訂 `ShaderMaterial` 都必須手動
`#include <tonemapping_fragment>` 與 `#include <colorspace_fragment>`，
否則自訂 shader 的輸出不會經過 ACES 與 sRGB 轉換，會與 PBR 材質（地形、
飛機）色調不一致。注意 `<tonemapping_fragment>` **只能包含一次**，
重複會導致 `toneMappingExposure` redefinition 的編譯錯誤。

---

## 8. 天空與海洋

### 8.1 天空穹頂
半徑 16000 的 `SphereGeometry`，`BackSide` + `depthTest: false` +
`renderOrder: −3`，每幀複製相機位置（`index.html:1862`）使其永遠在無限遠處。

Fragment shader 是解析式的簡易大氣模型：

```glsl
float up = pow(clamp(h, 0.0, 1.0), 0.42);
vec3 col = mix(uHorizon, uZenith, up);                       // 天頂↔地平線漸層
col = mix(col, uGround, smoothstep(0.0, -0.22, h));          // 地平線以下
col += uSunColor * (pow(mu, 5.0)*0.16 + pow(mu, 48.0)*0.55); // 前向散射光暈
col += uSunColor * pow(mu,3.0) * exp(-abs(h)*5.0) * 0.35;    // 地平線 Mie 輝光
col += uSunColor * smoothstep(0.99955, 0.99985, mu) * 9.0 * (1.0 - uNight);
col += (grain - 0.5) * 0.006;                                // 抖動消除色階
```

最後一行是**雜訊抖動**：低解析度天空漸層在 8-bit 輸出下會出現色階，
加入 ±0.006 的雜訊即可掩蓋。

### 8.2 海洋
26000 × 26000、180×180 分段的平面。頂點著色器只做一個低頻正弦位移（±0.9 m）
讓平面在水平方向有緩慢起伏；**真正的波浪細節全在 fragment shader**，
用解析法線，不需要任何網格細分：

```glsl
vec3 waveNormal(vec2 p, float lod) {
  // 4 個方向的正弦梯度疊加，振幅 0.16/0.11/0.07/0.045，頻率 0.055→0.28
  return normalize(vec3(-dx*damp, 1.0, -dz*damp));
}
```

`lod = exp(-dist * 0.00018)` 是**距離衰減**：遠處波紋振幅降到 25%，
避免高頻法線在遠方產生閃爍的 aliasing。這是用 shader 空間的解析細節
換掉網格細分的關鍵手法——成本近乎零。

著色模型：

```glsl
float fres = pow(1.0 - max(dot(N,V), 0.0), 4.2);          // 菲涅耳
vec3 refl  = mix(uHorizon, uSunColor*0.9 + uHorizon*0.5, 0.35);
vec3 col   = mix(base, refl, clamp(fres*0.92, 0.0, 0.92));
col += uSunColor * pow(max(dot(N,H),0.0), 260.0) * 2.6 * (0.25 + lod);  // 高光
col += uSunColor * pow(max(dot(reflect(-V,N), uSunDir),0.0), 42.0) * 0.22; // 波峰閃光
col = mix(col, uFogColor, clamp(1.0 - exp(-pow(uFogDensity*dist, 2.0)), 0.0, 1.0));
```

**自訂霧**：`FogExp2` 的衰減曲線 `1 − e^(−(density·d)²)` 在自訂 shader 中
必須手寫。由於本專案用 `THREE.FogExp2`，標準材質自動獲得霧；自訂 shader
因 `fog: false` 需自行實作**同一條曲線**，兩者才能無縫接縫。

### 8.3 星空
1100 個 `Points`，均勻分佈於半球，尺寸 `1.0 + rnd³ × 2.4` px，
`AdditiveBlending`，`depthTest: false`，透明度由 `skyState.stars` 驅動
（只有 NIGHT = 1.0，其餘皆 0）。每幀複製相機位置使其不隨飛機位移而產生視差。

---

## 9. 程序化飛機建模

座標約定：**機鼻 = −Z，上 = +Y，右 = +X**。這也是整個飛行物理的基準軸。

### 9.1 基本工具
- `shapeFromPoints(pts)` / `extrude(pts, depth, bevel)` — 從 2D 點集產生
  `ExtrudeGeometry`（帶斜角，用於機翼、尾翼、螺旋槳葉）。
- `liftingSurface(rootChord, tipChord, span, sweep, dihedral, thick)` —
  水平升力面。點集包含尖端前緣後掠、中段外擴（模擬後掠與翼尖削尖）。
  `extrude` 在 XY 平面，沿 Z 挤出後 `rotateX(π/2)` 轉到水平。
- `verticalFin(...)` — 垂直尾翼，`rotateY(-π/2)` 換軸。
- `mirrorX(geo)` — 產生左側鏡像件。**縮放 −1 會翻轉三角形繞序**，
  必須反向索引讓正面朝外。`ExtrudeGeometry` 是 non-indexed，
  因此走「交換第二、第三個頂點的所有屬性分量」分支：

```js
if (m.index) { /* 交換三角形的第 1、3 個索引 */ }
else {
  for (const name in m.attributes) {       // 逐頂點、逐分量交換
    for (let i = 0; i < a.count; i += 3)
      for (let c = 0; c < n; c++) {
        const p = (i+1)*n + c, q = (i+2)*n + c;
        const t = arr[p]; arr[p] = arr[q]; arr[q] = t;
      }
  }
}
```

> **陷阱**：只處理 `m.index` 會讓 non-indexed 幾何的 `m.index` 為 `null`，
> 拋出 `Cannot read properties of null (reading 'array')`。兩種分支都要實作。

### 9.2 組裝內容
`buildAirplane()` 回傳一個 `plane` Group，內含 `hull`（機身）與 `cockpit`（座艙）：

| 部件 | 作法 |
| --- | --- |
| 機身 | 13 點 `LatheGeometry` 側剖線，28 段 |
| 機鼻錐 / 空速管 | `ConeGeometry` + `CylinderGeometry` |
| 主翼 + 翼尖紅條 | `liftingSurface(3.5, 1.15, 4.7, 2.55, 0.055°)` × 鏡像 |
| 鴨翼 / 平尾 | `liftingSurface(1.05,…)` / `(1.7,…)` |
| 主垂尾 + 兩片外傾尾翼 | `verticalFin(2.35,…)` + `rotation.z = ∓0.72` |
| 座艙蓋 | 壓縮的 `SphereGeometry` + `MeshPhysicalMaterial`（clearcoat, 透明） |
| 進氣道 | `BoxGeometry` × 2 |
| 尾噴管 / 加力燃燒焰 | 開放 `CylinderGeometry` + 加成混合的 `CircleGeometry` + `PointLight` |
| 螺旋槳 | 4 片鏡像葉片（`rotation.z = i/4·τ`）+ spinner |
| 動態模糊盤 | `CircleGeometry`，不透明度隨 RPM 提升（0.05 → 0.27） |
| 座艙內裝 | 儀表板、遮光板、兩條長椅、座椅 |

**內外切換**（`index.html:1830`）：座艙視角下 `hull.visible = false`、
`cockpit.visible = true`。若不隱藏機身，玩家會看到機鼻內壁。

### 9.3 材質
共用 6 個材質實例（`MAT.hull/accent/dark/metal/canopy/blade`），
`metalness` 從 0（蒙皮）到 0.9（金屬）分級。座艙蓋用
`MeshPhysicalMaterial` 的 `clearcoat: 1` 製造玻璃高光。

---

## 10. 粒子系統：`Trail` 類別

三個實例（`index.html:1905`）：尾焰 340 顆 / 生命 1.5 s / 加成混合；
左右翼尖凝結尾 220 顆 / 生命 2.8 s / 普通混合。

設計上是**固定容量環形緩衝**（`cursor` 循環覆寫），不動態增刪：

```js
update(dt, emit, rate, origin, dirVel, spread) {
  this.emitAcc += rate * dt;                    // 依幀率累積發射數量
  const n = Math.min(this.emitAcc | 0, 40);     // 每幀上限 40 顆，避免卡頓
  // ... 積分：重力 +2.4、阻尼 e^(−1.6·dt)
  alpha[i] = (1 - t) * (t < 0.06 ? t/0.06 : 1); // 0.06 生命期淡入 → 線性淡出
  sa[i]    = this.size * (0.35 + t * 2.1);      // 隨年齡膨脹
}
```

每幀只更新 CPU 端的 `Float32Array`（`position` / `aAlpha` / `aSize`），
再標記 `needsUpdate` 讓 GPU 重新上傳。所有 buffer 標記為
`THREE.DynamicDrawUsage`。

**點大小必須在執行期校正**——這是常見陷阱：

```js
gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.5), 1.0, 320.0);
```

`uScale` 若寫死，換視窗大小或 FOV 後粒子會整體變大或變小。正確做法是每幀
由相機投影重算：

```js
const pxScale = renderer.domElement.height / (2 * Math.tan(camera.fov * 0.5 * PI/180));
tr.mat.uniforms.uScale.value = pxScale;   // index.html:1866
```

粒子顏色會與當前霧色混合 25%，讓尾焰在黃昏時自然融入背景。

---

## 11. 飛行物理（核心）

狀態僅四個向量（`index.html:1278`）：`pos`、`quat`、`vel`、`omega`。

### 11.1 旋轉積分：精確指數映射
不用歐拉角（避免萬向鎖與 gimbal 抖動），也不用線性化的小角度近似：

```js
const w = flight.omega.length();
if (w > 1e-6) {
  _q.setFromAxisAngle(omega.normalize(), w * dt);
  q.multiply(_q).normalize();
}
```

這是 SO(3) 上的指數映射 `q ← q ⊗ exp([ω]dt)`，對任意角速度都精確（相對於
逐步旋轉的歐拉法），且天然保持單位長度。

### 11.2 速率指令（rate command），而非力矩
輸入不是「施加力矩」，而是「命令一個角速度」：

```js
_tgt.set(input.pitch * pitchRate, -input.yaw * yawRate, -input.roll * rollRate);
flight.omega.lerp(_tgt, damp(ctrlResponse, dt));      // ctrlResponse = 7
flight.omega.multiplyScalar(Math.exp(-omegaDamp * dt)); // omegaDamp = 2.1
```

`lerp + 阻尼` 的組合產生一個**穩態增益小於 1** 的響應。解析解為：

```
ω∞ = k / (1/d − 1 + k) × ω_cmd        k = damp(7, dt),  d = e^(−2.1·dt)
```

在 `dt = 1/60` 下 `k = 0.1103`、`d = 0.9656`，增益 = **0.756**。因此實際可達角速度：

| 軸 | 指令上限 | 實際穩態 | 換算 |
| --- | --- | --- | --- |
| 俯仰 | 1.0 rad/s | 0.756 rad/s | 43 °/s（滿舵一圈約 8.3 s） |
| 滾轉 | 1.8 rad/s | 1.361 rad/s | 78 °/s（滿舵一圈約 4.6 s） |
| 偏航 | 0.62 rad/s | 0.469 rad/s | 27 °/s |

這個「指令值 ≠ 實際值」的特性必須明說，否則調整參數時會對不上手感受。
偏航另外再乘一次 `e^(−2.6·dt)`，模擬真實機體巨大的偏航阻尼。

### 11.3 飛行輔助：自動回平
放開搖桿時（`|input| < 0.08`），把「回到水平」改寫成「命令一個回平角速度」：

```js
const bank = Math.atan2(-r.y, u.y);        // 由機體右向量與世界上向量求傾側
_tgt.z = clamp(bank * 1.7, -1.7, 1.7);     // 正 bank → 正 omega.z → 機翼下壓
flight.omega.z += (_tgt.z - flight.omega.z) * damp(3.2, dt);

const pitchAngle = Math.atan2(f.y, u.y);   // 機鼻仰角
_tgt.x = clamp(-pitchAngle * 1.5, -0.85, 0.85);
flight.omega.x += (_tgt.x - flight.omega.x) * damp(3.2, dt);
```

`bank > 0`（右翼下）必須對應**正的** `omega.z`（繞 +Z 旋轉 = 右翼上抬）
才能回平。符號搞反會讓輔助**放大**傾側而不是修正——這是實測中發現的 bug，
症狀是放手後飛機持續翻滾並螺旋下墜。俯仰同理但符號相反（`−pitchAngle`）。

### 11.4 風向標穩定性（weathercock）
垂直尾翼會把機鼻拉回氣流方向。用側滑角實作：

```js
const along = vel.dot(f);
_side.copy(vel).addScaledVector(f, -along);            // 拆出側向速度分量
const sideslip = Math.atan2(_side.dot(r), Math.max(along, 5));
const yawCmd = clamp(-sideslip * 1.4, -1.6, 1.6) - input.yaw * yawRate;
flight.omega.y += (yawCmd - flight.omega.y) * damp(3.0, dt);
```

效果：不操縱偏航時，飛機會像箭一樣自己轉向——放開搖桿後航向自然穩定，
不會漂移。

### 11.5 平移力

```js
// 推力（含加速與減速）
const thrust = thrustCruise * (1 + boost * (boostMul - 1)) - brake * thrustCruise * 0.95;
vel.addScaledVector(fwd, thrust * dt);

// 寄生阻力（二次方）
vel.addScaledVector(vel, -dragCoef * speed * dt);

// 減速板
vel.addScaledVector(vel, -brake * 0.006 * speed * dt);

// 升力：沿機體上軸，隨空速平方增長並飽和
const liftFactor = clamp(Math.max(airspeed, 0) ** 2 * liftCoef, 0, liftMax);
vel.addScaledVector(up, gravity * liftFactor * dt);

vel.y -= gravity * dt;                     // 重力
flight.pos.addScaledVector(vel, dt);
```

終端速度由 `thrust = dragCoef · v²` 決定：

| 狀態 | 推力 | 理論 | 實測 |
| --- | --- | --- | --- |
| 巡航 | 300 | 200 m/s = 720 km/h | **702 km/h** |
| 加速 | 825（300×2.75） | 332 m/s = 1194 km/h | **1144 km/h** |
| 減速 | ≈15 | — | **124 km/h** |

`liftMax = 1.0` 代表升力加速度最多抵銷 1 g 重力，因此**永遠不會失速**——
這是刻意的取捨：讓模型專注在「手感」而非模擬失速的複雜氣動。
放手時 `liftFactor = 1` 精確抵銷重力，所以巡航能完全定高。

### 11.6 世界約束
```js
// 地面
const ground = groundHeight(x, z) + 7;
if (pos.y < ground) { pos.y = ground; vel.y *= -0.25; vel.multiplyScalar(0.985); }

// 邊界：超出 worldLimit 後平滑轉向圓心
if (dist > worldLimit)
  flight.omega.y += (clamp(diff, -1, 1) * 0.6 - flight.omega.y) * damp(1.2, dt);
```

邊界轉向刻意做得很弱（0.6 rad/s 的指令、damp 1.2），讓玩家有時間反應，
不會被硬性鎖定。

### 11.7 油門狀態
`boost` / `brake` / `rpm` / `throttle` 都是以 `damp` 平滑追蹤輸入的狀態變數
（分別 5.5 / 7 / 4 / —），供視覺與 HUD 使用，因此推進／螺旋槳／焰光都有
自然的漸入漸出。

---

## 12. 相機系統

三種模式由 `CAM_MODES[]` 定義，`camState.mode` 為唯一真實來源。

| 模式 | 位置 | 備註 |
| --- | --- | --- |
| **CHASE** | 機後 `15.5 + fast×5.5`，上方 `3.6` | `up` 向量以 `damp(6)` 追隨機體上軸，倒飛時不會翻轉 |
| **COCKPIT** | 機內 `(0, 0.82, −0.95)` | 座標直接貼機體，隨震動抖動 |
| **ORBIT** | 球座標，`yaw/pitch/dist` | 拖曳旋轉、滾輪縮放（10–220） |

共同點：

- **動態 FOV**：`fov = (chase ? 60 : 72) + fast × 12`，`fast = clamp((v−60)/220, 0, 1)`。
  加速時視野擴張，產生速度感。切換時以 `damp(3)` 平滑過渡。
- **切入 ORBIT** 時從當前相機位置反推 `yaw/pitch/dist`（`setCameraMode`），
  讓視角**無跳變**地接手。
- **指標鎖定**：非 ORBIT 模式時滑鼠用 Pointer Lock 累積到
  `mouseRoll/mousePitch`；ORBIT 模式改用拖曳並釋放指標鎖定。
- 滑鼠桿以 `e^(−4.5·dt)` 自動回中（`decaySticks`），不需要放開按鍵。

---

## 13. 時段系統

`TOD[]` 是 5 筆純資料（`index.html:1497`），每筆包含 17 個參數：
太陽仰角／方位角、天頂／地平線／太陽顏色、太陽與半球光強度、
半球光上下色、霧色與密度、曝光、星星透明度、海水深淺色。

`applyTimeOfDay(dt)`（`index.html:1524`）以 `damp(1.6, dt)` 把 `skyState`
**當前值**往目標值插值，再把結果推給 8 個消費者：

```
skyState ──┬─→ skyUniforms      (uZenith, uHorizon, uGround, uSunColor, uSunDir, uNight)
           ├─→ oceanUniforms    (uFogColor, uFogDensity, uDeep, uShallow)   ← 共享 uSunDir/uSunColor/uHorizon 參照
           ├─→ scene.fog        (color, density)
           ├─→ renderer         (toneMappingExposure)
           ├─→ sunLight         (color, intensity)
           ├─→ hemiLight        (color, groundColor, intensity)
           ├─→ stars.mat        (uOpacity)  + stars.pts 位置
           └─→ cloudMats[]      (color = 天光染色，讓雲跟隨時段變色)
```

`oceanUniforms` 的 `uSunDir`、`uSunColor`、`uHorizon` **直接引用**
`skyUniforms` 的同一個 uniform 物件（`{ value: ... }`），因此修改只有一份。

太陽有兩個方向向量：

```js
sunDirSky   用真實仰角（夜間為負 → 落到地平線下）
sunDirLight 用 max(sin(el), 0.12)            // 光源永遠不低於地平線
```

因為幾何光照無法處理太陽低於地平線的情況，NIGHT 用極低的 `sunI = 0.30`
加上抬高後的方向光，模擬月光。

| 時段 | 仰角 | 曝光 | 星星 | 特色 |
| --- | --- | --- | --- | --- |
| DAWN | 3° | 0.98 | 0.18 | 暖橘地平線 |
| MORNING | 33° | 1.00 | 0 | 預設值 |
| NOON | 70° | 1.00 | 0 | 最亮 |
| GOLDEN | 12° | 1.02 | 0.05 | 低角度長陰影 |
| NIGHT | −10° | 1.35 | 1.00 | 需拉高曝光才看得見 |

---

## 14. 輸入與 HUD

### 14.1 輸入

| 來源 | 機制 |
| --- | --- |
| 鍵盤 | `keydown/keyup` 寫入 `keys[code]`；`readKeys()` 每幀轉換成 ±1 |
| 滑鼠 | Pointer Lock 累積位移 → `mouseRoll/mousePitch`，`damp` 回中 |
| 觸控 | 虛擬搖桿 + 4 個按鈕 |

按鍵：<kbd>W</kbd><kbd>S</kbd>/↑↓ 俯仰、<kbd>A</kbd><kbd>D</kbd>/←→ 滾轉、
<kbd>Q</kbd><kbd>E</kbd> 偏航、<kbd>Space</kbd> 加速、<kbd>Shift</kbd> 減速、
<kbd>C</kbd> 相機、<kbd>T</kbd> 時段、<kbd>R</kbd> 重生、<kbd>H</kbd> 隱藏 HUD。

兩道防呆：`blur` 時清空所有按鍵（避免切視窗後卡住）；方向鍵與空白鍵
`preventDefault()`（避免捲動）。

觸控（僅 `pointer: coarse` 時啟用，`body.touch` 類別控制顯示）：
左下 52%×58% 為虛擬搕桿區，`touchstart` 記錄原點並顯示搖桿圈，
`touchmove` 以 60 px 為滿行程換算，`touchend` 歸零。
右上四顆圓形按鈕：BOOST、RESET、CAM、BRAKE。
**按鈕位置必須避開搖桿區**，否則點按鈕會同時觸發搖桿（`#touchPad` 是全區域
攔截 touchstart）。

### 14.2 HUD
純 DOM + CSS，透過 `ui` 物件持有 12 個元素參考。刻意不用 canvas 繪製，
因為文字銳利、可 CSS 樣式化、無需重繪。

- **節流**：文字數值每 0.07 s 更新一次（約 14 Hz），姿態指示器每幀更新。
  數字在 60 Hz 更新既看不出差別又浪費排版。
- **羅盤帶**：預先建 `-360°～+360°` 每 15° 的刻度（只保留 45° 與 90° 的倍數），
  每幀只改 `translateX(170 − (hdg+360)×6)`，用 CSS mask 做兩端淡出。
  滾動而非重繪，成本近乎零。
- **姿態指示器**：`translateY(pitch×260) rotate(−bank°)` 兩行 CSS。
- **面板**：`backdrop-filter: blur(9px)` 半透明玻璃質感。
- 響應式：< 720 px 縮小字級、隱藏羅盤與操作提示、相機面板移到右上。

---

## 15. 主迴圈與時間步進

```js
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!ready) return;
  readKeys();
  decaySticks(dt);
  integrateFlight(dt);
  // 視覺同步：飛機位姿、螺旋槍 RPM、焰光、座艙可見性、陰影視錐
  // 粒子（三組）、雲飄移、海面時間、天空位置
  updateCamera(dt);
  // 依當前 FOV 重算粒子 pxScale
  applyTimeOfDay(dt);
  updateHud(dt);
  renderer.render(scene, camera);
}
```

**`dt` 上限 0.05 s 是關鍵的穩定性措施。** 若視窗被拖曳最小化或分頁切換，
`getDelta()` 可能回傳數秒，此時積分器會「跳」到荒謬的位置甚至產生 NaN。
上限等於宣告「最慢也只當作 20 fps」，多餘的時間直接丟棄。

無論幀率高低，**所有更新都乘上 `dt`**，唯一的例外是 HUD 節流與
`windOffset`（雲飄移用 `dt` 但位移取模 700 以內形成迴圈）。

---

## 16. 設定參數

```js
const CFG = {
  terrainRadius: 9000,      // 地形半徑（地平面 18 km 見方）
  terrainSegments: 440,     // 441×441 頂點
  oceanSize: 26000, oceanSegments: 180,
  skyRadius: 16000,
  worldLimit: 7200,         // 超過此半徑自動轉向圓心
  exposure: 1.0,

  gravity: 9.81,
  thrustCruise: 300,        // N/kg，等效加速度
  boostMul: 2.75,           // 加速時推力倍率
  dragCoef: 0.0075,         // v_terminal = √(thrust / dragCoef)
  liftCoef: 0.00034,        // 升力 = v²·coef，巡航 v=195 → 0.99 ≈ 1g
  liftMax: 1.0,             // 升力飽和值 = 1g，永不失速

  pitchRate: 1.0,           // 注意：實際穩態 = 指令 × 0.756
  rollRate: 1.8,
  yawRate: 0.62,
  ctrlResponse: 7.0,        // 操縱響應速度
  omegaDamp: 2.1,           // 角速度阻尼

  propSpin: 46
};
```

`liftCoef = 0.00034` 是反推出來的：巡航終端速度 200 m/s，
`200² × 0.00034 = 13.6` → 需要飽和。取 0.00034 使巡航時升力恰好 ≈ 重力，
放手即可定高。

---

## 17. 驗證方式

專案在**無 GPU 的環境**下開發驗證，因此建立了兩層測試策略。

### 17.1 確定性物理測試
因為 `integrateFlight(dt)` 是純函式，測試在頁面注入 `window.__api` 暴露內部
狀態，然後**完全繞過渲染迴圈**，以 `dt = 1/60` 呼叫數千次：

```js
a.resetFlight();
a.flight.pos.set(0, 3000, 0);
for (let i = 0; i < seconds * 60; i++) {
  a.input.keyPitch = /* 依時間軸的輸入劇本 */;
  a.integrateFlight(1 / 60);
}
// 記錄 spd / alt / vy / pitch / bank / hdg
```

這在只有 SwiftShader 軟體光柵化（≈1 fps）的機器上是唯一可行的做法——
若靠實際按鍵測試，9 秒的牆鐘時間只會推進約 0.45 秒的模擬時間。

覆蓋的工況：定高巡航、加速、減速、爬升、俯衝、轉彎（放手後航向穩定）、
低速失速邊界。全部無 NaN、無失控。

### 17.2 渲染與互動測試
- **著色資料稽核**：直接讀 `geometry.attributes.color` 統計綠色／雪白頂點
  比例（這才找出 `colorTerrain` 的物件別名 bug——畫面看起來只是「地形有點灰」，
  資料層檢查立刻定位到 0% 綠色頂點）。
- **像素分帶取樣**：把畫布縮到 48×32，逐橫帶取樣 RGB 與亮度，
  以數值判斷天空／地形／海洋各自的表現（環境無法直接觀看截圖）。
- **時段驗證**：因轉場需約 3 秒**模擬**時間，測試中直接注入
  `settleSky()` 重複呼叫 `applyTimeOfDay(0.05)` 400 次強制收斂後取樣，
  確保標籤與實際渲染一致。
- **觸控驗證**：合成真實 `TouchEvent`（含 `changedTouches`）派發到
  `#touchPad` 與各按鈕，並用幾何相交測試驗證按鈕不與搖桿區重疊。
- **相機**：注意 `setCameraMode(i)` 接受的是**索引**而非字串，
  傳字串會讓 `CAM_MODES[NaN]` 為 `undefined`。

---

## 18. 已修正的缺陷紀錄

| 症狀 | 根因 |
| --- | --- |
| 整張地圖是灰色，無植被無雪 | `colorTerrain` 的 `out` 與內部暫存 `tmpColor` 為同一物件，所有中間混合自我覆蓋 |
| 放手後飛機持續翻滾螺旋下墜 | 滾轉回平輔助符號反了，`bank` 被放大而非修正 |
| 雪山頂變成裸岩 | 坡度岩層混合排在雪線之後，覆蓋了雪冠 |
| `Cannot read properties of null (reading 'array')` | `mirrorX()` 只處理 indexed 幾何，但 `ExtrudeGeometry` 是 non-indexed |
| `'toneMappingExposure' : redefinition` | 自訂 shader 重複 `#include <tonemapping_pars_fragment>` |
| `Assignment to constant variable.` | `todIndex` 宣告為 `const` 但每幀遞增 |
| 夜空被大片白色斑塊佔據 | 星星 `gl_PointSize` 設定為 60–250 px |
| 粒子在 4K 螢幕上巨大無比 | `uScale` 寫死，未依 FOV／畫布高度校正 |
| 切換視窗後按鍵卡住 | 缺少 `blur` 時清除按鍵狀態 |
| 座艙視角看到機鼻內壁 | 未隱藏 `hull` |
| 手機無法重生 | 觸控層缺少重置按鈕（桌機有 <kbd>R</kbd>） |
| 點手機 RESET 會同時冒出搖桿 | 按鈕落在 `#touchPad` 的觸控區內 |

---

## 19. 取捨與未來方向

**刻意保留的限制**

- **不失速**（`liftMax = 1.0`）。犧牲了失速與螺旋下滑（spiral dive）的真實感，
  換取「放手即平飛」的可預期性。
- **偏航幾乎無操縱權威**。`yawRate` 遠低於俯仰／滾轉，尾翼風向標效應佔主導。
  這讓轉彎必須靠滾轉，符合戰鬥機特性，也讓輔助自動回平有效。
- **雲是精靈（Sprite）而非體積雲**。230 團 × 3–5 片，從下方看不穿。
- **地形是靜態網格**。18 km 全解析（440²）約 7.4 MB 頂點資料，
  再高會讓初始建構時間明顯增加；目前沒有 LOD 或分塊串流。
- **無碰撞回應**。撞地只有彈跳 + 0.985 衰減，不會損毀。

**可改進方向**

1. **地形分塊 + LOD**：以 flyable frustum 或距離分層載入，可把頂點數降一個數量級。
2. **GPGPU 粒子**：尾焰改為 transform feedback 或 FBO 位置紋理，
   讓粒子數從數百提升到數萬。
3. **硬體陰光 / 體積雲**：目前單一方向光陰影無法處理山體自遮蔽的柔和邊緣。
4. **物理與視覺分離**：把 `integrateFlight` 抽成獨立模組（Worker 或獨立檔），
   即可在正式環境持續跑確定性回歸測試。
5. **音訊**：目前完全無聲音。程序化風切聲與引擎音是最能強化速度感的低成本項。