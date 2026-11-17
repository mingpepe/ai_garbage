import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const STATE_FILE = path.join(__dirname, 'current_state.json');
const HELP_REQUEST_FILE = path.join(__dirname, 'help_request.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Delete stale help request file on server startup
function removeHelpRequestFile() {
  try {
    if (fs.existsSync(HELP_REQUEST_FILE)) {
      fs.unlinkSync(HELP_REQUEST_FILE);
    }
  } catch (err) {
    console.warn('Failed to remove help request file:', err.message);
  }
}

removeHelpRequestFile();

// Connected SSE clients
const sseClients = new Set();

function broadcastAdvice(payload) {
  const tag = payload.status ? `status=${payload.status}` : (payload.cleared ? 'cleared' : `advice=${payload.san || `${payload.from}->${payload.to}`}`);
  console.log(`[${new Date().toISOString()}] [SSE -> UI] (${sseClients.size} clients) ${tag}`);
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch {
      sseClients.delete(res);
    }
  }
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] [API <-] ${req.method} ${urlPath}`);
  }

  // SSE stream for real-time AI advice arrows
  if (req.method === 'GET' && urlPath === '/api/advice/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(':\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Reset help request file when starting a new game
  if (req.method === 'POST' && urlPath === '/api/reset') {
    removeHelpRequestFile();
    broadcastAdvice({ cleared: true });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Receive "Ask AI for Help" from UI and write help_request.json
  if (req.method === 'POST' && urlPath === '/api/help') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const payload = {
          requestId: Date.now().toString(36),
          requestedAt: new Date().toISOString(),
          ...parsed
        };
        fs.writeFileSync(HELP_REQUEST_FILE, JSON.stringify(payload, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, requestId: payload.requestId }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // CLI AI acknowledges receipt of help_request.json -> notify UI via SSE
  if (req.method === 'POST' && urlPath === '/api/help/ack') {
    removeHelpRequestFile();
    broadcastAdvice({
      status: 'analyzing',
      message: '🤖 AI 已收到請求，正在分析盤面...'
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // CLI AI directly posts advice JSON -> broadcast immediately via SSE (no disk I/O)
  if (req.method === 'POST' && urlPath === '/api/advice') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        broadcastAdvice(parsed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/state') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.writeFileSync(STATE_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/state') {
    if (fs.existsSync(STATE_FILE)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(STATE_FILE, 'utf-8'));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No state recorded yet' }));
    }
    return;
  }

  // Static file serving
  const safePath = path.normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Chess Master server running at http://localhost:${PORT}`);
  console.log(`Live game state syncing to: ${STATE_FILE}`);
});
