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

test('send success records the exact path and body of every request', async () => {
  await withFake(() => ({ status: 201, body: { id: 1 } }), async fake => {
    const client = clientFor(fake);
    await client.send('POST', '/api/v3/time_entries', { a: 1 });
    await client.send('POST', '/api/v3/time_entries/form', { b: 2 });
    await client.send('PATCH', '/api/v3/time_entries/12', { c: 3 });
    assert.deepEqual(fake.requests.map(({ method, path, body }) => ({ method, path, body })), [
      { method: 'POST', path: '/api/v3/time_entries', body: { a: 1 } },
      { method: 'POST', path: '/api/v3/time_entries/form', body: { b: 2 } },
      { method: 'PATCH', path: '/api/v3/time_entries/12', body: { c: 3 } },
    ]);
  });
});
test('send rejects foreign origins as unsafe_link without contacting anything', async () => {
  await withFake(() => ({ body: {} }), async fake => {
    const client = clientFor(fake);
    await rejectsWith(client.send('POST', '//evil.test/api/v3/time_entries', {}), 'unsafe_link');
    await rejectsWith(client.send('POST', 'http://evil.test/api/v3/time_entries', {}), 'unsafe_link');
    assert.equal(fake.requests.length, 0);
  });
});
test('send rejects near-miss write targets as unsafe_write without contacting the server', async () => {
  await withFake(() => ({ body: {} }), async fake => {
    const client = clientFor(fake);
    for (const [method, path] of [
      ['POST', '/api/v3/time_entries/'], ['POST', '/api/v3/time_entries%2F1'], ['PATCH', '/api/v3/time_entries/abc'],
      ['PATCH', '/api/v3/time_entries/١٢'], ['post', '/api/v3/time_entries'], ['POST', '/api/v3/time_entries?'],
      ['POST', '/api/v3/time_entries#x'], ['PATCH', '/api/v3/time_entries/1/../../work_packages/1'],
    ]) {
      await rejectsWith(client.send(method, path, {}), 'unsafe_write');
    }
    // 路徑大小寫不同在 resolve 階段就因不在 /api/v3 底下而被擋，所以是 unsafe_link。
    await rejectsWith(client.send('POST', '/API/v3/time_entries', {}), 'unsafe_link');
    assert.equal(fake.requests.length, 0);
  });
});
test('a traversal that normalises onto an allowed path is sent to the normalised path', async () => {
  await withFake(() => ({ status: 201, body: {} }), async fake => {
    await clientFor(fake).send('POST', '/api/v3/x/../time_entries', {});
    assert.equal(fake.requests.length, 1);
    assert.equal(fake.requests[0].path, '/api/v3/time_entries');
  });
});
test('writes are never retried, including after a dropped connection', async () => {
  for (const [status, code] of [[429, 'rate_limited'], [502, 'upstream_error'], [504, 'upstream_error']]) {
    await withFake(() => ({ status }), async fake => {
      await rejectsWith(clientFor(fake).send('POST', '/api/v3/time_entries', {}), code);
      assert.equal(fake.requests.length, 1);
    });
  }
  await withFake((url, req) => { req.socket.destroy(); return { status: 200, body: {}, delayMs: 300 }; }, async fake => {
    await assert.rejects(clientFor(fake, { timeoutMs: 50 }).send('POST', '/api/v3/time_entries', {}),
      error => error instanceof SourceError && ['network', 'timeout'].includes(error.code));
    assert.equal(fake.requests.length, 1);
  });
});
test('write redirects are not followed', async () => {
  await withFake(() => ({ status: 302, headers: { Location: '/api/v3/time_entries/999' } }), async fake => {
    await rejectsWith(clientFor(fake).send('POST', '/api/v3/time_entries', {}), 'unexpected_redirect');
    assert.equal(fake.requests.length, 1);
  });
});
test('a successful write with an unreadable body is write_unconfirmed', async () => {
  await withFake(() => ({ status: 201, body: 'not json' }), async fake => {
    await rejectsWith(clientFor(fake).send('POST', '/api/v3/time_entries', {}), 'write_unconfirmed');
  });
  await withFake(() => ({ status: 201, body: '{"a":', headers: { 'Content-Length': '100', Connection: 'close' } }), async fake => {
    await rejectsWith(clientFor(fake).send('POST', '/api/v3/time_entries', {}), 'write_unconfirmed');
    assert.equal(fake.requests.length, 1);
  });
});
test('validation messages fall back to the top-level message and are bounded', async () => {
  const validation = body => withFake(() => ({ status: 422, body }), async fake => {
    await assert.rejects(clientFor(fake).send('POST', '/api/v3/time_entries', {}), error => {
      validation.got = error;
      return error.code === 'validation';
    });
  });
  await validation({ message: 'Top.', _embedded: { errors: [{ message: 1 }, { foo: 'x' }, null] } });
  assert.equal(validation.got.message, 'Top.');
  await validation({ message: 'x'.repeat(600) });
  assert.equal(validation.got.message, 'x'.repeat(500));
  await validation({ message: 42, _embedded: { errors: [{ message: { a: 1 } }] } });
  assert.equal(validation.got.message, 'OpenProject 拒絕了這筆資料');
});
