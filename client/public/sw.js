// Service Worker for Stålstadens multi-app PWA
// Handles Hub (/), Lineup (/lineup), and Score Tracker (/score)

const CACHE_NAME = 'stalstadens-app-v4';

// Assets to pre-cache for offline shell
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/lineup-manifest.json',
  '/score-manifest.json',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/apple-touch-icon.png',
];

// Install event - pre-cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - network-first strategy with cache fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip API calls and SSE
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/sse')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // For navigation requests, return the appropriate cached page
          if (event.request.mode === 'navigate') {
            if (url.pathname.startsWith('/lineup')) {
              return caches.match('/lineup') || caches.match('/');
            }
            if (url.pathname.startsWith('/score')) {
              return caches.match('/score') || caches.match('/');
            }
            return caches.match('/');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
