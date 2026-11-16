import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHallStore, HallFullError, HallStoreError, HALL_CAPACITY } from '../server/hall.mjs';

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'hall-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const member = (userId, name = `成員 ${userId}`) => ({ userId, name });

test('missing file is an empty list, or a copy of the initial members', async () => {
  await withDir(async dir => {
    assert.deepEqual(await createHallStore(join(dir, 'a.json')).list(), []);
    const store = createHallStore(join(dir, 'b.json'), { initial: [member(1)] });
    const first = await store.list();
    assert.deepEqual(first, [member(1)]);
    first[0].name = '被改掉';
    first.push(member(2));
    assert.deepEqual(await store.list(), [member(1)]);
  });
});
test('add creates the directory and file and keeps join order', async () => {
  await withDir(async dir => {
    const path = join(dir, 'nested', 'hall.json');
    const store = createHallStore(path);
    await store.add(member(5));
    assert.deepEqual(await store.add(member(3)), [member(5), member(3)]);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), [member(5), member(3)]);
  });
});
test('add stores only userId and name', async () => {
  await withDir(async dir => {
    const store = createHallStore(join(dir, 'hall.json'));
    assert.deepEqual(await store.add({ userId: 5, name: 'A', extra: 'x' }), [{ userId: 5, name: 'A' }]);
  });
});
test('adding an existing member only updates the name', async () => {
  await withDir(async dir => {
    const store = createHallStore(join(dir, 'hall.json'));
    await store.add(member(1));
    await store.add(member(2));
    assert.deepEqual(await store.add(member(1, '新名字')), [member(1, '新名字'), member(2)]);
  });
});
test('a full hall rejects new members but still updates existing ones', async () => {
  await withDir(async dir => {
    const path = join(dir, 'hall.json');
    const store = createHallStore(path);
    for (let id = 1; id <= HALL_CAPACITY; id += 1) await store.add(member(id));
    const before = await readFile(path, 'utf8');
    await assert.rejects(store.add(member(99)), error => error instanceof HallFullError && error.code === 'hall_full');
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal((await store.add(member(3, '改名')))[2].name, '改名');
  });
});
test('remove drops a member; removing an unknown member does not write', async () => {
  await withDir(async dir => {
    const path = join(dir, 'hall.json');
    const store = createHallStore(path);
    await store.add(member(1));
    await store.add(member(2));
    assert.deepEqual(await store.remove(1), [member(2)]);
    const store2 = createHallStore(join(dir, 'never.json'));
    assert.deepEqual(await store2.remove(7), []);
    assert.ok(!(await readdir(dir)).includes('never.json'));
  });
});
test('a corrupt file is reported, not silently replaced', async () => {
  await withDir(async dir => {
    for (const content of ['{not json', '{"a":1}']) {
      const path = join(dir, 'hall.json');
      await writeFile(path, content);
      const store = createHallStore(path);
      await assert.rejects(store.list(), error => error instanceof HallStoreError && error.code === 'hall_corrupt');
      await assert.rejects(store.add(member(1)), HallStoreError);
      assert.equal(await readFile(path, 'utf8'), content);
    }
  });
});
test('concurrent adds are serialized and leave no temp files', async () => {
  await withDir(async dir => {
    const store = createHallStore(join(dir, 'hall.json'));
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => store.add(member(index + 1))));
    assert.equal(results.filter(result => result.status === 'rejected').length, 4);
    assert.deepEqual((await store.list()).map(item => item.userId), Array.from({ length: 16 }, (_, index) => index + 1));
    assert.deepEqual(await readdir(dir), ['hall.json']);
  });
});
