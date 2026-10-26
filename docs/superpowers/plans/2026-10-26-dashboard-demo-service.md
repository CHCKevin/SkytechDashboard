# Dashboard 本機示例服務 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立只監聽 127.0.0.1 的唯讀 HTTP 服務，以明確標示的合成示例資料提供路線圖定義的統一 JSON 介面，供第三階段 3D 前端開發使用。

**Architecture:** `server/demo.mjs` 實作「資料來源」介面（`getSnapshot`、`getParticipants`），第四階段的 OpenProject adapter 會實作同一介面替換它。`server/http.mjs` 只負責路由、Host／方法檢查、靜態檔白名單與 JSON 回應，不知道資料來自示例或真實來源。`server/index.mjs` 讀設定、選來源、啟動與關閉服務。

**Tech Stack:** Node.js ESM、`node:http`、`node:test`、`node:assert/strict`；仍不需要外部套件。

---

## 開始前

- 前置：第一階段已提交於 `feature/foundation`（`fa9045c`），`npm test` 為 8 個通過。
- 從 `feature/foundation` 建立 `feature/demo-service` 分支：`git checkout -b feature/demo-service`。不要直接在 master 實作，不修改 .git ACL。
- 不連線 OpenProject、不建立 `config/local.json`、不使用真實 token。測試只用明確假值（如 `FAKE_TOKEN_123`）。
- 每個任務依「測試 → 預期失敗 → 最小實作 → 通過 → 提交」執行。
- 回應與紀錄文字使用繁體中文；程式識別字、錯誤代碼與 commit 訊息用英文。

## 介面約定（本階段固定，後續階段沿用）

資料來源物件：

```js
// 兩個方法皆為 async；refresh 為 boolean
source.getSnapshot({ refresh })            // → Snapshot（見 roadmap 契約）
source.getParticipants(id, { refresh })    // → ParticipantResult，找不到項目回傳 null
```

HTTP 路由：

| 方法 | 路徑 | 成功 | 錯誤 |
|---|---|---|---|
| GET/HEAD | `/api/health` | 200 `{ status: 'ok', mode }` | — |
| GET/HEAD | `/api/snapshot[?refresh=1]` | 200 Snapshot | 500 `internal_error` |
| GET/HEAD | `/api/work-packages/:id/participants[?refresh=1]` | 200 ParticipantResult（含 `complete:false` 的部分結果） | 400 `invalid_id`、404 `work_package_not_found` |
| GET/HEAD | 靜態白名單（本階段只有 `/`） | 200 檔案 | 404 `not_found` |
| 其他方法 | 任何路徑 | — | 405 `method_not_allowed`，`Allow: GET, HEAD` |
| 任何 | Host 不是 `127.0.0.1:<port>` 或 `localhost:<port>` | — | 403 `forbidden_host`（防 DNS rebinding） |

錯誤格式一律為 `{ "error": { "code": "<英文代碼>", "message": "<繁中說明>" } }`。所有回應帶 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`Content-Security-Policy: default-src 'self'`。500 回應不包含例外訊息，避免第四階段時洩漏 token 或來源回應。

## 檔案清單

| 路徑 | 動作 | 職責 |
|---|---|---|
| `server/demo.mjs` | 新增 | 合成示例資料與示例資料來源 |
| `server/http.mjs` | 新增 | 路由、Host／方法檢查、靜態白名單、JSON 回應、`listen` |
| `server/index.mjs` | 新增 | 解析 `--config`、讀設定、選來源、啟動與關閉 |
| `client/index.html` | 新增 | 暫時頁面，標示為示例服務並列出 API；第三階段取代 |
| `tests/demo.test.mjs` | 新增 | 示例資料覆蓋情境與契約 |
| `tests/http.test.mjs` | 新增 | 路由、方法、Host、靜態白名單、錯誤不外洩 |
| `tests/index.test.mjs` | 新增 | 啟動失敗路徑（缺設定、live 模式）不回顯機密 |
| `package.json` | 修改 | 新增 `start`、`demo` 指令 |
| `handoff.md` | 修改 | 本階段結果 |

