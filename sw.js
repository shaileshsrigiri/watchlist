// Cache-first service worker (works at / or /your-subpath/)
const VERSION    = 'v8';
const APP_CACHE  = `watchlist-app-${VERSION}`;
const IMG_CACHE  = `watchlist-img-${VERSION}`;

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

// ---- helpers ---------------------------------------------------------------

async function trimCache(name, max = 300) {
  // Simple FIFO trim using insertion order of Cache.keys()
  const cache = await caches.open(name);
  const keys = await cache.keys();
  while (keys.length > max) {
    await cache.delete(keys.shift());
  }
}

function inScope(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(`${BASE}/`);
}

function isTmdbImage(url) {
  return url.hostname === 'image.tmdb.org';
}

// tiny transparent fallback (if image fetch fails & nothing cached)
function transparent1x1() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}

// ---- install/activate ------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Enable navigation preload where supported
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== APP_CACHE && k !== IMG_CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ---- fetch ---------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) TMDb images → cache-first in IMG_CACHE with trimming
  if (isTmdbImage(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;

      try {
        const resp = await fetch(request);
        if (resp && resp.status === 200) {
          cache.put(request, resp.clone()).then(() => trimCache(IMG_CACHE, 300));
        }
        return resp;
      } catch {
        // fallback to transparent pixel if offline/not cached
        return transparent1x1();
      }
    })());
    return;
  }

  // 2) Navigations → cache-first; if miss, try preload/network; offline → index.html
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(`${BASE}/index.html`, { ignoreSearch: true });
      if (cached) return cached;

      // Try navigation preload first (if available)
      const preload = await event.preloadResponse;
      if (preload) return preload;

      try {
        const resp = await fetch(request);
        return resp;
      } catch {
        return caches.match(`${BASE}/index.html`, { ignoreSearch: true });
      }
    })());
    return;
  }

  // 3) In-scope requests (CSS/JS/env/icons/etc.) → cache-first, then network+cache
  if (inScope(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const resp = await fetch(request);
        if (resp && resp.status === 200) {
          const cache = await caches.open(APP_CACHE);
          cache.put(request, resp.clone());
        }
        return resp;
      } catch (err) {
        // If this was a same-origin request that failed, surface the error
        // (Assets should be pre-cached; otherwise there’s nothing sensible to serve.)
        throw err;
      }
    })());
    return;
  }

  // 4) Everything else → network (don’t cache third-party JSON/APIs)
  event.respondWith(fetch(request));
});
