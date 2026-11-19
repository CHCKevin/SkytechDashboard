# 任務欄「匯出工時表」連結 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在任務欄加一個連結，在新分頁開啟 OpenProject 時間報表（使用者 = 我、頂端所選日期的那一週），由使用者按原生的 Export PDF timesheet。

**Architecture:** 後端 `/api/config` 多回傳 `openProjectUrl`（即時模式為 origin，示例模式為 `null`）。前端新增純函式模組 `web/src/lib/timesheet.js`，負責算出週範圍並組出網址；`QuestTab.svelte` 依 `date` 衍生出連結。token 規則不變。

**Tech Stack:** Node 20 (node:test)、Svelte 5、Vite 8、Vitest 4、@testing-library/svelte。

設計：`docs/superpowers/specs/2026-11-19-timesheet-export-design.md`

---

## 檔案

| 檔案 | 動作 | 責任 |
|---|---|---|
| `web/src/lib/timesheet.js` | 新增 | 週範圍、報表網址、週標籤（純函式） |
| `web/src/lib/timesheet.test.js` | 新增 | 上述函式的單元測試 |
| `server/http.mjs` | 修改 | `createHandler` 接收 `openProjectUrl`，`/api/config` 回傳它 |
| `server/index.mjs` | 修改 | 傳入 `openProjectUrl: config.baseUrl`（示例模式本來就是 `null`） |
| `tests/http.test.mjs` | 修改 | `/api/config` 的 `openProjectUrl` 為 null 或 origin |
| `tests/index.test.mjs` | 修改 | 即時模式啟動後 `/api/config` 回傳 origin |
| `web/src/components/QuestTab.svelte` | 修改 | 讀取 `openProjectUrl`，在 TodayLog 上方輸出連結 |
| `web/src/styles/pixel.css` | 修改 | `.log-column`、`.timesheet-link` |
| `web/src/App.test.js` | 修改 | 連結顯示、跟著日期更新、沒有網址時不顯示 |

---

### Task 1: timesheet.js 純函式

**Files:**
- Create: `web/src/lib/timesheet.js`
- Test: `web/src/lib/timesheet.test.js`

- [ ] **Step 1: 寫失敗的測試**

```js
import { describe, expect, test } from 'vitest';
import { formatWeekLabel, timesheetReportUrl, weekRange } from './timesheet.js';

describe('weekRange', () => {
  test.each([
    ['2026-11-16', '2026-11-16', '2026-11-22'], // 週一
    ['2026-11-19', '2026-11-16', '2026-11-22'], // 週四
    ['2026-11-22', '2026-11-16', '2026-11-22'], // 週日
    ['2026-11-30', '2026-11-30', '2026-12-06'], // 跨月（往後）
    ['2026-12-02', '2026-11-30', '2026-12-06'], // 跨月（往前）
    ['2026-12-31', '2026-12-28', '2027-01-03'], // 跨年
  ])('%s → %s ~ %s', (day, start, end) => {
    expect(weekRange(day)).toEqual({ start, end });
  });
});

test('timesheetReportUrl uses the verified legacy cost report filters', () => {
  const url = new URL(timesheetReportUrl('http://op.example:8080', '2026-11-19'));
  expect(url.origin + url.pathname).toBe('http://op.example:8080/cost_reports');
  expect([...url.searchParams]).toEqual([
    ['set_filter', '1'],
    ['fields[]', 'user_id'], ['operators[user_id]', '='], ['values[user_id][]', 'me'],
    ['fields[]', 'spent_on'], ['operators[spent_on]', '<>d'],
    ['values[spent_on][]', '2026-11-16'], ['values[spent_on][]', '2026-11-22'],
    ['unit', '-1'],
  ]);
});

test('formatWeekLabel shows month/day without padding', () => {
  expect(formatWeekLabel('2026-11-19')).toBe('11/16–11/22');
  expect(formatWeekLabel('2026-12-31')).toBe('12/28–1/3');
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run --config web/vite.config.js web/src/lib/timesheet.test.js`
Expected: FAIL，找不到 `./timesheet.js`

- [ ] **Step 3: 實作**

```js
import { addDays } from './dates.js';

// OpenProject 時間報表（舊版 /cost_reports）的深層連結；2026-11-19 使用者已在公司版本驗證這組參數。
// 一律以本地年月日計算，週一為一週的第一天。

function weekday(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).getDay();
}

export function weekRange(day) {
  const start = addDays(day, -((weekday(day) + 6) % 7));
  return { start, end: addDays(start, 6) };
}

export function timesheetReportUrl(origin, day) {
  const { start, end } = weekRange(day);
  const url = new URL('/cost_reports', origin);
  url.search = new URLSearchParams([
    ['set_filter', '1'],
    ['fields[]', 'user_id'], ['operators[user_id]', '='], ['values[user_id][]', 'me'],
    ['fields[]', 'spent_on'], ['operators[spent_on]', '<>d'],
    ['values[spent_on][]', start], ['values[spent_on][]', end],
    ['unit', '-1'],
  ]).toString();
  return url.href;
}

const monthDay = day => {
  const [, month, date] = day.split('-').map(Number);
  return `${month}/${date}`;
};

export function formatWeekLabel(day) {
  const { start, end } = weekRange(day);
  return `${monthDay(start)}–${monthDay(end)}`;
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `npx vitest run --config web/vite.config.js web/src/lib/timesheet.test.js`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add Timesheet Report Link Helpers`）

### Task 2: `/api/config` 回傳 openProjectUrl

