const CACHE = 'trip-os-v2';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app.css',
  './app.js',
  './parts/p01.txt',
  './parts/p02.txt',
  './parts/p03.txt',
  './parts/p04.txt',
  './parts/p05.txt',
  './parts/p06.txt',
  './parts/p07.txt',
  './parts/p08.txt'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
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
