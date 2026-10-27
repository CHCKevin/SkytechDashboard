import test from 'node:test';
import assert from 'node:assert/strict';
import { galaxyCenter, planetPosition, shipPosition, cameraPreset } from '../client/layout-3d.mjs';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('planets sit near their own galaxy center', () => {
  for (const id of ['1001', '1002', '1003', '1004']) {
    const d = distance(planetPosition({ id, projectId: '101' }), galaxyCenter('101'));
    assert.ok(d >= 10 && d <= 50, `${id}: ${d}`);
  }
});
test('positions are stable and depend only on IDs', () => {
  const wp = { id: '1001', projectId: '101' };
  assert.deepEqual(planetPosition(wp), planetPosition({ ...wp, subject: 'other' }));
  assert.deepEqual(galaxyCenter('101'), galaxyCenter('101'));
  assert.notDeepEqual(galaxyCenter('101'), galaxyCenter('102'));
});
test('ships orbit at a shared radius that grows with crowd size', () => {
  const center = [10, 0, -5];
  const ring = count => Array.from({ length: count }, (_, i) => shipPosition(center, i, count, 0));
  const flat = p => Math.hypot(p[0] - center[0], p[2] - center[2]);
  const small = ring(3);
  assert.ok(small.every(p => Math.abs(flat(p) - flat(small[0])) < 1e-9));
  assert.equal(new Set(small.map(p => p.join())).size, 3);
  assert.ok(flat(ring(12)[0]) > flat(small[0]));
  assert.notDeepEqual(shipPosition(center, 0, 3, 1000), small[0]);
});
test('camera presets frame the requested view', () => {
  const galaxy = cameraPreset({ mode: 'galaxy', projectId: '101' });
  assert.deepEqual(galaxy.target, galaxyCenter('101'));
  assert.ok(distance(galaxy.position, galaxy.target) < 90);
  const overview = cameraPreset({ mode: 'overview', projectId: null });
  const universe = cameraPreset({ mode: 'universe', projectId: null });
  assert.deepEqual(overview.target, [0, 0, 0]);
  assert.ok(distance(universe.position, [0, 0, 0]) > distance(overview.position, [0, 0, 0]));
});
