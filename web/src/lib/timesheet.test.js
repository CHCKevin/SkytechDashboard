import { describe, expect, test } from 'vitest';
import { formatWeekLabel, timesheetReportUrl, weekRange } from './timesheet.js';

describe('weekRange', () => {
  test.each([
    ['2026-11-16', '2026-11-16', '2026-11-22'], // 週一
    ['2026-11-19', '2026-11-16', '2026-11-22'], // 週四
    ['2026-11-22', '2026-11-16', '2026-11-22'], // 週日
    ['2026-11-30', '2026-11-30', '2026-12-06'], // 跨月（往後）
    ['2026-12-02', '2026-11-30', '2026-12-06'], // 跨月（往前）
    ['2026-12-31', '2026-12-28', '2027-01-03'], // 跨年
  ])('%s → %s ~ %s', (day, start, end) => {
    expect(weekRange(day)).toEqual({ start, end });
  });
});

test('timesheetReportUrl uses the verified legacy cost report filters', () => {
  const url = new URL(timesheetReportUrl('http://op.example:8080', '2026-11-19'));
  expect(url.origin + url.pathname).toBe('http://op.example:8080/cost_reports');
  expect([...url.searchParams]).toEqual([
    ['set_filter', '1'],
    ['fields[]', 'user_id'], ['operators[user_id]', '='], ['values[user_id][]', 'me'],
    ['fields[]', 'spent_on'], ['operators[spent_on]', '<>d'],
    ['values[spent_on][]', '2026-11-16'], ['values[spent_on][]', '2026-11-22'],
    ['unit', '-1'],
  ]);
});

test('formatWeekLabel shows month/day without padding', () => {
  expect(formatWeekLabel('2026-11-19')).toBe('11/16–11/22');
  expect(formatWeekLabel('2026-12-31')).toBe('12/28–1/3');
});
