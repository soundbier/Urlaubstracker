/**
 * Die eine Firebase-App dieses Geräts — Anmeldung, Firestore, App Check.
 *
 * Vorher lag das alles im `FirestoreBackend`: es legte die App beim Verbinden
 * an und löschte sie beim nächsten Versuch wieder. Für eine Kasse pro Gerät
 * ging das auf. Für ein Konto, das über Kassenwechsel, Abmelden und
 * Neuverbinden hinweg bestehen bleibt, geht es nicht: eine Anmeldung, deren
 * Unterbau bei jedem Verbindungsaufbau gelöscht wird, ist keine.
 *
 * Deshalb liegt der Lebenszyklus jetzt hier, genau einmal pro Seitenaufruf und
 * unabhängig davon, welche Kasse gerade offen ist. Das räumt nebenbei zwei
 * alte Ärgernisse weg: App Check meldet sich nur noch ein einziges Mal an
 * (statt bei jedem Verbindungsversuch erneut, mit doppelten Fehlermeldungen in
 * der Konsole), und mehrere Kassen können sich später dieselbe Verbindung
 * teilen, statt sie einander wegzunehmen.
 *
 * Geladen wird diese Datei nur, wenn wirklich jemand in die Cloud will — im
 * lokalen Modus lädt die App weiterhin kein einziges Byte Firebase.
 */
import * as fb from '../vendor/firebase.js';

const APP_NAME = 'urlaubstracker';

/**
 * Die laufende Verbindung: `{ key, app, db, auth }`. `key` ist die
 * Konfiguration, aus der sie entstanden ist — kommt eine andere herein (ein
 * anderes Firebase-Projekt), wird abgerissen und neu aufgebaut, statt die
 * neue Konfiguration stillschweigend zu ignorieren.
 */
let current = null;

const keyOf = (config) => JSON.stringify([config?.projectId, config?.apiKey, config?.appId, config?.appCheckSiteKey]);

/**
 * App Check anmelden, falls die Gruppe es eingerichtet hat.
 *
 * Ohne `appCheckSiteKey` in der Konfiguration passiert hier nichts — die
 * Kasse läuft dann wie bisher, nur eben ohne diese zusätzliche Bremse. Das
 * ist auf einem echten Gerät (kein `localhost`) kein Normalfall, sondern eine
 * unvollständige Einrichtung — deshalb landet dazu eine Warnung in der
 * Konsole, statt es kommentarlos durchzuwinken.
 *
 * Scheitert die Anmeldung (kein Empfang, falscher Schlüssel, ein Schlüssel,
 * dessen Einrichtung bei Google nicht abgeschlossen ist), darf das den
 * Verbindungsaufbau nicht verhindern — sonst wäre ein Tippfehler im Schlüssel
 * gleichbedeutend mit „Kasse offline“, obwohl `firestore.rules` den Zugriff
 * weiterhin regelt. Sichtbar wird der Fehlschlag trotzdem, in der Konsole,
 * damit er nicht als „läuft“ missverstanden wird.
 */
