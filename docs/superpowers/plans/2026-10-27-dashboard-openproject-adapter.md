# Dashboard OpenProject Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 API token 唯讀讀取公司 OpenProject（API v3），正規化成既有前後端契約，讓 `mode: "live"` 能啟動並供 3D 前端使用；錯誤、分頁、限流、逾時都有明確且不外洩機密的行為。

**Architecture:** 分四層，各自可用本機假 OpenProject 測試：
1. `server/openproject/client.mjs`：唯一持有 token 的地方。只發 GET、只送往設定來源的 `/api/v3`，處理逾時、重試、併發上限與分頁。
2. `server/openproject/normalize.mjs`：純函式，把 HAL 元素轉成契約模型，格式不符就拒絕，不猜測。
3. `server/snapshot.mjs`：組出完整快照、快取、合併同時請求、限制刷新頻率、失敗時保留最後成功資料。
4. `server/activities.mjs`：按需讀活動歷史並彙整參與者，以 `updatedAt` 為快取鍵。

`server/live-source.mjs` 把 3、4 組成與示例來源相同的介面（`getSnapshot`／`getParticipants`），HTTP 層不需修改。

**Tech Stack:** Node.js 內建 `fetch`、`AbortSignal.timeout`、`node:http`（測試用假來源）、`node:test`；不新增依賴。

---

## 開始前

- 前置：第三階段已提交於 `feature/3d-frontend`（`652b7da`），`npm test` 45 個通過。
- 從 `feature/3d-frontend` 建立 `feature/openproject-adapter`。
- Task 1–6 完全離線：用 `tests/support/` 的本機假 OpenProject，不連公司伺服器，不需要 token。
- Task 7 需要使用者自己建立 API token 並填入 `config/local.json`（Git 已忽略）。不要把 token 貼到對話、測試、日誌或文件。連線 `192.168.31.13` 需要通過工具審核。

## 已知的 OpenProject API v3 行為（依官方文件；Task 7 會逐項對照實際伺服器）

| 項目 | 假設 | 對應處理 |
|---|---|---|
| 驗證 | `Authorization: Basic base64("apikey:" + token)` | client 組 header，token 不出現在錯誤或日誌中 |
| 分頁 | Collection 有 `total`、`count`、`_embedded.elements`；`offset` 是頁碼（從 1 開始）；有下一頁時提供 `_links.nextByOffset.href` | 跟著 `nextByOffset` 讀；讀完後筆數須等於 `total` |
| 工作項目預設篩選 | `/api/v3/work_packages` 預設只回傳未結案項目 | 明確送出 `filters=[]` |
| 工作項目欄位 | `id`、`subject`、`description.raw`、`updatedAt`，以及 `_links.project/status/author/assignee`（`href` 和 `title`）；未指派時 `assignee.href` 為 null；負責人可能是群組或佔位使用者 | 依 `href` 判斷身分種類，ID 分開命名空間 |
| 狀態 | `/api/v3/statuses` 元素有 `id`、`name`，`color` 可能缺少 | 用 `colorForStatus` 補色 |
| 活動 | `/api/v3/work_packages/{id}/activities` 元素的 `_links.user.href`；`title` 可能不存在 | 缺名字時查 `/api/v3/users/{id}` 並快取；失敗就顯示「未知使用者」 |
| 連結 | 工作項目網頁 `{baseUrl}/work_packages/{id}` | 填入 `url` |

## 檔案清單

| 路徑 | 動作 | 職責 |
|---|---|---|
| `server/openproject/errors.mjs` | 新增 | `SourceError`：錯誤代碼對應固定的繁中訊息 |
| `server/openproject/client.mjs` | 新增 | 驗證、同來源檢查、逾時、重試、併發、分頁 |
| `server/openproject/normalize.mjs` | 新增 | HAL → 契約模型 |
| `server/snapshot.mjs` | 新增 | 快照載入、快取、合併、限流、過期資料 |
| `server/activities.mjs` | 新增 | 參與者載入與快取 |
| `server/live-source.mjs` | 新增 | 組合 live 資料來源 |
| `server/index.mjs` | 修改 | live 模式使用 live 來源 |
| `client/view-model.mjs`、`client/main.mjs` | 修改 | 顯示來源錯誤與過期資料提示 |
| `tests/support/fake-openproject.mjs` | 新增 | 本機假 OpenProject 伺服器 |
| `tests/support/openproject-fixture.mjs` | 新增 | 假資料與路由 |
| `tests/openproject-client.test.mjs`、`tests/openproject-normalize.test.mjs`、`tests/snapshot.test.mjs`、`tests/activities.test.mjs` | 新增 | 各層測試 |
| `tests/index.test.mjs`、`tests/view-model.test.mjs` | 修改 | live 啟動與提示文字 |

`tests/support/*.mjs` 不符合 `tests/*.test.mjs`，不會被當成測試檔執行。

## Task 1：錯誤、假來源與 client

**Files:** Create `server/openproject/errors.mjs`, `tests/support/fake-openproject.mjs`, `tests/openproject-client.test.mjs`, `server/openproject/client.mjs`

- [ ] **Step 1：建立** `server/openproject/errors.mjs`

```js
// 錯誤訊息固定，不含 token、網址或來源回應內容，可安全顯示在前端。
const messages = {
  unauthorized: 'OpenProject 驗證失敗，請確認 API token',
  forbidden: 'OpenProject 拒絕存取（權限不足）',
  not_found: 'OpenProject 找不到資源',
  rate_limited: 'OpenProject 請求過於頻繁，請稍後再試',
  upstream_error: 'OpenProject 伺服器錯誤',
  timeout: '連線 OpenProject 逾時',
  network: '無法連線到 OpenProject',
  unexpected_redirect: 'OpenProject 回應了未預期的重新導向',
  invalid_response: 'OpenProject 回應格式無法解讀',
  unsafe_link: 'OpenProject 連結指向設定以外的位置',
  pagination_loop: 'OpenProject 分頁連結重複',
  pagination_incomplete: 'OpenProject 分頁資料不完整',
};

export class SourceError extends Error {
  constructor(code) {
    super(messages[code]);
    this.name = 'SourceError';
    this.code = code;
  }
}

export function errorInfo(error) {
  return error instanceof SourceError
    ? { code: error.code, message: error.message }
    : { code: 'internal_error', message: '整理 OpenProject 資料時發生錯誤' };
}
```

- [ ] **Step 2：建立** `tests/support/fake-openproject.mjs`

