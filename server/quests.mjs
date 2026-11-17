import { createJsonListFile } from './json-store.mjs';

export class QuestStoreError extends Error {
  constructor() {
    super('常駐任務檔案格式錯誤，請檢查或刪除 data 目錄下的 quests 檔案');
    this.name = 'QuestStoreError';
    this.code = 'quests_corrupt';
  }
}

// 常駐任務存成 JSON 陣列。
export function createQuestStore(path) {
  const { read, write, exclusive } = createJsonListFile(path, { corrupt: () => new QuestStoreError() });

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
