var CACHE = 'alel-pulse-v8';
var URLS = [
  '/',
  '/index.html',
  '/output.css',
  '/manifest.json',
  '/pulse.png',
  '/alel.png',
  '/enovar.png',
  '/res.png',
  '/prev.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return Promise.all(URLS.map(function(u) {
        return cache.add(u).catch(function() { return null; });
      }));
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('script.google.com') || e.request.url.includes('googleapis.com') || e.request.url.includes('accounts.google.com')) return;

  // Network-first for every GET: always serve fresh content when online,
  // fall back to cache only when offline. This prevents stale app code.
  e.respondWith(
    fetch(e.request).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
