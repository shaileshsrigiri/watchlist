// Cache-first service worker (works at / or /your-subpath/)
const VERSION = 'v7';
const CACHE = `watchlist-cache-${VERSION}`;

// Derive the base path from the registration scope (e.g. "/watchlist" or "")
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');

// Core assets to pre-cache
const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icon-192.png`,
  `${BASE}/icon-512.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    // 1) Try cache first
    const cached = await caches.match(request);
    if (cached) return cached;

    // 2) Network, then cache if it's in-scope or TMDb images
    try {
      const resp = await fetch(request);

      const url = new URL(request.url);
      const inScope =
        url.origin === self.location.origin &&
        url.pathname.startsWith(`${BASE}/`);

      const isTmdbImage = url.hostname === 'image.tmdb.org';

      if ((inScope || isTmdbImage) && resp && resp.status === 200) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return resp;
    } catch (err) {
      // 3) Offline fallback for navigations
      if (request.mode === 'navigate') {
        return caches.match(`${BASE}/index.html`, { ignoreSearch: true });
      }
      throw err;
    }
  })());
});
