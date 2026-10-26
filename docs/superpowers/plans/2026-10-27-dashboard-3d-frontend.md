# Dashboard 3D 前端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本機示例服務上建立 3D 宇宙前端：星系總覽、單一星系、全宇宙三種視圖，點選星球顯示詳情與參與者太空船，狀態圖例，鍵盤可操作的清單，無 WebGL 時明確提示。

**Architecture:** 前端拆成「純邏輯」與「瀏覽器專用」兩層。純邏輯（`layout-3d.mjs`、`view-model.mjs`、`store.mjs`）不碰 DOM 與 Three.js，以 `node:test` 測試。瀏覽器層（`scene.mjs`、`ships.mjs`、`main.mjs`）只負責繪製與事件，透過主控以真實瀏覽器驗證。Three.js 由 npm 安裝確切版本，經後端靜態白名單以 `/vendor/...` 提供；頁面用 import map 對應 `three`，CSP 以 SHA-256 雜湊只放行這一段 import map。

**Tech Stack:** Node.js ESM、`node:test`；瀏覽器原生 ES modules；`three@0.170.0`（`build/three.module.js` 為單檔、無其他 import，`OrbitControls`、`CSS2DRenderer` 皆 `import from 'three'`，已實際下載檢查）。

---

## 開始前

- 前置：第二階段已提交於 `feature/demo-service`（`b17a057`），`npm test` 25 個通過。
- 從 `feature/demo-service` 建立 `feature/3d-frontend`：`git checkout -b feature/3d-frontend`。
- 不連線 OpenProject、不建立 `config/local.json`。
- 安裝依賴需網路（npm registry）；依工具審核流程執行，不修改權限設定。
- 所有資料文字以 `textContent` 寫入 DOM，禁止 `innerHTML`；HTML 中不得有 inline `style` 屬性或 inline script（import map 除外），否則違反 CSP。
- 本階段不做：60 秒輪詢與手動更新（第五階段）、真實來源（第四階段）、1,000 筆效能量測（第六階段）、自動化瀏覽器測試框架（改由主控以瀏覽器工具驗證並記錄）。

## 檔案清單

| 路徑 | 動作 | 職責 |
|---|---|---|
| `client/layout-3d.mjs` | 新增 | 星系中心、星球位置、太空船軌道、鏡頭預設（純函式） |
| `client/view-model.mjs` | 新增 | 圖例、專案摘要、可見項目、詳情欄位、參與者狀態文字、安全連結（純函式） |
| `client/store.mjs` | 新增 | 快照／視圖／選取／參與者狀態；拒絕過時回應 |
| `client/api.mjs` | 新增 | 呼叫本機 API |
| `client/ships.mjs` | 新增 | 選取星球的太空船與名字標籤生命週期 |
| `client/scene.mjs` | 新增 | Three.js 場景、OrbitControls、點選、鏡頭飛行、分批加入星球、遠近標籤 |
| `client/main.mjs` | 新增 | 啟動、WebGL 檢查、面板與清單、事件綁定 |
| `client/styles.css` | 新增 | 深色桌面配置與窄螢幕退化 |
| `client/index.html` | 取代 | 正式頁面結構與 import map |
| `server/csp.mjs` | 新增 | 由頁面 import map 計算 CSP |
| `server/static-files.mjs` | 新增 | 靜態白名單與啟動時存在性檢查 |
| `server/http.mjs` | 修改 | 靜態項目可帶自己的 CSP |
| `server/index.mjs` | 修改 | 使用白名單模組與頁面 CSP |
| `.gitignore` | 修改 | 忽略 `node_modules/` |
| `package.json`、`package-lock.json` | 修改／新增 | `three` 確切版本 |
| `tests/layout-3d.test.mjs`、`tests/view-model.test.mjs`、`tests/store.test.mjs`、`tests/csp.test.mjs`、`tests/static-files.test.mjs` | 新增 | 純邏輯與伺服器測試 |
| `tests/http.test.mjs` | 修改 | 新增靜態 CSP 測試 |

模組匯入路徑：前端模組以相對路徑 `../shared/layout.mjs` 匯入共用函式。頁面從 `/` 提供，`/layout-3d.mjs` 解析 `../shared/layout.mjs` 會得到 `/shared/layout.mjs`，與 Node 測試時的檔案結構一致。瀏覽器專用模組以絕對路徑 `/vendor/...` 匯入 Three.js 附加元件。

## Task 1：3D 配置純函式

**Files:** Create `tests/layout-3d.test.mjs`, `client/layout-3d.mjs`

- [ ] **Step 1：撰寫失敗測試** `tests/layout-3d.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { galaxyCenter, planetPosition, shipPosition, cameraPreset } from '../client/layout-3d.mjs';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('planets sit near their own galaxy center', () => {
  for (const id of ['1001', '1002', '1003', '1004']) {
    const d = distance(planetPosition({ id, projectId: '101' }), galaxyCenter('101'));
    assert.ok(d >= 5 && d <= 25, `${id}: ${d}`);
  }
});
test('positions are stable and depend only on IDs', () => {
  const wp = { id: '1001', projectId: '101' };
  assert.deepEqual(planetPosition(wp), planetPosition({ ...wp, subject: 'other' }));
  assert.deepEqual(galaxyCenter('101'), galaxyCenter('101'));
  assert.notDeepEqual(galaxyCenter('101'), galaxyCenter('102'));
});
test('ships orbit at a shared radius that grows with crowd size', () => {
  const center = [10, 0, -5];
  const ring = count => Array.from({ length: count }, (_, i) => shipPosition(center, i, count, 0));
  const flat = p => Math.hypot(p[0] - center[0], p[2] - center[2]);
  const small = ring(3);
  assert.ok(small.every(p => Math.abs(flat(p) - flat(small[0])) < 1e-9));
  assert.equal(new Set(small.map(p => p.join())).size, 3);
  assert.ok(flat(ring(12)[0]) > flat(small[0]));
  assert.notDeepEqual(shipPosition(center, 0, 3, 1000), small[0]);
});
test('camera presets frame the requested view', () => {
  const galaxy = cameraPreset({ mode: 'galaxy', projectId: '101' });
  assert.deepEqual(galaxy.target, galaxyCenter('101'));
  assert.ok(distance(galaxy.position, galaxy.target) < 90);
  const overview = cameraPreset({ mode: 'overview', projectId: null });
  const universe = cameraPreset({ mode: 'universe', projectId: null });
  assert.deepEqual(overview.target, [0, 0, 0]);
  assert.ok(distance(universe.position, [0, 0, 0]) > distance(overview.position, [0, 0, 0]));
});
```

