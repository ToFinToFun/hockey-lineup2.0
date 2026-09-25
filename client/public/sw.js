// Service worker för app.stalstadens.se
//
// Mål: Score Tracker ska starta och fungera även utan täckning i hallen.
// - Sidor (navigering): nätet först, men max 3 s – sedan cachad version.
// - Byggda filer (/assets/*, hashade namn): cache först, de ändras aldrig.
// - Bilder, ljud, ikoner, typsnitt: cache först, uppdateras i bakgrunden.
// - API-anrop (/api/*) hanteras aldrig här; appen sköter sin egen offline-data.

const VERSION = 'v6';
const SHELL_CACHE = `stal-shell-${VERSION}`;
const ASSET_CACHE = `stal-assets-${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;

const PRECACHE_URLS = [
  '/',
  '/score',
  '/manifest.json',
  '/score-manifest.json',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/score-icon-192.png',
  '/score-icon-512.png',
  '/apple-touch-icon.png',
  '/score-apple-touch-icon.png',
  '/favicon-32.png',
  '/score-favicon-32.png',
  '/images/logo-green.png',
  '/images/logo-white.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // En enskild fil som saknas ska inte stoppa installationen.
      await Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})));
      // Förladda Score Trackerns byggda filer så att appen fungerar offline direkt.
      await precacheAssetsFrom('/score');
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, ASSET_CACHE];
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

/** Läser en sida och cachar de /assets/-filer den laddar (JS och CSS). */
async function precacheAssetsFrom(pageUrl) {
  try {
    const res = await fetch(pageUrl, { cache: 'no-store' });
    const html = await res.text();
    const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    const cache = await caches.open(ASSET_CACHE);
    await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
  } catch {
    /* offline vid installation – filerna cachas när de väl laddas */
  }
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function handleNavigation(request) {
  const url = new URL(request.url);
  const isScore = url.pathname === '/score' || url.pathname.startsWith('/score/');
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match(isScore ? '/score' : '/')) ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    );
  }
}

async function cacheFirst(request, cacheName, revalidate) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    if (revalidate) network.catch(() => {});
    return cached;
  }
  return (await network) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE, false));
    return;
  }
  if (/\.(png|jpe?g|webp|svg|ico|mp3|wav|ogg|m4a|woff2?|json)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE, true));
  }
});
