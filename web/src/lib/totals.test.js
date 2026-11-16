import { expect, test } from 'vitest';
import { progressPercent, sumHours } from './totals.js';

test('sumHours rounds to two decimals', () => {
  expect(sumHours([])).toBe(0);
  expect(sumHours([{ hours: 0.1 }, { hours: 0.2 }])).toBe(0.3);
  expect(sumHours([{ hours: 2.5 }, { hours: 1 }, { hours: 2 }])).toBe(5.5);
});
test('progressPercent is capped at 100 and safe for bad targets', () => {
  expect(progressPercent(5.5, 8)).toBe(69);
  expect(progressPercent(10, 8)).toBe(100);
  expect(progressPercent(1, 0)).toBe(0);
});
