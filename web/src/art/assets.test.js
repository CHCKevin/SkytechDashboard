import { describe, expect, it } from 'vitest';
import looksV1 from './looks-v1.json';
import { ANIMATIONS, FACINGS, HAIR_NAMES, character, lookIndices, renderCharacter, renderFrames } from './assets/character.js';
import { chair, table } from './assets/furniture.js';
import { plant } from './assets/plant.js';
import { CASES, renderCase } from './cases.js';
import { fingerprint, render } from './engine.js';
import golden from './golden.json';
import { validate } from './validate.js';


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
  it('抽選結果與第二階段的 lookFor 相同（換畫法後造型類型不變）', () => {
    looksV1.looks.forEach((expected, i) => {
      const look = lookIndices(i + 1);
      expect([look.hair, look.hat, look.hairColor, look.skin, look.cloth, look.accent].join(',')).toBe(expected);
    });
  });

  it('1000 位使用者、三種狀態都通過驗證', () => {
    for (let userId = 1; userId <= 1000; userId += 1) {
      for (const status of character.variants.status) {
        expect(validate(renderCharacter(userId, status), character)).toEqual([]);
      }
    }
  });

  it('四個方向 × 髮型 × 頭飾 × 狀態 × 幀，全部通過驗證', () => {
    for (const facing of FACINGS) {
      for (const hair of HAIR_NAMES) {
        for (const hat of character.variants.hat) {
          for (const status of character.variants.status) {
            for (const frame of [0, 1]) {
              const issues = validate(render(character, { variant: { facing, hair, hat, status, frame } }), character);
              expect([facing, hair, hat, status, frame, issues]).toEqual([facing, hair, hat, status, frame, []]);
            }
          }
        }
      }
    }
  });

  it('四個方向長得都不一樣；右側面是左側面左右翻轉', () => {
    const [front, back, left, right] = FACINGS.map(facing => renderCharacter(12, 'working', { facing }));
    expect(new Set([front, back, left, right].map(fingerprint)).size).toBe(4);
    for (let y = 0; y < 24; y += 1) {
      const row = r => [...r.body.subarray(y * 16, (y + 1) * 16)];
      expect(row(right)).toEqual(row(left).reverse());
    }
  });

  it('A11 同一個動畫的每一幀尺寸與錨點相同；休息只有 1 幀', () => {
    for (const facing of FACINGS) {
      for (const status of character.variants.status) {
        const frames = renderFrames(7, status, facing);
        expect(frames).toHaveLength(ANIMATIONS[status].frames);
        for (const frame of frames) {
          expect([frame.width, frame.height, frame.anchor]).toEqual([16, 24, { x: 8, y: 21 }]);
        }
      }
    }
  });

  it('A12 動畫只動允許的區域：工作中動上半身（第 0–17 列），發呆只動頭（第 0–11 列）', () => {
    const changedRows = (a, b) => [...a.body.keys()].filter(i => a.body[i] !== b.body[i]).map(i => Math.floor(i / 16));
    for (let userId = 1; userId <= 50; userId += 1) {
      for (const facing of FACINGS) {
        const [w0, w1] = renderFrames(userId, 'working', facing);
        const [i0, i1] = renderFrames(userId, 'idle', facing);
        expect(Math.max(...changedRows(w0, w1))).toBeLessThanOrEqual(ANIMATIONS.working.moves + 1);
        expect(Math.max(...changedRows(i0, i1))).toBeLessThanOrEqual(ANIMATIONS.idle.moves + 1);
        expect(changedRows(i0, i1).length).toBeGreaterThan(0);
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
