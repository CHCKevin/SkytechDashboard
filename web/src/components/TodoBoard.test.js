import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TodoBoard from './TodoBoard.svelte';

vi.mock('../lib/api.js', () => ({ listTodos: vi.fn(), createTodo: vi.fn(), updateTodo: vi.fn(), deleteTodo: vi.fn() }));
vi.mock('../lib/dates.js', async () => ({ ...(await vi.importActual('../lib/dates.js')), todayLocal: () => '2026-11-24' }));
import * as api from '../lib/api.js';

const todo = (id, extra = {}) => ({ id, title: `委託${id}`, note: '', dueDate: null, createdAt: '2026-11-20T00:00:00.000Z', closedAt: null, ...extra });
const labels = name => screen.getAllByRole('button', { name }).map(button => button.getAttribute('aria-label'));

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

test('shows open todos sorted by due date, marks overdue ones, and keeps closed ones in history', async () => {
  api.listTodos.mockResolvedValue([
    todo(1),
    todo(2, { dueDate: '2026-11-30', note: '第一行\n第二行' }),
    todo(3, { dueDate: '2026-11-20' }),
    todo(4, { closedAt: '2026-11-21T00:00:00.000Z' }),
    todo(5, { closedAt: '2026-11-23T00:00:00.000Z' }),
  ]);
  render(TodoBoard, { onbanner: vi.fn() });
  await screen.findByRole('button', { name: '改 委託1' });
  expect(labels(/^改 /)).toEqual(['改 委託3', '改 委託2', '改 委託1']);
  expect(screen.getByText('⚠ 逾期：2026-11-20')).toBeTruthy();
  expect(screen.getByText('期限：2026-11-30')).toBeTruthy();
  expect(screen.getByText(/第一行\s*第二行/)).toBeTruthy();
  expect(screen.getByText('📦 歷史任務（2）')).toBeTruthy();
  expect(labels(/^重開 /)).toEqual(['重開 委託5', '重開 委託4']);
});

test('pin a new todo through the dialog', async () => {
  api.listTodos.mockResolvedValue([]);
  api.createTodo.mockResolvedValue([todo(1, { title: '寫週報', note: '記得附圖', dueDate: '2026-11-28' })]);
  render(TodoBoard, { onbanner: vi.fn() });
  await userEvent.click(await screen.findByRole('button', { name: '＋ 釘上委託' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: '釘上布告欄' }));
  expect(within(dialog).getByRole('alert').textContent).toBe('標題不能是空的');
  expect(api.createTodo).not.toHaveBeenCalled();
  await userEvent.type(within(dialog).getByRole('textbox', { name: '標題' }), '  寫週報 ');
  await userEvent.type(within(dialog).getByRole('textbox', { name: '備註' }), '記得附圖');
  await userEvent.type(within(dialog).getByLabelText('期限'), '2026-11-28');
  await userEvent.click(within(dialog).getByRole('button', { name: '釘上布告欄' }));
  expect(api.createTodo).toHaveBeenCalledWith({ title: '寫週報', note: '記得附圖', dueDate: '2026-11-28' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: '改 寫週報' })).toBeTruthy();
});

test('editing sends only changed fields; clearing the due date sends null', async () => {
  api.listTodos.mockResolvedValue([todo(1, { note: '舊備註', dueDate: '2026-11-30' })]);
  api.updateTodo.mockResolvedValue([todo(1, { title: '新標題', note: '舊備註' })]);
  render(TodoBoard, { onbanner: vi.fn() });
  await userEvent.click(await screen.findByRole('button', { name: '改 委託1' }));
  const dialog = screen.getByRole('dialog');
  const title = within(dialog).getByRole('textbox', { name: '標題' });
  await userEvent.clear(title);
  await userEvent.type(title, '新標題');
  await userEvent.clear(within(dialog).getByLabelText('期限'));
  await userEvent.click(within(dialog).getByRole('button', { name: '更新委託' }));
  expect(api.updateTodo).toHaveBeenCalledWith(1, { title: '新標題', dueDate: null });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('editing without changes just closes the dialog', async () => {
  api.listTodos.mockResolvedValue([todo(1)]);
  render(TodoBoard, { onbanner: vi.fn() });
  await userEvent.click(await screen.findByRole('button', { name: '改 委託1' }));
  await userEvent.click(screen.getByRole('button', { name: '更新委託' }));
  expect(api.updateTodo).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('close moves a todo to history; reopen brings it back', async () => {
  api.listTodos.mockResolvedValue([todo(1)]);
  api.updateTodo.mockResolvedValueOnce([todo(1, { closedAt: '2026-11-24T01:00:00.000Z' })]);
  api.updateTodo.mockResolvedValueOnce([todo(1)]);
  render(TodoBoard, { onbanner: vi.fn() });
  await userEvent.click(await screen.findByRole('button', { name: '結案 委託1' }));
  expect(api.updateTodo).toHaveBeenLastCalledWith(1, { closed: true });
  expect(screen.queryByRole('button', { name: '改 委託1' })).toBeNull();
  expect(screen.getByText('📦 歷史任務（1）')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: '重開 委託1' }));
  expect(api.updateTodo).toHaveBeenLastCalledWith(1, { closed: false });
  expect(screen.getByRole('button', { name: '改 委託1' })).toBeTruthy();
  expect(screen.getByText('📦 歷史任務（0）')).toBeTruthy();
});

test('delete asks first and does nothing when cancelled', async () => {
  api.listTodos.mockResolvedValue([todo(1)]);
  api.deleteTodo.mockResolvedValue([]);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(TodoBoard, { onbanner: vi.fn() });
  await userEvent.click(await screen.findByRole('button', { name: '刪除 委託1' }));
  expect(api.deleteTodo).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '刪除 委託1' }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(api.deleteTodo).toHaveBeenCalledWith(1);
  expect(screen.queryByRole('button', { name: '改 委託1' })).toBeNull();
});

test('a failed action shows a banner and reloads the list', async () => {
  api.listTodos.mockResolvedValueOnce([todo(1)]).mockResolvedValueOnce([]);
  api.updateTodo.mockRejectedValue(new Error('找不到這筆待辦委託，可能已被刪除'));
  const onbanner = vi.fn();
  render(TodoBoard, { onbanner });
  await userEvent.click(await screen.findByRole('button', { name: '結案 委託1' }));
  expect(onbanner).toHaveBeenCalledWith('找不到這筆待辦委託，可能已被刪除');
  expect(api.listTodos).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('button', { name: '改 委託1' })).toBeNull();
});

test('a failed save keeps the dialog open with the message', async () => {
  api.listTodos.mockResolvedValue([]);
  api.createTodo.mockRejectedValue(new Error('標題最多 100 字'));
  render(TodoBoard, { onbanner: vi.fn() });
  await userEvent.click(await screen.findByRole('button', { name: '＋ 釘上委託' }));
  await userEvent.type(screen.getByRole('textbox', { name: '標題' }), 'A');
  await userEvent.click(screen.getByRole('button', { name: '釘上布告欄' }));
  expect(screen.getByRole('alert').textContent).toBe('標題最多 100 字');
  expect(screen.getByRole('textbox', { name: '標題' }).value).toBe('A');
});
