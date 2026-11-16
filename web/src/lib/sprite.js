// 像素角色：12×16 的字元格。H 髮、S 膚、E 眼、C 衣、D 衣服暗部、P 褲、B 鞋、A 頭飾、. 透明。
const BODY = [
  '............',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HSSSSSSH..',
  '..SSESSESS..',
  '..SSSSSSSS..',
  '...SSSSSS...',
  '..CCCCCCCC..',
  '.CCCCDDCCCC.',
  '.SCCCDDCCCS.',
  '.SCCCCCCCCS.',
  '..CCCCCCCC..',
  '..PPPPPPPP..',
  '..PPP..PPP..',
  '..PPP..PPP..',
  '..BBB..BBB..',
];

// 髮型與頭飾都是「覆寫指定列」；頭飾後套用，所以會蓋住頭髮。
const HAIRS = {
  short: {},
  long: { 3: '..HSSSSSSH..', 4: '.HSSESSESSH.', 5: '.HSSSSSSSSH.', 6: '.H.SSSSSS.H.' },
  spiky: { 0: '..H.H..H.H..', 1: '..HHHHHHHH..' },
  bald: { 1: '...SSSSSS...', 2: '..SSSSSSSS..', 3: '..SSSSSSSS..' },
  bun: { 0: '.....HH.....' },
};
const HATS = {
  none: {},
  wizard: { 0: '.....AA.....', 1: '....AAAA....', 2: '.AAAAAAAAAA.' },
  helmet: { 1: '...AAAAAA...', 2: '..AAAAAAAA..', 3: '..ASSSSSSA..' },
  hood: { 1: '...CCCCCC...', 2: '..CCCCCCCC..', 3: '..CSSSSSSC..', 4: '..CSESSESC..', 5: '..CSSSSSSC..' },
  band: { 2: '..AAAAAAAA..' },
  cap: { 1: '...AAAAAA...', 2: '..AAAAAAAAAA' },
};
// 「沒有頭飾」出現三次，讓大約三分之一的人不戴東西。
const HAT_POOL = ['none', 'none', 'none', 'wizard', 'helmet', 'hood', 'band', 'cap'];
const HAIR_COLORS = ['#3a2a1a', '#15110e', '#7a4a20', '#c9c9c9', '#d9a441', '#b5432e'];
const SKIN_COLORS = ['#f2c9a0', '#e0b088', '#c98f66', '#8d5a3b'];
const CLOTH_COLORS = ['#d94f4f', '#4f8fd9', '#58b368', '#b06fd6', '#e0a030', '#3fb5b0', '#d96fa8', '#8a8a8a'];
const ACCENT_COLORS = ['#5b3fa8', '#9aa3ad', '#c23a3a', '#2e7d4f', '#d9b441'];
export const EYE_COLOR = '#1a1a1a';
const PANTS_COLOR = '#3d3a52';
const BOOT_COLOR = '#2a1c12';

// mulberry32：小而固定的亂數產生器，同一個種子永遠得到同一串數字。
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function darken(hex) {
  const value = parseInt(hex.slice(1), 16);
  return `#${[value >> 16, (value >> 8) & 255, value & 255].map(part => Math.round(part * 0.7).toString(16).padStart(2, '0')).join('')}`;
}

// 由使用者編號決定造型；抽選順序固定，改動順序會讓所有人換造型。
export function lookFor(userId) {
  const random = generator(userId);
  const pick = list => list[Math.floor(random() * list.length)];
  return {
    hair: pick(Object.keys(HAIRS)),
    hat: pick(HAT_POOL),
    hairColor: pick(HAIR_COLORS),
    skin: pick(SKIN_COLORS),
    cloth: pick(CLOTH_COLORS),
    accent: pick(ACCENT_COLORS),
  };
}

// 把字元格轉成 SVG 用的橫條：同一列相鄰同色的格子合併成一個 rect。
function toArt(rows, colors) {
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

export function spriteFor(userId, status = 'working') {
  const look = lookFor(userId);
  const rows = [...BODY];
  for (const [index, row] of Object.entries(HAIRS[look.hair])) rows[index] = row;
  for (const [index, row] of Object.entries(HATS[look.hat])) rows[index] = row;
  return toArt(rows, {
    H: look.hairColor, S: look.skin, C: look.cloth, D: darken(look.cloth), A: look.accent,
    P: PANTS_COLOR, B: BOOT_COLOR,
    // 休息時閉上眼睛。
    E: status === 'resting' ? darken(look.skin) : EYE_COLOR,
  });
}

export const STATUS_LABELS = { working: '工作中', idle: '發呆', resting: '休息' };

const ICON_COLORS = { X: '#2b1a0e', W: '#fff8e0', M: '#9aa3ad', T: '#8a5a35', Z: '#4f8fd9' };
export const STATUS_ICONS = {
  // 槌子
  working: toArt(['.MMMMM.', '.MMMMM.', '.MMMMM.', '...T...', '...T...', '...T...', '...T...'], ICON_COLORS),
  // 對話泡泡裡的三個點
  idle: toArt(['.......', 'WWWWWWW', 'WXWXWXW', 'WWWWWWW', '.WW....', '.W.....', '.......'], ICON_COLORS),
  // Z
  resting: toArt(['ZZZZZZZ', '.....ZZ', '....ZZ.', '...ZZ..', '..ZZ...', '.ZZ....', 'ZZZZZZZ'], ICON_COLORS),
};
