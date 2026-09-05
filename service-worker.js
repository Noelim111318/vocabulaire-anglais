// Service worker for the "Vocabulaire d'Anglais" PWA.
// Caches the app shell so the game works fully offline once loaded.

const CACHE_NAME = 'vocab-anglais-v1.0.0';

// Files that make up the app shell.
const APP_SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './words.js',
  './manifest.json',
  './fonts/nunito-latin.woff2',
  './fonts/nunito-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

// Install: pre-cache the app shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate: clean up old caches from previous versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k.startsWith('vocab-anglais-'))
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for HTML navigations to avoid stale pages after a push,
// while keeping static assets cached for offline use.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return resp;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.status === 200 && new URL(req.url).origin === self.location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