```js
import { createServer } from 'node:http';

// 本機假 OpenProject：routes(url, req) 回傳 { status, body, headers, delayMs }，並記錄每個請求。
export async function startFake(routes) {
  const requests = [];
  const stats = { maxActive: 0 };
  let active = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fake');
    requests.push({ method: req.method, path: url.pathname, search: url.searchParams, headers: req.headers });
    active += 1;
    stats.maxActive = Math.max(stats.maxActive, active);
    try {
      const reply = (await routes(url, req)) ?? { status: 404, body: {} };
      if (reply.delayMs) await new Promise(resolve => setTimeout(resolve, reply.delayMs));
      const body = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
      res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/hal+json', ...reply.headers });
      res.end(body);
    } finally {
      active -= 1;
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    requests,
    stats,
    close: () => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

export function collection(elements, { total = elements.length, next = null } = {}) {
  return {
    _type: 'Collection', total, count: elements.length,
    _embedded: { elements },
    _links: next ? { nextByOffset: { href: next } } : {},
  };
}
```

- [ ] **Step 3：撰寫失敗測試** `tests/openproject-client.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../server/openproject/client.mjs';
import { SourceError } from '../server/openproject/errors.mjs';
import { startFake, collection } from './support/fake-openproject.mjs';

const TOKEN = 'FAKE_TOKEN_123';

async function withFake(routes, run) {
  const fake = await startFake(routes);
  try {
    await run(fake);
  } finally {
    await fake.close();
  }
}

const clientFor = (fake, options = {}) =>
  createClient({ baseUrl: fake.baseUrl, apiToken: TOKEN, sleep: async () => {}, ...options });

const rejectsWith = (promise, code) => assert.rejects(promise, error =>
  error instanceof SourceError && error.code === code && !error.message.includes(TOKEN));

test('sends read-only requests with API key basic auth', async () => {
  await withFake(() => ({ body: { _type: 'Root' } }), async fake => {
    assert.deepEqual(await clientFor(fake).getJson('/api/v3'), { _type: 'Root' });
    const [req] = fake.requests;
    assert.equal(req.method, 'GET');
    assert.equal(req.headers.authorization, `Basic ${Buffer.from(`apikey:${TOKEN}`).toString('base64')}`);
    assert.equal(req.headers.accept, 'application/hal+json');
  });
});
test('getAll follows nextByOffset until every page is read', async () => {
  await withFake(url => (url.searchParams.get('offset') === '2'
    ? { body: collection([{ id: 3 }], { total: 3 }) }
    : { body: collection([{ id: 1 }, { id: 2 }], { total: 3, next: '/api/v3/projects?offset=2&pageSize=2' }) }),
  async fake => {
    const items = await clientFor(fake).getAll('/api/v3/projects', { pageSize: 2 });
    assert.deepEqual(items.map(item => item.id), [1, 2, 3]);
    assert.equal(fake.requests[0].search.get('pageSize'), '2');
    assert.equal(fake.requests[0].search.get('offset'), '1');
    assert.equal(fake.requests.length, 2);
  });
});
test('pagination problems are reported, never truncated', async () => {
  await withFake(() => ({ body: collection([{ id: 1 }], { total: 5, next: '/api/v3/projects?offset=2' }) }), async fake => {
    await rejectsWith(clientFor(fake).getAll('/api/v3/projects'), 'pagination_loop');
  });
  await withFake(() => ({ body: collection([{ id: 1 }], { total: 2 }) }), async fake => {
    await rejectsWith(clientFor(fake).getAll('/api/v3/projects'), 'pagination_incomplete');
  });
  await withFake(() => ({ body: {} }), async fake => {
    await rejectsWith(clientFor(fake).getAll('/api/v3/projects'), 'invalid_response');
  });
});
test('never sends credentials to another origin or outside the API', async () => {
  const other = await startFake(() => ({ body: collection([]) }));
  try {
    await withFake(() => ({ body: collection([{ id: 1 }], { total: 2, next: `${other.baseUrl}/api/v3/projects?offset=2` }) }),
      async fake => {
        await rejectsWith(clientFor(fake).getAll('/api/v3/projects'), 'unsafe_link');
      });
    assert.equal(other.requests.length, 0);
  } finally {
    await other.close();
  }
  await withFake(() => ({ body: {} }), async fake => {
    await rejectsWith(clientFor(fake).getJson('/admin'), 'unsafe_link');
    await rejectsWith(clientFor(fake).getJson('/api/v3/../admin'), 'unsafe_link');
    await rejectsWith(clientFor(fake).getJson('/api/v30/x'), 'unsafe_link');
    assert.equal(fake.requests.length, 0);
  });
});
test('auth, permission, and missing resources are not retried', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found']]) {
    await withFake(() => ({ status, body: { message: `echo ${TOKEN}` } }), async fake => {
      await rejectsWith(clientFor(fake).getJson('/api/v3/projects'), code);
      assert.equal(fake.requests.length, 1);
    });
  }
});
test('rate limits and transient errors retry with bounded backoff', async () => {
  let calls = 0;
  const sleeps = [];
  const sleep = async ms => { sleeps.push(ms); };
  await withFake(() => (++calls === 1 ? { status: 429, headers: { 'Retry-After': '1' } } : { body: { ok: true } }),
    async fake => {
      assert.deepEqual(await clientFor(fake, { sleep }).getJson('/api/v3'), { ok: true });
    });
  assert.deepEqual(sleeps, [1000]);
  sleeps.length = 0;
  await withFake(() => ({ status: 503 }), async fake => {
    await rejectsWith(clientFor(fake, { sleep }).getJson('/api/v3'), 'upstream_error');
    assert.equal(fake.requests.length, 3);
  });
  assert.deepEqual(sleeps, [500, 1000]);
  sleeps.length = 0;
  await withFake(() => ({ status: 429, headers: { 'Retry-After': '120' } }), async fake => {
    await rejectsWith(clientFor(fake, { sleep }).getJson('/api/v3'), 'rate_limited');
  });
  assert.deepEqual(sleeps, [10000, 10000]);
});
test('timeouts, network failures, redirects, and bad JSON are distinct errors', async () => {
  await withFake(() => ({ body: {}, delayMs: 300 }), async fake => {
    await rejectsWith(clientFor(fake, { timeoutMs: 50 }).getJson('/api/v3'), 'timeout');
  });
  await withFake(() => ({ status: 302, headers: { Location: 'http://evil.test/' } }), async fake => {
    await rejectsWith(clientFor(fake).getJson('/api/v3'), 'unexpected_redirect');
    assert.equal(fake.requests.length, 1);
  });
  await withFake(() => ({ body: 'not json' }), async fake => {
    await rejectsWith(clientFor(fake).getJson('/api/v3'), 'invalid_response');
  });
  const closed = await startFake(() => ({ body: {} }));
  const { baseUrl } = closed;
  await closed.close();
  await rejectsWith(createClient({ baseUrl, apiToken: TOKEN, sleep: async () => {} }).getJson('/api/v3'), 'network');
});
test('limits concurrent requests to four', async () => {
  await withFake(() => ({ body: {}, delayMs: 30 }), async fake => {
    const client = clientFor(fake);
    await Promise.all(Array.from({ length: 10 }, () => client.getJson('/api/v3')));
    assert.equal(fake.stats.maxActive, 4);
    assert.equal(fake.requests.length, 10);
  });
});
```

