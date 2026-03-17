const CACHE_NAME = 'transit-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './image.png'
];

// Install event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Fetch event (Network first, then cache)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
