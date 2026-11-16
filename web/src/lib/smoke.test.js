import { expect, test } from 'vitest';

test('vitest runs in Asia/Taipei', () => {
  expect(new Date(Date.UTC(2026, 10, 15, 23, 30)).getDate()).toBe(16);
});
