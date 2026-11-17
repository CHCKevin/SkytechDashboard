# 任務布告欄 — 第一階段（My time tracking）

設計：`docs/superpowers/specs/2026-11-16-quest-board-time-tracking-design.md`
分支：`feature/quest-board`（已合併到 `develop`，PR #1，分支已刪除）

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


---

# 公會大廳 — 第二階段

設計：`docs/superpowers/specs/2026-11-17-guild-hall-design.md`
計畫：`docs/superpowers/plans/2026-11-17-guild-hall.md`
分支：`feature/guild-hall`（從 `develop` 開出，基底是 PR #1 的合併 commit）

- [x] Task 1 設定 leaveWorkPackageId（84f79d1）
- [x] Task 2 json-store 與成員名單儲存（a5b21e8）
- [x] Task 3 狀態判定純函式（613b4bc）
- [x] Task 4 真實來源的三個唯讀方法（891fc50）
- [x] Task 5 示例來源（f641cd5；示例使用者增為 18 位，才能驗證 16 人滿座）
- [x] Task 6 輸入驗證與本機 API（6d79d21）
- [x] Task 7 前端純函式與 API 用戶端（6c70c22）
- [x] Task 8 頁籤與 QuestTab（4e0de53；原有 App 測試斷言未修改）
- [x] Task 9 像素繪製元件與大廳場景（c88986f）
- [x] Task 10 成員面板與招募視窗（e3d99fa）
- [x] Task 11 組合 HallTab（72dbfc8）
- [x] Task 12 示例模式瀏覽器驗證（2026-11-17，正式產物、真實 CSP，埠號 4183；途中修正見 baafee3）
  - 通過：預設在任務欄；切到大廳後 5 位預設成員各有造型；請假者在沙發顯示休息、有工時者在工作桌顯示工作中、沒工時者在吧檯顯示發呆；點成員顯示工時與合計、返回；招募（已在大廳者不可選）；請離（取消則不動作）；切換日期先顯示讀取中、前一天全員發呆坐吧檯；在任務欄新增 1.5h 後大廳本人合計由 3.5h 變 5h；招募到 16 位全部有位子、第 17 位回 409 hall_full、按鈕停用並顯示「大廳已滿」；鍵盤 Tab 聚焦與 Enter 選取；沒有 CSP 違規事件、沒有未處理錯誤、頁面沒有 style 屬性。
  - 任務欄回歸：釘上、任務卡帶入預設活動、`abc` 時數被擋、接任務、修改、刪除、切換日期、撕下，皆正常。
  - 窄螢幕：瀏覽器視窗無法縮小，改以「把 800px 以下的 CSS 規則強制套用、容器限制 380px」模擬：單欄、沒有元素超出、16 位角色互不重疊。**真實窄視窗未驗證。**
  - 主控台訊息：工具擷取不到，改以頁面內監聽 securitypolicyviolation、error、unhandledrejection 事件確認為零。
- [x] Task 13 即時模式唯讀驗證（2026-11-17，埠號 4184、暫存資料目錄；未動使用者自己在 4173 的伺服器與 `data/`）
  - 搜尋英文與中文名稱皆有結果；加入 5 位成員、加入不存在的使用者回 404。
  - 11/16：4 位工作中、1 位發呆，各人筆數與直接查 OpenProject 一致；11/11：2 位當日有 #200 的成員顯示休息（其中一位同日另有其他工時），其餘工作中；11/17：全員發呆。
  - 瀏覽器：場景座位與狀態相符；休息成員的面板列出含 #200 的工時、沒有修改或刪除按鈕；經 UI 招募 1 位再請離。
  - 網路請求中的寫入只有 `POST /api/hall/members` 與 `DELETE /api/hall/members/{id}`（只寫本機檔）；沒有對 OpenProject 的寫入。伺服器輸出只有啟動訊息、不含 token。
  - 驗證用的成員名單與含 token 的暫存設定檔已刪除；`data/hall.json` 未建立，大廳從空的開始。
- [x] Task 14 文件收尾

## Review（第二階段）

**結果：公會大廳完成，已合併到 `develop`（PR #2）。**

- 測試：後端 node --test 120 個、前端 Vitest 122 個，全數通過；`npm run build` 無警告。
- 沒有新增任何對 OpenProject 的寫入；`server/openproject/client.mjs` 未修改。
- 執行過程中發現並修正的問題：
  - 狀態圖示太小、在木地板上看不清楚 → 放大並畫在淺色小牌子上。
  - 單人沙發太窄，名牌超出；請離大廳的確認訊息用了性別代名詞。
- 審查（整條分支，專門的審查代理）：沒有 Critical／Important 問題，7 項 Minor。
  - 已修正並補測試：缺使用者連結的工時會讓整個大廳讀取失敗；成員檔內容未檢查；請離後重新讀取失敗時成員仍留在場景；橫幅跨頁籤殘留；成員上限常數重複。
  - 未修正，記為已知限制：第一次讀取失敗後，每次自動更新都會短暫顯示「讀取中…」；切換頁籤會重新掛載並重讀該頁籤的資料；token 權限不足以看到某人工時時，該成員會顯示發呆而不是「無法讀取」。
  - 審查修正後重跑自動測試（後端 120、前端 122）與建置，全數通過；修正後以示例模式做了一次簡短的瀏覽器冒煙測試（載入、切到大廳、請離一位成員、切回任務欄），沒有 CSP 違規或錯誤；完整的 13 項與即時模式沒有重跑。
