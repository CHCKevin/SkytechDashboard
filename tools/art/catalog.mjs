// 像素資產目錄：npm run art:catalog
// 產生 art-out/：每個樣本的原生大小 PNG、組合場景、16 人並排、catalog.json 與 index.html。
// 加上 --update-golden 會把目前的指紋寫回 web/src/art/golden.json（刻意改外觀時才用）。
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { character, renderCharacter } from '../../web/src/art/assets/character.js';
import { chair, table } from '../../web/src/art/assets/furniture.js';
import { plant } from '../../web/src/art/assets/plant.js';
import { CASES, renderCase } from '../../web/src/art/cases.js';
import { compose, fingerprint, flatten, render } from '../../web/src/art/engine.js';
import { backgroundPlacements, frontPlacements } from '../../web/src/lib/hall-art.js';
import { SCENE_SIZE, SEAT_GROUPS, SEAT_SPOTS, assignSeats } from '../../web/src/lib/seats.js';
import { PALETTE, RAMPS, STYLE_VERSION } from '../../web/src/art/style.js';
import { validate } from '../../web/src/art/validate.js';
import { encodeIndexedPng } from './png.mjs';

const root = new URL('../../', import.meta.url);
const outDir = fileURLToPath(new URL('art-out/', root));
const goldenPath = fileURLToPath(new URL('web/src/art/golden.json', root));
const SCALES = [1, 2, 3];

const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
// 只清空內容、不刪資料夾：Windows 上資料夾被檔案總管或瀏覽器開著時刪不掉。
mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(outDir)) rmSync(`${outDir}${name}`, { recursive: true, force: true });

const writePng = (name, image) => writeFileSync(`${outDir}${name}.png`, encodeIndexedPng(image, PALETTE));

const entries = CASES.map(c => {
  const result = renderCase(c);
  writePng(c.name, { width: result.width, height: result.height, pixels: flatten(result) });
  const hash = fingerprint(result);
  return {
    name: c.name,
    id: c.asset.id,
    version: c.asset.version,
    styleVersion: STYLE_VERSION,
    size: [result.width, result.height],
    anchor: result.anchor,
    variant: c.variant,
    seed: c.seed ?? 0,
    colors: new Set(flatten(result).filter(Boolean)).size,
    hash,
    changed: golden[c.name] !== hash,
    issues: validate(result, c.asset),
  };
});

// 組合預覽：人坐在桌子後方、人坐在椅子上、空椅子、盆栽。
// 整個大廳：16 位成員（使用者 1–16，三種狀態輪流），依實際的位子分配與圖層順序。
const hallMembers = Array.from({ length: 16 }, (_, i) => ({ userId: i + 1, status: ['working', 'idle', 'resting'][i % 3] }));
const seated = assignSeats(hallMembers);
const hallPlacements = [
  ...backgroundPlacements(),
  ...SEAT_GROUPS.flatMap(group => [
    ...group.seats.filter(id => seated[id]).map(id => ({
      result: renderCharacter(seated[id].userId, seated[id].status), x: SEAT_SPOTS[id][0], y: SEAT_SPOTS[id][1],
    })),
    ...frontPlacements(group.name),
  ]),
];

const scenes = [
  {
    name: 'hall-full',
    note: '整個大廳，16 位成員坐滿（不含名牌與狀態圖示，那些由網頁另外畫）',
    image: compose(SCENE_SIZE[0], SCENE_SIZE[1], hallPlacements),
  },
  {
    name: 'hall-empty',
    note: '空的大廳：吧檯高腳椅、工作桌椅背、沙發都看得到',
    image: compose(SCENE_SIZE[0], SCENE_SIZE[1], [...backgroundPlacements(), ...SEAT_GROUPS.flatMap(group => frontPlacements(group.name))]),
  },
  {
    name: 'scene-table',
    note: '人坐在桌子後方（桌子畫在人之上）、盆栽、空椅子',
    image: compose(72, 40, [
      { result: render(plant, { variant: { leaf: 'bush' } }), x: 2, y: 24 },
      { result: renderCharacter(12), x: 24, y: 6 },
      { result: render(table), x: 16, y: 20 },
      { result: render(chair), x: 56, y: 24 },
    ]),
  },
  {
    name: 'scene-chair',
    note: '人坐在椅子上（椅子畫在人之下，正面幾乎被身體擋住；空位時才看得到整張椅子）：工作中、休息',
    image: compose(48, 40, [
      { result: render(chair), x: 6, y: 22 },
      { result: renderCharacter(11), x: 4, y: 14 },
      { result: render(chair, { variant: { wood: 'wood_walnut' } }), x: 30, y: 22 },
      { result: renderCharacter(13, 'resting'), x: 28, y: 14 },
    ]),
  },
  {
    name: 'crowd',
    note: '使用者編號 1–16，同時看 16 個人是否分得出來',
    image: compose(4 * 18, 4 * 26, Array.from({ length: 16 }, (_, i) => ({
      result: renderCharacter(i + 1), x: (i % 4) * 18 + 1, y: Math.floor(i / 4) * 26 + 1,
    }))),
  },
  {
    name: 'statuses',
    note: '同一個人的三種狀態：工作中、發呆、休息（動畫在第 4 階段）',
    image: compose(54, 26, character.variants.status.map((status, i) => ({
      result: renderCharacter(14, status), x: i * 18 + 1, y: 1,
    }))),
  },
];
for (const scene of scenes) writePng(scene.name, scene.image);

