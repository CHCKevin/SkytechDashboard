# 任務布告欄：OpenProject 工時記錄介面設計

日期：2026-11-16
狀態：設計已逐段經使用者同意，待審閱本文件
取代：`2026-10-25-openproject-universe-design.md`（3D 宇宙 Dashboard 已廢止，僅保留 OpenProject 存取部分）

## 1. 目標

以像素遊戲「任務布告欄」形式，重做 OpenProject 的 My time tracking。主要解決原介面每次 Log time 都要重新選 work package 的問題：常用的 work package 釘在布告欄上，點一下即可記錄工時。

第一階段範圍：

- 常駐任務（常用 work package）：可增減，點選後記錄工時。
- 特別任務：以編號或名稱搜尋任一 work package 後記錄工時，不加入常駐清單。
- 本日已接任務：所選日期的工時清單，可修改、刪除，顯示合計與每日目標進度。
- 日期切換：前一天／後一天／今天。

不在第一階段：拖曳排序、計時器、週曆／月曆、多人使用與登入。

## 2. 使用情境與限制

- 單人、本機執行：伺服器僅綁定 `127.0.0.1`，使用者自己的 OpenProject API token 放在 `config/local.json`（已被 git 忽略），所有工時以該 token 身分記錄。
- 「目前使用者」由 OpenProject `/api/v3/users/me` 決定；架構上保留之後擴充為內網多人使用的空間，但第一階段不實作。
- 保留示例模式（`mode: "demo"`）：以記憶體內的假 OpenProject 運作，無 token 也能開發與測試。

## 3. 架構

```
瀏覽器（Svelte 像素風 UI）
   │  /api/*（JSON，同源；寫入需自訂標頭）
   ▼
Node 伺服器（127.0.0.1）
   ├─ quests 儲存：data/quests.json（git 忽略）
   └─ OpenProject client（唯一持有 token）
         │  GET；POST/PATCH/DELETE 僅限工時路徑
         ▼
     OpenProject /api/v3
```

### 3.1 後端（沿用並修改）

| 檔案 | 職責 |
|---|---|
| `server/config.mjs` | 沿用；新增 `dailyTargetHours`（預設 8）與 `dataDir`（預設 `data/`）。 |
| `server/openproject/client.mjs` | 保留 GET、分頁、重試、來源與路徑檢查。新增 `send(method, path, body)`：僅允許 `POST /api/v3/time_entries`、`POST /api/v3/time_entries/form`、`PATCH`／`DELETE /api/v3/time_entries/{id}`；寫入不自動重試；不跟隨重新導向。 |
| `server/openproject/errors.mjs` | 沿用 `SourceError`，新增 `validation`（422）錯誤。此為「固定訊息、不含來源內容」原則的唯一例外：只轉傳 OpenProject 錯誤物件中的 `message` 字串（多筆時合併），不轉傳其他欄位。 |
| `server/time-tracking.mjs`（新） | 工時業務邏輯：`getMe`、`listEntries(date)`、`createEntry`、`updateEntry`、`deleteEntry`、`searchWorkPackages(q)`、`listActivities()`；負責 OpenProject HAL 與本機 JSON 之間的轉換。 |
| `server/quests.mjs`（新） | 常駐任務讀取／新增／移除，原子寫入 `data/quests.json`。 |
| `server/demo.mjs` | 改寫為假 OpenProject 工時來源，介面與 `time-tracking.mjs` 相同。 |
| `server/http.mjs` | 改為工時 JSON API（見第 4 節）與 `web/dist` 靜態檔案；保留 Host 檢查、CSP、錯誤不洩漏內部資訊。 |
| `server/index.mjs` | 依模式組裝 demo 或 live 來源。 |

### 3.2 前端（新增 `web/`）

- Svelte + Vite。開發時 Vite dev server 將 `/api` 轉發至 Node；正式執行由 Node 提供 `web/dist`。
- 主要元件：`TopBar`（日期切換、使用者）、`QuestBoard`（常駐任務卡、新增卡）、`SpecialQuest`（搜尋）、`WorkPackageSearch`（共用搜尋框）、`TodayLog`（已接任務清單、合計、進度條）、`AcceptDialog`（新增與修改共用）。
- `api.js`：唯一呼叫 `/api` 的模組，所有寫入自動附加 `X-Quest-Board: 1`。
- 日期一律以本地日期（年、月、日欄位）計算「今天」與前後一天，不使用 `toISOString()`（UTC+8 在 08:00 前會得到前一天）。

### 3.3 前後端整合

