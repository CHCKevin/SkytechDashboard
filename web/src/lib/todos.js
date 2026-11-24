// 待辦委託的排序與顯示：進行中依期限由近到遠（沒有期限的排後面），歷史依結案時間新到舊。
const byDueDate = (a, b) => {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.id - b.id;
};
const byClosedAtDesc = (a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt) || b.id - a.id;

export function splitTodos(list) {
  return {
    open: list.filter(todo => todo.closedAt === null).sort(byDueDate),
    closed: list.filter(todo => todo.closedAt !== null).sort(byClosedAtDesc),
  };
}

// 日期字串都是 YYYY-MM-DD，可以直接比較大小；today 由呼叫端以本地日期提供。
export function isOverdue(todo, today) {
  return todo.closedAt === null && todo.dueDate !== null && todo.dueDate < today;
}

const DAY = 24 * 60 * 60 * 1000;
const utcDay = day => {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
};

// 期限的提醒等級：剩不到 1 天（今天到期或已逾期）為 urgent（紅），1～5 天為 soon（黃），其餘或沒有期限為 null。
export function dueLevel(todo, today) {
  if (todo.closedAt !== null || todo.dueDate === null) return null;
  const days = Math.round((utcDay(todo.dueDate) - utcDay(today)) / DAY);
  if (days < 1) return 'urgent';
  if (days <= 5) return 'soon';
  return null;
}

const pad = value => String(value).padStart(2, '0');

// 結案時間存成 ISO（UTC），顯示時換成本地的「YYYY-MM-DD HH:mm」。
export function formatClosedAt(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
