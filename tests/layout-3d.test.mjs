import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, shipPosition, cameraPreset } from '../client/layout-3d.mjs';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 與真實資料相同規模：5 個專案、362 個項目，其中一個專案 244 個。
const sizes = { 1: 25, 3: 62, 5: 244, 8: 10, 9: 21 };
const snapshotOf = (counts, firstId = 1) => {
  let id = firstId;
  const workPackages = [];
  for (const [projectId, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i += 1) workPackages.push({ id: String(id++), projectId: String(projectId) });
  }
  return { projects: Object.keys(counts).map(projectId => ({ id: String(projectId) })), workPackages };
};
const real = snapshotOf(sizes);
const layout = computeLayout(real);

test('planets never overlap, even in a 244-item galaxy', () => {
  const points = [...layout.planets.values()];
  assert.equal(points.length, 362);
  let min = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = 0; j < i; j += 1) min = Math.min(min, distance(points[i], points[j]));
  }
  assert.ok(min >= 9, `closest pair ${min}`);
});
test('planets stay inside their own galaxy and galaxies keep clear of each other', () => {
  for (const wp of real.workPackages) {
    const galaxy = layout.galaxies.get(wp.projectId);
    const d = distance(layout.planets.get(wp.id), galaxy.center);
    assert.ok(d >= 12 && d <= galaxy.radius, `${wp.id}: ${d} > ${galaxy.radius}`);
  }
  const galaxies = [...layout.galaxies.values()];
  for (let i = 0; i < galaxies.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      assert.ok(distance(galaxies[i].center, galaxies[j].center) >= galaxies[i].radius + galaxies[j].radius + 40);
    }
  }
});
test('adding newer items does not move existing planets or galaxies', () => {
  const grown = { ...real, workPackages: [...real.workPackages, { id: '9999', projectId: '5' }, { id: '10000', projectId: '9' }] };
  const after = computeLayout(grown);
  for (const wp of real.workPackages) assert.deepEqual(after.planets.get(wp.id), layout.planets.get(wp.id), wp.id);
  for (const [id, galaxy] of layout.galaxies) assert.deepEqual(after.galaxies.get(id), galaxy, id);
  assert.deepEqual(computeLayout(real), layout, 'same data, same layout');
});
test('IDs are ordered numerically, not as text', () => {
  const small = computeLayout({ projects: [{ id: '1' }], workPackages: [{ id: '10', projectId: '1' }, { id: '9', projectId: '1' }] });
  const nine = small.planets.get('9');
  const center = small.galaxies.get('1').center;
  const ten = small.planets.get('10');
  assert.ok(distance(nine, center) < distance(ten, center), 'lower ID sits on the inner ring');
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
test('camera presets frame the requested view at a distance that fits it', () => {
  const big = cameraPreset({ mode: 'galaxy', projectId: '5' }, layout);
  const tiny = cameraPreset({ mode: 'galaxy', projectId: '8' }, layout);
  assert.deepEqual(big.target, layout.galaxies.get('5').center);
  assert.ok(distance(big.position, big.target) > distance(tiny.position, tiny.target));
  assert.ok(distance(big.position, big.target) > layout.galaxies.get('5').radius);
  const overview = cameraPreset({ mode: 'overview', projectId: null }, layout);
  const universe = cameraPreset({ mode: 'universe', projectId: null }, layout);
  assert.deepEqual(overview.target, [0, 0, 0]);
  assert.ok(distance(overview.position, [0, 0, 0]) > layout.extent);
  assert.ok(distance(universe.position, [0, 0, 0]) > distance(overview.position, [0, 0, 0]));
  const empty = computeLayout({ projects: [], workPackages: [] });
  assert.ok(distance(cameraPreset({ mode: 'overview', projectId: null }, empty).position, [0, 0, 0]) > 0);
});
