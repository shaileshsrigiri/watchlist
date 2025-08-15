// Cache-first service worker scoped to /watchlist/
const CACHE = 'watchlist-cache-v3';
const BASE = '/watchlist';
const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icon-192.png`,
  `${BASE}/icon-512.png`
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        // Cache same-origin GETs under our scope
        const url = new URL(request.url);
          
        if (
            (url.origin === self.location.origin && url.pathname.startsWith(`${BASE}/`)) ||
            (url.hostname === 'image.tmdb.org')
            ) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return resp;
      }).catch(() => {
        // If navigating and offline, fall back to our index
        if (request.mode === 'navigate') return caches.match(`${BASE}/index.html`);
      })
    })
  );
});
