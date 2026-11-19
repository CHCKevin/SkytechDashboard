// 像素風格規格：調色盤、色階與規則。數字的依據見 docs/pixel-art/03-style-specification.md。
// 調色盤或規則改變時要把 STYLE_VERSION 加一，並重新產生 golden.json。
export const STYLE_VERSION = 2;

export const RULES = {
  tile: 16,
  maxColors: 128,
  maxHueStep: 20,
  // 飽和度太低的顏色（灰、黑）看不出色相，不檢查色相規則。
  hueCheckMinSaturation: 15,
};

// 每條色階由暗到亮，每階是 [色相°, 飽和度%, 亮度%]。越亮越偏黃，越暗越偏藍紫。
export const RAMP_DEFS = {
  skin0: [[18, 45, 72], [24, 32, 93], [30, 20, 99]],
  skin1: [[16, 50, 64], [22, 38, 86], [28, 26, 96]],
  skin2: [[14, 55, 52], [20, 48, 76], [26, 36, 90]],
  skin3: [[10, 55, 34], [16, 52, 52], [22, 42, 68]],
  hair0: [[20, 60, 18], [28, 55, 26], [34, 45, 36]],
  hair1: [[20, 30, 7], [25, 25, 12], [30, 20, 20]],
  hair2: [[18, 70, 34], [26, 72, 48], [32, 60, 64]],
  hair3: [[30, 6, 55], [35, 4, 72], [40, 3, 86]],
  hair4: [[30, 70, 62], [38, 68, 82], [46, 50, 94]],
  hair5: [[2, 72, 52], [10, 72, 70], [18, 60, 84]],
  cloth0: [[352, 70, 52], [0, 64, 80], [8, 48, 92]],
  cloth1: [[228, 66, 48], [214, 60, 78], [202, 44, 90]],
  cloth2: [[150, 58, 42], [134, 52, 66], [118, 40, 80]],
  cloth3: [[268, 50, 46], [278, 44, 74], [288, 30, 88]],
  cloth4: [[24, 80, 62], [34, 76, 86], [42, 56, 96]],
  cloth5: [[190, 70, 44], [178, 64, 68], [166, 46, 82]],
  cloth6: [[320, 50, 56], [328, 44, 80], [336, 28, 94]],
  cloth7: [[230, 10, 40], [225, 8, 56], [220, 6, 72]],
  accent0: [[258, 62, 46], [266, 50, 68]],
  accent1: [[212, 14, 52], [210, 8, 72]],
  accent2: [[356, 72, 54], [4, 66, 76]],
  accent3: [[150, 64, 36], [140, 58, 52]],
  accent4: [[38, 72, 72], [46, 60, 90]],
  pants: [[250, 30, 26], [258, 24, 36]],
  boots: [[20, 50, 16], [24, 45, 26]],
  wood_oak: [[14, 62, 30], [20, 64, 46], [26, 60, 62], [32, 46, 76]],
  wood_walnut: [[8, 50, 20], [14, 52, 30], [20, 50, 42], [26, 40, 54]],
  floor: [[18, 55, 40], [24, 52, 52], [30, 44, 62]],
  fabric: [[348, 58, 38], [354, 54, 54], [2, 42, 68]],
  metal: [[215, 16, 46], [210, 10, 66], [45, 8, 88]],
  leaf: [[160, 60, 30], [140, 58, 46], [120, 52, 62], [100, 42, 76]],
  clay: [[8, 60, 44], [16, 58, 62], [24, 46, 78]],
  // v2：窗戶玻璃、任務板上的紙張。
  glass: [[208, 42, 58], [200, 32, 76], [192, 18, 92]],
  paper: [[38, 26, 78], [44, 16, 92], [50, 8, 98]],
};

// 外框不用純黑，與介面的 --ink 相同；落影比地板最暗階再暗一階。
const SINGLE_COLORS = { outline: '#2b1a0e', eye: '#1c1626', shadow: [12, 55, 28] };

export function hsbToHex([hue, saturation, brightness]) {
  const s = saturation / 100;
  const v = brightness / 100;
  const channel = n => {
    const k = (n + hue / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[channel(5), channel(3), channel(1)].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

// 索引 0 固定是透明；其餘依定義順序排入。
export const PALETTE = [null];
export const RAMPS = {};
for (const [name, defs] of Object.entries(RAMP_DEFS)) {
  RAMPS[name] = defs.map(def => PALETTE.push(hsbToHex(def)) - 1);
}
const addSingle = value => PALETTE.push(typeof value === 'string' ? value : hsbToHex(value)) - 1;
export const OUTLINE = addSingle(SINGLE_COLORS.outline);
export const EYE = addSingle(SINGLE_COLORS.eye);
export const SHADOW = addSingle(SINGLE_COLORS.shadow);
