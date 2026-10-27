import { createHash } from 'node:crypto';

const hardening = "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const defaultCsp = `default-src 'self'; ${hardening}`;

// 頁面只允許本機腳本，再以雜湊放行 index.html 內唯一的 import map。
// 瀏覽器雜湊前會把換行正規化為 LF，Windows 簽出的 CRLF 必須先轉換。
export function pageCsp(html) {
  const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
  if (maps.length !== 1) throw new Error('index.html must contain exactly one import map');
  const hash = createHash('sha256').update(maps[0][1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64');
  return `default-src 'self'; script-src 'self' 'sha256-${hash}'; ${hardening}`;
}
