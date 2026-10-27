import { hash } from '../shared/layout.mjs';

// 純函式：固定種子的亂數與程序化外觀參數；不依賴 three 或 DOM，可在 Node 測試。
export const PLANET_KINDS = ['gas', 'rock', 'ice'];
export const GALAXY_TYPES = ['spiral', 'elliptical', 'irregular', 'edge'];

// mulberry32：快速、可重現，足以產生視覺用的亂數。
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 3D 值雜訊，回傳 [0, 1]；在球面上取樣可避免貼圖接縫。
export function createNoise3(seed) {
  const random = seededRandom(seed);
  const order = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const perm = new Uint8Array(512).map((_, i) => order[i & 255]);
  const values = Float32Array.from({ length: 256 }, () => random());
  const at = (x, y, z) => values[perm[perm[perm[x] + y] + z]];
  const fade = t => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const [X, Y, Z] = [xi & 255, yi & 255, zi & 255];
    const [u, v, w] = [fade(x - xi), fade(y - yi), fade(z - zi)];
    return mix(
      mix(mix(at(X, Y, Z), at(X + 1, Y, Z), u), mix(at(X, Y + 1, Z), at(X + 1, Y + 1, Z), u), v),
      mix(mix(at(X, Y, Z + 1), at(X + 1, Y, Z + 1), u), mix(at(X, Y + 1, Z + 1), at(X + 1, Y + 1, Z + 1), u), v),
      w,
    );
  };
}

// 分形雜訊：多層頻率疊加，仍回傳 [0, 1]。
export function fractal(noise, x, y, z, octaves = 4) {
  let sum = 0;
  let weight = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const scale = 2 ** i;
    sum += noise(x * scale, y * scale, z * scale) * weight;
    norm += weight;
    weight /= 2;
  }
  return sum / norm;
}

export function planetTraits(id) {
  const random = seededRandom(hash(`planet:${id}`));
  const kind = PLANET_KINDS[Math.floor(random() * PLANET_KINDS.length)];
  return {
    kind,
    variant: random() < 0.5 ? 0 : 1,
    tilt: (random() - 0.5) * 0.9,
    spin: 0.05 + random() * 0.25,
    phase: random() * Math.PI * 2,
    ring: kind === 'gas' && random() < 0.35,
  };
}

// 依恆星光譜型的大致比例：多數偏白黃橙，少數藍白。
const STAR_COLORS = [
  [0.04, '#9bb0ff'], [0.12, '#aabfff'], [0.25, '#cad7ff'], [0.45, '#f8f7ff'],
  [0.68, '#fff4ea'], [0.86, '#ffd2a1'], [1, '#ffbd6f'],
];

export function starColor(r) {
  return STAR_COLORS.find(([limit]) => r < limit)?.[1] ?? STAR_COLORS.at(-1)[1];
}

const NEBULA_COLORS = ['#ff5fa2', '#5ad1ff', '#ff9f5a', '#9d7bff', '#5affc8'];
const BAND_COLORS = ['#c9d6ff', '#ffe8c9', '#e6dcff'];

const normalize = v => {
  const length = Math.hypot(...v);
  return v.map(x => x / length);
};
const cross = ([a, b, c], [d, e, f]) => [b * f - c * e, c * d - a * f, a * e - b * d];
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

// 背景天空的固定目錄：每次開啟看到同一片天空。
export function skyCatalog(seed = 20261027) {
  const random = seededRandom(seed);
  const pick = list => list[Math.floor(random() * list.length)];
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const bandNormal = normalize([0.35, 1, 0.3]);
  const u = normalize(cross(bandNormal, [1, 0, 0]));
  const v = cross(bandNormal, u);
  const anywhere = () => {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - z * z);
    return normalize([ring * Math.cos(angle), z, ring * Math.sin(angle)]);
  };
  const inBand = width => {
    const angle = random() * Math.PI * 2;
    const lat = gaussian() * width;
    return normalize(u.map((x, i) => Math.cos(angle) * x + Math.sin(angle) * v[i] + lat * bandNormal[i]));
  };

  const stars = Array.from({ length: 7000 }, (_, i) => {
    const band = i < 4200;
    const r = random();
    return {
      direction: band ? inBand(0.1) : anywhere(),
      inBand: band,
      size: r < 0.8 ? 0 : r < 0.97 ? 1 : 2,
      color: starColor(random()),
    };
  });
  const galaxies = Array.from({ length: 36 }, (_, i) => {
    const type = GALAXY_TYPES[i % GALAXY_TYPES.length];
    // 銀河平面附近被塵埃遮蔽，遠處星系避開這一帶。
    let direction = anywhere();
    while (Math.abs(dot(direction, bandNormal)) < 0.25) direction = anywhere();
    return {
      type,
      variant: Math.floor(i / GALAXY_TYPES.length) % 2,
      direction,
      scale: 60 + random() * 200,
      aspect: type === 'edge' ? 0.18 + random() * 0.12 : 0.35 + random() * 0.65,
      rotation: random() * Math.PI * 2,
      brightness: 0.55 + random() * 0.45,
    };
  });
  const nebulae = Array.from({ length: 8 }, () => ({
    direction: inBand(0.12), scale: 250 + random() * 350, color: pick(NEBULA_COLORS), rotation: random() * Math.PI * 2,
  }));
  const band = Array.from({ length: 70 }, () => ({
    direction: inBand(0.08), scale: 500 + random() * 500, color: pick(BAND_COLORS),
    opacity: 0.22 + random() * 0.2, rotation: random() * Math.PI * 2,
  }));
  return { bandNormal, stars, galaxies, nebulae, band };
}
