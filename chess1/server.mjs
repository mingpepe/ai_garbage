import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const STATE_FILE = path.join(__dirname, 'current_state.json');
const ADVICE_FILE = path.join(__dirname, 'ai_advice.json');
const ADVICE_BASENAME = path.basename(ADVICE_FILE);
const HELP_REQUEST_FILE = path.join(__dirname, 'help_request.json');
const REVIEW_REQUEST_FILE = path.join(__dirname, 'review_request.json');
const REVIEW_FILE = path.join(__dirname, 'ai_review.json');
const REVIEW_BASENAME = path.basename(REVIEW_FILE);

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

// Delete stale advice and help request files on server startup
function removeAdviceFile() {
  try {
    if (fs.existsSync(ADVICE_FILE)) {
      fs.unlinkSync(ADVICE_FILE);
    }
  } catch (err) {
    console.warn('Failed to remove advice file:', err.message);
  }
}

function removeHelpRequestFile() {
  try {
    if (fs.existsSync(HELP_REQUEST_FILE)) {
      fs.unlinkSync(HELP_REQUEST_FILE);
    }
  } catch (err) {
    console.warn('Failed to remove help request file:', err.message);
  }
}

function removeReviewFiles() {
  for (const f of [REVIEW_REQUEST_FILE, REVIEW_FILE]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (err) {
      console.warn('Failed to remove review file:', err.message);
    }
  }
}

removeAdviceFile();
removeHelpRequestFile();
removeReviewFiles();

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

// Watch ai_advice.json and ai_review.json (fast write_file path): broadcast via SSE and delete immediately
let adviceWatchDebounce = null;
let reviewWatchDebounce = null;
fs.watch(__dirname, (eventType, filename) => {
  if (filename === ADVICE_BASENAME) {
    if (adviceWatchDebounce) clearTimeout(adviceWatchDebounce);
    adviceWatchDebounce = setTimeout(() => {
      if (!fs.existsSync(ADVICE_FILE)) return;
      try {
        const raw = fs.readFileSync(ADVICE_FILE, 'utf-8').trim();
        if (!raw) return;
        const parsed = JSON.parse(raw);
        removeAdviceFile();
        broadcastAdvice(parsed);
      } catch {
        // Ignore transient partial-write JSON parse errors
      }
    }, 40);
  } else if (filename === REVIEW_BASENAME) {
    if (reviewWatchDebounce) clearTimeout(reviewWatchDebounce);
    reviewWatchDebounce = setTimeout(() => {
      if (!fs.existsSync(REVIEW_FILE)) return;
      try {
        const raw = fs.readFileSync(REVIEW_FILE, 'utf-8').trim();
        if (!raw) return;
        const parsed = JSON.parse(raw);
        try { fs.unlinkSync(REVIEW_FILE); } catch {}
        broadcastAdvice({ type: 'game-review', ...parsed });
      } catch {
        // Ignore transient partial-write JSON parse errors
      }
    }, 40);
  }
});

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

  // Reset advice & help request files when starting a new game
  if (req.method === 'POST' && urlPath === '/api/reset') {
    removeAdviceFile();
    removeHelpRequestFile();
    removeReviewFiles();
    broadcastAdvice({ cleared: true });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Receive post-game AI review request from UI and write review_request.json
  if (req.method === 'POST' && urlPath === '/api/review') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const payload = {
          requestId: Date.now().toString(36),
          requestedAt: new Date().toISOString(),
          ...parsed
        };
        fs.writeFileSync(REVIEW_REQUEST_FILE, JSON.stringify(payload, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, requestId: payload.requestId }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
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