**Files:**
- Modify: `server/http.mjs`（`routes`、`createHandler`）
- Modify: `server/index.mjs`（`createHandler` 呼叫）
- Test: `tests/http.test.mjs`、`tests/index.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

`tests/http.test.mjs` 的 `health, me and config`：
```js
    assert.deepEqual((await send(port, '/api/config')).json, { dailyTargetHours: 8, openProjectUrl: null });
```
新增：
```js
test('config exposes the OpenProject origin for report links', async () => {
  await withServer({ mode: 'live', openProjectUrl: 'http://op.example:8080' }, async port => {
    assert.deepEqual((await send(port, '/api/config')).json, { dailyTargetHours: 8, openProjectUrl: 'http://op.example:8080' });
  });
});
```
`tests/index.test.mjs` 的即時模式測試，在 health 斷言之後加上：
```js
    assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { dailyTargetHours: 8, openProjectUrl: `http://127.0.0.1:${closed}` });
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node --test tests/http.test.mjs tests/index.test.mjs`
Expected: FAIL，`openProjectUrl` 缺少

- [ ] **Step 3: 實作**

`server/http.mjs`：
```js
function routes({ source, quests, hall, mode, dailyTargetHours, leaveWorkPackageId, openProjectUrl }) {
  ...
    // 只有 origin（不含 token），前端用來組 OpenProject 報表連結；示例模式為 null。
    ['GET', /^\/api\/config$/, () => ({ body: { dailyTargetHours, openProjectUrl } })],

export function createHandler({ source, quests, hall, mode, dailyTargetHours, leaveWorkPackageId, openProjectUrl = null, staticFiles = {} }) {
  const table = routes({ source, quests, hall, mode, dailyTargetHours, leaveWorkPackageId, openProjectUrl });
```
`server/index.mjs` 的 `createHandler({...})` 加上 `openProjectUrl: config.baseUrl,`（`loadConfig` 已把它正規化為 origin，示例模式為 `null`）。

- [ ] **Step 4: 執行，確認通過**

Run: `npm run test:server`
Expected: 全部 PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Expose OpenProject Origin In Config API`）

### Task 3: 任務欄連結

**Files:**
- Modify: `web/src/components/QuestTab.svelte`
- Modify: `web/src/styles/pixel.css`
- Test: `web/src/App.test.js`

- [ ] **Step 1: 寫失敗的測試**

`beforeEach` 改為 `api.getConfig.mockResolvedValue({ dailyTargetHours: 8, openProjectUrl: null });`，新增：
```js
test('timesheet link opens the OpenProject report for the selected week', async () => {
  api.getConfig.mockResolvedValue({ dailyTargetHours: 8, openProjectUrl: 'http://op.example:8080' });
  render(App);
  const link = await screen.findByRole('link', { name: '匯出工時表（11/16–11/22）↗' });
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  const url = new URL(link.getAttribute('href'));
  expect(url.origin + url.pathname).toBe('http://op.example:8080/cost_reports');
  expect(url.searchParams.getAll('values[spent_on][]')).toEqual(['2026-11-16', '2026-11-22']);
  await userEvent.click(screen.getByRole('button', { name: '前一天' }));
  const previous = await screen.findByRole('link', { name: '匯出工時表（11/9–11/15）↗' });
  expect(new URL(previous.getAttribute('href')).searchParams.getAll('values[spent_on][]')).toEqual(['2026-11-09', '2026-11-15']);
});
test('no timesheet link without an OpenProject URL', async () => {
  render(App);
  await screen.findByText('前端登入頁改版');
  expect(screen.queryByRole('link', { name: /匯出工時表/ })).toBeNull();
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run --config web/vite.config.js web/src/App.test.js`
Expected: FAIL，找不到連結

- [ ] **Step 3: 實作**

`QuestTab.svelte` script：
```js
  import { formatWeekLabel, timesheetReportUrl } from '../lib/timesheet.js';
  let openProjectUrl = $state(null);
  // onMount 內：
    if (config.status === 'fulfilled') {
      target = config.value.dailyTargetHours;
      openProjectUrl = config.value.openProjectUrl ?? null;
    }
  // 報表連結跟著頂端所選日期換週；示例模式沒有 OpenProject 網址就不顯示。
  const timesheetHref = $derived(openProjectUrl ? timesheetReportUrl(openProjectUrl, date) : null);
```
markup（取代原本的 `<TodayLog .../>`）：
```svelte
  <div class="log-column">
    {#if timesheetHref}
      <a class="btn timesheet-link" href={timesheetHref} target="_blank" rel="noopener noreferrer">匯出工時表（{formatWeekLabel(date)}）↗</a>
    {/if}
    <TodayLog {entries} {target} {loading} {loadError} onedit={openEdit} ondelete={removeEntry} />
  </div>
```
`pixel.css`（`.layout` 之後）：
```css
.log-column { display: grid; gap: 12px; }
.timesheet-link { justify-self: end; text-decoration: none; }
```

- [ ] **Step 4: 執行，確認通過**

Run: `npm run test:web`
Expected: 全部 PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add Weekly Timesheet Export Link To Quest Tab`）

### Task 4: 驗證與文件

- [ ] `npm test` 全部通過；`npm run build` 成功。
- [ ] 以另一個埠號啟動即時模式（不動使用者的 4173），用瀏覽器確認：連結顯示本週，`href` 正確，切換到上週後跟著更新，沒有 CSP 錯誤。示例模式不顯示連結。
- [ ] 實際打開連結需要使用者的 OpenProject 登入狀態，請使用者點一次確認。
- [ ] 更新 `handoff.md`（架構重點、已驗證）與 `tasks/todo.md`，Commit（`[DOCS]: Record Timesheet Export Link`）。
