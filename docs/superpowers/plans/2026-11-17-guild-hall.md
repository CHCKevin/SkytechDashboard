# 公會大廳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在任務布告欄加上「公會大廳」頁籤：像素場景中顯示最多 16 位成員當日的工作／發呆／休息狀態，點成員可唯讀檢視其當日工時。

**Architecture:** 後端新增成員名單儲存（本機 JSON）、三個唯讀來源方法與四條本機 API；狀態由伺服器的純函式判定。前端把現有內容搬進 `QuestTab`，新增 `HallTab` 及其子元件；座位分配與造型產生是純函式。不新增任何 OpenProject 寫入。

**Tech Stack:** Node ≥ 20.12（node:test）、Svelte 5、Vite 8、Vitest 4、@testing-library/svelte。

**設計文件：** `docs/superpowers/specs/2026-11-17-guild-hall-design.md`

**共通規則（每個 Task 都適用）：**

- TDD：先寫失敗的測試、確認失敗、實作、確認通過、提交。
- 後端測試 `npm run test:server`；前端測試 `npm run test:web`；全部 `npm test`。
- 元件不得使用 inline style、`style:`、`transition:`（CSP `default-src 'self'`）。SVG 的 `fill` 屬性可以用。
- 搜尋結果等非送出按鈕一律 `type="button"`。
- `web/src/lib/api.js` 是唯一呼叫 `/api` 的模組。
- Commit 格式：`[TYPE]: Title`，本文含 What／How／Change 三段。
- 字級只用 `--fs-1`（12px）與 `--fs-2`（24px）。

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `server/config.mjs` | 修改 | 新增 `leaveWorkPackageId`（預設 200） |
| `server/json-store.mjs` | 新增 | JSON 陣列檔的讀、原子寫入、序列化佇列（從 quests 抽出） |
| `server/quests.mjs` | 修改 | 改用 `json-store`，行為不變 |
| `server/hall.mjs` | 新增 | 成員名單儲存：`list`、`add`、`remove`；`HallFullError`、`HallStoreError`；`HALL_CAPACITY = 16` |
| `server/hall-status.mjs` | 新增 | 純函式 `memberStatus`、`buildHall` |
| `server/validate.mjs` | 修改 | 新增 `parseHallMemberInput` |
| `server/time-tracking.mjs` | 修改 | 新增 `searchUsers`、`getUser`、`listEntriesForUsers` |
| `server/demo.mjs` | 修改 | 假使用者、他人工時、#200 請假、同名三個方法、`DEMO_HALL_MEMBERS` |
| `server/http.mjs` | 修改 | 四條新路由、`hall_full`→409、`hall_corrupt`→500 |
| `server/index.mjs` | 修改 | 建立 hall store 並傳入 |
| `web/src/lib/seats.js` | 新增 | `assignSeats(members)` |
| `web/src/lib/sprite.js` | 新增 | `spriteFor(userId, status)`、`STATUS_ICONS`、`STATUS_LABELS` |
| `web/src/lib/names.js` | 新增 | `shortName(name)` |
| `web/src/lib/api.js` | 修改 | `searchUsers`、`getHall`、`addHallMember`、`removeHallMember` |
| `web/src/App.svelte` | 修改 | 只留頂部列、頁籤、日期、banner、`me` |
| `web/src/components/QuestTab.svelte` | 新增 | 第一階段全部內容（純搬移） |
| `web/src/components/TopBar.svelte` | 修改 | 頁籤按鈕 |
| `web/src/components/PixelArt.svelte` | 新增 | 把 `{ width, height, rects }` 畫成 SVG |
| `web/src/components/HallScene.svelte` | 新增 | 家具與 16 個位子 |
| `web/src/components/MemberPanel.svelte` | 新增 | 右側面板（名單／成員明細） |
| `web/src/components/RecruitDialog.svelte` | 新增 | 招募視窗 |
| `web/src/components/HallTab.svelte` | 新增 | 讀取、自動更新、選取、組合 |
| `web/src/styles/pixel.css` | 修改 | 頁籤、場景、成員、面板樣式 |

---

## 介面定義（各 Task 共用，名稱與形狀以此為準）

**後端**

```js
// server/hall-status.mjs
memberStatus(entries, leaveWorkPackageId)   // → 'resting' | 'idle' | 'working'
buildHall(date, members, entries, leaveWorkPackageId)
// members: [{ userId, name }]；entries: [{ userId, id, workPackageId, workPackageSubject, date, hours, activityId, activityName, comment }]
// → { date, members: [{ userId, name, status, totalHours, entries: [{ id, workPackageId, workPackageSubject, hours, activityName, comment }] }] }
// totalHours 四捨五入到兩位小數；members 保持輸入順序。

// server/hall.mjs
createHallStore(path, { initial = [] } = {})   // 檔案不存在時 list() 回傳 initial 的複本
store.list()                     // → [{ userId, name }]
store.add({ userId, name })      // 已存在→更新名稱；已滿且不存在→throw HallFullError；→ 更新後清單
store.remove(userId)             // → 更新後清單

// 來源（time-tracking.mjs 與 demo.mjs）
source.searchUsers(term)                 // → [{ id, name }]，最多 10 筆；空字串 → []
source.getUser(id)                       // → { id, name }；不存在 → SourceError('not_found')
source.listEntriesForUsers(date, ids)    // → [{ userId, ...entry }]，依 id 遞增；ids 為空 → [] 且不發請求
```

