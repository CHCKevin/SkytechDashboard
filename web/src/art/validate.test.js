import { describe, expect, it } from 'vitest';
import { render } from './engine.js';
import { EYE, OUTLINE, PALETTE, RAMPS } from './style.js';
import { validate } from './validate.js';

const asset = {
  id: 'test/v',
  version: 1,
  size: [5, 5],
  anchor: [2, 3],
  maxColors: 3,
  legend: { m: ['wood_oak', 1] },
  rows: ['.....', '.mmm.', '.mmm.', '.mmm.', '.....'],
};
const good = () => render(asset);
const rules = issues => [...new Set(issues.map(issue => issue.rule))];
const set = (result, x, y, value) => { result.body[y * result.width + x] = value; return result; };

describe('validate', () => {
  it('正常的資產沒有問題', () => {
    expect(validate(good(), asset)).toEqual([]);
  });

  it('A1 尺寸不符', () => {
    expect(rules(validate(good(), { ...asset, size: [6, 5] }))).toEqual(['size']);
  });

  it('A2 不在調色盤的索引', () => {
    expect(rules(validate(set(good(), 2, 2, PALETTE.length), asset))).toContain('palette');
  });

  it('A4 邊緣不是外框色', () => {
    expect(rules(validate(set(good(), 0, 2, RAMPS.wood_oak[1]), asset))).toContain('outline');
  });

  it('A5 沒有接到物件本體的外框', () => {
    const result = set(set(set(good(), 0, 2, 0), 0, 1, 0), 0, 3, 0);
    expect(rules(validate(set(result, 0, 0, OUTLINE), asset))).toContain('outline-attached');
  });

  it('A6 用色太多', () => {
    const result = set(set(good(), 1, 1, RAMPS.wood_oak[0]), 3, 3, RAMPS.wood_oak[2]);
    expect(rules(validate(result, asset))).toContain('colors');
  });

  it('A7 孤立像素；眼睛除外', () => {
    expect(rules(validate(set(good(), 2, 2, RAMPS.wood_oak[0]), { ...asset, maxColors: 9 }))).toEqual(['isolated']);
    expect(validate(set(good(), 2, 2, EYE), { ...asset, maxColors: 9 })).toEqual([]);
  });

  it('A8 錨點在圖外或錨點列沒有內容', () => {
    expect(rules(validate({ ...good(), anchor: { x: 2, y: 9 } }, asset))).toEqual(['anchor']);
    expect(rules(validate({ ...good(), anchor: { x: 2, y: 0 } }, asset))).toEqual(['anchor']);
  });
});
