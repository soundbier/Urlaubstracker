/**
 * Verschlüsselte Ablage für alles, was dieses Gerät im `localStorage` hält.
 *
 * Reine Web-Crypto-API, keine eigene Kryptografie: AES-256-GCM, für jeden
 * Schreibvorgang ein neuer, zufälliger IV. Der Schlüssel entsteht beim ersten
 * Aufruf auf diesem Gerät (`crypto.subtle.generateKey`, 256 Bit) und ist
 * `extractable: false` — kein JavaScript, auch dieses Modul nicht, kann ihn
 * je als Bytes auslesen. Abgelegt wird er in IndexedDB, nicht im
 * `localStorage`: dort ließe sich nur Text speichern, ein Schlüssel als Text
 * wäre also zwangsläufig ein Schlüssel im Klartext — genau das, was diese
 * Datei verhindern soll. Ein einziger Schlüssel für alle Ablagen dieses
 * Geräts, nicht einer je Kasse: die Sperre in `lock.js` schützt schon jede
 * Kasse einzeln vor fremden Blicken, hier geht es nur darum, dass der
 * Speicher des Browsers selbst — eine Datensicherung, ein synchronisierter
 * Profilordner, ein zweites Programm mit Lesezugriff — keinen Klartext mehr
 * hergibt.
 *
 * Ehrlich zur Grenze: das hier verwehrt den Zugriff auf den *Speicher*, nicht
 * auf die *App*. Wer Code in dieser Seite ausführen kann (eine Sicherheitslücke
 * in der App selbst, eine bösartige Erweiterung mit Zugriff auf die Seite),
 * kann dieselben Funktionen aufrufen, die die App selbst zum Entschlüsseln
 * benutzt — ein rein clientseitiger Schlüssel ohne ein Geheimnis, das nur die
 * Person kennt, kann das grundsätzlich nicht verhindern. Wer stärker will,
 * bräuchte ein Passwort, das bei jedem Start eingegeben wird; das stand nicht
 * im Auftrag und hätte die App offline unbenutzbar gemacht, wenn dieses
 * Passwort einmal vergessen wäre. Was hier steht, ist die Stufe darunter, die
 * ohne Reibung auskommt: Verschlüsselung „at rest“, gegen alles, was den
 * Datenträger liest, ohne die App selbst zu bedienen.
 */

const DB_NAME = 'urlaubstracker-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY_ID = 'master';

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_BYTES = 12; // die von AES-GCM empfohlene Länge

/** Aktuelle Form eines verschlüsselten Datensatzes: `{ v: 1, iv, ct }`. */
const FORMAT_VERSION = 1;

/**
 * Ein Datensatz war da, ließ sich aber nicht lesen: falsches oder fehlendes
 * Gerät (der Schlüssel steckt in IndexedDB, nicht in der Sicherungskopie),
 * beschädigter Speicher, oder jemand hat von Hand daran herumgeschraubt.
 * Aufrufende Stellen fangen das ab wie jedes kaputte JSON auch — mit einem
 * sauberen Leerzustand statt eines Absturzes.
 */
export class SecureStorageError extends Error {}

function subtle() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new SecureStorageError('Web Crypto steht in dieser Umgebung nicht zur Verfügung.');
  return s;
}

function randomBytes(n) {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

function toBase64(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

// -------------------------------------------------------------- Der Schlüssel

function idb() {
  const i = globalThis.indexedDB;
  if (!i) throw new SecureStorageError('IndexedDB steht in dieser Umgebung nicht zur Verfügung.');
  return i;
}

/** Ein `IDBRequest` als Promise — dieselben zwei Ereignisse, jedes Mal. */
function asPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new SecureStorageError('IndexedDB-Zugriff fehlgeschlagen.'));
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = idb().open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new SecureStorageError('IndexedDB ließ sich nicht öffnen.'));
  });
}

/**
 * Genau ein Schlüssel pro Seitenaufruf, egal wie viele Module gleichzeitig
 * danach fragen — ohne dieses Zwischenspeichern könnten zwei parallele
 * „gibt es noch keinen, dann leg einen an“-Läufe zwei verschiedene Schlüssel
 * erzeugen, und der zweite überschriebe in IndexedDB den, mit dem der erste
 * gerade schon etwas verschlüsselt hat.
 */
let keyPromise = null;