- [ ] **Step 2：確認失敗** — Run: `node --test tests/layout-3d.test.mjs`；Expected: `ERR_MODULE_NOT_FOUND`
- [ ] **Step 3：實作** `client/layout-3d.mjs`

```js
import { positionFor } from '../shared/layout.mjs';

// 世界座標只由 ID 決定，資料更新不會讓星系或星球跳動。
const GALAXY_SPREAD = 4;
const PLANET_SPREAD = 0.3;

export function galaxyCenter(projectId) {
  return positionFor('project', projectId).map(v => v * GALAXY_SPREAD);
}

export function planetPosition(wp) {
  const center = galaxyCenter(wp.projectId);
  const offset = positionFor('work-package', wp.id).map(v => v * PLANET_SPREAD);
  return center.map((v, i) => v + offset[i]);
}

export function shipPosition(center, index, count, time) {
  const radius = 4.5 + Math.ceil(count / 6) * 1.2;
  const angle = (index / count) * Math.PI * 2 + time * 0.0005;
  const height = ((index % 3) - 1) * 0.8;
  return [center[0] + Math.cos(angle) * radius, center[1] + height, center[2] + Math.sin(angle) * radius];
}

export function cameraPreset(view) {
  if (view.mode === 'galaxy') {
    const target = galaxyCenter(view.projectId);
    return { target, position: [target[0], target[1] + 25, target[2] + 45] };
  }
  const scale = view.mode === 'universe' ? 1.25 : 1;
  return { target: [0, 0, 0], position: [0, 240 * scale, 360 * scale] };
}
```

- [ ] **Step 4：確認通過** — Run: `node --test tests/layout-3d.test.mjs`；Expected: 4 pass
- [ ] **Step 5：提交**

```bash
git add tests/layout-3d.test.mjs client/layout-3d.mjs
git commit -m "feat: add stable 3D layout helpers"
```

## Task 2：畫面資料轉換

**Files:** Create `tests/view-model.test.mjs`, `client/view-model.mjs`

- [ ] **Step 1：撰寫失敗測試** `tests/view-model.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSource } from '../server/demo.mjs';
import {
  MISSING, legendEntries, projectSummaries, visibleWorkPackages, detailFields,
  participantsStatus, safeUrl, formatTime,
} from '../client/view-model.mjs';

const snapshot = await createDemoSource().getSnapshot({ refresh: false });
const byId = id => snapshot.workPackages.find(wp => wp.id === id);

test('legend lists every status with its usage count', () => {
  const legend = legendEntries(snapshot);
  assert.equal(legend.length, snapshot.statuses.length);
  assert.equal(legend.reduce((sum, entry) => sum + entry.count, 0), snapshot.workPackages.length);
  assert.deepEqual(legend.find(entry => entry.name === '未知狀態'), { name: '未知狀態', color: '#94a3b8', count: 1 });
});
test('project summaries and visible items follow the view', () => {
  assert.deepEqual(projectSummaries(snapshot).map(p => [p.id, p.count]), [['101', 3], ['102', 1], ['103', 0]]);
  assert.deepEqual(visibleWorkPackages(snapshot, { mode: 'overview', projectId: null }), []);
  assert.deepEqual(visibleWorkPackages(snapshot, { mode: 'galaxy', projectId: '102' }).map(wp => wp.id), ['1004']);
  assert.equal(visibleWorkPackages(snapshot, { mode: 'universe', projectId: null }).length, 4);
});
test('detail fields mark missing values and keep HTML as plain text', () => {
  const fields = Object.fromEntries(detailFields(byId('1003'), '星圖平台'));
  assert.equal(fields['專案'], '星圖平台');
  assert.equal(fields['負責人'], '未指派');
  assert.equal(fields['描述'], MISSING);
  assert.equal(fields['更新時間'], MISSING);
  const html = Object.fromEntries(detailFields(byId('1002'), null));
  assert.equal(html['描述'], '<b>示例：此字串不應被當成 HTML</b>');
  assert.equal(html['專案'], MISSING);
  assert.equal(formatTime('not a date'), MISSING);
  assert.notEqual(formatTime('2026-10-20T08:00:00.000Z'), MISSING);
});
test('participant status text covers loading, failure, partial, and empty', () => {
  assert.equal(participantsStatus({ status: 'idle', result: null, message: null }), '');
  assert.equal(participantsStatus({ status: 'loading', result: null, message: null }), '載入參與者中…');
  assert.equal(participantsStatus({ status: 'error', result: null, message: '逾時' }), '參與者載入失敗：逾時');
  assert.equal(participantsStatus({ status: 'ready', message: null,
    result: { complete: false, people: [{}], error: { message: '部分' } } }), '名單可能不完整：部分');
  assert.equal(participantsStatus({ status: 'ready', message: null,
    result: { complete: true, people: [], error: null } }), '沒有可顯示的參與者');
  assert.equal(participantsStatus({ status: 'ready', message: null,
    result: { complete: true, people: [{}], error: null } }), '');
});
test('only http(s) links are allowed', () => {
  assert.equal(safeUrl('http://192.168.31.13:8080/work_packages/1'), 'http://192.168.31.13:8080/work_packages/1');
  assert.equal(safeUrl('https://example.test/x'), 'https://example.test/x');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('not a url'), null);
  assert.equal(safeUrl(null), null);
});
```

- [ ] **Step 2：確認失敗** — Run: `node --test tests/view-model.test.mjs`；Expected: `ERR_MODULE_NOT_FOUND`
- [ ] **Step 3：實作** `client/view-model.mjs`