## Task 1：示例資料來源

示例資料必須涵蓋 roadmap 列出的情境：空專案、未指派、同名不同 ID、同一人兼任多角色、未知狀態、歷史不完整。另含一筆描述為 HTML 字串的項目，供第三階段驗證前端不會注入 HTML。1,000 筆合成項目的效能資料屬第六階段，本階段不做。

**Files:**
- Create: `tests/demo.test.mjs`
- Create: `server/demo.mjs`

- [ ] **Step 1：撰寫失敗測試** `tests/demo.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSource } from '../server/demo.mjs';

const fixedNow = () => new Date('2026-10-26T12:00:00.000Z');

test('snapshot is complete, labeled demo, and covers the required cases', async () => {
  const s = await createDemoSource({ now: fixedNow }).getSnapshot({ refresh: false });
  assert.equal(s.mode, 'demo');
  assert.equal(s.complete, true);
  assert.equal(s.stale, false);
  assert.equal(s.error, null);
  assert.equal(s.lastSuccessAt, '2026-10-26T12:00:00.000Z');
  assert.deepEqual(s.progress, { loaded: s.workPackages.length, total: s.workPackages.length });
  const used = new Set(s.workPackages.map(wp => wp.projectId));
  assert.ok(s.projects.some(p => !used.has(p.id)), 'has an empty project');
  assert.ok(s.workPackages.some(wp => wp.assignee === null), 'has an unassigned item');
  assert.ok(s.workPackages.some(wp => wp.updatedAt === null), 'has an item without updatedAt');
  assert.ok(s.workPackages.every(wp => wp.url === null), 'demo never fabricates source links');
  for (const wp of s.workPackages) {
    assert.ok(s.statuses.some(st => st.id === wp.status.id && st.name === wp.status.name &&
      st.color === wp.status.color), `status of ${wp.id} is in the legend`);
  }
  assert.ok(s.statuses.every(st => /^#[0-9a-f]{6}$/.test(st.color)));
  assert.ok(s.statuses.some(st => st.id === null && st.name === '未知狀態' && st.color === '#94a3b8'));
});
test('participants cover multi-role, same-name, and incomplete history', async () => {
  const source = createDemoSource({ now: fixedNow });
  const multiRole = await source.getParticipants('1002', { refresh: false });
  assert.equal(multiRole.people.length, 1);
  assert.equal(multiRole.complete, true);
  assert.equal(multiRole.error, null);
  const sameName = await source.getParticipants('1003', { refresh: false });
  assert.deepEqual(sameName.people.map(p => [p.id, p.name]), [['2', 'Alex'], ['1', 'Alex']]);
  assert.equal(sameName.workPackageUpdatedAt, null);
  const partial = await source.getParticipants('1004', { refresh: false });
  assert.equal(partial.complete, false);
  assert.equal(partial.error.code, 'activities_incomplete');
  assert.ok(partial.people.some(p => p.id === null));
  assert.equal(await source.getParticipants('9999', { refresh: false }), null);
});
test('returned data are copies that callers cannot corrupt', async () => {
  const source = createDemoSource({ now: fixedNow });
  const first = await source.getSnapshot({ refresh: false });
  first.projects[0].name = 'changed';
  first.workPackages[0].status.name = 'changed';
  const second = await source.getSnapshot({ refresh: false });
  assert.notEqual(second.projects[0].name, 'changed');
  assert.notEqual(second.workPackages[0].status.name, 'changed');
});
```

- [ ] **Step 2：確認失敗**

Run: `node --test tests/demo.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`（找不到 `server/demo.mjs`）

- [ ] **Step 3：實作** `server/demo.mjs`

