import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seededRandom, createNoise3, planetTraits, starColor, skyCatalog, GALAXY_TYPES, PLANET_KINDS,
} from '../client/procedural.mjs';

const isUnit = ([x, y, z]) => Math.abs(Math.hypot(x, y, z) - 1) < 1e-9;

test('seeded random is repeatable and in range', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  const values = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(values.slice(0, 5), Array.from({ length: 5 }, () => b()));
  assert.ok(values.every(v => v >= 0 && v < 1));
  assert.notEqual(seededRandom(43)(), values[0]);
});
test('3D noise is repeatable, bounded, and continuous', () => {
  const noise = createNoise3(7);
  assert.equal(noise(1.3, 2.7, -0.4), createNoise3(7)(1.3, 2.7, -0.4));
  for (let i = 0; i < 500; i += 1) {
    const value = noise(i * 0.37, i * -0.11, i * 0.05);
    assert.ok(value >= 0 && value <= 1, value);
    assert.ok(Math.abs(noise(i * 0.37 + 0.001, i * -0.11, i * 0.05) - value) < 0.02);
  }
});
test('planet traits depend only on the ID and stay in range', () => {
  assert.deepEqual(planetTraits('426'), planetTraits('426'));
  const all = Array.from({ length: 300 }, (_, i) => planetTraits(String(i + 1)));
  assert.deepEqual(new Set(all.map(t => t.kind)), new Set(PLANET_KINDS));
  for (const t of all) {
    assert.ok([0, 1].includes(t.variant));
    assert.ok(Math.abs(t.tilt) <= 0.5);
    assert.ok(t.spin >= 0.05 && t.spin <= 0.3);
    if (t.ring) assert.equal(t.kind, 'gas');
  }
  const rings = all.filter(t => t.ring).length / all.length;
  assert.ok(rings >= 0.02 && rings <= 0.4, rings);
});
test('star colors are valid hex at both ends', () => {
  for (const r of [0, 0.5, 0.999999]) assert.match(starColor(r), /^#[0-9a-f]{6}$/);
});
test('the sky catalog is fixed, with a concentrated galactic band and every galaxy type', () => {
  const sky = skyCatalog();
  assert.deepEqual(sky, skyCatalog());
  assert.equal(sky.stars.length, 7000);
  assert.ok(sky.stars.every(s => isUnit(s.direction) && [0, 1, 2].includes(s.size) && /^#[0-9a-f]{6}$/.test(s.color)));
  const spread = band => {
    const picked = sky.stars.filter(s => s.inBand === band);
    return picked.reduce((sum, s) => sum + Math.abs(s.direction.reduce((d, v, i) => d + v * sky.bandNormal[i], 0)), 0) / picked.length;
  };
  assert.ok(spread(true) < spread(false) / 2, 'band stars hug the galactic plane');
  assert.equal(sky.galaxies.length, 36);
  assert.deepEqual(new Set(sky.galaxies.map(g => g.type)), new Set(GALAXY_TYPES));
  assert.ok(sky.galaxies.every(g => isUnit(g.direction) && g.scale > 0 && g.aspect > 0 && g.aspect <= 1));
  assert.equal(sky.nebulae.length, 8);
  assert.equal(sky.band.length, 70);
});
