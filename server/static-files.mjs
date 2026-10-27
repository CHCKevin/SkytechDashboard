import { access } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// 公開路徑 → 專案內檔案；只有列在這裡的檔案會被提供。
const entries = {
  '/': 'client/index.html',
  '/main.mjs': 'client/main.mjs',
  '/api.mjs': 'client/api.mjs',
  '/store.mjs': 'client/store.mjs',
  '/view-model.mjs': 'client/view-model.mjs',
  '/layout-3d.mjs': 'client/layout-3d.mjs',
  '/scene.mjs': 'client/scene.mjs',
  '/ships.mjs': 'client/ships.mjs',
  '/styles.css': 'client/styles.css',
  '/favicon.svg': 'client/favicon.svg',
  '/shared/layout.mjs': 'shared/layout.mjs',
  '/vendor/three.module.js': 'node_modules/three/build/three.module.js',
  '/vendor/OrbitControls.js': 'node_modules/three/examples/jsm/controls/OrbitControls.js',
  '/vendor/CSS2DRenderer.js': 'node_modules/three/examples/jsm/renderers/CSS2DRenderer.js',
};

export function createStaticFiles(root) {
  return Object.fromEntries(Object.entries(entries).map(([url, file]) =>
    [url, { path: resolve(root, file), type: types[extname(file)] }]));
}

export async function assertStaticFiles(staticFiles) {
  for (const [url, file] of Object.entries(staticFiles)) {
    try {
      await access(file.path);
    } catch {
      throw new Error(`Missing static file for ${url}; run npm install`);
    }
  }
}
