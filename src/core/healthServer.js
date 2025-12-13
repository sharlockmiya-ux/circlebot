// src/core/healthServer.js
const http = require('http');

function startHealthServer(port) {
  const PORT = port || process.env.PORT || 10000;

  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  }).listen(PORT, () => console.log(`✅ Health server on ${PORT}`));
}

module.exports = { startHealthServer };
