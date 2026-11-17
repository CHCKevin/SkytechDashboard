import { neighbours } from './engine.js';
import { EYE, OUTLINE, PALETTE } from './style.js';

// 品質驗證：可以自動檢查的規則（docs/pixel-art/06-acceptance-criteria.md 的 A1、A2、A4–A8）。
// 回傳問題清單；空陣列表示通過。
export function validate(result, asset) {
  const issues = [];
  const add = (rule, message) => issues.push({ rule, message });
  const { width, height, body, shadow, anchor } = result;
  const [expectedWidth, expectedHeight] = asset.size;

  if (width !== expectedWidth || height !== expectedHeight || body.length !== width * height) {
    add('size', `尺寸是 ${width}×${height}，定義是 ${expectedWidth}×${expectedHeight}`);
    return issues;
  }
  for (const layer of [body, shadow].filter(Boolean)) {
    if (layer.some(value => value >= PALETTE.length)) add('palette', '有不在調色盤裡的索引');
  }

  const colors = new Set(body);
  colors.delete(0);
  if (colors.size > asset.maxColors) add('colors', `用了 ${colors.size} 色，上限 ${asset.maxColors}`);

  const isBody = value => value !== 0 && value !== OUTLINE;
  body.forEach((value, index) => {
    if (value === 0) return;
    const at = `(${index % width},${Math.floor(index / width)})`;
    const near = neighbours(index, width, height);
    // 鋪滿整張圖的資產（outline: false）沒有外框，圖的邊界不算邊緣。
    const edge = asset.outline === false ? near.some(j => body[j] === 0) : near.length < 4 || near.some(j => body[j] === 0);
    if (edge && value !== OUTLINE && asset.outline !== false) add('outline', `${at} 在邊緣但不是外框色`);
    if (value === OUTLINE && !near.some(j => isBody(body[j]))) add('outline-attached', `${at} 的外框沒有接到物件`);
    // 只檢查四鄰都是物件本體的內部像素；貼著外框的單一像素看起來是輪廓的一部分，不算孤立。
    const interior = !edge && near.every(j => isBody(body[j]));
    if (interior && isBody(value) && value !== EYE && near.every(j => body[j] !== value)) add('isolated', `${at} 是孤立像素`);
  });

  const anchorRow = body.slice(anchor.y * width, (anchor.y + 1) * width);
  const inside = anchor.x >= 0 && anchor.x < width && anchor.y >= 0 && anchor.y < height;
  if (!inside || !anchorRow.some(isBody)) add('anchor', `錨點 (${anchor.x},${anchor.y}) 不在物件的底部列`);
  return issues;
}
