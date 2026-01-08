const CACHE_NAME = 'space-defender-v1';
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
  './Public/đồng đội.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
