import { readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// 啟動時掃描 Vite 產物建立白名單；只有已知類型的檔案會被提供，請求路徑只做完整比對。
export async function scanStaticFiles(distDir) {
  let names;
  try {
    names = await readdir(distDir, { recursive: true, withFileTypes: true });
  } catch {
    throw new Error(`找不到前端產物 ${distDir}，請先執行 npm run build`);
  }
  const files = {};
  for (const entry of names) {
    if (!entry.isFile()) continue;
    const type = types[extname(entry.name).toLowerCase()];
    if (!type) continue;
    const path = join(entry.parentPath, entry.name);
    const url = `/${relative(distDir, path).split(sep).map(encodeURIComponent).join('/')}`;
    files[url] = { path, type };
  }
  if (!files['/index.html']) throw new Error('前端產物缺少 index.html，請先執行 npm run build');
  files['/'] = files['/index.html'];
  return files;
}
