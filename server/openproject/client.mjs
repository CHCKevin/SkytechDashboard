import { SourceError } from './errors.mjs';

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;
const RETRYABLE = new Set([429, 502, 503, 504]);
// 寫入只允許工時：建立、表單（不建立資料，用來取活動清單）、修改、刪除。
const WRITE_RULES = [
  ['POST', /^\/api\/v3\/time_entries$/],
  ['POST', /^\/api\/v3\/time_entries\/form$/],
  ['PATCH', /^\/api\/v3\/time_entries\/\d+$/],
  ['DELETE', /^\/api\/v3\/time_entries\/\d+$/],
];
const MAX_MESSAGE = 500;

// 唯一持有 token 的模組：讀取限 /api/v3，寫入僅限工時路徑；不跟隨重新導向。
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

  async function request(url, { method = 'GET', body } = {}) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    try {
      return await fetch(url, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: authorization, Accept: 'application/hal+json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: payload,
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
        if (res.ok) return readJson(res);
        await res.body?.cancel();
        // RETRYABLE 只含 429/502/503/504，不會是 3xx，重新導向一律不重試。
        if (RETRYABLE.has(res.status) && attempt < retries) {
          await sleep(retryDelay(res, attempt));
          continue;
        }
        throw statusError(res.status);
      }
    });
  }

  // 寫入不自動重試：連線中斷時結果不確定，重送可能重複建立工時。
  async function send(method, path, body) {
    const url = resolve(path);
    const allowed = url.href === url.origin + url.pathname && WRITE_RULES.some(([m, pattern]) => m === method && pattern.test(url.pathname));
    if (!allowed) throw new SourceError('unsafe_write');
    return limit(async () => {
      const res = await request(url, { method, body });
      if (res.status === 204) return null;
      if (res.ok) {
        // 請求已被接受，結果讀不到時不能讓呼叫端當成一般失敗而重送。
        try { return await res.json(); } catch { throw new SourceError('write_unconfirmed'); }
      }
      if (res.status === 422) throw new SourceError('validation', await validationMessage(res));
      await res.body?.cancel();
      throw statusError(res.status);
    });
  }

  // 讀完所有分頁才回傳；讀取期間資料變動會讓頁面位移，因此不一致時整輪重讀一次，仍不一致才回報，不悄悄截斷。
  async function getAll(path, params = {}) {
    for (let attempt = 0; ; attempt += 1) {
      const { elements, total } = await readPages(path, params);
      if (isConsistent(elements, total)) return elements;
      if (attempt >= 1) throw new SourceError('pagination_incomplete');
    }
  }

  async function readPages(path, params) {
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
    return { elements, total };
  }

  return { getJson, getAll, send };
}

async function readJson(res) {
  try {
    return await res.json();
  } catch (error) {
    // 只有 JSON 解析失敗才是格式問題；讀取中斷屬於連線問題。
    if (error?.name === 'SyntaxError') throw new SourceError('invalid_response');
    throw new SourceError(error?.name === 'TimeoutError' ? 'timeout' : 'network');
  }
}

function statusError(status) {
  if (status >= 300 && status < 400) return new SourceError('unexpected_redirect');
  if (status === 401) return new SourceError('unauthorized');
  if (status === 403) return new SourceError('forbidden');
  if (status === 404) return new SourceError('not_found');
  return new SourceError(status === 429 ? 'rate_limited' : 'upstream_error');
}

// 只取 OpenProject 錯誤物件中的 message 字串（多筆時用全形分號合併），其他欄位一律丟棄。
async function validationMessage(res) {
  let body;
  try { body = await res.json(); } catch { return undefined; }
  const nested = Array.isArray(body?._embedded?.errors) ? body._embedded.errors.map(error => error?.message) : [];
  const texts = nested.filter(text => typeof text === 'string' && text);
  const parts = texts.length ? texts : [body?.message].filter(text => typeof text === 'string' && text);
  return parts.join('；').slice(0, MAX_MESSAGE) || undefined;
}

function isConsistent(elements, total) {
  const ids = elements.map(element => element?.id).filter(id => id !== undefined && id !== null);
  return (total === null || elements.length === total) && new Set(ids).size === ids.length;
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
