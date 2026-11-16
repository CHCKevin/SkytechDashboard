import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// JSON 陣列檔：寫入先寫暫存檔再改名，並以佇列序列化避免併發覆蓋。
// corrupt() 產生檔案損毀時要丟出的錯誤；檔案不存在時讀到 initial 的複本。
export function createJsonListFile(path, { corrupt, initial = [] }) {
  let queue = Promise.resolve();
  let tempCounter = 0;

  async function read() {
    let raw;
    try {
      raw = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(initial);
      throw error;
    }
    let data;
    try { data = JSON.parse(raw); } catch { throw corrupt(); }
    if (!Array.isArray(data)) throw corrupt();
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

  return { read, write, exclusive };
}