- [ ] **Step 4：確認失敗** — Run: `node --test tests/openproject-client.test.mjs`；Expected: `ERR_MODULE_NOT_FOUND`（client.mjs）
- [ ] **Step 5：實作** `server/openproject/client.mjs`

```js
import { SourceError } from './errors.mjs';

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;
const RETRYABLE = new Set([429, 502, 503, 504]);

// 唯一持有 token 的模組：只發 GET、只送往設定來源的 /api/v3，不跟隨重新導向。
export function createClient({
  baseUrl, apiToken, timeoutMs = 10_000, retries = 2, maxConcurrent = 4,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  const origin = new URL(baseUrl).origin;
  const authorization = `Basic ${Buffer.from(`apikey:${apiToken}`).toString('base64')}`;
  const limit = createLimiter(maxConcurrent);

  function resolve(pathOrHref) {
    const url = new URL(pathOrHref, origin);
    const inApi = url.pathname === '/api/v3' || url.pathname.startsWith('/api/v3/');
    if (url.origin !== origin || !inApi) throw new SourceError('unsafe_link');
    return url;
  }

  async function request(url) {
    try {
      return await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: authorization, Accept: 'application/hal+json' },
      });
    } catch (error) {
      throw new SourceError(error?.name === 'TimeoutError' ? 'timeout' : 'network');
    }
  }

  async function getJson(pathOrHref) {
    const url = resolve(pathOrHref);
    return limit(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const res = await request(url);
        if (res.ok) {
          try {
            return await res.json();
          } catch (error) {
            throw new SourceError(error?.name === 'TimeoutError' ? 'timeout' : 'invalid_response');
          }
        }
        await res.body?.cancel();
        if (res.status >= 300 && res.status < 400) throw new SourceError('unexpected_redirect');
        if (res.status === 401) throw new SourceError('unauthorized');
        if (res.status === 403) throw new SourceError('forbidden');
        if (res.status === 404) throw new SourceError('not_found');
        if (RETRYABLE.has(res.status) && attempt < retries) {
          await sleep(retryDelay(res, attempt));
          continue;
        }
        throw new SourceError(res.status === 429 ? 'rate_limited' : 'upstream_error');
      }
    });
  }

  // 讀完所有分頁才回傳；重複、越界或筆數不符一律視為錯誤，不悄悄截斷。
  async function getAll(path, params = {}) {
    const first = resolve(path);
    for (const [key, value] of Object.entries({ pageSize: PAGE_SIZE, offset: 1, ...params })) {
      first.searchParams.set(key, value);
    }
    const elements = [];
    const seen = new Set();
    let next = first.href;
    let total = null;
    while (next) {
      if (seen.has(next)) throw new SourceError('pagination_loop');
      if (seen.size >= MAX_PAGES) throw new SourceError('pagination_incomplete');
      seen.add(next);
      const page = await getJson(next);
      const items = page?._embedded?.elements;
      if (!Array.isArray(items)) throw new SourceError('invalid_response');
      elements.push(...items);
      if (Number.isInteger(page.total)) total = page.total;
      const href = page._links?.nextByOffset?.href;
      next = href ? resolve(href).href : null;
    }
    if (total !== null && elements.length !== total) throw new SourceError('pagination_incomplete');
    return elements;
  }

  return { getJson, getAll };
}

function retryDelay(res, attempt) {
  const header = res.headers.get('retry-after');
  if (header !== null && /^\d+$/.test(header.trim())) return Math.min(Number(header) * 1000, 10_000);
  return Math.min(500 * 2 ** attempt, 5_000);
}

function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => {
      active -= 1;
      next();
    });
  };
  return task => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    next();
  });
}
```

- [ ] **Step 6：確認通過** — Run: `node --test tests/openproject-client.test.mjs`；Expected: 8 pass。Windows 連線到已關閉的連接埠可能需要約 2 秒，屬正常。
- [ ] **Step 7：提交**

```bash
git add server/openproject/errors.mjs server/openproject/client.mjs tests/support/fake-openproject.mjs tests/openproject-client.test.mjs
git commit -m "feat: add read-only OpenProject API client"
```

## Task 2：HAL 正規化

**Files:** Create `tests/openproject-normalize.test.mjs`, `server/openproject/normalize.mjs`

