import { expect, test } from 'vitest';
import { EYE_COLOR, STATUS_ICONS, STATUS_LABELS, lookFor, spriteFor } from './sprite.js';

test('the same user always gets the same sprite', () => {
  expect(spriteFor(18, 'working')).toEqual(spriteFor(18, 'working'));
  expect(lookFor(18)).toEqual(lookFor(18));
});
test('different users mostly look different', () => {
  const looks = new Set(Array.from({ length: 40 }, (_, index) => JSON.stringify(lookFor(index + 1))));
  expect(looks.size).toBeGreaterThanOrEqual(30);
  const sprites = new Set(Array.from({ length: 40 }, (_, index) => JSON.stringify(spriteFor(index + 1).rects)));
  expect(sprites.size).toBeGreaterThanOrEqual(20);
});
test('every part of the look varies across users', () => {
  const looks = Array.from({ length: 200 }, (_, index) => lookFor(index + 1));
  for (const key of ['hair', 'hat', 'hairColor', 'skin', 'cloth', 'accent']) {
    expect(new Set(looks.map(look => look[key])).size, key).toBeGreaterThanOrEqual(4);
  }
});
test('sprites are 12 by 16 and every rect stays inside the grid', () => {
  for (const id of [1, 18, 23, 999, 123456]) {
    for (const status of ['working', 'idle', 'resting']) {
      const art = spriteFor(id, status);
      expect([art.width, art.height]).toEqual([12, 16]);
      expect(art.rects.length).toBeGreaterThan(10);
      for (const rect of art.rects) {
        expect(rect.w).toBeGreaterThanOrEqual(1);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(12);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeLessThan(16);
        expect(rect.color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  }
});
test('rects in one row never overlap and have unique positions', () => {
  const art = spriteFor(18);
  const keys = art.rects.map(rect => `${rect.x},${rect.y}`);
  expect(new Set(keys).size).toBe(keys.length);
  const cells = new Set();
  for (const rect of art.rects) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      expect(cells.has(`${x},${rect.y}`)).toBe(false);
      cells.add(`${x},${rect.y}`);
    }
  }
});
test('resting closes the eyes and changes nothing else', () => {
  const colors = art => new Set(art.rects.map(rect => rect.color));
  const awake = spriteFor(18, 'working');
  const asleep = spriteFor(18, 'resting');
  expect(colors(awake).has(EYE_COLOR)).toBe(true);
  expect(colors(asleep).has(EYE_COLOR)).toBe(false);
  expect(spriteFor(18, 'idle')).toEqual(awake);
  const area = art => art.rects.reduce((sum, rect) => sum + rect.w, 0);
  expect(area(asleep)).toBe(area(awake));
});
test('each status has an icon and a label', () => {
  expect(STATUS_LABELS).toEqual({ working: '工作中', idle: '發呆', resting: '休息' });
  for (const status of ['working', 'idle', 'resting']) {
    expect(STATUS_ICONS[status].rects.length).toBeGreaterThan(0);
    expect([STATUS_ICONS[status].width, STATUS_ICONS[status].height]).toEqual([7, 7]);
  }
});
