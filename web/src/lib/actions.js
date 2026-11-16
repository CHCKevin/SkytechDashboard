// 透過 CSSOM 設定寬度；CSP 不允許 inline style 屬性，但允許腳本修改 element.style。
export function barWidth(node, percent) {
  node.style.width = `${percent}%`;
  return {
    update(next) {
      node.style.width = `${next}%`;
    },
  };
}
