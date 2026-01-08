const CACHE_NAME = 'space-defender-v16';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './game.js',
  './style.css',
  './manifest.json',
  './Public/BẠN.png',
  './Public/Mini_Minion.png',
  './Public/Minion.png',
  './Public/Boss.png',
  './Public/Fire.png',
  './Public/Nổ.png',
  './Public/Đồng đội.png',
  './Public/eec663343d1d41c9fd5baf68d1e30147.0000000.jpg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
