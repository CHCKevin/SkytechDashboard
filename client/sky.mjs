import * as THREE from 'three';
import { seededRandom, skyCatalog } from './procedural.mjs';

const SKY_RADIUS = 2500;
const STAR_PIXELS = [1.3, 2.2, 3.4];

// 背景天空：每畫格由場景移到相機位置，因此沒有視差、永遠在遠處，也不參與點選。
export function createSky() {
  const catalog = skyCatalog();
  const glow = softDotTexture();
  const cloud = cloudTexture(seededRandom(11));
  const galaxyTextures = {
    spiral: [spiralTexture(seededRandom(21), 2), spiralTexture(seededRandom(22), 3)],
    elliptical: [ellipticalTexture('#ffe2b8'), ellipticalTexture('#fff1dc')],
    irregular: [irregularTexture(seededRandom(31)), irregularTexture(seededRandom(32))],
    edge: [edgeTexture(seededRandom(41)), edgeTexture(seededRandom(42))],
  };
  const sky = new THREE.Group();
  sky.renderOrder = -1;
  const place = (sprite, direction, distance = SKY_RADIUS) => sprite.position.set(...direction.map(x => x * distance));

  for (const item of catalog.band) {
    const sprite = backdropSprite(cloud, item.color, item.opacity, item.rotation);
    sprite.scale.setScalar(item.scale);
    place(sprite, item.direction, SKY_RADIUS * 1.05);
    sky.add(sprite);
  }
  for (const item of catalog.nebulae) {
    const sprite = backdropSprite(cloud, item.color, 0.55, item.rotation);
    sprite.scale.setScalar(item.scale);
    place(sprite, item.direction, SKY_RADIUS * 1.02);
    sky.add(sprite);
  }
  for (const item of catalog.galaxies) {
    const sprite = backdropSprite(galaxyTextures[item.type][item.variant], '#ffffff', item.brightness, item.rotation);
    sprite.scale.set(item.scale, item.scale * (item.type === 'edge' ? 1 : item.aspect), 1);
    place(sprite, item.direction);
    sky.add(sprite);
  }
  STAR_PIXELS.forEach((pixels, size) => {
    const stars = catalog.stars.filter(star => star.size === size);
    const positions = new Float32Array(stars.length * 3);
    const colors = new Float32Array(stars.length * 3);
    const color = new THREE.Color();
    stars.forEach((star, i) => {
      positions.set(star.direction.map(x => x * SKY_RADIUS * 0.98), i * 3);
      // 越暗的星越多：小星稍微壓暗，讓亮星突出。
      color.set(star.color).multiplyScalar(size === 0 ? 0.55 + (i % 7) / 14 : 1);
      colors.set([color.r, color.g, color.b], i * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    sky.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      size: pixels, sizeAttenuation: false, vertexColors: true, map: glow,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
  });
  return sky;
}

function backdropSprite(map, color, opacity, rotation) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, opacity, rotation, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function radial(ctx, x, y, radius, stops) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// 恆星光暈：中心亮、向外平滑衰減；星系核心與周圍光芒共用。
export function glowTexture() {
  return canvasTexture(128, (ctx, s) => radial(ctx, s / 2, s / 2, s / 2,
    [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.65)'], [0.35, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]));
}

function softDotTexture() {
  return canvasTexture(64, (ctx, s) => radial(ctx, s / 2, s / 2, s / 2,
    [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]));
}

function cloudTexture(random) {
  return canvasTexture(256, (ctx, s) => {
    for (let i = 0; i < 60; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = random() ** 1.5 * s * 0.3;
      radial(ctx, s / 2 + Math.cos(angle) * distance, s / 2 + Math.sin(angle) * distance, s * (0.08 + random() * 0.17),
        [[0, `rgba(255,255,255,${0.05 + random() * 0.08})`], [1, 'rgba(255,255,255,0)']]);
    }
  });
}

function spiralTexture(random, arms) {
  return canvasTexture(256, (ctx, s) => {
    const c = s / 2;
    radial(ctx, c, c, s * 0.48, [[0, 'rgba(160,180,255,0.18)'], [1, 'rgba(120,140,255,0)']]);
    for (let arm = 0; arm < arms; arm += 1) {
      const offset = (arm / arms) * Math.PI * 2;
      for (let i = 0; i < 420; i += 1) {
        const t = i / 420;
        const angle = offset + t * Math.PI * 3.2;
        const r = s * (0.04 + t * 0.42);
        const jitter = s * 0.035 * (random() - 0.5) * (1 + t * 2);
        const x = c + Math.cos(angle) * r + jitter;
        const y = c + Math.sin(angle) * r + jitter * (random() - 0.5) * 2;
        const blue = random() < 0.5;
        ctx.fillStyle = blue ? `rgba(170,195,255,${0.5 * (1 - t)})` : `rgba(255,225,200,${0.35 * (1 - t)})`;
        ctx.fillRect(x, y, 1.6, 1.6);
        if (random() < 0.05) radial(ctx, x, y, 3 + random() * 4, [[0, 'rgba(255,150,200,0.35)'], [1, 'rgba(255,150,200,0)']]);
      }
    }
    radial(ctx, c, c, s * 0.12, [[0, 'rgba(255,245,220,1)'], [0.4, 'rgba(255,220,170,0.5)'], [1, 'rgba(255,210,160,0)']]);
  });
}

function ellipticalTexture(core) {
  return canvasTexture(128, (ctx, s) => radial(ctx, s / 2, s / 2, s / 2,
    [[0, '#ffffff'], [0.08, core], [0.35, 'rgba(255,215,170,0.35)'], [1, 'rgba(255,200,150,0)']]));
}

function irregularTexture(random) {
  return canvasTexture(128, (ctx, s) => {
    for (let i = 0; i < 26; i += 1) {
      const x = s * (0.3 + random() * 0.4);
      const y = s * (0.3 + random() * 0.4);
      const tint = random() < 0.6 ? '180,200,255' : '255,190,220';
      radial(ctx, x, y, s * (0.05 + random() * 0.14), [[0, `rgba(${tint},${0.25 + random() * 0.3})`], [1, `rgba(${tint},0)`]]);
    }
  });
}

function edgeTexture(random) {
  return canvasTexture(256, (ctx, s) => {
    const c = s / 2;
    ctx.save();
    ctx.translate(c, c);
    ctx.scale(1, 0.16);
    radial(ctx, 0, 0, s * 0.48, [[0, 'rgba(255,240,215,0.95)'], [0.3, 'rgba(220,215,255,0.45)'], [1, 'rgba(200,200,255,0)']]);
    ctx.restore();
    radial(ctx, c, c, s * 0.07, [[0, 'rgba(255,240,210,0.9)'], [1, 'rgba(255,230,200,0)']]);
    // 盤面中央的暗色塵埃帶。
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let x = s * 0.08; x < s * 0.92; x += 2) {
      ctx.fillRect(x, c - 1 + (random() - 0.5) * 1.5, 2, 2 + random() * 1.2);
    }
  });
}
