# OpenProject 宇宙 Dashboard 執行路線

日期：2026-10-26。這是實作拆分與驗收規劃，不是產品完成紀錄。

## 決策與前置條件

- 延續既有設計：唯讀、本機服務、三種 3D 視圖、狀態著色、選取後的參與者太空船。
- 採 Node.js ESM 後端、瀏覽器 JavaScript、Three.js 與 OrbitControls。先不引入前端框架；場景、資料狀態、DOM 面板分離，降低初版複雜度。
- Node、npm、本機 HTTP 與經核准的套件安裝已實測可用。外部套件在安裝時固定確切版本並保留 lockfile，不把本機 Node 25 當作部署版本承諾。
- 完整設計文件仍需使用者審閱。這份路線與第一階段詳細計畫供同次審閱；尚未建立產品程式。
- 真實 API 已取得 401，未取得版本、可見資料或 token。示例模式可獨立驗收，但不能替代真實串接驗收。
- Git 尚無提交且 .git 在目前工作階段為唯讀保護；執行時依允許的 Git 工具建立開發分支／隔離工作區，保留原有未追蹤文件。不得修改 ACL 來繞過此限制。

## 階段與完成條件

| 階段 | 交付內容 | 驗證與完成條件 |
|---|---|---|
| 1 資料基礎 | 私有設定驗證、參與者去重、穩定位置及色彩函式 | 不需網路的 Node 測試通過；詳細步驟見同目錄 foundation 計畫 |
| 2 本機示例服務 | loopback HTTP、明確標示的示例資料、統一 JSON 介面 | 請求僅允許 GET/HEAD；config 與原始機密不可作為靜態檔讀取；空資料和錯誤回應驗證 |
| 3 3D 前端 | 總覽／單一星系／全宇宙、詳情面板、船隻、圖例 | 瀏覽器確認旋轉／平移／縮放／返回／重設；鍵盤可操作的專案與項目清單；無 WebGL 提示 |
| 4 OpenProject adapter | token 驗證、分頁、欄位轉換、活動歷史、快取 | 本機假來源測試跨頁、401/403/404/429/5xx、逾時、惡意分頁連結；真實驗證另列 |
| 5 更新與完整性 | 60 秒輪詢、手動更新、漸進載入、保留視角選取 | 無重疊請求、切換競態、失敗保留舊資料、完整性提示、刪除解除選取測試 |
| 6 整合交付 | 操作說明、啟動命令、唯讀來源核對、效能紀錄 | 全部測試及建置通過；真實核對至少一個專案／項目／參與者；未取得憑證時明列未完成 |

## 檔案責任

```text
config/example.json              無機密設定範例
config/local.json                使用者本機設定，Git 忽略
server/config.mjs                私有設定讀取與驗證
server/http.mjs                  loopback HTTP 路由與靜態檔白名單
server/index.mjs                 啟動與關閉服務
server/demo.mjs                  明確的合成示例資料
server/openproject/client.mjs    GET、驗證、逾時、重試、同來源分頁
server/openproject/normalize.mjs 原始 HAL 轉成前端統一模型
server/snapshot.mjs              完整快照、進度及最後成功資料
server/activities.mjs            活動歷史快取與完整性
shared/participants.mjs          依 ID 去重與不明身分處理
shared/layout.mjs                由 ID 決定的位置與色彩
client/index.html               頁面結構
client/main.mjs                 啟動、面板、導覽、錯誤呈現
client/store.mjs                快照／選取／更新狀態，拒絕過時回應
client/scene.mjs                Three.js 場景、raycast、OrbitControls
client/ships.mjs                選取項目的船隻與標籤生命週期
client/styles.css              深色桌面配置與窄螢幕退化
tests/                         Node 單元與本機 HTTP 整合測試
tests/browser/                 端到端互動與畫面檢查
README.md                      安裝、示例啟動、來源設定、限制
```

## 前後端契約

所有 ID 於正規化後使用字串，缺漏使用 null。未知狀態名稱為「未知狀態」；一般缺漏欄位由前端顯示「未提供」。原始 HTML 不直接注入頁面。

```ts
type Person = { id: string | null; name: string };
type Project = { id: string; name: string };
type Status = { id: string | null; name: string; color: string };
type WorkPackage = {
  id: string; projectId: string; subject: string;
  author: Person | null; assignee: Person | null;
  status: Status; description: string | null;
  updatedAt: string | null; url: string | null;
};
type Snapshot = {
  mode: 'demo' | 'live'; revision: string;
  projects: Project[]; workPackages: WorkPackage[]; statuses: Status[];
  complete: boolean; stale: boolean; lastSuccessAt: string | null;
  progress: { loaded: number; total: number | null };
  error: null | { code: string; message: string };
};
type ParticipantResult = {
  workPackageId: string; workPackageUpdatedAt: string | null;
  people: Array<Person & { key: string }>;
  complete: boolean; error: null | { code: string; message: string };
};
```

