import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const STATE_FILE = path.join(__dirname, 'current_state.json');
const ADVICE_FILE = path.join(__dirname, 'ai_advice.json');
const ADVICE_BASENAME = path.basename(ADVICE_FILE);

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

// Delete stale advice file on server startup
function removeAdviceFile() {
  try {
    if (fs.existsSync(ADVICE_FILE)) {
      fs.unlinkSync(ADVICE_FILE);
    }
  } catch (err) {
    console.warn('Failed to remove advice file:', err.message);
  }
}

removeAdviceFile();

// Connected SSE clients
const sseClients = new Set();

function broadcastAdvice(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Event-driven file watcher (no polling) on directory to handle both creation & modification
let watchDebounce = null;
fs.watch(__dirname, (eventType, filename) => {
  if (filename !== ADVICE_BASENAME) return;
  if (watchDebounce) clearTimeout(watchDebounce);
  watchDebounce = setTimeout(() => {
    if (!fs.existsSync(ADVICE_FILE)) {
      broadcastAdvice({ cleared: true });
      return;
    }
    try {
      const raw = fs.readFileSync(ADVICE_FILE, 'utf-8').trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      broadcastAdvice(parsed);
    } catch {
      // Ignore transient partial-write JSON parse errors
    }
  }, 50);
});

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  // SSE stream for real-time AI advice arrows
  if (req.method === 'GET' && urlPath === '/api/advice/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(':\n\n');
    sseClients.add(res);

    if (fs.existsSync(ADVICE_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(ADVICE_FILE, 'utf-8'));
        res.write(`data: ${JSON.stringify(parsed)}\n\n`);
      } catch {}
    }

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Reset advice file when starting a new game
  if (req.method === 'POST' && urlPath === '/api/reset') {
    removeAdviceFile();
    broadcastAdvice({ cleared: true });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
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
  console.log(`Watching AI advice file: ${ADVICE_FILE}`);
});
