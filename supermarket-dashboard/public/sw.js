const CACHE_NAME = 'aimerc-dashboard-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // We just let everything go to the network for now.
  // The service worker is mostly here to allow the PWA install prompt.
  event.respondWith(fetch(event.request).catch(() => new Response('Offline')));
});
