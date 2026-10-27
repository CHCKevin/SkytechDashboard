# Dashboard Visual Realism 2 Implementation Plan

> **For agentic workers:** 使用者要求寫完計畫直接執行（主控 inline，需要截圖反覆調整）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- 修正真實外觀帶來的效能退化：即時模式 362 顆星球在軟體渲染只有約 2 fps。
- 加入泛光與電影色調映射，讓恆星、星系核心、大氣層有真實的發光感。
- 星系核心改成發光的恆星，取代平面圓盤般的光暈球。

**Architecture:** 維持 WebGL（`WebGLRenderer`）。

使用者問到 WebGPU。結論是：
- 真實感來自後製與材質，WebGL 一樣做得到。
- WebGPU 的優勢是大規模運算。
- three@0.170 的 WebGPU 渲染器仍在變動，且需重寫材質，目前不採用。

後製使用 three 內附的 `EffectComposer`、`RenderPass`、`UnrealBloomPass`、`OutputPass`，從 `node_modules` 以白名單提供；不新增套件，CSP 不變。

**Tech Stack:** three@0.170.0、node:test、無頭 Chrome（CDP）。

---

## 前置狀態

- 分支 `feature/visual-realism`，`55ba64d` 已提交第一輪真實外觀；77 個測試、34 項瀏覽器檢查通過。
- 量測方式：
  - 無頭 Chrome 預設使用 SwiftShader（CPU 模擬），幀率偏低，只適合相對比較。
  - 另以 `--use-angle=d3d11` 嘗試使用實體 GPU。
  - 兩種都記錄。

## Task 1：量測基準

- [ ] 量測腳本加入 GPU 選項，改用 Chrome 自己的 `Browser.close`，並等程序結束後再刪除設定檔目錄。
- [ ] 即時模式全宇宙（362 顆）分別量 SwiftShader 與 GPU 幀率，並記錄實際使用的渲染器名稱。不在產品程式加除錯用的全域變數。

## Task 2：遠近細節分級（LOD）— 視量測結果決定

> 量測結果（Intel Arc 140T，D3D11）：362 顆在解除垂直同步後約 200 fps（約 5 ms/幀），SwiftShader 約 2 fps 屬軟體模擬限制。依「最簡單」原則先不做 LOD；Task 3 加入泛光後若 GPU 幀率低於 60，才實作以下內容。

- [ ] `planet-look.mjs` 新增 `setDetail(look, near)`。
  - 遠處：低面數球體（16×12），隱藏大氣與行星環。
  - 近處（距相機 < 140，與標籤距離一致）：完整細節。
  - 只在狀態改變時切換，不每幀重設。
- [ ] `scene.mjs` 在 `updateLabels` 的同一個距離迴圈中呼叫，不另外再跑一次迴圈。
- [ ] 自轉只套用在近處星球（遠處看不出來）。
- [ ] 量測：draw calls 與三角形數應大幅下降，幀率回升。

## Task 3：泛光與色調映射

- [ ] `server/static-files.mjs` 白名單加入以下檔案，保持原本的相對路徑結構，讓 `../shaders/` 能正確解析；`tests/static-files.test.mjs` 先寫失敗測試：
  - `/vendor/postprocessing/{EffectComposer,RenderPass,UnrealBloomPass,OutputPass,Pass,ShaderPass,MaskPass}.js`
  - `/vendor/shaders/{CopyShader,LuminosityHighPassShader,OutputShader}.js`
- [ ] `scene.mjs`：
  - `renderer.toneMapping = ACESFilmicToneMapping`。
  - Composer 依序串接 RenderPass、UnrealBloomPass、OutputPass，泛光參數為 strength 0.7、radius 0.5、threshold 0.6。
  - 尺寸變更時同步 `composer.setSize`。
  - CSS2D 標籤不受影響。
- [ ] 確認狀態顏色仍可辨識：圖例顏色與星球主色對照截圖。

## Task 4：星系核心改為恆星

- [ ] 核心球改為高亮自發光，暖白並略帶專案紫，讓泛光自然形成恆光暈。
- [ ] 原本半徑 28 的半透明球改為柔光 sprite（中心亮、邊緣淡），不再是平面圓盤。
- [ ] 核心仍是點選目標（raycast 不變）。

## Task 5：驗證與交接

- [ ] `npm test` 全數通過。
- [ ] 34 項瀏覽器檢查全數通過，主控台無錯誤、無 CSP 違規。
- [ ] 截圖：總覽、星系、近拍、全宇宙（示例與即時）。
- [ ] 前後幀率比較寫入 handoff；提交。
