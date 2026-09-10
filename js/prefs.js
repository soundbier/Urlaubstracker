/**
 * Geräteeigene Einstellungen — verschlüsselt im localStorage.
 *
 * Hier landet, was zum Gerät gehört: welcher Trip geöffnet ist, wer an diesem
 * Handy sitzt, wie hell es aussehen soll, und — falls eingerichtet — die
 * Firebase-Zugangsdaten samt Beitrittspasswort. Die Urlaubsdaten selbst liegen
 * im Backend (lokal oder Firestore).
 *
 * Das Beitrittspasswort ist der Grund, warum der ganze Datensatz verschlüsselt
 * abgelegt wird, nicht nur einzelne Felder: wer damit hereinkäme, sähe die
 * Finanzen der ganzen Gruppe.
 *
 * Eine Ausnahme: die Farbwahl (hell/dunkel) steht zusätzlich unverschlüsselt
 * unter einem eigenen Schlüssel (`THEME_KEY`). Sie muss feststehen, bevor
 * dieses Modul überhaupt geladen ist — das Anfangsskript in `index.html`
 * liest sie synchron, noch vor dem Stylesheet, damit abends nicht erst eine
 * helle Seite aufblitzt. Entschlüsseln ist unvermeidlich asynchron; für eine
 * Farbe, die niemandes Daten preisgibt, lohnt sich der Umweg nicht.
 */
import { secureRead, secureWrite, secureRemove } from './secure-storage.js';

const KEY = 'urlaubstracker.prefs.v1';
const THEME_KEY = 'urlaubstracker.theme.v1';

const DEFAULTS = {
  firebaseConfig: null, // { apiKey, authDomain, projectId, appId, … }
  // Eigener TomTom-API-Key für die Fahrzeitberechnung auf „Heute“ (siehe
  // `travel.js`). `null` heißt: es gilt der mit der Auslieferung mitgegebene
  // Key, falls es einen gibt (siehe `store.js`, `travelApiKey`).
  tomtomApiKey: null,
  // { mode: 'local' } | { mode: 'cloud', tripId, inviteCode }
  // Dazu, wenn bekannt: joinName und joinPassword — die zwei Angaben, mit denen
  // andere beitreten. Sie stehen hier und nicht im Trip: das Passwort gehört
  // nicht in die Datenbank, in der es geprüft wird.
  tripRef: null,
  myPersonId: null,     // wer sitzt an diesem Gerät
  // Hell ist die Standardversion — unabhängig davon, was das Gerät für sich
  // eingestellt hat. Wer das nicht will, wählt „Automatisch“ oder „Dunkel“
  // unter „Mehr → Dieses Gerät“; beides bleibt vollwertig erreichbar.
  theme: 'light',        // auto | light | dark
  // Was auf diesem Gerät zum Konto entschieden wurde: `null` heißt „noch
  // nicht gefragt“ (dann kommt die Anmeldemaske), 'local' heißt „nur auf
  // diesem Gerät, kein Konto“, 'account' heißt „hier meldet sich jemand an“.
  //
  // Der Unterschied zählt beim Start: nur bei 'account' lädt die App Firebase
  // von sich aus, um eine gespeicherte Anmeldung zurückzuholen. Bei 'local'
  // bleibt es beim Versprechen, dass im lokalen Modus kein einziges Byte
  // Firebase geladen wird (siehe `store.js`, `boot`).
  accountChoice: null,  // null | 'local' | 'account'
};

/**
 * Alle drei Werte kommen hierhin, auch „auto“ — nicht nur hell/dunkel. Ohne
 * das ließe sich in `index.html` nicht unterscheiden zwischen „noch nie
 * etwas gewählt“ (dann gilt Hell, die Standardversion) und „Automatisch
 * bewusst gewählt“ (dann soll das Gerät entscheiden): beides sähe von dort
 * aus wie ein fehlender Eintrag.
 */
function writeThemeMirror(theme) {
  try {
    if (theme === 'light' || theme === 'dark' || theme === 'auto') localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    /* egal — dann blitzt es beim nächsten Start eben einmal auf */
  }
}

async function load() {
  try {
    const raw = await secureRead(KEY);
    const merged = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    // Unbedingt nachziehen, nicht nur beim ersten Mal: aus einer Fassung vor
    // der eigenen Theme-Ablage fehlt sie sonst bis zur nächsten bewussten
    // Wahl, und genau bis dahin blitzt beim Start das falsche Thema auf.
    writeThemeMirror(merged.theme);
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

// Modul-Ebene mit `await`: die Einstellungen sind entschlüsselt, sobald
// dieses Modul fertig geladen ist (ES-Module warten aufeinander) — jeder
// Aufruf von `getPrefs()`/`setPrefs()` danach bleibt synchron, genau wie
// zuvor. Nur dieser eine Ladevorgang ist asynchron.
let cache = await load();

export function getPrefs() {
  return { ...cache };
}

export function setPrefs(patch) {
  cache = { ...cache, ...patch };
  if ('theme' in patch) writeThemeMirror(cache.theme);
  // Im Hintergrund verschlüsselt schreiben — der Aufruf hier bleibt
  // synchron, wie es die ganze App an dieser Stelle erwartet. Schlägt es
  // fehl (Speicher voll, privates Fenster), merkt sich die App währenddessen
  // trotzdem den neuen Stand im Arbeitsspeicher weiter.
  secureWrite(KEY, cache).catch(() => {});
  return getPrefs();
}

export function clearPrefs() {
  cache = { ...DEFAULTS };
  try {
    secureRemove(KEY);
    localStorage.removeItem(THEME_KEY);
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
