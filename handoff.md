# Dashboard 工作交接

最後更新：2026-10-27（Asia/Taipei）
目前階段：第一～三階段已完成；第四階段（OpenProject adapter）離線部分（Task 1–6）已完成並提交於 `feature/openproject-adapter`（基於 `feature/3d-frontend`；所有功能分支皆未合併至 master）。下一步為 Task 7 真實來源驗證，需要使用者自建 API token 填入 `config/local.json`。

## 最新接續摘要
- 使用者最後要求「記錄到 handoff」，本次僅更新交接；這不代表已批准設計或開始實作。
- 已完成：基本環境診斷、開發路線、第一階段完整程式碼與測試計畫。計畫中的程式碼尚未建立為產品檔案，8 個產品測試尚未執行。
- 環境目前可用：工作區讀寫、Node REPL、本機 HTTP，以及經工具核准的 npm 下載／安裝／載入均通過。原先沙箱初始化錯誤目前無法重現，恢復原因仍未確定；不要重複宣稱永久修復。
- OpenProject API 經核准連線回傳 401，來源可達但未驗證登入。未持有可用 API token，未建立私有設定，不能宣稱真實串接完成。
- 下次先確認使用者是否同意現有設計與計畫；若已明確同意，直接接續第一階段，不重做環境診斷或重複要求相同批准。
- 實作前確認 Git 實際狀態：目前 master 尚無提交，文件未追蹤；開發分支／隔離工作區尚未建立。.git 為受保護路徑，透過允許工具處理，禁止修改 ACL 繞過限制。

## 接續時先讀
1. 本文件。
2. `docs/superpowers/specs/2026-10-25-openproject-universe-design.md`。
3. `docs/superpowers/plans/2026-10-26-dashboard-roadmap.md`。
4. `docs/superpowers/plans/2026-10-26-dashboard-foundation.md`。
5. `git status` 與最近提交，確認是否有新變更；無提交時 `git log` 失敗不代表儲存庫損壞。

## 已確認
- 唯讀 OpenProject Dashboard，第一版本機執行，保留內網部署擴充性。
- 專案為星系；Work package 為星球，不是活動紀錄。
- 3D 星系總覽、單一星系、全宇宙展開；全部支援旋轉、平移、縮放。
- 點選星球顯示 Subject、Author 等詳情與 OpenProject 連結。
- 依 Status 著色並有圖例。
- 選取時顯示參與者太空船與名字：建立者、目前負責人、歷史留言或更新者，按使用者 ID 去重。
- 每 60 秒自動更新，加上手動更新；保留視角與選取。
- 已認可靜態配置與前後端分工架構。
- 使用者要求持續維護此 handoff，方便隔天接續。

## 已完成產物
- 完整設計：`docs/superpowers/specs/2026-10-25-openproject-universe-design.md`。
- `.gitignore` 排除 `config/local.json`、環境機密與 `.superpowers/`。
- 本機草圖：`.superpowers/brainstorm/universe-design/content/layout-v1.html`，示例資料、靜態畫面，未實作 3D。
- 草圖伺服器曾使用 http://localhost:59278 ，隔天可能已停止；檔案仍保留，可直接開啟靜態草圖。

## 阻礙與未驗證
- 本機工具連線至來源 `/api/v3` 遭環境通訊端權限拒絕，尚未登入或驗證公司 OpenProject 版本、欄位、資料規模及 API 驗證方式。
- 官方 API token 驗證與網站帳密不同，不能假設提供的帳密可直接呼叫 API。
- 使用者已於對話提供登入資訊；禁止複製至此檔或設計文件。目前尚未將機密寫入 config；實作時僅存本機忽略檔，若無法取得既有對話機密，請使用者直接在本機填入。
- 尚無產品程式、依賴、建置或測試結果，不可宣稱產品完成。

## 下一步
1. 請使用者審閱完整設計文件；先前的「ok」是同意架構與撰寫文件，並非尚未產生文件的審閱結果。
2. 文件獲同意後使用 `superpowers:writing-plans` 建立實作計畫。
3. 以允許的工具完成真實來源連線及驗證方式確認，不繞過權限限制。
4. 依核可計畫實作、驗證，隨里程碑更新此檔。

