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
