import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PinDialog from './PinDialog.svelte';

vi.mock('../lib/api.js', () => ({ searchWorkPackages: vi.fn(), listActivities: vi.fn() }));
import { listActivities, searchWorkPackages } from '../lib/api.js';

beforeEach(() => {
  vi.mocked(searchWorkPackages).mockResolvedValue([{ id: 2051, subject: '週會與進度回報', project: '示例' }]);
  vi.mocked(listActivities).mockResolvedValue([{ id: 1, name: 'Management', default: true }]);
});

test('search, choose an activity, and pin', async () => {
  const onsubmit = vi.fn(async () => {});
  render(PinDialog, { onsubmit, oncancel: vi.fn(), searchDelay: 0 });
  await userEvent.type(screen.getByRole('searchbox'), '2051');
  await userEvent.click(await screen.findByRole('button', { name: /#2051/ }));
  expect(onsubmit).not.toHaveBeenCalled();
  expect(screen.getByText('#2051 週會與進度回報')).toBeTruthy();
  const select = await screen.findByRole('combobox', { name: '預設活動' });
  await userEvent.selectOptions(select, 'Management');
  await userEvent.click(screen.getByRole('button', { name: '釘上布告欄' }));
  expect(onsubmit).toHaveBeenCalledTimes(1);
  expect(onsubmit).toHaveBeenCalledWith({ workPackageId: 2051, activityId: 1 });
});
test('pressing Enter in the search box before choosing does not submit', async () => {
  const onsubmit = vi.fn(async () => {});
  const unhandled = vi.fn();
  window.addEventListener('error', unhandled);
  render(PinDialog, { onsubmit, oncancel: vi.fn(), searchDelay: 0 });
  await userEvent.type(screen.getByRole('searchbox'), '2051{Enter}');
  await screen.findByRole('button', { name: /#2051/ });
  expect(onsubmit).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
  window.removeEventListener('error', unhandled);
  expect(unhandled).not.toHaveBeenCalled();
});
test('pin button is disabled until a work package is chosen; errors are shown', async () => {
  const onsubmit = vi.fn(async () => { throw new Error('找不到該項目'); });
  render(PinDialog, { onsubmit, oncancel: vi.fn(), searchDelay: 0 });
  expect(screen.getByRole('button', { name: '釘上布告欄' }).disabled).toBe(true);
  await userEvent.type(screen.getByRole('searchbox'), '2051');
  await userEvent.click(await screen.findByRole('button', { name: /#2051/ }));
  await screen.findByRole('combobox', { name: '預設活動' });
  await userEvent.click(screen.getByRole('button', { name: '釘上布告欄' }));
  expect((await screen.findByRole('alert')).textContent).toBe('找不到該項目');
});
