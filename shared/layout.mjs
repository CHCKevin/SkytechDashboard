const palette = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee'];

export function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  }
  return value >>> 0;
}

export function positionFor(namespace, id) {
  const seed = `${namespace}:${id}`;
  const angle = hash(`${seed}:angle`) / 4294967296 * Math.PI * 2;
  const radius = 20 + hash(`${seed}:radius`) / 4294967296 * 60;
  const height = (hash(`${seed}:height`) / 4294967296 - 0.5) * 12;
  return [Math.cos(angle) * radius, height, Math.sin(angle) * radius];
}

export function colorForStatus(id, sourceColor) {
  if (typeof sourceColor === 'string' && /^#[0-9a-f]{6}$/i.test(sourceColor)) {
    return sourceColor.toLowerCase();
  }
  return id == null ? '#94a3b8' : palette[hash(String(id)) % palette.length];
}
