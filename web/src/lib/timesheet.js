import { addDays } from './dates.js';

// OpenProject Timesheet PDF 匯出（舊版 /cost_reports.pdf）的連結；2026-11-19 在公司版本實測：
// 網址上的篩選會在同一個請求套用（不沿用 session 裡的舊篩選），瀏覽器以使用者登入狀態開啟後，
// OpenProject 排入背景工作、跳到 job 狀態頁並自動下載 PDF。API token 不能用在這個網頁路由。
// 一律以本地年月日計算，週一為一週的第一天。

function weekday(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).getDay();
}

export function weekRange(day) {
  const start = addDays(day, -((weekday(day) + 6) % 7));
  return { start, end: addDays(start, 6) };
}

export function timesheetPdfUrl(origin, day) {
  const { start, end } = weekRange(day);
  const url = new URL('/cost_reports.pdf', origin);
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