```js
import { colorForStatus } from '../shared/layout.mjs';
import { collectParticipants } from '../shared/participants.mjs';

// 合成示例資料，不代表任何真實 OpenProject 內容。
// 涵蓋：空專案、未指派、同名不同 ID、一人多角色、未知狀態、無 updatedAt、歷史不完整、HTML 字串描述。
const people = {
  alexA: { id: '1', name: 'Alex' },
  alexB: { id: '2', name: 'Alex' },
  mei: { id: '3', name: '林小美' },
  wen: { id: '4', name: '陳大文' },
  deleted: { id: null, name: '已刪除使用者' },
};

const statuses = [
  { id: '1', name: '新建', color: '#1E90FF' },
  { id: '7', name: '進行中', color: null },
  { id: '12', name: '已關閉', color: '#6B7280' },
  { id: null, name: '未知狀態', color: null },
].map(status => ({ ...status, color: colorForStatus(status.id, status.color) }));
const statusById = new Map(statuses.map(status => [status.id, status]));

const projects = [
  { id: '101', name: '星圖平台' },
  { id: '102', name: '太空站維運' },
  { id: '103', name: '空專案' },
];

const workPackages = [
  { id: '1001', projectId: '101', subject: '建立登入頁', author: people.alexA, assignee: people.mei,
    statusId: '7', description: '示例：一般工作項目', updatedAt: '2026-10-20T08:00:00.000Z' },
  { id: '1002', projectId: '101', subject: '整合 API', author: people.mei, assignee: people.mei,
    statusId: '1', description: '<b>示例：此字串不應被當成 HTML</b>', updatedAt: '2026-10-22T03:30:00.000Z' },
  { id: '1003', projectId: '101', subject: '撰寫文件', author: people.alexB, assignee: null,
    statusId: '12', description: null, updatedAt: null },
  { id: '1004', projectId: '102', subject: '機房巡檢', author: people.wen, assignee: people.alexA,
    statusId: null, description: '示例：狀態不明且活動歷史不完整', updatedAt: '2026-10-25T10:15:00.000Z' },
];

const activities = {
  '1001': { authors: [people.mei, people.alexA, people.wen], complete: true },
  '1002': { authors: [people.mei], complete: true },
  '1003': { authors: [people.alexA, people.alexB], complete: true },
  '1004': { authors: [people.deleted], complete: false },
};

export function createDemoSource({ now = () => new Date() } = {}) {
  return {
    async getSnapshot() {
      const items = workPackages.map(({ statusId, ...wp }) =>
        ({ ...wp, status: statusById.get(statusId), url: null }));
      return structuredClone({
        mode: 'demo', revision: 'demo-1',
        projects, workPackages: items, statuses,
        complete: true, stale: false, lastSuccessAt: now().toISOString(),
        progress: { loaded: items.length, total: items.length },
        error: null,
      });
    },
    async getParticipants(id) {
      const wp = workPackages.find(item => item.id === id);
      if (!wp) return null;
      const history = activities[id];
      return structuredClone({
        workPackageId: id,
        workPackageUpdatedAt: wp.updatedAt,
        people: collectParticipants(wp.author, wp.assignee, history.authors),
        complete: history.complete,
        error: history.complete ? null
          : { code: 'activities_incomplete', message: '示例：活動歷史僅部分可讀，參與者名單可能不完整' },
      });
    },
  };
}
```

`refresh` 參數在示例來源中沒有作用（資料固定），但介面保留，HTTP 層仍須傳遞，第四階段 adapter 會使用。

- [ ] **Step 4：確認通過**

Run: `node --test tests/demo.test.mjs`
Expected: 3 個測試通過、0 失敗

- [ ] **Step 5：提交**

```bash
git add tests/demo.test.mjs server/demo.mjs
git commit -m "feat: add synthetic demo data source"
```

## Task 2：HTTP 路由與安全邊界

**Files:**
- Create: `tests/http.test.mjs`
- Create: `server/http.mjs`

- [ ] **Step 1：撰寫失敗測試** `tests/http.test.mjs`

