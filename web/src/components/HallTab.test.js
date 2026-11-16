import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import HallTab from './HallTab.svelte';

vi.mock('../lib/api.js', () => ({ getHall: vi.fn(), searchUsers: vi.fn(), addHallMember: vi.fn(), removeHallMember: vi.fn() }));
import * as api from '../lib/api.js';

const worker = {
  userId: 12, name: '法師 怡君', status: 'working', totalHours: 5,
  entries: [{ id: 4, workPackageId: 1990, workPackageSubject: 'Code review', hours: 5, activityName: null, comment: '' }],
};
const rester = { userId: 11, name: '劍士 小華', status: 'resting', totalHours: 8, entries: [{ id: 3, workPackageId: 200, workPackageSubject: '請假', hours: 8, activityName: null, comment: '' }] };
const hall = (members = [rester, worker], date = '2026-11-16') => ({ date, members });
const sceneButtons = () => within(screen.getByRole('region', { name: '公會大廳' })).queryAllByRole('button');
const setVisibility = value => {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.resetAllMocks();
  api.getHall.mockResolvedValue(hall());
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('loads the hall for the day and seats the members', async () => {
  render(HallTab, { date: '2026-11-16' });
  expect(await screen.findByRole('button', { name: '法師 怡君：工作中' })).toBeTruthy();
  expect(api.getHall).toHaveBeenCalledTimes(1);
  expect(api.getHall).toHaveBeenCalledWith('2026-11-16');
  expect(sceneButtons()).toHaveLength(2);
  expect(screen.getByRole('heading', { name: /公會成員 2 \/ 16/ })).toBeTruthy();
  expect(screen.getByText(/^上次更新 \d\d:\d\d$/)).toBeTruthy();
});
test('shows a loading note, then an error with an empty scene when the first load fails', async () => {
  let fail;
  api.getHall.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
  render(HallTab, { date: '2026-11-16' });
  expect(await screen.findByText('讀取中…')).toBeTruthy();
  fail(new Error('連線 OpenProject 逾時'));
  expect((await screen.findByRole('alert')).textContent).toBe('連線 OpenProject 逾時');
  expect(sceneButtons()).toHaveLength(0);
  expect(screen.queryByText('讀取中…')).toBeNull();
});
test('changing the day clears the scene at once and loads the new day', async () => {
  const { rerender } = render(HallTab, { date: '2026-11-16' });
  await screen.findByRole('button', { name: '法師 怡君：工作中' });
  api.getHall.mockReturnValueOnce(new Promise(() => {}));
  await rerender({ date: '2026-11-15' });
  expect(api.getHall).toHaveBeenLastCalledWith('2026-11-15');
  expect(sceneButtons()).toHaveLength(0);
  expect(screen.getByText('讀取中…')).toBeTruthy();
});
test('a slow response for an earlier day is dropped', async () => {
  let finishOld;
  api.getHall.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
  const { rerender } = render(HallTab, { date: '2026-11-16' });
  api.getHall.mockResolvedValueOnce(hall([worker], '2026-11-15'));
  await rerender({ date: '2026-11-15' });
  await screen.findByRole('button', { name: '法師 怡君：工作中' });
  finishOld(hall([rester]));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByRole('button', { name: '劍士 小華：休息' })).toBeNull();
  expect(sceneButtons()).toHaveLength(1);
});
test('refreshes every five minutes while visible, not while hidden, and again on return', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  render(HallTab, { date: '2026-11-16' });
  await screen.findByRole('button', { name: '法師 怡君：工作中' });
  vi.advanceTimersByTime(4 * 60_000);
  expect(api.getHall).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60_000);
  expect(api.getHall).toHaveBeenCalledTimes(2);
  setVisibility('hidden');
  vi.advanceTimersByTime(10 * 60_000);
  expect(api.getHall).toHaveBeenCalledTimes(2);
  setVisibility('visible');
  expect(api.getHall).toHaveBeenCalledTimes(3);
});
test('stops refreshing after it is removed', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const { unmount } = render(HallTab, { date: '2026-11-16' });
  await screen.findByRole('button', { name: '法師 怡君：工作中' });
  unmount();
  vi.advanceTimersByTime(20 * 60_000);
  setVisibility('visible');
  expect(api.getHall).toHaveBeenCalledTimes(1);
});
test('a failed refresh of the same day keeps the scene and reports it', async () => {
  render(HallTab, { date: '2026-11-16' });
  await screen.findByRole('button', { name: '法師 怡君：工作中' });
  api.getHall.mockRejectedValueOnce(new Error('無法連線到本機伺服器'));
  await userEvent.click(screen.getByRole('button', { name: '重新整理' }));
  expect(await screen.findByText('更新失敗：無法連線到本機伺服器')).toBeTruthy();
  expect(sceneButtons()).toHaveLength(2);
  expect(screen.queryByRole('alert')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '重新整理' }));
  await vi.waitFor(() => expect(screen.queryByText(/更新失敗/)).toBeNull());
});
test('a refresh after a failed first load starts over instead of reporting a refresh failure', async () => {
  api.getHall.mockRejectedValueOnce(new Error('逾時'));
  render(HallTab, { date: '2026-11-16' });
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: '重新整理' }));
  expect(await screen.findByRole('button', { name: '法師 怡君：工作中' })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
test('selecting a member shows their entries; clicking again or back deselects', async () => {
  render(HallTab, { date: '2026-11-16' });
  const member = await screen.findByRole('button', { name: '法師 怡君：工作中' });
  await userEvent.click(member);
  expect(member.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('#1990 Code review')).toBeTruthy();
  await userEvent.click(member);
  expect(screen.queryByText('#1990 Code review')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /^法師 怡君 工作中/ }));
  expect(screen.getByText('#1990 Code review')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: '返回' }));
  expect(screen.getByRole('heading', { name: /公會成員/ })).toBeTruthy();
});
test('the selection survives a refresh, and is dropped when the member is gone', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  render(HallTab, { date: '2026-11-16' });
  await userEvent.click(await screen.findByRole('button', { name: '法師 怡君：工作中' }));
  api.getHall.mockResolvedValueOnce(hall([rester, { ...worker, totalHours: 6 }]));
  vi.advanceTimersByTime(5 * 60_000);
  expect(await screen.findByText('6h')).toBeTruthy();
  expect(screen.getByText('#1990 Code review')).toBeTruthy();
  api.getHall.mockResolvedValueOnce(hall([rester]));
  vi.advanceTimersByTime(5 * 60_000);
  expect(await screen.findByRole('heading', { name: /公會成員 1 \/ 16/ })).toBeTruthy();
});
test('recruiting adds the member, closes the dialog and reloads', async () => {
  api.searchUsers.mockResolvedValue([{ id: 12, name: '法師 怡君' }, { id: 17, name: '學徒 小安' }]);
  api.addHallMember.mockResolvedValue([]);
  render(HallTab, { date: '2026-11-16' });
  await screen.findByRole('button', { name: '法師 怡君：工作中' });
  await userEvent.click(screen.getByRole('button', { name: '＋ 招募成員' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByRole('searchbox'), '安');
  expect((await within(dialog).findByRole('button', { name: /法師 怡君/ })).disabled).toBe(true);
  await userEvent.click(within(dialog).getByRole('button', { name: '學徒 小安' }));
  api.getHall.mockResolvedValueOnce(hall([rester, worker, { userId: 17, name: '學徒 小安', status: 'idle', totalHours: 0, entries: [] }]));
  await userEvent.click(within(dialog).getByRole('button', { name: '加入大廳' }));
  expect(api.addHallMember).toHaveBeenCalledWith(17);
  expect(await screen.findByRole('button', { name: '學徒 小安：發呆' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(api.getHall).toHaveBeenCalledTimes(2);
});
test('a failed recruit stays in the dialog', async () => {
  api.searchUsers.mockResolvedValue([{ id: 17, name: '學徒 小安' }]);
  api.addHallMember.mockRejectedValue(new Error('大廳已滿（最多 16 位成員）'));
  render(HallTab, { date: '2026-11-16' });
  await screen.findByRole('button', { name: '法師 怡君：工作中' });
  await userEvent.click(screen.getByRole('button', { name: '＋ 招募成員' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByRole('searchbox'), '安');
  await userEvent.click(await within(dialog).findByRole('button', { name: '學徒 小安' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '加入大廳' }));
  expect((await within(dialog).findByRole('alert')).textContent).toMatch(/大廳已滿/);
  expect(api.getHall).toHaveBeenCalledTimes(1);
});
test('removing a member asks first, then removes, deselects and reloads', async () => {
  api.removeHallMember.mockResolvedValue([]);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(HallTab, { date: '2026-11-16' });
  await userEvent.click(await screen.findByRole('button', { name: '法師 怡君：工作中' }));
  await userEvent.click(screen.getByRole('button', { name: '請離大廳' }));
  expect(api.removeHallMember).not.toHaveBeenCalled();
  api.getHall.mockResolvedValueOnce(hall([rester]));
  await userEvent.click(screen.getByRole('button', { name: '請離大廳' }));
  expect(api.removeHallMember).toHaveBeenCalledWith(12);
  expect(confirm.mock.calls[0][0]).toMatch(/法師 怡君/);
  expect(await screen.findByRole('heading', { name: /公會成員 1 \/ 16/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '法師 怡君：工作中' })).toBeNull();
});
test('a failed removal is reported and the hall is reloaded', async () => {
  api.removeHallMember.mockRejectedValue(new Error('無法連線到本機伺服器'));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const onbanner = vi.fn();
  render(HallTab, { date: '2026-11-16', onbanner });
  await userEvent.click(await screen.findByRole('button', { name: '法師 怡君：工作中' }));
  await userEvent.click(screen.getByRole('button', { name: '請離大廳' }));
  await vi.waitFor(() => expect(onbanner).toHaveBeenCalledWith('無法連線到本機伺服器'));
  await vi.waitFor(() => expect(api.getHall).toHaveBeenCalledTimes(2));
  expect(screen.getByText('#1990 Code review')).toBeTruthy();
});
