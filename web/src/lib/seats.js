// 區域與位子數；位子編號（例如 desk-3）同時用來對應場景中的位置。
const ZONES = { bar: 6, desk: 20, sofa: 5 };
// 狀態跟著角色走，區域只是偏好：偏好的區坐滿就往下一個找。
const PREFERENCE = {
  resting: ['sofa', 'bar', 'desk'],
  working: ['desk', 'bar', 'sofa'],
  idle: ['bar', 'sofa', 'desk'],
};
// 先排休息、再排工作中、最後排發呆；同狀態內依輸入（加入大廳）的順序。
const ORDER = ['resting', 'working', 'idle'];

export const SEAT_IDS = Object.entries(ZONES).flatMap(([zone, count]) =>
  Array.from({ length: count }, (_, index) => `${zone}-${index + 1}`));

// 大廳成員上限；必須與伺服器 server/hall.mjs 的 HALL_CAPACITY 相同。
// 位子比成員多，任何一區都放得下所有同狀態的人的大部分，坐不下的往下一區找，所以每位成員一定有位子。
export const HALL_CAPACITY = 16;

// 場景的原生大小（美術像素）。桌面 3 倍、較窄的視窗 2 倍，見 pixel.css 的 --px。
export const SCENE_SIZE = [220, 160];

// 每個位子上角色圖（16×24）的左上角座標，以及角色面向哪裡。
// 吧檯：面向吧檯坐高腳椅（看到背面）。
// 工作桌：桌子後方面向我們（正面）、桌子前方面向桌子（背面）、桌頭坐側面。
// 沙發：面向我們。
// 位子編號的順序就是同一區內的入座順序：工作桌先坐看得到臉的桌後，再坐桌頭，最後坐桌前。
const spot = (x, y, facing) => ({ x, y, facing });
export const SEAT_SPOTS = {
  'bar-1': spot(6, 22, 'back'), 'bar-2': spot(24, 22, 'back'), 'bar-3': spot(42, 22, 'back'),
  'bar-4': spot(60, 22, 'back'), 'bar-5': spot(78, 22, 'back'), 'bar-6': spot(96, 22, 'back'),
  'desk-1': spot(20, 52, 'front'), 'desk-2': spot(36, 52, 'front'), 'desk-3': spot(76, 52, 'front'), 'desk-4': spot(92, 52, 'front'),
  'desk-5': spot(20, 100, 'front'), 'desk-6': spot(36, 100, 'front'), 'desk-7': spot(76, 100, 'front'), 'desk-8': spot(92, 100, 'front'),
  'desk-9': spot(4, 56, 'right'), 'desk-10': spot(108, 56, 'left'), 'desk-11': spot(4, 104, 'right'), 'desk-12': spot(108, 104, 'left'),
  'desk-13': spot(20, 78, 'back'), 'desk-14': spot(36, 78, 'back'), 'desk-15': spot(76, 78, 'back'), 'desk-16': spot(92, 78, 'back'),
  'desk-17': spot(20, 126, 'back'), 'desk-18': spot(36, 126, 'back'), 'desk-19': spot(76, 126, 'back'), 'desk-20': spot(92, 126, 'back'),
  'sofa-1': spot(139, 48, 'front'), 'sofa-2': spot(155, 48, 'front'), 'sofa-3': spot(171, 48, 'front'),
  'sofa-4': spot(141, 92, 'front'), 'sofa-5': spot(181, 92, 'front'),
};

// 場景由上往下分「排」輸出：一排的角色畫完，才畫該排的桌子（tables），之後的排蓋住之前的排。
// 坐在桌子前方（背面）的人自成一排，排在桌子之後，所以會蓋住桌子。
export const SEAT_GROUPS = [
  { name: 'bar', seats: ['bar-1', 'bar-2', 'bar-3', 'bar-4', 'bar-5', 'bar-6'] },
  { name: 'upper', seats: ['desk-1', 'desk-2', 'desk-3', 'desk-4', 'desk-9', 'desk-10', 'sofa-1', 'sofa-2', 'sofa-3'], tables: 'upper' },
  { name: 'upper-front', seats: ['desk-13', 'desk-14', 'desk-15', 'desk-16'] },
  { name: 'lower', seats: ['desk-5', 'desk-6', 'desk-7', 'desk-8', 'desk-11', 'desk-12', 'sofa-4', 'sofa-5'], tables: 'lower' },
  { name: 'lower-front', seats: ['desk-17', 'desk-18', 'desk-19', 'desk-20'] },
];

// 位子的 CSS（不能用 inline style，所以由這裡產生 styles/seats.css；執行 npm run art:seats）。
export function seatsCss() {
  const rules = Object.entries(SEAT_SPOTS).map(([id, { x, y }]) =>
    `.seat[data-seat='${id}'] { left: calc(var(--px) * ${x}); top: calc(var(--px) * ${y}); }`);
  return `/* 由 web/src/lib/seats.js 的 SEAT_SPOTS 產生（npm run art:seats），不要手動修改。 */\n${rules.join('\n')}\n`;
}

// 回傳 { 位子編號: 成員 }。純函式：輸入相同時輸出相同，資料沒變時角色不會換位子。
export function assignSeats(members) {
  const used = { bar: 0, desk: 0, sofa: 0 };
  const seats = {};
  for (const status of ORDER) {
    for (const member of members.filter(item => item.status === status)) {
      const zone = PREFERENCE[status].find(name => used[name] < ZONES[name]);
      if (!zone) continue;
      used[zone] += 1;
      seats[`${zone}-${used[zone]}`] = member;
    }
  }
  return seats;
}
