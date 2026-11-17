import { chair, table } from '../art/assets/furniture.js';
import { armchair, counter, floor, hallWindow, questBoard, rug, shelf, sofa, stool, wall } from '../art/assets/hall.js';
import { plant } from '../art/assets/plant.js';
import { compose, render } from '../art/engine.js';
import { toArt } from '../art/svg.js';
import { SCENE_SIZE, SEAT_GROUPS, SEAT_SPOTS } from './seats.js';

// 大廳場景的固定圖層：背景（在所有角色之下）與各排的桌子（在該排角色之上、下一排角色之下）。
// 位置都是美術像素；角色坐在哪裡、面向哪裡，見 seats.js 的 SEAT_SPOTS。

// 每排的桌子（左上角座標）：桌面比桌後角色圖低 17 格，露出頭和肩膀。
// 桌前（背面）的人坐得比桌子低，頭只蓋住桌面的下半，桌面上半仍看得到。
const TABLES = { upper: [[20, 69], [76, 69]], lower: [[20, 117], [76, 117]] };

// 每個位子下面的家具：桌後正面的人坐椅子（空位時椅背從桌子後方露出），其他吧檯、桌前、桌頭坐高腳椅。
// 高腳椅的椅面對齊角色的臀部（背面第 18 列、側面第 17 列）。沙發區的家具是沙發本身。
function seatFurniture([id, { x, y, facing }]) {
  if (id.startsWith('sofa-')) return [];
  if (facing === 'front') return [{ result: render(chair), x: x + 2, y: y + 6 }];
  const offset = { back: 3, left: 2, right: 4 }[facing];
  return [{ result: render(stool), x: x + offset, y: y + 17 }];
}

export function backgroundPlacements() {
  return [
    { result: render(floor), x: 0, y: 0, ground: true },
    { result: render(wall), x: 0, y: 0, ground: true },
    // 地毯是地面的一部分：家具的落影會畫在地毯上。
    { result: render(rug), x: 134, y: 110, ground: true },
    // 牆上：窗戶、任務板、窗戶。
    { result: render(hallWindow), x: 118, y: 1 },
    { result: render(questBoard), x: 146, y: 1 },
    { result: render(hallWindow), x: 192, y: 1 },
    { result: render(shelf), x: 14, y: 1 },
    { result: render(counter, { seed: 2 }), x: 4, y: 10 },
    { result: render(plant, { variant: { leaf: 'bush' } }), x: 124, y: 28 },
    { result: render(plant, { variant: { leaf: 'round' } }), x: 204, y: 28 },
    { result: render(plant, { variant: { leaf: 'spiky' } }), x: 204, y: 138 },
    ...Object.entries(SEAT_SPOTS).flatMap(seatFurniture),
    { result: render(sofa), x: 134, y: 52 },
    { result: render(armchair), x: 136, y: 96 },
    { result: render(armchair), x: 176, y: 96 },
  ];
}

export function tablePlacements(name) {
  return (TABLES[name] ?? []).map(([x, y], i) => ({ result: render(table, { seed: i + (name === 'lower' ? 2 : 0) }), x, y }));
}

let cache = null;
// 只算一次：場景是固定的，不隨成員改變。
export function sceneArt() {
  if (!cache) {
    const [width, height] = SCENE_SIZE;
    cache = {
      background: toArt(compose(width, height, backgroundPlacements())),
      tables: Object.fromEntries(SEAT_GROUPS
        .filter(group => group.tables)
        .map(group => [group.tables, toArt(compose(width, height, tablePlacements(group.tables)))])),
    };
  }
  return cache;
}