測試一律用 `node:http` 的 `request` 送原始路徑，因為 `fetch` 會先正規化 `..`，無法測到目錄穿越。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHandler, listen } from '../server/http.mjs';
import { createDemoSource } from '../server/demo.mjs';

async function withServer(options, run) {
  const server = await listen(createHandler(options), { host: '127.0.0.1', port: 0 });
  try {
    await run(server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function send(port, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const isJson = (res.headers['content-type'] ?? '').startsWith('application/json');
        resolve({ status: res.statusCode, headers: res.headers, body,
          json: isJson && body ? JSON.parse(body) : null });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const demo = () => ({ source: createDemoSource(), mode: 'demo' });

test('health exposes only status and mode with safe headers', async () => {
  await withServer(demo(), async port => {
    const res = await send(port, '/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { status: 'ok', mode: 'demo' });
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['content-security-policy'], "default-src 'self'");
  });
});
test('snapshot and participants follow the contract', async () => {
  await withServer(demo(), async port => {
    const snapshot = await send(port, '/api/snapshot');
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.json.mode, 'demo');
    assert.equal(snapshot.json.workPackages.length, 4);
    const people = await send(port, '/api/work-packages/1001/participants');
    assert.equal(people.status, 200);
    assert.equal(people.json.workPackageId, '1001');
    const partial = await send(port, '/api/work-packages/1004/participants');
    assert.equal(partial.status, 200);
    assert.equal(partial.json.complete, false);
    const missing = await send(port, '/api/work-packages/9999/participants');
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error.code, 'work_package_not_found');
    const invalid = await send(port, '/api/work-packages/abc/participants');
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json.error.code, 'invalid_id');
  });
});
test('refresh flag is passed to the source', async () => {
  const calls = [];
  const source = {
    async getSnapshot({ refresh }) { calls.push(['snapshot', refresh]); return { workPackages: [] }; },
    async getParticipants(id, { refresh }) { calls.push(['participants', id, refresh]); return { workPackageId: id }; },
  };
  await withServer({ source, mode: 'demo' }, async port => {
    await send(port, '/api/snapshot?refresh=1');
    await send(port, '/api/snapshot');
    await send(port, '/api/work-packages/7/participants?refresh=1');
  });
  assert.deepEqual(calls, [['snapshot', true], ['snapshot', false], ['participants', '7', true]]);
});
test('only GET and HEAD are allowed', async () => {
  await withServer(demo(), async port => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await send(port, '/api/snapshot', { method });
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.allow, 'GET, HEAD');
      assert.equal(res.json.error.code, 'method_not_allowed');
    }
    const head = await send(port, '/api/health', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.ok(Number(head.headers['content-length']) > 0);
  });
});
test('config, source files, and traversal paths are never served', async () => {
  await withServer(demo(), async port => {
    for (const path of ['/config/local.json', '/config/example.json', '/server/config.mjs',
      '/package.json', '/client/index.html', '/../config/local.json',
      '/%2e%2e/config/local.json', '/api/../config/local.json', '/.git/config']) {
      const res = await send(port, path);
      assert.equal(res.status, 404, path);
      assert.equal(res.json.error.code, 'not_found', path);
    }
  });
});
test('static whitelist serves only listed files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-static-'));
  try {
    const page = join(dir, 'index.html');
    await writeFile(page, '<!doctype html><title>t</title>');
    const staticFiles = { '/': { path: page, type: 'text/html; charset=utf-8' } };
    await withServer({ ...demo(), staticFiles }, async port => {
      const res = await send(port, '/');
      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
      assert.equal(res.body, '<!doctype html><title>t</title>');
      assert.equal((await send(port, '/index.html')).status, 404);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('rejects foreign Host headers', async () => {
  await withServer(demo(), async port => {
    const evil = await send(port, '/api/health', { headers: { host: 'evil.test' } });
    assert.equal(evil.status, 403);
    assert.equal(evil.json.error.code, 'forbidden_host');
    const wrongPort = await send(port, '/api/health', { headers: { host: `127.0.0.1:${port + 1}` } });
    assert.equal(wrongPort.status, 403);
    const localhost = await send(port, '/api/health', { headers: { host: `localhost:${port}` } });
    assert.equal(localhost.status, 200);
  });
});
test('empty data is returned as a valid snapshot', async () => {
  const empty = {
    mode: 'demo', revision: 'empty', projects: [], workPackages: [], statuses: [],
    complete: true, stale: false, lastSuccessAt: null,
    progress: { loaded: 0, total: 0 }, error: null,
  };
  const source = { async getSnapshot() { return empty; }, async getParticipants() { return null; } };
  await withServer({ source, mode: 'demo' }, async port => {
    const res = await send(port, '/api/snapshot');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, empty);
  });
});
test('source failures return a generic error without details', async () => {
  const source = {
    async getSnapshot() { throw new Error('SECRET token=FAKE_TOKEN_123'); },
    async getParticipants() { throw new Error('SECRET token=FAKE_TOKEN_123'); },
  };
  await withServer({ source, mode: 'demo' }, async port => {
    for (const path of ['/api/snapshot', '/api/work-packages/1/participants']) {
      const res = await send(port, path);
      assert.equal(res.status, 500, path);
      assert.deepEqual(res.json, { error: { code: 'internal_error', message: '伺服器內部錯誤' } });
      assert.ok(!res.body.includes('SECRET'));
    }
  });
});
```

- [ ] **Step 2：確認失敗**

Run: `node --test tests/http.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`（找不到 `server/http.mjs`）

- [ ] **Step 3：實作** `server/http.mjs`

```js
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'",
};

export function createHandler({ source, mode, staticFiles = {} }) {
  return async (req, res) => {
    try {
      await route(req, res, { source, mode, staticFiles });
    } catch {
      // 不回傳也不記錄例外內容：第四階段的來源錯誤可能含 token 或來源回應。
      if (res.headersSent) res.destroy();
      else sendError(req, res, 500, 'internal_error', '伺服器內部錯誤');
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

async function route(req, res, { source, mode, staticFiles }) {
  const port = req.socket.localPort;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {
    return sendError(req, res, 403, 'forbidden_host', '只接受本機位址存取');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendError(req, res, 405, 'method_not_allowed', '僅支援 GET 與 HEAD');
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  const refresh = url.searchParams.get('refresh') === '1';
  if (url.pathname === '/api/health') {
    return sendJson(req, res, 200, { status: 'ok', mode });
  }
  if (url.pathname === '/api/snapshot') {
    return sendJson(req, res, 200, await source.getSnapshot({ refresh }));
  }
  const match = url.pathname.match(/^\/api\/work-packages\/([^/]+)\/participants$/);
  if (match) {
    if (!/^\d+$/.test(match[1])) return sendError(req, res, 400, 'invalid_id', '工作項目 ID 格式不正確');
    const result = await source.getParticipants(match[1], { refresh });
    if (!result) return sendError(req, res, 404, 'work_package_not_found', '找不到工作項目');
    return sendJson(req, res, 200, result);
  }
  // 白名單以正規化後的完整路徑比對，不組合檔案路徑，因此不存在目錄穿越。
  if (Object.hasOwn(staticFiles, url.pathname)) {
    const file = staticFiles[url.pathname];
    return send(req, res, 200, file.type, await readFile(file.path));
  }
  return sendError(req, res, 404, 'not_found', '找不到資源');
}

function send(req, res, status, type, body) {
  res.writeHead(status, { ...baseHeaders, 'Content-Type': type, 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendJson(req, res, status, data) {
  send(req, res, status, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(data)));
}

function sendError(req, res, status, code, message) {
  sendJson(req, res, status, { error: { code, message } });
}
```

注意：Host 檢查放在方法檢查之前，外部網域的任何請求都先被拒絕。第三階段若需載入 Three.js，應放在本機白名單（vendor），而非放寬 CSP 到外部 CDN；若確需放寬，須在該階段計畫中明列並測試。

- [ ] **Step 4：確認通過**

Run: `node --test tests/http.test.mjs`
Expected: 9 個測試通過、0 失敗

- [ ] **Step 5：提交**

```bash
git add tests/http.test.mjs server/http.mjs
git commit -m "feat: add loopback read-only HTTP routes"
```

## Task 3：啟動入口與暫時頁面

**Files:**
- Create: `tests/index.test.mjs`
- Create: `server/index.mjs`
- Create: `client/index.html`
- Modify: `package.json`（`scripts` 區塊）

- [ ] **Step 1：撰寫失敗測試** `tests/index.test.mjs`

兩個情境都在監聽連接埠前結束，因此不會搶用 4173，也不會留下背景程序。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../server/index.mjs', import.meta.url));

function start(args) {
  return new Promise(resolve => {
    execFile(process.execPath, [entry, ...args], { timeout: 5000 }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

test('missing config fails with a clear message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-index-'));
  try {
    const result = await start(['--config', join(dir, 'missing.json')]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Config file is missing or unreadable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('live mode refuses to start without falling back to demo or echoing the token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-index-'));
  try {
    const path = join(dir, 'local.json');
    await writeFile(path, JSON.stringify({
      mode: 'live', baseUrl: 'http://example.test/', apiToken: 'FAKE_TOKEN_123',
    }));
    const result = await start(['--config', path]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Live mode is not implemented yet/);
    assert.ok(!result.stdout.includes('FAKE_TOKEN_123'));
    assert.ok(!result.stderr.includes('FAKE_TOKEN_123'));
    assert.ok(!result.stdout.includes('http://127.0.0.1'), 'must not start a demo server');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2：確認失敗**

Run: `node --test tests/index.test.mjs`
Expected: FAIL。兩個測試的 `code` 為 1，但 stderr 是 Node 的 `ERR_MODULE_NOT_FOUND`，不符合訊息斷言。

- [ ] **Step 3：實作** `server/index.mjs`

```js
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.mjs';
import { createDemoSource } from './demo.mjs';
import { createHandler, listen } from './http.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const staticFiles = {
  '/': { path: resolve(root, 'client/index.html'), type: 'text/html; charset=utf-8' },
};

async function main() {
  // 相對路徑以專案根目錄為基準，與執行時所在目錄無關。
  const { values } = parseArgs({ options: { config: { type: 'string', default: 'config/local.json' } } });
  const config = await loadConfig(resolve(root, values.config));
  if (config.mode !== 'demo') {
    throw new Error('Live mode is not implemented yet; use demo mode until the OpenProject adapter is available');
  }
  const handler = createHandler({ source: createDemoSource(), mode: config.mode, staticFiles });
  const server = await listen(handler, { host: config.host, port: config.port });
  console.log(`示例模式已啟動：http://${config.host}:${config.port}/`);
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(error => {
  console.error(`啟動失敗：${error.message}`);
  process.exitCode = 1;
});
```

錯誤訊息只輸出 `error.message`：`loadConfig`／`parseConfig` 的訊息在第一階段已確保不回顯輸入，live 拒絕訊息為固定字串。

- [ ] **Step 4：建立暫時頁面** `client/index.html`

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenProject 宇宙 Dashboard</title>
</head>
<body>
  <h1>OpenProject 宇宙 Dashboard（示例服務）</h1>
  <p>目前顯示的是合成示例資料，不是公司 OpenProject 內容。3D 前端尚未實作，可檢查的唯讀介面：</p>
  <ul>
    <li><a href="/api/health">/api/health</a></li>
    <li><a href="/api/snapshot">/api/snapshot</a></li>
    <li><a href="/api/work-packages/1001/participants">/api/work-packages/1001/participants</a></li>
  </ul>
</body>
</html>
```

- [ ] **Step 5：修改** `package.json` 的 `scripts`

```json
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "start": "node server/index.mjs",
    "demo": "node server/index.mjs --config config/example.json"
  }
```

`start` 讀 `config/local.json`（使用者自建、Git 忽略）；`demo` 讀已提交的無機密範例，模式為 demo。

- [ ] **Step 6：確認通過**

Run: `node --test tests/index.test.mjs`
Expected: 2 個測試通過、0 失敗

- [ ] **Step 7：提交**

```bash
git add tests/index.test.mjs server/index.mjs client/index.html package.json
git commit -m "feat: add demo server entrypoint and placeholder page"
```

## Task 4：整體驗證與交接

- [ ] **Step 1：全部測試**

Run: `npm test`
Expected: 22 個測試通過（第一階段 8 + demo 3 + http 9 + index 2）、0 失敗

- [ ] **Step 2：實機煙霧測試**（背景啟動，檢查後關閉）

```bash
npm run demo            # 背景執行；預期輸出「示例模式已啟動：http://127.0.0.1:4173/」
curl -s http://127.0.0.1:4173/api/health                         # {"status":"ok","mode":"demo"}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4173/   # 200
curl -s http://127.0.0.1:4173/api/snapshot                       # mode 為 demo，4 個工作項目
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4173/config/example.json   # 404
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:4173/api/snapshot  # 405
```

驗證後停止背景程序，並確認 4173 不再監聽。若 4173 被占用，記錄占用情況，不改程式預設值。

- [ ] **Step 3：機密與追蹤範圍檢查**

Run: `git check-ignore config/local.json` → 輸出 `config/local.json`
Run: `git status --short` → 僅剩 `handoff.md` 待修改，無 `config/local.json`

- [ ] **Step 4：更新** `handoff.md`，追加實際結果（只寫真的通過的項目；失敗則寫明原因與接續方法）：

```markdown
## 2026-10-26 本機示例服務（第二階段）
- 分支 `feature/demo-service`（基於 `feature/foundation`）。
- 已建立 server/demo.mjs、server/http.mjs、server/index.mjs、client/index.html（暫時頁面）。
- npm test：22 個測試通過。煙霧測試：health/snapshot/首頁 200、config 404、POST 405。
- 介面：GET/HEAD only、Host 白名單、靜態白名單、500 不外洩例外內容；live 模式明確拒絕啟動，不退回示例。
- 尚無 3D 前端與真實 OpenProject 串接。
- 下一步：撰寫第三階段（3D 前端）測試先行計畫，含 Three.js 版本選定與本機 vendor 方式。
```

- [ ] **Step 5：審查**：先對照本計畫「介面約定」做規格審查，再做程式碼品質審查；處理發現後重跑 `npm test`。
- [ ] **Step 6：提交**

```bash
git add handoff.md
git commit -m "docs: record demo service phase results"
```

## 自我審閱紀錄

- 路線第二階段條件對應：僅 GET/HEAD（Task 2 方法測試）；config 與原始機密不可作為靜態檔讀取（Task 2 路徑測試，白名單完整比對）；空資料（Task 2 empty 測試）；錯誤回應（400/403/404/405/500 皆有測試）。
- 前後端契約：Snapshot 與 ParticipantResult 欄位與 roadmap 一致；示例 `url` 一律 null，不偽造來源連結。
- live 模式：第一階段已保證缺 token 會失敗；本階段有 token 時也拒絕啟動，不默默改用示例資料（Task 3 測試）。
- 不提供設定寫入 API，不接受遠端 URL 參數；`/api/health` 明列欄位，不序列化設定物件。
- 延後：1,000 筆合成資料與效能（第六階段）、真實來源 adapter 與快取（第四階段）、輪詢與競態（第五階段）、3D 頁面（第三階段，取代 `client/index.html`）。
- 型別一致性：`createDemoSource`、`createHandler`、`listen`、`staticFiles` 結構 `{ path, type }` 在各任務中名稱一致。