- `GET /api/snapshot`：取得快照；`?refresh=1` 要求新一輪，後端合併同時刷新。
- `GET /api/work-packages/:id/participants`：按需讀活動；`?refresh=1` 使該項目活動快取失效。
- `GET /api/health`：只回傳服務狀態及 demo/live，禁止回傳 token 或完整設定。
- 啟動時讀取設定，不提供設定寫入 API。不接受任意遠端 URL 作為前端查詢參數。
- 預設 live 缺少 token 必須回報明確設定錯誤；不得默默切回示例資料。

## 後續階段的具體行為

### 本機服務與來源 adapter

只監聽 `127.0.0.1`，預設 4173。靜態路由明列允許檔案，禁止目錄穿越與 config 暴露。安裝依賴和 Git 寫入走工具審核流程。

API token 僅在後端組成 Basic Authorization。請求只能 GET 且 URL 必須位於設定來源的 API 路徑；禁止跨來源分頁及自動跟隨到其他來源的 redirect，避免將憑證送出。timeout 預設 10 秒；429 與暫時性 5xx 最多重試 2 次，退避有上限並處理 Retry-After。401/403 不重試，不在錯誤中輸出回應機密。

讀完所有分頁才標記 complete。偵測重複 next URL；不支援或不完整分頁回傳可辨識錯誤，不能悄悄截斷。請求併發上限 4。活動快取以項目 ID 與 updatedAt 為鍵；無 updatedAt 時採短 TTL，並支援手動失效。只快取已完整載入的活動結果。

### 前端與更新

三種視圖共用一個 renderer 與 OrbitControls。模式切換才改變鏡頭目標；一般快照更新按 ID 增刪物件，不重新建立控制器。ID 決定基本空間位置，新增其他 ID 不移動既有項目。

遠處隱藏非選取項目的文字；全宇宙按批次加入星球，顯示已呈現／總數。用共享 geometry/material 或 instancing 降低資源成本；切換與移除時釋放不再使用的資源。太空船只屬於當前選取，任何過時的活動回應均不得覆蓋新選取。

更新器在每輪完成後排程下一次 60 秒檢查，手動刷新合併正在進行的請求。已有資料時失敗保留快照、視角及選取，顯示過期與最後成功時間。只有完整權威快照確認項目消失時才解除選取；部分失敗不能當成刪除。選取項目變更 updatedAt 時重新讀參與者。

### 整合驗收

示例資料包括：空專案、未指派、同名不同 ID、同一人兼任多角色、未知狀態、歷史不完整。另生成 1,000 個合成工作項目測量互動與載入時間，記錄測試硬體與瀏覽器，不把該數量當成公司真實規模。

實際來源驗證需本機 token。確認使用者可見專案、工作項目 subject/status/author/assignee、至少一個活動作者，並核對來源連結。沒有憑證就保留這項未完成，仍交付可運行示例與完整安裝指引。

## 規格覆蓋自查

| 既有規格 | 對應階段 |
|---|---|
| 星系／星球模型、狀態映射 | 1、2、4 |
| 參與者 ID 去重與未知身分 | 1、4 |
| 三種 3D 操作與點選詳情 | 3 |
| 選取才顯示船隻及完整名單 | 3、5 |
| 分頁、更新、快取、部分失敗 | 4、5 |
| 私有設定、loopback、無機密前端 | 1、2、4、6 |
| 無 WebGL、空資料、限流、舊資料提示 | 2、3、4、5 |
| 效能、真實整合、handoff | 6、每階段結束 |

## 官方依據與尚未確認事項

- [OpenProject API 驗證範例](https://www.openproject.org/docs/api/example/)：API key 的 Basic authentication。公司實際版本與可用 key 尚未驗證。
- [工作項目與活動 API](https://www.openproject.org/docs/api/endpoints/work-packages/)：工作項目及活動資源；adapter 需以真實回應核對欄位與分頁。
- [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)：旋轉、縮放、平移控制。

本路線不是階段 2–6 的逐檔程式碼計畫。各階段開始前，依已驗證的前一階段契約補成同等粒度的測試先行計畫，避免把未取得的真實來源欄位當成已確定事實。
