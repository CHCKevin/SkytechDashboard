import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class QuestStoreError extends Error {
  constructor() {
    super('常駐任務檔案格式錯誤，請檢查或刪除 data 目錄下的 quests 檔案');
    this.name = 'QuestStoreError';
    this.code = 'quests_corrupt';
  }
}

// 常駐任務存成 JSON 陣列；寫入先寫暫存檔再改名，並以佇列序列化避免併發覆蓋。
export function createQuestStore(path) {
  let queue = Promise.resolve();
  let tempCounter = 0;

  async function read() {
    let raw;
    try {
      raw = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    let data;
    try { data = JSON.parse(raw); } catch { throw new QuestStoreError(); }
    if (!Array.isArray(data)) throw new QuestStoreError();
    return data;
  }

  async function write(list) {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${tempCounter++}.tmp`;
    await writeFile(temp, `${JSON.stringify(list, null, 2)}\n`);
    await rename(temp, path);
  }

  function exclusive(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  return {
    list: () => exclusive(read),
    upsert: quest => exclusive(async () => {
      const list = await read();
      const index = list.findIndex(item => item.workPackageId === quest.workPackageId);
      if (index >= 0) list[index] = quest;
      else list.push(quest);
      await write(list);
      return list;
    }),
    remove: workPackageId => exclusive(async () => {
      const list = await read();
      const next = list.filter(item => item.workPackageId !== workPackageId);
      if (next.length !== list.length) await write(next);
      return next;
    }),
  };
}
