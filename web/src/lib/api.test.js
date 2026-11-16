import { afterEach, expect, test, vi } from 'vitest';
import * as api from './api.js';

function mockFetch(status, body) {
  const fn = vi.fn(async () => ({
    status, ok: status >= 200 && status < 300,
    json: async () => { if (body === undefined) throw new SyntaxError('no body'); return body; },
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

test('reads use GET without the write header', async () => {
  const fetch = mockFetch(200, [{ id: 1 }]);
  expect(await api.listEntries('2026-11-16')).toEqual([{ id: 1 }]);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('/api/time-entries?date=2026-11-16');
  expect(init.method).toBe('GET');
  expect(init.headers['X-Quest-Board']).toBeUndefined();
});
test('writes send JSON with the write header', async () => {
  const fetch = mockFetch(201, { id: 9 });
  await api.createEntry({ workPackageId: 1, date: '2026-11-16', hours: 1, activityId: null, comment: '' });
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('/api/time-entries');
  expect(init.method).toBe('POST');
  expect(init.headers['X-Quest-Board']).toBe('1');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(init.body).workPackageId).toBe(1);
});
test('delete returns null on 204 and still sends the write header', async () => {
  const fetch = mockFetch(204);
  expect(await api.deleteEntry(5)).toBeNull();
  expect(fetch.mock.calls[0][0]).toBe('/api/time-entries/5');
  expect(fetch.mock.calls[0][1].headers['X-Quest-Board']).toBe('1');
  expect(fetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
});
test('server errors become ApiError with code, message and field', async () => {
  mockFetch(400, { error: { code: 'invalid_input', message: '時數錯誤', field: 'hours' } });
  await expect(api.createEntry({})).rejects.toMatchObject({ name: 'ApiError', status: 400, code: 'invalid_input', message: '時數錯誤', field: 'hours' });
  mockFetch(500);
  await expect(api.getMe()).rejects.toMatchObject({ status: 500, code: 'http_error', message: '伺服器回應錯誤（500）' });
});
test('network failures become a network ApiError', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
  await expect(api.getMe()).rejects.toMatchObject({ status: 0, code: 'network' });
});
test('query parameters are encoded', async () => {
  const fetch = mockFetch(200, []);
  await api.searchWorkPackages('#12 登入');
  expect(fetch.mock.calls[0][0]).toBe(`/api/work-packages/search?q=${encodeURIComponent('#12 登入')}`);
  await api.listActivities(7);
  expect(fetch.mock.calls[1][0]).toBe('/api/activities?workPackageId=7');
  await api.unpinQuest(7);
  expect(fetch.mock.calls[2][0]).toBe('/api/quests/7');
  expect(fetch.mock.calls[2][1].method).toBe('DELETE');
});
test('a fetch timeout becomes a timeout ApiError and requests carry an abort signal', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('signal timed out', 'TimeoutError'); }));
  await expect(api.createEntry({})).rejects.toMatchObject({ status: 0, code: 'timeout', message: '本機伺服器回應逾時，請重新整理確認結果' });
  const fetch = mockFetch(200, []);
  await api.listQuests();
  expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
