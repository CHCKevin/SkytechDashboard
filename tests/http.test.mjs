import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { connect } from 'node:net';
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
test('HEAD on a missing path returns 404 headers without a body', async () => {
  await withServer(demo(), async port => {
    const res = await send(port, '/missing', { method: 'HEAD' });
    assert.equal(res.status, 404);
    assert.equal(res.body, '');
    assert.ok(Number(res.headers['content-length']) > 0);
  });
});
test('config, source files, and traversal paths are never served', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-static-'));
  try {
    const page = join(dir, 'index.html');
    await writeFile(page, '<!doctype html><title>t</title>');
    await writeFile(join(dir, 'secret.json'), '{"apiToken":"FAKE_TOKEN_123"}');
    const staticFiles = { '/': { path: page, type: 'text/html; charset=utf-8' } };
    await withServer({ ...demo(), staticFiles }, async port => {
      assert.equal((await send(port, '/')).status, 200);
      for (const path of ['/secret.json', '/index.html', '/../secret.json', '/%2e%2e/secret.json',
        '/config/local.json', '/config/example.json', '/server/config.mjs',
        '/package.json', '/client/index.html', '/../config/local.json',
        '/%2e%2e/config/local.json', '/api/../config/local.json', '/.git/config']) {
        const res = await send(port, path);
        assert.equal(res.status, 404, path);
        assert.equal(res.json.error.code, 'not_found', path);
      }
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('rejects request targets that are not origin-form paths', async () => {
  await withServer(demo(), async port => {
    for (const path of ['//evil/api/health', 'http://evil.test/api/health', '/\\api/health']) {
      const res = await send(port, path, { headers: { host: `127.0.0.1:${port}` } });
      assert.equal(res.status, 400, path);
      assert.equal(res.json.error.code, 'invalid_request_target', path);
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
    const upper = await send(port, '/api/health', { headers: { host: `LOCALHOST:${port}` } });
    assert.equal(upper.status, 200);
    // HTTP/1.0 不要求 Host，Node 不會先擋下，因此能驗證缺少 Host 時的處理。
    const statusLine = await new Promise((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => socket.write('GET /api/health HTTP/1.0\r\n\r\n'));
      let data = '';
      socket.on('data', chunk => { data += chunk; });
      socket.on('end', () => resolve(data.split('\r\n')[0]));
      socket.on('error', reject);
    });
    assert.match(statusLine, /^HTTP\/1\.[01] 403 /);
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
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    await withServer({ source, mode: 'demo' }, async port => {
      for (const path of ['/api/snapshot', '/api/work-packages/1/participants']) {
        const res = await send(port, path);
        assert.equal(res.status, 500, path);
        assert.deepEqual(res.json, { error: { code: 'internal_error', message: '伺服器內部錯誤' } });
        assert.ok(!res.body.includes('SECRET'));
      }
    });
  } finally {
    console.error = original;
  }
  assert.equal(logged.length, 2);
  const output = logged.join('\n');
  assert.ok(!output.includes('SECRET'));
  assert.ok(!output.includes('FAKE_TOKEN_123'));
});
