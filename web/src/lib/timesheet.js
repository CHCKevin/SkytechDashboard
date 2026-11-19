import { addDays } from './dates.js';

// OpenProject 時間報表（舊版 /cost_reports）的深層連結；2026-11-19 使用者已在公司版本驗證這組參數。
// 一律以本地年月日計算，週一為一週的第一天。

function weekday(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).getDay();
}

export function weekRange(day) {
  const start = addDays(day, -((weekday(day) + 6) % 7));
  return { start, end: addDays(start, 6) };
}

export function timesheetReportUrl(origin, day) {
  const { start, end } = weekRange(day);
  const url = new URL('/cost_reports', origin);
  url.search = new URLSearchParams([
    ['set_filter', '1'],
    ['fields[]', 'user_id'], ['operators[user_id]', '='], ['values[user_id][]', 'me'],
    ['fields[]', 'spent_on'], ['operators[spent_on]', '<>d'],
    ['values[spent_on][]', start], ['values[spent_on][]', end],
    ['unit', '-1'],
  ]).toString();
  return url.href;
}

const monthDay = day => {
  const [, month, date] = day.split('-').map(Number);
  return `${month}/${date}`;
};

export function formatWeekLabel(day) {
  const { start, end } = weekRange(day);
  return `${monthDay(start)}–${monthDay(end)}`;
}
