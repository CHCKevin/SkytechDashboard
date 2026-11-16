# 任務布告欄 — 第一階段（My time tracking）

設計：`docs/superpowers/specs/2026-11-16-quest-board-time-tracking-design.md`
分支：`feature/quest-board`（從 `develop` 開出，完成後合併回 `develop`）

## 後端 — `docs/superpowers/plans/2026-11-16-quest-board-backend.md`

- [x] Task 1 移除 3D 宇宙程式碼（7fbe007）
- [x] Task 2 設定：dailyTargetHours、dataDir、staticDir（a3509b6）
- [x] Task 3 時數 ↔ ISO duration（708d328）
- [x] Task 4 錯誤代碼與 HTTP 狀態對應（99ffc54）
- [x] Task 5 假 OpenProject 支援請求本體（46d86e7）
- [x] Task 6 client 僅限工時的寫入（6a58e61、審查修正 fa4469a）
- [x] Task 7 輸入驗證（e2032b2）
- [x] Task 8 真實 OpenProject 工時來源（a4314b5）
- [x] Task 9 示例來源（5decfd3）
- [x] Task 10 常駐任務儲存（09d882b）
- [x] Task 11 靜態檔案掃描 Vite 產物（cb0faaa）
- [x] Task 12 HTTP API、本體讀取、CSRF（45cd2c7；審查修正 39e7041）
- [x] Task 13 啟動組裝與整合測試（ba1cc47；測試埠號修正 01b014c）
- [x] Task 14 示例模式煙霧測試（2026-11-16：me、當日工時、#231 搜尋、新增 1.5h、釘上任務皆正常；缺自訂標頭與 cross-site 皆 403）

## 前端 — `docs/superpowers/plans/2026-11-16-quest-board-frontend.md`

- [x] Task 1 Vite + Svelte + Vitest 工具鏈（443c364；vite 8.3.8、svelte 5.57.3、vitest 4.1.12）
- [x] Task 2 本地日期工具（6e09ffa）
- [x] Task 3 時數、合計、進度條 action（5130580）
- [x] Task 4 API 用戶端（9cd58b1）
- [x] Task 5 像素字型與全域樣式（a78639a；Cubic 11，OFL 1.1，12px 格線）
- [x] Task 6 頂部列、布告欄、搜尋、特別任務（985b00d）
- [x] Task 7 本日已接任務（cdbca8d）
- [x] Task 8 接任務／修改視窗（e408261）
- [x] Task 9 釘上常駐任務視窗（532d02a）
- [x] Task 10 App 組裝（8ede12a；dialog 角色修正 82dfaf3）
- [x] Task 11 正式產物 CSP 下瀏覽器驗證（示例）：12/12 通過、無 CSP 違規；途中修正釘上視窗提前送出（6ed1bce）、網站圖示 404（4d27343）、窄螢幕日期列（見下一筆 commit）
- [x] Task 12 真實 OpenProject 唯讀驗證（使用者、11/16 與 11/13 工時、搜尋 202 精確編號排第一、活動清單皆與 OpenProject 一致；瀏覽器無寫入請求、無主控台錯誤；伺服器輸出無 token）
- [x] Task 13 真實寫入驗證（2026-11-16 經使用者同意於 #202：新增 2760 PT15M → 修改 PT30M（備註未變動）→ 刪除；無殘留，原有 2759 完好）
- [x] 422 訊息轉傳真實驗證（2026-11-16 經使用者同意實測：以即時模式對 #202 送出 `POST /api/time-entries`（0.5 小時、`activityId: 999999`），本機回應 422 `{"code":"validation","message":"Activity is not set to one of the allowed values."}`，訊息為 OpenProject 原文；送出前先以 `/time_entries/form` 預檢確認會被拒絕，前後當日清單一致、無殘留，伺服器 log 不含 token）
- [x] Task 14 文件收尾（handoff.md 改寫、本 Review）
- [x] HEAD（bdef2c2）即時模式瀏覽器 UI 全程重驗（2026-11-16 下午，涵蓋 e005f2a、65c0b89 之後的行為；寫入經使用者同意）
  - 前置：`npm test` 後端 85、前端 52 全過；`npm run build` 無警告。
  - 唯讀：使用者名稱、11/16（2759、2761）與 11/13（2735）工時、搜尋 `202`（#202 排第一）、#202 活動清單皆正確；缺 `X-Quest-Board`、`Sec-Fetch-Site: cross-site`、錯誤 Host 皆 403；CSP 與 CORP 標頭存在。
  - 切換日期：◀ 三次（→11/15、11/14、11/13）都先顯示「讀取中…」且合計歸零，沒有殘留前一天的工時；11/15、11/14 落定為「這天還沒有接任務」；回到今天後兩筆工時正常顯示。11/13 的 2735 只以 API 確認，未在畫面上核對（輸出被截斷）。
  - 視窗：時數 `abc` 顯示錯誤、不送出、輸入保留；任務卡帶入預設活動；[改] 帶入原時數與備註。
  - 釘上／撕下（只寫本機 `data/quests.json`）：釘上 #202（Management）→ 重新整理後仍在 → 撕下，檔案回到 `[]`。
  - 真實寫入（#202，全程經 UI）：新增 2764 0.25h（連按兩次送出只發出一個 POST）→ 改 0.5h（PATCH 200）→ 刪除；結束後 11/16 只剩 2759、2761。
  - 400／422 顯示（UI 沒有無效活動可選，無效選項是以頁面腳本塞進下拉選單，再經真實視窗送出）：字串型活動編號得本機 400「編號必須是正整數」；`activityId: 999999` 得 422，視窗內顯示 OpenProject 原文 `Activity is not set to one of the allowed values.`，視窗不關、輸入保留、無殘留。
  - 伺服器輸出只有啟動訊息，不含 token。
  - 本次未驗證：窄螢幕 400px（瀏覽器視窗無法縮小）；釘上視窗連選兩項的競態（選取後結果清單即收起，UI 上無法重現，僅有單元測試）；`write_unconfirmed`、`timeout`、`upstream_error`（需故障注入）；主控台訊息（工具未擷取到任何訊息，無法當作「確認無錯誤」的證據）。

