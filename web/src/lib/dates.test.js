import { expect, test } from 'vitest';
import { addDays, formatDay, todayLocal } from './dates.js';

test('vitest runs in Asia/Taipei', () => {
  expect(new Date(Date.UTC(2026, 10, 15, 23, 30)).getDate()).toBe(16);
});
test('todayLocal uses local date parts, not UTC', () => {
  // 台北 07:30 時 UTC 仍是前一天；toISOString() 會得到 2026-11-15。
  expect(todayLocal(new Date(2026, 10, 16, 7, 30))).toBe('2026-11-16');
  expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
});
test('addDays crosses month and year boundaries', () => {
  expect(addDays('2026-11-16', -1)).toBe('2026-11-15');
  expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
});
test('formatDay appends the weekday', () => {
  expect(formatDay('2026-11-16')).toBe('2026-11-16（一）');
  expect(formatDay('2026-11-22')).toBe('2026-11-22（日）');
});