- [ ] **Step 1：撰寫失敗測試** `tests/openproject-normalize.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linkId, personFromLink, normalizeProject, normalizeStatus, normalizeWorkPackage, unknownStatus,
} from '../server/openproject/normalize.mjs';
import { SourceError } from '../server/openproject/errors.mjs';

const statuses = new Map([['7', { id: '7', name: 'In progress', color: '#38bdf8' }]]);
const links = {
  project: { href: '/api/v3/projects/1', title: '星圖平台' },
  status: { href: '/api/v3/statuses/7', title: 'In progress' },
  author: { href: '/api/v3/users/5', title: 'Alex' },
  assignee: { href: null },
};
const wp = (overrides = {}) => ({
  id: 11, subject: '建立登入頁', updatedAt: '2026-10-20T08:00:00Z', description: { raw: '內容' }, _links: links, ...overrides,
});
const invalid = error => error instanceof SourceError && error.code === 'invalid_response';

test('principals keep distinct ID spaces', () => {
  assert.equal(linkId({ href: '/api/v3/projects/12' }, 'projects'), '12');
  assert.equal(linkId({ href: '/api/v3/projects/12/x' }, 'projects'), null);
  assert.deepEqual(personFromLink({ href: '/api/v3/users/5', title: ' Alex ' }), { id: '5', name: 'Alex' });
  assert.deepEqual(personFromLink({ href: '/api/v3/groups/5', title: 'QA' }), { id: 'group:5', name: 'QA' });
  assert.deepEqual(personFromLink({ href: '/api/v3/placeholder_users/5' }), { id: 'placeholder:5', name: null });
  assert.equal(personFromLink({ href: null }), null);
  assert.equal(personFromLink(undefined), null);
});
test('projects and statuses use string IDs and safe colors', () => {
  assert.deepEqual(normalizeProject({ id: 1, name: '星圖平台' }), { id: '1', name: '星圖平台' });
  assert.deepEqual(normalizeStatus({ id: 1, name: 'New', color: '#1A67A3' }), { id: '1', name: 'New', color: '#1a67a3' });
  assert.match(normalizeStatus({ id: 7, name: 'x', color: null }).color, /^#[0-9a-f]{6}$/);
  assert.throws(() => normalizeProject({ name: 'no id' }), invalid);
  assert.throws(() => normalizeStatus(null), invalid);
});
test('work packages map to the frontend contract', () => {
  assert.deepEqual(normalizeWorkPackage(wp(), statuses, 'http://op.test'), {
    id: '11', projectId: '1', subject: '建立登入頁',
    author: { id: '5', name: 'Alex' }, assignee: null,
    status: { id: '7', name: 'In progress', color: '#38bdf8' },
    description: '內容', updatedAt: '2026-10-20T08:00:00Z', url: 'http://op.test/work_packages/11',
  });
  const odd = normalizeWorkPackage(wp({
    description: { raw: '  ' }, updatedAt: undefined,
    _links: {
      project: { href: '/api/v3/projects/3' },
      status: { href: '/api/v3/statuses/99', title: 'Rejected' },
      author: { href: '/api/v3/users/9' },
      assignee: { href: '/api/v3/groups/3', title: 'QA' },
    },
  }), statuses, 'http://op.test');
  assert.equal(odd.description, null);
  assert.equal(odd.updatedAt, null);
  assert.deepEqual(odd.author, { id: '9', name: '未知使用者' });
  assert.deepEqual(odd.assignee, { id: 'group:3', name: 'QA' });
  assert.equal(odd.status.id, '99');
  assert.equal(odd.status.name, 'Rejected');
  assert.match(odd.status.color, /^#[0-9a-f]{6}$/);
  const noStatus = normalizeWorkPackage(wp({ _links: { ...links, status: undefined } }), statuses, 'http://op.test');
  assert.deepEqual(noStatus.status, unknownStatus);
});
test('malformed elements are rejected instead of guessed', () => {
  for (const bad of [wp({ id: 'abc' }), wp({ subject: 42 }), wp({ _links: { status: links.status } }), null]) {
    assert.throws(() => normalizeWorkPackage(bad, statuses, 'http://op.test'), invalid);
  }
});
```

- [ ] **Step 2：確認失敗** — Run: `node --test tests/openproject-normalize.test.mjs`；Expected: `ERR_MODULE_NOT_FOUND`
- [ ] **Step 3：實作** `server/openproject/normalize.mjs`

```js
import { colorForStatus } from '../../shared/layout.mjs';
import { SourceError } from './errors.mjs';

const UNKNOWN_STATUS = '未知狀態';
const UNKNOWN_USER = '未知使用者';

export const unknownStatus = Object.freeze({ id: null, name: UNKNOWN_STATUS, color: colorForStatus(null) });

// 由 HAL 連結取出資源 ID；格式不符時回傳 null。
export function linkId(link, resource) {
  const match = typeof link?.href === 'string' && link.href.match(new RegExp(`^/api/v3/${resource}/(\\d+)$`));
  return match ? match[1] : null;
}

// 使用者、群組、佔位使用者各自有獨立 ID，加上前綴避免去重時互相合併。
const principals = [['users', ''], ['groups', 'group:'], ['placeholder_users', 'placeholder:']];

export function personFromLink(link) {
  if (!link?.href) return null;
  const name = typeof link.title === 'string' && link.title.trim() ? link.title.trim() : null;
  for (const [resource, prefix] of principals) {
    const id = linkId(link, resource);
    if (id) return { id: `${prefix}${id}`, name };
  }
  return { id: null, name };
}

function requireId(value) {
  if (Number.isInteger(value) || (typeof value === 'string' && /^\d+$/.test(value))) return String(value);
  throw new SourceError('invalid_response');
}

export function normalizeProject(element) {
  return { id: requireId(element?.id), name: typeof element.name === 'string' ? element.name : '未命名專案' };
}

export function normalizeStatus(element) {
  const id = requireId(element?.id);
  return { id, name: typeof element.name === 'string' ? element.name : UNKNOWN_STATUS, color: colorForStatus(id, element.color) };
}

export function normalizeWorkPackage(element, statusesById, baseUrl) {
  const id = requireId(element?.id);
  const links = element._links ?? {};
  const projectId = linkId(links.project, 'projects');
  if (!projectId || typeof element.subject !== 'string') throw new SourceError('invalid_response');
  const statusId = linkId(links.status, 'statuses');
  const named = person => person && { ...person, name: person.name ?? UNKNOWN_USER };
  const raw = element.description?.raw;
  return {
    id,
    projectId,
    subject: element.subject,
    author: named(personFromLink(links.author)),
    assignee: named(personFromLink(links.assignee)),
    status: statusesById.get(statusId)
      ?? (statusId ? { id: statusId, name: links.status.title ?? UNKNOWN_STATUS, color: colorForStatus(statusId) } : unknownStatus),
    description: typeof raw === 'string' && raw.trim() ? raw : null,
    updatedAt: typeof element.updatedAt === 'string' ? element.updatedAt : null,
    url: `${baseUrl}/work_packages/${id}`,
  };
}
```

- [ ] **Step 4：確認通過** — Run: `node --test tests/openproject-normalize.test.mjs`；Expected: 4 pass
- [ ] **Step 5：提交**

```bash
git add tests/openproject-normalize.test.mjs server/openproject/normalize.mjs
git commit -m "feat: normalize OpenProject HAL resources"
```

## Task 3：快照載入

**Files:** Create `tests/support/openproject-fixture.mjs`, `tests/snapshot.test.mjs`, `server/snapshot.mjs`

- [ ] **Step 1：建立** `tests/support/openproject-fixture.mjs`

