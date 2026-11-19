import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { connect } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHandler, listen } from '../server/http.mjs';
import { createDemoSource } from '../server/demo.mjs';
import { createQuestStore } from '../server/quests.mjs';
import { createHallStore, HallStoreError } from '../server/hall.mjs';
import { SourceError } from '../server/openproject/errors.mjs';

const CSP = "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

async function withServer(overrides, run) {
  const dir = await mkdtemp(join(tmpdir(), 'http-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>t</title>');
  const options = {
    source: createDemoSource({ today: '2026-11-16' }), quests: createQuestStore(join(dir, 'quests.json')),
    hall: createHallStore(join(dir, 'hall.json')), leaveWorkPackageId: 200,
    mode: 'demo', dailyTargetHours: 8,
    staticFiles: { '/': { path: join(dir, 'index.html'), type: 'text/html; charset=utf-8' } },
    ...overrides,
  };
  const server = await listen(createHandler(options), { host: '127.0.0.1', port: 0 });
  try {
    await run(server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

function send(port, path, { method = 'GET', headers = {}, body, setHost } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers, setHost }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const isJson = (res.headers['content-type'] ?? '').startsWith('application/json');
        resolve({ status: res.statusCode, headers: res.headers, json: isJson && text ? JSON.parse(text) : null, text });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// 模擬瀏覽器同源寫入：自訂標頭＋同源 Origin＋JSON。
const write = (port, path, method, body) => send(port, path, {
  method, body,
  headers: { 'X-Quest-Board': '1', Origin: `http://127.0.0.1:${port}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
});

test('health, me and config', async () => {
  await withServer({}, async port => {
    const health = await send(port, '/api/health');
    assert.deepEqual(health.json, { status: 'ok', mode: 'demo' });
    assert.equal(health.headers['cache-control'], 'no-store');
    assert.equal(health.headers['x-content-type-options'], 'nosniff');
    assert.equal(health.headers['content-security-policy'], CSP);
    assert.deepEqual((await send(port, '/api/me')).json, { id: 1, name: '示例冒險者' });
    assert.deepEqual((await send(port, '/api/config')).json, { dailyTargetHours: 8, openProjectUrl: null });
  });
});
test('config exposes the OpenProject origin for report links', async () => {
  await withServer({ mode: 'live', openProjectUrl: 'http://op.example:8080' }, async port => {
    assert.deepEqual((await send(port, '/api/config')).json, { dailyTargetHours: 8, openProjectUrl: 'http://op.example:8080' });
  });
});
test('time entries CRUD through the API', async () => {
  await withServer({}, async port => {
    const list = await send(port, '/api/time-entries?date=2026-11-16');
    assert.equal(list.status, 200);
    assert.equal(list.json.length, 2);
    const created = await write(port, '/api/time-entries', 'POST', { workPackageId: 2310, date: '2026-11-16', hours: 2 });
    assert.equal(created.status, 201);
    assert.equal(created.json.workPackageSubject, '匯出報表效能問題');
    const patched = await write(port, `/api/time-entries/${created.json.id}`, 'PATCH', { hours: 3 });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.hours, 3);
    const removed = await write(port, `/api/time-entries/${created.json.id}`, 'DELETE');
    assert.equal(removed.status, 204);
    assert.equal((await send(port, '/api/time-entries?date=2026-11-16')).json.length, 2);
  });
});
test('input errors are 400 with the field', async () => {
  await withServer({}, async port => {
    const badDate = await send(port, '/api/time-entries?date=2026-02-30');
    assert.equal(badDate.status, 400);
    assert.equal(badDate.json.error.field, 'date');
    const badHours = await write(port, '/api/time-entries', 'POST', { workPackageId: 1234, date: '2026-11-16', hours: 0 });
    assert.equal(badHours.status, 400);
    assert.deepEqual(Object.keys(badHours.json.error).sort(), ['code', 'field', 'message']);
    assert.equal(badHours.json.error.field, 'hours');
    assert.equal((await write(port, '/api/time-entries/abc', 'DELETE')).status, 400);
    const badJson = await send(port, '/api/time-entries', { method: 'POST', body: '{oops',
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json' } });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.json.error.code, 'invalid_json');
  });
});
test('source errors map to status codes', async () => {
  await withServer({}, async port => {
    const missing = await write(port, '/api/time-entries', 'POST', { workPackageId: 999, date: '2026-11-16', hours: 1 });
    assert.equal(missing.status, 404);
    const invalid = await write(port, '/api/time-entries', 'POST', { workPackageId: 1234, date: '2026-11-16', hours: 1, activityId: 77 });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.json.error.code, 'validation');
  });
  const failing = { getMe: async () => { throw new SourceError('unauthorized'); } };
  await withServer({ source: failing }, async port => {
    const res = await send(port, '/api/me');
    assert.equal(res.status, 502);
    assert.equal(res.json.error.code, 'unauthorized');
  });
  const crashing = { getMe: async () => { throw new Error('SECRET_TOKEN in stack'); } };
  await withServer({ source: crashing }, async port => {
    const res = await send(port, '/api/me');
    assert.equal(res.status, 500);
    assert.ok(!res.text.includes('SECRET_TOKEN'));
  });
});
test('search and activities', async () => {
  await withServer({}, async port => {
    const found = await send(port, `/api/work-packages/search?q=${encodeURIComponent('#2051')}`);
    assert.equal(found.json[0].id, 2051);
    assert.deepEqual((await send(port, '/api/work-packages/search?q=')).json, []);
    const activities = await send(port, '/api/activities?workPackageId=1234');
    assert.ok(activities.json.length > 0);
    assert.equal((await send(port, '/api/activities')).status, 400);
  });
});
test('quests: pin with subject and activity name, re-pin updates, unpin', async () => {
  await withServer({}, async port => {
    assert.deepEqual((await send(port, '/api/quests')).json, []);
    const pinned = await write(port, '/api/quests', 'POST', { workPackageId: 1234, activityId: 3 });
    assert.equal(pinned.status, 200);
    assert.deepEqual(pinned.json, [{ workPackageId: 1234, subject: '前端登入頁改版', activityId: 3, activityName: 'Development' }]);
    const repinned = await write(port, '/api/quests', 'POST', { workPackageId: 1234 });
    assert.deepEqual(repinned.json, [{ workPackageId: 1234, subject: '前端登入頁改版', activityId: null, activityName: null }]);
    assert.equal((await write(port, '/api/quests', 'POST', { workPackageId: 1234, activityId: 77 })).status, 400);
    assert.equal((await write(port, '/api/quests', 'POST', { workPackageId: 999 })).status, 404);
    assert.deepEqual((await write(port, '/api/quests/1234', 'DELETE')).json, []);
  });
});
test('corrupt quest file is a 500 with a clear code', async () => {
  const quests = { list: async () => { const { QuestStoreError } = await import('../server/quests.mjs'); throw new QuestStoreError(); } };
  await withServer({ quests }, async port => {
    const res = await send(port, '/api/quests');
    assert.equal(res.status, 500);
    assert.equal(res.json.error.code, 'quests_corrupt');
  });
});
test('writes require the custom header, same origin, JSON and a small body', async () => {
  await withServer({}, async port => {
    const body = { workPackageId: 1234, date: '2026-11-16', hours: 1 };
    const noHeader = await send(port, '/api/time-entries', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    assert.equal(noHeader.status, 403);
    assert.equal(noHeader.json.error.code, 'csrf_rejected');
    const foreign = await send(port, '/api/time-entries', { method: 'POST', body,
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json', Origin: 'http://evil.test' } });
    assert.equal(foreign.status, 403);
    const noOrigin = await send(port, '/api/time-entries', { method: 'POST', body,
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json' } });
    assert.equal(noOrigin.status, 201);
    const localhost = await send(port, '/api/time-entries', { method: 'POST', body,
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json', Origin: `http://localhost:${port}` } });
    assert.equal(localhost.status, 201);
    const text = await send(port, '/api/time-entries', { method: 'POST', body,
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'text/plain' } });
    assert.equal(text.status, 415);
    const big = await send(port, '/api/time-entries', { method: 'POST', body: JSON.stringify({ comment: 'x'.repeat(17 * 1024) }),
      headers: { 'X-Quest-Board': '1', 'Content-Type': 'application/json' } });
    assert.equal(big.status, 413);
  });
});
test('host check, method handling and static files', async () => {
  await withServer({}, async port => {
    const rebinding = await send(port, '/api/health', { headers: { Host: 'evil.test' } });
    assert.equal(rebinding.status, 403);
    const wrongMethod = await write(port, '/api/me', 'POST', {});
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.allow, 'GET');
    const entryMethod = await write(port, '/api/time-entries/5', 'PUT', {});
    assert.equal(entryMethod.status, 405);
    assert.equal(entryMethod.headers.allow, 'PATCH, DELETE');
    assert.equal((await send(port, '/api/nope')).status, 404);
    const page = await send(port, '/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /^text\/html/);
    assert.equal(page.headers['content-security-policy'], CSP);
    assert.equal((await send(port, '/', { method: 'HEAD' })).text, '');
    assert.equal((await write(port, '/', 'POST', {})).status, 405);
    assert.equal((await send(port, '/missing.js')).status, 404);
  });
});

function rawRequest(port, text) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(text));
    const chunks = [];
    socket.on('data', chunk => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('close', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve({ status: Number(/^HTTP\/1\.\d (\d+)/.exec(raw)?.[1]), raw });
    });
  });
}