const catalog = {
  styleVersion: STYLE_VERSION,
  paletteSize: PALETTE.length - 1,
  generatedAt: new Date().toISOString(),
  assets: entries,
};
writeFileSync(`${outDir}catalog.json`, `${JSON.stringify(catalog, null, 2)}\n`);

if (process.argv.includes('--update-golden')) {
  const next = Object.fromEntries(entries.map(entry => [entry.name, entry.hash]));
  writeFileSync(goldenPath, `${JSON.stringify(next, null, 2)}\n`);
}

// ---- index.html ----
const escape = text => String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const floor = PALETTE[RAMPS.floor[1]];
const images = (name, width, height) => SCALES.map(scale =>
  `<figure><img src="${name}.png" width="${width * scale}" height="${height * scale}" alt="${name} ${scale}x"><figcaption>${scale}×</figcaption></figure>`).join('');
const swatches = PALETTE.slice(1).map(hex => `<i title="${hex}" style="background:${hex}"></i>`).join('');

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>像素資產目錄</title>
<style>
  body { margin: 0; padding: 16px; background: #24150b; color: #f1e2b8; font: 14px/1.5 monospace; }
  h1, h2 { font-weight: normal; }
  img { image-rendering: pixelated; display: block; }
  figure { margin: 0; display: inline-block; vertical-align: bottom; text-align: center; }
  figcaption { font-size: 11px; opacity: 0.7; }
  .card { display: inline-block; vertical-align: top; margin: 0 12px 16px 0; padding: 8px; border: 2px solid #5e3a21; }
  .row { display: flex; gap: 12px; align-items: flex-end; padding: 8px; }
  .floor { background: ${floor}; }
  .dark { background: #120a05; }
  .light { background: #f1e2b8; }
  .changed { color: #ffd166; }
  .bad { color: #ff8a80; }
  .ok { color: #9be38f; }
  .palette i { display: inline-block; width: 14px; height: 14px; margin: 1px; }
</style>
</head>
<body>
<h1>像素資產目錄</h1>
<p>風格版本 ${STYLE_VERSION}，調色盤 ${PALETTE.length - 1} 色。產生時間 ${escape(catalog.generatedAt)}。<br>
「與黃金指紋不同」表示外觀和 web/src/art/golden.json 記錄的不一樣。審查清單見 docs/pixel-art/06-acceptance-criteria.md 第四節。</p>
<div class="palette">${swatches}</div>

<h2>組合預覽</h2>
${scenes.map(scene => `<div class="card"><div>${escape(scene.name)}：${escape(scene.note)}</div>
<div class="row floor">${images(scene.name, scene.image.width, scene.image.height)}</div></div>`).join('\n')}

<h2>單一資產</h2>
${entries.map(entry => `<div class="card">
<div>${escape(entry.name)}　<small>${escape(entry.id)} v${entry.version}　${entry.size.join('×')}　${entry.colors} 色　${entry.hash}</small></div>
<div>${entry.changed ? '<span class="changed">與黃金指紋不同</span>' : '<span class="ok">與黃金指紋相同</span>'}　${entry.issues.length
    ? `<span class="bad">驗證問題 ${entry.issues.length}：${escape(entry.issues.map(issue => issue.message).join('；'))}</span>`
    : '<span class="ok">驗證通過</span>'}</div>
<div class="row floor">${images(entry.name, ...entry.size)}</div>
<div class="row dark">${images(entry.name, ...entry.size)}</div>
<div class="row light">${images(entry.name, ...entry.size)}</div>
</div>`).join('\n')}
</body>
</html>
`;
writeFileSync(`${outDir}index.html`, html);

const problems = entries.filter(entry => entry.issues.length);
const changed = entries.filter(entry => entry.changed);
console.log(`已輸出 ${entries.length} 個資產、${scenes.length} 張組合預覽到 ${outDir}`);
console.log(`驗證問題：${problems.length ? problems.map(entry => entry.name).join(', ') : '無'}`);
console.log(`與黃金指紋不同：${changed.length ? changed.map(entry => entry.name).join(', ') : '無'}`);
if (process.argv.includes('--update-golden')) console.log('已更新 web/src/art/golden.json');
if (problems.length) process.exitCode = 1;
