// 家具：3/4 俯視，看得到頂面與正面。光源在正上方偏左，頂面用亮階，正面用中階，下緣用暗階。
const WOOD = ['wood_oak', 'wood_walnut'];
const woodSlot = variant => ({ wood: variant.wood });

// 木椅 12×16：椅背在上，椅面頂面兩列，正面一列，下面是椅腳。空位時單獨顯示；有人時畫在角色之下。
export const chair = {
  id: 'furniture/chair',
  version: 1,
  size: [12, 16],
  anchor: [6, 14],
  maxColors: 10,
  shadow: true,
  legend: { d: ['wood', 0], m: ['wood', 1], l: ['wood', 2], L: ['wood', 3] },
  variants: { wood: WOOD },
  slots: woodSlot,
  rows: [
    '............',
    '..LLllllll..',
    '..mmmmmmmm..',
    '..dm.mm.md..',
    '..dm.mm.md..',
    '..dm.mm.md..',
    '..mmmmmmmm..',
    '.LLlllllllL.',
    '.llllllllll.',
    '.mmmmmmmmmm.',
    '.dddddddddd.',
    '.dm......md.',
    '.dm......md.',
    '.dm......md.',
    '.dd......dd.',
    '............',
  ],
};

// 木桌 32×20：頂面 10 列（含亮邊），正面裙板 3 列，桌腳 5 列。頂面約佔物件高度的 0.56。
// 頂面與裙板有木紋（T、G），木紋斷點由種子決定。桌子畫在坐在後方的角色之上。
const tableRow = fill => `.${fill.repeat(30)}.`;
export const table = {
  id: 'furniture/table',
  version: 1,
  size: [32, 20],
  anchor: [16, 18],
  maxColors: 10,
  shadow: true,
  legend: { L: ['wood', 3], T: ['wood', 2, 'grain'], m: ['wood', 1], G: ['wood', 1, 'grain'], d: ['wood', 0] },
  variants: { wood: WOOD },
  slots: woodSlot,
  rows: [
    '.'.repeat(32),
    tableRow('L'),
    ...Array(9).fill(tableRow('T')),
    tableRow('G'),
    tableRow('G'),
    tableRow('d'),
    ...Array(4).fill(`.dm${'.'.repeat(26)}md.`),
    `.dd${'.'.repeat(26)}dd.`,
    '.'.repeat(32),
  ],
};
