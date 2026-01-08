const CACHE_NAME = 'space-defender-v3';
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
  './Public/eec663343d1d41c9fd5baf68d1e30147.0000000.jpg',
  './Public/shoot.mp3',
  './Public/explosion.mp3',
  './Public/boom.mp3',
  './Public/powerup.mp3'
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
