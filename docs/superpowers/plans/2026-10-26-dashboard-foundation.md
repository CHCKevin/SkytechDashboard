# Dashboard Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可離線測試的私有設定、參與者去重與穩定視覺映射基礎，供本機服務與 3D 前端共同使用。

**Architecture:** 設定模組僅在後端讀取；shared 模組只接受正規化資料，不接觸 token、HTTP 或 DOM。此階段不連線來源、不產生 3D 畫面；後續範圍見 `2026-10-26-dashboard-roadmap.md`。

**Tech Stack:** Node.js ESM、`node:test`、`node:assert/strict`；此階段不需要外部套件。

---

## 開始前

- 設計與本計畫尚待使用者審閱；以下程式碼目前僅存在於計畫，不表示已建立或測試。
- 在允許的開發分支／隔離工作區執行。不要直接在 master 實作，也不要修改 .git 保護 ACL。尚無初始提交，建立 worktree 前須先處理基準提交或採核准的開發分支方式。
- 使用既有 `config/local.json` 忽略規則，不建立或索取聊天中的真實 token。所有測試使用明確假值。
- 每個任務依「測試 → 預期失敗 → 最小實作 → 通過」執行。首次缺少模組導致載入失敗是啟動紅燈，實作後需確認下列行為斷言全部執行。

## 檔案清單

| 路徑 | 職責 |
|---|---|
| `server/config.mjs` | 驗證設定、讀取本機 JSON，禁止含機密的錯誤訊息 |
| `shared/participants.mjs` | 人員 ID 去重；保留不同 ID 的同名使用者 |
| `shared/layout.mjs` | 純函式產生穩定位置與顏色 |
| `tests/config.test.mjs` | 設定邊界與機密不回顯 |
| `tests/participants.test.mjs` | ID、未知身分與未指派 |
| `tests/layout.test.mjs` | 穩定性、範圍、狀態色彩備援 |
| `config/example.json` | 可複製的示例設定，沒有有效憑證 |
| `package.json` | 離線測試命令 |
| `handoff.md` | 本階段結果與未完成工作 |

## Task 1：後端私有設定

- [ ] 建立 `tests/config.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseConfig, loadConfig } from '../server/config.mjs';

test('demo defaults to loopback and has no token', () => {
  assert.deepEqual(parseConfig({ mode: 'demo' }), {
    mode: 'demo', host: '127.0.0.1', port: 4173,
    baseUrl: null, apiToken: null,
  });
});
test('live requires a token without echoing input', () => {
  assert.throws(() => parseConfig({ mode: 'live', baseUrl: 'http://example.test' }),
    { message: 'Live mode requires apiToken' });
  assert.throws(() => parseConfig({ mode: 'live', baseUrl: 'http://user:SECRET@example.test', apiToken: 'FAKE' }),
    { message: 'baseUrl must be an HTTP(S) origin without credentials, query, or fragment' });
});
test('live normalizes origin, keeps secrets server-side, rejects invalid port', () => {
  const c = parseConfig({ mode: 'live', baseUrl: 'http://example.test/', apiToken: 'FAKE' });
  assert.equal(c.baseUrl, 'http://example.test');
  assert.equal(c.apiToken, 'FAKE');
  for (const port of [0, 65536, 1.5, '4173']) {
    assert.throws(() => parseConfig({ mode: 'demo', port }));
  }
  assert.throws(() => parseConfig({ mode: 'demo', host: '0.0.0.0' }));
  assert.throws(() => parseConfig({ mode: 'other' }));
  assert.throws(() => parseConfig(null));
});
test('loadConfig reads JSON and sanitizes parse errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-config-'));
  const path = join(dir, 'local.json');
  try {
    await writeFile(path, '{"mode":"demo"}');
    assert.equal((await loadConfig(path)).mode, 'demo');
    await writeFile(path, 'SECRET_INVALID_JSON');
    await assert.rejects(loadConfig(path), { message: 'Config file must contain valid JSON' });
    await assert.rejects(loadConfig(join(dir, 'missing.json')),
      { message: 'Config file is missing or unreadable' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] 執行 `node --test tests/config.test.mjs`，確認因尚未建立設定模組而失敗。
- [ ] 建立 `server/config.mjs`：

```js
import { readFile } from 'node:fs/promises';

