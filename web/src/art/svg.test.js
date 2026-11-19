import { expect, it } from 'vitest';
import { PALETTE } from './style.js';
import { toArt } from './svg.js';

it('同一列相鄰同色的像素合併成一個橫條，透明不輸出', () => {
  const art = toArt({ width: 4, height: 2, pixels: Uint8Array.from([1, 1, 0, 2, 2, 2, 2, 0]) });
  expect(art).toEqual({
    width: 4,
    height: 2,
    rects: [
      { x: 0, y: 0, w: 2, color: PALETTE[1] },
      { x: 3, y: 0, w: 1, color: PALETTE[2] },
      { x: 0, y: 1, w: 3, color: PALETTE[2] },
    ],
  });
});
