// 區域與位子數；位子編號（例如 desk-3）同時用來對應場景中的位置。
const ZONES = { bar: 5, desk: 7, sofa: 4 };
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

// 成員上限等於位子數，所以每位成員一定有位子；伺服器的 HALL_CAPACITY 必須與此相同。
export const HALL_CAPACITY = SEAT_IDS.length;

// 場景的原生大小（美術像素）。桌面 3 倍、窄螢幕 2 倍，見 pixel.css 的 --px。
export const SCENE_SIZE = [220, 144];

// 每個位子上角色圖（16×24）的左上角座標。角色只畫正面，所以都坐在家具後方或家具上：
// 吧檯：背對吧檯坐高腳椅；工作桌：坐在桌子後方；沙發：坐在沙發上。
export const SEAT_SPOTS = {
  'bar-1': [10, 22], 'bar-2': [30, 22], 'bar-3': [50, 22], 'bar-4': [70, 22], 'bar-5': [90, 22],
  'desk-1': [6, 56], 'desk-2': [22, 56], 'desk-3': [62, 56], 'desk-4': [78, 56],
  'desk-5': [6, 94], 'desk-6': [22, 94], 'desk-7': [70, 94],
  'sofa-1': [133, 60], 'sofa-2': [149, 60], 'sofa-3': [165, 60], 'sofa-4': [155, 98],
};

// 場景依「排」輸出：同一排的角色畫完，才畫該排前方的桌子，後面的排蓋住前面的排。
export const SEAT_GROUPS = [
  { name: 'back', seats: ['bar-1', 'bar-2', 'bar-3', 'bar-4', 'bar-5'] },
  { name: 'upper', seats: ['desk-1', 'desk-2', 'desk-3', 'desk-4', 'sofa-1', 'sofa-2', 'sofa-3'] },
  { name: 'lower', seats: ['desk-5', 'desk-6', 'desk-7', 'sofa-4'] },
];

// 位子的 CSS（不能用 inline style，所以由這裡產生 styles/seats.css；執行 npm run art:seats）。
export function seatsCss() {
  const rules = Object.entries(SEAT_SPOTS).map(([id, [x, y]]) =>
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
