// 公會大廳的場景資產：地板、牆、酒架、吧檯、高腳椅、沙發。風格規則與家具相同（3/4 俯視、光源在左上）。
const line = (fill, width) => `.${fill.repeat(width - 2)}.`;
const blank = width => '.'.repeat(width);

// 地板 220×160：木板每 8 列一塊，上緣一列亮、下緣一列暗；木板接縫每塊錯開。鋪滿整張圖，不加外框。
export const floor = {
  id: 'hall/floor',
  // v2：場景加高到 160 列，放得下工作桌前方的座位。
  version: 2,
  size: [220, 160],
  anchor: [110, 159],
  maxColors: 4,
  outline: false,
  legend: { d: ['floor', 0], m: ['floor', 1], l: ['floor', 2] },
  rows: Array.from({ length: 160 }, (_, y) => {
    const band = Math.floor(y / 8);
    if (y % 8 === 7) return 'd'.repeat(220);
    if (y % 8 === 0) return 'l'.repeat(220);
    return Array.from({ length: 220 }, (_, x) => ((x + band * 23) % 44 === 0 ? 'd' : 'm')).join('');
  }),
};

// 牆 220×20：深色木板牆（直向木紋用一般木紋代替），下緣是亮色飾條與暗色踢腳板。
export const wall = {
  id: 'hall/wall',
  version: 1,
  size: [220, 20],
  anchor: [110, 19],
  maxColors: 5,
  outline: false,
  legend: { w: ['wood_walnut', 1, 'grain'], L: ['wood_oak', 3], d: ['wood_walnut', 0] },
  rows: [...Array(17).fill('w'.repeat(220)), 'L'.repeat(220), 'L'.repeat(220), 'd'.repeat(220)],
};

// 酒架 88×9：一層木架，上面排著四種顏色的酒瓶。
const BOTTLES = ['g', 'r', 'y', 'b'];
export const shelf = {
  id: 'hall/shelf',
  version: 1,
  size: [88, 9],
  anchor: [44, 7],
  maxColors: 10,
  legend: {
    L: ['wood_oak', 3], d: ['wood_oak', 0],
    g: ['leaf', 2], r: ['cloth0', 1], y: ['accent4', 1], b: ['cloth1', 1],
  },
  rows: (() => {
    const bottleAt = x => (x >= 4 && x < 84 && (x - 4) % 7 < 3 ? BOTTLES[Math.floor((x - 4) / 7) % 4] : null);
    const neck = x => (bottleAt(x) && (x - 4) % 7 === 1 ? bottleAt(x) : '.');
    const body = x => bottleAt(x) ?? '.';
    const row = cell => Array.from({ length: 88 }, (_, x) => cell(x)).join('');
    return [blank(88), row(neck), row(neck), row(body), row(body), row(body), line('L', 88), line('d', 88), blank(88)];
  })(),
};

// 吧檯 108×24：頂面 9 列（含亮邊）有木紋，檯面下緣一列暗影，正面每 18 格一條直向分隔。
export const counter = {
  id: 'hall/counter',
  version: 1,
  size: [108, 24],
  anchor: [54, 22],
  maxColors: 10,
  shadow: true,
  legend: { L: ['wood_oak', 3], T: ['wood_oak', 2, 'grain'], G: ['wood_oak', 1, 'grain'], d: ['wood_oak', 0] },
  rows: [
    blank(108),
    line('L', 108),
    ...Array(8).fill(line('T', 108)),
    line('d', 108),
    ...Array(11).fill(`.${Array.from({ length: 106 }, (_, x) => (x % 18 === 8 ? 'd' : 'G')).join('')}.`),
    line('d', 108),
    blank(108),
  ],
};

// 高腳椅 10×12：吧檯座位；有人坐時大部分被身體擋住，空位時看得到。
export const stool = {
  id: 'hall/stool',
  version: 1,
  size: [10, 12],
  anchor: [5, 10],
  maxColors: 10,
  shadow: true,
  legend: { d: ['wood_oak', 0], m: ['wood_oak', 1], l: ['wood_oak', 2], L: ['wood_oak', 3] },
  rows: [
    blank(10),
    '.LLllllll.',
    '.llllllll.',
    '.mmmmmmmm.',
    '.dddddddd.',
    ...Array(5).fill('..dm..md..'),
    '..dd..dd..',
    blank(10),
  ],
};

