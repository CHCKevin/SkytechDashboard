import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceError, errorInfo, statusFor } from '../server/openproject/errors.mjs';

test('validation errors carry the OpenProject message; others use fixed text', () => {
  assert.equal(new SourceError('validation', 'Hours can\'t be blank.').message, 'Hours can\'t be blank.');
  assert.equal(new SourceError('validation').message, 'OpenProject 拒絕了這筆資料');
  assert.equal(new SourceError('unauthorized', 'ignored').message, 'OpenProject 驗證失敗，請確認 API token');
  assert.deepEqual(errorInfo(new SourceError('not_found')), { code: 'not_found', message: 'OpenProject 找不到資源' });
  assert.deepEqual(errorInfo(new Error('secret')), { code: 'internal_error', message: '伺服器內部錯誤' });
});
test('maps source error codes to local HTTP statuses', () => {
  assert.equal(statusFor('validation'), 422);
  assert.equal(statusFor('not_found'), 404);
  assert.equal(statusFor('forbidden'), 403);
  assert.equal(statusFor('timeout'), 504);
  assert.equal(statusFor('unauthorized'), 502);
  assert.equal(statusFor('network'), 502);
  assert.equal(statusFor('unsafe_write'), 500);
});
test('write_unconfirmed has a fixed message and the default status', () => {
  assert.equal(new SourceError('write_unconfirmed').message, 'OpenProject 已收到請求，但結果無法確認，請重新讀取確認後再決定是否重送');
  assert.equal(statusFor('write_unconfirmed'), 502);
});
