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
    getHall: vi.fn(), searchUsers: vi.fn(), addHallMember: vi.fn(), removeHallMember: vi.fn(),
  };
});
vi.mock('./lib/dates.js', async () => ({ ...(await vi.importActual('./lib/dates.js')), todayLocal: () => '2026-11-16' }));
import * as api from './lib/api.js';

const quest = { workPackageId: 1234, subject: '前端登入頁改版', activityId: 3, activityName: 'Development' };
const entry = { id: 7, workPackageId: 1234, workPackageSubject: '前端登入頁改版', date: '2026-11-16', hours: 2, activityId: 3, activityName: 'Development', comment: '' };

beforeEach(() => {
  vi.clearAllMocks();
  api.getMe.mockResolvedValue({ id: 1, name: 'Ted' });
  api.getConfig.mockResolvedValue({ dailyTargetHours: 8, openProjectUrl: null });
  api.listQuests.mockResolvedValue([quest]);
  api.listEntries.mockResolvedValue([]);
  api.listActivities.mockResolvedValue([{ id: 3, name: 'Development', default: false }]);
  api.getHall.mockResolvedValue({ date: '2026-11-16', members: [] });
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
test('timesheet link opens the OpenProject report for the selected week', async () => {
  api.getConfig.mockResolvedValue({ dailyTargetHours: 8, openProjectUrl: 'http://op.example:8080' });
  render(App);
  const link = await screen.findByRole('link', { name: '匯出工時表（11/16–11/22）↗' });
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  const url = new URL(link.getAttribute('href'));
  expect(url.origin + url.pathname).toBe('http://op.example:8080/cost_reports');
  expect(url.searchParams.getAll('values[spent_on][]')).toEqual(['2026-11-16', '2026-11-22']);
  await userEvent.click(screen.getByRole('button', { name: '前一天' }));
  const previous = await screen.findByRole('link', { name: '匯出工時表（11/9–11/15）↗' });
  expect(new URL(previous.getAttribute('href')).searchParams.getAll('values[spent_on][]')).toEqual(['2026-11-09', '2026-11-15']);
});
test('no timesheet link without an OpenProject URL', async () => {
  render(App);
  await screen.findByText('前端登入頁改版');
  expect(screen.queryByRole('link', { name: /匯出工時表/ })).toBeNull();
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
test('one failing startup request does not discard the others', async () => {
  api.listQuests.mockRejectedValue(new api.ApiError(502, 'network', '無法連線到 OpenProject'));
  render(App);
  expect(await screen.findByText('冒險者：Ted')).toBeTruthy();
  expect(await screen.findByText(/無法連線到 OpenProject/)).toBeTruthy();
});
test('the quest tab is selected on load and the hall is not read yet', async () => {
  render(App);
  expect(await screen.findByText('前端登入頁改版')).toBeTruthy();
  expect(screen.getByRole('tab', { name: '任務欄' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tab', { name: '公會大廳' }).getAttribute('aria-selected')).toBe('false');
  expect(api.getHall).not.toHaveBeenCalled();
});
test('switching to the hall tab reads the hall and hides the quest board', async () => {
  render(App);
  await screen.findByText('前端登入頁改版');
  await userEvent.click(screen.getByRole('tab', { name: '公會大廳' }));
  expect(api.getHall).toHaveBeenCalledWith('2026-11-16');
  expect(screen.getByRole('tab', { name: '公會大廳' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByText('前端登入頁改版')).toBeNull();
  expect(screen.getByText('冒險者：Ted')).toBeTruthy();
});
test('both tabs share the selected day', async () => {
  render(App);
  await screen.findByText('前端登入頁改版');
  await userEvent.click(screen.getByRole('tab', { name: '公會大廳' }));
  await userEvent.click(screen.getByRole('button', { name: '前一天' }));
  expect(api.getHall).toHaveBeenLastCalledWith('2026-11-15');
  await userEvent.click(screen.getByRole('tab', { name: '任務欄' }));
  expect(await screen.findByText('前端登入頁改版')).toBeTruthy();
  expect(api.listEntries).toHaveBeenLastCalledWith('2026-11-15');
});
test('a banner from one tab does not follow you to the other tab', async () => {
  api.listQuests.mockRejectedValue(new api.ApiError(502, 'network', '無法連線到 OpenProject'));
  render(App);
  expect(await screen.findByRole('alert')).toBeTruthy();
  await userEvent.click(screen.getByRole('tab', { name: '公會大廳' }));
  expect(screen.queryByRole('alert')).toBeNull();
});
