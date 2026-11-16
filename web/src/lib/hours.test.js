import { expect, test } from 'vitest';
import { QUICK_HOURS, parseHoursInput } from './hours.js';

test('quick hour buttons', () => {
  expect(QUICK_HOURS).toEqual([0.5, 1, 2, 4]);
});
test('parseHoursInput accepts up to two decimals within (0, 24]', () => {
  expect(parseHoursInput('2.5')).toEqual({ value: 2.5 });
  expect(parseHoursInput(' 1 ')).toEqual({ value: 1 });
  expect(parseHoursInput('0.25')).toEqual({ value: 0.25 });
  expect(parseHoursInput('24')).toEqual({ value: 24 });
});
test('parseHoursInput rejects bad input with a message', () => {
  for (const bad of ['', 'abc', '1.234', '-1', '1e2', '.5', '2.']) {
    expect(parseHoursInput(bad).error).toMatch(/時數/);
  }
  for (const bad of ['0', '0.00', '24.5']) {
    expect(parseHoursInput(bad).error).toBe('時數必須大於 0、不超過 24');
  }
});