## 驗證紀錄
- 靜態草圖 HTTP GET 曾回傳 200；尚未做瀏覽器視覺自動驗證。
- 設計自我審閱：已檢查範圍、資料對應、參與者去重、分頁、錯誤處理、機密邊界與內網擴充限制。
- Git 提交結果以實際 `git log` 為準；不在此預填提交成功。

## 2026-10-26 執行環境診斷
- 一般沙箱指令及 Node REPL 都在啟動前失敗：helper_unknown_error: setup refresh had errors。
- 已查閱當日 .codex/.sandbox 日誌，具體失敗為對 D:\working\Dashboard\.git 設定 deny ACE 時，READ_CONTROL / WRITE_DAC 或 SetNamedSecurityInfoW 回傳 Windows error 5（存取被拒）。尚未確定造成 ACL 更新被拒的更底層原因。
- 經工具審核允許，以 require_escalated 執行唯讀 PowerShell 成功；已讀取專案、設計文件及 Git 狀態。後續必要指令可按工具審核流程執行，不需反覆要求使用者重新開啟工作階段。
- 未修改或移除 .git 保護 ACL，未關閉全域沙箱。這是可用的執行替代方式，不代表沙箱本身修復。
- Git 目前 master 尚無提交；.gitignore、docs/、handoff.md 為未追蹤檔案。產品實作尚未開始。

## 2026-10-26 接續檢查
- 本次一般沙箱 PowerShell 已可執行；Node v25.8.0、npm 11.11.0 可用。僅確認本次結果，未修改 ACL，也不推定底層問題已永久修復。
- 一般沙箱連線來源仍遭通訊端存取權限拒絕；經工具審核允許的唯讀連線取得 HTTP 401，Content-Type 為 application/hal+json，OpenProject 回報 Unauthenticated。已確認來源可達及需要驗證，尚未登入，也未確認版本與資料欄位。
- 目前對話未提供可用 API token；未建立或儲存憑證。後續應由使用者在本機私有設定填入，勿在交接文件留下機密。
- 已向使用者釐清本次接續範圍：依既有設計開始實作，或繼續執行環境診斷；尚未收到選擇。產品程式尚未開始。

## 2026-10-26 環境診斷結果（使用者已確認診斷範圍）
- 沙箱日誌顯示 22:19:31（台北時間）仍因 .git 的 SetNamedSecurityInfoW error 5 失敗；22:25:40 已成功 applied deny ACE，之後多次 setup refresh 為 errors=[]。目前無法重現原先啟動失敗；尚無證據判定其恢復的底層原因，未變更 ACL。
- 本次已實測工作區建立、讀取、移除臨時檔成功；Node HTTP 服務監聽 127.0.0.1 隨機連接埠及同程序 fetch 成功（200:ok），測試服務已關閉，臨時檔已移除。
- Node REPL 可正常執行 JavaScript（node_repl_ok 2）；初次探測使用未公開的 process 全域造成 ReferenceError，改用純 JavaScript 後成功，並非 sandbox helper 啟動錯誤。
- Node v25.8.0、npm 11.11.0、Git 可啟動；git status 可讀，仍有使用者全域 ignore 路徑讀取權限警告。未測試套件安裝或 Git 寫入；本工作階段 .git 明列唯讀保護。
- 沙箱到 OpenProject 的網路請求遭拒，符合目前 restricted network 設定；經核准的相同唯讀來源檢查取得 401 Unauthenticated。來源服務可達，下一個串接前置條件為 API 驗證，不是修復來源網路。
- 日誌另有隱藏 C:\Users\Default 屬性時的 error 5 警告，但同輪命令成功；尚未調查該警告的成因，不能將它視為本次命令執行的阻斷原因。
- 結論：本機讀寫與本機服務開發的基本能力目前可用。保留既有權限設定，網路及受保護寫入依工具審核流程處理；無需為本次診斷停用沙箱或修改保護 ACL。
- 官方參考：https://learn.chatgpt.com/docs/windows/windows-sandbox

