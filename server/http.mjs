import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { SourceError, errorInfo, statusFor } from './openproject/errors.mjs';
import { HallFullError, HallStoreError } from './hall.mjs';
import { buildHall } from './hall-status.mjs';
import { QuestStoreError } from './quests.mjs';
import { InputError, parseDate, parseEntryInput, parseHallMemberInput, parsePathId, parseQuestInput, parseSearchTerm } from './validate.mjs';

// Vite 產物沒有 inline script 與 import map，因此用固定 CSP。
export const CSP = "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const MAX_BODY = 16 * 1024;
const baseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP, 'Cross-Origin-Resource-Policy': 'same-origin' };

class HttpError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

// 路由表：[方法, 路徑樣式, 處理函式]；同一路徑有多個方法時，405 的 Allow 依此產生。
function routes({ source, quests, hall, mode, dailyTargetHours, leaveWorkPackageId, openProjectUrl }) {
  return [
    ['GET', /^\/api\/health$/, () => ({ body: { status: 'ok', mode } })],
    ['GET', /^\/api\/me$/, async () => ({ body: await source.getMe() })],
    // 只有 origin（不含 token），前端用來組 OpenProject 報表連結；示例模式為 null。
    ['GET', /^\/api\/config$/, () => ({ body: { dailyTargetHours, openProjectUrl } })],
    ['GET', /^\/api\/time-entries$/, async ({ url }) => ({ body: await source.listEntries(parseDate(url.searchParams.get('date'))) })],
    ['POST', /^\/api\/time-entries$/, async ({ readBody }) => ({ status: 201, body: await source.createEntry(parseEntryInput(await readBody())) })],
    ['PATCH', /^\/api\/time-entries\/([^/]+)$/, async ({ match, readBody }) => {
      const id = parsePathId(match[1], 'id');
      return { body: await source.updateEntry(id, parseEntryInput(await readBody(), { partial: true })) };
    }],
    ['DELETE', /^\/api\/time-entries\/([^/]+)$/, async ({ match }) => {
      await source.deleteEntry(parsePathId(match[1], 'id'));
      return { status: 204 };
    }],
    ['GET', /^\/api\/work-packages\/search$/, async ({ url }) => ({ body: await source.searchWorkPackages(parseSearchTerm(url.searchParams.get('q'))) })],
    ['GET', /^\/api\/activities$/, async ({ url }) => ({ body: await source.listActivities(parsePathId(url.searchParams.get('workPackageId') ?? '', 'workPackageId')) })],
    ['GET', /^\/api\/quests$/, async () => ({ body: await quests.list() })],
    ['POST', /^\/api\/quests$/, async ({ readBody }) => {
      const { workPackageId, activityId } = parseQuestInput(await readBody());
      const wp = await source.getWorkPackage(workPackageId);
      let activityName = null;
      if (activityId !== null) {
        const activity = (await source.listActivities(workPackageId)).find(item => item.id === activityId);
        if (!activity) throw new InputError('activityId', '此 work package 不能使用這個活動類型');
        activityName = activity.name;
      }
      return { body: await quests.upsert({ workPackageId, subject: wp.subject, activityId, activityName }) };
    }],
    ['DELETE', /^\/api\/quests\/([^/]+)$/, async ({ match }) => ({ body: await quests.remove(parsePathId(match[1], 'workPackageId')) })],
    ['GET', /^\/api\/users\/search$/, async ({ url }) => ({ body: await source.searchUsers(parseSearchTerm(url.searchParams.get('q'))) })],
    // 大廳只讀取 OpenProject：成員名單存本機，當日工時一次查詢取回後在這裡判定狀態。
    ['GET', /^\/api\/hall$/, async ({ url }) => {
      const date = parseDate(url.searchParams.get('date'));
      const members = await hall.list();
      const entries = await source.listEntriesForUsers(date, members.map(member => member.userId));
      return { body: buildHall(date, members, entries, leaveWorkPackageId) };
    }],
    ['POST', /^\/api\/hall\/members$/, async ({ readBody }) => {
      const { userId } = parseHallMemberInput(await readBody());
      const user = await source.getUser(userId);
      return { body: await hall.add({ userId: user.id, name: user.name }) };
    }],
    ['DELETE', /^\/api\/hall\/members\/([^/]+)$/, async ({ match }) => ({ body: await hall.remove(parsePathId(match[1], 'userId')) })],
  ];
}

export function createHandler({ source, quests, hall, mode, dailyTargetHours, leaveWorkPackageId, openProjectUrl = null, staticFiles = {} }) {
  const table = routes({ source, quests, hall, mode, dailyTargetHours, leaveWorkPackageId, openProjectUrl });
  return async (req, res) => {
    try {
      await route(req, res, table, staticFiles);
    } catch (error) {
      handleError(req, res, error);
    }
  };
}

export function listen(handler, { host, port }) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

