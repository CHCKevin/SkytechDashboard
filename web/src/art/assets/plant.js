// 盆栽 12×16：上面是葉子（三種葉形），下面是陶盆。葉子左上亮、右下暗。
// 圖例：v 葉最暗 V 葉暗 W 葉亮 X 葉高光｜q 盆暗 Q 盆 K 盆亮
const LEAVES = {
  round: [
    '....XWWW....',
    '...XWWWVV...',
    '..XWWVVVVV..',
    '..WWVVVVVv..',
    '..VVVVVVvv..',
    '...VVvvVv...',
    '....vVVv....',
    '.....vv.....',
    '.....vv.....',
  ],
  spiky: [
    '.X...W...X..',
    '.W..XV..WV..',
    '..WVXVV.Vv..',
    '..VWWVvvVv..',
    '...VVVVVv...',
    '....VVvv....',
    '.....vv.....',
    '.....vv.....',
    '.....vv.....',
  ],
  bush: [
    '...WWX.WX...',
    '..WVVWWVVW..',
    '.WVVVVVVVVX.',
    '.VVVvVVVvVV.',
    '.vVVvVVVvVv.',
    '..vVVvvVVv..',
    '...vvVVvv...',
    '.....vv.....',
    '.....vv.....',
  ],
};
const POT = ['..KKKKKKKK..', '..QQQQQQQQ..', '...QQQQQQ...', '...QQQQQQ...', '...qqqqqq...', '............'];

export const plant = {
  id: 'decor/plant',
  version: 1,
  size: [12, 16],
  anchor: [6, 14],
  maxColors: 8,
  shadow: true,
  legend: {
    v: ['leaf', 0], V: ['leaf', 1], W: ['leaf', 2], X: ['leaf', 3],
    q: ['clay', 0], Q: ['clay', 1], K: ['clay', 2],
  },
  variants: { leaf: Object.keys(LEAVES) },
  rows: variant => ['............', ...LEAVES[variant.leaf], ...POT],
};
