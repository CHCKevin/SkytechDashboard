import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSource } from '../server/demo.mjs';

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
