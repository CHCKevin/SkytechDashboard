# Dashboard Spacing and Planet Details Implementation Plan

> **For agentic workers:** 主控 inline 執行（需要截圖反覆調整）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
1. 星球間距加大，保證不重疊；星系之間也不重疊。
2. 每顆星球依 ID 固定加入細節：雲層、衛星，以及既有的行星環。

**Architecture:**
- `client/layout-3d.mjs` 新增純函式 `computeLayout(snapshot)`，取代只看 ID 的 `planetPosition`。
- **星球位置**：同一專案內依 ID 數值排序，第 n 顆放在 Vogel 螺旋 `r = c·√(n + 8)`、`θ = n·黃金角`，高度加上依 ID 的小幅偏移（±1.5）。
  - 實測最小平面間距為 1.657c。取 c = 6，間距約 9.9；星球半徑 1.6，行星環外緣 3.76。
  - 新項目 ID 較大，會排在最外圈，既有星球不動。
- **星系半徑**：`R = c·√(bucket(n) + 8) + 10`，`bucket` 取不小於 n 的 2 的次方，只有項目數跨過 2 的次方時才改變，避免頻繁移動。
- **星系位置**：依專案 ID 排序，沿黃金角螺旋找最小半徑，使任兩星系中心距離 ≥ `Ri + Rj + 40`，再加上依 ID 的高度偏移（±30）。
- **相機預設**：依星系半徑與整體範圍計算，取代固定距離。

細節特徵由 `planetTraits(id)` 延伸，新增欄位放在原本亂數序列之後，既有的類型、傾角、行星環不變：
- `clouds`：岩石或冰質 55% 有雲層，帶雲層變化和雲層轉速；氣態星球已有條紋，不加雲層。
- `moons`：0–3 顆，機率依序為 50%、30%、15%、5%。每顆有軌道半徑、大小、速度、相位和軌道傾角。有行星環時，軌道在環外側。

**Tech Stack:** three@0.170.0、node:test、無頭 Chrome（CDP）。

---

## Task 1：佈局（TDD）

- [ ] `tests/layout-3d.test.mjs` 改寫：
  - 362 顆（真實規模，244 顆同一專案）星球兩兩距離 ≥ 9。
  - 加入更大 ID 的項目後，既有星球位置不變。
  - 星系兩兩距離 ≥ 兩半徑和 + 40。
  - 星球都在所屬星系半徑內。
  - 相機預設：星系視角距離隨半徑增加；全宇宙視角比總覽遠，且能涵蓋整體範圍。
  - 船的測試不變。
- [ ] 實作 `computeLayout`，`cameraPreset(view, layout)` 改為依佈局計算；`planetPosition`／`galaxyCenter` 由 layout 取代。
- [ ] `scene.mjs`：
  - `setData` 計算佈局，移動既有星系與星球。
  - 星系光暈 sprite 依半徑縮放。
  - 所有 `cameraPreset` 呼叫傳入佈局。

## Task 2：細節特徵（TDD）

- [ ] `tests/procedural.test.mjs`：
  - 既有欄位不變（固定 ID 的快照值）。
  - 衛星數 0–3 都會出現。
  - 雲層不出現在氣態星球。
  - 有行星環時衛星軌道 > 3.9。
  - 衛星大小 0.18–0.4。
- [ ] 實作 `planetTraits` 擴充。

## Task 3：外觀（瀏覽器）

- [ ] `planet-look.mjs`：
  - 雲層材質（2 種，白色、透明度依分形雜訊）。
  - 雲層球（1.03 倍半徑），轉速與地表不同。
  - 衛星共用灰色岩石材質（不是狀態色），各自有軌道樞紐群組。
  - 新增 `animate(look, seconds)`，地表自轉、雲層、衛星公轉都集中在這裡。
  - 衛星與雲層不參與點選。
- [ ] `scene.mjs` 的動畫迴圈改為呼叫 `looks.animate`。

## Task 4：驗證與交接

- [ ] `npm test` 全數通過；34 項瀏覽器檢查（SwiftShader 與 GPU）通過。
- [ ] 截圖：近拍（衛星、雲層）、即時模式 Nexda 1.0 星系（244 顆不重疊）、全宇宙；GPU 幀率與先前的 183 fps 比較。
- [ ] 更新 handoff；提交。
