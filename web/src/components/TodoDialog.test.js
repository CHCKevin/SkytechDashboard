import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TodoDialog from './TodoDialog.svelte';

vi.mock('../lib/api.js', () => ({ searchWorkPackages: vi.fn() }));
import { searchWorkPackages } from '../lib/api.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchWorkPackages).mockResolvedValue([{ id: 2051, subject: '週會與進度回報', project: '示例' }]);
});

const search = () => screen.getByRole('searchbox', { name: '用編號查詢 work package 帶入標題' });

test('choosing a work package fills the title, which can still be edited', async () => {
  const onsubmit = vi.fn(async () => {});
  render(TodoDialog, { onsubmit, oncancel: vi.fn(), searchDelay: 0 });
  await userEvent.type(search(), '2051');
  await userEvent.click(await screen.findByRole('button', { name: /#2051/ }));
  const title = screen.getByRole('textbox', { name: '標題' });
  expect(title.value).toBe('#2051 週會與進度回報');
  expect(search().value).toBe('');
  await userEvent.type(title, ' 準備簡報');
  await userEvent.click(screen.getByRole('button', { name: '釘上布告欄' }));
  expect(searchWorkPackages).toHaveBeenCalledWith('2051');
  expect(onsubmit).toHaveBeenCalledWith({ title: '#2051 週會與進度回報 準備簡報', note: '', dueDate: null });
});

test('pressing Enter in the search box does not submit the form', async () => {
  const onsubmit = vi.fn(async () => {});
  render(TodoDialog, { onsubmit, oncancel: vi.fn(), initial: { title: '已有標題', note: '', dueDate: null }, searchDelay: 0 });
  await userEvent.type(search(), '2051{Enter}');
  await screen.findByRole('button', { name: /#2051/ });
  expect(onsubmit).not.toHaveBeenCalled();
});

test('a result can be chosen with the keyboard', async () => {
  render(TodoDialog, { onsubmit: vi.fn(), oncancel: vi.fn(), searchDelay: 0 });
  await userEvent.type(search(), '2051');
  (await screen.findByRole('button', { name: /#2051/ })).focus();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByRole('textbox', { name: '標題' }).value).toBe('#2051 週會與進度回報');
});

test('long subjects are cut to the 100-character title limit', async () => {
  vi.mocked(searchWorkPackages).mockResolvedValue([{ id: 7, subject: '長'.repeat(120), project: '示例' }]);
  render(TodoDialog, { onsubmit: vi.fn(), oncancel: vi.fn(), searchDelay: 0 });
  await userEvent.type(search(), '7');
  await userEvent.click(await screen.findByRole('button', { name: /#7/ }));
  expect(screen.getByRole('textbox', { name: '標題' }).value).toHaveLength(100);
});