```js
export const MISSING = '未提供';

const text = value => (value == null || value === '' ? MISSING : String(value));
const statusKey = status => String(status.id);

export function legendEntries(snapshot) {
  const counts = new Map();
  for (const wp of snapshot.workPackages) {
    counts.set(statusKey(wp.status), (counts.get(statusKey(wp.status)) ?? 0) + 1);
  }
  return snapshot.statuses.map(status =>
    ({ name: status.name, color: status.color, count: counts.get(statusKey(status)) ?? 0 }));
}

export function projectSummaries(snapshot) {
  return snapshot.projects.map(project => ({
    ...project, count: snapshot.workPackages.filter(wp => wp.projectId === project.id).length,
  }));
}

export function visibleWorkPackages(snapshot, view) {
  if (view.mode === 'universe') return snapshot.workPackages;
  if (view.mode === 'galaxy') return snapshot.workPackages.filter(wp => wp.projectId === view.projectId);
  return [];
}

export function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? MISSING : date.toLocaleString('zh-TW', { hour12: false });
}

export function detailFields(wp, projectName) {
  return [
    ['專案', text(projectName)],
    ['狀態', text(wp.status?.name)],
    ['建立者', text(wp.author?.name)],
    ['負責人', wp.assignee ? text(wp.assignee.name) : '未指派'],
    ['更新時間', wp.updatedAt ? formatTime(wp.updatedAt) : MISSING],
    ['描述', text(wp.description)],
  ];
}

export function participantsStatus({ status, result, message }) {
  if (status === 'loading') return '載入參與者中…';
  if (status === 'error') return `參與者載入失敗：${message}`;
  if (status !== 'ready') return '';
  if (!result.complete) return `名單可能不完整：${result.error?.message ?? '活動歷史未完整讀取'}`;
  return result.people.length ? '' : '沒有可顯示的參與者';
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4：確認通過** — Run: `node --test tests/view-model.test.mjs`；Expected: 5 pass
- [ ] **Step 5：提交**

```bash
git add tests/view-model.test.mjs client/view-model.mjs
git commit -m "feat: add dashboard view-model helpers"
```

## Task 3：前端狀態

**Files:** Create `tests/store.test.mjs`, `client/store.mjs`

- [ ] **Step 1：撰寫失敗測試** `tests/store.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSource } from '../server/demo.mjs';
import { createStore } from '../client/store.mjs';

const snapshot = await createDemoSource().getSnapshot({ refresh: false });
const loaded = () => {
  const store = createStore();
  store.setSnapshot(snapshot);
  return store;
};

test('stale participant responses are ignored', () => {
  const store = loaded();
  store.showUniverse();
  const first = store.select('1001');
  const second = store.select('1002');
  assert.equal(store.receiveParticipants(first, { workPackageId: '1001' }), false);
  assert.equal(store.get().participants.status, 'loading');
  assert.equal(store.receiveParticipants(second, { workPackageId: '1002' }), true);
  assert.deepEqual(store.get().participants, { status: 'ready', result: { workPackageId: '1002' }, message: null });
  store.select(null);
  assert.equal(store.failParticipants(second, '逾時'), false);
  assert.equal(store.get().participants.status, 'idle');
  const fourth = store.select('1003');
  assert.equal(store.failParticipants(fourth, '逾時'), true);
  assert.deepEqual(store.get().participants, { status: 'error', result: null, message: '逾時' });
});
test('view changes keep the selection only while it stays visible', () => {
  const store = loaded();
  store.showProject('101');
  assert.deepEqual(store.get().view, { mode: 'galaxy', projectId: '101' });
  store.select('1001');
  store.showUniverse();
  assert.equal(store.get().selectedId, '1001');
  store.showProject('101');
  assert.equal(store.get().selectedId, '1001');
  store.showProject('102');
  assert.equal(store.get().selectedId, null);
  store.select('1004');
  store.showOverview();
  assert.equal(store.get().selectedId, null);
  assert.equal(store.get().participants.status, 'idle');
});
test('a complete snapshot without the selected item clears it; a partial one does not', () => {
  const store = loaded();
  store.showProject('101');
  store.select('1001');
  const without = { ...snapshot, workPackages: snapshot.workPackages.filter(wp => wp.id !== '1001') };
  store.setSnapshot({ ...without, complete: false });
  assert.equal(store.get().selectedId, '1001');
  store.setSnapshot(without);
  assert.equal(store.get().selectedId, null);
});
test('a complete snapshot without the current project returns to overview', () => {
  const store = loaded();
  store.showProject('103');
  store.setSnapshot({ ...snapshot, projects: snapshot.projects.filter(p => p.id !== '103') });
  assert.deepEqual(store.get().view, { mode: 'overview', projectId: null });
});
test('subscribers are notified until they unsubscribe', () => {
  const store = createStore();
  const seen = [];
  const unsubscribe = store.subscribe(state => seen.push(state.view.mode));
  store.showUniverse();
  unsubscribe();
  store.showOverview();
  assert.deepEqual(seen, ['universe']);
});
```

- [ ] **Step 2：確認失敗** — Run: `node --test tests/store.test.mjs`；Expected: `ERR_MODULE_NOT_FOUND`
- [ ] **Step 3：實作** `client/store.mjs`

```js
const idle = Object.freeze({ status: 'idle', result: null, message: null });

function isVisible(snapshot, view, id) {
  const wp = snapshot?.workPackages.find(item => item.id === id);
  if (!wp) return false;
  return view.mode === 'universe' || (view.mode === 'galaxy' && wp.projectId === view.projectId);
}

export function createStore() {
  let state = { snapshot: null, view: { mode: 'overview', projectId: null }, selectedId: null, participants: idle };
  // 每次選取變更都遞增；回應帶回的 token 不同即為過時回應，不得覆蓋目前選取。
  let token = 0;
  const listeners = new Set();

  function update(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  function selection(id) {
    token += 1;
    return { selectedId: id, participants: id ? { status: 'loading', result: null, message: null } : idle };
  }

  function changeView(view) {
    const keep = state.selectedId && isVisible(state.snapshot, view, state.selectedId);
    update({ view, ...(keep ? {} : selection(null)) });
  }

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSnapshot(snapshot) {
      const patch = { snapshot };
      // 只有完整快照才能確認項目或專案已消失；部分資料不得當成刪除。
      if (snapshot.complete) {
        const { projectId } = state.view;
        if (projectId && !snapshot.projects.some(project => project.id === projectId)) {
          patch.view = { mode: 'overview', projectId: null };
        }
        if (state.selectedId && !isVisible(snapshot, patch.view ?? state.view, state.selectedId)) {
          Object.assign(patch, selection(null));
        }
      }
      update(patch);
    },
    showOverview: () => changeView({ mode: 'overview', projectId: null }),
    showProject: projectId => changeView({ mode: 'galaxy', projectId }),
    showUniverse: () => changeView({ mode: 'universe', projectId: null }),
    select(id) {
      update(selection(id ?? null));
      return token;
    },
    receiveParticipants(requestToken, result) {
      if (requestToken !== token) return false;
      update({ participants: { status: 'ready', result, message: null } });
      return true;
    },
    failParticipants(requestToken, message) {
      if (requestToken !== token) return false;
      update({ participants: { status: 'error', result: null, message } });
      return true;
    },
  };
}
```

- [ ] **Step 4：確認通過** — Run: `node --test tests/store.test.mjs`；Expected: 5 pass
- [ ] **Step 5：提交**

```bash
git add tests/store.test.mjs client/store.mjs
git commit -m "feat: add frontend state store"
```

## Task 4：Three.js 依賴與瀏覽器模組

瀏覽器專用模組無法在 Node 執行（依賴 DOM、WebGL、import map），本任務以 `node --check` 確認語法，行為由 Task 6 的瀏覽器驗證負責。

**Files:**
- Modify: `.gitignore`、`package.json`；Create: `package-lock.json`
- Create: `client/api.mjs`、`client/ships.mjs`、`client/scene.mjs`、`client/main.mjs`、`client/styles.css`
- Replace: `client/index.html`

- [ ] **Step 1：忽略 node_modules** — 在 `.gitignore` 末尾加一行：

```text
node_modules/
```

- [ ] **Step 2：安裝確切版本**

Run: `npm install three@0.170.0 --save-exact --no-audit --no-fund`
Expected: `package.json` 出現 `"dependencies": { "three": "0.170.0" }`，產生 `package-lock.json`；`node_modules/three/build/three.module.js` 存在。
確認 `git status --short` 沒有 `node_modules/`。

- [ ] **Step 3：建立** `client/api.mjs`

```js
async function getJson(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body;
}

