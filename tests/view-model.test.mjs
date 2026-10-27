import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSource } from '../server/demo.mjs';
import {
  MISSING, legendEntries, projectSummaries, visibleWorkPackages, detailFields,
  participantsStatus, safeUrl, formatTime, snapshotNotice, planetLabel,
} from '../client/view-model.mjs';

const snapshot = await createDemoSource().getSnapshot({ refresh: false });
const byId = id => snapshot.workPackages.find(wp => wp.id === id);

test('legend lists every status with its usage count', () => {
  const legend = legendEntries(snapshot);
  assert.equal(legend.length, snapshot.statuses.length);
  assert.equal(legend.reduce((sum, entry) => sum + entry.count, 0), snapshot.workPackages.length);
  assert.deepEqual(legend.find(entry => entry.name === '未知狀態'), { name: '未知狀態', color: '#94a3b8', count: 1 });
});
test('project summaries and visible items follow the view', () => {
  assert.deepEqual(projectSummaries(snapshot).map(p => [p.id, p.count]), [['101', 3], ['102', 1], ['103', 0]]);
  assert.deepEqual(visibleWorkPackages(snapshot, { mode: 'overview', projectId: null }), []);
  assert.deepEqual(visibleWorkPackages(snapshot, { mode: 'galaxy', projectId: '102' }).map(wp => wp.id), ['1004']);
  assert.equal(visibleWorkPackages(snapshot, { mode: 'universe', projectId: null }).length, 4);
});
test('detail fields mark missing values and keep HTML as plain text', () => {
  const fields = Object.fromEntries(detailFields(byId('1003'), '星圖平台'));
  assert.equal(fields['專案'], '星圖平台');
  assert.equal(fields['負責人'], '未指派');
  assert.equal(fields['描述'], MISSING);
  assert.equal(fields['更新時間'], MISSING);
  const html = Object.fromEntries(detailFields(byId('1002'), null));
  assert.equal(html['描述'], '<b>示例：此字串不應被當成 HTML</b>');
  assert.equal(html['專案'], MISSING);
  assert.equal(formatTime('not a date'), MISSING);
  assert.notEqual(formatTime('2026-10-20T08:00:00.000Z'), MISSING);
});
test('participant status text covers loading, failure, partial, and empty', () => {
  assert.equal(participantsStatus({ status: 'idle', result: null, message: null }), '');
  assert.equal(participantsStatus({ status: 'loading', result: null, message: null }), '載入參與者中…');
  assert.equal(participantsStatus({ status: 'error', result: null, message: '逾時' }), '參與者載入失敗：逾時');
  assert.equal(participantsStatus({ status: 'ready', message: null,
    result: { complete: false, people: [{}], error: { message: '部分' } } }), '名單可能不完整：部分');
  assert.equal(participantsStatus({ status: 'ready', message: null,
    result: { complete: true, people: [], error: null } }), '沒有可顯示的參與者');
  assert.equal(participantsStatus({ status: 'ready', message: null,
    result: { complete: true, people: [{}], error: null } }), '');
});
test('only http(s) links are allowed', () => {
  assert.equal(safeUrl('http://192.168.31.13:8080/work_packages/1'), 'http://192.168.31.13:8080/work_packages/1');
  assert.equal(safeUrl('https://example.test/x'), 'https://example.test/x');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('not a url'), null);
  assert.equal(safeUrl(null), null);
});
test('snapshot notices explain source errors and stale data', () => {
  assert.equal(snapshotNotice(snapshot), '');
  assert.equal(snapshotNotice({ ...snapshot, complete: false }), '資料未完整載入，畫面可能缺少部分項目。');
  const error = { code: 'unauthorized', message: 'OpenProject 驗證失敗，請確認 API token' };
  assert.equal(snapshotNotice({ ...snapshot, complete: false, error }), '資料來源錯誤：OpenProject 驗證失敗，請確認 API token');
  const notice = snapshotNotice({ ...snapshot, stale: true, error, lastSuccessAt: '2026-10-27T00:00:00.000Z' });
  assert.ok(notice.startsWith('資料來源錯誤：OpenProject 驗證失敗，請確認 API token。目前顯示 '), notice);
  assert.ok(notice.endsWith(' 的資料。'), notice);
});
test('planet labels show only the work package ID', () => {
  assert.equal(planetLabel(byId('1002')), '#1002');
});
