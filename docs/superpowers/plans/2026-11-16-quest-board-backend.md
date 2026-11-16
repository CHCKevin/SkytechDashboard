# 任務布告欄 — 後端實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把既有的 3D Dashboard 伺服器改造成「任務布告欄」的工時 JSON API：可查、增、改、刪自己的 OpenProject 工時，搜尋 work package，管理常駐任務；示例模式可離線完整運作。

**Architecture:** 純 Node（ESM、無框架）。`server/openproject/client.mjs` 仍是唯一持有 token 的模組，新增僅限工時路徑的寫入。`server/time-tracking.mjs`（真實）與 `server/demo.mjs`（記憶體）實作同一個「來源」介面；`server/http.mjs` 只依賴該介面、`server/quests.mjs` 與 `server/validate.mjs`。靜態檔案改為掃描 Vite 產物目錄。

**Tech Stack:** Node 25（`node:test`、`fetch`）、無新增 npm 依賴。

**設計文件：** `docs/superpowers/specs/2026-11-16-quest-board-time-tracking-design.md`

**前端計畫（本計畫完成後）：** `docs/superpowers/plans/2026-11-16-quest-board-frontend.md`

---

## 共用約定

**Commit 格式**（使用者規定，每個 Task 結尾都用）：

```
[TYPE]: Title In English Title Case

What

* 行為改變（繁體中文）

How

* 實作重點

Change

path/of/changed/file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

TYPE 用 `FEATURE`、`REFACTOR`、`TEST`、`CHORE`。用 `git commit -F -` 搭配 heredoc 送出。

**來源（source）介面** — `time-tracking.mjs` 與 `demo.mjs` 都必須提供，`http.mjs` 只呼叫這些：

| 方法 | 回傳 | 錯誤 |
|---|---|---|
| `getMe()` | `{ id, name }` | `SourceError` |
| `listEntries(date)` | `Entry[]`（依 id 遞增） | `SourceError` |
| `createEntry({ workPackageId, date, hours, activityId, comment })` | `Entry` | work package 不存在 → `SourceError('not_found')`；422 → `SourceError('validation', msg)` |
| `updateEntry(id, partialInput)` | `Entry` | 同上 |
| `deleteEntry(id)` | `undefined` | 不存在 → `not_found` |
| `getWorkPackage(id)` | `{ id, subject, project }` | `not_found` |
| `searchWorkPackages(term)` | 最多 10 筆 `{ id, subject, project }` | `SourceError` |
| `listActivities(workPackageId)` | `[{ id, name, default }]` | `not_found` |

`Entry` = `{ id, workPackageId, workPackageSubject, date, hours, activityId, activityName, comment }`；`workPackageId`、`activityId`、`activityName` 可為 `null`。

**檔案異動總覽**

| 動作 | 檔案 |
|---|---|
| 刪除 | `client/`、`shared/`、`server/snapshot.mjs`、`server/activities.mjs`、`server/live-source.mjs`、`server/openproject/normalize.mjs`、`server/csp.mjs`、`tests/{activities,layout-3d,layout,participants,procedural,snapshot,store,view-model,openproject-normalize,csp}.test.mjs`、`tests/support/openproject-fixture.mjs` |
| 修改 | `package.json`、`.gitignore`、`server/config.mjs`、`server/openproject/errors.mjs`、`server/openproject/client.mjs`、`server/demo.mjs`、`server/http.mjs`、`server/static-files.mjs`、`server/index.mjs`、`tests/support/fake-openproject.mjs` |
| 新增 | `server/hours.mjs`、`server/validate.mjs`、`server/quests.mjs`、`server/time-tracking.mjs` 與對應測試 |

---

### Task 1: 移除 3D 宇宙程式碼

**Files:**
- Delete: 見上表「刪除」列，另加 `tests/demo.test.mjs`、`tests/http.test.mjs`、`tests/index.test.mjs`、`tests/static-files.test.mjs`（這四個會在後續 Task 重寫）
- Modify: `package.json`、`.gitignore`

- [ ] **Step 1: 刪除檔案**

```bash
git rm -r -q client shared server/snapshot.mjs server/activities.mjs server/live-source.mjs \
  server/openproject/normalize.mjs server/csp.mjs \
  tests/activities.test.mjs tests/layout-3d.test.mjs tests/layout.test.mjs tests/participants.test.mjs \
  tests/procedural.test.mjs tests/snapshot.test.mjs tests/store.test.mjs tests/view-model.test.mjs \
  tests/openproject-normalize.test.mjs tests/csp.test.mjs tests/support/openproject-fixture.mjs \
  tests/demo.test.mjs tests/http.test.mjs tests/index.test.mjs tests/static-files.test.mjs
