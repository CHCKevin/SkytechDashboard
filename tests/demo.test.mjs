import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSource, DEMO_HALL_MEMBERS } from '../server/demo.mjs';

const isCode = code => error => error.code === code;

test('demo source has a user, work packages and activities', async () => {
  const source = createDemoSource();
  assert.deepEqual(await source.getMe(), { id: 1, name: '示例冒險者' });
  assert.equal((await source.getWorkPackage(1234)).subject, '前端登入頁改版');
  await assert.rejects(source.getWorkPackage(999), isCode('not_found'));
  const activities = await source.listActivities(1234);
  assert.ok(activities.some(activity => activity.default));
  await assert.rejects(source.listActivities(999), isCode('not_found'));
});
test('demo search matches id or subject and puts exact id first', async () => {
  const source = createDemoSource();
  assert.equal((await source.searchWorkPackages('2051'))[0].id, 2051);
  assert.ok((await source.searchWorkPackages('登入')).every(wp => wp.subject.includes('登入')));
  assert.deepEqual(await source.searchWorkPackages(''), []);
  assert.ok((await source.searchWorkPackages('2')).length <= 10);
});
test('demo entries support create, list by day, update and delete', async () => {
  const source = createDemoSource();
  const before = await source.listEntries('2030-01-01');
  assert.deepEqual(before, []);
  const created = await source.createEntry({ workPackageId: 1234, date: '2030-01-01', hours: 2.5, activityId: 3, comment: 'x' });
  assert.deepEqual(created, { id: created.id, workPackageId: 1234, workPackageSubject: '前端登入頁改版', date: '2030-01-01',
    hours: 2.5, activityId: 3, activityName: 'Development', comment: 'x' });
  assert.deepEqual(await source.listEntries('2030-01-01'), [created]);
  const updated = await source.updateEntry(created.id, { hours: 1, activityId: null });
  assert.equal(updated.hours, 1);
  assert.equal(updated.activityName, null);
  await source.deleteEntry(created.id);
  assert.deepEqual(await source.listEntries('2030-01-01'), []);
  await assert.rejects(source.deleteEntry(created.id), isCode('not_found'));
  await assert.rejects(source.updateEntry(created.id, { hours: 1 }), isCode('not_found'));
});
test('demo rejects unknown work packages and activities', async () => {
  const source = createDemoSource();
  await assert.rejects(source.createEntry({ workPackageId: 999, date: '2030-01-01', hours: 1, activityId: null, comment: '' }), isCode('not_found'));
  await assert.rejects(source.createEntry({ workPackageId: 1234, date: '2030-01-01', hours: 1, activityId: 77, comment: '' }),
    error => error.code === 'validation' && /Activity/.test(error.message));
});
test('demo starts with sample entries for today', async () => {
  const source = createDemoSource({ today: '2026-11-16' });
  assert.equal((await source.listEntries('2026-11-16')).length, 2);
});

test('demo users can be searched by name and read by id', async () => {
  const source = createDemoSource();
  const found = await source.searchUsers('小');
  assert.ok(found.length >= 2);
  assert.ok(found.every(user => user.name.includes('小') && Number.isInteger(user.id)));
  assert.deepEqual(await source.searchUsers(''), []);
  assert.equal((await source.searchUsers('士')).length <= 10, true);
  assert.ok((await source.searchUsers(' ')).length <= 10);
  assert.deepEqual(await source.getUser(1), { id: 1, name: '示例冒險者' });
  await assert.rejects(source.getUser(999), isCode('not_found'));
});
test('demo has enough users to fill the hall', async () => {
  const source = createDemoSource();
  const ids = new Set();
  for (const term of ['士', '師', '手', '賊', '人', '徒', '者', '官']) for (const user of await source.searchUsers(term)) ids.add(user.id);
  assert.ok(ids.size >= 17, `only ${ids.size} demo users`);
});
test('demo hall members cover resting, working and idle', async () => {
  const source = createDemoSource({ today: '2026-11-16' });
  const ids = DEMO_HALL_MEMBERS.map(member => member.userId);
  assert.equal(ids.length, 5);
  assert.ok(ids.includes(1));
  for (const member of DEMO_HALL_MEMBERS) assert.deepEqual(await source.getUser(member.userId), { id: member.userId, name: member.name });
  const entries = await source.listEntriesForUsers('2026-11-16', ids);
  assert.ok(entries.every(entry => ids.includes(entry.userId)));
  assert.deepEqual(entries.map(entry => entry.id), [...entries.map(entry => entry.id)].sort((a, b) => a - b));
  assert.equal(entries.filter(entry => entry.userId === 1).length, 2);
  const byUser = id => entries.filter(entry => entry.userId === id);
  assert.ok(ids.some(id => byUser(id).some(entry => entry.workPackageId === 200)), 'someone is on leave');
  assert.ok(ids.some(id => byUser(id).length === 0), 'someone has no entries');
  assert.ok(ids.some(id => id !== 1 && byUser(id).length && byUser(id).every(entry => entry.workPackageId !== 200)), 'someone else is working');
  assert.deepEqual(await source.listEntriesForUsers('2026-11-16', []), []);
  assert.deepEqual(await source.listEntriesForUsers('2030-01-01', ids), []);
  assert.equal((await source.getWorkPackage(200)).subject, '請假');
});
test('my new demo entries show up in the hall; other members stay out of my log', async () => {
  const source = createDemoSource({ today: '2026-11-16' });
  const created = await source.createEntry({ workPackageId: 2310, date: '2026-11-16', hours: 1, activityId: null, comment: '' });
  const mine = await source.listEntriesForUsers('2026-11-16', [1]);
  assert.deepEqual(mine.at(-1), { userId: 1, ...created });
  const others = (await source.listEntriesForUsers('2026-11-16', DEMO_HALL_MEMBERS.map(member => member.userId))).filter(entry => entry.userId !== 1);
  assert.ok(others.length > 0);
  const myLog = await source.listEntries('2026-11-16');
  assert.equal(myLog.length, 3);
  assert.ok(myLog.every(entry => !('userId' in entry)));
  await assert.rejects(source.updateEntry(others[0].id, { hours: 1 }), isCode('not_found'));
  await assert.rejects(source.deleteEntry(others[0].id), isCode('not_found'));
});
