const CACHE = 'trip-os-v6';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app.css',
  './redesign.css',
  './app.js',
  './history-seed.js',
  './parts/p01.txt',
  './parts/p02.txt',
  './parts/p03.txt',
  './parts/p04.txt',
  './parts/p05.txt',
  './parts/p06.txt',
  './parts/p07.txt',
  './parts/p08.txt',
  './parts/p09.txt',
  './parts/p10.txt',
  './parts/p11.txt',
  './parts/p12.txt',
  './parts/p13.txt'
];
const OPTIONAL = [
  'https://cdn.jsdelivr.net/npm/d3@7',
  'https://cdn.jsdelivr.net/npm/topojson-client@3',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await Promise.allSettled(OPTIONAL.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});
