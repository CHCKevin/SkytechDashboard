# 任務布告欄 — 前端實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 Svelte 5 + Vite 做出「木製酒館布告欄」像素風介面：常駐任務、特別任務、本日已接任務、接任務／修改視窗、日期切換，呼叫後端計畫完成的本機 API。

**Architecture:** `web/` 為 Vite 根目錄，產物輸出到 `web/dist`，由 Node 伺服器以固定 CSP 提供。`web/src/lib/api.js` 是唯一呼叫 `/api` 的模組。純邏輯（日期、時數、合計）放在 `web/src/lib/*.js` 並以 Vitest 測試；元件以 Svelte Testing Library 測試。全站樣式集中在 `web/src/styles/pixel.css`。

**Tech Stack:** Svelte 5（runes）、Vite、Vitest、@testing-library/svelte、@testing-library/user-event、jsdom；字型「俐方體11號 Cubic 11」（SIL OFL）。

**前置條件：** `docs/superpowers/plans/2026-11-16-quest-board-backend.md` 全部完成，`npm test` 通過。

**設計文件：** `docs/superpowers/specs/2026-11-16-quest-board-time-tracking-design.md`；版面草圖 `.superpowers/brainstorm/2008-1794799601/content/layout.html`。

---

## 共用約定

- Commit 格式同後端計畫（`[TYPE]: Title`＋What／How／Change＋Co-Authored-By）。
- **CSP 限制**（正式產物以 `default-src 'self'` 提供），所有元件必須遵守：
  - 不使用 `style="..."` 屬性或 Svelte `style:` 指令；動態寬度只用 `web/src/lib/actions.js` 的 `barWidth` action（透過 CSSOM 設定，CSP 允許）。
  - 不使用 Svelte `transition:`／`animate:`（會動態插入 `<style>`）；動畫一律用 CSS class。
  - `vite.config.js` 設 `assetsInlineLimit: 0`，避免字型被內嵌成 `data:` URI（會被 CSP 擋）。
- 日期一律用 `web/src/lib/dates.js`，禁止 `toISOString()`。

**檔案結構**

```
web/
  index.html
  vite.config.js
  src/
    main.js                 掛載 App、載入全域樣式
    App.svelte              狀態與流程：日期、使用者、任務、工時、視窗
    styles/pixel.css        字型、色彩 token、木板／羊皮紙／按鈕／視窗
    assets/fonts/           Cubic_11.woff2、OFL.txt
    lib/
      dates.js              本地日期：todayLocal、addDays、formatDay
      hours.js              QUICK_HOURS、parseHoursInput
      totals.js             sumHours、progressPercent
      actions.js            barWidth action
      api.js                ApiError 與所有 /api 呼叫
    components/
      TopBar.svelte         標題、日期切換、使用者
      QuestBoard.svelte     常駐任務卡、釘上新任務、children（特別任務）
      WorkPackageSearch.svelte  編號／名稱搜尋（300ms 防抖）
      SpecialQuest.svelte   特別任務區塊
      TodayLog.svelte       已接任務清單、合計、進度條
      AcceptDialog.svelte   接任務／修改共用視窗
      PinDialog.svelte      釘上常駐任務（搜尋＋預設活動）
```

---

### Task 1: 建立 Vite + Svelte + Vitest 工具鏈

**Files:**
- Create: `web/vite.config.js`、`web/index.html`、`web/src/main.js`、`web/src/App.svelte`、`web/src/lib/smoke.test.js`
- Modify: `package.json`

- [ ] **Step 1: 安裝開發依賴**

```bash
npm install -D vite svelte @sveltejs/vite-plugin-svelte vitest @testing-library/svelte @testing-library/user-event jsdom
```

安裝後確認 `package.json` 的 `devDependencies` 版本彼此相容（`@sveltejs/vite-plugin-svelte` 的 peerDependencies 須涵蓋安裝到的 vite 與 svelte 主版本；`npm ls` 無 peer 錯誤）。若有衝突，依 plugin 的 peer 範圍降版 vite。

- [ ] **Step 2: 更新 `package.json` scripts**

```json
  "scripts": {
    "test": "node --test tests/*.test.mjs && vitest run --config web/vite.config.js",
    "test:server": "node --test tests/*.test.mjs",
    "test:web": "vitest run --config web/vite.config.js",
    "dev:web": "vite --config web/vite.config.js",
    "build": "vite build --config web/vite.config.js",
    "start": "node server/index.mjs",
    "demo": "node server/index.mjs --config config/example.json"
  },
```

- [ ] **Step 3: 建立 `web/vite.config.js`**

```js
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const api = 'http://127.0.0.1:4173';

export default defineConfig({
  root,
  plugins: [svelte(), svelteTesting()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 正式 CSP 為 default-src 'self'，不可把字型或圖片內嵌成 data: URI。
    assetsInlineLimit: 0,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // 開發時轉發到 Node；Host 與 Origin 改寫成 Node 位址，伺服器端檢查不需放寬。
      '/api': {
        target: api,
        changeOrigin: true,
        configure: proxy => proxy.on('proxyReq', req => {
          if (req.getHeader('origin')) req.setHeader('origin', api);
        }),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    // 在 UTC+8 下執行，讓 toISOString() 造成的跨日錯誤能被測出來。
    env: { TZ: 'Asia/Taipei' },
  },
});
```

- [ ] **Step 4: 建立 `web/index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>冒險者工時公會</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 5: 建立 `web/src/main.js` 與暫時的 `web/src/App.svelte`**

```js
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app') });
```

```svelte
<h1>冒險者工時公會</h1>
```

- [ ] **Step 6: 建立冒煙測試 `web/src/lib/smoke.test.js`**

```js
import { expect, test } from 'vitest';

test('vitest runs in Asia/Taipei', () => {
  expect(new Date(Date.UTC(2026, 10, 15, 23, 30)).getDate()).toBe(16);
});
```

- [ ] **Step 7: 驗證**

Run: `npm run test:web`
Expected: 1 passed。

Run: `npm run build`
Expected: 產生 `web/dist/index.html` 與 `web/dist/assets/index-*.js`。確認 `web/dist/index.html` 內沒有 inline `<script>`（只有 `src=` 外部腳本）。

Run: `npm test`
Expected: 後端與前端測試全部通過。

- [ ] **Step 8: Commit**（`[CHORE]: Set Up Svelte Vite Toolchain`，Change：`package.json`、`package-lock.json`、`web/vite.config.js`、`web/index.html`、`web/src/main.js`、`web/src/App.svelte`、`web/src/lib/smoke.test.js`）

---

### Task 2: 本地日期工具

**Files:**
- Create: `web/src/lib/dates.js`
- Test: `web/src/lib/dates.test.js`（並刪除 `smoke.test.js`，其斷言移入此檔）

- [ ] **Step 1: 寫測試**

```js
import { expect, test } from 'vitest';
import { addDays, formatDay, todayLocal } from './dates.js';

