import { positionFor } from '../shared/layout.mjs';

// 星球沿 Vogel 螺旋排列（第 n 顆 r = c·√(n + START)、θ = n·黃金角）；最小間距約 1.657c，因此保證不重疊。
// 同一專案內依 ID 數值排序：新項目 ID 較大、排在最外圈，既有星球不會移動。
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PLANET_SPACING = 6;
const START = 8;
const PLANET_LIFT = 1.5;
const GALAXY_MARGIN = 10;
const GALAXY_GAP = 40;
const GALAXY_LIFT = 30;
const EMPTY_EXTENT = 300;

const byNumericId = (a, b) => Number(a.id) - Number(b.id) || String(a.id).localeCompare(String(b.id));

// 半徑依「不小於項目數的 2 的次方」計算，只有跨過 2 的次方時才改變，星系不會頻繁移動。
function galaxyRadius(count) {
  const bucket = 2 ** Math.ceil(Math.log2(Math.max(count, 1)));
  return PLANET_SPACING * Math.sqrt(bucket + START) + GALAXY_MARGIN;
}

export function computeLayout(snapshot) {
  const members = new Map(snapshot.projects.map(project => [project.id, []]));
  for (const wp of snapshot.workPackages) {
    if (!members.has(wp.projectId)) members.set(wp.projectId, []);
    members.get(wp.projectId).push(wp);
  }

  // 星系依專案 ID 排序，沿黃金角螺旋找最近且與既有星系不重疊的位置。
  const galaxies = new Map();
  const placed = [];
  [...members.keys()].map(id => ({ id })).sort(byNumericId).forEach(({ id }, k) => {
    const radius = galaxyRadius(members.get(id).length);
    const lift = (positionFor('project', id)[1] / 6) * GALAXY_LIFT;
    const angle = k * GOLDEN_ANGLE;
    let center;
    for (let r = 0; ; r += 5) {
      center = [Math.cos(angle) * r, lift, Math.sin(angle) * r];
      if (placed.every(other => Math.hypot(...center.map((v, i) => v - other.center[i])) >= radius + other.radius + GALAXY_GAP)) break;
    }
    const galaxy = { center, radius };
    placed.push(galaxy);
    galaxies.set(id, galaxy);
  });

  const planets = new Map();
  for (const [projectId, items] of members) {
    const { center } = galaxies.get(projectId);
    [...items].sort(byNumericId).forEach((wp, n) => {
      const r = PLANET_SPACING * Math.sqrt(n + START);
      const lift = (positionFor('work-package', wp.id)[1] / 6) * PLANET_LIFT;
      planets.set(wp.id, [center[0] + Math.cos(n * GOLDEN_ANGLE) * r, center[1] + lift, center[2] + Math.sin(n * GOLDEN_ANGLE) * r]);
    });
  }

  const extent = placed.reduce((max, g) => Math.max(max, Math.hypot(g.center[0], g.center[2]) + g.radius), 0) || EMPTY_EXTENT;
  return { galaxies, planets, extent };
}

export function shipPosition(center, index, count, time) {
  const radius = 4.5 + Math.ceil(count / 6) * 1.2;
  const angle = (index / count) * Math.PI * 2 + time * 0.0005;
  const height = ((index % 3) - 1) * 0.8;
  return [center[0] + Math.cos(angle) * radius, center[1] + height, center[2] + Math.sin(angle) * radius];
}

// 相機距離依星系半徑或整體範圍決定，大星系與小星系都能完整入鏡。
export function cameraPreset(view, layout) {
  if (view.mode === 'galaxy') {
    const galaxy = layout.galaxies.get(view.projectId) ?? { center: [0, 0, 0], radius: galaxyRadius(1) };
    const { center: target, radius } = galaxy;
    return { target, position: [target[0], target[1] + radius * 0.75 + 10, target[2] + radius * 1.25 + 20] };
  }
  const scale = view.mode === 'universe' ? 1.25 : 1;
  return { target: [0, 0, 0], position: [0, (layout.extent * 0.75 + 60) * scale, (layout.extent * 1.1 + 90) * scale] };
}
