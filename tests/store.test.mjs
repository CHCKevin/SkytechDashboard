import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSource } from '../server/demo.mjs';
import { createStore } from '../client/store.mjs';

const snapshot = await createDemoSource().getSnapshot({ refresh: false });
const loaded = () => {
  const store = createStore();
  store.setSnapshot(snapshot);
  return store;
};

test('stale participant responses are ignored', () => {
  const store = loaded();
  store.showUniverse();
  const first = store.select('1001');
  const second = store.select('1002');
  assert.equal(store.receiveParticipants(first, { workPackageId: '1001' }), false);
  assert.equal(store.get().participants.status, 'loading');
  assert.equal(store.receiveParticipants(second, { workPackageId: '1002' }), true);
  assert.deepEqual(store.get().participants, { status: 'ready', result: { workPackageId: '1002' }, message: null });
  store.select(null);
  assert.equal(store.failParticipants(second, '逾時'), false);
  assert.equal(store.get().participants.status, 'idle');
  const fourth = store.select('1003');
  assert.equal(store.failParticipants(fourth, '逾時'), true);
  assert.deepEqual(store.get().participants, { status: 'error', result: null, message: '逾時' });
});
test('view changes keep the selection only while it stays visible', () => {
  const store = loaded();
  store.showProject('101');
  assert.deepEqual(store.get().view, { mode: 'galaxy', projectId: '101' });
  store.select('1001');
  store.showUniverse();
  assert.equal(store.get().selectedId, '1001');
  store.showProject('101');
  assert.equal(store.get().selectedId, '1001');
  store.showProject('102');
  assert.equal(store.get().selectedId, null);
  store.select('1004');
  store.showOverview();
  assert.equal(store.get().selectedId, null);
  assert.equal(store.get().participants.status, 'idle');
});
test('a complete snapshot without the selected item clears it; a partial one does not', () => {
  const store = loaded();
  store.showProject('101');
  store.select('1001');
  const without = { ...snapshot, workPackages: snapshot.workPackages.filter(wp => wp.id !== '1001') };
  store.setSnapshot({ ...without, complete: false });
  assert.equal(store.get().selectedId, '1001');
  store.setSnapshot(without);
  assert.equal(store.get().selectedId, null);
});
test('a complete snapshot without the current project returns to overview', () => {
  const store = loaded();
  store.showProject('103');
  store.setSnapshot({ ...snapshot, projects: snapshot.projects.filter(p => p.id !== '103') });
  assert.deepEqual(store.get().view, { mode: 'overview', projectId: null });
});
test('subscribers are notified until they unsubscribe', () => {
  const store = createStore();
  const seen = [];
  const unsubscribe = store.subscribe(state => seen.push(state.view.mode));
  store.showUniverse();
  unsubscribe();
  store.showOverview();
  assert.deepEqual(seen, ['universe']);
});