```js
import { collection } from './fake-openproject.mjs';

export const users = { 5: 'Alex', 6: '林小美', 8: '陳大文' };
const user = id => ({ href: `/api/v3/users/${id}`, title: users[id] });

export const workPackages = [
  { id: 11, subject: '建立登入頁', updatedAt: '2026-10-20T08:00:00Z', description: { raw: '一般' },
    _links: { project: { href: '/api/v3/projects/1', title: '星圖平台' }, status: { href: '/api/v3/statuses/7', title: 'In progress' },
      author: user(5), assignee: user(6) } },
  { id: 12, subject: '舊需求', updatedAt: '2026-10-21T08:00:00Z', description: { raw: '' },
    _links: { project: { href: '/api/v3/projects/3', title: '封存專案' }, status: { href: '/api/v3/statuses/99', title: 'Rejected' },
      author: user(6), assignee: { href: null } } },
  { id: 13, subject: '測試計畫', updatedAt: '2026-10-22T08:00:00Z', description: null,
    _links: { project: { href: '/api/v3/projects/2', title: '太空站維運' }, status: { href: '/api/v3/statuses/12', title: 'Closed' },
      author: user(5), assignee: { href: '/api/v3/groups/3', title: 'QA 群組' } } },
];

const activities = [
  { _type: 'Activity::Comment', id: 1, _links: { user: user(6) } },
  { _type: 'Activity', id: 2, _links: { user: { href: '/api/v3/users/8' } } },
  { _type: 'Activity', id: 3, _links: { user: { href: '/api/v3/users/9' } } },
  { _type: 'Activity::Comment', id: 4, _links: { user: user(5) } },
];

// 假 OpenProject 路由；overrides 以路徑為鍵，值為回應物件或 (url) => 回應。
export function fixtureRoutes(overrides = {}) {
  return url => {
    const custom = overrides[url.pathname];
    if (custom) return typeof custom === 'function' ? custom(url) : custom;
    if (url.pathname === '/api/v3/projects') {
      return url.searchParams.get('offset') === '2'
        ? { body: collection([{ id: 2, name: '太空站維運' }], { total: 2 }) }
        : { body: collection([{ id: 1, name: '星圖平台' }], { total: 2, next: '/api/v3/projects?offset=2&pageSize=1' }) };
    }
    if (url.pathname === '/api/v3/statuses') {
      return { body: collection([
        { id: 1, name: 'New', color: '#1A67A3' }, { id: 7, name: 'In progress', color: null }, { id: 12, name: 'Closed', color: '#666666' },
      ]) };
    }
    if (url.pathname === '/api/v3/work_packages') return { body: collection(workPackages) };
    if (url.pathname === '/api/v3/work_packages/11/activities') return { body: collection(activities) };
    const item = url.pathname.match(/^\/api\/v3\/work_packages\/(\d+)$/);
    if (item) {
      const element = workPackages.find(wp => String(wp.id) === item[1]);
      return element ? { body: element } : { status: 404, body: {} };
    }
    const person = url.pathname.match(/^\/api\/v3\/users\/(\d+)$/);
    if (person) return users[person[1]] ? { body: { id: Number(person[1]), name: users[person[1]] } } : { status: 403, body: {} };
    return { status: 404, body: {} };
  };
}
```

- [ ] **Step 2：撰寫失敗測試** `tests/snapshot.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../server/openproject/client.mjs';
import { createSnapshotLoader } from '../server/snapshot.mjs';
import { startFake } from './support/fake-openproject.mjs';
import { fixtureRoutes } from './support/openproject-fixture.mjs';

async function withLoader(routes, run) {
  const fake = await startFake(routes);
  let time = Date.parse('2026-10-27T00:00:00Z');
  const clock = { now: () => time, advance: ms => { time += ms; } };
  const client = createClient({ baseUrl: fake.baseUrl, apiToken: 'FAKE_TOKEN_123', sleep: async () => {} });
  try {
    await run({ loader: createSnapshotLoader({ client, baseUrl: fake.baseUrl, now: clock.now }), fake, clock });
  } finally {
    await fake.close();
  }
}

const statusRequests = fake => fake.requests.filter(r => r.path === '/api/v3/statuses').length;

test('builds a complete live snapshot including closed items and unseen projects', async () => {
  await withLoader(fixtureRoutes(), async ({ loader, fake }) => {
    const s = await loader.getSnapshot();
    assert.equal(s.mode, 'live');
    assert.equal(s.complete, true);
    assert.equal(s.stale, false);
    assert.equal(s.error, null);
    assert.equal(s.lastSuccessAt, '2026-10-27T00:00:00.000Z');
    assert.deepEqual(s.progress, { loaded: 3, total: 3 });
    assert.deepEqual(s.projects.map(p => [p.id, p.name]), [['1', '星圖平台'], ['2', '太空站維運'], ['3', '封存專案']]);
    assert.ok(s.statuses.some(st => st.id === '99' && st.name === 'Rejected'), 'legend includes statuses only seen on items');
    for (const wp of s.workPackages) assert.ok(s.statuses.some(st => st.id === wp.status.id), wp.id);
    assert.equal(fake.requests.find(r => r.path === '/api/v3/work_packages').search.get('filters'), '[]');
    assert.equal(s.workPackages[0].url, `${fake.baseUrl}/work_packages/11`);
  });
});
test('caches, coalesces, and rate-limits refreshes', async () => {
  await withLoader(fixtureRoutes(), async ({ loader, fake, clock }) => {
    const [a, b] = await Promise.all([loader.getSnapshot(), loader.getSnapshot({ refresh: true })]);
    assert.equal(a, b);
    assert.equal(statusRequests(fake), 1);
    clock.advance(5_000);
    await loader.getSnapshot({ refresh: true });
    assert.equal(statusRequests(fake), 1, 'refresh within 10s reuses data');
    clock.advance(10_000);
    await loader.getSnapshot();
    assert.equal(statusRequests(fake), 1, 'plain request within 30s reuses data');
    await loader.getSnapshot({ refresh: true });
    assert.equal(statusRequests(fake), 2);
    clock.advance(31_000);
    await loader.getSnapshot();
    assert.equal(statusRequests(fake), 3);
  });
});
test('a failure after success keeps the last data and marks it stale', async () => {
  let fail = false;
  const base = fixtureRoutes();
  const routes = fixtureRoutes({ '/api/v3/statuses': url => (fail ? { status: 503, body: {} } : base(url)) });
  await withLoader(routes, async ({ loader, clock }) => {
    const good = await loader.getSnapshot();
    fail = true;
    clock.advance(31_000);
    const stale = await loader.getSnapshot();
    assert.equal(stale.stale, true);
    assert.equal(stale.complete, true);
    assert.deepEqual(stale.error, { code: 'upstream_error', message: 'OpenProject 伺服器錯誤' });
    assert.equal(stale.lastSuccessAt, good.lastSuccessAt);
    assert.deepEqual(stale.workPackages, good.workPackages);
    fail = false;
    clock.advance(5_000);
    assert.equal(await loader.getSnapshot({ refresh: true }), stale, 'errors are retried at most every 10s');
    clock.advance(10_000);
    assert.equal((await loader.getSnapshot()).stale, false);
  });
});
test('a first failure returns an explicit empty error snapshot', async () => {
  await withLoader(() => ({ status: 401, body: {} }), async ({ loader }) => {
    assert.deepEqual(await loader.getSnapshot(), {
      mode: 'live', revision: 'none', projects: [], workPackages: [], statuses: [],
      complete: false, stale: false, lastSuccessAt: null, progress: { loaded: 0, total: null },
      error: { code: 'unauthorized', message: 'OpenProject 驗證失敗，請確認 API token' },
    });
  });
});
```

