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
const APP_VERSION = '1.15.0';
const CACHE = `urlaubstracker-${APP_VERSION}`;

const SHELL = [
  './',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/calc.js',
  './js/dom.js',
  './js/format.js',
  './js/ids.js',
  './js/join.js',
  './js/install.js',
  './js/link.js',
  './js/prefs.js',
  './js/backend-local.js',
  './js/backend-firestore.js',
  './js/ui/sheet.js',
  './js/ui/parts.js',
  './js/ui/join-sheet.js',
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

/**
 * Eine Antwort, die über eine Weiterleitung kam, trägt ein `redirected`-Flag.
 * Liefert der Service Worker so etwas für einen Seitenaufruf aus, bricht der
 * Browser die Navigation ab: „Response served by service worker has
 * redirections“ — die App lässt sich dann überhaupt nicht mehr öffnen.
 *
 * Das passiert schneller als man denkt: Cloudflare Pages normalisiert
 * `/index.html` auf `/` und schickt dafür eine 308 (Firebase Hosting tut
 * dasselbe mit einer 301). Beim Befüllen des Caches folgt `fetch` ihr brav,
 * und das Flag hängt fortan am Eintrag. Deshalb steht im Paket nur noch `./` —
 * und diese Absicherung bleibt trotzdem, denn welcher Hoster wann umleitet,
 * ist nichts, worauf sich die App verlassen sollte.
 *
 * Eine Kopie aus Rumpf, Status und Kopfzeilen trägt es nicht mehr.
 */
async function unredirected(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function fillCache() {
  const cache = await caches.open(CACHE);
  // Einzeln statt `addAll`: so nennt der Fehler die Datei, an der es lag.
  // `reload` umgeht den HTTP-Cache — eine neue Fassung soll nicht aus Versehen
  // alte Bytes einsammeln. Ein Fehlschlag lässt die Installation scheitern,
  // und das ist richtig so: eine unvollständige Fassung darf gar nicht erst
  // als Update angeboten werden, dann bleibt die alte in Betrieb.
  await Promise.all(SHELL.map(async (url) => {
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error(`${url} kam mit Status ${response.status}`);
    await cache.put(url, await unredirected(response));
  }));
}

/**
 * Ältere Fassungen haben die Antwort auf `/index.html` mitsamt
 * Weiterleitungs-Flag abgelegt. Wo das passiert ist, startet die App nicht
 * mehr — es gibt also niemanden mehr, den man im Dialog fragen könnte.
 * Dann übernimmt der neue Worker sofort, statt brav zu warten.
 */
async function previousVersionIsBroken() {
  for (const name of await caches.keys()) {
    if (name === CACHE || !name.startsWith('urlaubstracker-')) continue;
    const cache = await caches.open(name);
    for (const key of ['./index.html', './']) {
      if ((await cache.match(key))?.redirected) return true;
    }
  }
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await fillCache();
      // Sonst kein skipWaiting(): der neue Worker wartet, bis jemand zugestimmt hat.
      if (await previousVersionIsBroken()) await self.skipWaiting();
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

  // Die Konfiguration der Auslieferung gehört nicht ins Paket: sie sagt, in
  // welchem Firebase-Projekt die Kassen liegen, und darf sich ändern, ohne dass
  // dafür eine neue Fassung nötig wäre. Ohne Netz gibt es sie eben nicht — dann
  // steht die App auf dem, was das Gerät schon gespeichert hat.
  if (url.pathname.endsWith('/firebase-config.json')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // Seitenaufrufe landen immer auf der App-Hülle, damit auch #/budget geht.
      const navigating = request.mode === 'navigate';
      const cached = await cache.match(navigating ? './' : request);
      // Beim Befüllen ist das Flag schon weg; hier steht die Garantie noch
      // einmal an der Stelle, an der sie zählt — auch für Caches, die eine
      // frühere Fassung angelegt hat.
      if (cached) return navigating ? unredirected(cached) : cached;

      // Nicht im Paket (neue Datei, fremder Pfad): direkt aus dem Netz.
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          unredirected(response.clone()).then((clean) => cache.put(request, clean)).catch(() => {});
        }
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
