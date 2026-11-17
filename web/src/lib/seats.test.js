import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { HALL_CAPACITY, SCENE_SIZE, SEAT_GROUPS, SEAT_IDS, SEAT_SPOTS, assignSeats, seatsCss } from './seats.js';

let nextId = 1;
const make = (status, count = 1) => Array.from({ length: count }, () => ({ userId: nextId++, status }));
const seatOf = (seats, member) => Object.keys(seats).find(seat => seats[seat] === member);

test('there are 16 seats: 5 at the bar, 7 at desks, 4 on sofas', () => {
  expect(SEAT_IDS).toHaveLength(16);
  expect(SEAT_IDS.filter(seat => seat.startsWith('bar-'))).toHaveLength(5);
  expect(SEAT_IDS.filter(seat => seat.startsWith('desk-'))).toHaveLength(7);
  expect(SEAT_IDS.filter(seat => seat.startsWith('sofa-'))).toHaveLength(4);
});
test('no members means no seats taken', () => {
  expect(assignSeats([])).toEqual({});
});
test('each status goes to its preferred zone', () => {
  const [rest] = make('resting');
  const [work1, work2] = make('working', 2);
  const [idle] = make('idle');
  const seats = assignSeats([idle, work1, rest, work2]);
  expect(seatOf(seats, rest)).toBe('sofa-1');
  expect(seatOf(seats, work1)).toBe('desk-1');
  expect(seatOf(seats, work2)).toBe('desk-2');
  expect(seatOf(seats, idle)).toBe('bar-1');
});
test('working members overflow from desks to the bar', () => {
  const workers = make('working', 8);
  const seats = assignSeats(workers);
  expect(workers.map(member => seatOf(seats, member))).toEqual(['desk-1', 'desk-2', 'desk-3', 'desk-4', 'desk-5', 'desk-6', 'desk-7', 'bar-1']);
});
test('idle members overflow from the bar to sofas', () => {
  const idlers = make('idle', 6);
  const seats = assignSeats(idlers);
  expect(idlers.map(member => seatOf(seats, member))).toEqual(['bar-1', 'bar-2', 'bar-3', 'bar-4', 'bar-5', 'sofa-1']);
});
test('resting members overflow from sofas to the bar', () => {
  const resters = make('resting', 5);
  const seats = assignSeats(resters);
  expect(resters.map(member => seatOf(seats, member))).toEqual(['sofa-1', 'sofa-2', 'sofa-3', 'sofa-4', 'bar-1']);
});
test('resting members are seated before idle ones, whatever the input order', () => {
  const idlers = make('idle', 6);
  const resters = make('resting', 4);
  const seats = assignSeats([...idlers, ...resters]);
  expect(resters.map(member => seatOf(seats, member))).toEqual(['sofa-1', 'sofa-2', 'sofa-3', 'sofa-4']);
  expect(seatOf(seats, idlers[5])).toBe('desk-1');
});
test('a full hall seats everyone in a different seat', () => {
  const members = [...make('working', 9), ...make('idle', 4), ...make('resting', 3)];
  const seats = assignSeats(members);
  expect(Object.keys(seats).sort()).toEqual([...SEAT_IDS].sort());
  expect(new Set(Object.values(seats)).size).toBe(16);
});
test('the same input always gives the same seats', () => {
  const members = [...make('working', 3), ...make('idle', 2), ...make('resting', 2)];
  expect(assignSeats(members)).toEqual(assignSeats(members.map(member => ({ ...member }))));
});
test('members beyond the 16 seats are left out', () => {
  const members = make('working', 18);
  const seats = assignSeats(members);
  expect(Object.keys(seats)).toHaveLength(16);
  expect(seatOf(seats, members[17])).toBeUndefined();
});
test('the hall capacity equals the number of seats', () => {
  expect(HALL_CAPACITY).toBe(16);
  expect(HALL_CAPACITY).toBe(SEAT_IDS.length);
});
test('every seat has a spot inside the scene and belongs to exactly one row group', () => {
  const grouped = SEAT_GROUPS.flatMap(group => group.seats);
  expect([...grouped].sort()).toEqual([...SEAT_IDS].sort());
  expect(Object.keys(SEAT_SPOTS).sort()).toEqual([...SEAT_IDS].sort());
  for (const [x, y] of Object.values(SEAT_SPOTS)) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + 16).toBeLessThanOrEqual(SCENE_SIZE[0]);
    expect(y + 24).toBeLessThanOrEqual(SCENE_SIZE[1]);
  }
});
test('characters never overlap each other', () => {
  const spots = Object.values(SEAT_SPOTS);
  // 角色本體在 16×24 圖的第 1–14 欄、第 1–21 列。
  const box = ([x, y]) => [x + 1, y + 1, x + 15, y + 22];
  spots.forEach((a, i) => spots.slice(i + 1).forEach(b => {
    const [ax1, ay1, ax2, ay2] = box(a);
    const [bx1, by1, bx2, by2] = box(b);
    expect(ax1 < bx2 && bx1 < ax2 && ay1 < by2 && by1 < ay2).toBe(false);
  }));
});
test('styles/seats.css is generated from the seat spots', () => {
  // git 在 Windows 上可能把換行轉成 CRLF，比對前統一成 LF。
  // Vitest 不處理 CSS 的 ?raw，jsdom 下 import.meta.url 也不是 file:，所以從專案根目錄讀檔（npm test 在根目錄執行）。
  const file = readFileSync('web/src/styles/seats.css', 'utf8');
  expect(file.replace(/\r\n/g, '\n')).toBe(seatsCss());
});
