const CACHE_NAME = 'holo-pinnwand-v6';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './js/app.js',
  './js/calendar.js',
  './js/data-management.js',
  './js/dayplanner.js',
  './js/dialogs.js',
  './js/events.js',
  './js/groups.js',
  './js/integrations.js',
  './js/leveling.js',
  './js/startscreen.js',
  './js/state.js',
  './js/taskdetail.js',
  './js/tasks.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Code, Styles und HTML immer zuerst aus dem Netz holen (network-first),
  // damit nach einem Deploy sofort die neue Version läuft. Cache ist nur
  // der Offline-Rückfall. Bilder/Icons bleiben cache-first (ändern sich selten).
  const isAppCode = /\.(?:js|css|html|webmanifest)$/.test(url.pathname)
    || url.pathname === '/' || url.pathname.endsWith('/');

  if (isAppCode) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('./index.html'))),
    );
    return;
  }

  // Übrige Ressourcen (Bilder, Icons): cache-first mit Hintergrund-Update
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      return existing ? existing.focus() : self.clients.openWindow('./');
    }),
  );
});