function loadOrCreateKey() {
  if (!keyPromise) {
    keyPromise = (async () => {
      const db = await openDb();
      const existing = await asPromise(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY_ID));
      if (existing) return existing;

      const key = await subtle().generateKey({ name: ALGORITHM, length: KEY_LENGTH }, false, ['encrypt', 'decrypt']);
      await asPromise(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(key, KEY_ID));
      return key;
    })().catch((err) => {
      // Ein Fehlschlag darf spätere Versuche nicht für immer sperren — sonst
      // bliebe die App nach einer einzigen Störung (z. B. IndexedDB kurz
      // nicht verfügbar) dauerhaft ohne Speicher.
      keyPromise = null;
      throw err instanceof SecureStorageError ? err : new SecureStorageError(err?.message || String(err));
    });
  }
  return keyPromise;
}

// --------------------------------------------------------- Ver-/Entschlüsseln

function isEnvelope(value) {
  return !!value && typeof value === 'object'
    && value.v === FORMAT_VERSION && typeof value.iv === 'string' && typeof value.ct === 'string';
}

async function encryptValue(value) {
  const key = await loadOrCreateKey();
  const iv = randomBytes(IV_BYTES);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await subtle().encrypt({ name: ALGORITHM, iv }, key, plain);
  return { v: FORMAT_VERSION, iv: toBase64(iv), ct: toBase64(cipher) };
}

async function decryptValue(envelope) {
  const key = await loadOrCreateKey();
  let plain;
  try {
    plain = await subtle().decrypt({ name: ALGORITHM, iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.ct));
  } catch {
    // Falscher Schlüssel oder eine verstellte Ciphertext — GCM prüft die
    // Unversehrtheit mit und verweigert dann die Entschlüsselung, statt
    // stillschweigend Unsinn zurückzugeben.
    throw new SecureStorageError('Der gespeicherte Datensatz ließ sich nicht entschlüsseln.');
  }
  try {
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new SecureStorageError('Entschlüsselt, aber kein gültiges JSON.');
  }
}

// ------------------------------------------------------------------ Die Ablage

/**
 * Liest einen `localStorage`-Schlüssel. Drei Ausgänge:
 *
 *  - nichts abgelegt → `undefined`
 *  - ein verschlüsselter Datensatz → entschlüsselt zurückgegeben
 *  - ein unverschlüsselter Altbestand (aus einer Fassung vor dieser Datei
 *    hier) → wird zurückgegeben und im Hintergrund gleich verschlüsselt neu
 *    abgelegt, ohne dass der Aufruf darauf wartet
 *
 * Ein Datensatz, der da ist, sich aber nicht lesen lässt (beschädigt, mit
 * einem fremden Schlüssel verschlüsselt), wirft `SecureStorageError` — das
 * überlässt der aufrufenden Stelle, ob sie das wie kaputtes JSON behandelt
 * (leer weiterlaufen) oder zusätzlich meldet.
 */
export async function secureRead(storageKey) {
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return undefined; // z. B. privates Fenster ohne Speicherzugriff
  }
  if (raw == null) return undefined;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SecureStorageError(`${storageKey}: kein gültiges JSON.`);
  }

  if (!isEnvelope(parsed)) {
    // Altbestand: sofort migrieren, damit der Klartext nicht liegen bleibt.
    // Schlägt das fehl (Speicher voll, privates Fenster), bleibt er vorerst
    // stehen — die App liest ihn beim nächsten Mal genauso wieder ein und
    // versucht die Migration dann erneut.
    secureWrite(storageKey, parsed).catch(() => {});
    return parsed;
  }

  return decryptValue(parsed);
}

/** Schreibt `value` verschlüsselt unter `storageKey` — mit frischem IV. */
export async function secureWrite(storageKey, value) {
  const envelope = await encryptValue(value);
  localStorage.setItem(storageKey, JSON.stringify(envelope));
}

/** Entfernen ist unabhängig vom Schlüssel — nichts hier braucht Entschlüsselung. */
export function secureRemove(storageKey) {
  localStorage.removeItem(storageKey);
}

/**
 * Nur für Tests: den zwischengespeicherten Schlüssel vergessen, damit ein
 * simulierter „App-Neustart“ ihn wirklich neu aus IndexedDB lädt, statt die
 * laufende Sitzung weiterzubenutzen.
 */
export function _forgetCachedKeyForTests() {
  keyPromise = null;
}
