# Dashboard Visual Realism Implementation Plan

> **For agentic workers:** 使用者要求寫完直接執行（主控 inline 執行，需要截圖反覆調整）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 星球標籤只顯示 ID；宇宙背景改為真實的星空（有色恆星、銀河帶、星雲、遠處各類星系）；星球改為有表面紋理、大氣、行星環、自轉的真實外觀，同時保留以狀態顏色辨識。

**Architecture:**
- `client/procedural.mjs`：純函式（固定種子亂數、3D 值雜訊、星球特徵、星空目錄、恆星顏色），不依賴 three 或 DOM，可在 Node 測試。
- `client/sky.mjs`：用 canvas 即時繪製材質，依星空目錄建立背景群組；背景每畫格跟隨相機位置（像天空盒，沒有視差，永遠在遠處）。
- `client/planet-look.mjs`：產生共用的星球表面材質（3 類 × 2 變化），建立星球物件（表面、大氣、行星環），依狀態顏色換色。
- `client/scene.mjs`：改用上述兩個模組；星球由 `root` 群組（位置、顯示、縮放、標籤）＋ `surface`（點選、自轉）組成。

**決策（使用者已同意）：** 狀態顏色仍是星球主色。表面紋理只提供明暗細節（灰階材質乘上狀態顏色），大氣光暈也用狀態顏色，圖例照樣可對照。不下載圖片、不新增依賴，CSP 不變。

**Tech Stack:** three@0.170.0（既有）、Canvas 2D、`ShaderMaterial`（大氣菲涅耳光暈）、node:test。

---

## 檔案

| 路徑 | 動作 | 職責 |
|---|---|---|
| `shared/layout.mjs` | 修改 | 匯出既有 `hash`（FNV-1a）供種子使用 |
| `client/procedural.mjs` | 新增 | 純函式：`seededRandom`、`createNoise3`、`planetTraits`、`starColor`、`skyCatalog` |
| `client/sky.mjs` | 新增 | `createSky()` → THREE.Group |
| `client/planet-look.mjs` | 新增 | `createPlanetLooks()` → `{ create(wp), restyle(planet, color) }` |
| `client/view-model.mjs` | 修改 | `planetLabel(wp)` → `#${wp.id}` |
| `client/scene.mjs` | 修改 | 接上背景與星球外觀；移除舊星點；調整光照 |
| `server/static-files.mjs` | 修改 | 白名單加入 `/procedural.mjs`、`/sky.mjs`、`/planet-look.mjs` |
| `tests/procedural.test.mjs` | 新增 | 純函式測試 |
| `tests/view-model.test.mjs`、`tests/static-files.test.mjs` | 修改 | 標籤與白名單 |

## Task 1：純函式（TDD）

- [ ] 撰寫 `tests/procedural.test.mjs`：
  - `seededRandom` 同種子同序列、值域 [0,1)。
  - `createNoise3` 同種子同值、值域 [0,1]、相鄰點連續（差值小）。
  - `planetTraits(id)` 固定；300 個 ID 涵蓋 gas／rock／ice；`variant` 為 0 或 1；`tilt` 在 ±0.5 rad 內；`spin` 在 0.05～0.3；行星環只出現在氣態巨行星，比例 2%～40%。
  - `starColor(r)` 在 r=0 與接近 1 時都回傳 `#rrggbb`。
  - `skyCatalog()` 固定；恆星 7000 顆、方向為單位向量、大小等級 0～2；銀河帶恆星比一般恆星更集中於銀河平面；遠處星系 36 個且涵蓋 spiral／elliptical／irregular／edge 四類；星雲 8 團；銀河光暈 70 團。
- [ ] 在 `tests/view-model.test.mjs` 新增 `planetLabel` 測試；`tests/static-files.test.mjs` 確認三個新模組在白名單。
- [ ] 確認失敗 → 實作 `procedural.mjs`、`planetLabel`、白名單、匯出 `hash` → `npm test` 全數通過 → 提交。

## Task 2：背景與星球外觀（瀏覽器）

- [ ] `sky.mjs`：
  - 恆星：依大小等級分 3 組 `Points`（1.2／2／3.2 像素），使用頂點顏色和圓形柔光貼圖。
  - 銀河帶：70 個大型柔光雲霧 sprite，低透明度，疊加混合。
  - 星雲：8 團彩色雲霧 sprite。
  - 遠處星系：36 個 sprite。每類繪製 2 種 canvas 材質；以 sprite 旋轉和不等比縮放模擬不同傾角。
  - 全部 `depthWrite: false`，不參與點選。
- [ ] `planet-look.mjs`：
  - 表面材質 256×128 等距長方投影，以 3D 雜訊在球面取樣，避免接縫：
    - 氣態：緯度條紋加擾動，加一個風暴橢圓。
    - 岩石：分形地形加隕石坑，並作為 bumpMap。
    - 冰質：高亮底色加裂紋和極冠。
  - 材質依（顏色、類型、變化）快取，最多 16×6 種。
  - 大氣：1.15 倍半徑的菲涅耳光暈（`ShaderMaterial`，含 `colorspace_fragment`），疊加混合，依狀態顏色快取。
  - 行星環：`RingGeometry`，同心圓 canvas 材質，半透明雙面。
  - 結構：`root`（位置、顯示、縮放、標籤）→ `body`（軸傾角）→ `surface`（自轉、點選）、`atmosphere`、`ring`。
- [ ] `scene.mjs`：
  - 移除舊星點與單色材質。
  - 環境光 0.6 → 0.25，表面加微弱的狀態色自發光，暗面仍能辨識狀態。
  - 每畫格把背景移到相機位置。
  - 可見星球依 `spin` 自轉。
  - 點選只針對可見的 `surface`。
- [ ] 提交。

## Task 3：驗證

- [ ] `npm test` 全數通過。
- [ ] 更新無頭 Chrome 檢查腳本：星球標籤由標題改為 `#ID`。重跑 34 項，確認點選、標籤、太空船、鍵盤、WebGL 不支援提示都正常，且主控台沒有錯誤、沒有 CSP 違規。
- [ ] 截圖檢視總覽、星系、全宇宙。即時模式（362 顆）以無頭 Chrome 量測幀時間，確認畫面流暢。
- [ ] 更新 handoff；提交。
