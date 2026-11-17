// 圖集：把多個同尺寸的結果排成格子（每一列是一組動畫），輸出一張索引像素格與 JSON 描述。
// rows：[[{ name, result, duration }...], ...]；同一列由左到右，列與列由上到下。
import { flatten } from '../../web/src/art/engine.js';

export function spriteSheet(rows, meta = {}) {
  const first = rows[0][0].result;
  const { width: w, height: h, anchor } = first;
  const columns = Math.max(...rows.map(row => row.length));
  const width = w * columns;
  const height = h * rows.length;
  const pixels = new Uint8Array(width * height);
  const frames = [];
  rows.forEach((row, r) => row.forEach(({ name, result, duration }, c) => {
    if (result.width !== w || result.height !== h) throw new Error(`${name} 的尺寸與第一幀不同`);
    const flat = flatten(result);
    for (let y = 0; y < h; y += 1) pixels.set(flat.subarray(y * w, (y + 1) * w), (r * h + y) * width + c * w);
    frames.push({ name, x: c * w, y: r * h, w, h, duration });
  }));
  return { image: { width, height, pixels }, data: { frames, meta: { size: [w, h], anchor, ...meta } } };
}