- [ ] **Step 3：確認失敗** — Run: `node --test tests/snapshot.test.mjs`；Expected: `ERR_MODULE_NOT_FOUND`
- [ ] **Step 4：實作** `server/snapshot.mjs`

```js
import { errorInfo } from './openproject/errors.mjs';
import { normalizeProject, normalizeStatus, normalizeWorkPackage } from './openproject/normalize.mjs';

const MAX_AGE_MS = 30_000;
const MIN_REFRESH_MS = 10_000;

export function createSnapshotLoader({ client, baseUrl, now = () => Date.now() }) {
  let lastGood = null;
  let latest = null;
  let startedAt = -Infinity;
  let inFlight = null;

  async function load() {
    const [projectElements, statusElements, workPackageElements] = await Promise.all([
      client.getAll('/api/v3/projects'),
      client.getAll('/api/v3/statuses'),
      // 預設篩選只含未結案項目；明確送出空篩選才會取得全部可見項目。
      client.getAll('/api/v3/work_packages', { filters: '[]' }),
    ]);
    const statuses = statusElements.map(normalizeStatus);
    const statusesById = new Map(statuses.map(status => [status.id, status]));
    const workPackages = workPackageElements.map(element => normalizeWorkPackage(element, statusesById, baseUrl));
    const projects = projectElements.map(normalizeProject);
    const projectIds = new Set(projects.map(project => project.id));
    const statusIds = new Set(statuses.map(status => status.id));
    workPackages.forEach((wp, index) => {
      // 項目所屬專案不在專案清單（例如封存）時，以連結標題補一個星系。
      if (!projectIds.has(wp.projectId)) {
        projectIds.add(wp.projectId);
        projects.push({ id: wp.projectId, name: workPackageElements[index]._links.project.title ?? '未知專案' });
      }
      if (!statusIds.has(wp.status.id)) {
        statusIds.add(wp.status.id);
        statuses.push(wp.status);
      }
    });
    const at = new Date(now()).toISOString();
    return {
      mode: 'live', revision: `live-${at}`, projects, workPackages, statuses,
      complete: true, stale: false, lastSuccessAt: at,
      progress: { loaded: workPackages.length, total: workPackages.length }, error: null,
    };
  }

  function failed(error) {
    const reason = errorInfo(error);
    if (reason.code === 'internal_error') console.error('Snapshot load failed:', error?.name ?? 'Error');
    if (lastGood) return { ...lastGood, stale: true, error: reason };
    return {
      mode: 'live', revision: 'none', projects: [], workPackages: [], statuses: [],
      complete: false, stale: false, lastSuccessAt: null, progress: { loaded: 0, total: null }, error: reason,
    };
  }

  function start() {
    startedAt = now();
    inFlight = load()
      .then(snapshot => { lastGood = snapshot; return snapshot; }, failed)
      .then(result => { latest = result; inFlight = null; return result; });
    return inFlight;
  }

  return {
    // 同時請求共用一輪；刷新可能被其他網頁觸發，因此限制頻率；錯誤結果也至少保留 10 秒。
    async getSnapshot({ refresh = false } = {}) {
      if (inFlight) return inFlight;
      const maxAge = refresh || latest?.error ? MIN_REFRESH_MS : MAX_AGE_MS;
      if (latest && now() - startedAt < maxAge) return latest;
      return start();
    },
  };
}
```

- [ ] **Step 5：確認通過** — Run: `node --test tests/snapshot.test.mjs`；Expected: 4 pass
- [ ] **Step 6：提交**

```bash
git add tests/support/openproject-fixture.mjs tests/snapshot.test.mjs server/snapshot.mjs
git commit -m "feat: load cached live snapshots from OpenProject"
```

## Task 4：參與者載入

**Files:** Create `tests/activities.test.mjs`, `server/activities.mjs`

- [ ] **Step 1：撰寫失敗測試** `tests/activities.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../server/openproject/client.mjs';
import { createParticipantsLoader } from '../server/activities.mjs';
import { startFake } from './support/fake-openproject.mjs';
import { fixtureRoutes } from './support/openproject-fixture.mjs';

async function withParticipants(routes, run) {
  const fake = await startFake(routes);
  let time = 0;
  const clock = { now: () => time, advance: ms => { time += ms; } };
  const client = createClient({ baseUrl: fake.baseUrl, apiToken: 'FAKE_TOKEN_123', sleep: async () => {} });
  try {
    await run({ loader: createParticipantsLoader({ client, now: clock.now }), fake, clock });
  } finally {
    await fake.close();
  }
}

const activityRequests = fake => fake.requests.filter(r => r.path === '/api/v3/work_packages/11/activities').length;
const withWorkPackage = patch => {
  const base = fixtureRoutes();
  return fixtureRoutes({ '/api/v3/work_packages/11': url => ({ body: { ...base(url).body, ...patch() } }) });
};

test('combines roles and activity authors by ID and resolves missing names', async () => {
  await withParticipants(fixtureRoutes(), async ({ loader }) => {
    const result = await loader.getParticipants('11');
    assert.equal(result.workPackageId, '11');
    assert.equal(result.workPackageUpdatedAt, '2026-10-20T08:00:00Z');
    assert.equal(result.complete, true);
    assert.equal(result.error, null);
    assert.deepEqual(result.people.map(p => [p.id, p.name]),
      [['5', 'Alex'], ['6', '林小美'], ['8', '陳大文'], ['9', '未知使用者']]);
  });
});
test('caches complete results until updatedAt changes or refresh is requested', async () => {
  let updatedAt = '2026-10-20T08:00:00Z';
  await withParticipants(withWorkPackage(() => ({ updatedAt })), async ({ loader, fake }) => {
    await loader.getParticipants('11');
    await loader.getParticipants('11');
    assert.equal(activityRequests(fake), 1);
    await loader.getParticipants('11', { refresh: true });
    assert.equal(activityRequests(fake), 2);
    updatedAt = '2026-10-23T00:00:00Z';
    assert.equal((await loader.getParticipants('11')).workPackageUpdatedAt, updatedAt);
    assert.equal(activityRequests(fake), 3);
    assert.equal(fake.requests.filter(r => r.path === '/api/v3/users/8').length, 1, 'user names are cached');
  });
});
test('items without updatedAt use a short TTL', async () => {
  await withParticipants(withWorkPackage(() => ({ updatedAt: null })), async ({ loader, fake, clock }) => {
    await loader.getParticipants('11');
    await loader.getParticipants('11');
    assert.equal(activityRequests(fake), 1);
    clock.advance(61_000);
    await loader.getParticipants('11');
    assert.equal(activityRequests(fake), 2);
  });
});
test('activity failures return a partial, uncached result; unknown items return null', async () => {
  const routes = fixtureRoutes({ '/api/v3/work_packages/11/activities': { status: 403, body: {} } });
  await withParticipants(routes, async ({ loader, fake }) => {
    const result = await loader.getParticipants('11');
    assert.equal(result.complete, false);
    assert.deepEqual(result.error, { code: 'forbidden', message: 'OpenProject 拒絕存取（權限不足）' });
    assert.deepEqual(result.people.map(p => p.id), ['5', '6']);
    await loader.getParticipants('11');
    assert.equal(activityRequests(fake), 2, 'failures are not cached');
    assert.equal(await loader.getParticipants('404'), null);
  });
});
test('failures reading the work package itself are reported, not thrown', async () => {
  await withParticipants(() => ({ status: 401, body: {} }), async ({ loader }) => {
    assert.deepEqual(await loader.getParticipants('11'), {
      workPackageId: '11', workPackageUpdatedAt: null, people: [], complete: false,
      error: { code: 'unauthorized', message: 'OpenProject 驗證失敗，請確認 API token' },
    });
  });
});
```

