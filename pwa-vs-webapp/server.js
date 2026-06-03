const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`[Server] Request: ${req.method} ${req.url}`);

  // Normalize URL path
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

  // If path is a directory, look for index.html inside it
  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (err) {
    // File doesn't exist, will be handled below
  }

  const ext = path.extname(filePath);
  let contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Support .json or manifest.json matching
  if (filePath.endsWith('manifest.json')) {
    contentType = 'application/manifest+json';
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        console.warn(`[Server] File not found: ${filePath}`);
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 File Not Found</h1>', 'utf-8');
      } else {
        console.error(`[Server] Internal error: ${error.code}`);
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      // CRITICAL: Disable browser HTTP cache so we can truly compare offline capabilities.
      // Standard App will fail offline because browser cannot cache via HTTP.
      // PWA App will succeed offline because its Service Worker intercepts and uses Cache Storage.
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  PWA vs Web App Comparison Server is Running!`);
  console.log(`  Open: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