## 2026-10-26 補充診斷：Git 與 npm
- Git 全域 ignore 路徑在一般沙箱中不可讀；經核准的唯讀對照確認檔案存在，且相同 git status 無警告。判定此警告與沙箱存取邊界有關，並非檔案遺失或 repository 損壞證據。未修改全域 Git 設定。
- npm registry 在一般沙箱中遭通訊端拒絕；經核准對照 GET https://registry.npmjs.org/-/ping 回傳 200。
- 經核准，在工作區隨機獨立暫存目錄，以目錄內專用 cache 安裝 is-number@7.0.0，使用 --ignore-scripts --no-audit --no-fund --package-lock=false。安裝 1 個套件成功，Node 載入並驗證有效／無效輸入成功，程序 exit 0。
- 測試暫存目錄經絕對路徑檢查後已移除（probe_cleaned=True），未新增專案依賴、未更新 Node/npm，亦未修改 .git 權限或進行 Git 寫入。
- 基本開發流程已驗證：命令執行、工作區讀寫、Node REPL、本機 HTTP，以及經核准的 npm 下載／安裝／載入。此結果不等於 Dashboard 建置或 OpenProject 驗證成功。
- 診斷無需進一步變更系統設定；原先初始化失敗的恢復原因仍未確定。產品實作與 API 憑證設定留待後續工作。

## 2026-10-26 接續產品規劃
- 使用者要求「繼續其他工作」後，已返回 Dashboard 工作，完成兩份可審閱文件：
  - docs/superpowers/plans/2026-10-26-dashboard-roadmap.md：六階段路線、前後端契約、檔案責任、完整性與驗收條件。
  - docs/superpowers/plans/2026-10-26-dashboard-foundation.md：第一階段設定、參與者、穩定位置／色彩的逐步測試與完整程式碼計畫。
- 技術方向：Node ESM + 瀏覽器 JavaScript + Three.js；第一階段不需外部依賴。尚未安裝產品依賴或建立產品程式，計畫中的 8 個測試尚未執行。
- 已查閱官方 OpenProject API 驗證／工作項目文件與 Three.js OrbitControls；公司版本及真實 API 資料仍未核對。
- 已自查規格覆蓋：三種視圖、船隻、分頁、每 60 秒更新、選取保留、私有設定、錯誤與真實驗收均有對應階段。第一階段僅涵蓋資料基礎，不代表產品完整計畫已逐檔展開。
- 下一步：使用者審閱既有完整設計與本輪計畫後，依基礎計畫開始實作；工作區仍在無提交 master，先依允許工具處理開發分支／隔離與基準，禁止變更 ACL。

## 2026-10-26 資料基礎階段（第一階段）
- 使用者於本次明確選擇「核准並開始第一階段」，設計文件、路線與 foundation 計畫視為已核准。
- 使用者要求：回覆與紀錄一律使用繁體中文。
- Git：文件基準已提交於 master（3df5d57），隨後建立 `feature/foundation` 分支實作。本次 Git 寫入可正常執行，未修改 ACL。
- 已建立：`server/config.mjs`、`shared/participants.mjs`、`shared/layout.mjs`、`config/example.json`、`package.json`、`tests/{config,participants,layout}.test.mjs`，內容依 foundation 計畫。
- 測試先行：先執行確認三個測試檔皆因 ERR_MODULE_NOT_FOUND 失敗，實作後 `npm test`：8 個測試通過、0 失敗（Node v25.8.0）。
- `git check-ignore config/local.json` 輸出該路徑，私有設定忽略規則已驗證。未建立 config/local.json，未使用任何真實 token。
- 計畫中的規格／程式碼品質審查：程式碼與已核准計畫逐字一致，僅做自我核對，未另派審查代理。
- 尚無 HTTP 服務、3D UI 或真實 OpenProject 資料串接；真實 API 仍為 401、未取得 token。
- 下一步：依 dashboard-roadmap 撰寫第二階段（loopback 示例服務、示例資料、統一 JSON 介面）測試先行計畫，經使用者確認後實作。

