import test from 'node:test';
import assert from 'node:assert/strict';
import { positionFor, colorForStatus } from '../shared/layout.mjs';

test('position depends only on ID and namespace, not array ordering', () => {
  const before = positionFor('work-package', '42');
  positionFor('work-package', '99');
  assert.deepEqual(positionFor('work-package', '42'), before);
  assert.notDeepEqual(positionFor('project', '42'), before);
  assert.notDeepEqual(positionFor('work-package', '43'), before);
  assert.ok(before.every(Number.isFinite));
  assert.ok(Math.hypot(...before) <= 100);
});
test('valid source colors win, malformed colors fall back, unknown is neutral', () => {
  assert.equal(colorForStatus('1', '#12AbEF'), '#12abef');
  assert.equal(colorForStatus(null), '#94a3b8');
  assert.equal(colorForStatus('1', 'url(bad)'), colorForStatus('1'));
  assert.match(colorForStatus('1'), /^#[0-9a-f]{6}$/);
  assert.equal(colorForStatus('1'), colorForStatus(1));
});
