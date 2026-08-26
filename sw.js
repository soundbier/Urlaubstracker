/**
 * Service Worker: hält die App offline lauffähig.
 *
 * Alles, was zur App gehört, liegt nach dem ersten Besuch im Cache. Anfragen
 * an Firestore laufen bewusst daran vorbei — dessen eigene Offline-Schicht
 * kümmert sich darum, und ein Cache dazwischen würde nur alte Stände liefern.
 *
 * Beim Ändern von Dateien: CACHE_VERSION hochzählen.
 */
const CACHE_VERSION = 'v1';
const CACHE = `urlaubstracker-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/calc.js',
  './js/dom.js',
  './js/format.js',
  './js/ids.js',
  './js/link.js',
  './js/prefs.js',
  './js/backend-local.js',
  './js/backend-firestore.js',
  './js/ui/sheet.js',
  './js/ui/parts.js',
  './js/ui/entry-sheets.js',
  './js/views/today.js',
  './js/views/expenses.js',
  './js/views/budget.js',
  './js/views/settings.js',
  './js/views/onboarding.js',
  './vendor/firebase.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Einzeln, damit eine fehlende Datei nicht die ganze Installation kippt.
      await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE && n.startsWith('urlaubstracker-')).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firestore & Co. selbst regeln lassen

  // Seitenaufrufe: immer die App-Hülle ausliefern, damit auch #/budget offline geht.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Alles andere aus dem Cache, im Hintergrund auffrischen.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })(),
  );
});