async function route(req, res, table, staticFiles) {
  const port = req.socket.localPort;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host?.toLowerCase())) {
    throw new HttpError(403, 'forbidden_host', '只接受本機位址存取');
  }
  if (!isOriginForm(req.url)) throw new HttpError(400, 'invalid_request_target', '請求路徑格式不正確');
  const url = new URL(req.url, 'http://127.0.0.1');

  if (url.pathname.startsWith('/api/')) {
    // 縱深防禦：瀏覽器明確標示為跨站的請求（含 GET）一律拒絕。
    if (req.headers['sec-fetch-site']?.toLowerCase() === 'cross-site') {
      throw new HttpError(403, 'csrf_rejected', '拒絕跨站請求');
    }
    const candidates = table.filter(([, pattern]) => pattern.test(url.pathname));
    if (!candidates.length) throw new HttpError(404, 'not_found', '找不到資源');
    const found = candidates.find(([method]) => method === req.method);
    if (!found) {
      throw new HttpError(405, 'method_not_allowed', '不支援此方法', { Allow: candidates.map(([method]) => method).join(', ') });
    }
    if (req.method !== 'GET') assertSameSiteWrite(req, port);
    const [, pattern, handler] = found;
    const result = await handler({ url, match: url.pathname.match(pattern), readBody: () => readJsonBody(req) });
    if (result.status === 204) {
      res.writeHead(204, baseHeaders);
      return res.end();
    }
    return sendJson(req, res, result.status ?? 200, result.body);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new HttpError(405, 'method_not_allowed', '僅支援 GET 與 HEAD', { Allow: 'GET, HEAD' });
  }
  // 白名單以正規化後的完整路徑比對，不組合檔案路徑，因此不存在目錄穿越。
  if (!Object.hasOwn(staticFiles, url.pathname)) throw new HttpError(404, 'not_found', '找不到資源');
  const file = staticFiles[url.pathname];
  let content;
  try {
    content = await readFile(file.path);
  } catch (error) {
    // 啟動後檔案被刪除：當作不存在，而不是 500。
    if (error?.code === 'ENOENT') throw new HttpError(404, 'not_found', '找不到資源');
    throw error;
  }
  return send(req, res, 200, file.type, content);
}

// CSRF：跨站表單無法加自訂標頭；若瀏覽器帶 Origin，必須是本服務自己的位址。
function assertSameSiteWrite(req, port) {
  const origin = req.headers.origin;
  const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  if (req.headers['x-quest-board'] !== '1' || (origin !== undefined && !allowed.includes(origin.toLowerCase()))) {
    throw new HttpError(403, 'csrf_rejected', '拒絕來源不明的寫入請求');
  }
}

// 用 data/end 讀完整個本體（超過上限的部分直接丟棄）再回應：
// 在 for await 迴圈中丟錯會銷毀請求串流與連線，用戶端只會看到連線重設，收不到 413。
function readJsonBody(req) {
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
    return Promise.reject(new HttpError(415, 'unsupported_media_type', '請求內容必須是 JSON'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(new HttpError(413, 'payload_too_large', '請求內容過大'));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'invalid_json', '請求內容不是有效的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function handleError(req, res, error) {
  // 用戶端已中斷（例如本體傳到一半就斷線）：沒有人可回應，也不必記錄。
  // （讀完本體後 req 也會自動 destroyed，所以要搭配 req.complete 判斷是否為中斷。）
  if ((req.destroyed && !req.complete) || res.destroyed || res.writableEnded) return;
  if (res.headersSent) return res.destroy();
  if (error instanceof HttpError) {
    for (const [name, value] of Object.entries(error.headers)) res.setHeader(name, value);
    // 415 時沒有讀取請求本體，回應後關閉連線，避免殘留本體干擾同一連線的下一個請求。
    if (error.status === 415) res.setHeader('Connection', 'close');
    return sendError(req, res, error.status, { code: error.code, message: error.message });
  }
  if (error instanceof InputError) {
    return sendError(req, res, 400, { code: error.code, message: error.message, field: error.field });
  }
  if (error instanceof SourceError) return sendError(req, res, statusFor(error.code), errorInfo(error));
  if (error instanceof HallFullError) return sendError(req, res, 409, { code: error.code, message: error.message });
  if (error instanceof QuestStoreError || error instanceof HallStoreError) {
    console.error(error instanceof QuestStoreError ? 'Quest store error:' : 'Hall store error:', error.code);
    return sendError(req, res, 500, { code: error.code, message: error.message });
  }
  // 只記錄白名單欄位，不記錄訊息或堆疊：來源錯誤可能含 token 或來源回應。
  console.error('Request failed:', req.method, safePathname(req.url), error?.name ?? 'Error');
  return sendError(req, res, 500, errorInfo(error));
}

// 只接受 origin-form；'//'、絕對形式與反斜線會讓 URL 解析改變主機或路徑。
function isOriginForm(target) {
  return target.startsWith('/') && !target.startsWith('//') && !target.includes('\\');
}

function safePathname(target) {
  if (!isOriginForm(target)) return '-';
  try { return new URL(target, 'http://127.0.0.1').pathname; } catch { return '-'; }
}

function send(req, res, status, type, body) {
  res.writeHead(status, { ...baseHeaders, 'Content-Type': type, 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendJson(req, res, status, data) {
  send(req, res, status, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(data)));
}

function sendError(req, res, status, error) {
  sendJson(req, res, status, { error });
}