**本機 API**

| 方法與路徑 | 回應 |
|---|---|
| `GET /api/users/search?q=` | `[{ id, name }]` |
| `GET /api/hall?date=YYYY-MM-DD` | `buildHall` 的結果 |
| `POST /api/hall/members` `{ userId }` | 200，更新後的 `[{ userId, name }]`；滿 → 409 `hall_full`；不存在 → 404 `not_found` |
| `DELETE /api/hall/members/{userId}` | 200，更新後的 `[{ userId, name }]` |

**前端**

```js
// web/src/lib/seats.js
SEAT_IDS   // ['bar-1'…'bar-5','desk-1'…'desk-7','sofa-1'…'sofa-4']
assignSeats(members)   // members: [{ userId, status }] → { [seatId]: member }

// web/src/lib/sprite.js
spriteFor(userId, status)   // → { width: 12, height: 16, rects: [{ x, y, w, color }] }
STATUS_ICONS                // { working, idle, resting } 各為 { width, height, rects }
STATUS_LABELS               // { working: '工作中', idle: '發呆', resting: '休息' }

// web/src/lib/names.js
shortName(name)   // 取最後一個 ' - ' 之後的部分並去除前後空白；沒有分隔時回傳原字串
```

---

### Task 1: 設定 `leaveWorkPackageId`

**Files:** Modify `server/config.mjs`；Test `tests/config.test.mjs`

- [ ] **Step 1: 寫失敗的測試**（加在 `tests/config.test.mjs`）

```js
test('leaveWorkPackageId defaults to 200 and must be a positive integer', () => {
  assert.equal(parseConfig({ mode: 'demo' }).leaveWorkPackageId, 200);
  assert.equal(parseConfig({ mode: 'demo', leaveWorkPackageId: 77 }).leaveWorkPackageId, 77);
  for (const bad of [0, -1, 1.5, '200', null]) {
    assert.throws(() => parseConfig({ mode: 'demo', leaveWorkPackageId: bad }), /leaveWorkPackageId/);
  }
});
```

- [ ] **Step 2:** `npm run test:server` → 新測試失敗。
- [ ] **Step 3: 實作**：在 `dailyTargetHours` 檢查之後加入

```js
const leaveWorkPackageId = input.leaveWorkPackageId === undefined ? 200 : input.leaveWorkPackageId;
if (!Number.isInteger(leaveWorkPackageId) || leaveWorkPackageId < 1) {
  throw new Error('leaveWorkPackageId must be a positive integer');
}
```

並把 `leaveWorkPackageId` 放進 `config` 物件。

- [ ] **Step 4:** `npm run test:server` → 全過。
- [ ] **Step 5:** Commit `[FEATURE]: Add Leave Work Package Setting`

### Task 2: 抽出 `json-store`，新增成員名單儲存

**Files:** Create `server/json-store.mjs`、`server/hall.mjs`；Modify `server/quests.mjs`；Test `tests/hall.test.mjs`（`tests/quests.test.mjs` 不改，必須照常通過）

- [ ] **Step 1: 寫失敗的測試** `tests/hall.test.mjs`，涵蓋：
  - 檔案不存在時 `list()` 回傳 `[]`；帶 `initial` 時回傳 initial 的複本，且修改回傳值不影響下一次 `list()`。
  - `add` 建立目錄與檔案，依加入順序排列。
  - `add` 同一個 `userId` 只更新名稱、不重複、位置不變。
  - 已有 16 位時 `add` 新成員丟出 `HallFullError`（`code === 'hall_full'`），檔案內容不變；但 `add` 既有成員仍可更新名稱。
  - `remove` 移除指定成員；移除不存在的成員不寫檔、回傳原清單。
  - 檔案不是 JSON 或不是陣列 → `HallStoreError`（`code === 'hall_corrupt'`）。
  - 併發 20 次 `add` 不同成員後，清單為前 16 位且沒有殘留 `.tmp` 檔。
- [ ] **Step 2:** `npm run test:server` → 失敗（模組不存在）。
- [ ] **Step 3: 實作 `server/json-store.mjs`**

