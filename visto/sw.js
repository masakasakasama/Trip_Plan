const CACHE = 'trip-os-v11-20260817g';
const CORE = [
  './',
  './index.html',
  './tatsu/',
  './tatsu/index.html',
  './rebecca/',
  './rebecca/index.html',
  './manifest.webmanifest',
  './app.css?v=20260817g',
  './redesign.css?v=20260817g',
  './flag-fix.css?v=20260817g',
  './insights.css?v=20260817g',
  './themes.css?v=20260817g',
  './app.js?v=20260817g',
  './history-seed.js?v=20260817g',
  './flight-seed.js?v=20260817g'
];
const OPTIONAL = [
  'https://cdn.jsdelivr.net/npm/d3@7',
  'https://cdn.jsdelivr.net/npm/topojson-client@3',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js'
];
self.addEventListener('install', event => event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(CORE);await Promise.allSettled(OPTIONAL.map(url=>cache.add(url)));await self.skipWaiting()})()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const request=event.request;if(request.method!=='GET')return;
  event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});return response}).catch(async()=>{
    const cached=await caches.match(request);if(cached)return cached;
    if(request.mode==='navigate'){
      const p=new URL(request.url).pathname;
      if(p.includes('/visto/rebecca/'))return caches.match('./rebecca/index.html');
      if(p.includes('/visto/tatsu/'))return caches.match('./tatsu/index.html');
      return caches.match('./index.html');
    }
    return Response.error();
  }));
});
