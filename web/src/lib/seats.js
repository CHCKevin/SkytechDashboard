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
