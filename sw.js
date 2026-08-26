/**
 * Service Worker: hält die App offline lauffähig und steuert Updates.
 *
 * Eine Fassung ist ein geschlossenes Paket: alles, was zur App gehört, liegt
 * unter `APP_VERSION` im Cache und wird von dort ausgeliefert — nichts wird im
 * Hintergrund einzeln ausgetauscht. Dadurch läuft nie halb die alte und halb
 * die neue Fassung, und die Versionsnummer in den Einstellungen stimmt.
 *
 * Ein Update kommt deshalb nur über eine neue `APP_VERSION` zustande: der
 * Browser bemerkt die geänderte Datei, lädt das Paket vollständig in einen
 * neuen Cache und wartet dann. Übernommen wird es erst, wenn die App
 * `SKIP_WAITING` schickt — also wenn jemand im Dialog zugestimmt hat.
 *
 * Beim Veröffentlichen: APP_VERSION hochzählen (und `data-version` in
 * index.html mitziehen, `npm test` prüft das).
 */
const APP_VERSION = '1.1.0';
const CACHE = `urlaubstracker-${APP_VERSION}`;

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
  // `addAll` bricht ab, sobald eine Datei fehlt. Genau so soll es sein: eine
  // unvollständige Fassung darf gar nicht erst als Update angeboten werden —
  // dann bleibt die alte, funktionierende in Betrieb.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  // Kein skipWaiting(): der neue Worker wartet, bis jemand zugestimmt hat.
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

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'SKIP_WAITING') {
    // Der Nutzer hat im Dialog zugestimmt.
    self.skipWaiting();
  } else if (data?.type === 'VERSION') {
    // Die Seite fragt einen bestimmten Worker, welche Fassung er mitbringt.
    event.ports?.[0]?.postMessage(APP_VERSION);
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firestore & Co. selbst regeln lassen

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // Seitenaufrufe landen immer auf der App-Hülle, damit auch #/budget geht.
      const cached = await cache.match(request.mode === 'navigate' ? './index.html' : request);
      if (cached) return cached;

      // Nicht im Paket (neue Datei, fremder Pfad): direkt aus dem Netz.
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