- 與設計的差異：
  - 設計寫「沒人的位子只顯示空的家具」，實作在吧檯與工作桌的空位畫了小椅子，沙發空位不畫。
  - 場景中的名牌顯示名稱最後一段（去掉「部門 - 」前綴），全名在面板與無障礙名稱中。
  - 面板標題顯示短名，全名在標題下方。
- 仍未驗證：真實窄視窗；`getHall` 逾時與 5xx 的畫面（只有自動測試）；跨午夜時「今天」不會自動更新（第一階段既有限制）。
- 刻意未做：自訂造型、拖曳換位子、走路動畫、超過 16 人、在大廳替別人記工時。

---

# 第三階段：像素畫面優化（研究）

分支：`feature/pixel-art-research`（從 `develop` 開出）。本次只做研究與規格，不修改既有程式。

- [x] 現況調查：繪製方式、尺寸、視角、資產、縮放、限制（01 第一部分）
- [x] 參考研究：Tiny Pixel Farm 商店截圖兩張（只在瀏覽器檢視，未下載）、Slynyrd Pixelblog 1／35／47、MDN（01）
- [x] 產生技術比較，四種做法（02）
- [x] 風格規格提案（03）
- [x] 系統架構提案（04）
- [x] 實作路線與待決定事項（05）
- [x] 驗收標準：自動檢查與人工審查分開（06）
- [ ] 使用者回覆 05 的 9 個待決定事項
- [ ] 第 1 階段：引擎與四個原型資產

## Review（第三階段研究）

- 建議做法：以「字元格部件樣板」為主體，顏色、外框、木紋、落影由引擎依風格規格統一套用；AI 只當開發時的選用起稿工具，第一版不做。
- 引擎用純 JavaScript，不用 C#/.NET：角色要在瀏覽器即時產生，同一份程式要給瀏覽器、Node 工具、測試共用。
- 量測與推論的界線：Tiny Pixel Farm 的原生解析度與角色尺寸是由商店截圖推算的估計值，沒有官方資料；室內家具與動畫在截圖中看不到，沒有下結論。
- 未讀到原文、沒有當作依據：美國著作權局 AI 報告第二部分的結論、PixelLab 價格、Retro Diffusion 完整條款、跨影格一致性的獨立比較。
- 審查後修正（同一天）：調色盤上限由 48 改為 128（原本的色階表就需要約 95 色）；落影改為獨立圖層，外框檢查不含落影；家具頂面比例改標為提案；補看其餘商店截圖（共 10 張）；補上窄螢幕放不下與座位前後遮擋兩個待決定事項。

## 第三階段：決定與實作（2026-11-17）

使用者回覆「照建議做」：`docs/pixel-art/05-implementation-roadmap.md` 的 9 個待決定事項全部採用建議值。

第 1 階段：引擎與四個原型資產（正式畫面不變）
- [x] `web/src/art/random.js`：決定性亂數（由 `sprite.js` 搬出，`sprite.js` 改為引用）
- [x] `web/src/art/style.js`：色階定義（HSB）、調色盤、規則；測試 P1–P5
- [x] `web/src/art/engine.js`：圖例上色、木紋、自動外框、獨立落影層、合併、指紋
- [x] `web/src/art/validate.js`：A1、A2、A4–A8
- [x] `web/src/art/assets/`：人物（坐姿 16×24，沿用 `lookFor` 的抽選）、木椅、木桌、盆栽
- [x] `web/src/art/cases.js` 與 `golden.json`：黃金指紋
- [x] `tools/art/png.mjs`：索引色 PNG；`tests/art-png.test.mjs`

第 2 階段：目錄
- [x] `tools/art/catalog.mjs`、`npm run art:catalog`、`art-out/` 加入 `.gitignore`
- [x] 產出單一資產 PNG、組合場景、16 人並排、`catalog.json`、`index.html`
- [ ] 使用者依 `06` 的 H1–H9 審查目錄（`npm run art:catalog` 後開 `art-out/index.html`）

驗證（2026-11-17）：
- 測試：後端 node --test 123（新增 PNG 匯出 3 個）、前端 Vitest 260（新增像素引擎 138 個），全數通過；`npm run build` 無警告。大廳尚未引用新引擎；正式產物只多了 `sprite.js` 改為引用的 `web/src/art/random.js`（行為不變）。重新建置後，使用者自己在 4173 的伺服器要重啟。
- `npm run art:catalog`：17 個樣本、4 張組合預覽，驗證問題 0。在瀏覽器檢視 index.html：1×／2×／3× 邊緣銳利，16 人看得出不同，桌子遮住後方人物的下半身。
- 人物：1000 位使用者 × 3 種狀態全部通過驗證；抽選結果與現行 `lookFor` 完全相同。
- 途中修正：盆栽樣板有 4 處孤立像素（驗證器抓到後改樣板）；孤立像素的定義改為「四鄰都是物件本體」，貼著外框的單一像素不算。
- 尚未做：動畫（第 4 階段）、換上大廳（第 3 階段，等審查通過）。
