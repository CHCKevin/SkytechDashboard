import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar.svelte';
import QuestBoard from './QuestBoard.svelte';
import WorkPackageSearch from './WorkPackageSearch.svelte';

vi.mock('../lib/api.js', () => ({ searchWorkPackages: vi.fn() }));
import { searchWorkPackages } from '../lib/api.js';

// 用大括號避免回傳 mock 函式：vitest 會把 beforeEach 回傳的函式當成清理 hook 呼叫。
beforeEach(() => {
  vi.mocked(searchWorkPackages).mockReset();
});
afterEach(() => vi.useRealTimers());

test('TopBar shows the day and moves by one day', async () => {
  const onchange = vi.fn();
  render(TopBar, { date: '2026-11-16', me: { name: 'Ted' }, onchange });
  expect(screen.getByText('2026-11-16（一）')).toBeTruthy();
  expect(screen.getByText('冒險者：Ted')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: '前一天' }));
  await userEvent.click(screen.getByRole('button', { name: '後一天' }));
  expect(onchange.mock.calls).toEqual([['2026-11-15'], ['2026-11-17']]);
});
test('QuestBoard accepts, unpins and pins quests', async () => {
  const handlers = { onaccept: vi.fn(), onunpin: vi.fn(), onpin: vi.fn() };
  const quest = { workPackageId: 1234, subject: '前端登入頁改版', activityId: 3, activityName: 'Development' };
  render(QuestBoard, { quests: [quest, { workPackageId: 5, subject: 'X', activityId: null, activityName: null }], ...handlers });
  expect(screen.getByText('預設：Development')).toBeTruthy();
  expect(screen.getByText('預設：不指定')).toBeTruthy();
  await userEvent.click(screen.getByText('前端登入頁改版'));
  expect(handlers.onaccept).toHaveBeenCalledWith(quest);
  await userEvent.click(screen.getByRole('button', { name: '撕下 #1234' }));
  expect(handlers.onunpin).toHaveBeenCalledWith(quest);
  await userEvent.click(screen.getByRole('button', { name: /釘上/ }));
  expect(handlers.onpin).toHaveBeenCalled();
});
test('WorkPackageSearch debounces, lists results, and selects one', async () => {
  vi.mocked(searchWorkPackages).mockResolvedValue([{ id: 2310, subject: '匯出報表效能問題', project: '維運' }]);
  const onselect = vi.fn();
  // 防抖時間要長於連續按鍵間隔，才能驗證「只搜尋一次」。
  render(WorkPackageSearch, { onselect, delay: 50 });
  const input = screen.getByRole('searchbox');
  await userEvent.type(input, '#231');
  expect(await screen.findByText(/匯出報表效能問題/)).toBeTruthy();
  expect(searchWorkPackages).toHaveBeenCalledTimes(1);
  expect(searchWorkPackages).toHaveBeenCalledWith('#231');
  await userEvent.click(screen.getByRole('button', { name: /#2310/ }));
  expect(onselect).toHaveBeenCalledWith({ id: 2310, subject: '匯出報表效能問題', project: '維運' });
  expect(input.value).toBe('');
});
test('WorkPackageSearch shows empty and error states', async () => {
  vi.mocked(searchWorkPackages).mockResolvedValue([]);
  render(WorkPackageSearch, { onselect: vi.fn(), delay: 0 });
  await userEvent.type(screen.getByRole('searchbox'), 'z');
  expect(await screen.findByText('找不到符合的 work package')).toBeTruthy();
  vi.mocked(searchWorkPackages).mockRejectedValue(new Error('OpenProject 連不上'));
  await userEvent.type(screen.getByRole('searchbox'), 'z');
  expect(await screen.findByText('OpenProject 連不上')).toBeTruthy();
});
