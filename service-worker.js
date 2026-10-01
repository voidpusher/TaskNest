const CACHE_NAME = 'worko-v2.6.0';
const APP_SHELL = ['./index.html', './worko-ui.css?v=2.6.0', './worko-ui.js?v=2.6.0', './assets/pahadi-weave.svg', './assets/trail-dots.svg', './worko.css?v=2.6.0', './renderer.js?v=2.6.0', './widget.html', './worko-widget.css?v=2.6.0', './widget.js?v=2.6.0', './assets/inter-latin.woff2', './assets/mountain-prayer-flags.png', './assets/worko-mark.svg', './assets/ridge-line.svg', './assets/frost-grain.svg', './assets/alpine-contours.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(new URL('index.html', self.registration.scope).href))));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => 'focus' in client);
    return existing ? existing.focus() : self.clients.openWindow(self.registration.scope);
  }));
});
