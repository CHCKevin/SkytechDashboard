import { deflateSync } from 'node:zlib';

// 把索引像素格寫成索引色 PNG（color type 3，8 位元）。調色盤索引 0 透明，其餘不透明。
// 只用 Node 內建模組；CRC32 自己算，因為 zlib.crc32 要 Node 22.2 以上，而專案支援 20.12。

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

// palette：索引 0 為 null（透明），其餘為 '#rrggbb'。
export function encodeIndexedPng({ width, height, pixels }, palette) {
  if (palette.length > 256) throw new Error('索引色 PNG 最多 256 色');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 3, 0, 0, 0], 8);
  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((hex, i) => {
    if (!hex) return;
    const value = parseInt(hex.slice(1), 16);
    plte.set([value >> 16, (value >> 8) & 255, value & 255], i * 3);
  });
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0; // 每列的濾波方式：不濾波
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('PLTE', plte),
    chunk('tRNS', Buffer.from([0])), // 只列索引 0 的透明度，其餘預設不透明
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
