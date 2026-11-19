import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANIMATIONS, FACINGS, renderFrames } from '../web/src/art/assets/character.js';
import { CASES, renderCase } from '../web/src/art/cases.js';
import { flatten } from '../web/src/art/engine.js';
import { METADATA_FIELDS, describeCase } from '../tools/art/metadata.mjs';
import { spriteSheet } from '../tools/art/sheet.mjs';

test('圖集：每幀的位置、尺寸、時間，像素與原圖相同', () => {
  const rows = FACINGS.map(facing => renderFrames(12, 'working', facing).map((result, i) => ({
    name: `${facing}-${i}`, result, duration: ANIMATIONS.working.frameMs,
  })));
  const { image, data } = spriteSheet(rows, { userId: 12 });
  assert.deepEqual([image.width, image.height], [32, 96]);
  assert.equal(data.frames.length, 8);
  assert.deepEqual(data.frames[3], { name: 'back-1', x: 16, y: 24, w: 16, h: 24, duration: 300 });
  assert.deepEqual(data.meta, { size: [16, 24], anchor: { x: 8, y: 21 }, userId: 12 });
  const frame = data.frames[3];
  const source = flatten(rows[1][1].result);
  for (let y = 0; y < 24; y += 1) {
    const row = image.pixels.subarray((frame.y + y) * image.width + frame.x, (frame.y + y) * image.width + frame.x + 16);
    assert.deepEqual([...row], [...source.subarray(y * 16, (y + 1) * 16)]);
  }
});

test('圖集拒絕尺寸不同的幀', () => {
  const [a] = renderFrames(1);
  const small = { ...a, width: 8 };
  assert.throws(() => spriteSheet([[{ name: 'a', result: a }, { name: 'b', result: small }]]), /尺寸/);
});

test('A15 每個樣本的 metadata 欄位齊全', () => {
  for (const c of CASES) {
    const meta = describeCase(c, renderCase(c), {});
    assert.deepEqual(Object.keys(meta), METADATA_FIELDS);
    assert.match(meta.hash, /^[0-9a-f]{8}$/);
    assert.equal(meta.changed, true);
    assert.deepEqual(meta.issues, []);
    assert.ok(meta.colors > 0);
  }
});
