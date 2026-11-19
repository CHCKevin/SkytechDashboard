# 任務欄：匯出工時表（OpenProject Timesheet PDF）設計

日期：2026-11-19
狀態：已與使用者確認設計方向（B1：深層連結）；同日修訂為直接連到 PDF 匯出，見文末「修訂」

## 目標

在任務欄頁籤加一個連結，在新分頁開啟 OpenProject 的時間報表，篩選條件已設好「使用者 = 我」以及「頂端所選日期的那一週（週一到週日）」。使用者在 OpenProject 上按原生的「Export PDF timesheet」取得 PDF。

## 為什麼不由伺服器直接匯出

2026-11-19 以即時模式的 API token 做唯讀探測：

| 請求（帶 API token） | 結果 |
|---|---|
| `GET /api/v3` | 200 |
| `GET /cost_reports` | 302 → `/login` |
| `GET /my/page` | 302 → `/login` |
| `GET /reporting/cost_reports`（新版路由） | 404 |

OpenProject 的網頁路由（包括 timesheet 匯出）只認瀏覽器 session，不接受 API token；公司版本仍使用舊路由 `/cost_reports` 和舊的篩選參數。代登入要保存密碼，也可能遇到 SSO，因此不採用。改成產生連結，由使用者用自己的登入狀態匯出；token 規則與 client 白名單不改。

## 已驗證的網址格式

使用者 2026-11-19 在已登入的瀏覽器確認以下網址：篩選條件正確套用、只列出自己本週的工時、有「Export PDF timesheet」按鈕，匯出的 PDF 範圍也正確。

```
{origin}/cost_reports?set_filter=1
  &fields[]=user_id&operators[user_id]==&values[user_id][]=me
  &fields[]=spent_on&operators[spent_on]=<>d&values[spent_on][]={週一}&values[spent_on][]={週日}
  &unit=-1
```

（實際網址中，`=` 與 `<>d` 經過 URL 編碼。）

## 行為

- 週的範圍：頂端所選日期（App 的 `date`）所在的那一週，週一到週日，以本地年月日計算。切換日期時連結會跟著更新。
- 連結文字：`匯出工時表（11/16–11/22）↗`，日期格式是 `M/D`，不補零。
- 開啟方式：`<a href target="_blank" rel="noopener noreferrer">`，不經過本工具的伺服器。
- 顯示條件：`openProjectUrl` 有值才顯示。示例模式或讀取設定失敗時不顯示。
- 位置：任務欄頁籤，今日紀錄（`TodayLog`）的上方。

## 元件與介面

### 後端：`server/http.mjs`

- `GET /api/config` 改為回傳 `{ dailyTargetHours, openProjectUrl }`。
  - 即時模式：`openProjectUrl = config.baseUrl`，`loadConfig` 已正規化成 origin。
  - 示例模式：`openProjectUrl = null`。
- `server/index.mjs` 把 `openProjectUrl` 傳給 `createHandler`。
- origin 只包含協定、主機和埠號，不含 token。

### 前端：`web/src/lib/timesheet.js`（新增，純函式）

- `weekRange(day)` → `{ start, end }`：給定 `YYYY-MM-DD`，回傳該週週一與週日，格式都是 `YYYY-MM-DD`。沿用 `dates.js` 的本地日期計算方式，避免 `toISOString()` 造成的跨日錯誤。
- `timesheetPdfUrl(origin, day)` → 字串：用 `URL` 與 `URLSearchParams` 組出網址（修訂後路徑為 `/cost_reports.pdf`）。參數順序固定，方便測試。
- `formatWeekLabel(day)` → `'11/16–11/22'`。

### 前端：`web/src/components/QuestTab.svelte`

- 從已經在讀取的 `getConfig()` 取出 `openProjectUrl`，存進 `$state`。
- 用 `$derived` 依 `date` 算出網址與文字，在 `TodayLog` 上方輸出連結。
- 樣式沿用現有的按鈕 class。不使用 inline style、`style:` 或 `transition:`，以符合 CSP。

## 錯誤處理

- 讀取設定失敗：沿用現有橫幅訊息，連結不顯示。
- 使用者沒有登入 OpenProject：OpenProject 會自己導到登入頁，登入後是否回到原網址由 OpenProject 決定，本工具不處理。

## 測試

- `web/src/lib/timesheet.test.js`：
  - `weekRange` 測週一、週三、週日、跨月（2026-11-30 → 11-30～12-06）、跨年（2026-12-31 → 12-28～2027-01-03）。
  - `timesheetPdfUrl` 產生的參數與驗證過的格式完全相同（以 `URLSearchParams` 解析後比對）。
  - `formatWeekLabel` 的輸出格式。
- `tests/`（node --test）：`/api/config` 即時模式回傳 origin，示例模式回傳 `null`。
- `QuestTab` 元件測試：
  - 有 `openProjectUrl` 時顯示連結，`href`、`target` 和 `rel` 都正確。
  - 換一個日期後 `href` 跟著更新。
  - `openProjectUrl` 是 `null` 時不顯示連結。
- 手動驗證：即時模式下以瀏覽器點擊連結，確認篩選條件正確並能匯出 PDF；切換到上週的日期再確認一次。

## 不做的事

- 不代使用者登入，不下載或轉存 PDF。
- 不在公會大廳加入匯出功能。
- 不提供其他範圍（例如月、自訂區間）或其他使用者。

## 修訂（2026-11-19）：直接連到 PDF 匯出

使用者希望開啟連結後不必再按「Export PDF timesheet」。檢查按鈕後發現，它指向 `/cost_reports.pdf`，網址不帶篩選，由 JavaScript 攔截點擊，篩選條件從 session 讀取。

經使用者同意，在公司 OpenProject 實測一次：
1. 先開啟上週（11/9–11/15）的報表頁，讓 session 存著上週的篩選。
2. 再開啟 `/cost_reports.pdf?` 加上本週的同一組篩選參數。
3. 結果：OpenProject 排入背景工作，跳到 `/job_statuses/:id` 顯示 Export completed，並自動下載 PDF。PDF 標題是 2026-11-16 - 2026-11-19，內容只有使用者本週的工時。可見網址上的篩選在同一個請求中套用，不會沿用 session。

因此連結改為 `{origin}/cost_reports.pdf?`（篩選參數不變），點擊後在新分頁直接產生並下載 PDF。每點一次，OpenProject 會產生一份匯出檔，和按原生按鈕相同。
