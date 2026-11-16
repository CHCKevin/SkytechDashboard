// OpenProject 的名稱常帶部門前綴（「部門 - 姓名」）；場景中的名牌只顯示最後一段。
export function shortName(name) {
  const text = name ?? '';
  const index = text.lastIndexOf(' - ');
  return (index < 0 ? text : text.slice(index + 3)).trim();
}
