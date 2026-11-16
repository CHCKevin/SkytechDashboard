import { readFile } from 'node:fs/promises';

export function parseConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Config must be an object');
  }
  if (!['demo', 'live'].includes(input.mode)) throw new Error('mode must be demo or live');
  if (input.host !== undefined && input.host !== '127.0.0.1') {
    throw new Error('Only loopback host 127.0.0.1 is supported');
  }
  const port = input.port ?? 4173;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('port must be an integer from 1 to 65535');
  }
  const dailyTargetHours = input.dailyTargetHours ?? 8;
  if (typeof dailyTargetHours !== 'number' || !(dailyTargetHours > 0 && dailyTargetHours <= 24)) {
    throw new Error('dailyTargetHours must be a number greater than 0 and at most 24');
  }
  const dataDir = nonEmpty(input.dataDir ?? 'data', 'dataDir');
  const staticDir = nonEmpty(input.staticDir ?? 'web/dist', 'staticDir');
  const config = {
    mode: input.mode, host: '127.0.0.1', port, baseUrl: null, apiToken: null,
    dailyTargetHours, dataDir, staticDir,
  };
  if (input.mode === 'demo') return Object.freeze(config);
  let url;
  try { url = new URL(input.baseUrl); } catch { throw new Error('baseUrl must be a valid URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
    throw new Error('baseUrl must be an HTTP(S) origin without credentials, query, or fragment');
  }
  if (typeof input.apiToken !== 'string' || !input.apiToken.trim()) {
    throw new Error('Live mode requires apiToken');
  }
  return Object.freeze({ ...config, baseUrl: url.origin, apiToken: input.apiToken.trim() });
}

export async function loadConfig(path) {
  let raw;
  try { raw = await readFile(path, 'utf8'); }
  catch { throw new Error('Config file is missing or unreadable'); }
  let input;
  try { input = JSON.parse(raw); }
  catch { throw new Error('Config file must contain valid JSON'); }
  return parseConfig(input);
}

function nonEmpty(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value;
}
