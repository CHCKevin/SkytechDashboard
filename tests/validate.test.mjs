import test from 'node:test';
import assert from 'node:assert/strict';
import { InputError, parseDate, parsePathId, parseEntryInput, parseQuestInput, parseSearchTerm } from '../server/validate.mjs';

const fails = (fn, field) => assert.throws(fn, error => error instanceof InputError && error.field === field);

test('parseDate accepts real calendar dates only', () => {
  assert.equal(parseDate('2026-11-16'), '2026-11-16');
  assert.equal(parseDate('2024-02-29'), '2024-02-29');
  for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '', null, '2026-11-16T00:00']) fails(() => parseDate(bad), 'date');
});
test('parsePathId accepts positive integer strings', () => {
  assert.equal(parsePathId('42', 'id'), 42);
  for (const bad of ['0', '-1', '1.5', 'abc', '', '99999999999']) fails(() => parsePathId(bad, 'id'), 'id');
});
test('parseEntryInput requires core fields and defaults optional ones', () => {
  assert.deepEqual(parseEntryInput({ workPackageId: 5, date: '2026-11-16', hours: 2.5 }),
    { workPackageId: 5, date: '2026-11-16', hours: 2.5, activityId: null, comment: '' });
  assert.deepEqual(parseEntryInput({ workPackageId: 5, date: '2026-11-16', hours: 1, activityId: 3, comment: 'x' }),
    { workPackageId: 5, date: '2026-11-16', hours: 1, activityId: 3, comment: 'x' });
  fails(() => parseEntryInput({ date: '2026-11-16', hours: 1 }), 'workPackageId');
  fails(() => parseEntryInput({ workPackageId: 5, hours: 1 }), 'date');
  fails(() => parseEntryInput({ workPackageId: 5, date: '2026-11-16' }), 'hours');
});
test('parseEntryInput validates hours, activity, comment and unknown keys', () => {
  const base = { workPackageId: 5, date: '2026-11-16' };
  for (const bad of [0, -1, 24.01, 1.234, '2', NaN, Infinity]) fails(() => parseEntryInput({ ...base, hours: bad }), 'hours');
  assert.equal(parseEntryInput({ ...base, hours: 24 }).hours, 24);
  assert.equal(parseEntryInput({ ...base, hours: 0.01 }).hours, 0.01);
  fails(() => parseEntryInput({ ...base, hours: 1, activityId: 0 }), 'activityId');
  fails(() => parseEntryInput({ ...base, hours: 1, activityId: '3' }), 'activityId');
  fails(() => parseEntryInput({ ...base, hours: 1, comment: 5 }), 'comment');
  fails(() => parseEntryInput({ ...base, hours: 1, comment: 'x'.repeat(1001) }), 'comment');
  fails(() => parseEntryInput({ ...base, hours: 1, userId: 1 }), 'userId');
  fails(() => parseEntryInput(null), 'body');
  fails(() => parseEntryInput([]), 'body');
});
test('partial entry input keeps only provided fields and needs at least one', () => {
  assert.deepEqual(parseEntryInput({ hours: 3 }, { partial: true }), { hours: 3 });
  assert.deepEqual(parseEntryInput({ activityId: null }, { partial: true }), { activityId: null });
  fails(() => parseEntryInput({}, { partial: true }), 'body');
});
test('parseQuestInput and parseSearchTerm', () => {
  assert.deepEqual(parseQuestInput({ workPackageId: 7 }), { workPackageId: 7, activityId: null });
  assert.deepEqual(parseQuestInput({ workPackageId: 7, activityId: 3 }), { workPackageId: 7, activityId: 3 });
  fails(() => parseQuestInput({ activityId: 3 }), 'workPackageId');
  fails(() => parseQuestInput({ workPackageId: 7, x: 1 }), 'x');
  assert.equal(parseSearchTerm('  #123 '), '123');
  assert.equal(parseSearchTerm('登入頁'), '登入頁');
  assert.equal(parseSearchTerm('   '), '');
  assert.equal(parseSearchTerm(null), '');
  fails(() => parseSearchTerm('x'.repeat(101)), 'q');
});