export const fetchSnapshot = () => getJson('/api/snapshot');
export const fetchParticipants = id => getJson(`/api/work-packages/${encodeURIComponent(id)}/participants`);
```

- [ ] **Step 4：建立** `client/ships.mjs`

```js
import * as THREE from 'three';
import { CSS2DObject } from '/vendor/CSS2DRenderer.js';
import { shipPosition } from './layout-3d.mjs';

const hullGeometry = new THREE.ConeGeometry(0.45, 1.4, 8).rotateX(Math.PI / 2);
const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0x38bdf8, emissiveIntensity: 0.3 });

// 太空船只屬於目前選取的星球；切換或取消選取時整組移除。
export function createShipFleet(scene) {
  let group = null;
  let center = null;
  let ships = [];

  function clear() {
    if (!group) return;
    group.traverse(object => { if (object.isCSS2DObject) object.element.remove(); });
    scene.remove(group);
    group = null;
    ships = [];
  }

  function show(position, people) {
    clear();
    center = position;
    group = new THREE.Group();
    ships = people.map(person => {
      const ship = new THREE.Mesh(hullGeometry, hullMaterial);
      const element = document.createElement('div');
      element.className = 'ship-label';
      element.textContent = person.name;
      const tag = new CSS2DObject(element);
      tag.position.set(0, 1.4, 0);
      ship.add(tag);
      group.add(ship);
      return ship;
    });
    scene.add(group);
  }

  function update(time) {
    ships.forEach((ship, index) => {
      ship.position.set(...shipPosition(center, index, ships.length, time));
      ship.lookAt(...center);
    });
  }

  return { show, clear, update };
}
```

- [ ] **Step 5：建立** `client/scene.mjs`

```js
import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from '/vendor/CSS2DRenderer.js';
import { galaxyCenter, planetPosition, cameraPreset } from './layout-3d.mjs';
import { createShipFleet } from './ships.mjs';

const BATCH_SIZE = 200;
const LABEL_DISTANCE = 90;
const FLIGHT_MS = 700;
const CLICK_TOLERANCE = 5;

