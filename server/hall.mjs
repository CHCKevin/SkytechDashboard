import { createJsonListFile } from './json-store.mjs';

// 大廳場景固定 16 個位子，成員上限與位子數相同，所以每位成員一定有位子。
export const HALL_CAPACITY = 16;

export class HallFullError extends Error {
  constructor() {
    super(`大廳已滿（最多 ${HALL_CAPACITY} 位成員）`);
    this.name = 'HallFullError';
    this.code = 'hall_full';
  }
}

export class HallStoreError extends Error {
  constructor() {
    super('大廳成員檔案格式錯誤，請檢查或刪除 data 目錄下的 hall 檔案');
    this.name = 'HallStoreError';
    this.code = 'hall_corrupt';
  }
}

// 大廳成員依加入順序存成 JSON 陣列，只記 OpenProject 使用者編號與名稱。
export function createHallStore(path, { initial = [] } = {}) {
  const file = createJsonListFile(path, { corrupt: () => new HallStoreError(), initial });
  const { write, exclusive } = file;

  // 檔案可能被手動編輯：每筆都必須是 { userId: 正整數, name: 字串 }，且編號不重複。
  async function read() {
    const list = await file.read();
    const ids = new Set();
    for (const item of list) {
      const valid = item && typeof item === 'object' && Number.isInteger(item.userId) && item.userId >= 1
        && typeof item.name === 'string' && !ids.has(item.userId);
      if (!valid) throw new HallStoreError();
      ids.add(item.userId);
    }
    return list;
  }

  return {
    list: () => exclusive(read),
    add: ({ userId, name }) => exclusive(async () => {
      const list = await read();
      const index = list.findIndex(item => item.userId === userId);
      if (index >= 0) list[index] = { userId, name };
      else if (list.length >= HALL_CAPACITY) throw new HallFullError();
      else list.push({ userId, name });
      await write(list);
      return list;
    }),
    remove: userId => exclusive(async () => {
      const list = await read();
      const next = list.filter(item => item.userId !== userId);
      if (next.length !== list.length) await write(next);
      return next;
    }),
  };
}