## 2026-10-26 第二階段計畫
- 使用者要求開始撰寫第二階段計畫；已完成 `docs/superpowers/plans/2026-10-26-dashboard-demo-service.md`，等待使用者審閱。尚未實作、尚未提交此計畫。
- 範圍：示例資料來源（server/demo.mjs）、loopback HTTP（server/http.mjs）、啟動入口（server/index.mjs）、暫時頁面（client/index.html）；預計測試總數 22。
- 主要決策：資料來源介面 `getSnapshot`／`getParticipants` 供第四階段 adapter 替換；Host 白名單防 DNS rebinding；靜態檔以完整路徑白名單比對；500 不回傳例外內容；live 模式在 adapter 完成前拒絕啟動，不退回示例。
- 實作時從 `feature/foundation` 建立 `feature/demo-service`。

## 2026-10-26 本機示例服務（第二階段）完成
- 使用者核准第二階段計畫並選擇子代理執行。分支 `feature/demo-service`：d89d380（計畫）→ a8b78bd（示例資料）→ 3951a88（HTTP）→ 34bcf3e（入口／暫時頁面）→ b6764a5（審查修正）。
- 每個任務由子代理依計畫測試先行實作；主控以腳本核對程式碼與計畫逐字一致。規格審查由主控逐字比對完成，程式碼品質審查改為整個階段一次（審查代理），非每任務各一次。
- 品質審查結論：附修正後核准，無 Critical。已修正：只接受 origin-form 路徑（`//x`、絕對形式、反斜線回 400）；500 時僅記錄方法／路徑／錯誤名稱，不記錄訊息與堆疊；靜態白名單搭配誘餌檔測目錄穿越；新增實際啟動入口測試；Host 比對不分大小寫；缺 Host（HTTP/1.0）回 403 有測試；HEAD 404 測試；關閉時 2 秒逾時保險。
- 驗證：`npm test` 25 個測試通過、0 失敗。煙霧測試（`npm run demo` 同等指令）：health/首頁/snapshot 200（demo、4 個工作項目、3 個專案），`/config/example.json` 404，POST 405；關閉後 4173 不再監聽。`config/local.json` 忽略規則仍有效。
- 啟動方式：`npm run demo`（讀 config/example.json，demo 模式）→ http://127.0.0.1:4173/ 。`npm start` 讀 config/local.json；live 模式目前明確拒絕啟動，不退回示例。
- 留給第四階段：`GET ?refresh=1` 可被跨站網頁盲目觸發（無法讀回應），adapter 需合併／限流刷新或檢查 `Sec-Fetch-Site`。
- 尚無 3D 前端與真實 OpenProject 串接；API 仍未取得 token。
- 下一步：撰寫第三階段（3D 前端）測試先行計畫，含 Three.js 確切版本與本機 vendor 方式（CSP 為 `default-src 'self'`），經使用者確認後實作。

## 2026-10-27 3D 前端（第三階段）完成
- 使用者要求「寫第三階段計畫，完成後直接執行」。計畫：`docs/superpowers/plans/2026-10-27-dashboard-3d-frontend.md`（8fe446f）。分支 `feature/3d-frontend`。
- 提交：55a8320 配置純函式 → ac6fc5d view-model → 886ef94 store → ccdf2d5 Three.js 前端 → 2808e86 白名單／CSP → 0f4dfa5 瀏覽器驗證修正 → c5a2c5a 審查修正。
- 技術決定：`three@0.170.0`（確切版本、package-lock，build/three.module.js 為單檔）。由 `/vendor/...` 白名單提供，不用 CDN。頁面以 import map 對應 `three`，CSP 為 `default-src 'self'` 加上 import map 的 sha256（換行先正規化為 LF），另含 `base-uri`／`form-action`／`frame-ancestors 'none'`。`node_modules/` 已忽略。
- 執行方式：Task 1–5 由子代理依計畫逐字實作，主控以腳本核對與計畫一致；整個階段做一次品質審查（附修正後核准，無 Critical）。
- 瀏覽器驗證：Chrome 擴充工具不可用（使用者未完成安裝），改用無頭 Chrome + DevTools 協定腳本（存放於當次 scratchpad，未納入 repo）。34/34 通過，涵蓋：
  - 星系與圖例、真實滑鼠點選星系與星球、太空船出現與替換、HTML 描述以純文字顯示。
  - 未指派、同名不同 ID、未完整名單、未知狀態；全宇宙保留選取、切換專案解除選取。
  - Esc、鍵盤 Enter 與焦點保留、旋轉／縮放／平移／重設視角、主控台無錯誤與 CSP 違規、停用 WebGL 時顯示提示。
