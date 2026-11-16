import { expect, test } from 'vitest';
import { SEAT_IDS, assignSeats } from './seats.js';

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
