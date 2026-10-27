import { SourceError } from './errors.mjs';

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;
const RETRYABLE = new Set([429, 502, 503, 504]);

// 唯一持有 token 的模組：只發 GET、只送往設定來源的 /api/v3，不跟隨重新導向。
export function createClient({
  baseUrl, apiToken, timeoutMs = 10_000, retries = 2, maxConcurrent = 4,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  const origin = new URL(baseUrl).origin;
  const authorization = `Basic ${Buffer.from(`apikey:${apiToken}`).toString('base64')}`;
  const limit = createLimiter(maxConcurrent);

  function resolve(pathOrHref) {
    const url = new URL(pathOrHref, origin);
    const inApi = url.pathname === '/api/v3' || url.pathname.startsWith('/api/v3/');
    if (url.origin !== origin || !inApi) throw new SourceError('unsafe_link');
    return url;
  }

  async function request(url) {
    try {
      return await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: authorization, Accept: 'application/hal+json' },
      });
    } catch (error) {
      throw new SourceError(error?.name === 'TimeoutError' ? 'timeout' : 'network');
    }
  }

  async function getJson(pathOrHref) {
    const url = resolve(pathOrHref);
    return limit(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const res = await request(url);
        if (res.ok) {
          try {
            return await res.json();
          } catch (error) {
            throw new SourceError(error?.name === 'TimeoutError' ? 'timeout' : 'invalid_response');
          }
        }
        await res.body?.cancel();
        if (res.status >= 300 && res.status < 400) throw new SourceError('unexpected_redirect');
        if (res.status === 401) throw new SourceError('unauthorized');
        if (res.status === 403) throw new SourceError('forbidden');
        if (res.status === 404) throw new SourceError('not_found');
        if (RETRYABLE.has(res.status) && attempt < retries) {
          await sleep(retryDelay(res, attempt));
          continue;
        }
        throw new SourceError(res.status === 429 ? 'rate_limited' : 'upstream_error');
      }
    });
  }

  // 讀完所有分頁才回傳；重複、越界或筆數不符一律視為錯誤，不悄悄截斷。
  async function getAll(path, params = {}) {
    const first = resolve(path);
    for (const [key, value] of Object.entries({ pageSize: PAGE_SIZE, offset: 1, ...params })) {
      first.searchParams.set(key, value);
    }
    const elements = [];
    const seen = new Set();
    let next = first.href;
    let total = null;
    while (next) {
      if (seen.has(next)) throw new SourceError('pagination_loop');
      if (seen.size >= MAX_PAGES) throw new SourceError('pagination_incomplete');
      seen.add(next);
      const page = await getJson(next);
      const items = page?._embedded?.elements;
      if (!Array.isArray(items)) throw new SourceError('invalid_response');
      elements.push(...items);
      if (Number.isInteger(page.total)) total = page.total;
      const href = page._links?.nextByOffset?.href;
      next = href ? resolve(href).href : null;
    }
    if (total !== null && elements.length !== total) throw new SourceError('pagination_incomplete');
    return elements;
  }

  return { getJson, getAll };
}

function retryDelay(res, attempt) {
  const header = res.headers.get('retry-after');
  if (header !== null && /^\d+$/.test(header.trim())) return Math.min(Number(header) * 1000, 10_000);
  return Math.min(500 * 2 ** attempt, 5_000);
}

function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => {
      active -= 1;
      next();
    });
  };
  return task => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    next();
  });
}
