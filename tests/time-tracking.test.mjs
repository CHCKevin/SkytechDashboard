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
