import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import App from './App.svelte';

vi.mock('./lib/api.js', async () => {
  const { ApiError } = await vi.importActual('./lib/api.js');
  return {
    ApiError,
    getMe: vi.fn(), getConfig: vi.fn(), listQuests: vi.fn(), listEntries: vi.fn(), createEntry: vi.fn(),
    updateEntry: vi.fn(), deleteEntry: vi.fn(), listActivities: vi.fn(), searchWorkPackages: vi.fn(),
    pinQuest: vi.fn(), unpinQuest: vi.fn(),
  };
});
vi.mock('./lib/dates.js', async () => ({ ...(await vi.importActual('./lib/dates.js')), todayLocal: () => '2026-11-16' }));
import * as api from './lib/api.js';

const quest = { workPackageId: 1234, subject: '前端登入頁改版', activityId: 3, activityName: 'Development' };
const entry = { id: 7, workPackageId: 1234, workPackageSubject: '前端登入頁改版', date: '2026-11-16', hours: 2, activityId: 3, activityName: 'Development', comment: '' };

beforeEach(() => {
  vi.clearAllMocks();
  api.getMe.mockResolvedValue({ id: 1, name: 'Ted' });
  api.getConfig.mockResolvedValue({ dailyTargetHours: 8 });
  api.listQuests.mockResolvedValue([quest]);
  api.listEntries.mockResolvedValue([]);
  api.listActivities.mockResolvedValue([{ id: 3, name: 'Development', default: false }]);
});

test('loads user, quests and the day', async () => {
  render(App);
  expect(await screen.findByText('冒險者：Ted')).toBeTruthy();
  expect(await screen.findByText('前端登入頁改版')).toBeTruthy();
  expect(api.listEntries).toHaveBeenCalledWith('2026-11-16');
});
test('accepting a quest creates an entry and refreshes the list', async () => {
  api.createEntry.mockResolvedValue(entry);
  render(App);
  await userEvent.click(await screen.findByText('前端登入頁改版'));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('combobox', { name: '活動' });
  api.listEntries.mockResolvedValue([entry]);
  await userEvent.click(within(dialog).getByRole('button', { name: '2' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '接下任務！' }));
  expect(api.createEntry).toHaveBeenCalledWith({ workPackageId: 1234, date: '2026-11-16', hours: 2, activityId: 3, comment: '' });
  expect(await screen.findByText('2 / 8h')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});
test('changing the day reloads entries', async () => {
  render(App);
  await screen.findByText('冒險者：Ted');
  await userEvent.click(screen.getByRole('button', { name: '前一天' }));
  expect(api.listEntries).toHaveBeenLastCalledWith('2026-11-15');
});
test('an uncertain create reloads the day and warns instead of retrying', async () => {
  api.createEntry.mockRejectedValue(new api.ApiError(502, 'timeout', '連線 OpenProject 逾時'));
  render(App);
  await userEvent.click(await screen.findByText('前端登入頁改版'));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByRole('textbox', { name: '時數' }), '1');
  const before = api.listEntries.mock.calls.length;
  await userEvent.click(within(dialog).getByRole('button', { name: '接下任務！' }));
  expect((await within(dialog).findByRole('alert')).textContent).toMatch(/結果不確定/);
  expect(api.listEntries.mock.calls.length).toBe(before + 1);
  expect(api.createEntry).toHaveBeenCalledTimes(1);
});
test('editing sends only changed fields and refreshes', async () => {
  api.listEntries.mockResolvedValue([entry]);
  api.updateEntry.mockResolvedValue({ ...entry, hours: 4 });
  render(App);
  await userEvent.click(await screen.findByRole('button', { name: /^改 #/ }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('combobox', { name: '活動' });
  await userEvent.click(within(dialog).getByRole('button', { name: '4' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '更新紀錄' }));
  expect(api.updateEntry).toHaveBeenCalledWith(7, { hours: 4 });
  expect(screen.queryByRole('dialog')).toBeNull();
});
test('deleting asks for confirmation', async () => {
  api.listEntries.mockResolvedValue([entry]);
  api.deleteEntry.mockResolvedValue(null);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(App);
  const button = await screen.findByRole('button', { name: /^刪 / });
  await userEvent.click(button);
  expect(api.deleteEntry).not.toHaveBeenCalled();
  await userEvent.click(button);
  expect(api.deleteEntry).toHaveBeenCalledWith(7);
  confirm.mockRestore();
});
test('a failed initial load shows a banner', async () => {
  api.getMe.mockRejectedValue(new api.ApiError(502, 'unauthorized', 'OpenProject 驗證失敗，請確認 API token'));
  render(App);
  expect(await screen.findByText(/OpenProject 驗證失敗/)).toBeTruthy();
});
test('switching day drops the previous day rows while loading', async () => {
  api.listEntries.mockResolvedValueOnce([entry]);
  render(App);
  await screen.findByRole('button', { name: /^刪 / });
  api.listEntries.mockReturnValueOnce(new Promise(() => {}));
  await userEvent.click(screen.getByRole('button', { name: '前一天' }));
  expect(await screen.findByText('讀取中…')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^刪 / })).toBeNull();
  expect(screen.queryByRole('button', { name: /^改 #/ })).toBeNull();
});
test('a failed day load clears old rows and shows the error', async () => {
  api.listEntries.mockResolvedValueOnce([entry]);
  render(App);
  await screen.findByRole('button', { name: /^刪 / });
  api.listEntries.mockRejectedValueOnce(new api.ApiError(502, 'timeout', '連線 OpenProject 逾時'));
  await userEvent.click(screen.getByRole('button', { name: '前一天' }));
  expect((await screen.findAllByText(/連線 OpenProject 逾時/)).length).toBeGreaterThan(1);
  expect(screen.queryByRole('button', { name: /^刪 / })).toBeNull();
  expect(screen.queryByText('這天還沒有接任務')).toBeNull();
});
test('an upstream_error create reloads the day and warns without a second create', async () => {
  api.createEntry.mockRejectedValue(new api.ApiError(502, 'upstream_error', 'OpenProject 伺服器錯誤'));
  render(App);
  await userEvent.click(await screen.findByText('前端登入頁改版'));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByRole('textbox', { name: '時數' }), '1');
  const before = api.listEntries.mock.calls.length;
  await userEvent.click(within(dialog).getByRole('button', { name: '接下任務！' }));
  expect((await within(dialog).findByRole('alert')).textContent).toMatch(/結果不確定/);
  expect(api.listEntries.mock.calls.length).toBe(before + 1);
  expect(api.createEntry).toHaveBeenCalledTimes(1);
});
test('a failed delete reloads the day so a delete that did succeed disappears', async () => {
  api.listEntries.mockResolvedValueOnce([entry]);
  api.deleteEntry.mockRejectedValue(new api.ApiError(0, 'network', '無法連線到本機伺服器'));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(App);
  await userEvent.click(await screen.findByRole('button', { name: /^刪 / }));
  expect(await screen.findByText(/無法連線到本機伺服器/)).toBeTruthy();
  await vi.waitFor(() => expect(screen.queryByRole('button', { name: /^刪 / })).toBeNull());
  confirm.mockRestore();
});
