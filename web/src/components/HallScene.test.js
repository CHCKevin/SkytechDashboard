import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import HallScene from './HallScene.svelte';

const members = [
  { userId: 11, name: '公會 - 劍士 小華', status: 'resting' },
  { userId: 12, name: '法師 怡君', status: 'working' },
  { userId: 13, name: '弓手 志豪', status: 'idle' },
];
const seatOf = button => button.closest('[data-seat]').getAttribute('data-seat');

test('the scene always has 16 seats, each with a unique id', () => {
  const { container } = render(HallScene, { members: [], onselect: vi.fn() });
  const ids = [...container.querySelectorAll('[data-seat]')].map(node => node.getAttribute('data-seat'));
  expect(ids).toHaveLength(16);
  expect(new Set(ids).size).toBe(16);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.getByRole('region', { name: '公會大廳' })).toBeTruthy();
});
test('members sit in the zone their status prefers and are named with their status', () => {
  render(HallScene, { members, onselect: vi.fn() });
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(seatOf(screen.getByRole('button', { name: '公會 - 劍士 小華：休息' }))).toBe('sofa-1');
  expect(seatOf(screen.getByRole('button', { name: '法師 怡君：工作中' }))).toBe('desk-1');
  expect(seatOf(screen.getByRole('button', { name: '弓手 志豪：發呆' }))).toBe('bar-1');
});
test('the name tag shows the short name', () => {
  render(HallScene, { members, onselect: vi.fn() });
  const button = screen.getByRole('button', { name: /小華/ });
  expect(button.querySelector('.member-name').textContent).toBe('劍士 小華');
});
test('each member has a sprite and a status icon', () => {
  render(HallScene, { members, onselect: vi.fn() });
  for (const button of screen.getAllByRole('button')) {
    expect(button.querySelectorAll('svg')).toHaveLength(2);
    expect(button.querySelector('svg.sprite rect')).toBeTruthy();
    expect(button.querySelector('svg.status-icon rect')).toBeTruthy();
  }
});
test('clicking a member selects them', async () => {
  const onselect = vi.fn();
  render(HallScene, { members, onselect });
  await userEvent.click(screen.getByRole('button', { name: /怡君/ }));
  expect(onselect).toHaveBeenCalledWith(12);
});
test('the selected member is marked as pressed', () => {
  render(HallScene, { members, selectedId: 13, onselect: vi.fn() });
  expect(screen.getByRole('button', { name: /志豪/ }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: /怡君/ }).getAttribute('aria-pressed')).toBe('false');
});
test('a full hall seats all 16 members', () => {
  const full = Array.from({ length: 16 }, (_, index) => ({ userId: index + 1, name: `成員${index + 1}`, status: ['working', 'idle', 'resting'][index % 3] }));
  const { container } = render(HallScene, { members: full, onselect: vi.fn() });
  expect(screen.getAllByRole('button')).toHaveLength(16);
  expect(container.querySelectorAll('[data-seat]:empty, [data-seat] > button').length).toBe(16);
});
test('the scene uses no inline styles (CSP)', () => {
  const { container } = render(HallScene, { members, selectedId: 12, onselect: vi.fn() });
  expect(container.innerHTML).not.toMatch(/style=/);
});
