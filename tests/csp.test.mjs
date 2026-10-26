import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pageCsp } from '../server/csp.mjs';

test('allows exactly the inline import map by hash', () => {
  const map = '{"imports":{"three":"/vendor/three.module.js"}}';
  const hash = createHash('sha256').update(map, 'utf8').digest('base64');
  assert.equal(pageCsp(`<head><script type="importmap">${map}</script></head>`),
    `default-src 'self'; script-src 'self' 'sha256-${hash}'`);
  assert.throws(() => pageCsp('<head></head>'), { message: 'index.html must contain exactly one import map' });
  assert.throws(() => pageCsp('<script type="importmap">{}</script><script type="importmap">{}</script>'),
    { message: 'index.html must contain exactly one import map' });
});
test('the real page maps three to the vendored module', async () => {
  const html = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
  assert.match(pageCsp(html), /^default-src 'self'; script-src 'self' 'sha256-[A-Za-z0-9+/]+=*'$/);
  const [, map] = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.deepEqual(JSON.parse(map), { imports: { three: '/vendor/three.module.js' } });
});