export function createScene(container, { onPickProject, onPickWorkPackage, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.append(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(200, 300, 100);
  scene.add(sun, createStarfield());

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.screenSpacePanning = true;
  controls.maxDistance = 2000;

  const planetGeometry = new THREE.SphereGeometry(1.6, 24, 16);
  const coreGeometry = new THREE.SphereGeometry(5, 32, 16);
  const haloGeometry = new THREE.SphereGeometry(14, 32, 16);
  const coreMaterial = new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: 0x7c3aed, emissiveIntensity: 0.8 });
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x7c3aed, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const planetMaterials = new Map();

  const galaxies = new Map();
  const planets = new Map();
  const fleet = createShipFleet(scene);
  let pending = [];
  let total = 0;
  let view = { mode: 'overview', projectId: null };
  let selectedId = null;
  let flight = null;

  function label(text, className) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    return new CSS2DObject(element);
  }

  function materialFor(color) {
    if (!planetMaterials.has(color)) {
      planetMaterials.set(color, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.6 }));
    }
    return planetMaterials.get(color);
  }

  function removeObject(object) {
    object.traverse(child => { if (child.isCSS2DObject) child.element.remove(); });
    scene.remove(object);
  }

  function addGalaxy(project) {
    const group = new THREE.Group();
    group.position.set(...galaxyCenter(project.id));
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.userData = { kind: 'project', id: project.id };
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    const tag = label('', 'galaxy-label');
    tag.position.set(0, 9, 0);
    group.add(core, halo, tag);
    scene.add(group);
    galaxies.set(project.id, { group, core, tag });
  }

  function addPlanet(wp) {
    const mesh = new THREE.Mesh(planetGeometry, materialFor(wp.status.color));
    mesh.userData = { kind: 'work-package', id: wp.id };
    const tag = label('', 'planet-label');
    tag.position.set(0, 2.6, 0);
    mesh.add(tag);
    scene.add(mesh);
    const planet = { mesh, tag, wp };
    planets.set(wp.id, planet);
    updatePlanet(planet, wp);
  }

  function updatePlanet(planet, wp) {
    planet.wp = wp;
    planet.mesh.material = materialFor(wp.status.color);
    planet.mesh.position.set(...planetPosition(wp));
    planet.tag.element.textContent = wp.subject;
    planet.mesh.visible = view.mode === 'universe' || (view.mode === 'galaxy' && wp.projectId === view.projectId);
    planet.mesh.scale.setScalar(wp.id === selectedId ? 1.8 : 1);
  }

  function refreshPlanets() {
    for (const planet of planets.values()) updatePlanet(planet, planet.wp);
  }

  // 依 ID 增刪物件，不重建控制器，也不移動既有星系與星球。
  function setData(snapshot) {
    const counts = new Map();
    for (const wp of snapshot.workPackages) counts.set(wp.projectId, (counts.get(wp.projectId) ?? 0) + 1);
    const projectIds = new Set(snapshot.projects.map(project => project.id));
    for (const [id, galaxy] of galaxies) {
      if (!projectIds.has(id)) { removeObject(galaxy.group); galaxies.delete(id); }
    }
    for (const project of snapshot.projects) {
      if (!galaxies.has(project.id)) addGalaxy(project);
      galaxies.get(project.id).tag.element.textContent = `${project.name}（${counts.get(project.id) ?? 0}）`;
    }
    const ids = new Set(snapshot.workPackages.map(wp => wp.id));
    for (const [id, planet] of planets) {
      if (!ids.has(id)) { removeObject(planet.mesh); planets.delete(id); }
    }
    pending = [];
    for (const wp of snapshot.workPackages) {
      if (planets.has(wp.id)) updatePlanet(planets.get(wp.id), wp);
      else pending.push(wp);
    }
    total = snapshot.workPackages.length;
    onProgress(planets.size, total);
  }

  // 全宇宙大量星球分批加入，避免單一畫格卡住；進度回報已呈現／總數。
  function addPendingBatch() {
    if (!pending.length) return;
    for (const wp of pending.splice(0, BATCH_SIZE)) addPlanet(wp);
    onProgress(planets.size, total);
  }

  function updateLabels() {
    for (const planet of planets.values()) {
      const near = camera.position.distanceTo(planet.mesh.position) < LABEL_DISTANCE;
      planet.tag.visible = planet.wp.id === selectedId || near;
    }
  }

  function flyTo({ position, target }) {
    flight = {
      start: performance.now(),
      fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
      toPosition: new THREE.Vector3(...position), toTarget: new THREE.Vector3(...target),
    };
  }

  function setView(next) {
    view = next;
    refreshPlanets();
    flyTo(cameraPreset(view));
  }

  function select(id) {
    selectedId = id;
    fleet.clear();
    refreshPlanets();
  }

  function showShips(id, people) {
    const planet = planets.get(id);
    if (id !== selectedId || !planet) return;
    fleet.show(planet.mesh.position.toArray(), people);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', event => {
    const start = down;
    down = null;
    // 拖曳是旋轉或平移，不是點選。
    if (!start || Math.hypot(event.clientX - start[0], event.clientY - start[1]) > CLICK_TOLERANCE) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets = [
      ...[...galaxies.values()].map(galaxy => galaxy.core),
      ...[...planets.values()].filter(planet => planet.mesh.visible).map(planet => planet.mesh),
    ];
    const [hit] = raycaster.intersectObjects(targets, false);
    if (!hit) return;
    const { kind, id } = hit.object.userData;
    if (kind === 'work-package') onPickWorkPackage(id);
    else onPickProject(id);
  });
  controls.addEventListener('start', () => { flight = null; });

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const initial = cameraPreset(view);
  camera.position.set(...initial.position);
  controls.target.set(...initial.target);

  renderer.setAnimationLoop(time => {
    addPendingBatch();
    if (flight) {
      const t = Math.min((performance.now() - flight.start) / FLIGHT_MS, 1);
      const eased = 1 - (1 - t) ** 3;
      camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
      if (t === 1) flight = null;
    }
    controls.update();
    fleet.update(time);
    updateLabels();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  return { setData, setView, select, showShips, resetView: () => flyTo(cameraPreset(view)) };
}

function createStarfield() {
  const count = 2000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const point = new THREE.Vector3().randomDirection().multiplyScalar(1500 + Math.random() * 1500);
    positions.set(point.toArray(), i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x94a3b8, size: 1.5, sizeAttenuation: false }));
}
```

說明：光暈球體包住星系內的星球，但點選目標只列核心球與可見星球，光暈不會攔截點選。不可見的星球網格會讓 CSS2DRenderer 一併隱藏其標籤（已核對 r170 原始碼的 `hideObject`）。

- [ ] **Step 6：建立** `client/main.mjs`

```js
import { fetchSnapshot, fetchParticipants } from './api.mjs';
import { createStore } from './store.mjs';
import {
  MISSING, legendEntries, projectSummaries, visibleWorkPackages, detailFields, participantsStatus, safeUrl,
} from './view-model.mjs';

const $ = id => document.getElementById(id);

// 所有資料文字一律經 textContent 寫入，不使用 innerHTML。
function el(tag, text, props = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return Object.assign(node, props);
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = !text;
}

async function start() {
  if (!hasWebGL()) {
    showMessage('此瀏覽器或裝置不支援 WebGL，無法顯示 3D 宇宙。請改用支援 WebGL 的桌面瀏覽器。');
    return;
  }
  const { createScene } = await import('./scene.mjs');
  const store = createStore();
  const scene = createScene($('scene'), {
    onPickProject: id => store.showProject(id),
    onPickWorkPackage: id => select(id),
    onProgress: (rendered, total) => {
      $('progress').textContent = rendered < total ? `已呈現 ${rendered} / ${total} 顆星球` : '';
    },
  });

  async function select(id) {
    const token = store.select(id);
    if (!id) return;
    try {
      store.receiveParticipants(token, await fetchParticipants(id));
    } catch (error) {
      store.failParticipants(token, error.message);
    }
  }

  function renderLegend(snapshot) {
    $('legend').replaceChildren(...legendEntries(snapshot).map(entry => {
      const swatch = el('span', null, { className: 'swatch' });
      swatch.style.background = entry.color;
      const item = el('li');
      item.append(swatch, el('span', `${entry.name}（${entry.count}）`));
      return item;
    }));
  }

  function renderProjectOptions(snapshot) {
    $('project-select').replaceChildren(
      el('option', '選擇專案…', { value: '' }),
      ...snapshot.projects.map(project => el('option', project.name, { value: project.id })),
    );
  }

  function renderList({ snapshot, view, selectedId }) {
    const list = $('item-list');
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const buttons = [];
    if (view.mode === 'overview') {
      $('list-title').textContent = '專案';
      for (const project of projectSummaries(snapshot)) {
        const button = el('button', `${project.name}（${project.count}）`, { type: 'button', onclick: () => store.showProject(project.id) });
        button.dataset.key = `project:${project.id}`;
        buttons.push(button);
      }
    } else {
      const project = snapshot.projects.find(item => item.id === view.projectId);
      $('list-title').textContent = view.mode === 'universe' ? '全部工作項目' : `${project?.name ?? MISSING} 的工作項目`;
      for (const wp of visibleWorkPackages(snapshot, view)) {
        const button = el('button', `#${wp.id} ${wp.subject}`, { type: 'button', onclick: () => select(wp.id) });
        button.dataset.key = `wp:${wp.id}`;
        if (wp.id === selectedId) button.setAttribute('aria-current', 'true');
        buttons.push(button);
      }
    }
    const empty = view.mode === 'overview' ? '沒有可見的專案' : '此視圖沒有工作項目';
    list.replaceChildren(...(buttons.length ? buttons : [el('span', empty)]).map(child => {
      const item = el('li');
      item.append(child);
      return item;
    }));
    // 重新繪製清單後保留鍵盤焦點。
    if (focused) buttons.find(button => button.dataset.key === focused)?.focus();
  }

  function renderDetail({ snapshot, selectedId, participants }) {
    const wp = snapshot.workPackages.find(item => item.id === selectedId);
    $('detail-panel').hidden = !wp;
    if (!wp) return;
    const project = snapshot.projects.find(item => item.id === wp.projectId);
    $('detail-title').textContent = `#${wp.id} ${wp.subject}`;
    const href = safeUrl(wp.url);
    const link = el('dd');
    link.append(href ? el('a', '在 OpenProject 開啟', { href, target: '_blank', rel: 'noopener noreferrer' }) : MISSING);
    $('detail-fields').replaceChildren(
      ...detailFields(wp, project?.name).flatMap(([name, value]) => [el('dt', name), el('dd', value)]),
      el('dt', '來源連結'), link,
    );
    $('participants-status').textContent = participantsStatus(participants);
    const people = participants.status === 'ready' ? participants.result.people : [];
    $('participants-list').replaceChildren(...people.map(person =>
      el('li', person.id === null ? `${person.name}（身分不明紀錄）` : person.name)));
  }

  let last = {};
  store.subscribe(state => {
    if (state.snapshot !== last.snapshot) {
      scene.setData(state.snapshot);
      renderLegend(state.snapshot);
      renderProjectOptions(state.snapshot);
      $('mode-badge').textContent = state.snapshot.mode === 'demo' ? '示例資料' : '即時資料';
    }
    if (state.view !== last.view) scene.setView(state.view);
    if (state.selectedId !== last.selectedId) scene.select(state.selectedId);
    if (state.participants !== last.participants && state.participants.status === 'ready') {
      scene.showShips(state.selectedId, state.participants.result.people);
    }
    if (state.snapshot !== last.snapshot || state.view !== last.view || state.selectedId !== last.selectedId) {
      renderList(state);
    }
    renderDetail(state);
    $('project-select').value = state.view.projectId ?? '';
    $('btn-universe').setAttribute('aria-pressed', String(state.view.mode === 'universe'));
    last = state;
  });

  $('btn-overview').onclick = () => store.showOverview();
  $('btn-universe').onclick = () => store.showUniverse();
  $('project-select').onchange = event => {
    if (event.target.value) store.showProject(event.target.value);
    else store.showOverview();
  };
  $('btn-reset').onclick = () => scene.resetView();
  $('btn-close-detail').onclick = () => select(null);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') select(null); });

  showMessage('載入資料中…');
  try {
    const snapshot = await fetchSnapshot();
    store.setSnapshot(snapshot);
    showMessage(snapshot.complete ? '' : '資料未完整載入，畫面可能缺少部分項目。');
  } catch (error) {
    showMessage(`無法載入資料：${error.message}。請確認本機服務已啟動後重新整理頁面。`);
  }
}

