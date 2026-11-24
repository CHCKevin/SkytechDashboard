import test from 'node:test';
import assert from 'node:assert/strict';
import { InputError, parseDate, parsePathId, parseEntryInput, parseQuestInput, parseSearchTerm, parseHallMemberInput, parseTodoInput } from '../server/validate.mjs';

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
test('parseHallMemberInput requires a positive integer userId and nothing else', () => {
  assert.deepEqual(parseHallMemberInput({ userId: 18 }), { userId: 18 });
  fails(() => parseHallMemberInput({}), 'userId');
  for (const bad of ['18', 0, 1.5, null, -3]) fails(() => parseHallMemberInput({ userId: bad }), 'userId');
  fails(() => parseHallMemberInput({ userId: 18, name: 'x' }), 'name');
  fails(() => parseHallMemberInput([]), 'body');
  fails(() => parseHallMemberInput(null), 'body');
});

test('parseTodoInput requires a non-blank title and defaults note and dueDate', () => {
  assert.deepEqual(parseTodoInput({ title: '  寫週報 ' }), { title: '寫週報', note: '', dueDate: null });
  assert.deepEqual(parseTodoInput({ title: 'A', note: '一\n二', dueDate: '2026-11-30' }), { title: 'A', note: '一\n二', dueDate: '2026-11-30' });
  assert.deepEqual(parseTodoInput({ title: 'A', dueDate: null }), { title: 'A', note: '', dueDate: null });
  for (const bad of [undefined, '', '   ', 3, 'x'.repeat(101)]) fails(() => parseTodoInput({ title: bad }), 'title');
  fails(() => parseTodoInput({ title: 'A', note: 3 }), 'note');
  fails(() => parseTodoInput({ title: 'A', note: 'x'.repeat(1001) }), 'note');
  fails(() => parseTodoInput({ title: 'A', dueDate: '2026-02-30' }), 'dueDate');
  // 新增時不能直接結案。
  fails(() => parseTodoInput({ title: 'A', closed: true }), 'closed');
  fails(() => parseTodoInput(null), 'body');
});
test('partial todo input keeps only provided fields and accepts closed', () => {
  assert.deepEqual(parseTodoInput({ closed: true }, { partial: true }), { closed: true });
  assert.deepEqual(parseTodoInput({ note: '', dueDate: null }, { partial: true }), { note: '', dueDate: null });
  fails(() => parseTodoInput({}, { partial: true }), 'body');
  fails(() => parseTodoInput({ closed: 'yes' }, { partial: true }), 'closed');
  fails(() => parseTodoInput({ title: ' ' }, { partial: true }), 'title');
  fails(() => parseTodoInput({ id: 3 }, { partial: true }), 'id');
});
