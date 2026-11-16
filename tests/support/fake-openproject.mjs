import { createServer } from 'node:http';

// 本機假 OpenProject：routes(url, req) 回傳 { status, body, headers, delayMs }，並記錄每個請求。
export async function startFake(routes) {
  const requests = [];
  const stats = { maxActive: 0 };
  let active = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fake');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    requests.push({ method: req.method, path: url.pathname, search: url.searchParams, headers: req.headers, body });
    active += 1;
    stats.maxActive = Math.max(stats.maxActive, active);
    try {
      const reply = (await routes(url, req, body)) ?? { status: 404, body: {} };
      if (reply.delayMs) await new Promise(resolve => setTimeout(resolve, reply.delayMs));
      if (reply.status === 204) {
        res.writeHead(204);
        res.end();
        return;
      }
      const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
      res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/hal+json', ...reply.headers });
      res.end(text);
    } finally {
      active -= 1;
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    requests,
    stats,
    close: () => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

export function collection(elements, { total = elements.length, next = null } = {}) {
  return {
    _type: 'Collection', total, count: elements.length,
    _embedded: { elements },
    _links: next ? { nextByOffset: { href: next } } : {},
  };
}
