import * as THREE from 'three';
import { PLANET_KINDS, createNoise3, fractal, planetTraits, seededRandom } from './procedural.mjs';

const RADIUS = 1.6;
const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 128;
const ROUGHNESS = { gas: 0.85, rock: 1, ice: 0.45 };

const atmosphereVertex = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-viewPosition.xyz);
  gl_Position = projectionMatrix * viewPosition;
}`;
const atmosphereFragment = `
uniform vec3 glowColor;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  // 背面殼層：靠近星球邊緣最亮，往外漸淡到殼層輪廓為 0；殼層內側被星球表面遮住。
  float rim = pow(clamp(-dot(vNormal, vView) / 0.5, 0.0, 1.0), 3.0);
  gl_FragColor = vec4(glowColor * rim, rim);
  #include <colorspace_fragment>
}`;

// 星球外觀：灰階表面材質乘上狀態顏色，主色仍是狀態顏色；類型、軸傾角、自轉只由 ID 決定。
export function createPlanetLooks() {
  const surfaceGeometry = new THREE.SphereGeometry(RADIUS, 40, 28);
  const atmosphereGeometry = new THREE.SphereGeometry(RADIUS * 1.18, 32, 24);
  const ringGeometry = new THREE.RingGeometry(RADIUS * 1.45, RADIUS * 2.35, 72, 1);
  const textures = new Map(PLANET_KINDS.flatMap(kind => [0, 1].map(variant =>
    [`${kind}:${variant}`, surfaceTexture(kind, variant)])));
  const ringTexture = createRingTexture();
  const surfaces = new Map();
  const atmospheres = new Map();
  const rings = new Map();

  const cached = (map, key, build) => {
    if (!map.has(key)) map.set(key, build());
    return map.get(key);
  };
  const surfaceMaterial = (color, { kind, variant }) => cached(surfaces, `${color}:${kind}:${variant}`, () => {
    const map = textures.get(`${kind}:${variant}`);
    return new THREE.MeshStandardMaterial({
      color, map, roughness: ROUGHNESS[kind], metalness: 0,
      // 微弱自發光讓暗面仍看得出狀態顏色。
      emissive: color, emissiveIntensity: 0.12,
      ...(kind === 'gas' ? {} : { bumpMap: map, bumpScale: kind === 'rock' ? 2.5 : 1 }),
    });
  });
  const atmosphereMaterial = color => cached(atmospheres, color, () => new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25) } },
    vertexShader: atmosphereVertex, fragmentShader: atmosphereFragment,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const ringMaterial = color => cached(rings, color, () => new THREE.MeshBasicMaterial({
    map: ringTexture, color: new THREE.Color(color).lerp(new THREE.Color('#f5e9d6'), 0.55),
    transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
  }));

  function create(wp) {
    const traits = planetTraits(wp.id);
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.rotation.z = traits.tilt;
    const surface = new THREE.Mesh(surfaceGeometry);
    surface.rotation.y = traits.phase;
    const atmosphere = new THREE.Mesh(atmosphereGeometry);
    body.add(surface, atmosphere);
    let ring = null;
    if (traits.ring) {
      ring = new THREE.Mesh(ringGeometry);
      ring.rotation.x = Math.PI / 2;
      body.add(ring);
    }
    root.add(body);
    return { root, surface, atmosphere, ring, traits, color: null };
  }

  function restyle(look, color) {
    if (look.color === color) return;
    look.color = color;
    look.surface.material = surfaceMaterial(color, look.traits);
    look.atmosphere.material = atmosphereMaterial(color);
    if (look.ring) look.ring.material = ringMaterial(color);
  }

  return { create, restyle };
}

// 等距長方投影的灰階材質；在球面座標取樣雜訊，經線接縫處連續。
function surfaceTexture(kind, variant) {
  const noise = createNoise3(kind.length * 97 + variant * 13);
  const random = seededRandom(kind.length * 31 + variant);
  const craters = kind === 'rock'
    ? Array.from({ length: 22 }, () => ({ center: randomDirection(random), radius: 0.05 + random() ** 2 * 0.22 }))
    : [];
  const bands = variant === 0 ? 7 : 11;
  const storm = { center: sphere(-0.35, variant === 0 ? 1.2 : 4.1), radius: 0.22 };
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    const lat = (0.5 - (y + 0.5) / TEXTURE_HEIGHT) * Math.PI;
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const p = sphere(lat, ((x + 0.5) / TEXTURE_WIDTH) * Math.PI * 2);
      let value;
      if (kind === 'gas') {
        const turbulence = fractal(noise, p[0] * 3, p[1] * 3, p[2] * 3, 4);
        value = 0.62 + 0.22 * Math.sin((lat + (turbulence - 0.5) * 0.35) * bands) + 0.12 * (turbulence - 0.5);
        const d = angle(p, storm.center);
        if (d < storm.radius) value += 0.25 * (1 - d / storm.radius) * Math.cos(d * 30);
      } else if (kind === 'rock') {
        value = 0.4 + 0.55 * fractal(noise, p[0] * 2.5, p[1] * 2.5, p[2] * 2.5, 5);
        for (const crater of craters) {
          const d = angle(p, crater.center) / crater.radius;
          if (d < 1) value *= 0.78 + 0.1 * d;
          else if (d < 1.2) value *= 1.12;
        }
      } else {
        value = 0.78 + 0.18 * fractal(noise, p[0] * 2, p[1] * 2, p[2] * 2, 4);
        const crack = Math.abs(noise(p[0] * 9, p[1] * 9, p[2] * 9) - 0.5);
        if (crack < 0.025) value *= 0.72;
        if (Math.abs(lat) > 1.15) value = Math.max(value, 0.97);
      }
      const shade = Math.round(Math.min(1, Math.max(0.25, value)) * 255);
      image.data.set([shade, shade, shade, 255], (y * TEXTURE_WIDTH + x) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// RingGeometry 的 UV 是平面投影：方形材質中央為環心，同心圓即為環帶。
function createRingTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(77);
  const inner = (1.45 / 2.35) * (size / 2);
  for (let r = inner; r < size / 2; r += 1) {
    ctx.strokeStyle = `rgba(255,255,255,${0.2 + random() * 0.65})`;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sphere(lat, lon) {
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
}

function randomDirection(random) {
  return sphere(Math.asin(random() * 2 - 1), random() * Math.PI * 2);
}

function angle(a, b) {
  return Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}