- [ ] **Step 2：確認失敗** — Run: `node --test tests/activities.test.mjs`；Expected: `ERR_MODULE_NOT_FOUND`
- [ ] **Step 3：實作** `server/activities.mjs`

```js
import { collectParticipants } from '../shared/participants.mjs';
import { SourceError, errorInfo } from './openproject/errors.mjs';
import { personFromLink } from './openproject/normalize.mjs';

const NO_UPDATED_AT_TTL_MS = 60_000;

export function createParticipantsLoader({ client, now = () => Date.now() }) {
  const cache = new Map();
  const userNames = new Map();

  // 活動連結可能沒有名字；查使用者資料補上，查不到就保留 null（顯示為未知使用者）。
  async function withName(person) {
    if (!person || person.name !== null || !/^\d+$/.test(person.id ?? '')) return person;
    if (!userNames.has(person.id)) {
      userNames.set(person.id, client.getJson(`/api/v3/users/${person.id}`)
        .then(user => (typeof user?.name === 'string' ? user.name : null), () => null));
    }
    return { ...person, name: await userNames.get(person.id) };
  }

  function partial(id, updatedAt, roles, error) {
    if (errorInfo(error).code === 'internal_error') console.error('Participants load failed:', error?.name ?? 'Error');
    return {
      workPackageId: id, workPackageUpdatedAt: updatedAt,
      people: collectParticipants(roles[0], roles[1], []), complete: false, error: errorInfo(error),
    };
  }

  async function getParticipants(id, { refresh = false } = {}) {
    let element;
    try {
      element = await client.getJson(`/api/v3/work_packages/${id}`);
    } catch (error) {
      if (error instanceof SourceError && error.code === 'not_found') return null;
      return partial(id, null, [null, null], error);
    }
    const updatedAt = typeof element?.updatedAt === 'string' ? element.updatedAt : null;
    const roles = [personFromLink(element?._links?.author), personFromLink(element?._links?.assignee)];
    const cached = cache.get(id);
    // 有 updatedAt 時以它為鍵；沒有時只短暫快取。
    if (!refresh && cached && cached.updatedAt === updatedAt && (updatedAt !== null || cached.expiresAt > now())) {
      return cached.result;
    }
    let actors;
    try {
      const activities = await client.getAll(`/api/v3/work_packages/${id}/activities`);
      actors = activities.map(activity => personFromLink(activity?._links?.user)).filter(Boolean);
    } catch (error) {
      return partial(id, updatedAt, roles, error);
    }
    const [author, assignee, ...others] = await Promise.all([...roles, ...actors].map(withName));
    const result = {
      workPackageId: id, workPackageUpdatedAt: updatedAt,
      people: collectParticipants(author, assignee, others), complete: true, error: null,
    };
    cache.set(id, { updatedAt, result, expiresAt: now() + NO_UPDATED_AT_TTL_MS });
    return result;
  }

  return { getParticipants };
}
```

- [ ] **Step 4：確認通過** — Run: `node --test tests/activities.test.mjs`；Expected: 5 pass
- [ ] **Step 5：提交**

```bash
git add tests/activities.test.mjs server/activities.mjs
git commit -m "feat: load participants from OpenProject activities"
```

## Task 5：live 模式接線與前端提示

**Files:** Create `server/live-source.mjs`；Modify `server/index.mjs`, `tests/index.test.mjs`, `client/view-model.mjs`, `tests/view-model.test.mjs`, `client/main.mjs`

- [ ] **Step 1：在** `tests/view-model.test.mjs` 的匯入清單加入 `snapshotNotice`，並在檔案末尾新增：

```js
test('snapshot notices explain source errors and stale data', () => {
  assert.equal(snapshotNotice(snapshot), '');
  assert.equal(snapshotNotice({ ...snapshot, complete: false }), '資料未完整載入，畫面可能缺少部分項目。');
  const error = { code: 'unauthorized', message: 'OpenProject 驗證失敗，請確認 API token' };
  assert.equal(snapshotNotice({ ...snapshot, complete: false, error }), '資料來源錯誤：OpenProject 驗證失敗，請確認 API token');
  const notice = snapshotNotice({ ...snapshot, stale: true, error, lastSuccessAt: '2026-10-27T00:00:00.000Z' });
  assert.ok(notice.startsWith('資料來源錯誤：OpenProject 驗證失敗，請確認 API token。目前顯示 '), notice);
  assert.ok(notice.endsWith(' 的資料。'), notice);
});
```

- [ ] **Step 2：取代** `tests/index.test.mjs` 為（共用啟動輔助函式；live 測試取代原本「live 模式拒絕啟動」的測試）：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
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