function startAppCheck(app, config) {
  const siteKey = config?.appCheckSiteKey;
  if (!siteKey) {
    if (!isLocalDevHost()) {
      console.warn(
        'Firebase App Check ist nicht eingerichtet (appCheckSiteKey fehlt) — diese Kasse läuft ohne diese ' +
        'zusätzliche Bremse gegen automatisiertes Durchprobieren. Siehe README, Abschnitt „App Check“.',
      );
    }
    return;
  }
  try {
    // Debug-Token nur auf einem lokalen Entwicklungsgerät: die Prüfung steht
    // hier im Code, nicht nur in der Dokumentation, damit ein versehentlich
    // mitgegebener Debug-Token eine echte Auslieferung nicht schwächt.
    if (isLocalDevHost() && config?.appCheckDebugToken) {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = config.appCheckDebugToken;
    }
    // Das unsichtbare reCAPTCHA-Badge hängt an `document.body` und überlebt
    // das Löschen der Firebase-App. Seit der Lebenszyklus hier liegt, kommt
    // ein zweiter Anlauf nur noch nach `reset()` vor — dann aber fände
    // reCAPTCHA das alte, schon gerenderte Element und würfe „reCAPTCHA has
    // already been rendered in this element“.
    if (typeof document !== 'undefined') {
      document.getElementById(`fire_app_check_${app.name}`)?.remove();
    }
    fb.initializeAppCheck(app, {
      provider: new fb.ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.error('Firebase App Check konnte nicht gestartet werden — die Kasse läuft ohne diese Bremse weiter.', err);
  }
}

/**
 * Läuft das hier auf einem Entwicklungsgerät (lokaler Server, kein echtes
 * Deployment)? Nur dort darf ein Debug-Token für App Check überhaupt wirken —
 * kopiert sich `firebase-config.json` versehentlich mit einem Debug-Token in
 * eine echte Auslieferung, greift die Prüfung hier trotzdem nicht.
 */
function isLocalDevHost() {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '';
}

/**
 * Die Verbindung zu diesem Firebase-Projekt — beim ersten Aufruf aufgebaut,
 * danach dieselbe. Meldet niemanden an; das ist Sache von `auth.js`.
 */
export function connectFirebase(config) {
  const key = keyOf(config);
  if (current && current.key === key) return current;
  if (current) resetFirebase();

  const app = fb.initializeApp(config, APP_NAME);
  startAppCheck(app, config);

  // `persistentLocalCache` legt Firestore selbst eine eigene, unverschlüsselte
  // Ablage in IndexedDB an — außerhalb dessen, was `secure-storage.js`
  // verschlüsselt, und außerhalb dessen, was diese App beeinflussen kann. Der
  // Preis für Offline-Betrieb bei verbundener Kasse; siehe `privacy.js`, wo
  // das entsprechend steht.
  const db = fb.initializeFirestore(app, {
    localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
  });

  // Dasselbe gilt für die Anmeldung: Firebase legt ihre eigene Sitzung
  // (Kennung, Erneuerungs-Merkmal) in ihrer eigenen Ablage ab, ebenfalls
  // unverschlüsselt und ebenfalls außerhalb dieser Datei. Ohne eine explizit
  // dauerhafte Persistenz müsste sich jede Person bei jedem Schließen der App
  // neu anmelden — und schlimmer noch: `_connect()` in `backend-firestore.js`
  // meldet ein Gerät ohne wiederhergestellte Sitzung nicht etwa ab, sondern
  // still ein zweites Mal an, anonym, mit einer neuen Kennung. Diese neue
  // Kennung steht in keiner bestehenden Kasse — Lesen und Schreiben schlägt
  // dann fehl, ohne dass „ausgeloggt“ irgendwo auf dem Schirm stünde.
  //
  // `indexedDBLocalPersistence` statt des älteren `browserLocalPersistence`:
  // Firebases eigene Empfehlung für Seiten mit Service Worker, und robuster
  // gegen Browser, die localStorage und IndexedDB unterschiedlich behandeln —
  // genau die Art Unterschied, die eine Sitzung unbemerkt verschwinden lässt.
  const auth = fb.getAuth(app);
  const ready = fb.setPersistence(auth, fb.indexedDBLocalPersistence).catch(() => {
    // Privates Fenster ohne Speicherzugriff: die Anmeldung gilt dann nur für
    // diese Sitzung. Besser als gar keine Anmeldung.
  });

  current = { key, app, db, auth, ready };
  return current;
}

/** Die laufende Verbindung — oder `null`, solange keine aufgebaut ist. */
export function currentFirebase() {
  return current;
}

/**
 * Alles abräumen. Gebraucht beim Wechsel des Firebase-Projekts; im Alltag
 * passiert das nicht.
 */
export function resetFirebase() {
  const old = current;
  current = null;
  if (old) fb.deleteApp(old.app).catch(() => {});
}

/**
 * Wer ist gerade angemeldet? Wartet den ersten Zustandsbericht von Firebase
 * ab — der kommt auch dann, wenn niemand angemeldet ist (dann mit `null`),
 * und erst danach steht fest, ob eine gespeicherte Sitzung wiederkam.
 */
export function currentUser(auth) {
  return new Promise((resolve, reject) => {
    const off = fb.onAuthStateChanged(
      auth,
      (user) => { off(); resolve(user); },
      (err) => { off(); reject(err); },
    );
  });
}
