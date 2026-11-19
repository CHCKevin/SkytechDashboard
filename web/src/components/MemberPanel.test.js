import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import MemberPanel from './MemberPanel.svelte';

const worker = {
  userId: 12, name: '公會 - 法師 怡君', status: 'working', totalHours: 5,
  entries: [
    { id: 4, workPackageId: 1990, workPackageSubject: 'Code review', hours: 3, activityName: 'Development', comment: '審查登入頁改版' },
    { id: 5, workPackageId: 2310, workPackageSubject: '匯出報表效能問題', hours: 2, activityName: null, comment: '' },
  ],
};
const idler = { userId: 13, name: '弓手 志豪', status: 'idle', totalHours: 0, entries: [] };
const handlers = () => ({ onselect: vi.fn(), onback: vi.fn(), onrecruit: vi.fn(), onremove: vi.fn(), onrefresh: vi.fn() });
const show = (props = {}) => {
  const fns = handlers();
  render(MemberPanel, { members: [worker, idler], date: '2026-11-16', ...fns, ...props });
  return fns;
};

test('the roster lists every member with status and total hours', async () => {
  const fns = show();
  expect(screen.getByRole('heading', { name: /公會成員 2 \/ 16/ })).toBeTruthy();
  const row = screen.getByRole('button', { name: /法師 怡君/ });
  expect(row.textContent).toMatch(/工作中/);
  expect(row.textContent).toMatch(/5h/);
  expect(row.textContent).not.toMatch(/公會 -/);
  expect(screen.getByRole('button', { name: /弓手 志豪/ }).textContent).toMatch(/發呆.*0h/s);
  await userEvent.click(row);
  expect(fns.onselect).toHaveBeenCalledWith(12);
});
test('an empty hall invites recruiting', () => {
  show({ members: [] });
  expect(screen.getByText('大廳還沒有成員，先招募幾位吧')).toBeTruthy();
  expect(screen.getByRole('heading', { name: /公會成員 0 \/ 16/ })).toBeTruthy();
});
test('loading shows a loading note instead of the empty hint', () => {
  show({ members: [], loading: true });
  expect(screen.getByText('讀取中…')).toBeTruthy();
  expect(screen.queryByText('大廳還沒有成員，先招募幾位吧')).toBeNull();
  expect(screen.getByRole('button', { name: '＋ 招募成員' }).disabled).toBe(true);
});
test('a load error is announced and blocks recruiting', () => {
  show({ members: [], loadError: '連線 OpenProject 逾時' });
  expect(screen.getByRole('alert').textContent).toBe('連線 OpenProject 逾時');
  expect(screen.queryByText('大廳還沒有成員，先招募幾位吧')).toBeNull();
  expect(screen.getByRole('button', { name: '＋ 招募成員' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: '重新整理' }).disabled).toBe(false);
});
test('a failed refresh keeps the roster and says so', () => {
  show({ refreshError: '無法連線到本機伺服器', updatedAt: '10:05' });
  expect(screen.getByText('更新失敗：無法連線到本機伺服器')).toBeTruthy();
  expect(screen.getByText('上次更新 10:05')).toBeTruthy();
  expect(screen.getByRole('button', { name: /法師 怡君/ })).toBeTruthy();
});
test('a full hall disables recruiting', () => {
  const members = Array.from({ length: 16 }, (_, index) => ({ ...idler, userId: index + 1, name: `成員${index + 1}` }));
  show({ members });
  expect(screen.getByRole('button', { name: '＋ 招募成員' }).disabled).toBe(true);
  expect(screen.getByText('大廳已滿')).toBeTruthy();
});
test('refresh and recruit buttons call their handlers', async () => {
  const fns = show();
  await userEvent.click(screen.getByRole('button', { name: '重新整理' }));
  await userEvent.click(screen.getByRole('button', { name: '＋ 招募成員' }));
  expect(fns.onrefresh).toHaveBeenCalledTimes(1);
  expect(fns.onrecruit).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('大廳已滿')).toBeNull();
});
test('a selected member shows their entries read-only', () => {
  show({ selected: worker });
  expect(screen.getByRole('heading', { name: /法師 怡君/ })).toBeTruthy();
  expect(screen.getByText('公會 - 法師 怡君')).toBeTruthy();
  expect(screen.getByText('工作中 · 2026-11-16（一）')).toBeTruthy();
  expect(screen.getByText('#1990 Code review')).toBeTruthy();
  expect(screen.getByText('Development · 審查登入頁改版')).toBeTruthy();
  expect(screen.getByText('#2310 匯出報表效能問題')).toBeTruthy();
  expect(screen.getByText('3h')).toBeTruthy();
  expect(screen.getByText('合計').parentElement.textContent).toBe('合計5h');
  expect(screen.queryByRole('button', { name: /改|刪/ })).toBeNull();
  expect(screen.queryByText('這天沒有記錄工時')).toBeNull();
});
test('a selected member without entries says so', () => {
  show({ selected: idler });
  expect(screen.getByText('這天沒有記錄工時')).toBeTruthy();
  expect(screen.getByText('發呆 · 2026-11-16（一）')).toBeTruthy();
});
test('back and remove call their handlers', async () => {
  const fns = show({ selected: worker });
  await userEvent.click(screen.getByRole('button', { name: '返回' }));
  await userEvent.click(screen.getByRole('button', { name: '請離大廳' }));
  expect(fns.onback).toHaveBeenCalledTimes(1);
  expect(fns.onremove).toHaveBeenCalledWith(worker);
});
test('the refresh failure note also shows on the member view', () => {
  show({ selected: worker, refreshError: '逾時', updatedAt: '10:05' });
  expect(screen.getByText('更新失敗：逾時')).toBeTruthy();
});
test('the panel uses no inline styles (CSP)', () => {
  const { container } = render(MemberPanel, { members: [worker, idler], date: '2026-11-16', ...handlers() });
  expect(container.innerHTML).not.toMatch(/style=/);
});
test('multi-line comments keep their line breaks', () => {
  const multi = { ...worker, entries: [{ ...worker.entries[0], comment: '1. 日月光 E84 研究\r\n2. 三安 Recipe 分析' }] };
  const { container } = render(MemberPanel, { members: [multi], date: '2026-11-16', ...handlers(), selected: multi });
  expect(container.querySelector('.entry-meta').textContent).toBe('Development · 1. 日月光 E84 研究\n2. 三安 Recipe 分析');
});