```js
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// JSON 陣列檔：寫入先寫暫存檔再改名，並以佇列序列化避免併發覆蓋。
export function createJsonListFile(path, { corrupt, initial = [] }) {
  let queue = Promise.resolve();
  let tempCounter = 0;

  async function read() {
    let raw;
    try {
      raw = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(initial);
      throw error;
    }
    let data;
    try { data = JSON.parse(raw); } catch { throw corrupt(); }
    if (!Array.isArray(data)) throw corrupt();
    return data;
  }

  async function write(list) {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${tempCounter++}.tmp`;
    await writeFile(temp, `${JSON.stringify(list, null, 2)}\n`);
    await rename(temp, path);
  }

  function exclusive(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  return { read, write, exclusive };
}
```

- [ ] **Step 4:** 改寫 `server/quests.mjs` 使用 `createJsonListFile(path, { corrupt: () => new QuestStoreError() })`，`list`／`upsert`／`remove` 邏輯不變。
- [ ] **Step 5: 實作 `server/hall.mjs`**：`HALL_CAPACITY = 16`；`HallFullError`（訊息「大廳已滿（最多 16 位成員）」、`code: 'hall_full'`）；`HallStoreError`（訊息「大廳成員檔案格式錯誤，請檢查或刪除 data 目錄下的 hall 檔案」、`code: 'hall_corrupt'`）；`createHallStore` 依介面定義實作，存入的物件只含 `userId` 與 `name`。
- [ ] **Step 6:** `npm run test:server` → 全過（含原有 quests 測試）。
- [ ] **Step 7:** Commit `[FEATURE]: Add Hall Member Store`

### Task 3: 狀態判定純函式

**Files:** Create `server/hall-status.mjs`；Test `tests/hall-status.test.mjs`

- [ ] **Step 1: 寫失敗的測試**，涵蓋：
  - 沒有工時 → `idle`；只有一般工時 → `working`；只有 #200 → `resting`；#200 加其他工時 → `resting`。
  - 自訂請假編號（例如 77）：#200 的工時算 `working`，#77 算 `resting`。
  - `buildHall`：成員順序不變；沒有工時的成員 `entries: []`、`totalHours: 0`；`0.1 + 0.2` 合計為 `0.3`；工時依 `userId` 分給正確成員；不屬於任何成員的工時被忽略；輸出的 entry 只有 `id, workPackageId, workPackageSubject, hours, activityName, comment` 六個欄位。
- [ ] **Step 2:** 確認失敗。
- [ ] **Step 3: 實作**

```js
// 大廳狀態判定：請假優先，其次看當日是否有任何工時。
export function memberStatus(entries, leaveWorkPackageId) {
  if (entries.some(entry => entry.workPackageId === leaveWorkPackageId)) return 'resting';
  return entries.length ? 'working' : 'idle';
}

export function buildHall(date, members, entries, leaveWorkPackageId) {
  const byUser = new Map(members.map(member => [member.userId, []]));
  for (const entry of entries) byUser.get(entry.userId)?.push(entry);
  return {
    date,
    members: members.map(({ userId, name }) => {
      const own = byUser.get(userId);
      return {
        userId, name,
        status: memberStatus(own, leaveWorkPackageId),
        totalHours: Math.round(own.reduce((sum, entry) => sum + entry.hours, 0) * 100) / 100,
        entries: own.map(({ id, workPackageId, workPackageSubject, hours, activityName, comment }) =>
          ({ id, workPackageId, workPackageSubject, hours, activityName, comment })),
      };
    }),
  };
}
```

- [ ] **Step 4:** 確認通過。
- [ ] **Step 5:** Commit `[FEATURE]: Add Hall Status Rules`

### Task 4: 真實來源的三個唯讀方法

**Files:** Modify `server/time-tracking.mjs`；Test `tests/time-tracking.test.mjs`

- [ ] **Step 1: 寫失敗的測試**，涵蓋：
  - `searchUsers('陳')`：請求路徑 `/api/v3/principals`、`pageSize=10`、`filters` 解析後等於 `[{ name: { operator: '~', values: ['陳'] } }, { type: { operator: '=', values: ['User'] } }]`；回傳 `[{ id, name }]`。
  - `searchUsers('')` 回傳 `[]` 且沒有發出請求。
  - 回應沒有 `_embedded.elements` → `invalid_response`。
  - `getUser(18)`：請求 `/api/v3/users/18`，回傳 `{ id: 18, name }`；404 → `not_found`。
  - `listEntriesForUsers('2026-11-13', [18, 23])`：請求 `/api/v3/time_entries`，`filters` 等於 `[{ user: { operator: '=', values: ['18', '23'] } }, { spentOn: { operator: '=d', values: ['2026-11-13'] } }]`，`sortBy` 為 `[["id","asc"]]`；每筆帶正確的 `userId`（取自 `_links.user.href`）。
  - `listEntriesForUsers(date, [])` 回傳 `[]` 且沒有發出請求。
  - 工時缺少 `_links.user` → `invalid_response`。
- [ ] **Step 2:** 確認失敗。
- [ ] **Step 3: 實作**（加在回傳物件中）

```js
async searchUsers(term) {
  if (!term) return [];
  const filters = encodeURIComponent(JSON.stringify([
    { name: { operator: '~', values: [term] } }, { type: { operator: '=', values: ['User'] } },
  ]));
  const page = await client.getJson(`/api/v3/principals?pageSize=10&filters=${filters}`);
  const items = page?._embedded?.elements;
  if (!Array.isArray(items)) throw new SourceError('invalid_response');
  return items.map(user => ({ id: user.id, name: user.name ?? '' }));
},

async getUser(id) {
  const user = await client.getJson(`/api/v3/users/${id}`);
  return { id: user.id, name: user.name ?? '' };
},

