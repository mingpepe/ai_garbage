const CACHE_NAME = 'zenote-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  'https://unpkg.com/lucide@latest',
  'https://unpkg.com/@supabase/supabase-js@2'
];

// Install Event - cache core static resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(ASSETS).catch(err => {
        console.warn('[Service Worker] Failed to pre-cache some assets during install:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - clean up obsolete cache versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Clearing legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - network-first fallback to cache, ignore database API endpoints
self.addEventListener('fetch', event => {
  // Let Supabase API requests bypass Service Worker caching
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Return cached asset immediately for fast load
        return cachedResponse;
      }
      
      // Otherwise perform standard network request
      return fetch(event.request).then(networkResponse => {
        // Cache dynamic assets on the fly (only GET requests, status 200, non-chrome extensions)
        if (event.request.method === 'GET' && networkResponse.status === 200 && !event.request.url.includes('chrome-extension')) {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      // Fallback for offline document queries
      if (event.request.url.includes('.html') || event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
