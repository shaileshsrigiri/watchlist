// Basic cache-first SW for offline use
const CACHE = 'watchlist-cache-v1';
const ASSETS = [
  './',
  './index.html',
  // add icons/fonts if you later include them
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        // Only cache same-origin GETs
        const url = new URL(request.url);
        if (url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return resp;
      }).catch(() => {
        // Fallback to cached index for navigations (SPA-ish)
        if (request.mode === 'navigate') return caches.match('./index.html');
      })
    })
  );
});