- 靜態檔案：Vite 產出帶雜湊的檔名，伺服器啟動時掃描 `web/dist` 建立白名單（取代寫死的清單），並支援 `.woff2`／`.ttf` 字型 MIME。`web/dist` 不存在時啟動失敗並提示先執行 `npm run build`。
- CSP：改為固定字串 `default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`（Vite 產物無 inline script 與 import map）；動態樣式只透過 JS 設定元素 style 屬性（CSSOM，CSP 允許），不輸出 inline `style=""`。正式產物須在此 CSP 下以瀏覽器驗證。
- 開發代理：Vite dev server 將 `/api` 轉發至 Node，代理時把 `Host` 與 `Origin` 改寫為 Node 位址，伺服器端檢查不放寬。

### 3.4 移除

`client/` 全部、`server/snapshot.mjs`、`server/activities.mjs`、`server/live-source.mjs`、`shared/`、`three` 依賴，以及對應測試。舊設計與計畫文件保留於 `docs/` 作為歷史。

## 4. 本機 API

所有回應為 JSON，錯誤格式沿用 `{ "error": { "code", "message" } }`。

| 方法與路徑 | 說明 |
|---|---|
| `GET /api/health` | `{ status, mode }` |
| `GET /api/me` | `{ id, name }` |
| `GET /api/config` | `{ dailyTargetHours }` |
| `GET /api/time-entries?date=YYYY-MM-DD` | 自己在該日的工時陣列 |
| `POST /api/time-entries` | 本體 `{ workPackageId, date, hours, activityId, comment }`，回傳建立的工時 |
| `PATCH /api/time-entries/:id` | 本體為上述欄位的子集合 |
| `DELETE /api/time-entries/:id` | 回傳 204 |
| `GET /api/work-packages/search?q=` | 最多 10 筆 `{ id, subject, project }` |
| `GET /api/activities?workPackageId=` | 該 work package 所屬專案可用的活動 `[{ id, name, default }]`（活動類型依專案而異） |
| `GET /api/quests` | 常駐任務陣列 |
| `POST /api/quests` | 本體 `{ workPackageId, activityId }`；伺服器向 OpenProject 確認 work package 存在並記下 `subject` |
| `DELETE /api/quests/:workPackageId` | 移除常駐任務，不影響已記錄的工時 |

工時物件：`{ id, workPackageId, workPackageSubject, date, hours, activityId, activityName, comment }`，`hours` 為十進位小時數（四捨五入至兩位）。`activityId`／`activityName` 可為 `null`（OpenProject 允許不指定活動）。`entity` 不是 work package 時，`workPackageId` 為 `null`，`workPackageSubject` 取連結標題。

### 4.1 輸入驗證

- `date` 必須是有效的 `YYYY-MM-DD`。
- `hours` 必須是大於 0、小於等於 24 的數字，最多兩位小數。
- `workPackageId`、路徑中的 `:id` 必須是正整數；`activityId` 為正整數或 `null`（不指定）。
- `comment` 為字串，最多 1000 字。
- `q` 去除前後空白後，`#123` 或 `123` 視為編號搜尋，其他視為名稱關鍵字；空字串回傳空陣列。

### 4.2 對應 OpenProject

- 查工時：`GET /api/v3/time_entries`，篩選 `user = me`、`spentOn = 日期`。
- 寫入工時：本體 `{ spentOn, hours, comment: { raw }, _links: { entity: { href: /api/v3/work_packages/{id} }, activity: { href | null } } }`；`entity` 為必填，`activity` 可為 null。
- 時數：送出 `PT{十進位}H`（例 `PT2.5H`，實測可接受）；讀取時解析 `P[nD]T[nH][nM][nS]`（OpenProject 回傳 `PT2H30M`、`PT45M` 形式）。
- 搜尋：`GET /api/v3/work_packages`，篩選 `subjectOrId` 運算子 `**`、依 `updatedAt` 由新到舊，最多 10 筆。此篩選也比對名稱子字串（實測搜尋 `202` 時 #202 排在第 4 筆），因此純數字搜尋時另外直接查該編號，存在就排在第一筆並去除重複。
- 活動類型：`POST /api/v3/time_entries/form`（不建立資料）帶入 `entity`，取 `_embedded.schema.activity._embedded.allowedValues`。
- work package 存在檢查：OpenProject 對不存在的 `entity` 會回 500 而非 422，因此新增工時與釘上任務前，先 `GET /api/v3/work_packages/{id}`，404 時回報「找不到 work package」。
- 以上（含 `time_entries` 的 `sortBy=[["id","asc"]]` 與 `work_packages` 的 `sortBy=[["updatedAt","desc"]]`）皆於 2026-11-16 以使用者的 OpenProject（唯讀 GET 與不建立資料的 `/form`）實測確認。

## 5. 常駐任務儲存

`data/quests.json`：

```json
[{ "workPackageId": 1234, "subject": "前端登入頁改版", "activityId": 3, "activityName": "Development" }]
```

`activityId`／`activityName` 可為 `null`。

