// src/core/healthServer.js
const http = require('http');
const { URL } = require('url');

function startHealthServer(port, options = {}) {
  const PORT = port || process.env.PORT || 10000;
  const notifyHandler = options.notifyHandler;

  http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/health' || url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, status: 'ok' }));
      return;
    }

    if (
      url.pathname === '/notify'
      || url.pathname === '/notify/members'
      || url.pathname === '/api/notify'
      || url.pathname === '/api/members'
    ) {
      if (typeof notifyHandler !== 'function') {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'notify_not_configured' }));
        return;
      }

      Promise.resolve(notifyHandler(req, res)).catch((err) => {
        console.error('[notify] unexpected error:', err);
        if (res.writableEnded) return;
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  }).listen(PORT, () => console.log(`✅ Health server on ${PORT}`));
}

module.exports = { startHealthServer };