test('Sec-Fetch-Site cross-site is rejected on every /api request; CORP on all responses', async () => {
  await withServer({}, async port => {
    const cross = await send(port, '/api/me', { headers: { 'Sec-Fetch-Site': 'Cross-Site' } });
    assert.equal(cross.status, 403);
    assert.equal(cross.json.error.code, 'csrf_rejected');
    for (const value of ['same-origin', 'same-site', 'none']) {
      assert.equal((await send(port, '/api/me', { headers: { 'Sec-Fetch-Site': value } })).status, 200);
    }
    const api = await send(port, '/api/health');
    assert.equal(api.headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal(cross.headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal((await send(port, '/')).headers['cross-origin-resource-policy'], 'same-origin');
  });
});

test('rejected writes never reach the source', async () => {
  const calls = [];
  const real = createDemoSource({ today: '2026-11-16' });
  const source = { ...real, createEntry: async input => { calls.push(input); return real.createEntry(input); } };
  await withServer({ source }, async port => {
    const body = { workPackageId: 1234, date: '2026-11-16', hours: 1 };
    const json = { 'Content-Type': 'application/json' };
    const custom = { 'X-Quest-Board': '1' };
    const cases = [
      ['no custom header', { headers: json }, 403],
      ['foreign origin', { headers: { ...custom, ...json, Origin: 'http://evil.test' } }, 403],
      ['null origin', { headers: { ...custom, ...json, Origin: 'null' } }, 403],
      ['upper-case foreign origin', { headers: { ...custom, ...json, Origin: 'HTTP://EVIL.TEST' } }, 403],
      ['text/plain without header (sendBeacon)', { headers: { 'Content-Type': 'text/plain' } }, 403],
      ['text/plain with header', { headers: { ...custom, 'Content-Type': 'text/plain' } }, 415],
      ['application/jsonp', { headers: { ...custom, 'Content-Type': 'application/jsonp' } }, 415],
      ['oversized body', { headers: { ...custom, ...json }, body: JSON.stringify({ comment: 'x'.repeat(17 * 1024) }) }, 413],
      ['Sec-Fetch-Site cross-site', { headers: { ...custom, ...json, 'Sec-Fetch-Site': 'cross-site' } }, 403],
    ];
    for (const [name, options, status] of cases) {
      const res = await send(port, '/api/time-entries', { method: 'POST', body, ...options });
      assert.equal(res.status, status, name);
    }
    assert.equal(calls.length, 0);
    const upper = await send(port, '/api/time-entries', { method: 'POST', body,
      headers: { ...custom, ...json, Origin: `HTTP://127.0.0.1:${port}` } });
    assert.equal(upper.status, 201);
    assert.equal(calls.length, 1);
  });
});

test('request boundary cases', async () => {
  await withServer({}, async port => {
    const options = await send(port, '/api/time-entries', { method: 'OPTIONS' });
    assert.equal(options.status, 405);
    assert.deepEqual(Object.keys(options.headers).filter(name => name.startsWith('access-control-')), []);

    const noHost = await send(port, '/api/health', { setHost: false });
    assert.ok([400, 403].includes(noHost.status), `missing Host (HTTP/1.1) got ${noHost.status}`);
    assert.equal((await rawRequest(port, 'GET /api/health HTTP/1.0\r\n\r\n')).status, 403);
    assert.equal((await send(port, '/api/health', { headers: { Host: `127.0.0.1:${port + 1}` } })).status, 403);

    assert.equal((await rawRequest(port, `GET //x HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`)).status, 400);
    assert.equal((await rawRequest(port, `GET /a\\b HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`)).status, 400);
    assert.equal((await rawRequest(port, `GET /%2e%2e/index.html HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`)).status, 404);

    const created = await write(port, '/api/time-entries', 'POST', { workPackageId: 2310, date: '2026-11-16', hours: 1 });
    const removed = await write(port, `/api/time-entries/${created.json.id}`, 'DELETE');
    assert.equal(removed.status, 204);
    assert.equal(removed.text, '');
  });
});

test('a static file deleted after startup is a 404, not a 500', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gone-'));
  const path = join(dir, 'gone.js');
  await writeFile(path, 'x');
  try {
    await withServer({ staticFiles: { '/gone.js': { path, type: 'text/javascript' } } }, async port => {
      assert.equal((await send(port, '/gone.js')).status, 200);
      await rm(path);
      const res = await send(port, '/gone.js');
      assert.equal(res.status, 404);
      assert.equal(res.json.error.code, 'not_found');
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an aborted request body does not crash or log', async () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    await withServer({}, async port => {
      await new Promise(resolve => {
        const socket = connect(port, '127.0.0.1', () => {
          socket.write(`POST /api/time-entries HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nX-Quest-Board: 1\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"a"`);
          setTimeout(() => socket.destroy(), 50);
        });
        socket.on('close', resolve);
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal((await send(port, '/api/health')).status, 200);
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, []);
});

test('quest store errors are logged by code only', async () => {
  const { QuestStoreError } = await import('../server/quests.mjs');
  const quests = { list: async () => { throw new QuestStoreError(); } };
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    await withServer({ quests }, async port => {
      assert.equal((await send(port, '/api/quests')).status, 500);
    });
  } finally {
    console.error = original;
  }
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], 'Quest store error:');
});

test('user search returns matching users', async () => {
  await withServer({}, async port => {
    const found = await send(port, `/api/users/search?q=${encodeURIComponent('小')}`);
    assert.equal(found.status, 200);
    assert.ok(found.json.length >= 2);
    assert.ok(found.json.every(user => user.name.includes('小')));
    assert.deepEqual((await send(port, '/api/users/search')).json, []);
    assert.equal((await send(port, `/api/users/search?q=${'x'.repeat(101)}`)).status, 400);
  });
});
test('an empty hall has no members; the date is required and validated', async () => {
  await withServer({}, async port => {
    assert.deepEqual((await send(port, '/api/hall?date=2026-11-16')).json, { date: '2026-11-16', members: [] });
    assert.equal((await send(port, '/api/hall')).status, 400);
    const bad = await send(port, '/api/hall?date=2026-13-40');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'date');
  });
});
test('recruited members show their status, total and entries for the day', async () => {
  await withServer({}, async port => {
    const added = await write(port, '/api/hall/members', 'POST', { userId: 11 });
    assert.equal(added.status, 200);
    assert.deepEqual(added.json, [{ userId: 11, name: '劍士 小華' }]);
    await write(port, '/api/hall/members', 'POST', { userId: 12 });
    assert.equal((await write(port, '/api/hall/members', 'POST', { userId: 13 })).json.length, 3);
    const hall = (await send(port, '/api/hall?date=2026-11-16')).json;
    assert.deepEqual(hall.members.map(member => [member.userId, member.status, member.totalHours]), [
      [11, 'resting', 8], [12, 'working', 5], [13, 'idle', 0],
    ]);
    assert.deepEqual(Object.keys(hall.members[1].entries[0]).sort(), ['activityName', 'comment', 'hours', 'id', 'workPackageId', 'workPackageSubject']);
    const yesterday = (await send(port, '/api/hall?date=2026-11-15')).json;
    assert.deepEqual(yesterday.members.map(member => member.status), ['idle', 'idle', 'idle']);
  });
});
test('the leave work package comes from configuration', async () => {
  await withServer({ leaveWorkPackageId: 1990 }, async port => {
    await write(port, '/api/hall/members', 'POST', { userId: 11 });
    await write(port, '/api/hall/members', 'POST', { userId: 12 });
    const hall = (await send(port, '/api/hall?date=2026-11-16')).json;
    assert.deepEqual(hall.members.map(member => member.status), ['working', 'resting']);
  });
});
test('recruiting validates the user and the hall capacity', async () => {
  await withServer({}, async port => {
    const missing = await write(port, '/api/hall/members', 'POST', { userId: 999 });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error.code, 'not_found');
    const invalid = await write(port, '/api/hall/members', 'POST', { userId: 'x' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json.error.field, 'userId');
    assert.deepEqual((await send(port, '/api/hall?date=2026-11-16')).json.members, []);
  });
  const source = { ...createDemoSource({ today: '2026-11-16' }), getUser: async id => ({ id, name: `U${id}` }) };
  await withServer({ source }, async port => {
    for (let id = 1; id <= 16; id += 1) assert.equal((await write(port, '/api/hall/members', 'POST', { userId: id })).status, 200);
    const full = await write(port, '/api/hall/members', 'POST', { userId: 17 });
    assert.equal(full.status, 409);
    assert.equal(full.json.error.code, 'hall_full');
    assert.equal((await write(port, '/api/hall/members', 'POST', { userId: 3 })).status, 200);
    assert.equal((await send(port, '/api/hall?date=2026-11-16')).json.members.length, 16);
  });
});
test('members can be removed', async () => {
  await withServer({}, async port => {
    await write(port, '/api/hall/members', 'POST', { userId: 11 });
    await write(port, '/api/hall/members', 'POST', { userId: 12 });
    const removed = await write(port, '/api/hall/members/11', 'DELETE');
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.json, [{ userId: 12, name: '法師 怡君' }]);
    assert.equal((await write(port, '/api/hall/members/abc', 'DELETE')).status, 400);
    assert.equal((await write(port, '/api/hall/members/77', 'DELETE')).status, 200);
  });
});
test('hall writes need the custom header and cross-site reads are refused', async () => {
  await withServer({}, async port => {
    const json = { 'Content-Type': 'application/json' };
    assert.equal((await send(port, '/api/hall/members', { method: 'POST', body: { userId: 11 }, headers: json })).status, 403);
    assert.equal((await send(port, '/api/hall/members/11', { method: 'DELETE' })).status, 403);
    assert.equal((await send(port, '/api/hall?date=2026-11-16', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await send(port, '/api/users/search?q=x', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await send(port, '/api/hall/members', { method: 'PUT', headers: { 'X-Quest-Board': '1' } })).status, 405);
    assert.deepEqual((await send(port, '/api/hall?date=2026-11-16')).json.members, []);
  });
});
test('corrupt hall file is a 500 with a clear code', async () => {
  const hall = { list: async () => { throw new HallStoreError(); } };
  await withServer({ hall }, async port => {
    const res = await send(port, '/api/hall?date=2026-11-16');
    assert.equal(res.status, 500);
    assert.equal(res.json.error.code, 'hall_corrupt');
  });
});