- 驗證中發現並修正：`/favicon.ico` 404（新增 `client/favicon.svg` 白名單）；單一星系星球擠在核心旁（星球分布 ×2、核心縮小、鏡頭拉遠、標籤距離 140）。
- 審查後修正：選取時星球仍在分批佇列中，建立後補上太空船；選取星球消失時移除太空船；太空船跟隨星球即時位置；畫面錯誤不再誤報為參與者載入失敗；佇列去重；右鍵／中鍵不觸發點選；CSP 換行正規化與強化指令。
- 驗證結果：`npm test` 45 通過、0 失敗；瀏覽器驗證 34/34。
- 未驗證：上述「星球仍在佇列中」與「星球消失」兩項修正在示例資料（4 筆）中無法觸發，只經程式碼審查，尚無自動化測試。
- 執行：`npm install`（首次）後 `npm run demo` → http://127.0.0.1:4173/ 。
- 延後項目（審查提出，屬後續階段）：
  - 第五階段：每 60 秒更新時避免整份清單與專案選單重建（開啟中的下拉選單會被關閉）。
  - 第六階段：大量星球時每幀標籤距離計算與 CSS2D 成本；清單虛擬化。
  - 第四階段：正規化後 `status` 必為非 null（scene／legend 依賴此契約）；`refresh` 需合併或限流。
  - 次要：Esc 後焦點回到清單、`hasWebGL` 測試用 context 未釋放、飛行與阻尼殘留漂移。
- 下一步：第四階段 OpenProject adapter。需要使用者在 OpenProject 個人設定建立 API token，並自行填入 `config/local.json`（不要貼在對話中）；實作前先撰寫測試先行計畫，以本機假來源測試分頁與錯誤碼。

## 2026-10-27 第四階段計畫
- 已完成 `docs/superpowers/plans/2026-10-27-dashboard-openproject-adapter.md`，使用者已批准並要求以子代理執行（結果見下節）。分支 `feature/openproject-adapter`（基於 `feature/3d-frontend`）。
- 分層設計：
  - `server/openproject/client.mjs`：唯一持有 token；只發 GET、只送往同來源 `/api/v3`、不跟隨重新導向；逾時 10 秒；429/502/503/504 重試 2 次；併發上限 4；分頁跟隨 `nextByOffset`，並檢查重複與筆數。
  - `normalize.mjs`：HAL 轉契約；群組與佔位使用者的 ID 加前綴。
  - `snapshot.mjs`：一般請求快取 30 秒、刷新至少間隔 10 秒、同時請求共用一輪、失敗時保留舊資料並標為過期。
  - `activities.mjs`：以 `updatedAt` 為快取鍵；沒有 `updatedAt` 時 TTL 60 秒；缺名字時查使用者並快取。
- Task 1–6 完全離線，用本機假 OpenProject 測試；預計共 67 個測試。Task 7 為真實驗證，需要使用者自建 API token 填入 `config/local.json`。
- 待真實伺服器確認的 API 假設：分頁 offset 為頁碼、需送 `filters=[]` 才含已結案項目、活動 user 連結是否有 title、狀態是否有 color。