async listEntriesForUsers(date, userIds) {
  if (!userIds.length) return [];
  const filters = JSON.stringify([
    { user: { operator: '=', values: userIds.map(String) } }, { spentOn: { operator: '=d', values: [date] } },
  ]);
  const elements = await client.getAll('/api/v3/time_entries', { filters, sortBy: '[["id","asc"]]' });
  return elements.map(hal => {
    const userId = idFrom(hal?._links?.user?.href, /^\/api\/v3\/users\/(\d+)$/);
    if (userId === null) throw new SourceError('invalid_response');
    return { userId, ...toEntry(hal) };
  });
},
```

- [ ] **Step 4:** 確認通過。
- [ ] **Step 5:** Commit `[FEATURE]: Read Users And Member Entries From OpenProject`

### Task 5: 示例來源

**Files:** Modify `server/demo.mjs`；Test `tests/demo.test.mjs`

- [ ] **Step 1: 寫失敗的測試**，涵蓋：
  - `searchUsers('小')` 找到名稱含「小」的假使用者；`searchUsers('')` → `[]`；最多 10 筆。
  - `getUser(1)` → `{ id: 1, name: '示例冒險者' }`；不存在 → `not_found`。
  - `listEntriesForUsers(today, DEMO_HALL_MEMBERS 的編號)`：包含本人的兩筆；有一位成員有 #200 的工時；有一位成員沒有任何工時；每筆都有 `userId`。
  - 本人用 `createEntry` 新增的工時，會出現在 `listEntriesForUsers(today, [1])`。
  - 他人的工時不會出現在 `listEntries(today)`（原有行為不變），也不能用 `updateEntry`／`deleteEntry` 動到（→ `not_found`）。
  - `getWorkPackage(200)` → 名稱「請假」。
- [ ] **Step 2:** 確認失敗。
- [ ] **Step 3: 實作**：
  - `WORK_PACKAGES` 加上 `[200, '請假', '行政']`。
  - `USERS`：`1 示例冒險者`、`11 劍士 小華`、`12 法師 怡君`、`13 弓手 志豪`、`14 盜賊 阿明`、`15 牧師 雅婷`、`16 商人 Gary`、`17 學徒 小安`。
  - `export const DEMO_HALL_MEMBERS`：編號 1、11、12、13、14 的 `{ userId, name }`。
  - 每筆工時另記擁有者：`owners = new Map()`；`save(id, input, userId = 1)`。`listEntries`、`existing` 只看擁有者為 1 的工時。
  - 種子資料（日期皆為 `today`）：11 → #200 8h；12 → #1990 3h、#2310 2h；13 → 無；14 → #1877 4h。
  - 三個新方法依介面定義實作。
- [ ] **Step 4:** 確認通過（含原有 demo 與 http 測試）。
- [ ] **Step 5:** Commit `[FEATURE]: Add Demo Members And Leave Entries`

### Task 6: 輸入驗證與本機 API

**Files:** Modify `server/validate.mjs`、`server/http.mjs`、`server/index.mjs`；Test `tests/validate.test.mjs`、`tests/http.test.mjs`、`tests/index.test.mjs`

- [ ] **Step 1: 寫失敗的測試**
  - `validate`：`parseHallMemberInput({ userId: 18 })` → `{ userId: 18 }`；缺欄位、字串、0、小數、多餘欄位、非物件 → `InputError` 且 `field` 正確。
  - `http`（`withServer` 的預設選項加上 `hall: createHallStore(join(dir, 'hall.json'))` 與 `leaveWorkPackageId: 200`）：
    - `GET /api/users/search?q=小` → 200 陣列；`q` 省略 → `[]`。
    - `GET /api/hall?date=2026-11-16`（空大廳）→ `{ date, members: [] }`；日期格式錯誤 → 400。
    - `POST /api/hall/members { userId: 11 }` → 200，清單含該成員與示例名稱；之後 `GET /api/hall` 的該成員 `status === 'resting'`。
    - 加入 12 → `working`、`totalHours === 5`；加入 13 → `idle`。
    - 加入不存在的使用者 → 404 `not_found`；`userId: 'x'` → 400。
    - 第 17 位 → 409 `hall_full`（用自訂來源讓 `getUser` 對任何編號都成功）。
    - `DELETE /api/hall/members/11` → 200，清單不含 11；`DELETE /api/hall/members/abc` → 400。
    - `POST`／`DELETE` 缺 `X-Quest-Board` → 403；`Sec-Fetch-Site: cross-site` 的 `GET /api/hall` → 403。
    - 成員檔損毀 → 500 `hall_corrupt`。
    - 自訂 `leaveWorkPackageId: 1990` 時，有 #1990 工時的成員為 `resting`。
  - `index`：示例模式下 `GET /api/hall?date=<今天>` 回傳 5 位預設成員；加入成員後 `data/demo-hall.json` 存在。
- [ ] **Step 2:** 確認失敗。
- [ ] **Step 3: 實作 `validate.mjs`**

```js
export function parseHallMemberInput(body) {
  assertObject(body, ['userId']);
  if (body.userId === undefined) throw new InputError('userId', '缺少欄位：userId');
  return { userId: parseId(body.userId, 'userId') };
}
```

- [ ] **Step 4: 實作 `http.mjs`**：`routes` 與 `createHandler` 多收 `hall`、`leaveWorkPackageId`，加入

```js
['GET', /^\/api\/users\/search$/, async ({ url }) => ({ body: await source.searchUsers(parseSearchTerm(url.searchParams.get('q'))) })],
['GET', /^\/api\/hall$/, async ({ url }) => {
  const date = parseDate(url.searchParams.get('date'));
  const members = await hall.list();
  const entries = await source.listEntriesForUsers(date, members.map(member => member.userId));
  return { body: buildHall(date, members, entries, leaveWorkPackageId) };
}],
['POST', /^\/api\/hall\/members$/, async ({ readBody }) => {
  const { userId } = parseHallMemberInput(await readBody());
  const user = await source.getUser(userId);
  return { body: await hall.add({ userId: user.id, name: user.name }) };
}],
['DELETE', /^\/api\/hall\/members\/([^/]+)$/, async ({ match }) => ({ body: await hall.remove(parsePathId(match[1], 'userId')) })],
```

`handleError` 加上：`HallFullError` → 409 `{ code, message }`；`HallStoreError` 與 `QuestStoreError` 同樣處理（500，`console.error` 只記代碼）。

- [ ] **Step 5: 實作 `index.mjs`**

```js
const hall = createHallStore(
  resolve(root, config.dataDir, config.mode === 'demo' ? 'demo-hall.json' : 'hall.json'),
  { initial: config.mode === 'demo' ? DEMO_HALL_MEMBERS : [] },
);
```

並把 `hall`、`leaveWorkPackageId: config.leaveWorkPackageId` 傳給 `createHandler`。

- [ ] **Step 6:** `npm run test:server` → 全過。
- [ ] **Step 7:** Commit `[FEATURE]: Add Guild Hall API`

### Task 7: 前端純函式（座位、造型、名稱）與 API 用戶端

**Files:** Create `web/src/lib/seats.js`、`sprite.js`、`names.js` 與各自的 `.test.js`；Modify `web/src/lib/api.js`、`api.test.js`

- [ ] **Step 1: 寫失敗的測試**
  - `seats`：
    - 空清單 → `{}`。
    - 休息 1、工作 2、發呆 1 → `sofa-1`、`desk-1`、`desk-2`、`bar-1`。
    - 8 位工作中 → `desk-1`…`desk-7` 與 `bar-1`。
    - 6 位發呆 → `bar-1`…`bar-5` 與 `sofa-1`。
    - 5 位休息 → `sofa-1`…`sofa-4` 與 `bar-1`。
    - 16 位各種狀態 → 16 個不同位子，全部成員都有位子。
    - 同狀態依輸入順序；輸入相同時輸出深度相等。
    - 分配順序是休息→工作→發呆：4 位發呆排在前、4 位休息排在後時，沙發仍全給休息的人。
    - 超過 16 位時多出來的人不出現在結果中。
  - `sprite`：同一編號兩次呼叫結果深度相等；編號 1…40 至少產生 20 種不同造型；所有 rect 落在 12×16 內且 `w ≥ 1`；`resting` 與 `working` 的造型只差在眼睛（rect 清單不同但數量相近，且髮色、衣服顏色相同）；`STATUS_ICONS` 三個鍵都有非空的 rects。
  - `names`：`'軟體研發處 -  陳炫中 Ted Chen'` → `'陳炫中 Ted Chen'`；沒有分隔 → 原樣；空字串 → `''`。
  - `api`：`searchUsers('陳')` 呼叫 `/api/users/search?q=%E9%99%B3`；`getHall('2026-11-17')` 呼叫 `/api/hall?date=2026-11-17`；`addHallMember(18)` 為 POST、本體 `{ userId: 18 }`、帶 `X-Quest-Board`；`removeHallMember(18)` 為 DELETE `/api/hall/members/18`。
- [ ] **Step 2:** `npm run test:web` → 失敗。
- [ ] **Step 3: 實作 `seats.js`**

```js
// 區域與位子數；位子編號同時是 CSS 類別與顯示順序。
const ZONES = { bar: 5, desk: 7, sofa: 4 };
const PREFERENCE = {
  resting: ['sofa', 'bar', 'desk'],
  working: ['desk', 'bar', 'sofa'],
  idle: ['bar', 'sofa', 'desk'],
};
const ORDER = ['resting', 'working', 'idle'];