// 沙發：靠背 10 列、座墊頂面 2 列（第 12–13 列）、正面 5 列、底座 1 列、椅腳 3 列；兩側扶手 4 格寬。
// 每個座位 16 格寬，座位之間的靠背有接縫。
function sofaRows(seats) {
  const inner = seats * 16;
  const width = inner + 10;
  const seamed = (fill, seam) => Array.from({ length: inner }, (_, x) => (x > 0 && x % 16 === 0 ? seam : fill)).join('');
  return [
    blank(width),
    `..${'H'.repeat(width - 4)}..`,
    line('H', width),
    ...Array(8).fill(`.ffff${seamed('F', 'f')}ffff.`),
    `.ffff${'f'.repeat(inner)}ffff.`,
    ...Array(2).fill(`.ffff${seamed('H', 'F')}ffff.`),
    ...Array(5).fill(`.ffff${'F'.repeat(inner)}ffff.`),
    line('f', width),
    ...Array(3).fill(`..dd${'.'.repeat(width - 8)}dd..`),
    blank(width),
  ];
}
const sofaBase = {
  version: 1,
  maxColors: 10,
  shadow: true,
  legend: { f: ['fabric', 0], F: ['fabric', 1], H: ['fabric', 2], d: ['wood_walnut', 0] },
};
// L 型沙發 68×41（v2）：左邊三個面向前方的座位（與一般沙發相同），右端轉角往前延伸一段側座，
// 坐側座的人面向左邊。右側的靠背從上面看是一條（第 11–21 列），靠背前端的立面在第 22–35 列。
// 欄位：1–4 左扶手｜5–52 三個座位｜53–60 轉角與側座座墊（53 是座墊左緣）｜61 接縫｜62–65 側靠背｜66 側靠背外緣。
function cornerSofaRows() {
  const seats = 48;
  const seamed = (fill, seam) => Array.from({ length: seats }, (_, x) => (x > 0 && x % 16 === 0 ? seam : fill)).join('');
  const none = '.'.repeat(53);
  const legs = `..dd${'.'.repeat(45)}dd..`;
  const side = (cushion, back) => `f${cushion.repeat(7)}f${back.repeat(4)}f.`;
  return [
    blank(68),
    `..${'H'.repeat(64)}..`,
    line('H', 68),
    ...Array(8).fill(`.ffff${seamed('F', 'f')}f${'F'.repeat(12)}f.`),
    `.ffff${'f'.repeat(seats)}${'f'.repeat(9)}HHHHf.`,
    ...Array(2).fill(`.ffff${seamed('H', 'F')}${side('H', 'H')}`),
    ...Array(5).fill(`.ffff${'F'.repeat(seats)}${side('H', 'H')}`),
    `.${'f'.repeat(52)}${side('H', 'H')}`,
    // 轉角座墊與側座之間的接縫
    `${legs}${side('F', 'H')}`,
    `${legs}${side('H', 'H')}`,
    `${legs}${side('H', 'F')}`,
    ...Array(8).fill(`${none}${side('H', 'F')}`),
    ...Array(5).fill(`${none}f${'F'.repeat(12)}f.`),
    `${none}${'f'.repeat(14)}.`,
    ...Array(3).fill(`${none}.dd${'.'.repeat(8)}dd..`),
    blank(68),
  ];
}
export const sofa = {
  ...sofaBase,
  id: 'hall/sofa',
  version: 2,
  size: [68, 41],
  anchor: [34, 39],
  // 落影分兩段：三人座下方、側座下方。
  shadow: [[10, 21, 38], [9, 22, 40], [10, 23, 38], [55, 38, 9], [54, 39, 11], [55, 40, 9]],
  rows: cornerSofaRows(),
};
export const armchair = { ...sofaBase, id: 'hall/armchair', size: [26, 24], anchor: [13, 21], rows: sofaRows(1) };

