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
test('createEntry reports an unreadable 2xx response as write_unconfirmed', async () => {
  await withSource((url, req) => (req.method === 'GET' ? { body: wpHal(202) } : { status: 201, body: { id: 1, hours: 'garbage' } }), async source => {
    await assert.rejects(source.createEntry({ workPackageId: 202, date: '2026-11-16', hours: 1, activityId: null, comment: '' }),
      error => error.code === 'write_unconfirmed');
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
test('createEntry keeps definite OpenProject rejections as they are, not write_unconfirmed', async () => {
  // 只有「已送達後無法解讀」才是不確定；OpenProject 明確拒絕時必須保留原本的錯誤代碼，前端才會讓使用者修正後重送。
  for (const [status, body, code] of [
    [422, { _type: 'Error', message: 'Hours can\'t be blank.' }, 'validation'],
    [403, {}, 'forbidden'],
  ]) {
    await withSource((url, req) => (req.method === 'GET' ? { body: wpHal(202) } : { status, body }), async source => {
      await assert.rejects(source.createEntry({ workPackageId: 202, date: '2026-11-16', hours: 1, activityId: null, comment: '' }),
        error => error.code === code);
    });
  }
});

const userHal = (id, name) => ({ _type: 'User', id, name, _links: { self: { href: `/api/v3/users/${id}` } } });
const withUser = (id, overrides = {}) => {
  const hal = entryHal(overrides);
  return { ...hal, _links: { ...hal._links, user: { href: `/api/v3/users/${id}`, title: `U${id}` } } };
};

test('searchUsers filters principals by name and user type', async () => {
  await withSource(() => ({ body: collection([userHal(18, '陳甲'), userHal(23, '陳乙')]) }), async (source, fake) => {
    assert.deepEqual(await source.searchUsers('陳'), [{ id: 18, name: '陳甲' }, { id: 23, name: '陳乙' }]);
    const req = fake.requests[0];
    assert.equal(req.method, 'GET');
    assert.equal(req.path, '/api/v3/principals');
    assert.equal(req.search.get('pageSize'), '10');
    assert.deepEqual(JSON.parse(req.search.get('filters')), [
      { name: { operator: '~', values: ['陳'] } }, { type: { operator: '=', values: ['User'] } },
    ]);
  });
});
test('searchUsers with an empty term does not call OpenProject', async () => {
  await withSource(() => ({ body: collection([]) }), async (source, fake) => {
    assert.deepEqual(await source.searchUsers(''), []);
    assert.equal(fake.requests.length, 0);
  });
});
test('searchUsers rejects a response without elements', async () => {
  await withSource(() => ({ body: { _type: 'Collection' } }), async source => {
    await assert.rejects(source.searchUsers('x'), { code: 'invalid_response' });
  });
});
test('getUser returns id and name, and reports a missing user', async () => {
  await withSource(url => (url.pathname === '/api/v3/users/18' ? { body: userHal(18, '陳甲') } : { status: 404, body: {} }), async source => {
    assert.deepEqual(await source.getUser(18), { id: 18, name: '陳甲' });
    await assert.rejects(source.getUser(99), { code: 'not_found' });
  });
});
test('listEntriesForUsers filters by users and day and tags each entry with its user', async () => {
  await withSource(() => ({ body: collection([withUser(18), withUser(23, { id: 2760, hours: 'PT1H' })]) }), async (source, fake) => {
    const entries = await source.listEntriesForUsers('2026-11-13', [18, 23]);
    assert.deepEqual(entries.map(entry => [entry.userId, entry.id, entry.hours, entry.workPackageId]), [[18, 2759, 2.5, 202], [23, 2760, 1, 202]]);
    const req = fake.requests[0];
    assert.equal(req.method, 'GET');
    assert.equal(req.path, '/api/v3/time_entries');
    assert.deepEqual(JSON.parse(req.search.get('filters')), [
      { user: { operator: '=', values: ['18', '23'] } }, { spentOn: { operator: '=d', values: ['2026-11-13'] } },
    ]);
    assert.equal(req.search.get('sortBy'), '[["id","asc"]]');
  });
});
test('listEntriesForUsers with no users does not call OpenProject', async () => {
  await withSource(() => ({ body: collection([]) }), async (source, fake) => {
    assert.deepEqual(await source.listEntriesForUsers('2026-11-13', []), []);
    assert.equal(fake.requests.length, 0);
  });
});
test('listEntriesForUsers rejects an entry without a user link', async () => {
  await withSource(() => ({ body: collection([entryHal()]) }), async source => {
    await assert.rejects(source.listEntriesForUsers('2026-11-13', [18]), { code: 'invalid_response' });
  });
});