start().catch(error => showMessage(`畫面初始化失敗：${error.message}`));
```

- [ ] **Step 7：建立** `client/styles.css`

```css
:root {
  color-scheme: dark;
  --bg: #05060f;
  --panel: rgba(15, 23, 42, 0.88);
  --border: #1e293b;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #a78bfa;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { height: 100%; margin: 0; }
body {
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.5 system-ui, "Microsoft JhengHei", sans-serif;
}
button, select {
  font: inherit;
  color: inherit;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
button:hover, select:hover { border-color: var(--accent); }
button:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button[aria-pressed="true"], button[aria-current="true"] { background: #4c1d95; border-color: var(--accent); }
a { color: #7dd3fc; }
.topbar, .bottombar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--panel);
}
.topbar { border-bottom: 1px solid var(--border); }
.topbar h1 { margin: 0; font-size: 16px; }
.bottombar { border-top: 1px solid var(--border); color: var(--muted); }
.bottombar button { margin-left: auto; }
.nav { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.badge { padding: 2px 8px; border-radius: 999px; background: #78350f; color: #fde68a; font-size: 12px; }
.stage { position: relative; overflow: hidden; min-height: 0; }
.scene, .label-layer { position: absolute; inset: 0; }
.label-layer { pointer-events: none; }
.scene canvas { display: block; }
.panel {
  position: absolute;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  overflow: auto;
}
.panel h2 { margin: 0 0 6px; font-size: 13px; color: var(--muted); }
.panel ul { list-style: none; margin: 0; padding: 0; }
.list-panel { top: 12px; left: 12px; width: 240px; max-height: calc(100% - 230px); }
.list-panel button { width: 100%; margin: 2px 0; text-align: left; }
.detail-panel { top: 12px; right: 12px; width: 300px; max-height: calc(100% - 24px); }
.detail-panel h2 { color: var(--text); font-size: 15px; }
.detail-panel h3 { margin: 10px 0 4px; font-size: 13px; }
.detail-panel dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 8px 0; }
.detail-panel dt { color: var(--muted); }
.detail-panel dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.legend-panel { bottom: 12px; left: 12px; width: 240px; max-height: 190px; }
.legend-panel li { display: flex; align-items: center; gap: 8px; }
.swatch { flex: none; width: 12px; height: 12px; border-radius: 50%; }
.message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 420px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  text-align: center;
  pointer-events: none;
}
.galaxy-label, .planet-label, .ship-label {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(2, 6, 23, 0.7);
  font-size: 12px;
  white-space: nowrap;
}
.galaxy-label { color: #ddd6fe; font-size: 13px; }
.ship-label { color: #7dd3fc; }
@media (max-width: 760px) {
  .topbar { flex-wrap: wrap; }
  .list-panel, .detail-panel { width: calc(100% - 24px); }
  .list-panel { max-height: 30%; }
  .detail-panel { top: auto; bottom: 12px; max-height: 50%; }
  .legend-panel { display: none; }
}
```

窄螢幕隱藏圖例；狀態仍以文字出現在詳情面板。設計文件以桌面為第一版目標。

- [ ] **Step 8：取代** `client/index.html`

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenProject 宇宙 Dashboard</title>
  <link rel="stylesheet" href="/styles.css">
  <script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>
  <script type="module" src="/main.mjs"></script>
</head>
<body>
  <header class="topbar">
    <h1>OpenProject 宇宙</h1>
    <span id="mode-badge" class="badge"></span>
    <nav class="nav" aria-label="視圖切換">
      <button id="btn-overview" type="button">星系總覽</button>
      <label>專案 <select id="project-select"><option value="">選擇專案…</option></select></label>
      <button id="btn-universe" type="button" aria-pressed="false">全宇宙展開</button>
    </nav>
  </header>
  <main class="stage">
    <div id="scene" class="scene" aria-label="3D 宇宙場景"></div>
    <section class="panel list-panel" aria-labelledby="list-title">
      <h2 id="list-title">專案</h2>
      <ul id="item-list"></ul>
    </section>
    <aside id="detail-panel" class="panel detail-panel" aria-live="polite" hidden>
      <h2 id="detail-title"></h2>
      <dl id="detail-fields"></dl>
      <h3>參與者</h3>
      <p id="participants-status"></p>
      <ul id="participants-list"></ul>
      <button id="btn-close-detail" type="button">取消選取（Esc）</button>
    </aside>
    <section class="panel legend-panel" aria-labelledby="legend-title">
      <h2 id="legend-title">狀態圖例</h2>
      <ul id="legend"></ul>
    </section>
    <div id="message" class="message" role="status" hidden></div>
  </main>
  <footer class="bottombar">
    <span>左鍵拖曳旋轉・右鍵拖曳平移・滾輪縮放・點選星系或星球</span>
    <span id="progress"></span>
    <button id="btn-reset" type="button">重設視角</button>
  </footer>
</body>
</html>
```

import map 內容必須與 `server/csp.mjs` 的雜湊來源一致；修改 import map 後需重新啟動服務。

- [ ] **Step 9：語法檢查**

Run: `node --check client/api.mjs && node --check client/ships.mjs && node --check client/scene.mjs && node --check client/main.mjs`
Expected: 無輸出、exit 0（只檢查語法，不執行）。
Run: `npm test` — Expected: 39 pass（25 + 4 + 5 + 5）。

- [ ] **Step 10：提交**

```bash
git add .gitignore package.json package-lock.json client/api.mjs client/ships.mjs client/scene.mjs client/main.mjs client/styles.css client/index.html
git commit -m "feat: add three.js universe frontend"
```

## Task 5：靜態白名單與頁面 CSP

**Files:**
- Create: `tests/csp.test.mjs`、`tests/static-files.test.mjs`、`server/csp.mjs`、`server/static-files.mjs`
- Modify: `tests/http.test.mjs`（新增一個測試）、`server/http.mjs`、`server/index.mjs`

- [ ] **Step 1：撰寫失敗測試** `tests/csp.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pageCsp } from '../server/csp.mjs';

test('allows exactly the inline import map by hash', () => {
  const map = '{"imports":{"three":"/vendor/three.module.js"}}';
  const hash = createHash('sha256').update(map, 'utf8').digest('base64');
  assert.equal(pageCsp(`<head><script type="importmap">${map}</script></head>`),
    `default-src 'self'; script-src 'self' 'sha256-${hash}'`);
  assert.throws(() => pageCsp('<head></head>'), { message: 'index.html must contain exactly one import map' });
  assert.throws(() => pageCsp('<script type="importmap">{}</script><script type="importmap">{}</script>'),
    { message: 'index.html must contain exactly one import map' });
});
test('the real page maps three to the vendored module', async () => {
  const html = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
  assert.match(pageCsp(html), /^default-src 'self'; script-src 'self' 'sha256-[A-Za-z0-9+/]+=*'$/);
  const [, map] = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.deepEqual(JSON.parse(map), { imports: { three: '/vendor/three.module.js' } });
});
```

- [ ] **Step 2：撰寫失敗測試** `tests/static-files.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticFiles, assertStaticFiles } from '../server/static-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('whitelist covers the client and vendored three files, and they exist', async () => {
  const files = createStaticFiles(root);
  assert.equal(files['/'].path, join(root, 'client', 'index.html'));
  assert.equal(files['/'].type, 'text/html; charset=utf-8');
  assert.equal(files['/main.mjs'].type, 'text/javascript; charset=utf-8');
  assert.equal(files['/styles.css'].type, 'text/css; charset=utf-8');
  assert.equal(files['/shared/layout.mjs'].path, join(root, 'shared', 'layout.mjs'));
  assert.equal(files['/vendor/three.module.js'].path, join(root, 'node_modules', 'three', 'build', 'three.module.js'));
  for (const url of Object.keys(files)) {
    assert.ok(!/config|package|server|\.\./.test(url), url);
  }
  await assertStaticFiles(files);
});
test('missing static files fail with only the public path', async () => {
  const files = { '/gone.mjs': { path: join(root, 'does-not-exist', 'gone.mjs'), type: 'text/javascript; charset=utf-8' } };
  await assert.rejects(assertStaticFiles(files), { message: 'Missing static file for /gone.mjs; run npm install' });
});
```

- [ ] **Step 3：在** `tests/http.test.mjs` **末尾新增測試**（沿用檔案內既有的 `withServer`、`send`、`demo` 與 fs 匯入）

```js
test('static entries can carry their own CSP', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-csp-'));
  try {
    const page = join(dir, 'index.html');
    await writeFile(page, '<!doctype html>');
    const csp = "default-src 'self'; script-src 'self' 'sha256-abc='";
    const staticFiles = { '/': { path: page, type: 'text/html; charset=utf-8', csp } };
    await withServer({ ...demo(), staticFiles }, async port => {
      assert.equal((await send(port, '/')).headers['content-security-policy'], csp);
      assert.equal((await send(port, '/api/health')).headers['content-security-policy'], "default-src 'self'");
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4：確認失敗** — Run: `npm test`
Expected: csp 與 static-files 兩檔 `ERR_MODULE_NOT_FOUND`；http 新測試因 CSP 仍為 `default-src 'self'` 而失敗；其餘通過。

- [ ] **Step 5：實作** `server/csp.mjs`

```js
import { createHash } from 'node:crypto';

// 頁面只允許本機腳本，再以雜湊放行 index.html 內唯一的 import map。
export function pageCsp(html) {
  const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
  if (maps.length !== 1) throw new Error('index.html must contain exactly one import map');
  const hash = createHash('sha256').update(maps[0][1], 'utf8').digest('base64');
  return `default-src 'self'; script-src 'self' 'sha256-${hash}'`;
}
```

- [ ] **Step 6：實作** `server/static-files.mjs`

```js
import { access } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// 公開路徑 → 專案內檔案；只有列在這裡的檔案會被提供。
const entries = {
  '/': 'client/index.html',
  '/main.mjs': 'client/main.mjs',
  '/api.mjs': 'client/api.mjs',
  '/store.mjs': 'client/store.mjs',
  '/view-model.mjs': 'client/view-model.mjs',
  '/layout-3d.mjs': 'client/layout-3d.mjs',
  '/scene.mjs': 'client/scene.mjs',
  '/ships.mjs': 'client/ships.mjs',
  '/styles.css': 'client/styles.css',
  '/shared/layout.mjs': 'shared/layout.mjs',
  '/vendor/three.module.js': 'node_modules/three/build/three.module.js',
  '/vendor/OrbitControls.js': 'node_modules/three/examples/jsm/controls/OrbitControls.js',
  '/vendor/CSS2DRenderer.js': 'node_modules/three/examples/jsm/renderers/CSS2DRenderer.js',
};

export function createStaticFiles(root) {
  return Object.fromEntries(Object.entries(entries).map(([url, file]) =>
    [url, { path: resolve(root, file), type: types[extname(file)] }]));
}

export async function assertStaticFiles(staticFiles) {
  for (const [url, file] of Object.entries(staticFiles)) {
    try {
      await access(file.path);
    } catch {
      throw new Error(`Missing static file for ${url}; run npm install`);
    }
  }
}
```

- [ ] **Step 7：修改** `server/http.mjs`

把開頭的 `baseHeaders` 改為不含 CSP，並新增預設 CSP 常數：

```js
const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const defaultCsp = "default-src 'self'";
```

靜態檔分支改為傳入該項目的 CSP：

```js
    return send(req, res, 200, file.type, await readFile(file.path), file.csp);
```

`send` 改為：

```js
function send(req, res, status, type, body, csp = defaultCsp) {
  res.writeHead(status, {
    ...baseHeaders, 'Content-Security-Policy': csp, 'Content-Type': type, 'Content-Length': body.length,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}
```

- [ ] **Step 8：修改** `server/index.mjs` 為：

```js
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.mjs';
import { pageCsp } from './csp.mjs';
import { createDemoSource } from './demo.mjs';
import { createHandler, listen } from './http.mjs';
import { assertStaticFiles, createStaticFiles } from './static-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  // 相對路徑以專案根目錄為基準，與執行時所在目錄無關。
  const { values } = parseArgs({ options: { config: { type: 'string', default: 'config/local.json' } } });
  const config = await loadConfig(resolve(root, values.config));
  if (config.mode !== 'demo') {
    throw new Error('Live mode is not implemented yet; use demo mode until the OpenProject adapter is available');
  }
  const staticFiles = createStaticFiles(root);
  await assertStaticFiles(staticFiles);
  staticFiles['/'].csp = pageCsp(await readFile(staticFiles['/'].path, 'utf8'));
  const handler = createHandler({ source: createDemoSource(), mode: config.mode, staticFiles });
  const server = await listen(handler, { host: config.host, port: config.port });
  console.log(`示例模式已啟動：http://${config.host}:${config.port}/`);
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

- [ ] **Step 9：確認通過** — Run: `npm test`；Expected: 44 pass、0 fail（39 + csp 2 + static-files 2 + http 1）
- [ ] **Step 10：提交**

```bash
git add tests/csp.test.mjs tests/static-files.test.mjs tests/http.test.mjs server/csp.mjs server/static-files.mjs server/http.mjs server/index.mjs
git commit -m "feat: serve frontend whitelist with import-map CSP"
```

## Task 6：瀏覽器驗證與交接（主控執行）

- [ ] **Step 1：** 背景啟動 `npm run demo`，以瀏覽器工具開啟 http://127.0.0.1:4173/ ，逐項核對並截圖：
  1. 主控台無錯誤、無 CSP 違規；頂部徽章為「示例資料」。
  2. 總覽顯示 3 個星系與名稱標籤（含「空專案（0）」）；圖例 4 個狀態含「未知狀態（1）」。
  3. 點選「星圖平台」星系（或清單按鈕）→ 鏡頭飛入，清單顯示 3 個工作項目、星球帶標題。
  4. 選 #1002 → 詳情描述顯示字面文字 `<b>示例：此字串不應被當成 HTML</b>`（沒有變粗體）；參與者 1 人；星球旁 1 艘太空船與名字。
  5. 選 #1001 → 3 艘太空船（林小美、Alex、陳大文），切換時前一組消失。
  6. 全宇宙展開保留選取；選專案「太空站維運」→ #1004 顯示「名單可能不完整」、「已刪除使用者（身分不明紀錄）」、狀態「未知狀態」。
  7. #1003 顯示「負責人 未指派」、「更新時間 未提供」，同名 Alex 兩人分列。
  8. 拖曳旋轉、右鍵平移、滾輪縮放可用；「重設視角」回到該視圖預設；「星系總覽」解除選取；Esc 取消選取。
  9. 以 Tab 走過清單按鈕並按 Enter 可選取；焦點在重新繪製後保留。
- [ ] **Step 2：** 停止服務並確認 4173 不再監聽；`git status --short` 乾淨、無 `node_modules/`。
- [ ] **Step 3：** 規格審查（主控對照本計畫）＋整個階段一次程式碼品質審查（審查代理），處理發現並重跑 `npm test`。
- [ ] **Step 4：** 在 `handoff.md` 追加實際結果（含未驗證項目，例如無 WebGL 提示若無法在工具中模擬則列為未驗證），提交 `docs: record 3d frontend phase results`。

## 自我審閱紀錄

- 規格覆蓋：三種視圖（store 視圖狀態＋scene 鏡頭）、旋轉／平移／縮放（OrbitControls）、返回總覽／專案切換／重設視角（頂部與底部按鈕）、點選詳情與來源連結（renderDetail，非 http(s) 連結不產生）、狀態著色與圖例（materialFor＋legendEntries）、選取才顯示太空船並按 ID 去重（後端 collectParticipants＋ships）、多人時半徑增加（shipPosition）、面板保留完整名單、遠處隱藏標籤（LABEL_DISTANCE）、全宇宙分批載入與進度（BATCH_SIZE＋onProgress）、無 WebGL 提示（hasWebGL）、鍵盤可操作清單、不注入 HTML（textContent）。
- 路線契約：一般快照更新按 ID 增刪物件，不重建控制器；過時參與者回應以 token 拒絕；只有完整快照才解除選取。第五階段的輪詢可直接呼叫 `store.setSnapshot`。
- CSP：維持 `default-src 'self'`，只以雜湊放行 import map；Three.js 由本機白名單提供，不使用外部 CDN。
- 型別一致性：`createScene` 回傳 `setData/setView/select/showShips/resetView`，main 只用這五個；`store.select` 回傳 token 給 `receiveParticipants/failParticipants`；`staticFiles` 項目為 `{ path, type, csp? }`。
- 延後：輪詢／手動更新與過期提示（第五階段）、1,000 筆效能（第六階段）、自動化瀏覽器測試（以主控瀏覽器驗證替代並記錄）。
