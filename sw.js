const CACHE = 'murmweb-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/tools.html',
  '/pricing.html',
  '/refer.html',
  '/blog/',
  '/blog/index.html',
  '/blog/shopify-speed-optimization.html',
  '/blog/shopify-store-setup-cost.html',
  '/blog/nextjs-vs-wordpress-ecommerce.html',
  '/site.css',
  '/site.js',
  '/logo-dark.webp',
  '/logo-light.webp',
  '/photo.webp',
  '/og.png',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS).catch(function(){});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  // Only handle http(s) — skip chrome-extension://, blob:, data:, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // Skip cross-origin analytics/tracking and same-origin _vercel endpoints
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_vercel/')) return;
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var clone = res.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return res;
      }).catch(function() { return cached; });
    })
  );
});
