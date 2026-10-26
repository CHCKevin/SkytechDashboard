import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const entry = fileURLToPath(new URL('../server/index.mjs', import.meta.url));

function start(args) {
  return new Promise(resolve => {
    execFile(process.execPath, [entry, ...args], { timeout: 5000 }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

test('missing config fails with a clear message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-index-'));
  try {
    const result = await start(['--config', join(dir, 'missing.json')]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Config file is missing or unreadable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('live mode refuses to start without falling back to demo or echoing the token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-index-'));
  try {
    const path = join(dir, 'local.json');
    await writeFile(path, JSON.stringify({
      mode: 'live', baseUrl: 'http://example.test/', apiToken: 'FAKE_TOKEN_123',
    }));
    const result = await start(['--config', path]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Live mode is not implemented yet/);
    assert.ok(!result.stdout.includes('FAKE_TOKEN_123'));
    assert.ok(!result.stderr.includes('FAKE_TOKEN_123'));
    assert.ok(!result.stdout.includes('http://127.0.0.1'), 'must not start a demo server');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('demo mode starts and serves the page and health endpoint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-index-'));
  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  let child;
  try {
    const path = join(dir, 'local.json');
    await writeFile(path, JSON.stringify({ mode: 'demo', port }));
    child = spawn(process.execPath, [entry, '--config', path]);
    const exited = new Promise(resolve => child.once('exit', resolve));
    await new Promise((resolve, reject) => {
      let stdout = '';
      const timer = setTimeout(() => reject(new Error(`server did not start: ${stdout}`)), 5000);
      child.stdout.on('data', chunk => {
        stdout += chunk;
        if (stdout.includes(`http://127.0.0.1:${port}/`)) { clearTimeout(timer); resolve(); }
      });
      exited.then(code => { clearTimeout(timer); reject(new Error(`server exited early: ${code}`)); });
    });
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    await page.text();
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', mode: 'demo' });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
