import { generator } from './random.js';
import { EYE, OUTLINE, RAMPS, SHADOW } from './style.js';

// 像素產生引擎：把資產定義（字元格樣板＋圖例）變成索引像素格。
// 純函式，不碰 DOM、不讀檔，瀏覽器、Node 工具與測試共用。
// 輸出：{ id, width, height, anchor, body, shadow }；body 與 shadow 是調色盤索引的 Uint8Array，0 為透明。

export function resolveVariant(asset, requested = {}) {
  const variant = {};
  for (const [key, options] of Object.entries(asset.variants ?? {})) {
    const value = requested[key] ?? options[0];
    if (!options.includes(value)) throw new Error(`${asset.id}：變體 ${key}=${value} 不存在`);
    variant[key] = value;
  }
  return variant;
}

export function render(asset, { variant: requested, seed = 0 } = {}) {
  const variant = resolveVariant(asset, requested);
  const rows = typeof asset.rows === 'function' ? asset.rows(variant) : asset.rows;
  const [width, height] = asset.size;
  if (rows.length !== height || rows.some(row => row.length !== width)) {
    throw new Error(`${asset.id}：樣板大小不是 ${width}×${height}`);
  }
  const slots = asset.slots ? asset.slots(variant) : {};
  const grain = grainLines(seed, width, height);
  const body = new Uint8Array(width * height);
  let minX = width;
  let maxX = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      if (row[x] === '.') continue;
      body[y * width + x] = colorFor(asset, row[x], slots, Boolean(grain[y]?.[x]));
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  });
  const [x, y] = asset.anchor;
  return {
    id: asset.id,
    width,
    height,
    anchor: { x, y },
    body: addOutline(body, width, height),
    shadow: asset.shadow ? castShadow(width, height, x, maxX - minX + 1) : null,
  };
}

function colorFor(asset, char, slots, onGrainLine) {
  const entry = asset.legend[char];
  if (entry === undefined) throw new Error(`${asset.id}：圖例沒有「${char}」`);
  if (entry === 'eye') return EYE;
  const [slot, tone, texture] = entry;
  const ramp = RAMPS[slots[slot] ?? slot];
  if (!ramp || ramp[tone] === undefined) throw new Error(`${asset.id}：色階 ${slots[slot] ?? slot} 沒有第 ${tone} 階`);
  return ramp[texture === 'grain' && onGrainLine ? Math.max(0, tone - 1) : tone];
}

// 木紋：每三列一條線，線由長度 3–7 的線段與 1–2 格的斷口組成；斷點由種子決定。
// 線段至少 3 格，所以不會出現孤立的單一像素。
function grainLines(seed, width, height) {
  return Array.from({ length: height }, (_, y) => {
    if ((y + seed) % 3 !== 0) return null;
    const random = generator(seed * 7919 + y * 104729 + 1);
    const line = new Array(width).fill(false);
    let on = true;
    for (let x = 0; x < width; on = !on) {
      const length = on ? 3 + Math.floor(random() * 5) : 1 + Math.floor(random() * 2);
      for (let i = x; i < Math.min(width, x + length); i += 1) line[i] = on;
      x += length;
    }
    return line;
  });
}

export function neighbours(index, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  const list = [];
  if (y > 0) list.push(index - width);
  if (y < height - 1) list.push(index + width);
  if (x > 0) list.push(index - 1);
  if (x < width - 1) list.push(index + 1);
  return list;
}

// 外框畫在輪廓外，只看上下左右，所以轉角不會變粗。
function addOutline(body, width, height) {
  const result = body.slice();
  body.forEach((value, index) => {
    if (value === 0 && neighbours(index, width, height).some(j => body[j] !== 0)) result[index] = OUTLINE;
  });
  return result;
}

// 落影：寬度約為物件的 3/4，置中在錨點，貼著圖的最下緣。寬的物件 3 列，窄的 2 列。
function castShadow(width, height, centerX, footprint) {
  const size = Math.max(2, Math.round(footprint * 0.75));
  const widths = size >= 16 ? [size - 2, size, size - 2] : [size, size - 2];
  const shadow = new Uint8Array(width * height);
  widths.forEach((rowWidth, i) => {
    const y = height - widths.length + i;
    const start = Math.round(centerX - rowWidth / 2);
    for (let x = Math.max(0, start); x < Math.min(width, start + rowWidth); x += 1) shadow[y * width + x] = SHADOW;
  });
  return shadow;
}

// 把物件畫在落影上面，得到單一張索引像素格（PNG 匯出與組合預覽用）。
export function flatten({ body, shadow }) {
  return body.map((value, i) => value || shadow?.[i] || 0);
}

// 像素內容的指紋（FNV-1a 32 位元），用於黃金測試與目錄的「是否有變更」。
export function fingerprint({ width, height, body, shadow }) {
  let hash = 0x811c9dc5;
  const feed = value => { hash = Math.imul(hash ^ value, 0x01000193) >>> 0; };
  [width, height].forEach(feed);
  body.forEach(feed);
  (shadow ?? []).forEach(feed);
  return hash.toString(16).padStart(8, '0');
}
