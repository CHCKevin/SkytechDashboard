# 任務布告欄 工作交接

最後更新：2026-11-17（Asia/Taipei）
目前階段：
- 第一階段（My time tracking 任務布告欄）已完成實作與驗證，並已合併到 `develop`（PR #1，分支 `feature/quest-board` 已刪除）。
- 第二階段（公會大廳）已完成實作與驗證，已合併到 `develop`（PR #2）。
- 第三階段（像素畫面優化）：路線圖第 0–5 階段全部完成（研究、像素引擎、換上大廳、動畫與四個方向、裝飾），位於 `feature/pixel-art-research`，只在本機，尚未推送。第 6 階段（AI 起稿）是選用，未做。

## 專案方向

- 原 3D 宇宙 Dashboard 已廢止並移除程式碼，只保留 OpenProject 存取部分。歷史設計與計畫仍在 `docs/superpowers/`。
- 新方向：自己優化操作 OpenProject 的像素風介面。第一階段是「冒險者工時公會」任務布告欄，用來快速記錄工時，不必每次重新選 work package。
- 第二階段是「公會大廳」頁籤：把挑選的成員（最多 16 位）放進像素場景，依當日工時顯示工作中／發呆／休息，點成員可唯讀檢視其當日工時。
- 主要分支為 `develop`；新功能分支從 `develop` 開出，合併回 `develop`。

## 接續時先讀

1. 本文件。
2. `docs/superpowers/specs/2026-11-16-quest-board-time-tracking-design.md`（第一階段設計，含實測過的 OpenProject API 細節）與 `docs/superpowers/specs/2026-11-17-guild-hall-design.md`（公會大廳設計）。
3. `tasks/todo.md`（進度與驗證紀錄）。
4. 像素畫面優化的研究與規格：`docs/pixel-art/01`–`06`。
5. 實作計畫：`docs/superpowers/plans/2026-11-16-quest-board-backend.md`、`docs/superpowers/plans/2026-11-16-quest-board-frontend.md`、`docs/superpowers/plans/2026-11-17-guild-hall.md`。

## 如何執行

| 用途 | 指令 |
|---|---|
| 安裝依賴 | `npm install` |
| 建置前端 | `npm run build`（產物在 `web/dist`，伺服器啟動時掃描；重新建置後要重啟伺服器） |
| 示例模式（不需 token） | `npm run demo` → http://127.0.0.1:4173/ |
| 即時模式（連公司 OpenProject） | `npm start`（讀 `config/local.json`） |
| 前端開發 | 一個終端機 `npm run demo`（或 `npm start`），另一個 `npm run dev:web` → http://127.0.0.1:5173/ |
| 大廳位子的 CSS | `npm run art:seats`（改了 `web/src/lib/seats.js` 的 SEAT_SPOTS 後執行，產生 `web/src/styles/seats.css`） |
| 像素資產目錄 | `npm run art:catalog` → 開 `art-out/index.html`；加 `-- --update-golden` 會更新黃金指紋 |
| 測試 | `npm test`（後端 node --test ＋ 前端 Vitest）；`npm run test:server`、`npm run test:web` 可分開跑 |

## 設定（`config/local.json`，已被 git 忽略）

| 欄位 | 說明 |
|---|---|
| `mode` | `live` 或 `demo` |
| `baseUrl` | OpenProject 位址（只取 origin） |
| `apiToken` | 個人 API token；只存在伺服器端，不會傳給瀏覽器或寫入 log |
| `port` | 預設 4173 |
| `dailyTargetHours` | 每日目標時數，預設 8 |
| `leaveWorkPackageId` | 請假的 work package 編號，預設 200；大廳用它判定成員是否休息 |
| `dataDir` | 本機資料目錄，預設 `data`。常駐任務：即時模式 `quests.json`、示例模式 `demo-quests.json`；大廳成員：即時模式 `hall.json`、示例模式 `demo-hall.json` |
| `staticDir` | 前端產物目錄，預設 `web/dist` |

