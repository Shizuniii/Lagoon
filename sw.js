// sw.js – macht die App installierbar und lädt sie auch bei schlechtem Netz.
// Strategie: immer zuerst frisch aus dem Netz (damit Updates sofort ankommen),
// nur wenn das nicht geht, die gespeicherte Version.

const CACHE = 'spieleabend-2.4.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './core/ui.js',
  './core/backend.js',
  './games/index.js',
  './games/werbinich/game.js',
  './games/werbinich/logic.js',
  './games/werbinich/topics.js',
  './games/werbinich/images.js',
  './games/werbinich/catalog.js',
  './games/quiz/game.js',
  './games/quiz/logic.js',
  './games/quiz/library.js',
  './games/quiz/media.js',
  './games/quiz/studio.js',
  './vendor/firebase.js',
  './manifest.webmanifest',
  './fonts/bricolage-latin.woff2',
  './fonts/bricolage-latin-ext.woff2',
  './fonts/permanent-marker.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-48.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase & Co. nicht anfassen

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
        if (fresh.ok && !url.search) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const shell = await caches.match('./');
          if (shell) return shell;
        }
        return new Response('Keine Verbindung', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })()
  );
});