```

- [ ] **Step 2: 更新 `package.json`**（移除 three、改名）

```json
{
  "name": "openproject-quest-board",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "start": "node server/index.mjs",
    "demo": "node server/index.mjs --config config/example.json"
  }
}
```

然後執行 `npm install` 讓 `package-lock.json` 同步（會移除 three）。

- [ ] **Step 3: `.gitignore` 加入 `data/`**

在 `node_modules/` 那行下面加：

```
data/
web/dist/
```

- [ ] **Step 4: 確認剩下的測試通過**

Run: `npm test`
Expected: 只剩 `config.test.mjs` 與 `openproject-client.test.mjs`，全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -F - <<'EOF'
[REFACTOR]: Remove 3D Universe Dashboard Code

What

* 移除已廢止的 3D 宇宙 Dashboard 前端、快照與相關測試，保留 OpenProject 存取模組

How

* 刪除 client/、shared/ 與宇宙專用的 server 模組及測試
* 移除 three 依賴，忽略 data/ 與 web/dist/

Change

package.json
package-lock.json
.gitignore
client/
shared/
server/
tests/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: 設定新增 dailyTargetHours、dataDir、staticDir

**Files:**
- Modify: `server/config.mjs`
- Test: `tests/config.test.mjs`

- [ ] **Step 1: 改寫測試**

把 `tests/config.test.mjs` 的第一個 test 換成下面兩個，其餘保留：

```js
test('demo defaults to loopback, no token, and default paths', () => {
  assert.deepEqual(parseConfig({ mode: 'demo' }), {
    mode: 'demo', host: '127.0.0.1', port: 4173,
    baseUrl: null, apiToken: null,
    dailyTargetHours: 8, dataDir: 'data', staticDir: 'web/dist',
  });
});
test('validates daily target and directories', () => {
  assert.equal(parseConfig({ mode: 'demo', dailyTargetHours: 7.5 }).dailyTargetHours, 7.5);
  for (const bad of [0, -1, 25, '8', NaN]) {
    assert.throws(() => parseConfig({ mode: 'demo', dailyTargetHours: bad }),
      { message: 'dailyTargetHours must be a number greater than 0 and at most 24' });
  }
  assert.equal(parseConfig({ mode: 'demo', dataDir: 'tmp/x', staticDir: 'dist' }).dataDir, 'tmp/x');
  assert.throws(() => parseConfig({ mode: 'demo', dataDir: '' }), { message: 'dataDir must be a non-empty string' });
  assert.throws(() => parseConfig({ mode: 'demo', staticDir: 3 }), { message: 'staticDir must be a non-empty string' });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/config.test.mjs`
Expected: FAIL（deepEqual 缺少新欄位）

- [ ] **Step 3: 實作** — 在 `server/config.mjs` 的 `parseConfig` 中，把建立 `config` 那行換成：

```js
  const dailyTargetHours = input.dailyTargetHours ?? 8;
  if (typeof dailyTargetHours !== 'number' || !(dailyTargetHours > 0 && dailyTargetHours <= 24)) {
    throw new Error('dailyTargetHours must be a number greater than 0 and at most 24');
  }
  const dataDir = nonEmpty(input.dataDir ?? 'data', 'dataDir');
  const staticDir = nonEmpty(input.staticDir ?? 'web/dist', 'staticDir');
  const config = {
    mode: input.mode, host: '127.0.0.1', port, baseUrl: null, apiToken: null,
    dailyTargetHours, dataDir, staticDir,
  };
```

並在檔案底部加入：

```js
function nonEmpty(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value;
}
```

（`NaN > 0` 為 false，所以 NaN 會被擋下。）

- [ ] **Step 4: 執行確認通過**

Run: `node --test tests/config.test.mjs`
Expected: PASS（原本的 live 測試只檢查個別欄位，不需修改）

- [ ] **Step 5: Commit**（TYPE `FEATURE`，標題 `Add Daily Target And Directory Settings`，Change 列 `server/config.mjs`、`tests/config.test.mjs`）

---

### Task 3: 時數與 ISO 8601 duration 互轉

**Files:**
- Create: `server/hours.mjs`
- Test: `tests/hours.test.mjs`

- [ ] **Step 1: 寫測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { toDuration, fromDuration } from '../server/hours.mjs';
import { SourceError } from '../server/openproject/errors.mjs';

test('toDuration writes decimal hours', () => {
  assert.equal(toDuration(2.5), 'PT2.5H');
  assert.equal(toDuration(1), 'PT1H');
  assert.equal(toDuration(0.25), 'PT0.25H');
});
test('fromDuration reads OpenProject durations as hours rounded to 2 places', () => {
  assert.equal(fromDuration('PT1H'), 1);
  assert.equal(fromDuration('PT2H30M'), 2.5);
  assert.equal(fromDuration('PT45M'), 0.75);
  assert.equal(fromDuration('PT20M'), 0.33);
  assert.equal(fromDuration('PT2.5H'), 2.5);
  assert.equal(fromDuration('P1DT2H'), 26);
  assert.equal(fromDuration('PT1H0M30S'), 1.01);
});
test('fromDuration rejects malformed values', () => {
  for (const bad of ['', 'P', 'PT', '1H', 'PTXH', null, undefined, 3]) {
    assert.throws(() => fromDuration(bad), error => error instanceof SourceError && error.code === 'invalid_response');
  }
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/hours.test.mjs`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `server/hours.mjs`**

```js
import { SourceError } from './openproject/errors.mjs';

const NUM = '(\\d+(?:\\.\\d+)?)';
const PATTERN = new RegExp(`^P(?:${NUM}D)?(?:T(?:${NUM}H)?(?:${NUM}M)?(?:${NUM}S)?)?$`);

// 呼叫端已驗證 hours 為 0～24、最多兩位小數，OpenProject 接受十進位小時（實測 PT2.5H）。
export function toDuration(hours) {
  return `PT${hours}H`;
}

// OpenProject 回傳 PT2H30M、PT45M 等形式；轉成十進位小時並四捨五入到兩位。
export function fromDuration(text) {
  const match = typeof text === 'string' ? PATTERN.exec(text) : null;
  if (!match || text === 'P' || text.endsWith('T')) throw new SourceError('invalid_response');
  const [days, hours, minutes, seconds] = match.slice(1).map(value => Number(value ?? 0));
  return Math.round((days * 24 + hours + minutes / 60 + seconds / 3600) * 100) / 100;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test tests/hours.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Convert Hours To And From ISO Durations`，Change：`server/hours.mjs`、`tests/hours.test.mjs`）

---

### Task 4: 錯誤代碼擴充與 HTTP 狀態對應

**Files:**
- Modify: `server/openproject/errors.mjs`
- Test: `tests/errors.test.mjs`

- [ ] **Step 1: 寫測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceError, errorInfo, statusFor } from '../server/openproject/errors.mjs';

test('validation errors carry the OpenProject message; others use fixed text', () => {
  assert.equal(new SourceError('validation', 'Hours can\'t be blank.').message, 'Hours can\'t be blank.');
  assert.equal(new SourceError('validation').message, 'OpenProject 拒絕了這筆資料');
  assert.equal(new SourceError('unauthorized', 'ignored').message, 'OpenProject 驗證失敗，請確認 API token');
  assert.deepEqual(errorInfo(new SourceError('not_found')), { code: 'not_found', message: 'OpenProject 找不到資源' });
  assert.deepEqual(errorInfo(new Error('secret')), { code: 'internal_error', message: '伺服器內部錯誤' });
});
test('maps source error codes to local HTTP statuses', () => {
  assert.equal(statusFor('validation'), 422);
  assert.equal(statusFor('not_found'), 404);
  assert.equal(statusFor('forbidden'), 403);
  assert.equal(statusFor('timeout'), 504);
  assert.equal(statusFor('unauthorized'), 502);
  assert.equal(statusFor('network'), 502);
  assert.equal(statusFor('unsafe_write'), 500);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/errors.test.mjs`
Expected: FAIL（`statusFor` 未定義）

- [ ] **Step 3: 實作** — 改寫 `server/openproject/errors.mjs` 為：

```js
// 錯誤訊息固定，不含 token、網址或來源回應內容，可安全顯示在前端。
// 唯一例外：validation（OpenProject 422）只轉傳 OpenProject 錯誤物件的 message 字串。
const messages = {
  unauthorized: 'OpenProject 驗證失敗，請確認 API token',
  forbidden: 'OpenProject 拒絕存取（權限不足）',
  not_found: 'OpenProject 找不到資源',
  validation: 'OpenProject 拒絕了這筆資料',
  rate_limited: 'OpenProject 請求過於頻繁，請稍後再試',
  upstream_error: 'OpenProject 伺服器錯誤',
  timeout: '連線 OpenProject 逾時',
  network: '無法連線到 OpenProject',
  unexpected_redirect: 'OpenProject 回應了未預期的重新導向',
  invalid_response: 'OpenProject 回應格式無法解讀',
  unsafe_link: 'OpenProject 連結指向設定以外的位置',
  unsafe_write: '不允許的 OpenProject 寫入操作',
  pagination_loop: 'OpenProject 分頁連結重複',
  pagination_incomplete: 'OpenProject 分頁資料不完整',
};

const statuses = { validation: 422, not_found: 404, forbidden: 403, timeout: 504, unsafe_write: 500 };

export class SourceError extends Error {
  constructor(code, detail) {
    super(code === 'validation' && typeof detail === 'string' && detail ? detail : messages[code]);
    this.name = 'SourceError';
    this.code = code;
  }
}

export function statusFor(code) {
  return statuses[code] ?? 502;
}

export function errorInfo(error) {
  return error instanceof SourceError
    ? { code: error.code, message: error.message }
    : { code: 'internal_error', message: '伺服器內部錯誤' };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test`
Expected: PASS（client 測試仍通過）

- [ ] **Step 5: Commit**（`[FEATURE]: Add Validation Error And Status Mapping`，Change：`server/openproject/errors.mjs`、`tests/errors.test.mjs`）

---

### Task 5: 假 OpenProject 支援請求本體

**Files:**
- Modify: `tests/support/fake-openproject.mjs`

- [ ] **Step 1: 實作** — 把 `createServer(async (req, res) => {` 內、`requests.push(...)` 之前，加上讀取本體；`routes` 多收第三個參數：

```js
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fake');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    requests.push({ method: req.method, path: url.pathname, search: url.searchParams, headers: req.headers, body });
    active += 1;
    stats.maxActive = Math.max(stats.maxActive, active);
    try {
      const reply = (await routes(url, req, body)) ?? { status: 404, body: {} };
      if (reply.delayMs) await new Promise(resolve => setTimeout(resolve, reply.delayMs));
      if (reply.status === 204) {
        res.writeHead(204);
        res.end();
        return;
      }
      const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
      res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/hal+json', ...reply.headers });
      res.end(text);
    } finally {
      active -= 1;
    }
  });
```

- [ ] **Step 2: 確認既有測試仍通過**

Run: `node --test tests/openproject-client.test.mjs`
Expected: PASS

- [ ] **Step 3: Commit**（`[TEST]: Record Request Bodies In Fake OpenProject`，Change：`tests/support/fake-openproject.mjs`）

---

### Task 6: OpenProject client 新增僅限工時的寫入

**Files:**
- Modify: `server/openproject/client.mjs`
- Test: `tests/openproject-client.test.mjs`（追加）

- [ ] **Step 1: 追加測試**到 `tests/openproject-client.test.mjs` 結尾：

```js
test('send writes JSON only to time entry paths', async () => {
  await withFake((url, req, body) => ({ status: 201, body: { id: 9, echo: body } }), async fake => {
    const client = clientFor(fake);
    assert.deepEqual(await client.send('POST', '/api/v3/time_entries', { a: 1 }), { id: 9, echo: { a: 1 } });
    const [req] = fake.requests;
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['content-type'], 'application/json');
    assert.equal(req.headers.authorization, `Basic ${Buffer.from(`apikey:${TOKEN}`).toString('base64')}`);
    await client.send('POST', '/api/v3/time_entries/form', {});
    await client.send('PATCH', '/api/v3/time_entries/12', {});
    assert.equal(fake.requests.length, 3);
  });
});
test('send refuses any other write target without contacting the server', async () => {
  await withFake(() => ({ body: {} }), async fake => {
    const client = clientFor(fake);
    for (const [method, path] of [
      ['POST', '/api/v3/work_packages'], ['DELETE', '/api/v3/time_entries'], ['PATCH', '/api/v3/time_entries/form'],
      ['PUT', '/api/v3/time_entries/1'], ['GET', '/api/v3/time_entries/1'], ['POST', '/api/v3/time_entries?x=1'],
      ['DELETE', '/api/v3/time_entries/1/x'], ['POST', '/api/v3/../v3/users'],
    ]) {
      await rejectsWith(client.send(method, path, {}), 'unsafe_write');
    }
    assert.equal(fake.requests.length, 0);
  });
});
test('send returns null for 204 and never retries', async () => {
  await withFake(() => ({ status: 204 }), async fake => {
    assert.equal(await clientFor(fake).send('DELETE', '/api/v3/time_entries/5'), null);
    assert.equal(fake.requests[0].body, null);
  });
  await withFake(() => ({ status: 503 }), async fake => {
    await rejectsWith(clientFor(fake).send('POST', '/api/v3/time_entries', {}), 'upstream_error');
    assert.equal(fake.requests.length, 1);
  });
});
test('send turns 422 into a validation error with only OpenProject messages', async () => {
  await withFake(() => ({ status: 422, body: { _type: 'Error', message: 'Hours can\'t be blank.', secret: TOKEN } }), async fake => {
    await assert.rejects(clientFor(fake).send('POST', '/api/v3/time_entries', {}),
      error => error.code === 'validation' && error.message === 'Hours can\'t be blank.');
  });
  await withFake(() => ({ status: 422, body: { _type: 'Error', errorIdentifier: 'urn:...:MultipleErrors', message: 'Multiple field constraints have been violated.',
    _embedded: { errors: [{ message: 'Date can\'t be blank.' }, { message: 'Hours can\'t be blank.' }] } } }), async fake => {
    await assert.rejects(clientFor(fake).send('POST', '/api/v3/time_entries', {}),
      error => error.code === 'validation' && error.message === 'Date can\'t be blank.；Hours can\'t be blank.');
  });
  await withFake(() => ({ status: 422, body: 'not json' }), async fake => {
    await assert.rejects(clientFor(fake).send('POST', '/api/v3/time_entries', {}),
      error => error.code === 'validation' && error.message === 'OpenProject 拒絕了這筆資料');
  });
});
test('send maps auth, permission, missing and redirect like reads', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [302, 'unexpected_redirect']]) {
    await withFake(() => ({ status, body: {} }), async fake => {
      await rejectsWith(clientFor(fake).send('PATCH', '/api/v3/time_entries/1', {}), code);
    });
  }
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/openproject-client.test.mjs`
Expected: FAIL（`client.send is not a function`）

- [ ] **Step 3: 實作** — 修改 `server/openproject/client.mjs`：

(a) 檔頭常數下方加入寫入白名單：

```js
// 寫入只允許工時：建立、表單（不建立資料，用來取活動清單）、修改、刪除。
const WRITE_RULES = [
  ['POST', /^\/api\/v3\/time_entries$/],
  ['POST', /^\/api\/v3\/time_entries\/form$/],
  ['PATCH', /^\/api\/v3\/time_entries\/\d+$/],
  ['DELETE', /^\/api\/v3\/time_entries\/\d+$/],
];
const MAX_MESSAGE = 500;
```

(b) 檔頭註解改為：`// 唯一持有 token 的模組：讀取限 /api/v3，寫入僅限工時路徑；不跟隨重新導向。`

(c) 把 `request(url)` 改成接受 `init`：

```js
  async function request(url, { method = 'GET', body } = {}) {
    try {
      return await fetch(url, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: authorization, Accept: 'application/hal+json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new SourceError(error?.name === 'TimeoutError' ? 'timeout' : 'network');
    }
  }
```

(d) 把 `getJson` 內的 JSON 解析與狀態對應抽成 `readJson(res)` 與 `statusError(status)`（定義見 (g)，放在 `createClient` 外），`getJson` 改為：

```js
  async function getJson(pathOrHref) {
    const url = resolve(pathOrHref);
    return limit(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const res = await request(url);
        if (res.ok) return readJson(res);
        await res.body?.cancel();
        // RETRYABLE 只含 429/502/503/504，不會是 3xx，重新導向一律不重試。
        if (RETRYABLE.has(res.status) && attempt < retries) {
          await sleep(retryDelay(res, attempt));
          continue;
        }
        throw statusError(res.status);
      }
    });
  }
```

(e) 在 `getAll` 前加入 `send`：

```js
  // 寫入不自動重試：連線中斷時結果不確定，重送可能重複建立工時。
  async function send(method, path, body) {
    const url = resolve(path);
    const allowed = !url.search && WRITE_RULES.some(([m, pattern]) => m === method && pattern.test(url.pathname));
    if (!allowed) throw new SourceError('unsafe_write');
    return limit(async () => {
      const res = await request(url, { method, body });
      if (res.status === 204) return null;
      if (res.ok) return readJson(res);
      if (res.status === 422) throw new SourceError('validation', await validationMessage(res));
      await res.body?.cancel();
      throw statusError(res.status);
    });
  }
```

注意：`resolve()` 會先擋掉非 `/api/v3` 的路徑並丟 `unsafe_link`；但測試期望 `/api/v3/../v3/users` 得到 `unsafe_write`——URL 正規化後為 `/api/v3/users`，仍在 `/api/v3` 內，所以 `resolve` 通過、白名單擋下，結果是 `unsafe_write`，符合測試。

(f) `return { getJson, getAll, send };`

(g) 在 `createClient` 外新增：

```js
async function readJson(res) {
  try {
    return await res.json();
  } catch (error) {
    // 只有 JSON 解析失敗才是格式問題；讀取中斷屬於連線問題。
    if (error?.name === 'SyntaxError') throw new SourceError('invalid_response');
    throw new SourceError(error?.name === 'TimeoutError' ? 'timeout' : 'network');
  }
}

function statusError(status) {
  if (status >= 300 && status < 400) return new SourceError('unexpected_redirect');
  if (status === 401) return new SourceError('unauthorized');
  if (status === 403) return new SourceError('forbidden');
  if (status === 404) return new SourceError('not_found');
  return new SourceError(status === 429 ? 'rate_limited' : 'upstream_error');
}

// 只取 OpenProject 錯誤物件中的 message 字串（多筆時用全形分號合併），其他欄位一律丟棄。
async function validationMessage(res) {
  let body;
  try { body = await res.json(); } catch { return undefined; }
  const nested = Array.isArray(body?._embedded?.errors) ? body._embedded.errors.map(error => error?.message) : [];
  const parts = (nested.length ? nested : [body?.message]).filter(text => typeof text === 'string' && text);
  return parts.join('；').slice(0, MAX_MESSAGE) || undefined;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test tests/openproject-client.test.mjs`
Expected: 全部 PASS（新舊測試）

- [ ] **Step 5: Commit**（`[FEATURE]: Allow Time Entry Writes In OpenProject Client`，Change：`server/openproject/client.mjs`、`tests/openproject-client.test.mjs`）

---

### Task 7: 輸入驗證

**Files:**
- Create: `server/validate.mjs`
- Test: `tests/validate.test.mjs`

- [ ] **Step 1: 寫測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputError, parseDate, parsePathId, parseEntryInput, parseQuestInput, parseSearchTerm } from '../server/validate.mjs';

const fails = (fn, field) => assert.throws(fn, error => error instanceof InputError && error.field === field);

test('parseDate accepts real calendar dates only', () => {
  assert.equal(parseDate('2026-11-16'), '2026-11-16');
  assert.equal(parseDate('2024-02-29'), '2024-02-29');
  for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '', null, '2026-11-16T00:00']) fails(() => parseDate(bad), 'date');
});
test('parsePathId accepts positive integer strings', () => {
  assert.equal(parsePathId('42', 'id'), 42);
  for (const bad of ['0', '-1', '1.5', 'abc', '', '99999999999']) fails(() => parsePathId(bad, 'id'), 'id');
});
test('parseEntryInput requires core fields and defaults optional ones', () => {
  assert.deepEqual(parseEntryInput({ workPackageId: 5, date: '2026-11-16', hours: 2.5 }),
    { workPackageId: 5, date: '2026-11-16', hours: 2.5, activityId: null, comment: '' });
  assert.deepEqual(parseEntryInput({ workPackageId: 5, date: '2026-11-16', hours: 1, activityId: 3, comment: 'x' }),
    { workPackageId: 5, date: '2026-11-16', hours: 1, activityId: 3, comment: 'x' });
  fails(() => parseEntryInput({ date: '2026-11-16', hours: 1 }), 'workPackageId');
  fails(() => parseEntryInput({ workPackageId: 5, hours: 1 }), 'date');
  fails(() => parseEntryInput({ workPackageId: 5, date: '2026-11-16' }), 'hours');
});
test('parseEntryInput validates hours, activity, comment and unknown keys', () => {
  const base = { workPackageId: 5, date: '2026-11-16' };
  for (const bad of [0, -1, 24.01, 1.234, '2', NaN, Infinity]) fails(() => parseEntryInput({ ...base, hours: bad }), 'hours');
  assert.equal(parseEntryInput({ ...base, hours: 24 }).hours, 24);
  assert.equal(parseEntryInput({ ...base, hours: 0.01 }).hours, 0.01);
  fails(() => parseEntryInput({ ...base, hours: 1, activityId: 0 }), 'activityId');
  fails(() => parseEntryInput({ ...base, hours: 1, activityId: '3' }), 'activityId');
  fails(() => parseEntryInput({ ...base, hours: 1, comment: 5 }), 'comment');
  fails(() => parseEntryInput({ ...base, hours: 1, comment: 'x'.repeat(1001) }), 'comment');
  fails(() => parseEntryInput({ ...base, hours: 1, userId: 1 }), 'userId');
  fails(() => parseEntryInput(null), 'body');
  fails(() => parseEntryInput([]), 'body');
});
test('partial entry input keeps only provided fields and needs at least one', () => {
  assert.deepEqual(parseEntryInput({ hours: 3 }, { partial: true }), { hours: 3 });
  assert.deepEqual(parseEntryInput({ activityId: null }, { partial: true }), { activityId: null });
  fails(() => parseEntryInput({}, { partial: true }), 'body');
});
test('parseQuestInput and parseSearchTerm', () => {
  assert.deepEqual(parseQuestInput({ workPackageId: 7 }), { workPackageId: 7, activityId: null });
  assert.deepEqual(parseQuestInput({ workPackageId: 7, activityId: 3 }), { workPackageId: 7, activityId: 3 });
  fails(() => parseQuestInput({ activityId: 3 }), 'workPackageId');
  fails(() => parseQuestInput({ workPackageId: 7, x: 1 }), 'x');
  assert.equal(parseSearchTerm('  #123 '), '123');
  assert.equal(parseSearchTerm('登入頁'), '登入頁');
  assert.equal(parseSearchTerm('   '), '');
  assert.equal(parseSearchTerm(null), '');
  fails(() => parseSearchTerm('x'.repeat(101)), 'q');
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/validate.test.mjs`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `server/validate.mjs`**

```js
// 本機 API 的輸入驗證；錯誤帶欄位名稱，由 http.mjs 轉成 400。
export class InputError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'InputError';
    this.code = 'invalid_input';
    this.field = field;
  }
}

