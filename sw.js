// Simple service worker for Lw&5之家 (offline-ish)
const CACHE = 'lw5-home-v39-sculpted-salon';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './home-bg.jpg',
  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './bgm.m4a',
  './bgm.mp3',
  './wheel/',
  './wheel/index.html',
  './wheel/style.css',
  './wheel/main.js',
  './wheel/scene.js',
  './wheel/audio.js',
  './wheel/wheel-core.js',
  './wheel/view-core.js',
  './wheel/background.js',
  './wheel/physics.js',
  './wheel/room.js',
  './wheel/vendor/GLTFLoader.js',
  './wheel/vendor/BufferGeometryUtils.js',
  './wheel/assets/models/salon-guest.glb',
  './wheel/assets/models/numa-pachinko.glb',
  './wheel/vendor/cannon-es.js',
  './wheel/assets/start.png',
  './wheel/assets/reward-bg.jpg',
  './wheel/vendor/three.module.min.js',
  './wheel/vendor/three.core.min.js',
  './stock/',
  './stock/index.html',
  './travel/',
  './travel/index.html',
  './travel/bg.jpg',
  './smart-home/hyperion.html',
  './smart-home/aurora.html',
  './smart-home/chione.html',
  './smart-home/hyperion-bg.jpg',
  './smart-home/aurora-bg.jpg',
  './smart-home/chione-bg.jpg',
  './icons/apple-touch-icon.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map(url => new Request(new URL(url, self.location.href), { cache: 'reload' })))).then(() => self.skipWaiting())
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
        // Cache only successful same-origin responses
        const copy = res.clone();
        if (res.ok && res.type === 'basic') caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
    })
  );
});