## Review

**結果：第一階段完成，待合併到 develop。**

- 測試：後端 node --test 85 個、前端 Vitest 52 個，全數通過；`npm run build` 無警告。開發代理（`npm run dev:web`）也以同一套 12 項瀏覽器驗證確認可用。
- 驗證：
  - 示例模式正式產物在 CSP 下的瀏覽器驗證：12/12，沒有 CSP 違規或主控台錯誤；總審查修正後重跑一次，同樣 12/12。
  - 真實 OpenProject 唯讀驗證一致。
  - 經使用者同意，在 #202 做新增、修改、刪除，沒有殘留。
  - 經使用者同意，以 `activityId: 999999` 實測 422 訊息轉傳：本機回 422 `validation` 並帶 OpenProject 原文訊息，沒有殘留。
- 審查：
  - 三次專門審查：client 寫入、HTTP API、整條分支總審查。
  - 所有 Critical／Important 問題都已修正並補測試。
- 執行過程中發現並修正的問題：
  - client 寫入成功但回應無法解讀時誤判為失敗（新增 `write_unconfirmed`）。
  - 測試伺服器偶發拿到 fetch 封鎖的埠號（`tests/support/ports.mjs`）。
  - 釘上視窗點選搜尋結果會直接送出表單（搜尋結果按鈕缺 `type="button"`）。單元測試沒抓到，是瀏覽器驗證抓到的。
  - 缺少網站圖示導致 404；窄螢幕日期列斷行。
  - 切換日期或讀取失敗時顯示前一天的工時；建立後回應解析失敗或 5xx 被當成確定失敗（重送會重複）。
- 刻意未做（留待後續）：
  - 欄位層級的錯誤顯示。
  - 跨午夜自動更新「今天」。
  - 計時器、週曆、月曆、排序。
- 使用者決定：字級維持 12px（字型設計格線），標題與合計 24px。