const MAX_ID = 2 ** 31 - 1;
const ENTRY_KEYS = ['workPackageId', 'date', 'hours', 'activityId', 'comment'];
const QUEST_KEYS = ['workPackageId', 'activityId'];

export function parseDate(value, field = 'date') {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return value;
  }
  throw new InputError(field, '日期格式必須是有效的 YYYY-MM-DD');
}

export function parsePathId(value, field) {
  if (typeof value === 'string' && /^\d{1,10}$/.test(value)) {
    const id = Number(value);
    if (id >= 1 && id <= MAX_ID) return id;
  }
  throw new InputError(field, '編號必須是正整數');
}

function parseId(value, field) {
  if (Number.isInteger(value) && value >= 1 && value <= MAX_ID) return value;
  throw new InputError(field, '編號必須是正整數');
}

function parseActivityId(value) {
  if (value === null) return null;
  return parseId(value, 'activityId');
}

function parseHours(value) {
  const ok = typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 24
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
  if (!ok) throw new InputError('hours', '時數必須大於 0、不超過 24，最多兩位小數');
  return value;
}

function parseComment(value) {
  if (typeof value !== 'string') throw new InputError('comment', '備註必須是文字');
  if (value.length > 1000) throw new InputError('comment', '備註最多 1000 字');
  return value;
}

function assertObject(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('body', '請求內容必須是 JSON 物件');
  const unknown = Object.keys(body).find(key => !keys.includes(key));
  if (unknown) throw new InputError(unknown, `不支援的欄位：${unknown}`);
}

const parsers = {
  workPackageId: value => parseId(value, 'workPackageId'),
  date: value => parseDate(value),
  hours: parseHours,
  activityId: parseActivityId,
  comment: parseComment,
};

export function parseEntryInput(body, { partial = false } = {}) {
  assertObject(body, ENTRY_KEYS);
  if (partial) {
    const keys = ENTRY_KEYS.filter(key => body[key] !== undefined);
    if (!keys.length) throw new InputError('body', '至少要修改一個欄位');
    return Object.fromEntries(keys.map(key => [key, parsers[key](body[key])]));
  }
  for (const key of ['workPackageId', 'date', 'hours']) {
    if (body[key] === undefined) throw new InputError(key, `缺少欄位：${key}`);
  }
  return {
    workPackageId: parsers.workPackageId(body.workPackageId),
    date: parsers.date(body.date),
    hours: parsers.hours(body.hours),
    activityId: body.activityId === undefined ? null : parseActivityId(body.activityId),
    comment: body.comment === undefined ? '' : parseComment(body.comment),
  };
}

