import { lookIndices, renderCharacter } from '../art/assets/character.js';
import { flatten } from '../art/engine.js';
import { EYE, PALETTE } from '../art/style.js';
import { toArt } from '../art/svg.js';

// 大廳角色的造型：由使用者編號固定算出，畫法在 web/src/art（像素引擎與 assets/character.js）。
// 抽選順序與第二階段相同，換新畫法後每個人仍是同一種髮型、髮色、膚色、衣服與配件顏色。
export const lookFor = lookIndices;
export const EYE_COLOR = PALETTE[EYE];

// 回傳 PixelArt.svelte 用的 { width: 16, height: 24, rects }。
export function spriteFor(userId, status = 'working') {
  const result = renderCharacter(userId, status);
  return toArt({ width: result.width, height: result.height, pixels: flatten(result) });
}

export const STATUS_LABELS = { working: '工作中', idle: '發呆', resting: '休息' };

// 狀態圖示 7×7，畫在淺色底的小牌子上（底色與外框由 CSS 的 .status-icon 提供）。
function iconArt(rows, colors) {
  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = colors[row[x]];
      let w = 1;
      while (x + w < row.length && colors[row[x + w]] === color) w += 1;
      if (color) rects.push({ x, y, w, color });
      x += w;
    }
  });
  return { width: rows[0].length, height: rows.length, rects };
}
const ICON_COLORS = { X: '#2b1a0e', M: '#7d8791', T: '#8a5a35', Z: '#2f6fc0' };
export const STATUS_ICONS = {
  // 槌子
  working: iconArt(['.MMMMM.', '.MMMMM.', '.MMMMM.', '...T...', '...T...', '...T...', '...T...'], ICON_COLORS),
  // 三個點
  idle: iconArt(['.......', '.......', '.......', '.X.X.X.', '.X.X.X.', '.......', '.......'], ICON_COLORS),
  // Z
  resting: iconArt(['.ZZZZZ.', '.....Z.', '....Z..', '...Z...', '..Z....', '.Z.....', '.ZZZZZ.'], ICON_COLORS),
};
