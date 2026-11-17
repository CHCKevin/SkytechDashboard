// 公會大廳的場景資產：地板、牆、酒架、吧檯、高腳椅、沙發。風格規則與家具相同（3/4 俯視、光源在左上）。
const line = (fill, width) => `.${fill.repeat(width - 2)}.`;
const blank = width => '.'.repeat(width);

// 地板 220×144：木板每 8 列一塊，上緣一列亮、下緣一列暗；木板接縫每塊錯開。鋪滿整張圖，不加外框。
export const floor = {
  id: 'hall/floor',
  version: 1,
  size: [220, 144],
  anchor: [110, 143],
  maxColors: 4,
  outline: false,
  legend: { d: ['floor', 0], m: ['floor', 1], l: ['floor', 2] },
  rows: Array.from({ length: 144 }, (_, y) => {
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
export const sofa = { ...sofaBase, id: 'hall/sofa', size: [58, 24], anchor: [29, 21], rows: sofaRows(3) };
export const armchair = { ...sofaBase, id: 'hall/armchair', size: [26, 24], anchor: [13, 21], rows: sofaRows(1) };
