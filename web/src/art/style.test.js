import { describe, expect, it } from 'vitest';
import { EYE, OUTLINE, PALETTE, RAMP_DEFS, RAMPS, RULES, SHADOW, hsbToHex } from './style.js';

// 色相到黃色（60 度）的圓周距離。
const toYellow = hue => {
  const d = Math.abs((((hue - 60) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
};
const hueStep = (a, b) => Math.abs(((((b - a) % 360) + 540) % 360) - 180);

describe('hsbToHex', () => {
  it('轉換基本顏色', () => {
    expect(hsbToHex([0, 100, 100])).toBe('#ff0000');
    expect(hsbToHex([120, 100, 100])).toBe('#00ff00');
    expect(hsbToHex([240, 100, 50])).toBe('#000080');
    expect(hsbToHex([0, 0, 100])).toBe('#ffffff');
  });
});

describe('調色盤', () => {
  it('索引 0 是透明，其餘都是 #rrggbb', () => {
    expect(PALETTE[0]).toBeNull();
    for (const hex of PALETTE.slice(1)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('P1 總色數不超過上限，且沒有重複的顏色', () => {
    const colors = PALETTE.slice(1);
    expect(colors.length).toBeLessThanOrEqual(RULES.maxColors);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('色階索引對應到定義的顏色', () => {
    for (const [name, defs] of Object.entries(RAMP_DEFS)) {
      expect(RAMPS[name].map(index => PALETTE[index])).toEqual(defs.map(hsbToHex));
    }
  });

  it('P5 外框色不是純黑；外框、眼睛、落影都在調色盤裡', () => {
    expect(PALETTE[OUTLINE]).not.toBe('#000000');
    for (const index of [OUTLINE, EYE, SHADOW]) expect(PALETTE[index]).toMatch(/^#/);
  });
});

describe('色階規則', () => {
  for (const [name, defs] of Object.entries(RAMP_DEFS)) {
    it(`${name}：P2 階數與亮度遞增`, () => {
      expect(defs.length).toBeGreaterThanOrEqual(2);
      expect(defs.length).toBeLessThanOrEqual(4);
      defs.slice(1).forEach((def, i) => expect(def[2]).toBeGreaterThan(defs[i][2]));
    });

    it(`${name}：P3 色相每階不超過 ${RULES.maxHueStep} 度，越亮越接近黃色`, () => {
      defs.slice(1).forEach((def, i) => {
        const prev = defs[i];
        if (prev[1] < RULES.hueCheckMinSaturation || def[1] < RULES.hueCheckMinSaturation) return;
        expect(hueStep(prev[0], def[0])).toBeLessThanOrEqual(RULES.maxHueStep);
        expect(toYellow(def[0])).toBeLessThanOrEqual(toYellow(prev[0]));
      });
    });

    if (defs.length >= 3) {
      it(`${name}：P4 最亮階飽和度低於中間階`, () => {
        expect(defs.at(-1)[1]).toBeLessThan(defs[Math.floor(defs.length / 2)][1]);
      });
    }
  }
});