// 窗戶 22×16：木框、十字窗櫺、玻璃左上有反光，下緣是窗台。掛在牆上。
// 圖例：L 木亮 m 木 d 木暗｜g 玻璃亮 G 玻璃 b 玻璃暗
export const hallWindow = {
  id: 'hall/window',
  version: 1,
  size: [22, 16],
  anchor: [11, 14],
  maxColors: 8,
  legend: {
    L: ['wood_oak', 3], m: ['wood_oak', 1], d: ['wood_oak', 0],
    g: ['glass', 2], G: ['glass', 1], b: ['glass', 0],
  },
  rows: [
    blank(22),
    line('L', 22),
    '.dggggggggmmggggggggd.',
    '.dgGGGGGGGmmgGGGGGGGd.',
    '.dgGGGGGGGmmgGGGGGGGd.',
    '.dGGGGGGGGmmGGGGGGGGd.',
    '.dGGGGGGGGmmGGGGGGGGd.',
    line('m', 22),
    '.dggggggggmmggggggggd.',
    '.dgGGGGGGGmmgGGGGGGGd.',
    '.dGGGGGGGGmmGGGGGGGGd.',
    '.dGGGGGGbbmmGGGGGGbbd.',
    '.dbbbbbbbbmmbbbbbbbbd.',
    line('L', 22),
    line('d', 22),
    blank(22),
  ],
};

// 任務板 40×18：木框軟木板，釘著四張任務單（紅色圖釘、幾行字），高低錯開。這是冒險者公會的招牌物件。
// 圖例：L 木亮 d 木暗｜c 軟木｜P 紙 p 紙暗（字與下緣）｜r 圖釘
const NOTE = ['PPrrPP', 'PPPPPP', 'PppppP', 'PPPPPP', 'PpppPP', 'PPPPPP', 'pppppp'];
export const questBoard = {
  id: 'hall/quest-board',
  version: 1,
  size: [40, 18],
  anchor: [20, 16],
  maxColors: 8,
  legend: {
    L: ['wood_oak', 3], d: ['wood_oak', 0], c: ['wood_walnut', 2],
    P: ['paper', 1], p: ['paper', 0], r: ['cloth0', 1],
  },
  rows: (() => {
    const rows = [blank(40), line('L', 40), ...Array(14).fill(`.d${'c'.repeat(36)}d.`), line('d', 40), blank(40)];
    // 每張任務單的左上角：[x, y]
    for (const [x, top] of [[4, 4], [13, 6], [22, 3], [30, 7]]) {
      NOTE.forEach((note, i) => { rows[top + i] = rows[top + i].slice(0, x) + note + rows[top + i].slice(x + 6); });
    }
    return rows;
  })(),
};

// 地毯 72×24：鋪在沙發區的地上（畫在地面層，所以在家具與落影之下）。紅色邊、金色線、藍底與金色菱形。
// 圖例：f 邊｜y 金線｜B 底｜Y 菱形
export const rug = {
  id: 'hall/rug',
  version: 1,
  size: [72, 24],
  anchor: [36, 22],
  maxColors: 6,
  legend: { f: ['fabric', 0], y: ['accent4', 0], B: ['cloth1', 0], Y: ['accent4', 1] },
  rows: (() => {
    const field = y => Array.from({ length: 66 }, (_, i) => {
      const x = i + 3;
      const inDiamond = [12, 24, 36, 48, 60].some(cx => Math.abs(x - cx) + Math.abs(y - 12) <= 3);
      return inDiamond ? 'Y' : 'B';
    }).join('');
    return [
      blank(72),
      line('f', 72),
      `.f${'y'.repeat(68)}f.`,
      ...Array.from({ length: 18 }, (_, i) => `.fy${field(i + 3)}yf.`),
      `.f${'y'.repeat(68)}f.`,
      line('f', 72),
      blank(72),
    ];
  })(),
};
