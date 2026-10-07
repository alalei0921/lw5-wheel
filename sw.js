// Keep app code consistent per release; cache large media only when it is used.
const CACHE = 'lw5-home-v58-island-journal-3d';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './home-bg.jpg',
  './shared/app-ui-v1.css',
  './shared/app-ui-v1.js',
  './shared/elevator-v1.css',
  './shared/elevator-v1.js',
  './shared/elevator-ascent-v1.js',
  './shared/particle-light-v1.js',
  './shared/scene-depth-v1.js',
  './shared/elevator-config-v1.js',
  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './vendor/nebula-visuals-v2.js',
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
  './wheel/spatial-room.js',
  './wheel/room-motion.js',
  './wheel/portrait-core.js',
  './wheel/vendor/cannon-es.js',
  './wheel/assets/start.png',
  './wheel/assets/reward-bg.jpg',
  './wheel/vendor/three.module.min.js',
  './wheel/vendor/three.core.min.js',
  './stock/',
  './stock/index.html',
  './stock/bg.jpg',
  './islands/',
  './islands/index.html',
  './islands/about.html',
  './islands/buildings.js',
  './islands/caustics.js',
  './islands/characters.js',
  './islands/coconut-effects.js',
  './islands/dynamics.js',
  './islands/gestures.js',
  './islands/journal-store.js',
  './islands/journal.css',
  './islands/journal.js',
  './islands/marine-assets.js',
  './islands/marine-models.js',
  './islands/marine-preload.js',
  './islands/marine.js',
  './islands/palms.js',
  './islands/radar.js',
  './islands/ratings-state.js',
  './islands/scene-layout.js',
  './islands/scene.js',
  './islands/shaders.js',
  './islands/shore-models.js',
  './islands/star-rating.css',
  './islands/star-rating.js',
  './islands/tables.js',
  './islands/terrain.js',
  './islands/vendor/BufferGeometryUtils.js',
  './islands/vendor/GLTFLoader.js',
  './islands/vendor/SkeletonUtils.js',
  './islands/vendor/three.core.min.js',
  './islands/vendor/three.module.min.js',
  './islands/water.js',
  './islands/whale-asset.js',
  './travel/',
  './travel/index.html',
  './travel/bg.jpg',
  './conflict/',
  './conflict/index.html',
  './conflict/bg-intro.jpg',
  './conflict/bg-snapshot.jpg',
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
    caches.keys().then((keys) => Promise.all(keys.filter(k => k.startsWith('lw5-home-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  const scope = new URL(self.registration.scope);
  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname) || url.pathname.includes('/api/') || req.headers.has('range')) return;
  // Old links used timestamps to reload HTML. Keep one offline copy per page.
  const key = new URL(url);
  key.searchParams.delete('v');
  key.searchParams.delete('ts');
  const navigation = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key.href);
    if (!navigation && cached) return cached;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cached ? 3000 : 12000);
    try {
      const response = await fetch(req, {signal:controller.signal});
      if (!response.ok && cached) return cached;
      if (response.ok && response.type === 'basic') {
        event.waitUntil(cache.put(key.href, response.clone()).catch(() => {}));
      }
      return response;
    } catch (_) {
      if (cached) return cached;
      if (!navigation) return Response.error();
      return new Response('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>暂时无法加载</title><body style="font-family:system-ui;padding:40px 24px;text-align:center"><h2>暂时无法加载页面</h2><p>请连接网络后重试</p><button onclick="location.reload()" style="padding:14px 24px">重试</button><p><a href="' + scope.pathname + '">返回主页</a></p></body></html>', {status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
    } finally { clearTimeout(timer); }
  })());
});
