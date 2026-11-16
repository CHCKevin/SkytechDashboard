import { expect, test } from 'vitest';
import { shortName } from './names.js';

test('shortName keeps the part after the last department separator', () => {
  expect(shortName('研發一處 -  王小明 Ming Wang')).toBe('王小明 Ming Wang');
  expect(shortName('集團 - 研發一處 - 王小明')).toBe('王小明');
});
test('shortName leaves names without a separator alone', () => {
  expect(shortName('劍士 小華')).toBe('劍士 小華');
  expect(shortName('Jean-Luc')).toBe('Jean-Luc');
  expect(shortName('  阿明 ')).toBe('阿明');
});
test('shortName copes with empty input', () => {
  expect(shortName('')).toBe('');
  expect(shortName(undefined)).toBe('');
});