export const SEAT_IDS = Object.entries(ZONES).flatMap(([zone, count]) =>
  Array.from({ length: count }, (_, index) => `${zone}-${index + 1}`));

// 狀態跟著角色走；區域只是偏好。輸入相同時輸出相同，資料沒變時角色不換位子。
export function assignSeats(members) {
  const used = { bar: 0, desk: 0, sofa: 0 };
  const seats = {};
  for (const status of ORDER) {
    for (const member of members.filter(item => item.status === status)) {
      const zone = PREFERENCE[status].find(name => used[name] < ZONES[name]);
      if (!zone) continue;
      used[zone] += 1;
      seats[`${zone}-${used[zone]}`] = member;
    }
  }
  return seats;
}
```

- [ ] **Step 4: 實作 `sprite.js`**：12×16 的字元格（`H` 髮、`S` 膚、`E` 眼、`C` 衣、`D` 衣服暗部、`P` 褲、`B` 鞋、`A` 頭飾、`.` 透明）；髮型 5 種、頭飾 6 種（含無）以「覆寫指定列」的方式套用；顏色表：髮 6、膚 4、衣 8、頭飾 5。以 mulberry32（種子為 `userId`）依固定順序抽選。`resting` 時把 `E` 改畫成膚色暗部（閉眼）。輸出時把同一列相鄰同色的格子合併成一個 `{ x, y, w, color }`。`STATUS_ICONS` 為 7×7 的像素圖：工作中是槌子、發呆是三個點、休息是 Z。
- [ ] **Step 5: 實作 `names.js` 與 `api.js` 的四個函式**

```js
export const searchUsers = query => request(`/api/users/search?q=${encodeURIComponent(query)}`);
export const getHall = date => request(`/api/hall?date=${encodeURIComponent(date)}`);
export const addHallMember = userId => request('/api/hall/members', { method: 'POST', body: { userId } });
export const removeHallMember = userId => request(`/api/hall/members/${userId}`, { method: 'DELETE' });
```

- [ ] **Step 6:** `npm run test:web` → 全過。
- [ ] **Step 7:** Commit `[FEATURE]: Add Seat Assignment And Member Sprites`

### Task 8: 頁籤，並把現有內容搬進 `QuestTab`

**Files:** Create `web/src/components/QuestTab.svelte`；Modify `web/src/App.svelte`、`TopBar.svelte`、`pixel.css`、`App.test.js`

- [ ] **Step 1: 寫失敗的測試**（加在 `App.test.js`；`vi.mock('./lib/api.js')` 的清單補上 `getHall`、`searchUsers`、`addHallMember`、`removeHallMember`，`beforeEach` 讓 `getHall` 回傳 `{ date: '2026-11-16', members: [] }`）
  - 載入後「任務欄」頁籤 `aria-selected="true"`，看得到常駐任務；`getHall` 沒有被呼叫。
  - 點「公會大廳」頁籤 → `getHall` 以 `'2026-11-16'` 被呼叫，常駐任務不在畫面上。
  - 在大廳頁籤按「前一天」→ `getHall` 以 `'2026-11-15'` 被呼叫；切回任務欄 → `listEntries` 最後一次以 `'2026-11-15'` 被呼叫（日期共用）。
- [ ] **Step 2:** 確認失敗。
- [ ] **Step 3: 實作**
  - `QuestTab.svelte`：props `{ date, ondatechange, onbanner }`。把 `App.svelte` 中 `target`、`quests`、`entries`、`loading`、`loadError`、`dialog`、`pinning`、`latestLoad`、所有相關函式與 `<main class="layout">` 以下的標記原樣搬入。原本的 `banner = x` 改成 `onbanner(x)`；`date = values.date` 改成 `ondatechange(values.date)`；`onMount` 只讀 `getConfig` 與 `listQuests`。
  - `App.svelte`：保留 `date`、`me`、`banner`，新增 `let tab = $state('quests')`；`onMount` 只讀 `getMe`。依 `tab` 渲染 `<QuestTab>` 或 `<HallTab>`（Task 11 之前先放一個只呼叫 `getHall(date)` 的最小 `HallTab.svelte`）。
  - `TopBar.svelte`：props 加 `tab`、`ontab`；在標題旁加入

```svelte
<div class="tabs" role="tablist" aria-label="頁籤">
  <button class="tab" role="tab" aria-selected={tab === 'quests'} onclick={() => ontab('quests')}>任務欄</button>
  <button class="tab" role="tab" aria-selected={tab === 'hall'} onclick={() => ontab('hall')}>公會大廳</button>
