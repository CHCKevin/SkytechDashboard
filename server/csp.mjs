import { createHash } from 'node:crypto';

// 頁面只允許本機腳本，再以雜湊放行 index.html 內唯一的 import map。
export function pageCsp(html) {
  const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
  if (maps.length !== 1) throw new Error('index.html must contain exactly one import map');
  const hash = createHash('sha256').update(maps[0][1], 'utf8').digest('base64');
  return `default-src 'self'; script-src 'self' 'sha256-${hash}'`;
}
