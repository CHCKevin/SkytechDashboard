import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.mjs';
import { createDemoSource } from './demo.mjs';
import { createHandler, listen } from './http.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const staticFiles = {
  '/': { path: resolve(root, 'client/index.html'), type: 'text/html; charset=utf-8' },
};

async function main() {
  // 相對路徑以專案根目錄為基準，與執行時所在目錄無關。
  const { values } = parseArgs({ options: { config: { type: 'string', default: 'config/local.json' } } });
  const config = await loadConfig(resolve(root, values.config));
  if (config.mode !== 'demo') {
    throw new Error('Live mode is not implemented yet; use demo mode until the OpenProject adapter is available');
  }
  const handler = createHandler({ source: createDemoSource(), mode: config.mode, staticFiles });
  const server = await listen(handler, { host: config.host, port: config.port });
  console.log(`示例模式已啟動：http://${config.host}:${config.port}/`);
  const stop = () => {
    server.close(() => process.exit(0));
    // 卡住的連線不應讓關閉永遠等待。
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(error => {
  console.error(`啟動失敗：${error.message}`);
  process.exitCode = 1;
});
