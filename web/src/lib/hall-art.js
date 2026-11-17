import { chair, table } from '../art/assets/furniture.js';
import { armchair, counter, floor, shelf, sofa, stool, wall } from '../art/assets/hall.js';
import { plant } from '../art/assets/plant.js';
import { compose, render } from '../art/engine.js';
import { toArt } from '../art/svg.js';
import { SCENE_SIZE, SEAT_GROUPS, SEAT_SPOTS } from './seats.js';

// 大廳場景的固定圖層：背景（在所有角色之下）與各排前方的桌子（在該排角色之上）。
// 位置都是美術像素；角色坐在哪個家具上，見 seats.js 的 SEAT_SPOTS。

const seatsOf = prefix => Object.entries(SEAT_SPOTS).filter(([id]) => id.startsWith(prefix)).map(([, spot]) => spot);

// 每排前方的桌子（左上角座標）：工作桌的角色坐在桌子後方，桌子頂面蓋住胸口以下。
const TABLES = { upper: [[6, 70], [62, 70]], lower: [[6, 108], [62, 108]] };

export function backgroundPlacements() {
  return [
    { result: render(floor), x: 0, y: 0, ground: true },
    { result: render(wall), x: 0, y: 0, ground: true },
    { result: render(shelf), x: 14, y: 1 },
    { result: render(counter, { seed: 2 }), x: 4, y: 10 },
    { result: render(plant, { variant: { leaf: 'bush' } }), x: 126, y: 28 },
    { result: render(plant, { variant: { leaf: 'round' } }), x: 204, y: 28 },
    // 高腳椅的椅面對齊角色的大腿（角色圖第 16 列）。
    ...seatsOf('bar-').map(([x, y]) => ({ result: render(stool), x: x + 3, y: y + 15 })),
    // 工作桌的椅子：空位時椅背從桌子後方露出來。
    ...seatsOf('desk-').map(([x, y]) => ({ result: render(chair), x: x + 2, y: y + 6 })),
    { result: render(sofa), x: 128, y: 64 },
    { result: render(armchair), x: 150, y: 102 },
  ];
}

export function frontPlacements(group) {
  return (TABLES[group] ?? []).map(([x, y], i) => ({ result: render(table, { seed: i + (group === 'lower' ? 2 : 0) }), x, y }));
}

let cache = null;
// 只算一次：場景是固定的，不隨成員改變。
export function sceneArt() {
  if (!cache) {
    const [width, height] = SCENE_SIZE;
    cache = {
      background: toArt(compose(width, height, backgroundPlacements())),
      fronts: Object.fromEntries(SEAT_GROUPS
        .filter(group => TABLES[group.name])
        .map(group => [group.name, toArt(compose(width, height, frontPlacements(group.name)))])),
    };
  }
  return cache;
}
