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
test('inconsistent pages are re-read once before failing', async () => {
  let round = 0;
  await withFake(url => {
    if (url.searchParams.get('offset') === '1') round += 1;
    return url.searchParams.get('offset') === '2'
      ? { body: collection(round === 1 ? [{ id: 2 }] : [{ id: 3 }], { total: 3 }) }
      : { body: collection([{ id: 1 }, { id: 2 }], { total: 3, next: '/api/v3/projects?offset=2&pageSize=2' }) };
  }, async fake => {
    const items = await clientFor(fake).getAll('/api/v3/projects', { pageSize: 2 });
    assert.deepEqual(items.map(item => item.id), [1, 2, 3]);
    assert.equal(fake.requests.length, 4);
  });
});
test('a connection dropped while reading the body is a network error', async () => {
  await withFake(() => ({ body: '{"a":', headers: { 'Content-Length': '100', Connection: 'close' } }), async fake => {
    await rejectsWith(clientFor(fake).getJson('/api/v3'), 'network');
  });
});