</div>
```

  - `pixel.css`：`.tabs`、`.tab`、`.tab[aria-selected='true']` 樣式。
- [ ] **Step 4:** `npm run test:web` → 全過（原有 App 測試不得修改斷言）。
- [ ] **Step 5:** Commit `[FEATURE]: Add Tabs And Move Quest Board Into Its Own Tab`

### Task 9: 像素繪製元件與大廳場景

**Files:** Create `web/src/components/PixelArt.svelte`、`HallScene.svelte`、`HallScene.test.js`；Modify `pixel.css`

- [ ] **Step 1: 寫失敗的測試** `HallScene.test.js`
  - 給 3 位成員（休息、工作中、發呆）→ 有 3 個按鈕，名稱分別是「{全名}：休息」等。
  - 按鈕所在的位子元素帶有對應的 `data-seat`（`sofa-1`、`desk-1`、`bar-1`）。
  - 一共渲染 16 個 `[data-seat]`。
  - 點成員按鈕 → `onselect` 以該成員的 `userId` 被呼叫。
  - `selectedId` 對應的按鈕 `aria-pressed="true"`，其餘為 `false`。
  - 按鈕內顯示的是 `shortName`。
  - 元件輸出的 HTML 不含 `style=`。
- [ ] **Step 2:** 確認失敗。
- [ ] **Step 3: 實作 `PixelArt.svelte`**

```svelte
<script>
  let { art, class: className = '' } = $props();
</script>

