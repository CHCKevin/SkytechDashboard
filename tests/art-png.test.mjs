import assert from 'node:assert/strict';
import { test } from 'node:test';
import zlib, { inflateSync } from 'node:zlib';
import { chair } from '../web/src/art/assets/furniture.js';
import { flatten, render } from '../web/src/art/engine.js';
import { PALETTE } from '../web/src/art/style.js';
import { crc32, encodeIndexedPng } from '../tools/art/png.mjs';

function readChunks(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const crc = buffer.readUInt32BE(offset + 8 + length);
    assert.equal(crc, crc32(buffer.subarray(offset + 4, offset + 8 + length)), `${type} 的 CRC`);
    chunks.push({ type, data });
    offset += 12 + length;
  }
  return chunks;
}

test('crc32 與 Node 內建結果相同', { skip: typeof zlib.crc32 !== 'function' }, () => {
  for (const text of ['', 'IEND', '像素']) assert.equal(crc32(Buffer.from(text)), zlib.crc32(Buffer.from(text)));
});

test('A14 匯出的 PNG 讀回後與引擎輸出相同', () => {
  const result = render(chair);
  const pixels = flatten(result);
  const chunks = readChunks(encodeIndexedPng({ width: result.width, height: result.height, pixels }, PALETTE));
  assert.deepEqual(chunks.map(c => c.type), ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

  const header = chunks[0].data;
  assert.equal(header.readUInt32BE(0), 12);
  assert.equal(header.readUInt32BE(4), 16);
  assert.deepEqual([...header.subarray(8)], [8, 3, 0, 0, 0]);

  const plte = chunks[1].data;
  assert.equal(plte.length, PALETTE.length * 3);
  PALETTE.forEach((hex, i) => {
    if (!hex) return;
    assert.equal(`#${plte.subarray(i * 3, i * 3 + 3).toString('hex')}`, hex);
  });
  assert.deepEqual([...chunks[2].data], [0]);

  const raw = inflateSync(chunks[3].data);
  const decoded = [];
  for (let y = 0; y < 16; y += 1) {
    assert.equal(raw[y * 13], 0);
    decoded.push(...raw.subarray(y * 13 + 1, y * 13 + 13));
  }
  assert.deepEqual(decoded, [...pixels]);
});

test('超過 256 色時拒絕', () => {
  assert.throws(() => encodeIndexedPng({ width: 1, height: 1, pixels: new Uint8Array(1) }, Array(257).fill('#000000')), /256/);
});