test('todayLocal uses local date parts, not UTC', () => {
  // 台北 07:30 時 UTC 仍是前一天；toISOString() 會得到 2026-11-15。
  expect(todayLocal(new Date(2026, 10, 16, 7, 30))).toBe('2026-11-16');
  expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
});
test('addDays crosses month and year boundaries', () => {
  expect(addDays('2026-11-16', -1)).toBe('2026-11-15');
  expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
});
test('formatDay appends the weekday', () => {
  expect(formatDay('2026-11-16')).toBe('2026-11-16（一）');
  expect(formatDay('2026-11-22')).toBe('2026-11-22（日）');
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test:web`
Expected: FAIL（找不到 `./dates.js`）

- [ ] **Step 3: 實作 `web/src/lib/dates.js`**

```js
// 一律以本地年月日計算；toISOString() 在 UTC+8 的 08:00 前會得到前一天。
const pad = value => String(value).padStart(2, '0');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function todayLocal(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toLocalDate(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

export function addDays(day, amount) {
  const date = toLocalDate(day);
  date.setDate(date.getDate() + amount);
  return todayLocal(date);
}

export function formatDay(day) {
  return `${day}（${WEEKDAYS[toLocalDate(day).getDay()]}）`;
}
```

- [ ] **Step 4: 執行確認通過**，並 `git rm web/src/lib/smoke.test.js`

Run: `npm run test:web`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add Local Date Helpers`，Change：`web/src/lib/dates.js`、`web/src/lib/dates.test.js`、`web/src/lib/smoke.test.js`）

---

### Task 3: 時數、合計與進度條 action

**Files:**
- Create: `web/src/lib/hours.js`、`web/src/lib/totals.js`、`web/src/lib/actions.js`
- Test: `web/src/lib/hours.test.js`、`web/src/lib/totals.test.js`

- [ ] **Step 1: 寫測試**

`web/src/lib/hours.test.js`：

```js
import { expect, test } from 'vitest';
import { QUICK_HOURS, parseHoursInput } from './hours.js';

test('quick hour buttons', () => {
  expect(QUICK_HOURS).toEqual([0.5, 1, 2, 4]);
});
test('parseHoursInput accepts up to two decimals within (0, 24]', () => {
  expect(parseHoursInput('2.5')).toEqual({ value: 2.5 });
  expect(parseHoursInput(' 1 ')).toEqual({ value: 1 });
  expect(parseHoursInput('0.25')).toEqual({ value: 0.25 });
  expect(parseHoursInput('24')).toEqual({ value: 24 });
});
test('parseHoursInput rejects bad input with a message', () => {
  for (const bad of ['', 'abc', '1.234', '-1', '1e2', '.5', '2.']) {
    expect(parseHoursInput(bad).error).toMatch(/時數/);
  }
  for (const bad of ['0', '0.00', '24.5']) {
    expect(parseHoursInput(bad).error).toBe('時數必須大於 0、不超過 24');
  }
});
```

`web/src/lib/totals.test.js`：

```js
import { expect, test } from 'vitest';
import { progressPercent, sumHours } from './totals.js';

test('sumHours rounds to two decimals', () => {
  expect(sumHours([])).toBe(0);
  expect(sumHours([{ hours: 0.1 }, { hours: 0.2 }])).toBe(0.3);
  expect(sumHours([{ hours: 2.5 }, { hours: 1 }, { hours: 2 }])).toBe(5.5);
});
test('progressPercent is capped at 100 and safe for bad targets', () => {
  expect(progressPercent(5.5, 8)).toBe(69);
  expect(progressPercent(10, 8)).toBe(100);
  expect(progressPercent(1, 0)).toBe(0);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test:web`
Expected: FAIL

- [ ] **Step 3: 實作**

`web/src/lib/hours.js`：

```js
export const QUICK_HOURS = [0.5, 1, 2, 4];

// 與後端驗證一致：大於 0、不超過 24、最多兩位小數。
export function parseHoursInput(text) {
  const trimmed = String(text ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { error: '請輸入時數，例如 1 或 2.5（最多兩位小數）' };
  const value = Number(trimmed);
  if (value <= 0 || value > 24) return { error: '時數必須大於 0、不超過 24' };
  return { value };
}
```

`web/src/lib/totals.js`：

```js
export function sumHours(entries) {
  return Math.round(entries.reduce((sum, entry) => sum + entry.hours, 0) * 100) / 100;
}

export function progressPercent(total, target) {
  if (!(target > 0)) return 0;
  return Math.min(100, Math.round((total / target) * 100));
}
```

`web/src/lib/actions.js`：

```js
// 透過 CSSOM 設定寬度；CSP 不允許 inline style 屬性，但允許腳本修改 element.style。
export function barWidth(node, percent) {
  node.style.width = `${percent}%`;
  return {
    update(next) {
      node.style.width = `${next}%`;
    },
  };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test:web`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add Hours Parsing And Daily Totals`，Change：上述五個檔案）

---

### Task 4: API 用戶端

**Files:**
- Create: `web/src/lib/api.js`
- Test: `web/src/lib/api.test.js`

- [ ] **Step 1: 寫測試**

```js
import { afterEach, expect, test, vi } from 'vitest';
import * as api from './api.js';

function mockFetch(status, body) {
  const fn = vi.fn(async () => ({
    status, ok: status >= 200 && status < 300,
    json: async () => { if (body === undefined) throw new SyntaxError('no body'); return body; },
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

test('reads use GET without the write header', async () => {
  const fetch = mockFetch(200, [{ id: 1 }]);
  expect(await api.listEntries('2026-11-16')).toEqual([{ id: 1 }]);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('/api/time-entries?date=2026-11-16');
  expect(init.method).toBe('GET');
  expect(init.headers['X-Quest-Board']).toBeUndefined();
});
test('writes send JSON with the write header', async () => {
  const fetch = mockFetch(201, { id: 9 });
  await api.createEntry({ workPackageId: 1, date: '2026-11-16', hours: 1, activityId: null, comment: '' });
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('/api/time-entries');
  expect(init.method).toBe('POST');
  expect(init.headers['X-Quest-Board']).toBe('1');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(init.body).workPackageId).toBe(1);
});
test('delete returns null on 204 and still sends the write header', async () => {
  const fetch = mockFetch(204);
  expect(await api.deleteEntry(5)).toBeNull();
  expect(fetch.mock.calls[0][0]).toBe('/api/time-entries/5');
  expect(fetch.mock.calls[0][1].headers['X-Quest-Board']).toBe('1');
  expect(fetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
});
test('server errors become ApiError with code, message and field', async () => {
  mockFetch(400, { error: { code: 'invalid_input', message: '時數錯誤', field: 'hours' } });
  await expect(api.createEntry({})).rejects.toMatchObject({ name: 'ApiError', status: 400, code: 'invalid_input', message: '時數錯誤', field: 'hours' });
  mockFetch(500);
  await expect(api.getMe()).rejects.toMatchObject({ status: 500, code: 'http_error', message: '伺服器回應錯誤（500）' });
});
test('network failures become a network ApiError', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
  await expect(api.getMe()).rejects.toMatchObject({ status: 0, code: 'network' });
});
test('query parameters are encoded', async () => {
  const fetch = mockFetch(200, []);
  await api.searchWorkPackages('#12 登入');
  expect(fetch.mock.calls[0][0]).toBe(`/api/work-packages/search?q=${encodeURIComponent('#12 登入')}`);
  await api.listActivities(7);
  expect(fetch.mock.calls[1][0]).toBe('/api/activities?workPackageId=7');
  await api.unpinQuest(7);
  expect(fetch.mock.calls[2][0]).toBe('/api/quests/7');
  expect(fetch.mock.calls[2][1].method).toBe('DELETE');
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test:web`
Expected: FAIL

- [ ] **Step 3: 實作 `web/src/lib/api.js`**

```js
// 唯一呼叫本機 /api 的模組；寫入一律帶 X-Quest-Board 標頭（伺服器的 CSRF 檢查）。
export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-Quest-Board'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network', '無法連線到本機伺服器，請確認伺服器仍在執行');
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const error = data?.error;
    throw new ApiError(res.status, error?.code ?? 'http_error', error?.message ?? `伺服器回應錯誤（${res.status}）`, error?.field);
  }
  return data;
}

export const getMe = () => request('/api/me');
export const getConfig = () => request('/api/config');
export const listEntries = date => request(`/api/time-entries?date=${encodeURIComponent(date)}`);
export const createEntry = input => request('/api/time-entries', { method: 'POST', body: input });
export const updateEntry = (id, patch) => request(`/api/time-entries/${id}`, { method: 'PATCH', body: patch });
export const deleteEntry = id => request(`/api/time-entries/${id}`, { method: 'DELETE' });
export const searchWorkPackages = query => request(`/api/work-packages/search?q=${encodeURIComponent(query)}`);
export const listActivities = workPackageId => request(`/api/activities?workPackageId=${workPackageId}`);
export const listQuests = () => request('/api/quests');
export const pinQuest = input => request('/api/quests', { method: 'POST', body: input });
export const unpinQuest = workPackageId => request(`/api/quests/${workPackageId}`, { method: 'DELETE' });
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test:web`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add Frontend API Client`，Change：`web/src/lib/api.js`、`web/src/lib/api.test.js`）

---

### Task 5: 像素字型與全域樣式

**Files:**
- Create: `web/src/assets/fonts/Cubic_11.woff2`、`web/src/assets/fonts/OFL.txt`、`web/src/styles/pixel.css`
- Modify: `web/src/main.js`

- [ ] **Step 1: 取得字型**

先列出倉庫中的字型檔路徑（不要猜路徑）：

```bash
curl -s https://api.github.com/repos/ACh-K/Cubic-11/git/trees/main?recursive=1 | grep -o '"path": "[^"]*\(woff2\|OFL[^"]*\|LICENSE[^"]*\)"'
```

從列出的路徑下載 `Cubic_11.woff2` 與授權檔（以 `https://raw.githubusercontent.com/ACh-K/Cubic-11/main/<path>`），存成 `web/src/assets/fonts/Cubic_11.woff2` 與 `web/src/assets/fonts/OFL.txt`。確認授權檔內容為 SIL Open Font License。同時讀倉庫 README，找出字型的設計格線／建議字級（例如「12px 或其倍數」），在 Step 2 把 `--fs-1` 設為該值、`--fs-2` 設為兩倍。

若倉庫沒有 woff2 或無法下載：改用 Zpix（`https://github.com/SolidZORO/zpix-pixel-font`），同樣先列出路徑再下載，檔名改為 `zpix.woff2`／`zpix.ttf`，並同步修改 Step 2 的 `@font-face`；Zpix 的授權條款也要一併保存並在 commit 中註明。

- [ ] **Step 2: 建立 `web/src/styles/pixel.css`**

```css
@font-face {
  font-family: 'Cubic11';
  src: url('../assets/fonts/Cubic_11.woff2') format('woff2');
  font-display: swap;
}

:root {
  --ink: #2b1a0e;
  --wall: #3b2414;
  --wall-dark: #24150b;
  --wood: #6b4226;
  --wood-dark: #5e3a21;
  --wood-light: #8a5a35;
  --parchment: #f1e2b8;
  --parchment-dark: #e8d29a;
  --paper: #fff8e0;
  --brass: #c9a25a;
  --seal: #c0392b;
  --leaf: #4a8a3a;
  --font: 'Cubic11', 'Microsoft JhengHei', monospace;
  /* 點陣字只有在設計格線的整數倍才銳利；--fs-1 依 Step 1 讀到的建議字級設定，其他字級只能是它的整數倍。 */
  --fs-1: 12px;
  --fs-2: 24px;
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--wall);
  color: var(--ink);
  font-family: var(--font);
  font-size: var(--fs-1);
  line-height: 1.5;
  -webkit-font-smoothing: none;
}
button, input, select, textarea { font: inherit; color: inherit; }

.app { max-width: 1200px; margin: 0 auto; padding: 16px; border: 6px solid var(--wall-dark); min-height: 100vh; }

/* 頂部列 */
.topbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; color: var(--parchment); text-shadow: 2px 2px 0 #000; margin-bottom: 16px; }
.guild { font-size: var(--fs-2); margin: 0; font-weight: normal; }
.date-nav { display: flex; gap: 8px; align-items: center; font-size: var(--fs-2); }

/* 按鈕 */
.btn { background: var(--brass); color: var(--ink); border: 3px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); padding: 2px 12px; cursor: pointer; text-shadow: none; }
.btn:active:not(:disabled) { transform: translate(3px, 3px); box-shadow: none; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--seal); color: var(--parchment); }
.link { background: none; border: none; padding: 0 2px; cursor: pointer; text-decoration: underline; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px dashed var(--seal); outline-offset: 2px; }

/* 版面 */
.layout { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }

/* 木板 */
.board { background: repeating-linear-gradient(0deg, var(--wood) 0 10px, var(--wood-dark) 10px 12px); border: 6px solid var(--ink); box-shadow: inset 0 0 0 3px var(--wood-light); padding: 16px; }
.board-title { color: var(--parchment); text-shadow: 2px 2px 0 var(--ink); font-size: var(--fs-2); font-weight: normal; margin: 0 0 12px; }

/* 任務單 */
.notes { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; margin-bottom: 18px; }
.note { position: relative; background: var(--parchment); border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); min-height: 96px; }
.note::before { content: ''; position: absolute; top: -8px; left: calc(50% - 5px); width: 10px; height: 10px; background: var(--seal); border: 2px solid var(--ink); }
.note-main { display: flex; flex-direction: column; gap: 2px; width: 100%; height: 100%; padding: 12px 10px 8px; background: none; border: none; text-align: left; cursor: pointer; }
.note-main:hover { background: var(--paper); }
.note-id { font-size: var(--fs-1); opacity: 0.7; }
.note-meta { font-size: var(--fs-1); opacity: 0.8; margin-top: auto; }
.note-x { position: absolute; top: 2px; right: 4px; background: none; border: none; cursor: pointer; opacity: 0.5; font-size: var(--fs-1); }
.note-x:hover { opacity: 1; color: var(--seal); }
.note-add { background: transparent; border: 3px dashed var(--parchment); color: var(--parchment); box-shadow: none; cursor: pointer; text-shadow: 2px 2px 0 var(--ink); }
.note-add::before { display: none; }

/* 羊皮紙面板 */
.parchment { background: var(--parchment); border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); padding: 12px; }
.special { background: var(--parchment-dark); }
.special h3 { margin: 0 0 6px; font-size: var(--fs-1); font-weight: normal; }

/* 搜尋 */
.search-input { width: 100%; background: var(--paper); border: 3px solid var(--ink); padding: 4px 8px; }
.suggestions { list-style: none; margin: 0; padding: 0; border: 3px solid var(--ink); border-top: none; background: var(--paper); }
.suggestions button { display: block; width: 100%; text-align: left; background: none; border: none; padding: 4px 8px; cursor: pointer; }
.suggestions button:hover, .suggestions button:focus-visible { background: var(--brass); }
.suggestions small { margin-left: 8px; opacity: 0.7; }
.hint { font-size: var(--fs-1); margin: 4px 0 0; }
.error { color: var(--seal); }

/* 已接任務 */
.entries { list-style: none; margin: 0; padding: 0; }
.entry { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 6px 0; border-bottom: 2px dashed var(--wood-light); }
.entry-meta { grid-column: 1 / -1; font-size: var(--fs-1); opacity: 0.8; }
.entry-actions { grid-column: 1 / -1; font-size: var(--fs-1); }
.empty { opacity: 0.7; margin: 0 0 8px; }
.total { display: flex; justify-content: space-between; margin-top: 10px; font-size: var(--fs-2); }
.bar { height: 14px; border: 3px solid var(--ink); background: var(--paper); margin-top: 6px; }
.bar-fill { display: block; height: 100%; width: 0; background: var(--leaf); }
.bar-fill.done { background: var(--brass); }

/* 視窗 */
.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 10; }
.dialog { width: min(480px, 100%); border-width: 4px; box-shadow: 6px 6px 0 #000; }
.dialog h2 { font-size: var(--fs-2); font-weight: normal; margin: 0 0 10px; }
.field { display: grid; grid-template-columns: 64px 1fr; gap: 8px; align-items: center; margin: 8px 0; }
.field input, .field select, .field textarea { background: var(--paper); border: 3px solid var(--ink); padding: 2px 6px; width: 100%; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: var(--paper); border: 2px solid var(--ink); padding: 0 8px; cursor: pointer; }
.chip.on { background: var(--brass); }
.chips input { width: 6em; }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }

.banner { background: var(--seal); color: var(--parchment); border: 3px solid var(--ink); padding: 6px 10px; margin-bottom: 12px; }
```

- [ ] **Step 3: 在 `web/src/main.js` 第一行加入** `import './styles/pixel.css';`

- [ ] **Step 4: 驗證**

Run: `npm run build`
Expected: 成功；`web/dist/assets/` 內有 `Cubic_11-*.woff2` 獨立檔案，且 `web/dist/assets/*.css` 中**沒有** `data:font`（`grep -c "data:font" web/dist/assets/*.css` 為 0）。

- [ ] **Step 5: Commit**（`[FEATURE]: Add Pixel Font And Tavern Board Styles`，Change：`web/src/assets/fonts/`、`web/src/styles/pixel.css`、`web/src/main.js`）

---

### Task 6: 頂部列、任務布告欄、搜尋與特別任務

**Files:**
- Create: `web/src/components/TopBar.svelte`、`QuestBoard.svelte`、`WorkPackageSearch.svelte`、`SpecialQuest.svelte`
- Test: `web/src/components/board.test.js`

- [ ] **Step 1: 寫測試**

```js
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar.svelte';
import QuestBoard from './QuestBoard.svelte';
import WorkPackageSearch from './WorkPackageSearch.svelte';

vi.mock('../lib/api.js', () => ({ searchWorkPackages: vi.fn() }));
import { searchWorkPackages } from '../lib/api.js';

beforeEach(() => vi.mocked(searchWorkPackages).mockReset());
afterEach(() => vi.useRealTimers());

test('TopBar shows the day and moves by one day', async () => {
  const onchange = vi.fn();
  render(TopBar, { date: '2026-11-16', me: { name: 'Ted' }, onchange });
  expect(screen.getByText('2026-11-16（一）')).toBeTruthy();
  expect(screen.getByText('冒險者：Ted')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: '前一天' }));
  await userEvent.click(screen.getByRole('button', { name: '後一天' }));
  expect(onchange.mock.calls).toEqual([['2026-11-15'], ['2026-11-17']]);
});
test('QuestBoard accepts, unpins and pins quests', async () => {
  const handlers = { onaccept: vi.fn(), onunpin: vi.fn(), onpin: vi.fn() };
  const quest = { workPackageId: 1234, subject: '前端登入頁改版', activityId: 3, activityName: 'Development' };
  render(QuestBoard, { quests: [quest, { workPackageId: 5, subject: 'X', activityId: null, activityName: null }], ...handlers });
  expect(screen.getByText('預設：Development')).toBeTruthy();
  expect(screen.getByText('預設：不指定')).toBeTruthy();
  await userEvent.click(screen.getByText('前端登入頁改版'));
  expect(handlers.onaccept).toHaveBeenCalledWith(quest);
  await userEvent.click(screen.getByRole('button', { name: '撕下 #1234' }));
  expect(handlers.onunpin).toHaveBeenCalledWith(quest);
  await userEvent.click(screen.getByRole('button', { name: /釘上/ }));
  expect(handlers.onpin).toHaveBeenCalled();
});
test('WorkPackageSearch debounces, lists results, and selects one', async () => {
  vi.mocked(searchWorkPackages).mockResolvedValue([{ id: 2310, subject: '匯出報表效能問題', project: '維運' }]);
  const onselect = vi.fn();
  // 防抖時間要長於連續按鍵間隔，才能驗證「只搜尋一次」。
  render(WorkPackageSearch, { onselect, delay: 50 });
  const input = screen.getByRole('searchbox');
  await userEvent.type(input, '#231');
  expect(await screen.findByText(/匯出報表效能問題/)).toBeTruthy();
  expect(searchWorkPackages).toHaveBeenCalledTimes(1);
  expect(searchWorkPackages).toHaveBeenCalledWith('#231');
  await userEvent.click(screen.getByRole('button', { name: /#2310/ }));
  expect(onselect).toHaveBeenCalledWith({ id: 2310, subject: '匯出報表效能問題', project: '維運' });
  expect(input.value).toBe('');
});
test('WorkPackageSearch shows empty and error states', async () => {
  vi.mocked(searchWorkPackages).mockResolvedValue([]);
  render(WorkPackageSearch, { onselect: vi.fn(), delay: 0 });
  await userEvent.type(screen.getByRole('searchbox'), 'z');
  expect(await screen.findByText('找不到符合的 work package')).toBeTruthy();
  vi.mocked(searchWorkPackages).mockRejectedValue(new Error('OpenProject 連不上'));
  await userEvent.type(screen.getByRole('searchbox'), 'z');
  expect(await screen.findByText('OpenProject 連不上')).toBeTruthy();
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test:web`
Expected: FAIL（找不到元件）

- [ ] **Step 3: 實作元件**

`web/src/components/TopBar.svelte`：

```svelte
<script>
  import { addDays, formatDay, todayLocal } from '../lib/dates.js';

  let { date, me, onchange } = $props();
</script>

<header class="topbar">
  <h1 class="guild">⚔ 冒險者工時公會</h1>
  <nav class="date-nav" aria-label="切換日期">
    <button class="btn" aria-label="前一天" onclick={() => onchange(addDays(date, -1))}>◀</button>
    <span>{formatDay(date)}</span>
    <button class="btn" aria-label="後一天" onclick={() => onchange(addDays(date, 1))}>▶</button>
    <button class="btn" disabled={date === todayLocal()} onclick={() => onchange(todayLocal())}>今天</button>
  </nav>
  <span>冒險者：{me?.name ?? '…'}</span>
</header>
```

`web/src/components/QuestBoard.svelte`：

```svelte
<script>
  let { quests, onaccept, onunpin, onpin, children } = $props();
</script>

<section class="board" aria-labelledby="board-title">
  <h2 id="board-title" class="board-title">📜 常駐任務</h2>
  <div class="notes">
    {#each quests as quest (quest.workPackageId)}
      <article class="note">
        <button class="note-main" onclick={() => onaccept(quest)}>
          <span class="note-id">#{quest.workPackageId}</span>
          <span>{quest.subject}</span>
          <span class="note-meta">預設：{quest.activityName ?? '不指定'}</span>
        </button>
        <button class="note-x" aria-label={`撕下 #${quest.workPackageId}`} onclick={() => onunpin(quest)}>✕</button>
      </article>
    {/each}
    <button class="note note-add" onclick={onpin}>＋ 釘上常駐任務</button>
  </div>
  {@render children?.()}
</section>
```

`web/src/components/WorkPackageSearch.svelte`：

```svelte
<script>
  import { searchWorkPackages } from '../lib/api.js';

  let { onselect, label = '搜尋 work package', delay = 300 } = $props();
  let query = $state('');
  let results = $state([]);
  let message = $state('');
  let searching = $state(false);
  let timer;
  let latest = 0;

  function oninput() {
    clearTimeout(timer);
    const term = query.trim();
    if (!term) {
      latest += 1;
      results = [];
      message = '';
      searching = false;
      return;
    }
    timer = setTimeout(() => run(term), delay);
  }

  // 只採用最後一次搜尋的結果，避免較慢的舊回應覆蓋新結果。
  async function run(term) {
    const mine = ++latest;
    searching = true;
    try {
      const found = await searchWorkPackages(term);
      if (mine !== latest) return;
      results = found;
      message = found.length ? '' : '找不到符合的 work package';
    } catch (error) {
      if (mine !== latest) return;
      results = [];
      message = error.message;
    } finally {
      if (mine === latest) searching = false;
    }
  }

  function choose(workPackage) {
    latest += 1;
    clearTimeout(timer);
    query = '';
    results = [];
    message = '';
    onselect(workPackage);
  }

  $effect(() => () => clearTimeout(timer));
</script>

<input class="search-input" type="search" aria-label={label} placeholder="輸入編號（#123）或名稱" autocomplete="off"
  bind:value={query} {oninput} />
{#if searching}<p class="hint">搜尋中…</p>{/if}
{#if message}<p class="hint error" role="status">{message}</p>{/if}
{#if results.length}
  <ul class="suggestions" aria-label="搜尋結果">
    {#each results as workPackage (workPackage.id)}
      <li>
        <button onclick={() => choose(workPackage)}>#{workPackage.id} {workPackage.subject}<small>{workPackage.project}</small></button>
      </li>
    {/each}
  </ul>
{/if}
```

`web/src/components/SpecialQuest.svelte`：

```svelte
<script>
  import WorkPackageSearch from './WorkPackageSearch.svelte';

  let { onselect } = $props();
</script>

<div class="parchment special">
  <h3>🗡 特別任務 <small>臨時、不常用的 work package</small></h3>
  <WorkPackageSearch label="搜尋特別任務" {onselect} />
</div>
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test:web`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add Top Bar Quest Board And Work Package Search`，Change：四個元件與 `board.test.js`）

---

### Task 7: 本日已接任務

**Files:**
- Create: `web/src/components/TodayLog.svelte`
- Test: `web/src/components/TodayLog.test.js`

- [ ] **Step 1: 寫測試**

```js
import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TodayLog from './TodayLog.svelte';

const entries = [
  { id: 1, workPackageId: 1234, workPackageSubject: '登入頁', date: '2026-11-16', hours: 2.5, activityId: 3, activityName: 'Development', comment: '調整驗證' },
  { id: 2, workPackageId: null, workPackageSubject: '週會', date: '2026-11-16', hours: 1, activityId: null, activityName: null, comment: '' },
];

test('lists entries with total and progress', () => {
  const { container } = render(TodayLog, { entries, target: 8, onedit: vi.fn(), ondelete: vi.fn() });
  expect(screen.getByText('#1234 登入頁')).toBeTruthy();
  expect(screen.getByText('Development · 調整驗證')).toBeTruthy();
  expect(screen.getByText('3.5 / 8h')).toBeTruthy();
  const bar = screen.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBe('3.5');
  expect(container.querySelector('.bar-fill').style.width).toBe('44%');
  expect(container.querySelector('[style]')).toBe(container.querySelector('.bar-fill'));
});
test('edit is only offered for work package entries; delete for all', async () => {
  const onedit = vi.fn();
  const ondelete = vi.fn();
  render(TodayLog, { entries, target: 8, onedit, ondelete });
  const edits = screen.getAllByRole('button', { name: /改/ });
  expect(edits).toHaveLength(1);
  await userEvent.click(edits[0]);
  expect(onedit).toHaveBeenCalledWith(entries[0]);
  await userEvent.click(screen.getAllByRole('button', { name: /刪/ })[1]);
  expect(ondelete).toHaveBeenCalledWith(entries[1]);
});
test('empty day shows a hint and zero total', () => {
  render(TodayLog, { entries: [], target: 8, onedit: vi.fn(), ondelete: vi.fn() });
  expect(screen.getByText('這天還沒有接任務')).toBeTruthy();
  expect(screen.getByText('0 / 8h')).toBeTruthy();
});
```

（第一個測試的最後一行確認 DOM 中唯一有 style 屬性的是由 action 設定的進度條，沒有模板產生的 inline style。）

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test:web`
Expected: FAIL

- [ ] **Step 3: 實作 `web/src/components/TodayLog.svelte`**

```svelte
<script>
  import { barWidth } from '../lib/actions.js';
  import { progressPercent, sumHours } from '../lib/totals.js';

  let { entries, target, onedit, ondelete } = $props();
  const total = $derived(sumHours(entries));
  const percent = $derived(progressPercent(total, target));
</script>

<section aria-labelledby="log-title">
  <h2 id="log-title" class="board-title">🎒 本日已接任務</h2>
  <div class="parchment">
    {#if !entries.length}<p class="empty">這天還沒有接任務</p>{/if}
    <ul class="entries">
      {#each entries as entry (entry.id)}
        <li class="entry">
          <span>{entry.workPackageId ? `#${entry.workPackageId} ` : ''}{entry.workPackageSubject}</span>
          <b>{entry.hours}h</b>
          {#if entry.activityName || entry.comment}
            <small class="entry-meta">{[entry.activityName, entry.comment].filter(Boolean).join(' · ')}</small>
          {/if}
          <span class="entry-actions">
            {#if entry.workPackageId}
              <button class="link" aria-label={`改 #${entry.workPackageId}`} onclick={() => onedit(entry)}>[改]</button>
            {/if}
            <button class="link" aria-label={`刪 ${entry.workPackageSubject}`} onclick={() => ondelete(entry)}>[刪]</button>
          </span>
        </li>
      {/each}
    </ul>
    <div class="total"><span>本日合計</span><b>{total} / {target}h</b></div>
    <div class="bar" role="progressbar" aria-label="本日進度" aria-valuemin="0" aria-valuemax={target} aria-valuenow={total}>
      <i class="bar-fill" class:done={percent >= 100} use:barWidth={percent}></i>
    </div>
  </div>
</section>
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test:web`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add Today Log With Progress Bar`，Change：`TodayLog.svelte`、`TodayLog.test.js`）

---

### Task 8: 接任務／修改視窗

**Files:**
- Create: `web/src/components/AcceptDialog.svelte`
- Test: `web/src/components/AcceptDialog.test.js`

- [ ] **Step 1: 寫測試**

```js
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import AcceptDialog from './AcceptDialog.svelte';

vi.mock('../lib/api.js', () => ({ listActivities: vi.fn() }));
import { listActivities } from '../lib/api.js';

const activities = [{ id: 1, name: 'Management', default: true }, { id: 3, name: 'Development', default: false }];
const base = (overrides = {}) => ({
  mode: 'create',
  workPackage: { id: 1234, subject: '前端登入頁改版' },
  initial: { date: '2026-11-16', hours: null, activityId: 3, activityName: 'Development', comment: '' },
  onsubmit: vi.fn(async () => {}),
  oncancel: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.mocked(listActivities).mockReset();
  vi.mocked(listActivities).mockResolvedValue(activities);
});

test('shows the work package and preselects the quest activity once loaded', async () => {
  render(AcceptDialog, base());
  expect(screen.getByRole('dialog', { name: /接下任務：#1234 前端登入頁改版/ })).toBeTruthy();
  const select = await screen.findByRole('combobox', { name: '活動' });
  expect(select.selectedOptions[0].textContent).toBe('Development');
  expect(listActivities).toHaveBeenCalledWith(1234);
});
test('quick hour chip fills the hours and submit sends the values', async () => {
  const props = base();
  render(AcceptDialog, props);
  await screen.findByRole('combobox', { name: '活動' });
  await userEvent.click(screen.getByRole('button', { name: '2' }));
  expect(screen.getByRole('textbox', { name: '時數' }).value).toBe('2');
  await userEvent.type(screen.getByRole('textbox', { name: '備註' }), '調整驗證');
  await userEvent.click(screen.getByRole('button', { name: '接下任務！' }));
  expect(props.onsubmit).toHaveBeenCalledWith({ date: '2026-11-16', hours: 2, activityId: 3, comment: '調整驗證' });
});
test('invalid hours are reported and nothing is submitted', async () => {
  const props = base();
  render(AcceptDialog, props);
  await userEvent.type(screen.getByRole('textbox', { name: '時數' }), '1.234');
  await userEvent.click(screen.getByRole('button', { name: '接下任務！' }));
  expect(screen.getByRole('alert').textContent).toMatch(/時數/);
  expect(props.onsubmit).not.toHaveBeenCalled();
});
test('submit errors keep the inputs and show the message; button disabled while pending', async () => {
  let reject;
  const props = base({ onsubmit: vi.fn(() => new Promise((_, r) => { reject = r; })) });
  render(AcceptDialog, props);
  await userEvent.type(screen.getByRole('textbox', { name: '時數' }), '1.5');
  await userEvent.click(screen.getByRole('button', { name: '接下任務！' }));
  const pending = screen.getByRole('button', { name: '送出中…' });
  expect(pending.disabled).toBe(true);
  reject(new Error('Hours can\'t be blank.'));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('Hours can\'t be blank.');
  expect(screen.getByRole('textbox', { name: '時數' }).value).toBe('1.5');
});
test('edit mode prefills values; unchanged form closes without a request', async () => {
  const props = base({ mode: 'edit', initial: { date: '2026-11-15', hours: 0.33, activityId: null, activityName: null, comment: '舊備註' } });
  render(AcceptDialog, props);
  expect(screen.getByRole('dialog', { name: /修改任務紀錄/ })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: '時數' }).value).toBe('0.33');
  expect(screen.getByRole('textbox', { name: '備註' }).value).toBe('舊備註');
  await screen.findByRole('combobox', { name: '活動' });
  await userEvent.click(screen.getByRole('button', { name: '更新紀錄' }));
  expect(props.onsubmit).not.toHaveBeenCalled();
  expect(props.oncancel).toHaveBeenCalled();
});
test('edit mode sends only the fields that changed', async () => {
  // 0.33 是 PT20M 的顯示值；沒改時數就不能寫回，否則 20 分鐘會變成 19.8 分鐘。
  const props = base({ mode: 'edit', initial: { date: '2026-11-15', hours: 0.33, activityId: 3, activityName: 'Development', comment: '舊備註' } });
  render(AcceptDialog, props);
  await screen.findByRole('combobox', { name: '活動' });
  await userEvent.type(screen.getByRole('textbox', { name: '備註' }), '，補充');
  await userEvent.click(screen.getByRole('button', { name: '更新紀錄' }));
  expect(props.onsubmit).toHaveBeenCalledWith({ comment: '舊備註，補充' });
});
test('edit keeps the original activity when the activity list fails to load', async () => {
  vi.mocked(listActivities).mockRejectedValueOnce(new Error('OpenProject 連不上'));
  const props = base({ mode: 'edit', initial: { date: '2026-11-15', hours: 1, activityId: 3, activityName: 'Development', comment: '' } });
  render(AcceptDialog, props);
  expect(await screen.findByText(/活動類型讀取失敗：OpenProject 連不上/)).toBeTruthy();
  expect(screen.getByText('Development（保留原設定）')).toBeTruthy();
  await userEvent.clear(screen.getByRole('textbox', { name: '時數' }));
  await userEvent.type(screen.getByRole('textbox', { name: '時數' }), '2');
  await userEvent.click(screen.getByRole('button', { name: '更新紀錄' }));
  expect(props.onsubmit).toHaveBeenCalledWith({ hours: 2 });
});
test('an activity missing from the list is still shown and kept', async () => {
  vi.mocked(listActivities).mockResolvedValueOnce([{ id: 1, name: 'Management', default: true }]);
  const props = base({ mode: 'edit', initial: { date: '2026-11-15', hours: 1, activityId: 9, activityName: 'Legacy', comment: '' } });
  render(AcceptDialog, props);
  const select = await screen.findByRole('combobox', { name: '活動' });
  expect(select.selectedOptions[0].textContent).toBe('Legacy');
});
test('create still submits with the quest activity when the list fails to load', async () => {
  vi.mocked(listActivities).mockRejectedValueOnce(new Error('OpenProject 連不上'));
  const props = base({ initial: { date: '2026-11-16', hours: 1, activityId: 3, activityName: 'Development', comment: '' } });
  render(AcceptDialog, props);
  expect(await screen.findByText(/活動類型讀取失敗：OpenProject 連不上/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: '接下任務！' }));
  expect(props.onsubmit).toHaveBeenCalledWith({ date: '2026-11-16', hours: 1, activityId: 3, comment: '' });
});
test('cancel calls oncancel', async () => {
  const props = base();
  render(AcceptDialog, props);
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(props.oncancel).toHaveBeenCalled();
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test:web`
Expected: FAIL

- [ ] **Step 3: 實作 `web/src/components/AcceptDialog.svelte`**

```svelte
<script>
  import { onMount } from 'svelte';
  import { listActivities } from '../lib/api.js';
  import { QUICK_HOURS, parseHoursInput } from '../lib/hours.js';

  let { mode = 'create', workPackage, initial, onsubmit, oncancel } = $props();

  let date = $state(initial.date);
  let hoursText = $state(initial.hours == null ? '' : String(initial.hours));
  let activityId = $state(initial.activityId ?? null);
  let comment = $state(initial.comment ?? '');
  let activities = $state(null);
  let activityError = $state('');
  let hoursError = $state('');
  let submitError = $state('');
  let pending = $state(false);

  const originalActivity = initial.activityId == null
    ? null
    : { id: initial.activityId, name: initial.activityName ?? `#${initial.activityId}` };
  // 原本的活動不在可選清單（或清單讀取失敗）時仍列出它，避免修改時被默默清掉。
  const missingOriginal = $derived(
    originalActivity !== null && activities !== null && !activities.some(activity => activity.id === originalActivity.id),
  );

  // 活動清單載入後才顯示下拉選單，確保預設值能被選中。讀取失敗時保留原本的活動。
  onMount(async () => {
    try {
      activities = await listActivities(workPackage.id);
    } catch (error) {
      activities = [];
      activityError = `活動類型讀取失敗：${error.message}`;
    }
  });

  // 修改模式只送出有變動的欄位：未修改的時數（例如 PT20M 顯示為 0.33）寫回會失真。
  function changedFields(values) {
    const before = { date: initial.date, hours: initial.hours, activityId: initial.activityId ?? null, comment: initial.comment ?? '' };
    return Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== before[key]));
  }

  async function submit(event) {
    event.preventDefault();
    const parsed = parseHoursInput(hoursText);
    if (parsed.error) {
      hoursError = parsed.error;
      return;
    }
    hoursError = '';
    submitError = '';
    const values = { date, hours: parsed.value, activityId, comment };
    const payload = mode === 'edit' ? changedFields(values) : values;
    if (mode === 'edit' && !Object.keys(payload).length) {
      oncancel();
      return;
    }
    pending = true;
    try {
      await onsubmit(payload);
    } catch (error) {
      submitError = error.message;
    } finally {
      pending = false;
    }
  }
</script>

<div class="overlay">
  <form class="dialog parchment" role="dialog" aria-modal="true" aria-labelledby="accept-title" onsubmit={submit}>
    <h2 id="accept-title">
      {mode === 'edit' ? '✎ 修改任務紀錄' : '📜 接下任務'}：#{workPackage.id} {workPackage.subject}
    </h2>

    <label class="field"><span>日期</span><input type="date" bind:value={date} required /></label>

    <div class="field">
      <span id="hours-label">時數</span>
      <div class="chips">
        {#each QUICK_HOURS as hours}
          <button type="button" class="chip" class:on={hoursText === String(hours)} onclick={() => (hoursText = String(hours))}>{hours}</button>
        {/each}
        <input type="text" inputmode="decimal" aria-labelledby="hours-label" placeholder="例如 2.5" bind:value={hoursText} />
      </div>
    </div>
    {#if hoursError}<p class="hint error" role="alert">{hoursError}</p>{/if}

    <div class="field">
      <span id="activity-label">活動</span>
      {#if activities === null}
        <span>讀取中…</span>
      {:else}
        <select aria-labelledby="activity-label" bind:value={activityId}>
          <option value={null}>不指定</option>
          {#if missingOriginal}
            <option value={originalActivity.id}>{activityError ? `${originalActivity.name}（保留原設定）` : originalActivity.name}</option>
          {/if}
          {#each activities as activity (activity.id)}
            <option value={activity.id}>{activity.name}</option>
          {/each}
        </select>
      {/if}
    </div>
    {#if activityError}<p class="hint error">{activityError}</p>{/if}

    <label class="field"><span>備註</span><textarea rows="3" maxlength="1000" bind:value={comment}></textarea></label>

    {#if submitError}<p class="hint error" role="alert">{submitError}</p>{/if}

    <div class="actions">
      <button type="button" class="btn" disabled={pending} onclick={oncancel}>取消</button>
      <button type="submit" class="btn btn-primary" disabled={pending}>
        {pending ? '送出中…' : mode === 'edit' ? '更新紀錄' : '接下任務！'}
      </button>
    </div>
  </form>
</div>
```

注意：測試以 `getByRole('textbox', { name: '備註' })` 找備註欄，`<label>` 包住 `<textarea>` 會讓可及名稱為「備註」；若測試找不到，改用 `aria-label="備註"`，不要改測試。

- [ ] **Step 4: 執行確認通過**

Run: `npm run test:web`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add Accept And Edit Dialog`，Change：`AcceptDialog.svelte`、`AcceptDialog.test.js`）

---

### Task 9: 釘上常駐任務視窗

**Files:**
- Create: `web/src/components/PinDialog.svelte`
- Test: `web/src/components/PinDialog.test.js`

- [ ] **Step 1: 寫測試**

```js
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PinDialog from './PinDialog.svelte';

vi.mock('../lib/api.js', () => ({ searchWorkPackages: vi.fn(), listActivities: vi.fn() }));
import { listActivities, searchWorkPackages } from '../lib/api.js';

beforeEach(() => {
  vi.mocked(searchWorkPackages).mockResolvedValue([{ id: 2051, subject: '週會與進度回報', project: '示例' }]);
  vi.mocked(listActivities).mockResolvedValue([{ id: 1, name: 'Management', default: true }]);
});

test('search, choose an activity, and pin', async () => {
  const onsubmit = vi.fn(async () => {});
  render(PinDialog, { onsubmit, oncancel: vi.fn(), searchDelay: 0 });
  await userEvent.type(screen.getByRole('searchbox'), '2051');
  await userEvent.click(await screen.findByRole('button', { name: /#2051/ }));
  expect(screen.getByText('#2051 週會與進度回報')).toBeTruthy();
  const select = await screen.findByRole('combobox', { name: '預設活動' });
  await userEvent.selectOptions(select, 'Management');
  await userEvent.click(screen.getByRole('button', { name: '釘上布告欄' }));
  expect(onsubmit).toHaveBeenCalledWith({ workPackageId: 2051, activityId: 1 });
});
test('pin button is disabled until a work package is chosen; errors are shown', async () => {
  const onsubmit = vi.fn(async () => { throw new Error('找不到該項目'); });
  render(PinDialog, { onsubmit, oncancel: vi.fn(), searchDelay: 0 });
  expect(screen.getByRole('button', { name: '釘上布告欄' }).disabled).toBe(true);
  await userEvent.type(screen.getByRole('searchbox'), '2051');
  await userEvent.click(await screen.findByRole('button', { name: /#2051/ }));
  await screen.findByRole('combobox', { name: '預設活動' });
  await userEvent.click(screen.getByRole('button', { name: '釘上布告欄' }));
  expect((await screen.findByRole('alert')).textContent).toBe('找不到該項目');
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test:web`
Expected: FAIL

- [ ] **Step 3: 實作 `web/src/components/PinDialog.svelte`**

```svelte
<script>
  import { listActivities } from '../lib/api.js';
  import WorkPackageSearch from './WorkPackageSearch.svelte';

  let { onsubmit, oncancel, searchDelay = 300 } = $props();
  let workPackage = $state(null);
  let activities = $state(null);
  let activityId = $state(null);
  let error = $state('');
  let pending = $state(false);

  async function choose(selected) {
    workPackage = selected;
    activities = null;
    activityId = null;
    error = '';
    try {
      activities = await listActivities(selected.id);
    } catch (loadError) {
      activities = [];
      error = `活動類型讀取失敗：${loadError.message}`;
    }
  }

  async function submit(event) {
    event.preventDefault();
    pending = true;
    error = '';
    try {
      await onsubmit({ workPackageId: workPackage.id, activityId });
    } catch (submitError) {
      error = submitError.message;
    } finally {
      pending = false;
    }
  }
</script>

<div class="overlay">
  <form class="dialog parchment" role="dialog" aria-modal="true" aria-labelledby="pin-title" onsubmit={submit}>
    <h2 id="pin-title">📌 釘上常駐任務</h2>
    <WorkPackageSearch label="搜尋要釘上的 work package" delay={searchDelay} onselect={choose} />
    {#if workPackage}
      <p>#{workPackage.id} {workPackage.subject}</p>
      {#if activities === null}
        <p class="hint">讀取活動類型…</p>
      {:else}
        <div class="field">
          <span id="pin-activity-label">預設活動</span>
          <select aria-labelledby="pin-activity-label" bind:value={activityId}>
            <option value={null}>不指定</option>
            {#each activities as activity (activity.id)}
              <option value={activity.id}>{activity.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    {/if}
    {#if error}<p class="hint error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="btn" disabled={pending} onclick={oncancel}>取消</button>
      <button type="submit" class="btn btn-primary" disabled={!workPackage || activities === null || pending}>釘上布告欄</button>
    </div>
  </form>
</div>
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test:web`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add Pin Quest Dialog`，Change：`PinDialog.svelte`、`PinDialog.test.js`）

---

### Task 10: App 組裝

**Files:**
- Modify (rewrite): `web/src/App.svelte`
- Test: `web/src/App.test.js`

- [ ] **Step 1: 寫測試**

```js
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import App from './App.svelte';

vi.mock('./lib/api.js', async () => {
  const { ApiError } = await vi.importActual('./lib/api.js');
  return {
    ApiError,
    getMe: vi.fn(), getConfig: vi.fn(), listQuests: vi.fn(), listEntries: vi.fn(), createEntry: vi.fn(),
    updateEntry: vi.fn(), deleteEntry: vi.fn(), listActivities: vi.fn(), searchWorkPackages: vi.fn(),
    pinQuest: vi.fn(), unpinQuest: vi.fn(),
  };
});
vi.mock('./lib/dates.js', async () => ({ ...(await vi.importActual('./lib/dates.js')), todayLocal: () => '2026-11-16' }));
import * as api from './lib/api.js';

const quest = { workPackageId: 1234, subject: '前端登入頁改版', activityId: 3, activityName: 'Development' };
const entry = { id: 7, workPackageId: 1234, workPackageSubject: '前端登入頁改版', date: '2026-11-16', hours: 2, activityId: 3, activityName: 'Development', comment: '' };

beforeEach(() => {
  vi.clearAllMocks();
  api.getMe.mockResolvedValue({ id: 1, name: 'Ted' });
  api.getConfig.mockResolvedValue({ dailyTargetHours: 8 });
  api.listQuests.mockResolvedValue([quest]);
  api.listEntries.mockResolvedValue([]);
  api.listActivities.mockResolvedValue([{ id: 3, name: 'Development', default: false }]);
});

test('loads user, quests and the day', async () => {
  render(App);
  expect(await screen.findByText('冒險者：Ted')).toBeTruthy();
  expect(await screen.findByText('前端登入頁改版')).toBeTruthy();
  expect(api.listEntries).toHaveBeenCalledWith('2026-11-16');
});
test('accepting a quest creates an entry and refreshes the list', async () => {
  api.createEntry.mockResolvedValue(entry);
  render(App);
  await userEvent.click(await screen.findByText('前端登入頁改版'));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('combobox', { name: '活動' });
  api.listEntries.mockResolvedValue([entry]);
  await userEvent.click(within(dialog).getByRole('button', { name: '2' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '接下任務！' }));
  expect(api.createEntry).toHaveBeenCalledWith({ workPackageId: 1234, date: '2026-11-16', hours: 2, activityId: 3, comment: '' });
  expect(await screen.findByText('2 / 8h')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});
test('changing the day reloads entries', async () => {
  render(App);
  await screen.findByText('冒險者：Ted');
  await userEvent.click(screen.getByRole('button', { name: '前一天' }));
  expect(api.listEntries).toHaveBeenLastCalledWith('2026-11-15');
});
test('an uncertain create reloads the day and warns instead of retrying', async () => {
  api.createEntry.mockRejectedValue(new api.ApiError(502, 'timeout', '連線 OpenProject 逾時'));
  render(App);
  await userEvent.click(await screen.findByText('前端登入頁改版'));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByRole('textbox', { name: '時數' }), '1');
  const before = api.listEntries.mock.calls.length;
  await userEvent.click(within(dialog).getByRole('button', { name: '接下任務！' }));
  expect((await within(dialog).findByRole('alert')).textContent).toMatch(/結果不確定/);
  expect(api.listEntries.mock.calls.length).toBe(before + 1);
  expect(api.createEntry).toHaveBeenCalledTimes(1);
});
test('editing sends only changed fields and refreshes', async () => {
  api.listEntries.mockResolvedValue([entry]);
  api.updateEntry.mockResolvedValue({ ...entry, hours: 4 });
  render(App);
  await userEvent.click(await screen.findByRole('button', { name: /改/ }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('combobox', { name: '活動' });
  await userEvent.click(within(dialog).getByRole('button', { name: '4' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '更新紀錄' }));
  expect(api.updateEntry).toHaveBeenCalledWith(7, { hours: 4 });
  expect(screen.queryByRole('dialog')).toBeNull();
});
test('deleting asks for confirmation', async () => {
  api.listEntries.mockResolvedValue([entry]);
  api.deleteEntry.mockResolvedValue(null);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(App);
  const button = await screen.findByRole('button', { name: /刪/ });
  await userEvent.click(button);
  expect(api.deleteEntry).not.toHaveBeenCalled();
  await userEvent.click(button);
  expect(api.deleteEntry).toHaveBeenCalledWith(7);
  confirm.mockRestore();
});
test('a failed initial load shows a banner', async () => {
  api.getMe.mockRejectedValue(new api.ApiError(502, 'unauthorized', 'OpenProject 驗證失敗，請確認 API token'));
  render(App);
  expect(await screen.findByText(/OpenProject 驗證失敗/)).toBeTruthy();
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test:web`
Expected: FAIL

- [ ] **Step 3: 實作 `web/src/App.svelte`**

```svelte
<script>
  import { onMount } from 'svelte';
  import * as api from './lib/api.js';
  import { todayLocal } from './lib/dates.js';
  import AcceptDialog from './components/AcceptDialog.svelte';
  import PinDialog from './components/PinDialog.svelte';
  import QuestBoard from './components/QuestBoard.svelte';
  import SpecialQuest from './components/SpecialQuest.svelte';
  import TodayLog from './components/TodayLog.svelte';
  import TopBar from './components/TopBar.svelte';

  // 這些錯誤代表請求可能已送達 OpenProject 但回應遺失或無法解讀，不能直接重送。
  const UNCERTAIN = new Set(['network', 'timeout', 'write_unconfirmed']);

  let date = $state(todayLocal());
  let me = $state(null);
  let target = $state(8);
  let quests = $state([]);
  let entries = $state([]);
  let banner = $state('');
  let dialog = $state(null);
  let pinning = $state(false);
  let latestLoad = 0;

  onMount(async () => {
    try {
      const [user, config, pinned] = await Promise.all([api.getMe(), api.getConfig(), api.listQuests()]);
      me = user;
      target = config.dailyTargetHours;
      quests = pinned;
    } catch (error) {
      banner = error.message;
    }
  });

  $effect(() => {
    loadEntries(date);
  });

  // 只採用最後一次讀取的結果，快速切換日期時舊回應不會蓋掉新日期。
  async function loadEntries(day) {
    const mine = ++latestLoad;
    try {
      const list = await api.listEntries(day);
      if (mine === latestLoad) entries = list;
    } catch (error) {
      if (mine === latestLoad) banner = error.message;
    }
  }

  function openCreate(workPackage, activityId = null, activityName = null) {
    dialog = { mode: 'create', workPackage, initial: { date, hours: null, activityId, activityName, comment: '' } };
  }

  function openEdit(entry) {
    dialog = {
      mode: 'edit', entryId: entry.id,
      workPackage: { id: entry.workPackageId, subject: entry.workPackageSubject },
      initial: { date: entry.date, hours: entry.hours, activityId: entry.activityId, activityName: entry.activityName, comment: entry.comment },
    };
  }

  async function submitDialog(values) {
    const current = dialog;
    try {
      if (current.mode === 'edit') await api.updateEntry(current.entryId, values);
      else await api.createEntry({ workPackageId: current.workPackage.id, ...values });
    } catch (error) {
      if (current.mode === 'create' && UNCERTAIN.has(error.code)) {
        await loadEntries(date);
        throw new Error('連線中斷，結果不確定：已重新讀取清單，請先確認這筆是否已建立，再決定是否重送');
      }
      throw error;
    }
    dialog = null;
    // 修改模式只帶有變動的欄位，values.date 可能不存在。
    if (values.date !== undefined && values.date !== date) date = values.date;
    else await loadEntries(date);
  }

  async function removeEntry(entry) {
    if (!window.confirm(`確定刪除「${entry.workPackageSubject}」${entry.hours}h 的紀錄？`)) return;
    try {
      await api.deleteEntry(entry.id);
      await loadEntries(date);
    } catch (error) {
      banner = error.message;
    }
  }

  async function unpin(quest) {
    if (!window.confirm(`把 #${quest.workPackageId} 從布告欄撕下？（已記錄的工時不受影響）`)) return;
    try {
      quests = await api.unpinQuest(quest.workPackageId);
    } catch (error) {
      banner = error.message;
    }
  }

  async function pin(input) {
    quests = await api.pinQuest(input);
    pinning = false;
  }
</script>

<div class="app">
  <TopBar {date} {me} onchange={day => (date = day)} />
  {#if banner}
    <p class="banner" role="alert">{banner} <button class="link" onclick={() => (banner = '')}>關閉</button></p>
  {/if}
  <main class="layout">
    <QuestBoard {quests}
      onaccept={quest => openCreate({ id: quest.workPackageId, subject: quest.subject }, quest.activityId, quest.activityName)}
      onunpin={unpin}
      onpin={() => (pinning = true)}>
      <SpecialQuest onselect={workPackage => openCreate(workPackage)} />
    </QuestBoard>
    <TodayLog {entries} {target} onedit={openEdit} ondelete={removeEntry} />
  </main>
</div>

{#if dialog}
  <AcceptDialog mode={dialog.mode} workPackage={dialog.workPackage} initial={dialog.initial}
    onsubmit={submitDialog} oncancel={() => (dialog = null)} />
{/if}
{#if pinning}
  <PinDialog onsubmit={pin} oncancel={() => (pinning = false)} />
{/if}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test`
Expected: 後端與前端全部 PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Assemble Quest Board App`，Change：`web/src/App.svelte`、`web/src/App.test.js`）

---

### Task 11: 正式產物在 CSP 下的瀏覽器驗證（示例模式）

**Files:** 無（發現問題時回到對應 Task 修正並補測試）

- [ ] **Step 1: 建置並以示例模式啟動**

```bash
npm run build && npm run demo
```

Expected: `示例模式已啟動：http://127.0.0.1:4173/`

- [ ] **Step 2: 以瀏覽器開啟 `http://127.0.0.1:4173/`**（使用 `run` 或 `claude-in-chrome` skill），逐項確認並截圖：

1. 開發者工具 Console **沒有** CSP 違規訊息（`Refused to apply inline style`、`Refused to load the font` 等）。
2. 字型為像素字型，100% 縮放下筆畫邊緣銳利、沒有模糊；字級可讀（若太小，記錄下來請使用者決定是否整體改用兩倍字級）。
3. 版面為木板＋羊皮紙；頂部顯示今天日期與「示例冒險者」；右側有 2 筆示例工時、合計 3.5 / 8h、進度條約 44%。
4. 「＋ 釘上常駐任務」→ 搜尋 `2051` → 選擇 → 預設活動選 Management → 釘上；布告欄出現新任務卡。
5. 點該任務卡 → 選 1h → 接下任務 → 視窗關閉、右側多一筆、合計 4.5。
6. 「特別任務」輸入 `#231` → 選 `#2310` → 填 0.5 → 接下；清單更新。
7. 點某筆 [改] → 時數改 3 → 更新；清單更新。
8. 點 [刪] → 確認 → 該筆消失。
9. ◀ 到前一天（清單空、顯示「這天還沒有接任務」）→「今天」回來。
10. 在接任務視窗輸入 `abc` 時數 → 顯示錯誤、不送出。
11. 視窗縮到 400px 寬：版面變單欄、無水平捲軸。
12. 撕下一張任務卡（✕ → 確認）。

- [ ] **Step 3: 停止伺服器**，在 `tasks/todo.md` 記錄每一項的結果與截圖檔路徑。任何一項失敗：回到對應 Task 修正、補測試、重做本 Task。

- [ ] **Step 4: Commit**（若有修正）

---

### Task 12: 連接真實 OpenProject（唯讀驗證）

**Files:** 無

- [ ] **Step 1: 在 `config/local.json` 補上 `dailyTargetHours`**（不要動 token；不要把檔案內容印到終端機）

```bash
node -e "const f='config/local.json';const fs=require('fs');const c=JSON.parse(fs.readFileSync(f));c.dailyTargetHours??=8;fs.writeFileSync(f,JSON.stringify(c,null,2));console.log('ok')"
```

- [ ] **Step 2: 啟動即時模式**：`npm run build && npm start`

- [ ] **Step 3: 瀏覽器只做讀取操作並確認**：右上角顯示使用者本人名稱；今天的工時清單與 OpenProject 原本 My time tracking 的今天一致；◀ 回到前幾天也一致；特別任務搜尋 `202` 或已知名稱能找到；「＋ 釘上常駐任務」選擇一個常用 work package（這只寫入本機 `data/quests.json`，不寫 OpenProject），活動清單與 OpenProject 一致。

- [ ] **Step 4: 檢查終端機輸出不含 token**，停止伺服器，記錄結果到 `tasks/todo.md`。

---

### Task 13: 真實寫入驗證（必須先取得使用者同意）

**Files:** 無

- [ ] **Step 1: 停下來詢問使用者**：「接下來會在正式 OpenProject 上新增一筆測試工時（work package #___，0.25h，備註『quest-board 測試，稍後刪除』），修改後再刪除。可以執行嗎？要用哪個 work package？」——未獲同意不得繼續。

- [ ] **Step 2: 同意後，以瀏覽器操作**：接任務新增 → 確認 OpenProject 原介面看得到 → [改] 時數改 0.5、備註加「已修改」→ OpenProject 確認 → [刪] → OpenProject 確認已消失。

- [ ] **Step 3: 若 OpenProject 回傳 422**（例如該 work package 不允許記錄工時），確認錯誤訊息顯示在視窗中、輸入保留——這也是本 Task 要驗證的行為之一。

- [ ] **Step 4: 記錄結果到 `tasks/todo.md`**，確認 OpenProject 上沒有殘留測試工時。

---

### Task 14: 文件收尾

**Files:**
- Modify (rewrite): `handoff.md`
- Modify: `tasks/todo.md`

- [ ] **Step 1: 改寫 `handoff.md`** 為任務布告欄專案的交接：目前階段、如何啟動（`npm run build`、`npm start`／`npm run demo`、開發時 `npm run demo`＋`npm run dev:web` 開 `http://127.0.0.1:5173`）、設定欄位（`dailyTargetHours`、`dataDir`、`staticDir`）、已驗證項目、已知限制（無計時器、無週曆、單人本機）、下一階段候選。不寫入任何 token 或個人資料。

- [ ] **Step 2: 在 `tasks/todo.md` 加上 Review 區段**：完成項目、測試數量、瀏覽器驗證與真實驗證結果、遺留問題。

- [ ] **Step 3: Commit**（`[DOCS]: Update Handoff For Quest Board`，Change：`handoff.md`、`tasks/todo.md`）

---

## 完成條件

- `npm test`（後端＋前端）全部通過，`npm run build` 成功。
- Task 11 十二項瀏覽器檢查全部通過，Console 無 CSP 違規。
- Task 12 真實唯讀驗證一致；Task 13 經使用者同意後完成並無殘留資料。
