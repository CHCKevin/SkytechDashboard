import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import RecruitDialog from './RecruitDialog.svelte';

vi.mock('../lib/api.js', () => ({ searchUsers: vi.fn() }));
import { searchUsers } from '../lib/api.js';

const users = [{ id: 11, name: '劍士 小華' }, { id: 17, name: '學徒 小安' }];

beforeEach(() => {
  vi.mocked(searchUsers).mockReset();
  vi.mocked(searchUsers).mockResolvedValue(users);
});

const open = (props = {}) => {
  const onsubmit = vi.fn(async () => {});
  const oncancel = vi.fn();
  render(RecruitDialog, { memberIds: [], onsubmit, oncancel, searchDelay: 0, ...props });
  return { onsubmit, oncancel };
};

test('search, choose a user, and recruit', async () => {
  const { onsubmit } = open();
  expect(screen.getByRole('button', { name: '加入大廳' }).disabled).toBe(true);
  await userEvent.type(screen.getByRole('searchbox', { name: '搜尋成員名稱' }), '小');
  await userEvent.click(await screen.findByRole('button', { name: '學徒 小安' }));
  expect(searchUsers).toHaveBeenLastCalledWith('小');
  expect(onsubmit).not.toHaveBeenCalled();
  expect(screen.getByText('要招募：學徒 小安')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: '加入大廳' }));
  expect(onsubmit).toHaveBeenCalledTimes(1);
  expect(onsubmit).toHaveBeenCalledWith(17);
});
test('users already in the hall are marked and cannot be chosen', async () => {
  open({ memberIds: [11] });
  await userEvent.type(screen.getByRole('searchbox'), '小');
  const joined = await screen.findByRole('button', { name: /劍士 小華/ });
  expect(joined.disabled).toBe(true);
  expect(joined.textContent).toMatch(/已在大廳/);
  expect(screen.getByRole('button', { name: '學徒 小安' }).disabled).toBe(false);
});
test('pressing Enter in the search box before choosing does not submit', async () => {
  const { onsubmit } = open();
  await userEvent.type(screen.getByRole('searchbox'), '小{Enter}');
  await screen.findByRole('button', { name: '學徒 小安' });
  expect(onsubmit).not.toHaveBeenCalled();
});
test('a failed recruit shows the error and keeps the dialog usable', async () => {
  const onsubmit = vi.fn(async () => { throw new Error('大廳已滿（最多 16 位成員）'); });
  open({ onsubmit });
  await userEvent.type(screen.getByRole('searchbox'), '小');
  await userEvent.click(await screen.findByRole('button', { name: '學徒 小安' }));
  await userEvent.click(screen.getByRole('button', { name: '加入大廳' }));
  expect((await screen.findByRole('alert')).textContent).toBe('大廳已滿（最多 16 位成員）');
  expect(screen.getByRole('button', { name: '加入大廳' }).disabled).toBe(false);
});
test('a second click while recruiting is ignored', async () => {
  let finish;
  const onsubmit = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  open({ onsubmit });
  await userEvent.type(screen.getByRole('searchbox'), '小');
  await userEvent.click(await screen.findByRole('button', { name: '學徒 小安' }));
  const button = screen.getByRole('button', { name: '加入大廳' });
  await userEvent.click(button);
  expect(button.disabled).toBe(true);
  expect(screen.getByRole('button', { name: '取消' }).disabled).toBe(true);
  button.closest('form').requestSubmit();
  expect(onsubmit).toHaveBeenCalledTimes(1);
  finish();
});
test('no matches and search errors are reported', async () => {
  vi.mocked(searchUsers).mockResolvedValueOnce([]);
  open();
  await userEvent.type(screen.getByRole('searchbox'), 'q');
  expect(await screen.findByText('找不到符合的成員')).toBeTruthy();
  vi.mocked(searchUsers).mockRejectedValueOnce(new Error('連線 OpenProject 逾時'));
  await userEvent.type(screen.getByRole('searchbox'), 'w');
  expect(await screen.findByText('連線 OpenProject 逾時')).toBeTruthy();
});
test('a slow earlier search cannot overwrite a newer one', async () => {
  let finishOld;
  vi.mocked(searchUsers)
    .mockImplementationOnce(() => new Promise(resolve => { finishOld = () => resolve([{ id: 99, name: '舊結果' }]); }))
    .mockResolvedValueOnce([{ id: 17, name: '學徒 小安' }]);
  open();
  const box = screen.getByRole('searchbox');
  await userEvent.type(box, '舊');
  await vi.waitFor(() => expect(searchUsers).toHaveBeenCalledTimes(1));
  await userEvent.type(box, '新');
  await screen.findByRole('button', { name: '學徒 小安' });
  finishOld();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByRole('button', { name: '舊結果' })).toBeNull();
  expect(screen.getByRole('button', { name: '學徒 小安' })).toBeTruthy();
});
test('clearing the search box clears the results', async () => {
  open();
  const box = screen.getByRole('searchbox');
  await userEvent.type(box, '小');
  await screen.findByRole('button', { name: '學徒 小安' });
  await userEvent.clear(box);
  expect(screen.queryByRole('button', { name: '學徒 小安' })).toBeNull();
});
test('cancel closes the dialog', async () => {
  const { oncancel } = open();
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(oncancel).toHaveBeenCalledTimes(1);
});