禁止把 token 寫進文件、commit 或對話輸出。

## 架構重點

- `server/openproject/client.mjs`：唯一持有 token 的模組。讀取限 `/api/v3`；寫入只允許工時的 POST/PATCH/DELETE 與 `/time_entries/form`，不跟隨重新導向、不自動重試。寫入成功但回應無法解讀時回報 `write_unconfirmed`。
- `server/time-tracking.mjs`（真實）與 `server/demo.mjs`（記憶體）實作同一個來源介面。
- `server/http.mjs`：本機 JSON API。防護包括 Host 檢查、寫入需 `X-Quest-Board: 1`、Origin 白名單、拒絕 `Sec-Fetch-Site: cross-site`、只收 JSON 且上限 16KB，以及固定 CSP `default-src 'self'`。
- 公會大廳（只讀取 OpenProject）：
  - `server/hall.mjs`：成員名單儲存（最多 16 位，只記使用者編號與名稱）；`server/json-store.mjs` 是它和 quests 共用的 JSON 陣列檔讀寫。
  - `server/hall-status.mjs`：狀態判定純函式。當日有請假 work package 的工時 → 休息；沒有工時 → 發呆；其餘 → 工作中。
  - 來源新增 `searchUsers`、`getUser`、`listEntriesForUsers`，都是 GET。全員當日工時以一次查詢取回。
  - 前端：`App.svelte` 只管頁籤、日期與橫幅；`QuestTab.svelte` 是第一階段的全部內容；`HallTab.svelte` 負責讀取、每 5 分鐘自動更新與選取。座位分配在 `web/src/lib/seats.js`，造型在 `web/src/lib/sprite.js`（由使用者編號固定算出）。
- 像素引擎（`web/src/art/`，純 JavaScript，瀏覽器與 Node 共用）：`style.js` 調色盤與色階、`engine.js` 上色／木紋／外框／落影、`validate.js` 自動檢查、`assets/` 字元格樣板、`golden.json` 黃金指紋。開發工具在 `tools/art/`（索引色 PNG、目錄），輸出到被忽略的 `art-out/`。人物造型沿用 `lookFor` 的抽選，換畫法後每個人的造型類型不變（`looks-v1.json` 鎖住第二階段的結果）。
- 大廳場景：原生 220×160，`--px` 決定倍率（桌面 3 倍、窄螢幕 2 倍可捲動）。`lib/hall-art.js` 組出背景與各排前方的桌子；`HallScene.svelte` 依排輸出「角色按鈕 → 桌子」。座位 32 個（吧檯 6、工作桌 20、沙發 6），成員上限仍是 16。人物有正面、背面、左右側面：吧檯的人面向吧檯（背面），工作桌分桌後（正面）、桌頭（側面）、桌前（背面），沙發是正面，上方 L 型沙發的側座面向左。工作中與發呆各有兩幀動畫（CSS 切換，減少動態效果時停止）。桌面 3 倍、視窗 1179px 以下 2 倍。
- `web/`：Svelte 5 + Vite。`web/src/lib/api.js` 是唯一呼叫 `/api` 的模組。元件不得使用 inline style、`style:` 或 `transition:`（會違反 CSP）。
- 字型：俐方體11號 Cubic 11（SIL OFL 1.1），設計格線 12px，字級只用 12px／24px。

## 已驗證（2026-11-16）

