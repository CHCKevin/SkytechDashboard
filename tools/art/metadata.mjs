// 目錄中每個樣本的 metadata（docs/pixel-art/06 的 A15）。
import { fingerprint, flatten } from '../../web/src/art/engine.js';
import { STYLE_VERSION } from '../../web/src/art/style.js';
import { validate } from '../../web/src/art/validate.js';

export const METADATA_FIELDS = ['name', 'id', 'version', 'styleVersion', 'size', 'anchor', 'variant', 'seed', 'colors', 'hash', 'changed', 'issues'];

export function describeCase(c, result, golden = {}) {
  const hash = fingerprint(result);
  return {
    name: c.name,
    id: c.asset.id,
    version: c.asset.version,
    styleVersion: STYLE_VERSION,
    size: [result.width, result.height],
    anchor: result.anchor,
    variant: c.variant ?? {},
    seed: c.seed ?? 0,
    colors: new Set(flatten(result).filter(Boolean)).size,
    hash,
    changed: golden[c.name] !== hash,
    issues: validate(result, c.asset),
  };
}
