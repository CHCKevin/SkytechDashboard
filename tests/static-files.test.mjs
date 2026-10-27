import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticFiles, assertStaticFiles } from '../server/static-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('whitelist covers the client and vendored three files, and they exist', async () => {
  const files = createStaticFiles(root);
  assert.equal(files['/'].path, join(root, 'client', 'index.html'));
  assert.equal(files['/'].type, 'text/html; charset=utf-8');
  assert.equal(files['/main.mjs'].type, 'text/javascript; charset=utf-8');
  assert.equal(files['/styles.css'].type, 'text/css; charset=utf-8');
  assert.equal(files['/favicon.svg'].type, 'image/svg+xml');
  for (const url of ['/procedural.mjs', '/sky.mjs', '/planet-look.mjs']) {
    assert.equal(files[url].path, join(root, 'client', url.slice(1)), url);
  }
  assert.equal(files['/shared/layout.mjs'].path, join(root, 'shared', 'layout.mjs'));
  assert.equal(files['/vendor/three.module.js'].path, join(root, 'node_modules', 'three', 'build', 'three.module.js'));
  for (const url of Object.keys(files)) {
    assert.ok(!/config|package|server|\.\./.test(url), url);
  }
  await assertStaticFiles(files);
});
test('missing static files fail with only the public path', async () => {
  const files = { '/gone.mjs': { path: join(root, 'does-not-exist', 'gone.mjs'), type: 'text/javascript; charset=utf-8' } };
  await assert.rejects(assertStaticFiles(files), { message: 'Missing static file for /gone.mjs; run npm install' });
});
