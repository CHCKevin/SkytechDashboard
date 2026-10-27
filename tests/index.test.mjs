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

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// 以指定設定啟動服務，執行 check(base) 後關閉；回傳 stdout＋stderr 供機密檢查。
async function runServer(config, check) {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-index-'));
  const port = await freePort();
  let child;
  let output = '';
  try {
    const path = join(dir, 'local.json');
    await writeFile(path, JSON.stringify({ ...config, port }));
    child = spawn(process.execPath, [entry, '--config', path]);
    child.stderr.on('data', chunk => { output += chunk; });
    const exited = new Promise(resolve => child.once('exit', resolve));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes(`http://127.0.0.1:${port}/`)) { clearTimeout(timer); resolve(); }
      });
      exited.then(code => { clearTimeout(timer); reject(new Error(`server exited early: ${code}`)); });
    });
    await check(`http://127.0.0.1:${port}`);
    return output;
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  }
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
test('demo mode starts and serves the page and health endpoint', async () => {
  await runServer({ mode: 'demo' }, async base => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    await page.text();
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', mode: 'demo' });
  });
});
test('live mode starts, reports source errors in the snapshot, and never prints the token', async () => {
  const closed = await freePort();
  const output = await runServer({ mode: 'live', baseUrl: `http://127.0.0.1:${closed}/`, apiToken: 'FAKE_TOKEN_123' }, async base => {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', mode: 'live' });
    const response = await fetch(`${base}/api/snapshot`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(body).mode, 'live');
    assert.equal(JSON.parse(body).error.code, 'network');
    assert.ok(!body.includes('FAKE_TOKEN_123'));
  });
  assert.ok(!output.includes('FAKE_TOKEN_123'));
});
