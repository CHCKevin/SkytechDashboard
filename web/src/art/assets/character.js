import { render } from '../engine.js';
import { generator } from '../random.js';

// 坐姿人物，16×24，正面。外框由引擎自動加上，所以四周留一格空白。
// 圖例：H 髮 h 髮暗 I 髮亮｜S 膚 s 膚暗｜E 眼｜C 衣 c 衣暗 D 衣亮｜A 配件 a 配件暗｜P 褲 p 褲暗｜B 靴 b 靴暗
const BASE = [
  '................',
  '.....IIIIII.....',
  '...HHIIIIIIHH...',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HhSSSSSSSShH..',
  '..hhSSSSSSSShh..',
  '..SSSESSSSESSS..',
  '..SSSESSSSESSS..',
  '..SSSSSSSSSSSS..',
  '...sSSSSSSSSs...',
  '....ssSSSSss....',
  '...cCCCCCCCCc...',
  '.ccCCCDDDDCCCcc.',
  '.cCCCCCCCCCCCCc.',
  '.cCCCCCCCCCCCCc.',
  '.SCCCCCCCCCCCCS.',
  '..PPPPPPPPPPPP..',
  '..pPPPPPPPPPPp..',
  '...PPPp..pPPP...',
  '...PPPp..pPPP...',
  '...BBBb..bBBB...',
  '...BBBB..BBBB...',
  '................',
];

// 髮型與頭飾都是「覆寫指定列」；頭飾後套用，所以會蓋住頭髮。名稱與順序必須和 lib/sprite.js 相同。
const HAIRS = {
  short: {},
  long: {
    6: '.HhhSSSSSSSShhH.',
    7: '.HhSSESSSSESShH.',
    8: '.HhSSESSSSESShH.',
    9: '.HhSSSSSSSSSShH.',
    10: '.HhsSSSSSSSSshH.',
    11: '.Hh.ssSSSSss.hH.',
  },
  spiky: { 1: '...I..I..I..I...', 2: '..HIHHIHHIHHIH..' },
  bald: {
    1: '.....SSSSSS.....',
    2: '...SSSSSSSSSS...',
    3: '..SSSSSSSSSSSS..',
    4: '..SSSSSSSSSSSS..',
    5: '..HSSSSSSSSSSH..',
    6: '..hhSSSSSSSShh..',
  },
  bun: { 1: '......IIII......', 2: '.....hIIIIh.....' },
};
const HATS = {
  none: {},
  wizard: { 1: '.......AA.......', 2: '.....AAAAAA.....', 3: '...AAAAAAAAAA...', 4: '.aaaaaaaaaaaaaa.' },
  helmet: { 1: '.....AAAAAA.....', 2: '...AAAAAAAAAA...', 3: '..AAAAAAAAAAAA..', 4: '..aaaaaaaaaaaa..' },
  hood: {
    1: '.....CCCCCC.....',
    2: '...CCCCCCCCCC...',
    3: '..CCCCCCCCCCCC..',
    4: '..CCCCCCCCCCCC..',
    5: '..CcSSSSSSSScC..',
    6: '..ccSSSSSSSScc..',
  },
  band: { 4: '..AAAAAAAAAAAA..' },
  cap: { 2: '...AAAAAAAAAA...', 3: '..AAAAAAAAAAAA..', 4: '..aaaaaaaaaaaaa.' },
};

export const HAIR_NAMES = Object.keys(HAIRS);
// 「沒有頭飾」出現三次，讓大約三分之一的人不戴東西（與 lib/sprite.js 相同）。
export const HAT_POOL = ['none', 'none', 'none', 'wizard', 'helmet', 'hood', 'band', 'cap'];
const COUNTS = { hairColor: 6, skin: 4, cloth: 8, accent: 5 };
const range = n => Array.from({ length: n }, (_, i) => i);

// 由使用者編號決定造型。抽選順序與每項的選項數量都和 lib/sprite.js 的 lookFor 相同，
// 所以換成新畫法後，每個人仍是同一種髮型、髮色、膚色、衣服與配件顏色。
export function lookIndices(userId) {
  const random = generator(userId);
  const pick = count => Math.floor(random() * count);
  return {
    hair: HAIR_NAMES[pick(HAIR_NAMES.length)],
    hat: HAT_POOL[pick(HAT_POOL.length)],
    hairColor: pick(COUNTS.hairColor),
    skin: pick(COUNTS.skin),
    cloth: pick(COUNTS.cloth),
    accent: pick(COUNTS.accent),
  };
}

function put(rows, y, x, char) {
  rows[y] = rows[y].slice(0, x) + char + rows[y].slice(x + 1);
}

export const character = {
  id: 'character/seated',
  version: 1,
  size: [16, 24],
  anchor: [8, 22],
  maxColors: 18,
  shadow: false,
  legend: {
    H: ['hair', 1], h: ['hair', 0], I: ['hair', 2],
    S: ['skin', 1], s: ['skin', 0],
    E: 'eye',
    C: ['cloth', 1], c: ['cloth', 0], D: ['cloth', 2],
    A: ['accent', 1], a: ['accent', 0],
    P: ['pants', 1], p: ['pants', 0],
    B: ['boots', 1], b: ['boots', 0],
  },
  variants: {
    status: ['working', 'idle', 'resting'],
    hair: HAIR_NAMES,
    hat: Object.keys(HATS),
    hairColor: range(COUNTS.hairColor),
    skin: range(COUNTS.skin),
    cloth: range(COUNTS.cloth),
    accent: range(COUNTS.accent),
  },
  rows(variant) {
    const rows = [...BASE];
    for (const [y, row] of Object.entries(HAIRS[variant.hair])) rows[y] = row;
    for (const [y, row] of Object.entries(HATS[variant.hat])) rows[y] = row;
    // 休息時閉眼：拿掉上排眼睛，下排改成兩格寬的閉眼線。
    if (variant.status === 'resting') {
      for (const x of [5, 10]) put(rows, 7, x, 'S');
      for (const x of [4, 5, 10, 11]) put(rows, 8, x, 'E');
    }
    return rows;
  },
  slots: variant => ({
    hair: `hair${variant.hairColor}`,
    skin: `skin${variant.skin}`,
    cloth: `cloth${variant.cloth}`,
    accent: `accent${variant.accent}`,
  }),
};

export function renderCharacter(userId, status = 'working') {
  return render(character, { variant: { ...lookIndices(userId), status } });
}
