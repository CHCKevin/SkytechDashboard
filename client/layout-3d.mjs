import { positionFor } from '../shared/layout.mjs';

// 世界座標只由 ID 決定，資料更新不會讓星系或星球跳動。
const GALAXY_SPREAD = 4;
const PLANET_SPREAD = 0.6;

export function galaxyCenter(projectId) {
  return positionFor('project', projectId).map(v => v * GALAXY_SPREAD);
}

export function planetPosition(wp) {
  const center = galaxyCenter(wp.projectId);
  const offset = positionFor('work-package', wp.id).map(v => v * PLANET_SPREAD);
  return center.map((v, i) => v + offset[i]);
}

export function shipPosition(center, index, count, time) {
  const radius = 4.5 + Math.ceil(count / 6) * 1.2;
  const angle = (index / count) * Math.PI * 2 + time * 0.0005;
  const height = ((index % 3) - 1) * 0.8;
  return [center[0] + Math.cos(angle) * radius, center[1] + height, center[2] + Math.sin(angle) * radius];
}

export function cameraPreset(view) {
  if (view.mode === 'galaxy') {
    const target = galaxyCenter(view.projectId);
    return { target, position: [target[0], target[1] + 40, target[2] + 75] };
  }
  const scale = view.mode === 'universe' ? 1.25 : 1;
  return { target: [0, 0, 0], position: [0, 240 * scale, 360 * scale] };
}
