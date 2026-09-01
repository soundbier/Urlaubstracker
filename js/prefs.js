/**
 * Geräteeigene Einstellungen im localStorage.
 *
 * Hier landet nur, was zum Gerät gehört: welcher Trip geöffnet ist, wer an
 * diesem Handy sitzt, wie hell es aussehen soll, und — falls eingerichtet —
 * die Firebase-Zugangsdaten. Die Urlaubsdaten selbst liegen im Backend (lokal
 * oder Firestore).
 */

const KEY = 'urlaubstracker.prefs.v1';

const DEFAULTS = {
  firebaseConfig: null, // { apiKey, authDomain, projectId, appId, … }
  // { mode: 'local' } | { mode: 'cloud', tripId, inviteCode }
  // Dazu, wenn bekannt: joinName und joinPassword — die zwei Angaben, mit denen
  // andere beitreten. Sie stehen hier und nicht im Trip: das Passwort gehört
  // nicht in die Datenbank, in der es geprüft wird.
  tripRef: null,
  myPersonId: null,     // wer sitzt an diesem Gerät
  theme: 'auto',        // auto | light | dark
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

// ------------------------------------------------------------------ Aussehen

/**
 * Hell oder dunkel — die Wahl gehört aufs Gerät, nicht in den Trip: das eine
 * Handy liegt abends auf dem Nachttisch, das andere am Pool.
 *
 * `auto` folgt dem System. Aufgelöst wird das hier und nicht im Stylesheet:
 * am <html> steht danach immer `light` oder `dark`, und die dunklen Farben
 * müssen nur einmal dastehen statt zweimal — einmal für die Medienabfrage,
 * einmal für die bewusste Wahl.
 */
const darkMedia = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function resolveTheme(theme = cache.theme) {
  if (theme === 'dark' || theme === 'light') return theme;
  return darkMedia?.matches ? 'dark' : 'light';
}

export function applyTheme(theme = cache.theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  // Die Adressleiste färbt sich mit: sonst steht über der dunklen App ein
  // heller Streifen, der beim Scrollen mitwandert.
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (meta && bg) meta.setAttribute('content', bg);
  return resolved;
}

export function setTheme(theme) {
  setPrefs({ theme: theme === 'dark' || theme === 'light' ? theme : 'auto' });
  return applyTheme();
}

// Wer „Automatisch“ stehen lässt, soll abends nicht die App neu starten müssen.
darkMedia?.addEventListener?.('change', () => {
  if (cache.theme === 'auto') applyTheme();
});

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
