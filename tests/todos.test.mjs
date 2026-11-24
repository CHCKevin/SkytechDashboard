import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTodoStore, TodoNotFoundError, TodoStoreError } from '../server/todos.mjs';

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'todos-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

// 每次呼叫 now() 前進一分鐘，方便檢查建立與結案時間。
function clock() {
  let minute = 0;
  return () => `2026-11-24T00:${String(minute++).padStart(2, '0')}:00.000Z`;
}

const input = (title, extra = {}) => ({ title, note: '', dueDate: null, ...extra });

test('missing file is an empty list; create assigns increasing ids and writes the file', async () => {
  await withDir(async dir => {
    const path = join(dir, 'nested', 'todos.json');
    const store = createTodoStore(path, { now: clock() });
    assert.deepEqual(await store.list(), []);
    await store.create(input('A', { note: '第一行\n第二行', dueDate: '2026-11-30' }));
    const list = await store.create(input('B'));
    assert.deepEqual(list, [
      { id: 1, title: 'A', note: '第一行\n第二行', dueDate: '2026-11-30', createdAt: '2026-11-24T00:00:00.000Z', closedAt: null },
      { id: 2, title: 'B', note: '', dueDate: null, createdAt: '2026-11-24T00:01:00.000Z', closedAt: null },
    ]);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), list);
  });
});

test('new ids continue from the current highest id', async () => {
  await withDir(async dir => {
    const store = createTodoStore(join(dir, 'todos.json'), { now: clock() });
    await store.create(input('A'));
    await store.create(input('B'));
    await store.remove(1);
    const list = await store.create(input('C'));
    assert.deepEqual(list.map(item => item.id), [2, 3]);
  });
});

test('update changes only given fields; closed sets and clears closedAt', async () => {
  await withDir(async dir => {
    const store = createTodoStore(join(dir, 'todos.json'), { now: clock() });
    await store.create(input('A', { dueDate: '2026-11-30' }));
    let [item] = await store.update(1, { title: 'A2', dueDate: null });
    assert.equal(item.title, 'A2');
    assert.equal(item.dueDate, null);
    assert.equal(item.note, '');
    [item] = await store.update(1, { closed: true });
    assert.equal(item.closedAt, '2026-11-24T00:01:00.000Z');
    // 已結案再結案：保留原本的時間。
    [item] = await store.update(1, { closed: true });
    assert.equal(item.closedAt, '2026-11-24T00:01:00.000Z');
    [item] = await store.update(1, { closed: false });
    assert.equal(item.closedAt, null);
  });
});

test('update of a missing id rejects with TodoNotFoundError; remove is idempotent', async () => {
  await withDir(async dir => {
    const store = createTodoStore(join(dir, 'todos.json'), { now: clock() });
    await store.create(input('A'));
    await assert.rejects(store.update(9, { title: 'x' }), TodoNotFoundError);
    assert.deepEqual(await store.remove(1), []);
    assert.deepEqual(await store.remove(1), []);
  });
});

test('concurrent creates are serialized, get unique ids and leave no temp files', async () => {
  await withDir(async dir => {
    const store = createTodoStore(join(dir, 'todos.json'));
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map(title => store.create(input(title))));
    assert.deepEqual((await store.list()).map(item => item.id).sort(), [1, 2, 3, 4, 5]);
    assert.deepEqual(await readdir(dir), ['todos.json']);
  });
});

test('corrupt or malformed file is reported and never overwritten', async () => {
  await withDir(async dir => {
    const path = join(dir, 'todos.json');
    const store = createTodoStore(path);
    for (const content of [
      '{ broken',
      '{"not":"array"}',
      '[{"id":1,"title":"A","note":"","dueDate":null,"createdAt":"x"}]',
      '[{"id":1,"title":"A","note":"","dueDate":null,"createdAt":"x","closedAt":null},{"id":1,"title":"B","note":"","dueDate":null,"createdAt":"x","closedAt":null}]',
    ]) {
      await writeFile(path, content);
      await assert.rejects(store.list(), TodoStoreError);
      await assert.rejects(store.create(input('A')), TodoStoreError);
      assert.equal(await readFile(path, 'utf8'), content);
    }
  });
});
