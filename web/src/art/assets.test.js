import { describe, expect, it } from 'vitest';
import { lookFor } from '../lib/sprite.js';
import { HAIR_NAMES, character, lookIndices, renderCharacter } from './assets/character.js';
import { chair, table } from './assets/furniture.js';
import { plant } from './assets/plant.js';
import { CASES, renderCase } from './cases.js';
import { fingerprint, render } from './engine.js';
import golden from './golden.json';
import { validate } from './validate.js';

// lib/sprite.js 現行的顏色清單（只用來比對抽選結果的索引）。
const OLD = {
  hairColor: ['#3a2a1a', '#15110e', '#7a4a20', '#c9c9c9', '#d9a441', '#b5432e'],
  skin: ['#f2c9a0', '#e0b088', '#c98f66', '#8d5a3b'],
  cloth: ['#d94f4f', '#4f8fd9', '#58b368', '#b06fd6', '#e0a030', '#3fb5b0', '#d96fa8', '#8a8a8a'],
  accent: ['#5b3fa8', '#9aa3ad', '#c23a3a', '#2e7d4f', '#d9b441'],
};

describe('四個原型資產', () => {
  it.each(CASES.map(c => [c.name, c]))('%s 通過驗證', (_, c) => {
    expect(validate(renderCase(c), c.asset)).toEqual([]);
  });

  it('A10 不同變體的像素不同', () => {
    const prints = list => new Set(list.map(fingerprint)).size;
    expect(prints(chair.variants.wood.map(wood => render(chair, { variant: { wood } })))).toBe(2);
    expect(prints(plant.variants.leaf.map(leaf => render(plant, { variant: { leaf } })))).toBe(3);
    expect(prints([0, 1, 2].map(seed => render(table, { seed })))).toBe(3);
  });

  it('A13 與黃金指紋相同', () => {
    for (const c of CASES) expect([c.name, fingerprint(renderCase(c))]).toEqual([c.name, golden[c.name]]);
    expect(Object.keys(golden).sort()).toEqual(CASES.map(c => c.name).sort());
  });

  it('桌子頂面佔物件高度的 1/2 到 2/3', () => {
    const body = table.rows.filter(row => /[^.]/.test(row));
    const top = body.filter(row => /[LT]/.test(row));
    expect(top.length / body.length).toBeGreaterThanOrEqual(1 / 2);
    expect(top.length / body.length).toBeLessThanOrEqual(2 / 3);
  });

  it('有落影的資產，落影是獨立圖層；人物沒有落影（坐在椅子上）', () => {
    for (const asset of [chair, table, plant]) expect(render(asset).shadow).toBeInstanceOf(Uint8Array);
    expect(render(character).shadow).toBeNull();
  });
});

describe('人物', () => {
  it('抽選結果與現行 lookFor 相同（換畫法後造型類型不變）', () => {
    for (let userId = 1; userId <= 1000; userId += 1) {
      const look = lookIndices(userId);
      const old = lookFor(userId);
      expect(look.hair).toBe(old.hair);
      expect(look.hat).toBe(old.hat);
      for (const key of ['hairColor', 'skin', 'cloth', 'accent']) expect(OLD[key][look[key]]).toBe(old[key]);
    }
  });

  it('1000 位使用者、三種狀態都通過驗證', () => {
    for (let userId = 1; userId <= 1000; userId += 1) {
      for (const status of character.variants.status) {
        expect(validate(renderCharacter(userId, status), character)).toEqual([]);
      }
    }
  });

  it('所有髮型與頭飾的組合都通過驗證', () => {
    for (const hair of HAIR_NAMES) {
      for (const hat of character.variants.hat) {
        expect([hair, hat, validate(render(character, { variant: { hair, hat } }), character)]).toEqual([hair, hat, []]);
      }
    }
  });

  it('休息時閉眼，與工作中不同；發呆目前與工作中相同（動畫在第 4 階段）', () => {
    expect(fingerprint(renderCharacter(12, 'resting'))).not.toBe(fingerprint(renderCharacter(12, 'working')));
    expect(fingerprint(renderCharacter(12, 'idle'))).toBe(fingerprint(renderCharacter(12, 'working')));
  });

  it('不同使用者大多長得不一樣', () => {
    const prints = new Set(Array.from({ length: 100 }, (_, i) => fingerprint(renderCharacter(i + 1))));
    expect(prints.size).toBeGreaterThan(90);
  });
});