<svg class={className} viewBox={`0 0 ${art.width} ${art.height}`} shape-rendering="crispEdges" aria-hidden="true">
  {#each art.rects as rect (`${rect.x},${rect.y}`)}
    <rect x={rect.x} y={rect.y} width={rect.w} height="1" fill={rect.color} />
  {/each}
</svg>
```

- [ ] **Step 4: 實作 `HallScene.svelte`**：props `{ members, selectedId, onselect }`；`seats = $derived(assignSeats(members))`。結構（全部用 CSS 排版，不用絕對定位或 inline style）：

```
section.scene[aria-label="公會大廳"]
  div.zone-bar     → div.shelf、div.counter、div.stools（bar-1…bar-5）
  div.scene-lower
    div.zone-desk  → 上排位子（desk-1、desk-2、desk-5、空格）
                     桌子列（四人桌跨兩欄、雙人桌、單人桌）
                     下排位子（desk-3、desk-4、desk-6、desk-7）
    div.zone-sofa  → div.sofa.sofa-3（sofa-1…sofa-3）、div.sofa.sofa-1（sofa-4）
```

每個位子是 `div.seat[data-seat]`；有人時內含

```svelte
<button type="button" class="member" aria-pressed={member.userId === selectedId}
  aria-label={`${member.name}：${STATUS_LABELS[member.status]}`} onclick={() => onselect(member.userId)}>
  <PixelArt art={STATUS_ICONS[member.status]} class="status-icon" />
  <PixelArt art={spriteFor(member.userId, member.status)} class="sprite" />
  <span class="member-name">{shortName(member.name)}</span>
</button>
```

- [ ] **Step 5:** `pixel.css` 加上場景樣式：地板、吧檯、酒架、桌子、沙發、地毯；`.seat` 固定最小高度；`.sprite` 36×48px；`.status-icon` 14×14px；`.member-name` 單行、超出以省略號截斷；`.member[aria-pressed='true']` 用 `outline` 標示；窄螢幕（≤ 800px）時 `.sprite` 24×32px。
- [ ] **Step 6:** `npm run test:web` → 全過。
- [ ] **Step 7:** Commit `[FEATURE]: Add Guild Hall Scene`

### Task 10: 成員面板與招募視窗

**Files:** Create `web/src/components/MemberPanel.svelte`、`MemberPanel.test.js`、`RecruitDialog.svelte`、`RecruitDialog.test.js`；Modify `pixel.css`

- [ ] **Step 1: 寫失敗的測試**
  - `MemberPanel`（props：`members`、`selected`、`date`、`loading`、`loadError`、`refreshError`、`updatedAt`、`onselect`、`onback`、`onrecruit`、`onremove`、`onrefresh`）
    - 未選取：標題「公會成員 2 / 16」；每位成員一列，顯示名字、狀態文字、合計時數；點列 → `onselect(userId)`。
    - 沒有成員且不在讀取中 → 顯示「大廳還沒有成員，先招募幾位吧」。
    - `loading` → 顯示「讀取中…」，不顯示空白提示。
    - `loadError` → `role="alert"` 顯示訊息。
    - `refreshError` → 顯示「更新失敗」與該訊息，成員列仍在。
    - 16 位成員 →「＋ 招募成員」停用，顯示「大廳已滿」。
    - 按「重新整理」→ `onrefresh`；按「＋ 招募成員」→ `onrecruit`。
    - 已選取：顯示全名、狀態、日期；每筆工時顯示 `#編號 名稱`、時數、活動與備註；顯示「合計 5h」；沒有 [改]／[刪] 按鈕；沒有工時時顯示「這天沒有記錄工時」。
    - 「返回」→ `onback`；「請離大廳」→ `onremove(member)`。
  - `RecruitDialog`（props：`memberIds`、`onsubmit`、`oncancel`、`searchDelay`）
    - 輸入後呼叫 `searchUsers`，列出結果；選一位後「加入大廳」可按，按下 → `onsubmit(userId)` 一次。
    - 已在 `memberIds` 的結果標示「已在大廳」且按鈕停用。
    - 在搜尋框按 Enter、或點搜尋結果，都不會觸發 `onsubmit`。
    - `onsubmit` 丟錯 → 視窗內 `role="alert"` 顯示訊息，視窗不關。
    - 送出進行中再按一次不會重複呼叫。
    - 找不到 → 顯示「找不到符合的成員」。
    - 較慢的舊搜尋回應不會蓋掉較新的結果。
- [ ] **Step 2:** 確認失敗。
- [ ] **Step 3: 實作兩個元件**：`RecruitDialog` 的搜尋、延遲、只採用最新結果的寫法比照 `WorkPackageSearch.svelte`；視窗外框、`role="dialog"` 放在外層 `div`（不可放在 `form` 上）、按鈕列比照 `PinDialog.svelte`。`MemberPanel` 的工時列沿用 `.entries`／`.entry`／`.entry-meta` 樣式。
- [ ] **Step 4:** `npm run test:web` → 全過。
- [ ] **Step 5:** Commit `[FEATURE]: Add Member Panel And Recruit Dialog`

### Task 11: 組合 `HallTab`（讀取、自動更新、選取）

**Files:** Modify（取代 Task 8 的最小版本）`web/src/components/HallTab.svelte`；Create `HallTab.test.js`

- [ ] **Step 1: 寫失敗的測試**（mock `../lib/api.js`；用 `vi.useFakeTimers({ shouldAdvanceTime: true })` 測計時）
  - 掛載後以 `date` 呼叫 `getHall`，場景出現成員。
  - 讀取中顯示「讀取中…」；失敗時場景沒有成員並顯示錯誤。
  - `date` 改變 → 立刻清空成員並重新讀取。
  - 較慢的舊日期回應晚到時被丟棄。
  - 5 分鐘後自動再讀一次；頁面 `visibilityState` 為 `hidden` 時不讀；變回 `visible` 時立即讀一次。
  - 卸載後計時器停止，不再呼叫。
  - 同一天的重新讀取失敗 → 成員仍在，面板顯示「更新失敗」。
  - 點成員 → 面板顯示其工時；重新讀取後仍保持選取；該成員不在新資料中 → 取消選取。
  - 招募：開視窗 → 選人 → `addHallMember` 被呼叫 → 視窗關閉 → 重新讀取。
  - 請離：`window.confirm` 回 `true` → `removeHallMember` 被呼叫、取消選取、重新讀取；回 `false` → 不呼叫。請離失敗 → 顯示錯誤並重新讀取。
- [ ] **Step 2:** 確認失敗。
- [ ] **Step 3: 實作**：props `{ date }`。狀態：`members`、`loading`、`loadError`、`refreshError`、`updatedAt`、`selectedId`、`recruiting`、`latest`。
  - `load(day, { fresh })`：`fresh` 時先清空 `members` 並設 `loading`；成功時只在 `mine === latest` 才套用，並清除兩種錯誤、更新 `updatedAt`、檢查 `selectedId` 是否仍存在；失敗時 `fresh` 設 `loadError`，否則設 `refreshError`。
  - `$effect(() => { load(date, { fresh: true }); })`。
  - `$effect` 設定 `setInterval(…, 5 * 60_000)`（僅在 `document.visibilityState === 'visible'` 時讀取）與 `visibilitychange` 監聽，回傳清除函式。
  - 版面：`<main class="layout">` 內左邊 `HallScene`、右邊 `MemberPanel`；`recruiting` 時渲染 `RecruitDialog`。
- [ ] **Step 4:** `npm test` → 後端與前端全過；`npm run build` 無警告。
- [ ] **Step 5:** Commit `[FEATURE]: Assemble Guild Hall Tab`

### Task 12: 示例模式瀏覽器驗證（正式產物、真實 CSP）

**Files:** 無（發現問題時回到對應 Task 修正並補測試）

- [ ] **Step 1:** `npm run build`，以 `node server/index.mjs --config config/example.json` 在背景啟動（先刪除 `data/demo-hall.json` 以取得預設成員）。
- [ ] **Step 2:** 用瀏覽器逐項確認並截圖：
  1. 載入後在「任務欄」頁籤；第一階段的畫面正常。
  2. 切到「公會大廳」：場景有吧檯、工作桌、沙發；5 位預設成員各有不同造型。
  3. 請假的成員在沙發、顯示休息；有工時的在工作桌、顯示工作中；沒有工時的在吧檯、顯示發呆。
  4. 點成員：外框標示、右側顯示其工時與合計；「返回」回到名單。
  5. 招募：搜尋、已在大廳者不可選、加入後出現在場景。
  6. 請離大廳：確認後消失。
  7. 切換日期：先顯示讀取中，前一天全員發呆並坐到吧檯／沙發；回今天恢復。
  8. 在任務欄替自己新增工時後回大廳，本人的合計增加。
  9. 招募到 16 位：全部有位子、按鈕停用並顯示「大廳已滿」。
  10. 窄螢幕：單欄、沒有水平捲軸、角色與名字不重疊。
  11. 鍵盤：Tab 可聚焦成員，Enter 可選取。
  12. 主控台沒有 CSP 違規或錯誤；頁面 HTML 不含 `style=` 屬性造成的違規。
  13. 任務欄回歸：第一階段 12 項重跑。
- [ ] **Step 3:** 停止伺服器，把結果記錄到 `tasks/todo.md`。
- [ ] **Step 4:** 有修正則 Commit。

### Task 13: 即時模式唯讀驗證

**Files:** 無

大廳只讀取 OpenProject；成員名單只寫本機 `data/hall.json`。本 Task **不得**對 OpenProject 發出任何寫入請求。

- [ ] **Step 1:** `node server/index.mjs` 在背景啟動（即時模式）。
- [ ] **Step 2:** 確認：搜尋中文與英文名稱都找得到人；招募數位成員；各成員的狀態、工時與直接查 OpenProject API 的結果一致；找一個有人請假（#200）的日期確認顯示休息；請離成員。
- [ ] **Step 3:** 確認瀏覽器的網路請求中，對 `/api` 的寫入只有 `/api/hall/members`；伺服器輸出不含 token。
- [ ] **Step 4:** 停止伺服器。驗證用的成員名單是否保留，記錄在 `tasks/todo.md`。

### Task 14: 文件收尾

**Files:** Modify `handoff.md`、`tasks/todo.md`

- [ ] **Step 1:** `handoff.md`：目前階段、新的設定欄位 `leaveWorkPackageId`、`data/hall.json`、架構重點（新模組）、已驗證與未驗證項目、已知限制、下一步候選。
- [ ] **Step 2:** `tasks/todo.md`：第二階段的 Review 區段（測試數量、驗證結果、過程中發現的問題、刻意未做的項目）。
- [ ] **Step 3:** Commit `[DOCS]: Update Handoff And Review For Guild Hall`