## 2026-10-27 第四階段離線實作結果（Task 1–6）
- 提交（`feature/openproject-adapter`）：`14aaeaa` client、`a85bee0` normalize、`2c81769` snapshot、`bbf6906` activities、`681982f` live 接線與前端提示、`1186401` 審查修正。
- 計畫程式碼逐字比對一致（Task 5 的 main.mjs 為局部修改，已人工核對 diff）。
- 驗證：`npm test` 71 個通過、0 失敗（計畫的 67 個加上審查修正新增的 4 個）；示例模式無頭 Chrome 檢查 34/34 通過，沒有退化；`git grep "apikey:"` 只出現在 client、測試與計畫文件；`config/local.json` 不存在且被 Git 忽略。
- 品質審查沒有 Critical。已修正：
  - I1：查使用者名稱遇到暫時性錯誤（逾時、限流、5xx）時不再永久快取；只有 403／404 記住結果；有暫時性漏名時不快取參與者結果。
  - I2：分頁筆數與 total 不符或 id 重複（讀取期間資料變動造成頁面位移）時整輪重讀一次，仍不一致才回報 `pagination_incomplete`。
  - I3：快取與刷新間隔改從上一輪「完成」時間起算，避免載入超過 10 秒時可連續觸發全量載入。
  - M1 部分：讀取回應內容時連線中斷改報 `network`，只有 JSON 解析失敗才報 `invalid_response`。
- 延後項目（審查 Minor／效能）：
  - 逾時與網路錯誤不重試。
  - Retry-After 不支援 HTTP-date 格式。
  - 參與者快取沒有上限，同一項目的請求沒有合併，參與者的 `refresh` 沒有限流。
  - snapshot 其中一個集合失敗時，其他請求不會取消。
  - 參與者 id 有前導零時會產生不同的快取鍵。
  - 效能（第六階段）：全量讀取 `description.raw`，大量資料時一輪可能超過 30 秒；快照每次重新序列化；沒有回應大小上限。
  - 安全取捨：baseUrl 為 http 時，token 以 Basic 在內網明文傳送。
- 下一步（Task 7，需要使用者）：
  1. 在 OpenProject「我的帳號 → 存取權杖」建立 API token。
  2. 把 `config/example.json` 複製為 `config/local.json`，`mode` 改為 `"live"`，填入 token。不要貼到對話中。
  3. 由主控經工具審核連線 `192.168.31.13`，只輸出統計，並逐項確認上述 API 假設。

## 2026-10-27 第四階段真實來源驗證（Task 7）
- 使用者已建立 `config/local.json`（Git 忽略）；主控只把 `mode` 改為 `live`，token 未讀出、未輸出。服務以 `npm start` 啟動，啟動訊息為「即時模式已啟動」。
- 統計：專案 5 個、工作項目 362 個、狀態 16 個；`complete: true`、`error: null`；首次載入約 8 秒。無負責人 87、群組負責人 1、無 `updatedAt` 0。參與者抽查（最新更新的項目）3 人、`complete: true`、沒有未知使用者。
- API 假設逐項確認：
  - offset 是頁碼：`offset=2` 回傳第 2 頁 100 筆，下一頁為 `offset=3`。✅
  - 必須送 `filters=[]`：預設篩選 251 筆，空篩選 362 筆；包含 111 個已結案項目。✅
  - 活動的 user 連結**沒有 title**（抽 15 項、24 筆皆無）；`/api/v3/users/{id}` 可讀，因此名字由查詢補上。✅
  - 16 個狀態都有 color。✅
  - API 根資源沒有提供 `coreVersion`（非管理員帳號），instanceName 為 SoftwareOpenProject。
- 待使用者：在瀏覽器與 OpenProject 網頁核對至少一個專案、一個項目的標題、狀態、建立者、負責人，至少一位活動參與者，以及「在 OpenProject 開啟」連結。
- 觀察：首次載入約 8 秒，期間頁面沒有載入提示以外的進度；列入第五／六階段（輪詢、效能）考量。
- 2026-10-27 使用者已在瀏覽器核對專案、項目、參與者與 OpenProject 連結，回覆「正確」。第四階段完成。
- 使用者新增畫面需求（待規劃）：星球標籤只顯示 ID；宇宙背景更真實並加入遠處各類星系；星球本體更真實。