// 以指定設定啟動服務，執行 check(base) 後關閉；回傳 stdout＋stderr 供機密檢查。
async function runServer(config, check) {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-index-'));
  const port = await freePort();
  let child;
  let output = '';
  try {
    const path = join(dir, 'local.json');
    await writeFile(path, JSON.stringify({ ...config, port }));
    child = spawn(process.execPath, [entry, '--config', path]);
    child.stderr.on('data', chunk => { output += chunk; });
    const exited = new Promise(resolve => child.once('exit', resolve));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes(`http://127.0.0.1:${port}/`)) { clearTimeout(timer); resolve(); }
      });
      exited.then(code => { clearTimeout(timer); reject(new Error(`server exited early: ${code}`)); });
    });
    await check(`http://127.0.0.1:${port}`);
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
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-index-'));
  try {
    const result = await start(['--config', join(dir, 'missing.json')]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Config file is missing or unreadable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('demo mode starts and serves the page and health endpoint', async () => {
  await runServer({ mode: 'demo' }, async base => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    await page.text();
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', mode: 'demo' });
  });
});
test('live mode starts, reports source errors in the snapshot, and never prints the token', async () => {
  const closed = await freePort();
  const output = await runServer({ mode: 'live', baseUrl: `http://127.0.0.1:${closed}/`, apiToken: 'FAKE_TOKEN_123' }, async base => {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', mode: 'live' });
    const response = await fetch(`${base}/api/snapshot`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(body).mode, 'live');
    assert.equal(JSON.parse(body).error.code, 'network');
    assert.ok(!body.includes('FAKE_TOKEN_123'));
  });
  assert.ok(!output.includes('FAKE_TOKEN_123'));
});
```

- [ ] **Step 3：確認失敗** — Run: `npm test`
Expected: view-model 新測試失敗（`snapshotNotice` 不存在，整個檔案載入失敗）；index 的 live 測試失敗（目前 live 模式拒絕啟動）。其餘通過。

- [ ] **Step 4：在** `client/view-model.mjs` **末尾新增**

```js
export function snapshotNotice(snapshot) {
  if (snapshot.error) {
    const reason = `資料來源錯誤：${snapshot.error.message}`;
    return snapshot.stale ? `${reason}。目前顯示 ${formatTime(snapshot.lastSuccessAt)} 的資料。` : reason;
  }
  return snapshot.complete ? '' : '資料未完整載入，畫面可能缺少部分項目。';
}
```

- [ ] **Step 5：修改** `client/main.mjs`：在 view-model 匯入清單加入 `snapshotNotice`，並把

```js
    showMessage(snapshot.complete ? '' : '資料未完整載入，畫面可能缺少部分項目。');
```

改為

```js
    showMessage(snapshotNotice(snapshot));
```

- [ ] **Step 6：建立** `server/live-source.mjs`

```js
import { createParticipantsLoader } from './activities.mjs';
import { createClient } from './openproject/client.mjs';
import { createSnapshotLoader } from './snapshot.mjs';

// 與示例來源相同的介面；token 只交給 client，不往外傳。
export function createLiveSource({ baseUrl, apiToken }) {
  const client = createClient({ baseUrl, apiToken });
  const snapshots = createSnapshotLoader({ client, baseUrl });
  const participants = createParticipantsLoader({ client });
  return { getSnapshot: snapshots.getSnapshot, getParticipants: participants.getParticipants };
}
```

- [ ] **Step 7：修改** `server/index.mjs`
  - 新增匯入：`import { createLiveSource } from './live-source.mjs';`
  - 刪除 `if (config.mode !== 'demo') { throw new Error('Live mode is not implemented yet; ...'); }` 整段。
  - `createHandler({ source: createDemoSource(), ...` 改為 `createHandler({ source: config.mode === 'demo' ? createDemoSource() : createLiveSource(config), ...`
  - 啟動訊息改為 ``console.log(`${config.mode === 'demo' ? '示例模式' : '即時模式'}已啟動：http://${config.host}:${config.port}/`);``

- [ ] **Step 8：確認通過** — Run: `npm test`；Expected: 67 pass、0 fail（45 + client 8 + normalize 4 + snapshot 4 + activities 5 + view-model 1；index 測試數不變）
- [ ] **Step 9：提交**

```bash
git add server/live-source.mjs server/index.mjs tests/index.test.mjs client/view-model.mjs tests/view-model.test.mjs client/main.mjs
git commit -m "feat: run live mode against OpenProject"
```

## Task 6：離線整體驗證、審查與交接（主控）

- [ ] `npm test` 全部通過；`npm run demo` 搭配無頭 Chrome 驗證腳本重跑，確認示例模式沒有退化。
- [ ] 規格審查（主控對照本計畫）＋整個階段一次程式碼品質審查（審查代理），處理發現後重跑測試。
- [ ] 機密檢查：`git grep -n "apikey:"` 只出現在 client 與測試；`git status` 沒有 `config/local.json`。
- [ ] 更新 `handoff.md`。

## Task 7：真實來源驗證（主控＋使用者；沒有 token 時記錄為未完成）

- [ ] **使用者**：登入 OpenProject →「我的帳號」→「存取權杖」→ API 產生 token。把 `config/example.json` 複製成 `config/local.json`，`mode` 改為 `"live"`，填入 `apiToken`。不要貼到對話。
- [ ] **主控**：經工具審核連線 `192.168.31.13`。`npm start` 背景啟動後只輸出統計，不印出完整資料：
  - `/api/health` 的 mode 為 live。
  - `/api/snapshot`：專案數、工作項目數、狀態名稱、`complete`、`error`。
  - 挑一個項目讀 `/api/work-packages/:id/participants`，看人數與 `complete`。
- [ ] **使用者**：在瀏覽器開啟 Dashboard，與 OpenProject 網頁核對至少一個專案、一個項目的 subject／狀態／建立者／負責人，以及至少一位活動參與者；點「在 OpenProject 開啟」確認連結正確。
- [ ] 對照上方「已知行為」表逐項確認（分頁 offset、`filters=[]`、活動 user 是否有 title、狀態是否有 color）。若實際不同，先改測試假資料重現，再修正 normalize／client。
- [ ] 記錄 OpenProject 版本（若 API 根資源有提供）、資料規模與首次載入時間；停止服務；更新 handoff。

## 自我審閱紀錄

- 路線第四階段：token 驗證（Task 1 auth header）；分頁與惡意分頁連結（loop／越界／筆數不符）；欄位轉換（Task 2）；活動歷史（Task 4）；快取（Task 3、4）；401／403／404／429／5xx、逾時（Task 1）。真實驗證另列為 Task 7。
- 安全：token 只在 client 中組成 header；只發 GET；同來源且路徑限定 `/api/v3`；不跟隨重新導向；錯誤訊息固定、不含回應內容；非預期例外只記錄錯誤名稱。第三階段審查提出的「refresh 可被跨站觸發」：刷新至少間隔 10 秒，同時請求共用一輪。
- 契約：`status` 一律非 null（缺少時用 `unknownStatus`），符合第三階段前端的假設。Person ID 依種類加前綴（`group:`、`placeholder:`），避免與使用者 ID 撞號而被錯誤去重。工作項目所屬專案不在清單時補上星系，避免星球孤立。
- 第二階段的 `/api/snapshot` 錯誤處理不變：live 來源以快照內的 `error` 回報來源問題（HTTP 200），只有程式錯誤才回 500。
- 延後：60 秒輪詢與前端手動更新（第五階段）、大量資料效能（第六階段）。
- 型別一致性：`createClient → { getJson, getAll }`；`createSnapshotLoader → { getSnapshot }`；`createParticipantsLoader → { getParticipants }`；`createLiveSource` 回傳與 `createDemoSource` 同名方法。