- 自動測試：後端 node --test 與前端 Vitest 全數通過。
- 示例模式、正式產物、真實 CSP 下的瀏覽器驗證：12 項全通過，沒有 CSP 違規或主控台錯誤。
- 連公司 OpenProject 的唯讀驗證：使用者、工時、搜尋、活動清單都和 OpenProject 一致；伺服器輸出不含 token。
- 經使用者同意的真實寫入：在 #202 新增、修改、刪除測試工時，沒有殘留，原有工時完好。
- OpenProject 拒絕寫入（422）時的訊息轉傳：2026-11-16 經使用者同意實測：以即時模式對 #202 送出 `POST /api/time-entries`（0.5 小時、`activityId: 999999`），本機回應 422 `{"code":"validation","message":"Activity is not set to one of the allowed values."}`，訊息為 OpenProject 原文；送出前先以 `/time_entries/form` 預檢確認會被拒絕，前後當日清單一致、無殘留，伺服器 log 不含 token。
- HEAD（bdef2c2）即時模式瀏覽器 UI 全程重驗（2026-11-16 下午，經使用者同意寫入）：唯讀、切換日期不殘留舊資料、釘上／撕下、在 #202 經 UI 新增 → 修改 → 刪除（連按送出只建立一筆）、422 原文訊息顯示在視窗內且輸入保留；無殘留、log 不含 token。細節見 `tasks/todo.md`。
- 仍未在真實環境驗證：`write_unconfirmed`、`timeout`、`upstream_error` 的畫面提示（需故障注入，只有自動測試）；釘上視窗連選兩項的競態（UI 上無法重現）。這次即時模式重驗未能重測窄螢幕版面（瀏覽器視窗無法縮小）。
- 公會大廳（2026-11-17）：示例模式全流程瀏覽器驗證、即時模式唯讀驗證皆通過；寫入請求只有本機成員名單，沒有對 OpenProject 的寫入。細節與未驗證項目見 `tasks/todo.md` 的第二階段。

## 已知限制與注意事項

- 單人本機使用，沒有登入機制。
- 沒有計時器、週曆、月曆、拖曳排序，這些留待後續階段。
- 重新 `npm run build` 會清空 `web/dist`；正在執行的伺服器仍指向舊檔名，頁面會載入失敗，必須重啟伺服器。
- 驗證時若 4173 已被使用者自己的伺服器佔用，不要停掉它：另寫一份設定檔改用其他埠號與資料目錄。
- 大廳場景的名牌只在滑鼠指向、鍵盤聚焦或選取時顯示（工作桌兩個座位只隔 16 格，常駐名牌會重疊）；觸控螢幕沒有指向，要點選才看得到名字。
- 大廳能看到哪些人的工時，取決於 token 在 OpenProject 的權限；看不到某人的工時時，該成員會顯示發呆，而不是「無法讀取」。
- 大廳第一次讀取失敗後，每次自動更新都會短暫顯示「讀取中…」；切換頁籤會重新掛載並重讀該頁籤的資料。
- 已實測的 OpenProject 行為：
  - `/api/v3/users` 列表回 403，所以成員只能用名稱搜尋（`/api/v3/principals` 的 `name` 篩選），不能瀏覽全部名單。
  - `principals` 的 `any_name_attribute` 篩選、工時的 `work_package` 篩選都回 500；工時依 work package 篩選要用 `entity_id`。
  - `subjectOrId` 搜尋也會比對名稱子字串，所以純數字搜尋會另外精確查詢該編號。
  - 對不存在的 work package，`/time_entries/form` 會回 500，所以寫入前會先用 GET 確認。
  - 活動類型依專案而不同，而且可以不指定。
- 這台 Windows 的臨時埠號可能落在 fetch 封鎖的埠號上，測試伺服器已用 `tests/support/ports.mjs` 避開。
- 用 `npm run demo` 在背景啟動時，停止 npm 外層行程不一定會結束 node 子行程；遇到 `EADDRINUSE` 時，先確認佔用 4173 的行程。

## 下一步候選

- 像素畫面優化：推送 `feature/pixel-art-research` 並開 PR 到 `develop`（需使用者指示）；之後的候選：真實窄視窗驗證、更多裝飾（壁爐、燈）、自訂造型。
- 大廳後續候選：自訂造型、拖曳換位子、走路或工作動畫、超過 16 人、週檢視。
- 任務欄後續候選：週曆／月曆檢視、計時器模式、常駐任務排序、多人內網部署。
