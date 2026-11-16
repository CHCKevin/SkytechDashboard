import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createQuestStore, QuestStoreError } from '../server/quests.mjs';

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'quests-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const quest = (workPackageId, activityId = null) => ({ workPackageId, subject: `WP ${workPackageId}`, activityId, activityName: activityId ? 'Dev' : null });

test('missing file is an empty list; upsert creates the directory and file', async () => {
  await withDir(async dir => {
    const path = join(dir, 'nested', 'quests.json');
    const store = createQuestStore(path);
    assert.deepEqual(await store.list(), []);
    assert.deepEqual(await store.upsert(quest(1)), [quest(1)]);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), [quest(1)]);
  });
});
test('upsert replaces an existing quest instead of duplicating it; remove drops it', async () => {
  await withDir(async dir => {
    const store = createQuestStore(join(dir, 'quests.json'));
    await store.upsert(quest(1));
    await store.upsert(quest(2));
    assert.deepEqual(await store.upsert(quest(1, 3)), [quest(1, 3), quest(2)]);
    assert.deepEqual(await store.remove(1), [quest(2)]);
    assert.deepEqual(await store.remove(99), [quest(2)]);
  });
});
test('concurrent writes are serialized and leave no temp files', async () => {
  await withDir(async dir => {
    const store = createQuestStore(join(dir, 'quests.json'));
    await Promise.all([1, 2, 3, 4, 5].map(id => store.upsert(quest(id))));
    assert.deepEqual((await store.list()).map(item => item.workPackageId).sort(), [1, 2, 3, 4, 5]);
    assert.deepEqual(await readdir(dir), ['quests.json']);
  });
});
test('corrupt file is reported and never overwritten', async () => {
  await withDir(async dir => {
    const path = join(dir, 'quests.json');
    await writeFile(path, '{ broken');
    const store = createQuestStore(path);
    await assert.rejects(store.list(), QuestStoreError);
    await assert.rejects(store.upsert(quest(1)), QuestStoreError);
    assert.equal(await readFile(path, 'utf8'), '{ broken');
    await writeFile(path, '{"not":"array"}');
    await assert.rejects(store.list(), QuestStoreError);
  });
});
