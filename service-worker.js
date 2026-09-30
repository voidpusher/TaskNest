const CACHE_NAME = 'worko-v2.4.6';
const APP_SHELL = ['./index.html', './styles.css?v=2.4.6', './creative.css?v=2.4.6', './revamp.css?v=2.4.6', './night.css?v=2.4.6', './worko.css?v=2.4.6', './renderer.js?v=2.4.6', './assets/mountain-prayer-flags.png', './assets/worko-mark.svg', './assets/ridge-line.svg'];

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
