/**
 * Geräteeigene Einstellungen im localStorage.
 *
 * Hier landet nur, was zum Gerät gehört: welcher Trip geöffnet ist, wer an
 * diesem Handy sitzt, und — falls eingerichtet — die Firebase-Zugangsdaten.
 * Die Urlaubsdaten selbst liegen im Backend (lokal oder Firestore).
 */

const KEY = 'urlaubstracker.prefs.v1';

const DEFAULTS = {
  firebaseConfig: null, // { apiKey, authDomain, projectId, appId, … }
  tripRef: null,        // { mode: 'local' } | { mode: 'cloud', tripId, inviteCode }
  myPersonId: null,     // wer sitzt an diesem Gerät
};

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let cache = read();

export function getPrefs() {
  return { ...cache };
}

export function setPrefs(patch) {
  cache = { ...cache, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Privater Modus oder volle Quote: die App läuft weiter, merkt sich nur nichts.
  }
  return getPrefs();
}

export function clearPrefs() {
  cache = { ...DEFAULTS };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* egal */
  }
}

/** Prüft, ob eine Firebase-Konfiguration die Felder hat, die wir brauchen. */
export function validateFirebaseConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return 'Keine Konfiguration erkannt.';
  const missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter((k) => !cfg[k]);
  if (missing.length) return `Es fehlt: ${missing.join(', ')}`;
  return null;
}

/**
 * Liest eine Firebase-Konfiguration aus dem, was Leute üblicherweise
 * hineinkopieren: reines JSON, oder der ganze `const firebaseConfig = {…};`
 * Block aus der Firebase-Konsole.
 */
export function parseFirebaseConfig(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  const body = raw.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    // Der Konsolen-Block ist JavaScript, kein JSON: Schlüssel und Hochkommata anpassen.
    try {
      const jsonish = body
        .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(jsonish);
    } catch {
      return null;
    }
  }
}
