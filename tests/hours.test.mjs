import test from 'node:test';
import assert from 'node:assert/strict';
import { toDuration, fromDuration } from '../server/hours.mjs';
import { SourceError } from '../server/openproject/errors.mjs';

test('toDuration writes decimal hours', () => {
  assert.equal(toDuration(2.5), 'PT2.5H');
  assert.equal(toDuration(1), 'PT1H');
  assert.equal(toDuration(0.25), 'PT0.25H');
});
test('fromDuration reads OpenProject durations as hours rounded to 2 places', () => {
  assert.equal(fromDuration('PT1H'), 1);
  assert.equal(fromDuration('PT2H30M'), 2.5);
  assert.equal(fromDuration('PT45M'), 0.75);
  assert.equal(fromDuration('PT20M'), 0.33);
  assert.equal(fromDuration('PT2.5H'), 2.5);
  assert.equal(fromDuration('P1DT2H'), 26);
  assert.equal(fromDuration('PT1H0M30S'), 1.01);
});
test('fromDuration rejects malformed values', () => {
  for (const bad of ['', 'P', 'PT', '1H', 'PTXH', null, undefined, 3]) {
    assert.throws(() => fromDuration(bad), error => error instanceof SourceError && error.code === 'invalid_response');
  }
});
