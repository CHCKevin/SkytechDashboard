import { expect, test } from 'vitest';
import { PALETTE } from '../art/style.js';
import { sceneArt } from './hall-art.js';
import { SCENE_SIZE, SEAT_GROUPS } from './seats.js';

test('the background covers the whole scene with palette colors only', () => {
  const { background } = sceneArt();
  expect([background.width, background.height]).toEqual(SCENE_SIZE);
  const covered = new Set();
  for (const rect of background.rects) {
    expect(PALETTE).toContain(rect.color);
    for (let x = rect.x; x < rect.x + rect.w; x += 1) covered.add(`${x},${rect.y}`);
  }
  expect(covered.size).toBe(SCENE_SIZE[0] * SCENE_SIZE[1]);
});
test('only the desk rows have a table layer, and it is mostly transparent', () => {
  const { tables } = sceneArt();
  expect(Object.keys(tables).sort()).toEqual(['lower', 'upper']);
  expect(SEAT_GROUPS.filter(group => group.tables).map(group => group.tables)).toEqual(['upper', 'lower']);
  for (const art of Object.values(tables)) {
    const area = art.rects.reduce((sum, rect) => sum + rect.w, 0);
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThan(SCENE_SIZE[0] * SCENE_SIZE[1] / 4);
  }
});
test('the scene is computed once', () => {
  expect(sceneArt()).toBe(sceneArt());
});
test('the background stays within a reasonable number of SVG rects', () => {
  expect(sceneArt().background.rects.length).toBeLessThan(5000);
});
