import { expect, test } from 'vitest';
import { formatClosedAt, isOverdue, splitTodos } from './todos.js';

const todo = (id, extra = {}) => ({ id, title: `T${id}`, note: '', dueDate: null, createdAt: '2026-11-01T00:00:00.000Z', closedAt: null, ...extra });

test('open todos sort by due date, undated last, ties by id', () => {
  const list = [todo(1), todo(2, { dueDate: '2026-12-01' }), todo(3, { dueDate: '2026-11-25' }), todo(4), todo(5, { dueDate: '2026-11-25' })];
  expect(splitTodos(list).open.map(item => item.id)).toEqual([3, 5, 2, 1, 4]);
});

test('closed todos sort by closedAt, newest first, and are separated from open ones', () => {
  const list = [
    todo(1, { closedAt: '2026-11-20T08:00:00.000Z' }),
    todo(2),
    todo(3, { closedAt: '2026-11-23T08:00:00.000Z' }),
    todo(4, { closedAt: '2026-11-21T08:00:00.000Z' }),
  ];
  const { open, closed } = splitTodos(list);
  expect(open.map(item => item.id)).toEqual([2]);
  expect(closed.map(item => item.id)).toEqual([3, 4, 1]);
});

test('splitTodos does not reorder the input array', () => {
  const list = [todo(2, { dueDate: '2026-12-01' }), todo(1, { dueDate: '2026-11-01' })];
  splitTodos(list);
  expect(list.map(item => item.id)).toEqual([2, 1]);
});

test('only open todos with a past due date are overdue', () => {
  expect(isOverdue(todo(1, { dueDate: '2026-11-23' }), '2026-11-24')).toBe(true);
  expect(isOverdue(todo(1, { dueDate: '2026-11-24' }), '2026-11-24')).toBe(false);
  expect(isOverdue(todo(1), '2026-11-24')).toBe(false);
  expect(isOverdue(todo(1, { dueDate: '2026-11-01', closedAt: '2026-11-02T00:00:00.000Z' }), '2026-11-24')).toBe(false);
});

test('formatClosedAt shows local date and time', () => {
  const local = new Date(2026, 10, 24, 9, 5);
  expect(formatClosedAt(local.toISOString())).toBe('2026-11-24 09:05');
});
