// 一律以本地年月日計算；toISOString() 在 UTC+8 的 08:00 前會得到前一天。
const pad = value => String(value).padStart(2, '0');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function todayLocal(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toLocalDate(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

export function addDays(day, amount) {
  const date = toLocalDate(day);
  date.setDate(date.getDate() + amount);
  return todayLocal(date);
}

export function formatDay(day) {
  return `${day}（${WEEKDAYS[toLocalDate(day).getDay()]}）`;
}
