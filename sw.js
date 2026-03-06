// Simple service worker for Lw&5之家 (offline-ish)
const CACHE = 'lw5-home-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './home-bg.jpg',
  './bgm.m4a',
  './bgm.mp3',
  './wheel/',
  './wheel/index.html',
  './stock/',
  './stock/index.html',
  './icons/apple-touch-icon.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k === CACHE ? null : caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cache successful basic responses
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
    })
  );
});
