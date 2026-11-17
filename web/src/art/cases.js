import { render } from './engine.js';
import { character, lookIndices } from './assets/character.js';
import { chair, table } from './assets/furniture.js';
import { plant } from './assets/plant.js';

// 固定的資產樣本：黃金指紋測試與目錄都用這份清單。
// 改了資產的外觀要把該資產的 version 加一，再執行 npm run art:catalog -- --update-golden。
export const CASES = [
  { name: 'chair-oak', asset: chair, variant: { wood: 'wood_oak' } },
  { name: 'chair-walnut', asset: chair, variant: { wood: 'wood_walnut' } },
  { name: 'table-oak', asset: table, variant: { wood: 'wood_oak' }, seed: 0 },
  { name: 'table-walnut', asset: table, variant: { wood: 'wood_walnut' }, seed: 1 },
  ...plant.variants.leaf.map(leaf => ({ name: `plant-${leaf}`, asset: plant, variant: { leaf } })),
  ...[1, 11, 12, 13, 14].flatMap(userId => ['working', 'resting'].map(status => ({
    name: `character-${userId}-${status}`, asset: character, variant: { ...lookIndices(userId), status },
  }))),
];

export const renderCase = ({ asset, variant, seed }) => render(asset, { variant, seed });
