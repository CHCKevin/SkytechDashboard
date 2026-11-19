import { PALETTE } from './style.js';

// 把索引像素格轉成 PixelArt.svelte 用的 { width, height, rects }：同一列相鄰同色的格子合併成一個橫條。
export function toArt({ width, height, pixels }) {
  const rects = [];
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      const value = pixels[y * width + x];
      let w = 1;
      while (x + w < width && pixels[y * width + x + w] === value) w += 1;
      if (value) rects.push({ x, y, w, color: PALETTE[value] });
      x += w;
    }
  }
  return { width, height, rects };
}
