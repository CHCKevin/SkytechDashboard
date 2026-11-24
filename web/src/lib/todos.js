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

const pad = value => String(value).padStart(2, '0');

// 結案時間存成 ISO（UTC），顯示時換成本地的「YYYY-MM-DD HH:mm」。
export function formatClosedAt(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