export function parseConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Config must be an object');
  }
  if (!['demo', 'live'].includes(input.mode)) throw new Error('mode must be demo or live');
  if (input.host !== undefined && input.host !== '127.0.0.1') {
    throw new Error('Only loopback host 127.0.0.1 is supported');
  }
  const port = input.port ?? 4173;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('port must be an integer from 1 to 65535');
  }
  const config = { mode: input.mode, host: '127.0.0.1', port, baseUrl: null, apiToken: null };
  if (input.mode === 'demo') return Object.freeze(config);
  let url;
  try { url = new URL(input.baseUrl); } catch { throw new Error('baseUrl must be a valid URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
    throw new Error('baseUrl must be an HTTP(S) origin without credentials, query, or fragment');
  }
  if (typeof input.apiToken !== 'string' || !input.apiToken.trim()) {
    throw new Error('Live mode requires apiToken');
  }
  return Object.freeze({ ...config, baseUrl: url.origin, apiToken: input.apiToken.trim() });
}

export async function loadConfig(path) {
  let raw;
  try { raw = await readFile(path, 'utf8'); }
  catch { throw new Error('Config file is missing or unreadable'); }
  let input;
  try { input = JSON.parse(raw); }
  catch { throw new Error('Config file must contain valid JSON'); }
  return parseConfig(input);
}
```

本階段限定來源部署於 origin 根路徑，與目前 `http://192.168.31.13:8080/` 一致。若真實來源改為子路徑部署，需先擴充設定與 URL 測試，不能默默丟棄子路徑。

- [ ] 執行 `node --test tests/config.test.mjs`，預期 4 個測試通過。
- [ ] 建立 `config/example.json`：

```json
{
  "mode": "demo",
  "host": "127.0.0.1",
  "port": 4173,
  "baseUrl": "http://192.168.31.13:8080/",
  "apiToken": ""
}
```

設定物件不得送到前端。後續 health 路由必須明列輸出欄位，不能使用物件展開直接序列化設定。

## Task 2：參與者身分

- [ ] 建立 `tests/participants.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectParticipants } from '../shared/participants.mjs';

test('deduplicates IDs while preserving different people with the same name', () => {
  const people = collectParticipants({ id: '1', name: 'Alex' }, { id: 1, name: 'Alex' },
    [{ id: '2', name: 'Alex' }, { id: '1', name: 'Alex' }]);
  assert.deepEqual(people.map(p => p.id), ['1', '2']);
  assert.equal(new Set(people.map(p => p.key)).size, 2);
});
test('unassigned does not create a ship; unidentified actors are not falsely merged', () => {
  const people = collectParticipants(null, null,
    [{ id: null, name: 'Deleted' }, { id: null, name: 'Deleted' }, { id: '3', name: '' }]);
  assert.equal(people.length, 3);
  assert.equal(people[2].name, '未知使用者');
  assert.equal(new Set(people.map(p => p.key)).size, 3);
  assert.deepEqual(collectParticipants(null, null, []), []);
});
```

- [ ] 執行 `node --test tests/participants.test.mjs`，確認缺少模組的預期失敗。
- [ ] 建立 `shared/participants.mjs`：

```js
export function collectParticipants(author, assignee, activityAuthors = []) {
  const people = new Map();
  const entries = [author, assignee, ...activityAuthors];
  entries.forEach((person, index) => {
    if (!person) return;
    const id = person.id == null ? null : String(person.id);
    const key = id === null ? `unknown:${index}` : `user:${id}`;
    const name = typeof person.name === 'string' && person.name.trim()
      ? person.name.trim() : '未知使用者';
    if (!people.has(key)) people.set(key, { key, id, name });
  });
  return [...people.values()];
}
```

未知身分的 key 只在本次結果內區分，不宣稱兩筆未知紀錄是兩個不同真人。UI 顯示「身分不明紀錄」並以完整性資訊說明限制。來源有 ID 才能可靠跨角色去重；不要以顯示名稱合併。

- [ ] 執行 `node --test tests/participants.test.mjs`，預期 2 個測試通過。

## Task 3：穩定位置與狀態色彩

