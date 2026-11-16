# 任務布告欄 工作交接

最後更新：2026-11-16（Asia/Taipei）
目前階段：第一階段（My time tracking 任務布告欄）已完成實作與驗證，位於 `feature/quest-board`（從 `develop` 開出），尚未合併。

## 專案方向

- 原 3D 宇宙 Dashboard 已廢止並移除程式碼，只保留 OpenProject 存取部分。歷史設計與計畫仍在 `docs/superpowers/`。
- 新方向：自己優化操作 OpenProject 的像素風介面。第一階段是「冒險者工時公會」任務布告欄，用來快速記錄工時，不必每次重新選 work package。
- 主要分支為 `develop`；新功能分支從 `develop` 開出，合併回 `develop`。

## 接續時先讀

1. 本文件。
2. `docs/superpowers/specs/2026-11-16-quest-board-time-tracking-design.md`（設計，含實測過的 OpenProject API 細節）。
3. `tasks/todo.md`（進度與驗證紀錄）。
4. 實作計畫：`docs/superpowers/plans/2026-11-16-quest-board-backend.md`、`docs/superpowers/plans/2026-11-16-quest-board-frontend.md`。

## 如何執行

| 用途 | 指令 |
|---|---|
| 安裝依賴 | `npm install` |
| 建置前端 | `npm run build`（產物在 `web/dist`，伺服器啟動時掃描；重新建置後要重啟伺服器） |
| 示例模式（不需 token） | `npm run demo` → http://127.0.0.1:4173/ |
| 即時模式（連公司 OpenProject） | `npm start`（讀 `config/local.json`） |
| 前端開發 | 一個終端機 `npm run demo`（或 `npm start`），另一個 `npm run dev:web` → http://127.0.0.1:5173/ |
| 測試 | `npm test`（後端 node --test ＋ 前端 Vitest）；`npm run test:server`、`npm run test:web` 可分開跑 |

## 設定（`config/local.json`，已被 git 忽略）

| 欄位 | 說明 |
|---|---|
| `mode` | `live` 或 `demo` |
| `baseUrl` | OpenProject 位址（只取 origin） |
| `apiToken` | 個人 API token；只存在伺服器端，不會傳給瀏覽器或寫入 log |
| `port` | 預設 4173 |
| `dailyTargetHours` | 每日目標時數，預設 8 |
| `dataDir` | 常駐任務存放目錄，預設 `data`（即時模式存 `quests.json`，示例模式存 `demo-quests.json`） |
| `staticDir` | 前端產物目錄，預設 `web/dist` |

禁止把 token 寫進文件、commit 或對話輸出。

## 架構重點

- `server/openproject/client.mjs`：唯一持有 token 的模組。讀取限 `/api/v3`；寫入只允許工時的 POST/PATCH/DELETE 與 `/time_entries/form`，不跟隨重新導向、不自動重試。寫入成功但回應無法解讀時回報 `write_unconfirmed`。
- `server/time-tracking.mjs`（真實）與 `server/demo.mjs`（記憶體）實作同一個來源介面。
- `server/http.mjs`：本機 JSON API。防護包括 Host 檢查、寫入需 `X-Quest-Board: 1`、Origin 白名單、拒絕 `Sec-Fetch-Site: cross-site`、只收 JSON 且上限 16KB，以及固定 CSP `default-src 'self'`。
- `web/`：Svelte 5 + Vite。`web/src/lib/api.js` 是唯一呼叫 `/api` 的模組。元件不得使用 inline style、`style:` 或 `transition:`（會違反 CSP）。
- 字型：俐方體11號 Cubic 11（SIL OFL 1.1），設計格線 12px，字級只用 12px／24px。

## 已驗證（2026-11-16）

- 自動測試：後端 node --test 與前端 Vitest 全數通過。
- 示例模式、正式產物、真實 CSP 下的瀏覽器驗證：12 項全通過，沒有 CSP 違規或主控台錯誤。
- 連公司 OpenProject 的唯讀驗證：使用者、工時、搜尋、活動清單都和 OpenProject 一致；伺服器輸出不含 token。
- 經使用者同意的真實寫入：在 #202 新增、修改、刪除測試工時，沒有殘留，原有工時完好。

## 已知限制與注意事項

- 單人本機使用，沒有登入機制。
- 沒有計時器、週曆、月曆、拖曳排序，這些留待後續階段。
- 已實測的 OpenProject 行為：
  - `subjectOrId` 搜尋也會比對名稱子字串，所以純數字搜尋會另外精確查詢該編號。
  - 對不存在的 work package，`/time_entries/form` 會回 500，所以寫入前會先用 GET 確認。
  - 活動類型依專案而不同，而且可以不指定。
- 這台 Windows 的臨時埠號可能落在 fetch 封鎖的埠號上，測試伺服器已用 `tests/support/ports.mjs` 避開。
- 用 `npm run demo` 在背景啟動時，停止 npm 外層行程不一定會結束 node 子行程；遇到 `EADDRINUSE` 時，先確認佔用 4173 的行程。

## 下一步候選

- 合併 `feature/quest-board` 到 `develop`。
- 第二階段候選：週曆／月曆檢視、計時器模式、常駐任務排序、多人內網部署。
