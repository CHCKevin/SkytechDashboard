import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseConfig, loadConfig } from '../server/config.mjs';

test('demo defaults to loopback, no token, and default paths', () => {
  assert.deepEqual(parseConfig({ mode: 'demo' }), {
    mode: 'demo', host: '127.0.0.1', port: 4173,
    baseUrl: null, apiToken: null,
    dailyTargetHours: 8, leaveWorkPackageId: 200, dataDir: 'data', staticDir: 'web/dist',
  });
});
test('validates daily target and directories', () => {
  assert.equal(parseConfig({ mode: 'demo', dailyTargetHours: 7.5 }).dailyTargetHours, 7.5);
  for (const bad of [0, -1, 25, '8', NaN]) {
    assert.throws(() => parseConfig({ mode: 'demo', dailyTargetHours: bad }),
      { message: 'dailyTargetHours must be a number greater than 0 and at most 24' });
  }
  assert.equal(parseConfig({ mode: 'demo', dataDir: 'tmp/x', staticDir: 'dist' }).dataDir, 'tmp/x');
  assert.throws(() => parseConfig({ mode: 'demo', dataDir: '' }), { message: 'dataDir must be a non-empty string' });
  assert.throws(() => parseConfig({ mode: 'demo', staticDir: 3 }), { message: 'staticDir must be a non-empty string' });
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
test('leaveWorkPackageId defaults to 200 and must be a positive integer', () => {
  assert.equal(parseConfig({ mode: 'demo' }).leaveWorkPackageId, 200);
  assert.equal(parseConfig({ mode: 'demo', leaveWorkPackageId: 77 }).leaveWorkPackageId, 77);
  for (const bad of [0, -1, 1.5, '200', null]) {
    assert.throws(() => parseConfig({ mode: 'demo', leaveWorkPackageId: bad }), /leaveWorkPackageId/);
  }
});
