const CACHE_NAME = 'pwa-notes-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

// Helper to send logs back to the webpage client
async function sendLogToClients(type, message) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SW_LOG',
      logType: type,
      message: message
    });
  });
}

// 1. Install Event: Cache all essential app shell files
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching App Shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Force activation
  );
});

// 2. Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Fully active and claiming clients');
      return self.clients.claim();
    })
  );
});

// 3. Fetch Event: Intercept HTTP requests and serve cached content offline
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and local requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const urlPath = new URL(event.request.url).pathname;
      const fileName = urlPath.substring(urlPath.lastIndexOf('/') + 1) || 'index.html';

      if (cachedResponse) {
        // Log interception back to the page UI
        sendLogToClients('intercept', `[攔截攔截] 讀取 ${fileName} -> 從快取直接提供 (離線支援)`);
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(event.request)
        .then((response) => {
          // If a valid response, add it to cache for next time (dynamic caching)
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            sendLogToClients('info', `[動態快取] 下載並儲存了 ${fileName}`);
          }
          return response;
        })
        .catch((err) => {
          // Both cache and network failed (should only happen for non-cached URLs when offline)
          sendLogToClients('warning', `[連線失敗] 無法連線至 ${fileName} 且無快取備份`);
          throw err;
        });
    })
  );
});