- [ ] 建立 `tests/layout.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { positionFor, colorForStatus } from '../shared/layout.mjs';

test('position depends only on ID and namespace, not array ordering', () => {
  const before = positionFor('work-package', '42');
  positionFor('work-package', '99');
  assert.deepEqual(positionFor('work-package', '42'), before);
  assert.notDeepEqual(positionFor('project', '42'), before);
  assert.notDeepEqual(positionFor('work-package', '43'), before);
  assert.ok(before.every(Number.isFinite));
  assert.ok(Math.hypot(...before) <= 100);
});
test('valid source colors win, malformed colors fall back, unknown is neutral', () => {
  assert.equal(colorForStatus('1', '#12AbEF'), '#12abef');
  assert.equal(colorForStatus(null), '#94a3b8');
  assert.equal(colorForStatus('1', 'url(bad)'), colorForStatus('1'));
  assert.match(colorForStatus('1'), /^#[0-9a-f]{6}$/);
  assert.equal(colorForStatus('1'), colorForStatus(1));
});
```

- [ ] 執行 `node --test tests/layout.test.mjs`，確認缺少模組的預期失敗。
- [ ] 建立 `shared/layout.mjs`：

```js
const palette = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee'];

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  }
  return value >>> 0;
}

export function positionFor(namespace, id) {
  const seed = `${namespace}:${id}`;
  const angle = hash(`${seed}:angle`) / 4294967296 * Math.PI * 2;
  const radius = 20 + hash(`${seed}:radius`) / 4294967296 * 60;
  const height = (hash(`${seed}:height`) / 4294967296 - 0.5) * 12;
  return [Math.cos(angle) * radius, height, Math.sin(angle) * radius];
}

export function colorForStatus(id, sourceColor) {
  if (typeof sourceColor === 'string' && /^#[0-9a-f]{6}$/i.test(sourceColor)) {
    return sourceColor.toLowerCase();
  }
  return id == null ? '#94a3b8' : palette[hash(String(id)) % palette.length];
}
```

此為場景的基本位置，不保證不同 ID 永不重疊。3D 階段將專案位置按星系間距縮放、工作項目位置加到所屬星系中心，並提供可搜尋清單補足密集點選；不得靠每輪重新排序來解決碰撞，否則刷新會跳位。未知狀態無來源色彩時使用中性色；相同調色盤色彩仍須靠文字區分。

- [ ] 執行 `node --test tests/layout.test.mjs`，預期 2 個測試通過。

## Task 4：整體驗證與交接

- [ ] 建立 `package.json`（此階段沒有 start 指令，避免暗示已有服務）：

```json
{
  "name": "openproject-universe-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  }
}
```

- [ ] 執行 `npm test`，預期 8 個測試全部通過、無失敗。這不是前端或真實來源整合測試。
- [ ] 執行 `git check-ignore config/local.json`，預期輸出該私有檔路徑。
- [ ] 執行 `git status --short`，核對新增範圍只有本計畫檔案；不將 config/local.json 加入索引。
- [ ] 在 `handoff.md` 追加實際驗證結果；只有真的通過後才能寫入下列內容，否則寫明失敗與接續方法：

```markdown
## 資料基礎階段
- 已完成設定驗證、參與者 ID 去重、穩定位置與色彩純函式。
- npm test：8 個測試通過。config/local.json 忽略規則已驗證。
- 尚無 HTTP 服務、3D UI 或真實 OpenProject 資料串接。
- 下一階段：依 dashboard-roadmap 建立本機示例服務的逐步計畫。
```

- [ ] 執行規格審查再執行程式碼品質審查；處理發現後重跑受影響測試。
- [ ] 經允許的 Git 寫入工具將此階段精確檔案提交到開發分支；不要使用 `git add .`。若工具拒絕，保留檔案並記錄未提交，不修改權限來強行完成。

## 自我審閱紀錄

- 本計畫只覆蓋路線階段 1，未將其他五階段宣稱完成。
- 所有測試使用假資料，設定錯誤訊息不回顯輸入。
- `collectParticipants` 的輸入為正規化人員，不能直接傳入 HAL 活動物件；該轉換屬於 adapter 階段。
- ID 在函式邊界正規化成字串；色彩及位置函式不依資料順序。
- demo/live 明確分開；live 沒有 token 時失敗，不自動降級。
- 此文件未執行任何產品測試；預期測試數量為 4 + 2 + 2 = 8。
