const CACHE_NAME = 'qs-delivery-cache-v3';
const ASSETS = [
  '/',
  '/index.html?v=3',
  '/styles.css?v=3',
  '/app.js?v=3',
  '/manifest.json?v=3',
  '/assets/icon-192.png?v=3',
  '/assets/icon-512.png?v=3',
  '/assets/apple-touch-icon.png?v=3'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
