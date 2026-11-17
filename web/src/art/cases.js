import { render } from './engine.js';
import { character, lookIndices } from './assets/character.js';
import { chair, table } from './assets/furniture.js';
import { armchair, counter, floor, shelf, sofa, stool, wall } from './assets/hall.js';
import { plant } from './assets/plant.js';

// 固定的資產樣本：黃金指紋測試與目錄都用這份清單。
// 改了資產的外觀要把該資產的 version 加一，再執行 npm run art:catalog -- --update-golden。
export const CASES = [
  { name: 'chair-oak', asset: chair, variant: { wood: 'wood_oak' } },
  { name: 'chair-walnut', asset: chair, variant: { wood: 'wood_walnut' } },
  { name: 'table-oak', asset: table, variant: { wood: 'wood_oak' }, seed: 0 },
  { name: 'table-walnut', asset: table, variant: { wood: 'wood_walnut' }, seed: 1 },
  ...plant.variants.leaf.map(leaf => ({ name: `plant-${leaf}`, asset: plant, variant: { leaf } })),
  { name: 'hall-floor', asset: floor },
  { name: 'hall-wall', asset: wall },
  { name: 'hall-shelf', asset: shelf },
  { name: 'hall-counter', asset: counter, seed: 2 },
  { name: 'hall-stool', asset: stool },
  { name: 'hall-sofa', asset: sofa },
  { name: 'hall-armchair', asset: armchair },
  ...[1, 11, 12, 13, 14].flatMap(userId => ['working', 'resting'].map(status => ({
    name: `character-${userId}-${status}`, asset: character, variant: { ...lookIndices(userId), status },
  }))),
];

export const renderCase = ({ asset, variant, seed }) => render(asset, { variant, seed });
