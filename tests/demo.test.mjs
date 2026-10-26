import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSource } from '../server/demo.mjs';

const fixedNow = () => new Date('2026-10-26T12:00:00.000Z');

test('snapshot is complete, labeled demo, and covers the required cases', async () => {
  const s = await createDemoSource({ now: fixedNow }).getSnapshot({ refresh: false });
  assert.equal(s.mode, 'demo');
  assert.equal(s.complete, true);
  assert.equal(s.stale, false);
  assert.equal(s.error, null);
  assert.equal(s.lastSuccessAt, '2026-10-26T12:00:00.000Z');
  assert.deepEqual(s.progress, { loaded: s.workPackages.length, total: s.workPackages.length });
  const used = new Set(s.workPackages.map(wp => wp.projectId));
  assert.ok(s.projects.some(p => !used.has(p.id)), 'has an empty project');
  assert.ok(s.workPackages.some(wp => wp.assignee === null), 'has an unassigned item');
  assert.ok(s.workPackages.some(wp => wp.updatedAt === null), 'has an item without updatedAt');
  assert.ok(s.workPackages.every(wp => wp.url === null), 'demo never fabricates source links');
  for (const wp of s.workPackages) {
    assert.ok(s.statuses.some(st => st.id === wp.status.id && st.name === wp.status.name &&
      st.color === wp.status.color), `status of ${wp.id} is in the legend`);
  }
  assert.ok(s.statuses.every(st => /^#[0-9a-f]{6}$/.test(st.color)));
  assert.ok(s.statuses.some(st => st.id === null && st.name === '未知狀態' && st.color === '#94a3b8'));
});
test('participants cover multi-role, same-name, and incomplete history', async () => {
  const source = createDemoSource({ now: fixedNow });
  const multiRole = await source.getParticipants('1002', { refresh: false });
  assert.equal(multiRole.people.length, 1);
  assert.equal(multiRole.complete, true);
  assert.equal(multiRole.error, null);
  const sameName = await source.getParticipants('1003', { refresh: false });
  assert.deepEqual(sameName.people.map(p => [p.id, p.name]), [['2', 'Alex'], ['1', 'Alex']]);
  assert.equal(sameName.workPackageUpdatedAt, null);
  const partial = await source.getParticipants('1004', { refresh: false });
  assert.equal(partial.complete, false);
  assert.equal(partial.error.code, 'activities_incomplete');
  assert.ok(partial.people.some(p => p.id === null));
  assert.equal(await source.getParticipants('9999', { refresh: false }), null);
});
test('returned data are copies that callers cannot corrupt', async () => {
  const source = createDemoSource({ now: fixedNow });
  const first = await source.getSnapshot({ refresh: false });
  first.projects[0].name = 'changed';
  first.workPackages[0].status.name = 'changed';
  const second = await source.getSnapshot({ refresh: false });
  assert.notEqual(second.projects[0].name, 'changed');
  assert.notEqual(second.workPackages[0].status.name, 'changed');
});
