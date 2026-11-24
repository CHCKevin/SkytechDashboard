import { createJsonListFile } from './json-store.mjs';

export class TodoStoreError extends Error {
  constructor() {
    super('待辦委託檔案格式錯誤，請檢查或刪除 data 目錄下的 todos 檔案');
    this.name = 'TodoStoreError';
    this.code = 'todos_corrupt';
  }
}

export class TodoNotFoundError extends Error {
  constructor() {
    super('找不到這筆待辦委託，可能已被刪除');
    this.name = 'TodoNotFoundError';
    this.code = 'not_found';
  }
}

const isText = value => typeof value === 'string';
const isTextOrNull = value => value === null || typeof value === 'string';

// 待辦委託只存在本機，不連動 OpenProject。closedAt 為 null 代表進行中，有值代表已結案。
export function createTodoStore(path, { now = () => new Date().toISOString() } = {}) {
  const file = createJsonListFile(path, { corrupt: () => new TodoStoreError() });
  const { write, exclusive } = file;

  // 檔案可能被手動編輯：每筆欄位型別要正確，且編號是不重複的正整數。
  async function read() {
    const list = await file.read();
    const ids = new Set();
    for (const item of list) {
      const valid = item && typeof item === 'object' && Number.isInteger(item.id) && item.id >= 1 && !ids.has(item.id)
        && isText(item.title) && isText(item.note) && isTextOrNull(item.dueDate)
        && isText(item.createdAt) && isTextOrNull(item.closedAt);
      if (!valid) throw new TodoStoreError();
      ids.add(item.id);
    }
    return list;
  }

  return {
    list: () => exclusive(read),
    create: ({ title, note, dueDate }) => exclusive(async () => {
      const list = await read();
      const id = list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
      list.push({ id, title, note, dueDate, createdAt: now(), closedAt: null });
      await write(list);
      return list;
    }),
    // patch 只含有變動的欄位；closed 切換結案狀態，重複結案保留原本的結案時間。
    update: (id, { closed, ...fields }) => exclusive(async () => {
      const list = await read();
      const item = list.find(todo => todo.id === id);
      if (!item) throw new TodoNotFoundError();
      Object.assign(item, fields);
      if (closed !== undefined) item.closedAt = closed ? (item.closedAt ?? now()) : null;
      await write(list);
      return list;
    }),
    remove: id => exclusive(async () => {
      const list = await read();
      const next = list.filter(item => item.id !== id);
      if (next.length !== list.length) await write(next);
      return next;
    }),
  };
}