export function parseQuestInput(body) {
  assertObject(body, QUEST_KEYS);
  if (body.workPackageId === undefined) throw new InputError('workPackageId', '缺少欄位：workPackageId');
  return {
    workPackageId: parseId(body.workPackageId, 'workPackageId'),
    activityId: body.activityId === undefined ? null : parseActivityId(body.activityId),
  };
}

// 去除前後空白與開頭的 #；空字串代表「不搜尋」。
export function parseSearchTerm(value) {
  const term = (typeof value === 'string' ? value : '').trim().replace(/^#/, '').trim();
  if (term.length > 100) throw new InputError('q', '搜尋文字最多 100 字');
  return term;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test tests/validate.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Validate Time Entry And Quest Input`，Change：`server/validate.mjs`、`tests/validate.test.mjs`）

---

### Task 8: 真實 OpenProject 工時來源

**Files:**
- Create: `server/time-tracking.mjs`
- Test: `tests/time-tracking.test.mjs`

- [ ] **Step 1: 寫測試**（替身回應的形狀取自 2026-11-16 實測）

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../server/openproject/client.mjs';
import { createTimeTrackingSource } from '../server/time-tracking.mjs';
import { startFake, collection } from './support/fake-openproject.mjs';

const entryHal = (overrides = {}) => ({
  _type: 'TimeEntry', id: 2759, hours: 'PT2H30M', spentOn: '2026-11-16',
  comment: { format: 'plain', raw: '查問題', html: '<p>查問題</p>' },
  _links: {
    entity: { href: '/api/v3/work_packages/202', title: '支援任務' },
    workPackage: { href: '/api/v3/work_packages/202', title: '支援任務' },
    activity: { href: '/api/v3/time_entries/activities/3', title: 'Development' },
  },
  ...overrides,
});
const wpHal = (id, subject = `WP ${id}`) => ({ _type: 'WorkPackage', id, subject, _links: { project: { href: '/api/v3/projects/3', title: 'Software Operations' } } });

async function withSource(routes, run) {
  const fake = await startFake(routes);
  try {
    const client = createClient({ baseUrl: fake.baseUrl, apiToken: 'T', sleep: async () => {} });
    await run(createTimeTrackingSource({ client }), fake);
  } finally {
    await fake.close();
  }
}

test('getMe returns id and name', async () => {
  await withSource(() => ({ body: { id: 18, name: 'Ted', login: 'x' } }), async source => {
    assert.deepEqual(await source.getMe(), { id: 18, name: 'Ted' });
  });
});
test('listEntries filters by me and day and normalizes entries', async () => {
  await withSource(() => ({ body: collection([
    entryHal(),
    entryHal({ id: 2760, hours: 'PT1H', comment: { raw: '' }, _links: { entity: { href: '/api/v3/meetings/4', title: '週會' }, activity: { href: null } } }),
  ]) }), async (source, fake) => {
    assert.deepEqual(await source.listEntries('2026-11-16'), [
      { id: 2759, workPackageId: 202, workPackageSubject: '支援任務', date: '2026-11-16', hours: 2.5, activityId: 3, activityName: 'Development', comment: '查問題' },
      { id: 2760, workPackageId: null, workPackageSubject: '週會', date: '2026-11-16', hours: 1, activityId: null, activityName: null, comment: '' },
    ]);
    const req = fake.requests[0];
    assert.equal(req.path, '/api/v3/time_entries');
    assert.deepEqual(JSON.parse(req.search.get('filters')), [
      { user: { operator: '=', values: ['me'] } }, { spentOn: { operator: '=d', values: ['2026-11-16'] } },
    ]);
  });
});
test('createEntry checks the work package first, then posts the OpenProject payload', async () => {
  await withSource((url, req) => (req.method === 'GET' ? { body: wpHal(202) } : { status: 201, body: entryHal() }), async (source, fake) => {
    const entry = await source.createEntry({ workPackageId: 202, date: '2026-11-16', hours: 2.5, activityId: 3, comment: '查問題' });
    assert.equal(entry.id, 2759);
    assert.equal(fake.requests[0].path, '/api/v3/work_packages/202');
    assert.equal(fake.requests[1].method, 'POST');
    assert.deepEqual(fake.requests[1].body, {
      spentOn: '2026-11-16', hours: 'PT2.5H', comment: { raw: '查問題' },
      _links: { entity: { href: '/api/v3/work_packages/202' }, activity: { href: '/api/v3/time_entries/activities/3' } },
    });
  });
});
test('createEntry with no activity sends a null activity link', async () => {
  await withSource((url, req) => (req.method === 'GET' ? { body: wpHal(202) } : { status: 201, body: entryHal() }), async (source, fake) => {
    await source.createEntry({ workPackageId: 202, date: '2026-11-16', hours: 1, activityId: null, comment: '' });
    assert.deepEqual(fake.requests[1].body._links.activity, { href: null });
  });
});
test('createEntry reports a missing work package as not_found without posting', async () => {
  await withSource(() => ({ status: 404, body: {} }), async (source, fake) => {
    await assert.rejects(source.createEntry({ workPackageId: 9, date: '2026-11-16', hours: 1, activityId: null, comment: '' }),
      error => error.code === 'not_found');
    assert.equal(fake.requests.length, 1);
  });
});
test('updateEntry patches only provided fields', async () => {
  await withSource(() => ({ body: entryHal({ hours: 'PT3H' }) }), async (source, fake) => {
    const entry = await source.updateEntry(2759, { hours: 3, comment: '改' });
    assert.equal(entry.hours, 3);
    assert.equal(fake.requests.length, 1);
    assert.equal(fake.requests[0].method, 'PATCH');
    assert.equal(fake.requests[0].path, '/api/v3/time_entries/2759');
    assert.deepEqual(fake.requests[0].body, { hours: 'PT3H', comment: { raw: '改' } });
  });
});
test('updateEntry that changes work package checks it exists', async () => {
  await withSource((url, req) => (req.method === 'GET' ? { body: wpHal(5) } : { body: entryHal() }), async (source, fake) => {
    await source.updateEntry(2759, { workPackageId: 5 });
    assert.equal(fake.requests[0].path, '/api/v3/work_packages/5');
    assert.deepEqual(fake.requests[1].body, { _links: { entity: { href: '/api/v3/work_packages/5' } } });
  });
});
test('deleteEntry sends DELETE', async () => {
  await withSource(() => ({ status: 204 }), async (source, fake) => {
    assert.equal(await source.deleteEntry(2759), undefined);
    assert.equal(fake.requests[0].method, 'DELETE');
    assert.equal(fake.requests[0].path, '/api/v3/time_entries/2759');
  });
});
test('searchWorkPackages uses subjectOrId and puts the exact id first, de-duplicated', async () => {
  await withSource(url => (url.pathname === '/api/v3/work_packages/23'
    ? { body: wpHal(23, 'B') }
    : { body: collection([wpHal(1234, 'A'), wpHal(23, 'B')]) }), async (source, fake) => {
    assert.deepEqual(await source.searchWorkPackages('23'), [
      { id: 23, subject: 'B', project: 'Software Operations' },
      { id: 1234, subject: 'A', project: 'Software Operations' },
    ]);
    const search = fake.requests.find(req => req.path === '/api/v3/work_packages');
    assert.equal(search.search.get('pageSize'), '10');
    assert.deepEqual(JSON.parse(search.search.get('filters')), [{ subjectOrId: { operator: '**', values: ['23'] } }]);
  });
});
test('an exact id missing from the search page is still found first', async () => {
  // 實測：搜尋 "202" 時，名稱含 2026 等字樣的項目會把 #202 擠出第一頁。
  await withSource(url => (url.pathname === '/api/v3/work_packages/202'
    ? { body: wpHal(202, '支援任務') }
    : { body: collection([wpHal(256, '2026 規劃'), wpHal(365, '2026 報表')]) }), async source => {
    assert.deepEqual((await source.searchWorkPackages('202')).map(wp => wp.id), [202, 256, 365]);
  });
  await withSource(url => (url.pathname === '/api/v3/work_packages/99'
    ? { status: 404, body: {} }
    : { body: collection([wpHal(1990, 'Code review 99')]) }), async source => {
    assert.deepEqual((await source.searchWorkPackages('99')).map(wp => wp.id), [1990]);
  });
});
test('text searches skip the id lookup; empty searches skip everything', async () => {
  await withSource(() => ({ body: collection([wpHal(5, '登入頁')]) }), async (source, fake) => {
    await source.searchWorkPackages('登入');
    assert.equal(fake.requests.length, 1);
  });
  await withSource(() => ({ body: collection([]) }), async (source, fake) => {
    assert.deepEqual(await source.searchWorkPackages(''), []);
    assert.equal(fake.requests.length, 0);
  });
});
test('listActivities reads allowed values from the time entry form', async () => {
  const form = { _type: 'Form', _embedded: { schema: { activity: { _embedded: { allowedValues: [
    { id: 1, name: 'Management', default: true }, { id: 3, name: 'Development', default: false },
  ] } } } } };
  await withSource((url, req) => (req.method === 'GET' ? { body: wpHal(202) } : { body: form }), async (source, fake) => {
    assert.deepEqual(await source.listActivities(202), [
      { id: 1, name: 'Management', default: true }, { id: 3, name: 'Development', default: false },
    ]);
    assert.equal(fake.requests[1].path, '/api/v3/time_entries/form');
    assert.deepEqual(fake.requests[1].body, { _links: { entity: { href: '/api/v3/work_packages/202' } } });
  });
  await withSource((url, req) => (req.method === 'GET' ? { body: wpHal(202) } : { body: { _type: 'Form' } }), async source => {
    await assert.rejects(source.listActivities(202), error => error.code === 'invalid_response');
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/time-tracking.test.mjs`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `server/time-tracking.mjs`**

```js
import { fromDuration, toDuration } from './hours.mjs';
import { SourceError } from './openproject/errors.mjs';

const ME_FILTER = { user: { operator: '=', values: ['me'] } };

// 真實 OpenProject 工時來源；HAL 與本機 JSON 的轉換都在這裡。
export function createTimeTrackingSource({ client }) {
  async function getWorkPackage(id) {
    const wp = await client.getJson(`/api/v3/work_packages/${id}`);
    return { id: wp.id, subject: wp.subject ?? '', project: wp._links?.project?.title ?? '' };
  }

  return {
    async getMe() {
      const user = await client.getJson('/api/v3/users/me');
      return { id: user.id, name: user.name ?? '' };
    },

    async listEntries(date) {
      const filters = JSON.stringify([ME_FILTER, { spentOn: { operator: '=d', values: [date] } }]);
      const elements = await client.getAll('/api/v3/time_entries', { filters, sortBy: '[["id","asc"]]' });
      return elements.map(toEntry);
    },

    async createEntry(input) {
      await getWorkPackage(input.workPackageId);
      return toEntry(await client.send('POST', '/api/v3/time_entries', toPayload(input)));
    },

    async updateEntry(id, patch) {
      if (patch.workPackageId !== undefined) await getWorkPackage(patch.workPackageId);
      return toEntry(await client.send('PATCH', `/api/v3/time_entries/${id}`, toPayload(patch)));
    },

    async deleteEntry(id) {
      await client.send('DELETE', `/api/v3/time_entries/${id}`);
    },

    getWorkPackage,

    // subjectOrId 也會比對名稱子字串，精確編號可能不在第一頁；純數字時另外直接查該編號並排在最前面。
    async searchWorkPackages(term) {
      if (!term) return [];
      const filters = encodeURIComponent(JSON.stringify([{ subjectOrId: { operator: '**', values: [term] } }]));
      const sortBy = encodeURIComponent('[["updatedAt","desc"]]');
      const [page, exact] = await Promise.all([
        client.getJson(`/api/v3/work_packages?pageSize=10&filters=${filters}&sortBy=${sortBy}`),
        /^d+$/.test(term) ? getWorkPackage(Number(term)).catch(ignoreMissing) : null,
      ]);
      const items = page?._embedded?.elements;
      if (!Array.isArray(items)) throw new SourceError('invalid_response');
      const results = items
        .map(wp => ({ id: wp.id, subject: wp.subject ?? '', project: wp._links?.project?.title ?? '' }))
        .filter(wp => wp.id !== exact?.id);
      return (exact ? [exact, ...results] : results).slice(0, 10);
    },

    async listActivities(workPackageId) {
      await getWorkPackage(workPackageId);
      const form = await client.send('POST', '/api/v3/time_entries/form', {
        _links: { entity: { href: `/api/v3/work_packages/${workPackageId}` } },
      });
      const allowed = form?._embedded?.schema?.activity?._embedded?.allowedValues;
      if (!Array.isArray(allowed)) throw new SourceError('invalid_response');
      return allowed.map(activity => ({ id: activity.id, name: activity.name ?? '', default: Boolean(activity.default) }));
    },
  };
}

function ignoreMissing(error) {
  if (error?.code === 'not_found' || error?.code === 'forbidden') return null;
  throw error;
}

function idFrom(href, pattern) {
  if (typeof href !== 'string') return null;
  const match = pattern.exec(new URL(href, 'http://local').pathname);
  return match ? Number(match[1]) : null;
}

function toEntry(hal) {
  if (!hal || typeof hal !== 'object') throw new SourceError('invalid_response');
  const entity = hal._links?.entity ?? hal._links?.workPackage ?? {};
  const activity = hal._links?.activity ?? {};
  const activityId = idFrom(activity.href, /^\/api\/v3\/time_entries\/activities\/(\d+)$/);
  return {
    id: hal.id,
    workPackageId: idFrom(entity.href, /^\/api\/v3\/work_packages\/(\d+)$/),
    workPackageSubject: entity.title ?? '',
    date: hal.spentOn,
    hours: fromDuration(hal.hours),
    activityId,
    activityName: activityId === null ? null : activity.title ?? '',
    comment: hal.comment?.raw ?? '',
  };
}

function toPayload({ workPackageId, date, hours, activityId, comment }) {
  const body = {};
  const links = {};
  if (date !== undefined) body.spentOn = date;
  if (hours !== undefined) body.hours = toDuration(hours);
  if (comment !== undefined) body.comment = { raw: comment };
  if (workPackageId !== undefined) links.entity = { href: `/api/v3/work_packages/${workPackageId}` };
  if (activityId !== undefined) {
    links.activity = { href: activityId === null ? null : `/api/v3/time_entries/activities/${activityId}` };
  }
  if (Object.keys(links).length) body._links = links;
  return body;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test tests/time-tracking.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Add OpenProject Time Tracking Source`，Change：`server/time-tracking.mjs`、`tests/time-tracking.test.mjs`）

---

### Task 9: 示例（記憶體）來源

**Files:**
- Modify (rewrite): `server/demo.mjs`
- Test: `tests/demo.test.mjs`

- [ ] **Step 1: 寫測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSource } from '../server/demo.mjs';

const isCode = code => error => error.code === code;

test('demo source has a user, work packages and activities', async () => {
  const source = createDemoSource();
  assert.deepEqual(await source.getMe(), { id: 1, name: '示例冒險者' });
  assert.equal((await source.getWorkPackage(1234)).subject, '前端登入頁改版');
  await assert.rejects(source.getWorkPackage(999), isCode('not_found'));
  const activities = await source.listActivities(1234);
  assert.ok(activities.some(activity => activity.default));
  await assert.rejects(source.listActivities(999), isCode('not_found'));
});
test('demo search matches id or subject and puts exact id first', async () => {
  const source = createDemoSource();
  assert.equal((await source.searchWorkPackages('2051'))[0].id, 2051);
  assert.ok((await source.searchWorkPackages('登入')).every(wp => wp.subject.includes('登入')));
  assert.deepEqual(await source.searchWorkPackages(''), []);
  assert.ok((await source.searchWorkPackages('2')).length <= 10);
});
test('demo entries support create, list by day, update and delete', async () => {
  const source = createDemoSource();
  const before = await source.listEntries('2030-01-01');
  assert.deepEqual(before, []);
  const created = await source.createEntry({ workPackageId: 1234, date: '2030-01-01', hours: 2.5, activityId: 3, comment: 'x' });
  assert.deepEqual(created, { id: created.id, workPackageId: 1234, workPackageSubject: '前端登入頁改版', date: '2030-01-01',
    hours: 2.5, activityId: 3, activityName: 'Development', comment: 'x' });
  assert.deepEqual(await source.listEntries('2030-01-01'), [created]);
  const updated = await source.updateEntry(created.id, { hours: 1, activityId: null });
  assert.equal(updated.hours, 1);
  assert.equal(updated.activityName, null);
  await source.deleteEntry(created.id);
  assert.deepEqual(await source.listEntries('2030-01-01'), []);
  await assert.rejects(source.deleteEntry(created.id), isCode('not_found'));
  await assert.rejects(source.updateEntry(created.id, { hours: 1 }), isCode('not_found'));
});
test('demo rejects unknown work packages and activities', async () => {
  const source = createDemoSource();
  await assert.rejects(source.createEntry({ workPackageId: 999, date: '2030-01-01', hours: 1, activityId: null, comment: '' }), isCode('not_found'));
  await assert.rejects(source.createEntry({ workPackageId: 1234, date: '2030-01-01', hours: 1, activityId: 77, comment: '' }),
    error => error.code === 'validation' && /Activity/.test(error.message));
});
test('demo starts with sample entries for today', async () => {
  const source = createDemoSource({ today: '2026-11-16' });
  assert.equal((await source.listEntries('2026-11-16')).length, 2);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/demo.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作 `server/demo.mjs`**（整檔改寫）

```js
import { SourceError } from './openproject/errors.mjs';

const WORK_PACKAGES = [
  [1234, '前端登入頁改版', '示例專案'], [2051, '週會與進度回報', '示例專案'], [1877, '客戶 A 維運支援', '維運'],
  [1990, 'Code review', '示例專案'], [2310, '匯出報表效能問題', '維運'], [2318, 'SSO 設定調整', '維運'],
  [2333, '新人教育訓練', '行政'], [2205, '登入頁 E2E 測試', '示例專案'],
].map(([id, subject, project]) => ({ id, subject, project }));

const ACTIVITIES = [
  { id: 1, name: 'Management', default: true }, { id: 3, name: 'Development', default: false },
  { id: 4, name: 'Testing', default: false }, { id: 5, name: 'Support', default: false }, { id: 6, name: 'Other', default: false },
];

function localToday() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// 記憶體內的假 OpenProject，介面與 time-tracking.mjs 相同；重啟即重置。
export function createDemoSource({ today = localToday() } = {}) {
  const entries = new Map();
  let nextId = 1;

  function workPackage(id) {
    const wp = WORK_PACKAGES.find(item => item.id === id);
    if (!wp) throw new SourceError('not_found');
    return wp;
  }

  function activity(id) {
    if (id === null) return null;
    const found = ACTIVITIES.find(item => item.id === id);
    if (!found) throw new SourceError('validation', 'Activity is not set to one of the allowed values.');
    return found;
  }

  function save(id, input) {
    const wp = workPackage(input.workPackageId);
    const act = activity(input.activityId);
    const entry = {
      id, workPackageId: wp.id, workPackageSubject: wp.subject, date: input.date, hours: input.hours,
      activityId: act?.id ?? null, activityName: act?.name ?? null, comment: input.comment,
    };
    entries.set(id, entry);
    return { ...entry };
  }

  function existing(id) {
    const entry = entries.get(id);
    if (!entry) throw new SourceError('not_found');
    return entry;
  }

  save(nextId++, { workPackageId: 1234, date: today, hours: 2.5, activityId: 3, comment: '調整表單驗證' });
  save(nextId++, { workPackageId: 2051, date: today, hours: 1, activityId: 1, comment: '' });

  return {
    async getMe() { return { id: 1, name: '示例冒險者' }; },
    async listEntries(date) {
      return [...entries.values()].filter(entry => entry.date === date).sort((a, b) => a.id - b.id).map(entry => ({ ...entry }));
    },
    async createEntry(input) { return save(nextId++, input); },
    async updateEntry(id, patch) {
      const current = existing(id);
      return save(id, { ...current, ...patch });
    },
    async deleteEntry(id) {
      existing(id);
      entries.delete(id);
    },
    async getWorkPackage(id) { return { ...workPackage(id) }; },
    async searchWorkPackages(term) {
      if (!term) return [];
      const matches = WORK_PACKAGES.filter(wp => String(wp.id).includes(term) || wp.subject.includes(term));
      matches.sort((a, b) => (String(b.id) === term) - (String(a.id) === term));
      return matches.slice(0, 10).map(wp => ({ ...wp }));
    },
    async listActivities(workPackageId) {
      workPackage(workPackageId);
      return ACTIVITIES.map(item => ({ ...item }));
    },
  };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test tests/demo.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Rewrite Demo Source For Time Tracking`，Change：`server/demo.mjs`、`tests/demo.test.mjs`）

---

### Task 10: 常駐任務儲存

**Files:**
- Create: `server/quests.mjs`
- Test: `tests/quests.test.mjs`

- [ ] **Step 1: 寫測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createQuestStore, QuestStoreError } from '../server/quests.mjs';

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'quests-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const quest = (workPackageId, activityId = null) => ({ workPackageId, subject: `WP ${workPackageId}`, activityId, activityName: activityId ? 'Dev' : null });

test('missing file is an empty list; upsert creates the directory and file', async () => {
  await withDir(async dir => {
    const path = join(dir, 'nested', 'quests.json');
    const store = createQuestStore(path);
    assert.deepEqual(await store.list(), []);
    assert.deepEqual(await store.upsert(quest(1)), [quest(1)]);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), [quest(1)]);
  });
});
test('upsert replaces an existing quest instead of duplicating it; remove drops it', async () => {
  await withDir(async dir => {
    const store = createQuestStore(join(dir, 'quests.json'));
    await store.upsert(quest(1));
    await store.upsert(quest(2));
    assert.deepEqual(await store.upsert(quest(1, 3)), [quest(1, 3), quest(2)]);
    assert.deepEqual(await store.remove(1), [quest(2)]);
    assert.deepEqual(await store.remove(99), [quest(2)]);
  });
});
test('concurrent writes are serialized and leave no temp files', async () => {
  await withDir(async dir => {
    const store = createQuestStore(join(dir, 'quests.json'));
    await Promise.all([1, 2, 3, 4, 5].map(id => store.upsert(quest(id))));
    assert.deepEqual((await store.list()).map(item => item.workPackageId).sort(), [1, 2, 3, 4, 5]);
    assert.deepEqual(await readdir(dir), ['quests.json']);
  });
});
test('corrupt file is reported and never overwritten', async () => {
  await withDir(async dir => {
    const path = join(dir, 'quests.json');
    await writeFile(path, '{ broken');
    const store = createQuestStore(path);
    await assert.rejects(store.list(), QuestStoreError);
    await assert.rejects(store.upsert(quest(1)), QuestStoreError);
    assert.equal(await readFile(path, 'utf8'), '{ broken');
    await writeFile(path, '{"not":"array"}');
    await assert.rejects(store.list(), QuestStoreError);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/quests.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作 `server/quests.mjs`**

```js
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class QuestStoreError extends Error {
  constructor() {
    super('常駐任務檔案格式錯誤，請檢查或刪除 data 目錄下的 quests 檔案');
    this.name = 'QuestStoreError';
    this.code = 'quests_corrupt';
  }
}

// 常駐任務存成 JSON 陣列；寫入先寫暫存檔再改名，並以佇列序列化避免併發覆蓋。
export function createQuestStore(path) {
  let queue = Promise.resolve();
  let tempCounter = 0;

  async function read() {
    let raw;
    try {
      raw = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    let data;
    try { data = JSON.parse(raw); } catch { throw new QuestStoreError(); }
    if (!Array.isArray(data)) throw new QuestStoreError();
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

  return {
    list: () => exclusive(read),
    upsert: quest => exclusive(async () => {
      const list = await read();
      const index = list.findIndex(item => item.workPackageId === quest.workPackageId);
      if (index >= 0) list[index] = quest;
      else list.push(quest);
      await write(list);
      return list;
    }),
    remove: workPackageId => exclusive(async () => {
      const list = await read();
      const next = list.filter(item => item.workPackageId !== workPackageId);
      if (next.length !== list.length) await write(next);
      return next;
    }),
  };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test tests/quests.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**（`[FEATURE]: Store Pinned Quests In Local JSON`，Change：`server/quests.mjs`、`tests/quests.test.mjs`）

---

### Task 11: 靜態檔案改為掃描 Vite 產物

**Files:**
- Modify (rewrite): `server/static-files.mjs`
- Test: `tests/static-files.test.mjs`

- [ ] **Step 1: 寫測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanStaticFiles } from '../server/static-files.mjs';

async function withDist(files, run) {
  const dir = await mkdtemp(join(tmpdir(), 'dist-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      await mkdir(join(dir, name, '..'), { recursive: true });
      await writeFile(join(dir, name), content);
    }
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('maps every known file under dist to a URL, with / for index.html', async () => {
  await withDist({
    'index.html': '<!doctype html>', 'assets/index-abc.js': '', 'assets/index-abc.css': '',
    'assets/cubic-11.woff2': '', 'favicon.svg': '', 'notes.txt': '',
  }, async dir => {
    const files = await scanStaticFiles(dir);
    assert.deepEqual(Object.keys(files).sort(), ['/', '/assets/cubic-11.woff2', '/assets/index-abc.css', '/assets/index-abc.js', '/favicon.svg', '/index.html']);
    assert.equal(files['/'].type, 'text/html; charset=utf-8');
    assert.equal(files['/assets/cubic-11.woff2'].type, 'font/woff2');
    assert.equal(files['/assets/index-abc.js'].path, join(dir, 'assets', 'index-abc.js'));
  });
});
test('missing dist or index.html explains how to build', async () => {
  await assert.rejects(scanStaticFiles(join(tmpdir(), 'no-such-dist-xyz')), { message: /npm run build/ });
  await withDist({ 'assets/a.js': '' }, async dir => {
    await assert.rejects(scanStaticFiles(dir), { message: /npm run build/ });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/static-files.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作 `server/static-files.mjs`**（整檔改寫）

```js
import { readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// 啟動時掃描 Vite 產物建立白名單；只有已知類型的檔案會被提供，請求路徑只做完整比對。
export async function scanStaticFiles(distDir) {
  let names;
  try {
    names = await readdir(distDir, { recursive: true, withFileTypes: true });
  } catch {
    throw new Error(`找不到前端產物 ${distDir}，請先執行 npm run build`);
  }
  const files = {};
  for (const entry of names) {
    if (!entry.isFile()) continue;
    const type = types[extname(entry.name).toLowerCase()];
    if (!type) continue;
    const path = join(entry.parentPath, entry.name);
    const url = `/${relative(distDir, path).split(sep).join('/')}`;
    files[url] = { path, type };
  }
  if (!files['/index.html']) throw new Error(`前端產物缺少 index.html，請先執行 npm run build`);
  files['/'] = files['/index.html'];
  return files;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test tests/static-files.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**（`[REFACTOR]: Scan Built Frontend For Static Files`，Change：`server/static-files.mjs`、`tests/static-files.test.mjs`）

---

### Task 12: HTTP API 路由、本體讀取與 CSRF 防護

**Files:**
- Modify (rewrite): `server/http.mjs`
- Test: `tests/http.test.mjs`

- [ ] **Step 1: 寫測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHandler, listen } from '../server/http.mjs';
import { createDemoSource } from '../server/demo.mjs';
import { createQuestStore } from '../server/quests.mjs';
import { SourceError } from '../server/openproject/errors.mjs';

const CSP = "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

async function withServer(overrides, run) {
  const dir = await mkdtemp(join(tmpdir(), 'http-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>t</title>');
  const options = {
    source: createDemoSource({ today: '2026-11-16' }), quests: createQuestStore(join(dir, 'quests.json')),
    mode: 'demo', dailyTargetHours: 8,
    staticFiles: { '/': { path: join(dir, 'index.html'), type: 'text/html; charset=utf-8' } },
    ...overrides,
  };
  const server = await listen(createHandler(options), { host: '127.0.0.1', port: 0 });
  try {
    await run(server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

function send(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const isJson = (res.headers['content-type'] ?? '').startsWith('application/json');
        resolve({ status: res.statusCode, headers: res.headers, json: isJson && text ? JSON.parse(text) : null, text });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// 模擬瀏覽器同源寫入：自訂標頭＋同源 Origin＋JSON。
const write = (port, path, method, body) => send(port, path, {
  method, body,
  headers: { 'X-Quest-Board': '1', Origin: `http://127.0.0.1:${port}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
});

test('health, me and config', async () => {
  await withServer({}, async port => {
    const health = await send(port, '/api/health');
    assert.deepEqual(health.json, { status: 'ok', mode: 'demo' });
    assert.equal(health.headers['cache-control'], 'no-store');
    assert.equal(health.headers['x-content-type-options'], 'nosniff');
    assert.equal(health.headers['content-security-policy'], CSP);
    assert.deepEqual((await send(port, '/api/me')).json, { id: 1, name: '示例冒險者' });
    assert.deepEqual((await send(port, '/api/config')).json, { dailyTargetHours: 8 });
  });
});
test('time entries CRUD through the API', async () => {
  await withServer({}, async port => {
    const list = await send(port, '/api/time-entries?date=2026-11-16');
    assert.equal(list.status, 200);
    assert.equal(list.json.length, 2);
    const created = await write(port, '/api/time-entries', 'POST', { workPackageId: 2310, date: '2026-11-16', hours: 2 });
    assert.equal(created.status, 201);
    assert.equal(created.json.workPackageSubject, '匯出報表效能問題');
    const patched = await write(port, `/api/time-entries/${created.json.id}`, 'PATCH', { hours: 3 });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.hours, 3);
    const removed = await write(port, `/api/time-entries/${created.json.id}`, 'DELETE');
    assert.equal(removed.status, 204);
    assert.equal((await send(port, '/api/time-entries?date=2026-11-16')).json.length, 2);
  });
});
test('input errors are 400 with the field', async () => {
  await withServer({}, async port => {
    const badDate = await send(port, '/api/time-entries?date=2026-02-30');
    assert.equal(badDate.status, 400);
    assert.equal(badDate.json.error.field, 'date');
    const badHours = await write(port, '/api/time-entries', 'POST', { workPackageId: 1234, date: '2026-11-16', hours: 0 });
    assert.equal(badHours.status, 400);
    assert.deepEqual(Object.keys(badHours.json.error).sort(), ['code', 'field', 'message']);
    assert.equal(badHours.json.error.field, 'hours');
    assert.equal((await write(port, '/api/time-entries/abc', 'DELETE')).status, 400);
    const badJson = await send(port, '/api/time-entries', { method: 'POST', body: '{oops',
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json' } });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.json.error.code, 'invalid_json');
  });
});
test('source errors map to status codes', async () => {
  await withServer({}, async port => {
    const missing = await write(port, '/api/time-entries', 'POST', { workPackageId: 999, date: '2026-11-16', hours: 1 });
    assert.equal(missing.status, 404);
    const invalid = await write(port, '/api/time-entries', 'POST', { workPackageId: 1234, date: '2026-11-16', hours: 1, activityId: 77 });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.json.error.code, 'validation');
  });
  const failing = { getMe: async () => { throw new SourceError('unauthorized'); } };
  await withServer({ source: failing }, async port => {
    const res = await send(port, '/api/me');
    assert.equal(res.status, 502);
    assert.equal(res.json.error.code, 'unauthorized');
  });
  const crashing = { getMe: async () => { throw new Error('SECRET_TOKEN in stack'); } };
  await withServer({ source: crashing }, async port => {
    const res = await send(port, '/api/me');
    assert.equal(res.status, 500);
    assert.ok(!res.text.includes('SECRET_TOKEN'));
  });
});
test('search and activities', async () => {
  await withServer({}, async port => {
    const found = await send(port, `/api/work-packages/search?q=${encodeURIComponent('#2051')}`);
    assert.equal(found.json[0].id, 2051);
    assert.deepEqual((await send(port, '/api/work-packages/search?q=')).json, []);
    const activities = await send(port, '/api/activities?workPackageId=1234');
    assert.ok(activities.json.length > 0);
    assert.equal((await send(port, '/api/activities')).status, 400);
  });
});
test('quests: pin with subject and activity name, re-pin updates, unpin', async () => {
  await withServer({}, async port => {
    assert.deepEqual((await send(port, '/api/quests')).json, []);
    const pinned = await write(port, '/api/quests', 'POST', { workPackageId: 1234, activityId: 3 });
    assert.equal(pinned.status, 200);
    assert.deepEqual(pinned.json, [{ workPackageId: 1234, subject: '前端登入頁改版', activityId: 3, activityName: 'Development' }]);
    const repinned = await write(port, '/api/quests', 'POST', { workPackageId: 1234 });
    assert.deepEqual(repinned.json, [{ workPackageId: 1234, subject: '前端登入頁改版', activityId: null, activityName: null }]);
    assert.equal((await write(port, '/api/quests', 'POST', { workPackageId: 1234, activityId: 77 })).status, 400);
    assert.equal((await write(port, '/api/quests', 'POST', { workPackageId: 999 })).status, 404);
    assert.deepEqual((await write(port, '/api/quests/1234', 'DELETE')).json, []);
  });
});
test('corrupt quest file is a 500 with a clear code', async () => {
  const quests = { list: async () => { const { QuestStoreError } = await import('../server/quests.mjs'); throw new QuestStoreError(); } };
  await withServer({ quests }, async port => {
    const res = await send(port, '/api/quests');
    assert.equal(res.status, 500);
    assert.equal(res.json.error.code, 'quests_corrupt');
  });
});
test('writes require the custom header, same origin, JSON and a small body', async () => {
  await withServer({}, async port => {
    const body = { workPackageId: 1234, date: '2026-11-16', hours: 1 };
    const noHeader = await send(port, '/api/time-entries', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    assert.equal(noHeader.status, 403);
    assert.equal(noHeader.json.error.code, 'csrf_rejected');
    const foreign = await send(port, '/api/time-entries', { method: 'POST', body,
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json', Origin: 'http://evil.test' } });
    assert.equal(foreign.status, 403);
    const noOrigin = await send(port, '/api/time-entries', { method: 'POST', body,
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json' } });
    assert.equal(noOrigin.status, 201);
    const localhost = await send(port, '/api/time-entries', { method: 'POST', body,
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json', Origin: `http://localhost:${port}` } });
    assert.equal(localhost.status, 201);
    const text = await send(port, '/api/time-entries', { method: 'POST', body,
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'text/plain' } });
    assert.equal(text.status, 415);
    const big = await send(port, '/api/time-entries', { method: 'POST', body: JSON.stringify({ comment: 'x'.repeat(17 * 1024) }),
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json' } });
    assert.equal(big.status, 413);
  });
});
test('host check, method handling and static files', async () => {
  await withServer({}, async port => {
    const rebinding = await send(port, '/api/health', { headers: { Host: 'evil.test' } });
    assert.equal(rebinding.status, 403);
    const wrongMethod = await write(port, '/api/me', 'POST', {});
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.allow, 'GET');
    const entryMethod = await write(port, '/api/time-entries/5', 'PUT', {});
    assert.equal(entryMethod.status, 405);
    assert.equal(entryMethod.headers.allow, 'PATCH, DELETE');
    assert.equal((await send(port, '/api/nope')).status, 404);
    const page = await send(port, '/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /^text\/html/);
    assert.equal(page.headers['content-security-policy'], CSP);
    assert.equal((await send(port, '/', { method: 'HEAD' })).text, '');
    assert.equal((await write(port, '/', 'POST', {})).status, 405);
    assert.equal((await send(port, '/missing.js')).status, 404);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/http.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作 `server/http.mjs`**（整檔改寫）

```js
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { SourceError, errorInfo, statusFor } from './openproject/errors.mjs';
import { QuestStoreError } from './quests.mjs';
import { InputError, parseDate, parseEntryInput, parsePathId, parseQuestInput, parseSearchTerm } from './validate.mjs';

// Vite 產物沒有 inline script 與 import map，因此用固定 CSP。
export const CSP = "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const MAX_BODY = 16 * 1024;
const baseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP };

class HttpError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

// 路由表：[方法, 路徑樣式, 處理函式]；同一路徑有多個方法時，405 的 Allow 依此產生。
function routes({ source, quests, mode, dailyTargetHours }) {
  return [
    ['GET', /^\/api\/health$/, () => ({ body: { status: 'ok', mode } })],
    ['GET', /^\/api\/me$/, async () => ({ body: await source.getMe() })],
    ['GET', /^\/api\/config$/, () => ({ body: { dailyTargetHours } })],
    ['GET', /^\/api\/time-entries$/, async ({ url }) => ({ body: await source.listEntries(parseDate(url.searchParams.get('date'))) })],
    ['POST', /^\/api\/time-entries$/, async ({ readBody }) => ({ status: 201, body: await source.createEntry(parseEntryInput(await readBody())) })],
    ['PATCH', /^\/api\/time-entries\/([^/]+)$/, async ({ match, readBody }) => {
      const id = parsePathId(match[1], 'id');
      return { body: await source.updateEntry(id, parseEntryInput(await readBody(), { partial: true })) };
    }],
    ['DELETE', /^\/api\/time-entries\/([^/]+)$/, async ({ match }) => {
      await source.deleteEntry(parsePathId(match[1], 'id'));
      return { status: 204 };
    }],
    ['GET', /^\/api\/work-packages\/search$/, async ({ url }) => ({ body: await source.searchWorkPackages(parseSearchTerm(url.searchParams.get('q'))) })],
    ['GET', /^\/api\/activities$/, async ({ url }) => ({ body: await source.listActivities(parsePathId(url.searchParams.get('workPackageId') ?? '', 'workPackageId')) })],
    ['GET', /^\/api\/quests$/, async () => ({ body: await quests.list() })],
    ['POST', /^\/api\/quests$/, async ({ readBody }) => {
      const { workPackageId, activityId } = parseQuestInput(await readBody());
      const wp = await source.getWorkPackage(workPackageId);
      let activityName = null;
      if (activityId !== null) {
        const activity = (await source.listActivities(workPackageId)).find(item => item.id === activityId);
        if (!activity) throw new InputError('activityId', '此 work package 不能使用這個活動類型');
        activityName = activity.name;
      }
      return { body: await quests.upsert({ workPackageId, subject: wp.subject, activityId, activityName }) };
    }],
    ['DELETE', /^\/api\/quests\/([^/]+)$/, async ({ match }) => ({ body: await quests.remove(parsePathId(match[1], 'workPackageId')) })],
  ];
}

export function createHandler({ source, quests, mode, dailyTargetHours, staticFiles = {} }) {
  const table = routes({ source, quests, mode, dailyTargetHours });
  return async (req, res) => {
    try {
      await route(req, res, table, staticFiles);
    } catch (error) {
      handleError(req, res, error);
    }
  };
}

export function listen(handler, { host, port }) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

async function route(req, res, table, staticFiles) {
  const port = req.socket.localPort;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host?.toLowerCase())) {
    throw new HttpError(403, 'forbidden_host', '只接受本機位址存取');
  }
  if (!isOriginForm(req.url)) throw new HttpError(400, 'invalid_request_target', '請求路徑格式不正確');
  const url = new URL(req.url, 'http://127.0.0.1');

  if (url.pathname.startsWith('/api/')) {
    const candidates = table.filter(([, pattern]) => pattern.test(url.pathname));
    if (!candidates.length) throw new HttpError(404, 'not_found', '找不到資源');
    const found = candidates.find(([method]) => method === req.method);
    if (!found) {
      throw new HttpError(405, 'method_not_allowed', '不支援此方法', { Allow: candidates.map(([method]) => method).join(', ') });
    }
    if (req.method !== 'GET') assertSameSiteWrite(req, port);
    const [, pattern, handler] = found;
    const result = await handler({ url, match: url.pathname.match(pattern), readBody: () => readJsonBody(req) });
    if (result.status === 204) {
      res.writeHead(204, baseHeaders);
      return res.end();
    }
    return sendJson(req, res, result.status ?? 200, result.body);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new HttpError(405, 'method_not_allowed', '僅支援 GET 與 HEAD', { Allow: 'GET, HEAD' });
  }
  // 白名單以正規化後的完整路徑比對，不組合檔案路徑，因此不存在目錄穿越。
  if (!Object.hasOwn(staticFiles, url.pathname)) throw new HttpError(404, 'not_found', '找不到資源');
  const file = staticFiles[url.pathname];
  return send(req, res, 200, file.type, await readFile(file.path));
}

// CSRF：跨站表單無法加自訂標頭；若瀏覽器帶 Origin，必須是本服務自己的位址。
function assertSameSiteWrite(req, port) {
  const origin = req.headers.origin;
  const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  if (req.headers['x-quest-board'] !== '1' || (origin !== undefined && !allowed.includes(origin.toLowerCase()))) {
    throw new HttpError(403, 'csrf_rejected', '拒絕來源不明的寫入請求');
  }
}

// 用 data/end 讀完整個本體（超過上限的部分直接丟棄）再回應：
// 在 for await 迴圈中丟錯會銷毀請求串流與連線，用戶端只會看到連線重設，收不到 413。
function readJsonBody(req) {
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    return Promise.reject(new HttpError(415, 'unsupported_media_type', '請求內容必須是 JSON'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(new HttpError(413, 'payload_too_large', '請求內容過大'));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'invalid_json', '請求內容不是有效的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function handleError(req, res, error) {
  if (res.headersSent) return res.destroy();
  if (error instanceof HttpError) {
    for (const [name, value] of Object.entries(error.headers)) res.setHeader(name, value);
    // 415 時沒有讀取請求本體，回應後關閉連線，避免殘留本體干擾同一連線的下一個請求。
    if (error.status === 415) res.setHeader('Connection', 'close');
    return sendError(req, res, error.status, { code: error.code, message: error.message });
  }
  if (error instanceof InputError) {
    return sendError(req, res, 400, { code: error.code, message: error.message, field: error.field });
  }
  if (error instanceof SourceError) return sendError(req, res, statusFor(error.code), errorInfo(error));
  if (error instanceof QuestStoreError) return sendError(req, res, 500, { code: error.code, message: error.message });
  // 只記錄白名單欄位，不記錄訊息或堆疊：來源錯誤可能含 token 或來源回應。
  console.error('Request failed:', req.method, safePathname(req.url), error?.name ?? 'Error');
  return sendError(req, res, 500, errorInfo(error));
}

// 只接受 origin-form；'//'、絕對形式與反斜線會讓 URL 解析改變主機或路徑。
function isOriginForm(target) {
  return target.startsWith('/') && !target.startsWith('//') && !target.includes('\\');
}

function safePathname(target) {
  if (!isOriginForm(target)) return '-';
  try { return new URL(target, 'http://127.0.0.1').pathname; } catch { return '-'; }
}

function send(req, res, status, type, body) {
  res.writeHead(status, { ...baseHeaders, 'Content-Type': type, 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendJson(req, res, status, data) {
  send(req, res, status, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(data)));
}

function sendError(req, res, status, error) {
  sendJson(req, res, status, { error });
}
```

注意：`Host` 檢查前於 `route` 中丟出的 `HttpError` 也走 `handleError`，因此禁止的 Host 也會拿到 JSON 錯誤。

- [ ] **Step 4: 執行確認通過**

Run: `node --test tests/http.test.mjs`
Expected: PASS（413 測試必須真的收到 413 狀態，不可改成接受連線重設）。

- [ ] **Step 5: Commit**（`[FEATURE]: Serve Time Tracking JSON API With CSRF Guard`，Change：`server/http.mjs`、`tests/http.test.mjs`）

---

### Task 13: 啟動組裝與整合測試

**Files:**
- Modify (rewrite): `server/index.mjs`
- Modify: `config/example.json`
- Test: `tests/index.test.mjs`

- [ ] **Step 1: 寫測試**（沿用舊 index.test 的 `start`、`freePort`、`runServer` 骨架，差別是設定帶入暫存的 `staticDir` 與 `dataDir`）

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const entry = fileURLToPath(new URL('../server/index.mjs', import.meta.url));

function start(args) {
  return new Promise(resolve => {
    execFile(process.execPath, [entry, ...args], { timeout: 5000 }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// 以暫存目錄當 staticDir 與 dataDir 啟動服務，執行 check 後關閉；回傳輸出供機密檢查。
async function runServer(config, check) {
  const dir = await mkdtemp(join(tmpdir(), 'quest-index-'));
  const port = await freePort();
  let child;
  let output = '';
  try {
    const staticDir = join(dir, 'dist');
    await mkdir(staticDir);
    await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>quest</title>');
    const path = join(dir, 'local.json');
    await writeFile(path, JSON.stringify({ staticDir, dataDir: join(dir, 'data'), ...config, port }));
    child = spawn(process.execPath, [entry, '--config', path]);
    child.stderr.on('data', chunk => { output += chunk; });
    const exited = new Promise(resolve => child.once('exit', resolve));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes(`http://127.0.0.1:${port}/`)) { clearTimeout(timer); resolve(); }
      });
      exited.then(code => { clearTimeout(timer); reject(new Error(`server exited early: ${code}\n${output}`)); });
    });
    await check(`http://127.0.0.1:${port}`, dir);
    return output;
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test('missing config fails with a clear message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quest-index-'));
  try {
    const result = await start(['--config', join(dir, 'missing.json')]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Config file is missing or unreadable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('missing frontend build fails with a build hint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quest-index-'));
  try {
    const path = join(dir, 'local.json');
    await writeFile(path, JSON.stringify({ mode: 'demo', staticDir: join(dir, 'nope') }));
    const result = await start(['--config', path]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /npm run build/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('demo mode serves the page, API, and stores quests in dataDir', async () => {
  await runServer({ mode: 'demo' }, async (base, dir) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    await page.text();
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', mode: 'demo' });
    const pinned = await fetch(`${base}/api/quests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Quest-Board': '1', Origin: base },
      body: JSON.stringify({ workPackageId: 1234, activityId: 3 }),
    });
    assert.equal(pinned.status, 200);
    await pinned.text();
    const saved = JSON.parse(await readFile(join(dir, 'data', 'demo-quests.json'), 'utf8'));
    assert.equal(saved[0].workPackageId, 1234);
  });
});
test('live mode reports source errors as JSON and never prints the token', async () => {
  const closed = await freePort();
  const output = await runServer({ mode: 'live', baseUrl: `http://127.0.0.1:${closed}/`, apiToken: 'FAKE_TOKEN_123' }, async base => {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', mode: 'live' });
    const response = await fetch(`${base}/api/me`);
    const body = await response.text();
    assert.equal(response.status, 502);
    assert.equal(JSON.parse(body).error.code, 'network');
    assert.ok(!body.includes('FAKE_TOKEN_123'));
  });
  assert.ok(!output.includes('FAKE_TOKEN_123'));
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test tests/index.test.mjs`
Expected: FAIL（index.mjs 仍引用已刪除的模組）

- [ ] **Step 3: 實作 `server/index.mjs`**（整檔改寫）

```js
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.mjs';
import { createDemoSource } from './demo.mjs';
import { createHandler, listen } from './http.mjs';
import { createClient } from './openproject/client.mjs';
import { createQuestStore } from './quests.mjs';
import { scanStaticFiles } from './static-files.mjs';
import { createTimeTrackingSource } from './time-tracking.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  // 相對路徑以專案根目錄為基準，與執行時所在目錄無關。
  const { values } = parseArgs({ options: { config: { type: 'string', default: 'config/local.json' } } });
  const config = await loadConfig(resolve(root, values.config));
  const staticFiles = await scanStaticFiles(resolve(root, config.staticDir));
  const source = config.mode === 'demo'
    ? createDemoSource()
    : createTimeTrackingSource({ client: createClient(config) });
  // 示例與真實的 work package 編號不同，常駐任務分開存放。
  const quests = createQuestStore(resolve(root, config.dataDir, config.mode === 'demo' ? 'demo-quests.json' : 'quests.json'));
  const handler = createHandler({ source, quests, mode: config.mode, dailyTargetHours: config.dailyTargetHours, staticFiles });
  const server = await listen(handler, { host: config.host, port: config.port });
  console.log(`${config.mode === 'demo' ? '示例模式' : '即時模式'}已啟動：http://${config.host}:${config.port}/`);
  const stop = () => {
    server.close(() => process.exit(0));
    // 卡住的連線不應讓關閉永遠等待。
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(error => {
  console.error(`啟動失敗：${error.message}`);
  process.exitCode = 1;
});
```

（`createClient(config)` 只會取用 `baseUrl` 與 `apiToken`，其餘欄位被忽略。）

- [ ] **Step 4: 更新 `config/example.json`**

```json
{
  "mode": "demo",
  "host": "127.0.0.1",
  "port": 4173,
  "dailyTargetHours": 8
}
```

- [ ] **Step 5: 執行全部測試**

Run: `npm test`
Expected: 全部 PASS（config、errors、hours、openproject-client、validate、time-tracking、demo、quests、static-files、http、index）

- [ ] **Step 6: Commit**（`[FEATURE]: Wire Quest Board Server Startup`，Change：`server/index.mjs`、`config/example.json`、`tests/index.test.mjs`）

---

### Task 14: 示例模式端對端煙霧測試

**Files:** 無程式異動

- [ ] **Step 1: 建一個暫時的前端頁面讓伺服器能啟動**

```bash
mkdir -p web/dist && printf '<!doctype html><title>placeholder</title>' > web/dist/index.html
```

（`web/dist/` 已被 git 忽略；前端計畫會用真正的產物取代。）

- [ ] **Step 2: 啟動示例模式**（背景執行）

Run: `npm run demo`
Expected: 印出 `示例模式已啟動：http://127.0.0.1:4173/`

- [ ] **Step 3: 以 curl 走一遍流程**

```bash
B=http://127.0.0.1:4173
curl -s $B/api/me
curl -s "$B/api/time-entries?date=$(date +%F)"
curl -s "$B/api/work-packages/search?q=%23231"
curl -s -X POST $B/api/time-entries -H 'Content-Type: application/json' -H 'X-Quest-Board: 1' \
  -d "{\"workPackageId\":2310,\"date\":\"$(date +%F)\",\"hours\":1.5,\"comment\":\"smoke\"}"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/api/time-entries -H 'Content-Type: application/json' -d '{}'
```

Expected：依序得到使用者、兩筆示例工時、`#2310` 開頭的搜尋結果、新建立的工時（`hours: 1.5`），最後一行是 `403`（缺少自訂標頭）。

- [ ] **Step 4: 停止伺服器**，在 `tasks/todo.md` 記錄後端完成與煙霧測試結果（不需 commit 暫時頁面）。

---

## 完成條件

- `npm test` 全部通過。
- 示例模式煙霧測試結果符合預期。
- `git grep -n "three\|snapshot\|participants" -- server tests package.json` 沒有殘留（docs 除外）。
