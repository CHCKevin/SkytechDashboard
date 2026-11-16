import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.mjs';
import { createDemoSource } from './demo.mjs';
import { createHandler, listen } from './http.mjs';
import { createClient } from './openproject/client.mjs';
import { createQuestStore } from './quests.mjs';
import { scanStaticFiles } from './static-files.mjs';
import { createTimeTrackingSource } from './time-tracking.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  // 相對路徑以專案根目錄為基準，與執行時所在目錄無關。
  const { values } = parseArgs({ options: { config: { type: 'string', default: 'config/local.json' } } });
  const config = await loadConfig(resolve(root, values.config));
  const staticFiles = await scanStaticFiles(resolve(root, config.staticDir));
  const source = config.mode === 'demo'
    ? createDemoSource()
    : createTimeTrackingSource({ client: createClient(config) });
  // 示例與真實的 work package 編號不同，常駐任務分開存放。
  const quests = createQuestStore(resolve(root, config.dataDir, config.mode === 'demo' ? 'demo-quests.json' : 'quests.json'));
  const handler = createHandler({ source, quests, mode: config.mode, dailyTargetHours: config.dailyTargetHours, staticFiles });
  const server = await listen(handler, { host: config.host, port: config.port });
  console.log(`${config.mode === 'demo' ? '示例模式' : '即時模式'}已啟動：http://${config.host}:${config.port}/`);
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
