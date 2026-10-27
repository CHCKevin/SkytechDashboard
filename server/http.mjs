import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { defaultCsp } from './csp.mjs';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function createHandler({ source, mode, staticFiles = {} }) {
  return async (req, res) => {
    try {
      await route(req, res, { source, mode, staticFiles });
    } catch (error) {
      // 只記錄白名單欄位，不記錄訊息或堆疊：第四階段的來源錯誤可能含 token 或來源回應。
      console.error('Request failed:', req.method, safePathname(req.url), error?.name ?? 'Error');
      if (res.headersSent) res.destroy();
      else sendError(req, res, 500, 'internal_error', '伺服器內部錯誤');
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

async function route(req, res, { source, mode, staticFiles }) {
  const port = req.socket.localPort;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host?.toLowerCase())) {
    return sendError(req, res, 403, 'forbidden_host', '只接受本機位址存取');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendError(req, res, 405, 'method_not_allowed', '僅支援 GET 與 HEAD');
  }
  if (!isOriginForm(req.url)) {
    return sendError(req, res, 400, 'invalid_request_target', '請求路徑格式不正確');
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  const refresh = url.searchParams.get('refresh') === '1';
  if (url.pathname === '/api/health') {
    return sendJson(req, res, 200, { status: 'ok', mode });
  }
  if (url.pathname === '/api/snapshot') {
    return sendJson(req, res, 200, await source.getSnapshot({ refresh }));
  }
  const match = url.pathname.match(/^\/api\/work-packages\/([^/]+)\/participants$/);
  if (match) {
    if (!/^\d+$/.test(match[1])) return sendError(req, res, 400, 'invalid_id', '工作項目 ID 格式不正確');
    const result = await source.getParticipants(match[1], { refresh });
    if (!result) return sendError(req, res, 404, 'work_package_not_found', '找不到工作項目');
    return sendJson(req, res, 200, result);
  }
  // 白名單以正規化後的完整路徑比對，不組合檔案路徑，因此不存在目錄穿越。
  if (Object.hasOwn(staticFiles, url.pathname)) {
    const file = staticFiles[url.pathname];
    return send(req, res, 200, file.type, await readFile(file.path), file.csp);
  }
  return sendError(req, res, 404, 'not_found', '找不到資源');
}

// 只接受 origin-form；'//'、絕對形式與反斜線會讓 URL 解析改變主機或路徑。
function isOriginForm(target) {
  return target.startsWith('/') && !target.startsWith('//') && !target.includes('\\');
}

function safePathname(target) {
  if (!isOriginForm(target)) return '-';
  try {
    return new URL(target, 'http://127.0.0.1').pathname;
  } catch {
    return '-';
  }
}

function send(req, res, status, type, body, csp = defaultCsp) {
  res.writeHead(status, {
    ...baseHeaders, 'Content-Security-Policy': csp, 'Content-Type': type, 'Content-Length': body.length,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendJson(req, res, status, data) {
  send(req, res, status, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(data)));
}

function sendError(req, res, status, code, message) {
  sendJson(req, res, status, { error: { code, message } });
}
