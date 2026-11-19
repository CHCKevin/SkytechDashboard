import { describe, expect, it } from 'vitest';
import { compose, fingerprint, flatten, render } from './engine.js';
import { OUTLINE, RAMPS, SHADOW } from './style.js';
import { validate } from './validate.js';

const tiny = {
  id: 'test/tiny',
  version: 1,
  size: [5, 5],
  anchor: [2, 3],
  maxColors: 4,
  legend: { m: ['wood', 1], d: ['wood', 0] },
  variants: { wood: ['wood_oak', 'wood_walnut'] },
  slots: variant => ({ wood: variant.wood }),
  rows: ['.....', '.mmm.', '.mdm.', '.mmm.', '.....'],
};
const at = (result, x, y) => result.body[y * result.width + x];

describe('render', () => {
  it('依圖例與變體上色', () => {
    const result = render(tiny);
    expect(at(result, 1, 1)).toBe(RAMPS.wood_oak[1]);
    expect(at(result, 2, 2)).toBe(RAMPS.wood_oak[0]);
    expect(at(render(tiny, { variant: { wood: 'wood_walnut' } }), 1, 1)).toBe(RAMPS.wood_walnut[1]);
  });

  it('在輪廓外的上下左右加上外框，斜角不加', () => {
    const result = render(tiny);
    expect(at(result, 0, 1)).toBe(OUTLINE);
    expect(at(result, 1, 0)).toBe(OUTLINE);
    expect(at(result, 0, 0)).toBe(0);
    expect(at(result, 4, 4)).toBe(0);
  });

  it('沒有落影設定時 shadow 為 null', () => {
    expect(render(tiny).shadow).toBeNull();
  });

  it('錯誤的樣板會丟出錯誤', () => {
    expect(() => render({ ...tiny, rows: ['.....'] })).toThrow(/樣板大小/);
    expect(() => render({ ...tiny, rows: ['.....', '.mxm.', '.mmm.', '.mmm.', '.....'] })).toThrow(/圖例沒有「x」/);
    expect(() => render(tiny, { variant: { wood: 'pine' } })).toThrow(/變體/);
  });

  it('同樣的輸入輸出完全相同', () => {
    expect(fingerprint(render(tiny))).toBe(fingerprint(render(tiny)));
    expect(fingerprint(render(tiny))).not.toBe(fingerprint(render(tiny, { variant: { wood: 'wood_walnut' } })));
  });
});

describe('outline: false', () => {
  it('鋪滿的資產不加外框，驗證也不要求外框', () => {
    const fill = { ...tiny, id: 'test/fill', outline: false, rows: Array(5).fill('mmmmm') };
    const result = render(fill);
    expect([...result.body].every(value => value === RAMPS.wood_oak[1])).toBe(true);
    expect(validate(result, fill)).toEqual([]);
  });
});

describe('compose', () => {
  const dot = { ...tiny, id: 'test/dot', size: [3, 3], anchor: [1, 1], rows: ['...', '.m.', '...'] };
  const floor = { ...tiny, id: 'test/floor', size: [6, 4], outline: false, rows: Array(4).fill('dddddd') };

  it('地面先畫、物件依順序蓋上去、超出範圍的部分裁掉', () => {
    const image = compose(6, 4, [
      { result: render(dot), x: 4, y: 2 },
      { result: render(floor), x: 0, y: 0, ground: true },
      { result: render(dot, { variant: { wood: 'wood_walnut' } }), x: 0, y: 0 },
    ]);
    const px = (x, y) => image.pixels[y * 6 + x];
    expect(px(1, 1)).toBe(RAMPS.wood_walnut[1]);
    expect(px(5, 3)).toBe(RAMPS.wood_oak[1]);
    expect(px(3, 0)).toBe(RAMPS.wood_oak[0]);
    expect(px(2, 1)).toBe(OUTLINE);
  });

  it('落影畫在所有物件之下、地面之上', () => {
    const box = { ...dot, id: 'test/sbox', size: [6, 4], anchor: [3, 2], shadow: true, rows: ['......', '.mmmm.', '.mmmm.', '......'] };
    const image = compose(6, 4, [
      { result: render(floor), x: 0, y: 0, ground: true },
      { result: render(box), x: 0, y: 0 },
    ]);
    expect(image.pixels[3 * 6 + 3]).toBe(OUTLINE);
    expect(image.pixels[2 * 6 + 3]).toBe(RAMPS.wood_oak[1]);
    // (2,2) 同時有落影與物件：物件在上。
    expect(render(box).shadow[2 * 6 + 2]).toBe(SHADOW);
    expect(image.pixels[2 * 6 + 2]).toBe(RAMPS.wood_oak[1]);
  });
});

describe('木紋', () => {
  const plank = {
    id: 'test/plank',
    version: 1,
    size: [20, 9],
    anchor: [10, 7],
    maxColors: 4,
    legend: { T: ['wood_oak', 2, 'grain'] },
    rows: ['....................', ...Array(7).fill('.' + 'T'.repeat(18) + '.'), '....................'],
  };

  it('每三列一條木紋線，使用暗一階的顏色', () => {
    const result = render(plank, { seed: 0 });
    const lineRows = [1, 2, 3, 4, 5, 6, 7].filter(y => {
      const row = Array.from({ length: 18 }, (_, i) => at(result, i + 1, y));
      return row.includes(RAMPS.wood_oak[1]);
    });
    expect(lineRows).toEqual([3, 6]);
  });

  it('種子決定斷點，同種子相同、不同種子不同', () => {
    expect(fingerprint(render(plank, { seed: 4 }))).toBe(fingerprint(render(plank, { seed: 4 })));
    expect(fingerprint(render(plank, { seed: 4 }))).not.toBe(fingerprint(render(plank, { seed: 5 })));
  });

  it('不會產生孤立像素', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      expect(validate(render(plank, { seed }), plank)).toEqual([]);
    }
  });
});

describe('落影', () => {
  const box = { ...tiny, id: 'test/box', size: [12, 8], anchor: [6, 5], shadow: true,
    rows: ['............', '.mmmmmmmmmm.', '.mmmmmmmmmm.', '.mmmmmmmmmm.', '.mmmmmmmmmm.', '.mmmmmmmmmm.', '............', '............'] };

  it('是獨立圖層，只用落影色，畫在最下面兩列並置中', () => {
    const result = render(box);
    const cells = [...result.shadow.entries()].filter(([, value]) => value);
    expect(cells.every(([, value]) => value === SHADOW)).toBe(true);
    const rows = new Set(cells.map(([i]) => Math.floor(i / 12)));
    expect([...rows]).toEqual([6, 7]);
    const xs = cells.filter(([i]) => Math.floor(i / 12) === 6).map(([i]) => i % 12);
    expect(xs).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('flatten 把物件畫在落影上面', () => {
    const result = render(box);
    const flat = flatten(result);
    expect(flat[6 * 12 + 1]).toBe(OUTLINE);
    expect(flat[6 * 12 + 4]).toBe(OUTLINE);
    expect(flat[7 * 12 + 4]).toBe(SHADOW);
  });
});
