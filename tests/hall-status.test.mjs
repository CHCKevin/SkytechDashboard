import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHall, memberStatus } from '../server/hall-status.mjs';

const entry = (userId, id, workPackageId, hours = 1) => ({
  userId, id, workPackageId, workPackageSubject: `WP ${workPackageId}`, date: '2026-11-17',
  hours, activityId: 3, activityName: 'Development', comment: `備註 ${id}`,
});

test('memberStatus: leave wins, then any entry means working, otherwise idle', () => {
  assert.equal(memberStatus([], 200), 'idle');
  assert.equal(memberStatus([entry(1, 1, 202)], 200), 'working');
  assert.equal(memberStatus([entry(1, 1, 200)], 200), 'resting');
  assert.equal(memberStatus([entry(1, 1, 202), entry(1, 2, 200)], 200), 'resting');
});
test('memberStatus uses the configured leave work package', () => {
  assert.equal(memberStatus([entry(1, 1, 200)], 77), 'working');
  assert.equal(memberStatus([entry(1, 1, 77)], 77), 'resting');
});
test('buildHall keeps member order and gives each member their own entries', () => {
  const members = [{ userId: 9, name: '甲' }, { userId: 3, name: '乙' }, { userId: 5, name: '丙' }];
  const hall = buildHall('2026-11-17', members, [
    entry(3, 10, 202, 0.1), entry(9, 11, 200, 8), entry(3, 12, 159, 0.2), entry(42, 13, 202, 4),
  ], 200);
  assert.equal(hall.date, '2026-11-17');
  assert.deepEqual(hall.members.map(member => [member.userId, member.name, member.status, member.totalHours, member.entries.map(item => item.id)]), [
    [9, '甲', 'resting', 8, [11]],
    [3, '乙', 'working', 0.3, [10, 12]],
    [5, '丙', 'idle', 0, []],
  ]);
});
test('buildHall exposes only the display fields of an entry', () => {
  const hall = buildHall('2026-11-17', [{ userId: 3, name: '乙' }], [entry(3, 10, 202, 2)], 200);
  assert.deepEqual(hall.members[0].entries, [
    { id: 10, workPackageId: 202, workPackageSubject: 'WP 202', hours: 2, activityName: 'Development', comment: '備註 10' },
  ]);
});
