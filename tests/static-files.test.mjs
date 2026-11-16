import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanStaticFiles } from '../server/static-files.mjs';

async function withDist(files, run) {
  const dir = await mkdtemp(join(tmpdir(), 'dist-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      await mkdir(join(dir, name, '..'), { recursive: true });
      await writeFile(join(dir, name), content);
    }
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('maps every known file under dist to a URL, with / for index.html', async () => {
  await withDist({
    'index.html': '<!doctype html>', 'assets/index-abc.js': '', 'assets/index-abc.css': '',
    'assets/cubic-11.woff2': '', 'favicon.svg': '', 'notes.txt': '',
  }, async dir => {
    const files = await scanStaticFiles(dir);
    assert.deepEqual(Object.keys(files).sort(), ['/', '/assets/cubic-11.woff2', '/assets/index-abc.css', '/assets/index-abc.js', '/favicon.svg', '/index.html']);
    assert.equal(files['/'].type, 'text/html; charset=utf-8');
    assert.equal(files['/assets/cubic-11.woff2'].type, 'font/woff2');
    assert.equal(files['/assets/index-abc.js'].path, join(dir, 'assets', 'index-abc.js'));
  });
});
test('missing dist or index.html explains how to build', async () => {
  await assert.rejects(scanStaticFiles(join(tmpdir(), 'no-such-dist-xyz')), { message: /npm run build/ });
  await withDist({ 'assets/a.js': '' }, async dir => {
    await assert.rejects(scanStaticFiles(dir), { message: /npm run build/ });
  });
});
