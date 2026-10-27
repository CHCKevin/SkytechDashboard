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
test('refresh spacing counts from when the previous load finished', async () => {
  let clock;
  const base = fixtureRoutes();
  const routes = fixtureRoutes({ '/api/v3/work_packages': url => { clock.advance(12_000); return base(url); } });
  await withLoader(routes, async context => {
    ({ clock } = context);
    await context.loader.getSnapshot();
    await context.loader.getSnapshot({ refresh: true });
    assert.equal(statusRequests(context.fake), 1);
  });
});
