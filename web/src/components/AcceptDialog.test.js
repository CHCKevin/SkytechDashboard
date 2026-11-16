import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import AcceptDialog from './AcceptDialog.svelte';

vi.mock('../lib/api.js', () => ({ listActivities: vi.fn() }));
import { listActivities } from '../lib/api.js';

const activities = [{ id: 1, name: 'Management', default: true }, { id: 3, name: 'Development', default: false }];
const base = (overrides = {}) => ({
  mode: 'create',
  workPackage: { id: 1234, subject: '前端登入頁改版' },
  initial: { date: '2026-11-16', hours: null, activityId: 3, activityName: 'Development', comment: '' },
  onsubmit: vi.fn(async () => {}),
  oncancel: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.mocked(listActivities).mockReset();
  vi.mocked(listActivities).mockResolvedValue(activities);
});

test('shows the work package and preselects the quest activity once loaded', async () => {
  render(AcceptDialog, base());
  expect(screen.getByRole('dialog', { name: /接下任務：#1234 前端登入頁改版/ })).toBeTruthy();
  const select = await screen.findByRole('combobox', { name: '活動' });
  expect(select.selectedOptions[0].textContent).toBe('Development');
  expect(listActivities).toHaveBeenCalledWith(1234);
});
test('quick hour chip fills the hours and submit sends the values', async () => {
  const props = base();
  render(AcceptDialog, props);
  await screen.findByRole('combobox', { name: '活動' });
  await userEvent.click(screen.getByRole('button', { name: '2' }));
  expect(screen.getByRole('textbox', { name: '時數' }).value).toBe('2');
  await userEvent.type(screen.getByRole('textbox', { name: '備註' }), '調整驗證');
  await userEvent.click(screen.getByRole('button', { name: '接下任務！' }));
  expect(props.onsubmit).toHaveBeenCalledWith({ date: '2026-11-16', hours: 2, activityId: 3, comment: '調整驗證' });
});
test('invalid hours are reported and nothing is submitted', async () => {
  const props = base();
  render(AcceptDialog, props);
  await userEvent.type(screen.getByRole('textbox', { name: '時數' }), '1.234');
  await userEvent.click(screen.getByRole('button', { name: '接下任務！' }));
  expect(screen.getByRole('alert').textContent).toMatch(/時數/);
  expect(props.onsubmit).not.toHaveBeenCalled();
});
test('submit errors keep the inputs and show the message; button disabled while pending', async () => {
  let reject;
  const props = base({ onsubmit: vi.fn(() => new Promise((_, r) => { reject = r; })) });
  render(AcceptDialog, props);
  await userEvent.type(screen.getByRole('textbox', { name: '時數' }), '1.5');
  await userEvent.click(screen.getByRole('button', { name: '接下任務！' }));
  const pending = screen.getByRole('button', { name: '送出中…' });
  expect(pending.disabled).toBe(true);
  reject(new Error('Hours can\'t be blank.'));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('Hours can\'t be blank.');
  expect(screen.getByRole('textbox', { name: '時數' }).value).toBe('1.5');
});
test('edit mode prefills values; unchanged form closes without a request', async () => {
  const props = base({ mode: 'edit', initial: { date: '2026-11-15', hours: 0.33, activityId: null, activityName: null, comment: '舊備註' } });
  render(AcceptDialog, props);
  expect(screen.getByRole('dialog', { name: /修改任務紀錄/ })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: '時數' }).value).toBe('0.33');
  expect(screen.getByRole('textbox', { name: '備註' }).value).toBe('舊備註');
  await screen.findByRole('combobox', { name: '活動' });
  await userEvent.click(screen.getByRole('button', { name: '更新紀錄' }));
  expect(props.onsubmit).not.toHaveBeenCalled();
  expect(props.oncancel).toHaveBeenCalled();
});
test('edit mode sends only the fields that changed', async () => {
  // 0.33 是 PT20M 的顯示值；沒改時數就不能寫回，否則 20 分鐘會變成 19.8 分鐘。
  const props = base({ mode: 'edit', initial: { date: '2026-11-15', hours: 0.33, activityId: 3, activityName: 'Development', comment: '舊備註' } });
  render(AcceptDialog, props);
  await screen.findByRole('combobox', { name: '活動' });
  await userEvent.type(screen.getByRole('textbox', { name: '備註' }), '，補充');
  await userEvent.click(screen.getByRole('button', { name: '更新紀錄' }));
  expect(props.onsubmit).toHaveBeenCalledWith({ comment: '舊備註，補充' });
});
test('edit keeps the original activity when the activity list fails to load', async () => {
  vi.mocked(listActivities).mockRejectedValueOnce(new Error('OpenProject 連不上'));
  const props = base({ mode: 'edit', initial: { date: '2026-11-15', hours: 1, activityId: 3, activityName: 'Development', comment: '' } });
  render(AcceptDialog, props);
  expect(await screen.findByText(/活動類型讀取失敗：OpenProject 連不上/)).toBeTruthy();
  expect(screen.getByText('Development（保留原設定）')).toBeTruthy();
  await userEvent.clear(screen.getByRole('textbox', { name: '時數' }));
  await userEvent.type(screen.getByRole('textbox', { name: '時數' }), '2');
  await userEvent.click(screen.getByRole('button', { name: '更新紀錄' }));
  expect(props.onsubmit).toHaveBeenCalledWith({ hours: 2 });
});
test('an activity missing from the list is still shown and kept', async () => {
  vi.mocked(listActivities).mockResolvedValueOnce([{ id: 1, name: 'Management', default: true }]);
  const props = base({ mode: 'edit', initial: { date: '2026-11-15', hours: 1, activityId: 9, activityName: 'Legacy', comment: '' } });
  render(AcceptDialog, props);
  const select = await screen.findByRole('combobox', { name: '活動' });
  expect(select.selectedOptions[0].textContent).toBe('Legacy');
});
test('create still submits with the quest activity when the list fails to load', async () => {
  vi.mocked(listActivities).mockRejectedValueOnce(new Error('OpenProject 連不上'));
  const props = base({ initial: { date: '2026-11-16', hours: 1, activityId: 3, activityName: 'Development', comment: '' } });
  render(AcceptDialog, props);
  expect(await screen.findByText(/活動類型讀取失敗：OpenProject 連不上/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: '接下任務！' }));
  expect(props.onsubmit).toHaveBeenCalledWith({ date: '2026-11-16', hours: 1, activityId: 3, comment: '' });
});
test('cancel calls oncancel', async () => {
  const props = base();
  render(AcceptDialog, props);
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(props.oncancel).toHaveBeenCalled();
});
