import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { activityUrl, entryMeta } from './entries.js';

test('joins activity and comment', () => {
  expect(entryMeta({ activityName: 'Development', comment: '調整表單' })).toBe('Development · 調整表單');
  expect(entryMeta({ activityName: null, comment: '調整表單' })).toBe('調整表單');
  expect(entryMeta({ activityName: 'Development', comment: '' })).toBe('Development');
  expect(entryMeta({ activityName: null, comment: '' })).toBe('');
});
test('keeps line breaks in the comment and normalizes CRLF', () => {
  expect(entryMeta({ activityName: null, comment: '1. 研究\r\n2. 分析' })).toBe('1. 研究\n2. 分析');
});
test('trims surrounding blank lines and whitespace-only comments', () => {
  expect(entryMeta({ activityName: 'Daily', comment: '\n  會議\n\n' })).toBe('Daily · 會議');
  expect(entryMeta({ activityName: 'Daily', comment: ' \n ' })).toBe('Daily');
});
test('entry notes keep their line breaks on screen', () => {
  const css = readFileSync('web/src/styles/pixel.css', 'utf8');
  expect(css).toMatch(/\.entry-meta \{[^}]*white-space: pre-line;/);
});
test('links a work package to its OpenProject activity page', () => {
  expect(activityUrl('http://op.example:8080', 1234)).toBe('http://op.example:8080/work_packages/1234/activity');
  expect(activityUrl('https://op.example/', 7)).toBe('https://op.example/work_packages/7/activity');
});
