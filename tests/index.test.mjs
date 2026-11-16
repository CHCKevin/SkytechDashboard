import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
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

// 以暫存目錄當 staticDir 與 dataDir 啟動服務，執行 check 後關閉；回傳輸出供機密檢查。
async function runServer(config, check) {
  const dir = await mkdtemp(join(tmpdir(), 'quest-index-'));
  const port = await freePort();
  let child;
  let output = '';
  try {
    const staticDir = join(dir, 'dist');
    await mkdir(staticDir);
    await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>quest</title>');
    const path = join(dir, 'local.json');
    await writeFile(path, JSON.stringify({ staticDir, dataDir: join(dir, 'data'), ...config, port }));
    child = spawn(process.execPath, [entry, '--config', path]);
    child.stderr.on('data', chunk => { output += chunk; });
    const exited = new Promise(resolve => child.once('exit', resolve));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes(`http://127.0.0.1:${port}/`)) { clearTimeout(timer); resolve(); }
      });
      exited.then(code => { clearTimeout(timer); reject(new Error(`server exited early: ${code}\n${output}`)); });
    });
    await check(`http://127.0.0.1:${port}`, dir);
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
  const dir = await mkdtemp(join(tmpdir(), 'quest-index-'));
  try {
    const result = await start(['--config', join(dir, 'missing.json')]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Config file is missing or unreadable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('missing frontend build fails with a build hint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quest-index-'));
  try {
    const path = join(dir, 'local.json');
    await writeFile(path, JSON.stringify({ mode: 'demo', staticDir: join(dir, 'nope') }));
    const result = await start(['--config', path]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /npm run build/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('demo mode serves the page, API, and stores quests in dataDir', async () => {
  await runServer({ mode: 'demo' }, async (base, dir) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    await page.text();
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', mode: 'demo' });
    const pinned = await fetch(`${base}/api/quests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Quest-Board': '1', Origin: base },
      body: JSON.stringify({ workPackageId: 1234, activityId: 3 }),
    });
    assert.equal(pinned.status, 200);
    await pinned.text();
    const saved = JSON.parse(await readFile(join(dir, 'data', 'demo-quests.json'), 'utf8'));
    assert.equal(saved[0].workPackageId, 1234);
  });
});
test('live mode reports source errors as JSON and never prints the token', async () => {
  const closed = await freePort();
  const output = await runServer({ mode: 'live', baseUrl: `http://127.0.0.1:${closed}/`, apiToken: 'FAKE_TOKEN_123' }, async base => {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', mode: 'live' });
    const response = await fetch(`${base}/api/me`);
    const body = await response.text();
    assert.equal(response.status, 502);
    assert.equal(JSON.parse(body).error.code, 'network');
    assert.ok(!body.includes('FAKE_TOKEN_123'));
  });
  assert.ok(!output.includes('FAKE_TOKEN_123'));
});