- `data/` 加入 `.gitignore`。
- 寫入採「寫入暫存檔再改名」，避免中斷時檔案損毀；檔案不存在視為空清單；JSON 損毀時回報錯誤，不覆寫原檔。
- 重複加入同一 work package 時，更新其預設活動類型，不新增第二筆。

## 6. 畫面與互動

視覺採 A 方向「木製酒館布告欄」：暖色木板背景、釘在板上的羊皮紙任務單、粗黑像素框與硬陰影。字型使用支援繁體中文的開源像素字型「俐方體11號（Cubic 11，SIL OFL）」，隨前端一起打包，不依賴外部 CDN；若授權或字元涵蓋不符需求，改用 Zpix。版面草圖：`.superpowers/brainstorm/2008-1794799601/content/layout.html`。

- **頂部列**：日期切換（◀、▶、今天）；整個畫面跟隨所選日期；右側顯示目前使用者。
- **常駐任務卡**：顯示編號、名稱、預設活動。點卡片開啟接任務視窗；點 ✕ 撕下（從清單移除，需確認）；「＋ 釘上常駐任務」開啟搜尋並選擇預設活動。
- **特別任務**：輸入編號或名稱，自動列出建議（輸入停頓 300ms 後搜尋）；選定後開啟接任務視窗，不加入常駐清單。
- **本日已接任務**：所選日期的工時清單，每筆可修改（開啟預填的接任務視窗）或刪除（需確認）；底部顯示合計與 `合計 / dailyTargetHours` 進度條。
- **修改只送出變動欄位**：修改模式只送出與原值不同的欄位；完全沒改就直接關閉、不發請求（避免把 PT20M 顯示的 0.33h 寫回成 19.8 分鐘）。活動清單讀取失敗或原活動不在清單內時，保留並列出原活動，不會被清空。
- **接任務視窗**：日期（預設為所選日期）、時數（快速按鈕 0.5／1／2／4 與自由輸入）、活動（預設為任務卡設定值）、備註（可空）。送出成功後關閉並重新讀取清單；失敗時保留輸入並在視窗內顯示錯誤。送出期間按鈕停用，避免重複送出。

## 7. 安全

- token 僅存在 Node 伺服器記憶體與 `config/local.json`；不回傳給瀏覽器、不寫入 log。log 只記錄方法、路徑與錯誤名稱。
- 非 GET／HEAD 請求必須同時滿足：帶有 `X-Quest-Board: 1`；若有 `Origin` 標頭，必須等於 `http://127.0.0.1:{port}` 或 `http://localhost:{port}`；`Content-Type` 為 `application/json`（DELETE 無本體時免）；本體不超過 16KB。否則回應 403 或 415／413。
- 沿用 Host 檢查（防 DNS rebinding）與 CSP。
- OpenProject client 寫入僅允許第 3.1 節列出的工時路徑，任何其他寫入路徑一律拒絕。

## 8. 錯誤處理

| 情況 | 本機回應 | 前端顯示 |
|---|---|---|
| OpenProject 連不上／逾時 | 502／504，`network`／`timeout` | 「OpenProject 連不上，請稍後再試」 |
| token 無效 | 502，`unauthorized` | 「API token 無效，請檢查 config/local.json」 |
| 無權限 | 403，`forbidden` | 「沒有權限執行此操作」 |
| 工時或 work package 不存在 | 404 | 「找不到該項目，可能已被刪除」 |
| OpenProject 驗證失敗（422） | 422，`validation`，只附 OpenProject 的 `message` 字串 | 在接任務視窗內顯示該訊息 |
| 本機輸入驗證失敗 | 400，指出欄位 | 在對應欄位顯示 |

寫入（POST）遇到連線中斷等結果不確定的情況時不重試；前端提示「結果不確定」並重新讀取當日清單，讓使用者確認是否已建立，避免重複記錄。

## 9. 測試與驗證

- **後端**：`node --test`。擴充 `tests/support/fake-openproject.mjs` 支援工時 CRUD、搜尋與表單；測試涵蓋 API 路由、輸入驗證、CSRF 檢查、時數轉換、常駐任務存檔（含損毀檔案）、錯誤對應、client 寫入路徑白名單、POST 不重試。
- **前端**：Vitest + Svelte Testing Library，涵蓋接任務視窗（驗證、送出、錯誤保留輸入、送出中停用）、合計計算、日期切換。
- **建置**：`npm run build` 產出 `web/dist`，`npm test` 同時執行前後端測試。
- **真實驗證**：先確認 OpenProject 欄位與篩選器（唯讀）；完成後在使用者同意下，於真實 OpenProject 新增、修改、刪除一筆測試工時，並以瀏覽器實際操作一次完整流程。

## 10. 分支

從 `develop` 開出 `feature/quest-board`，完成後以 `develop` 為合併目標。
