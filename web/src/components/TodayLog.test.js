import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TodayLog from './TodayLog.svelte';

const entries = [
  { id: 1, workPackageId: 1234, workPackageSubject: '登入頁', date: '2026-11-16', hours: 2.5, activityId: 3, activityName: 'Development', comment: '調整驗證' },
  { id: 2, workPackageId: null, workPackageSubject: '週會', date: '2026-11-16', hours: 1, activityId: null, activityName: null, comment: '' },
];

test('lists entries with total and progress', () => {
  const { container } = render(TodayLog, { props: { entries, target: 8, onedit: vi.fn(), ondelete: vi.fn() } });
  expect(screen.getByText('#1234 登入頁')).toBeTruthy();
  expect(screen.getByText('Development · 調整驗證')).toBeTruthy();
  expect(screen.getByText('3.5 / 8h')).toBeTruthy();
  const bar = screen.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBe('3.5');
  expect(container.querySelector('.bar-fill').style.width).toBe('44%');
  expect(container.querySelector('[style]')).toBe(container.querySelector('.bar-fill'));
});
test('edit is only offered for work package entries; delete for all', async () => {
  const onedit = vi.fn();
  const ondelete = vi.fn();
  render(TodayLog, { props: { entries, target: 8, onedit, ondelete } });
  const edits = screen.getAllByRole('button', { name: /改/ });
  expect(edits).toHaveLength(1);
  await userEvent.click(edits[0]);
  expect(onedit).toHaveBeenCalledWith(entries[0]);
  await userEvent.click(screen.getAllByRole('button', { name: /刪/ })[1]);
  expect(ondelete).toHaveBeenCalledWith(entries[1]);
});
test('empty day shows a hint and zero total', () => {
  render(TodayLog, { props: { entries: [], target: 8, onedit: vi.fn(), ondelete: vi.fn() } });
  expect(screen.getByText('這天還沒有接任務')).toBeTruthy();
  expect(screen.getByText('0 / 8h')).toBeTruthy();
});
test('loading shows a notice instead of the empty hint', () => {
  render(TodayLog, { props: { entries: [], target: 8, loading: true, onedit: vi.fn(), ondelete: vi.fn() } });
  expect(screen.getByText('讀取中…')).toBeTruthy();
  expect(screen.queryByText('這天還沒有接任務')).toBeNull();
});
test('a load error is shown as an alert instead of the empty hint', () => {
  render(TodayLog, { props: { entries: [], target: 8, loadError: '無法連線', onedit: vi.fn(), ondelete: vi.fn() } });
  expect(screen.getByRole('alert').textContent).toBe('無法連線');
  expect(screen.queryByText('這天還沒有接任務')).toBeNull();
});
