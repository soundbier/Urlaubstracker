/**
 * Gerätesperre: ein Code vor der App.
 *
 * Die Anmeldung bei Firebase ist anonym und gilt dauerhaft — genau das macht
 * die App bequem: einmal beigetreten, immer drin, auch offline. Für ein
 * verlorenes oder gestohlenes Handy heißt dasselbe aber: wer es aufklappt,
 * sieht die Finanzen der ganzen Gruppe. Bisher war dagegen nichts vorgesehen.
 *
 * Was diese Sperre ist: ein Riegel vor der Oberfläche. Ohne Code kommt niemand
 * an die Ansichten, die Beitrittsdaten oder den Export.
 *
 * Was sie nicht ist: eine Verschlüsselung. Die Daten liegen weiterhin im
 * Speicher des Browsers, und wer das Gerät entsperrt in der Hand hält und sich
 * mit Entwicklerwerkzeugen auskennt, kommt daran vorbei. Der eigentliche Schutz
 * ist und bleibt die Sperre des Geräts selbst; diese hier ist die zweite Tür
 * für den Fall, dass das Handy unbeaufsichtigt und entsperrt herumliegt.
 * Deshalb steht sie auch so in den Einstellungen.
 *
 * Der Code selbst wird nirgends gespeichert — nur ein PBKDF2-Wert mit
 * zufälligem Salz, wie beim Beitrittspasswort in `join.js`. Vergessen heißt
 * deshalb: Sperre nur noch mit den Daten dieses Geräts zusammen loszuwerden.
 * Danach kommt man über Name und Passwort wieder in die Kasse.
 */

const KEY = 'urlaubstracker.lock.v1';

export const MIN_CODE = 4;
export const MAX_CODE = 12;

/** Nach wie vielen Minuten im Hintergrund wieder zugesperrt wird. */
export const DELAYS = [
  [0, 'Sofort', 'Sobald die App in den Hintergrund geht.'],
  [1, 'Nach 1 Minute', null],
  [5, 'Nach 5 Minuten', 'Kurz die Karte aufmachen, ohne neu zu tippen.'],
  [15, 'Nach 15 Minuten', null],
];

/** Ab hier wird gebremst, damit sich vierstellige Codes nicht durchprobieren lassen. */
const FREE_TRIES = 3;
const MAX_WAIT_MS = 5 * 60000;

const DEFAULTS = { code: null, minutes: 5, biometrics: null, failures: 0, blockedUntil: 0 };

function read() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(patch) {
  config = { ...config, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* Privater Modus: die Sperre gilt dann nur für diese Sitzung. */
  }
  emit();
  return config;
}

let config = read();
// Beim Kaltstart ist zu: eine Sperre, die einen Neustart nicht übersteht, ist keine.
let locked = !!config.code;
const listeners = new Set();
let hiddenSince = 0;

/**
 * Nur melden, wenn sich am *sichtbaren* Zustand etwas geändert hat.
 *
 * Sonst löst jeder Fehlversuch ein Neuzeichnen aus — die App hängt am
 * Sperrbildschirm ja mit `subscribe` —, und die Meldung „Falscher Code“ wäre
 * schon wieder weg, bevor jemand sie lesen kann. Der Zähler der Fehlversuche
 * gehört deshalb bewusst nicht dazu; die Wartezeit fragt der Sperrbildschirm
 * über `waitMs()` selbst ab.
 */
let lastKey = null;

function emit() {
  const s = status();
  const key = `${s.enabled}|${s.locked}|${s.minutes}|${s.biometrics}`;
  if (key === lastKey) return;
  lastKey = key;
  for (const fn of listeners) fn(s);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(status());
  return () => listeners.delete(fn);
}

export function status() {
  return {
    enabled: !!config.code,
    locked: !!config.code && locked,
    minutes: config.minutes,
    biometrics: !!config.biometrics,
  };
}

export const isEnabled = () => !!config.code;
export const isLocked = () => !!config.code && locked;

// ------------------------------------------------------------------ Rechnen

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Dafür braucht der Browser eine sichere Verbindung (https).');
  return s;
};

const bytes = (text) => new TextEncoder().encode(text);
const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

function randomHex(n) {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return hex(buf);
}

async function derive(code, salt, iterations) {
  const material = await subtle().importKey('raw', bytes(String(code)), 'PBKDF2', false, ['deriveBits']);
  const out = await subtle().deriveBits(
    { name: 'PBKDF2', salt: bytes(`urlaubstracker:lock:v1:${salt}`), iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return hex(out);
}

/** Zeichenweise gleich lang vergleichen — nicht beim ersten Unterschied abbrechen. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Taugt der Code? Gibt eine Meldung zurück, sonst `null`. */
export function checkCode(code) {
  const value = String(code || '');
  if (!value) return 'Bitte einen Code eintragen.';
  if (!/^\d+$/.test(value)) return 'Nur Ziffern.';
  if (value.length < MIN_CODE) return `Mindestens ${MIN_CODE} Ziffern.`;
  if (value.length > MAX_CODE) return `Höchstens ${MAX_CODE} Ziffern.`;
  if (/^(\d)\1+$/.test(value)) return 'Eine Ziffer immer wieder ist zu wenig.';
  const ascending = [...value].every((c, i, all) => i === 0 || c.charCodeAt(0) - all[i - 1].charCodeAt(0) === 1);
  const descending = [...value].every((c, i, all) => i === 0 || c.charCodeAt(0) - all[i - 1].charCodeAt(0) === -1);
  if (ascending || descending) return 'Eine Zahlenreihe ist zu leicht geraten.';
  return null;
}

// ------------------------------------------------------------- Einrichten

/** Sperre einschalten oder den Code ändern. */
export async function setCode(code) {
  const problem = checkCode(code);
  if (problem) throw new Error(problem);
  const salt = randomHex(16);
  const iterations = 200000;
  write({ code: { salt, iterations, hash: await derive(code, salt, iterations) }, failures: 0, blockedUntil: 0 });
  locked = false;
  emit();
}

/** Sperre ausschalten — nur mit dem gültigen Code. */
export async function disable(code) {
  if (!(await verify(code))) throw new Error('Der Code stimmt nicht.');
  write({ ...DEFAULTS });
  locked = false;
  emit();
}

export function setDelay(minutes) {
  const allowed = DELAYS.map(([m]) => m);
  write({ minutes: allowed.includes(minutes) ? minutes : 5 });
}

// --------------------------------------------------------------- Aufsperren

/** Wie lange dieses Gerät nach zu vielen Fehlversuchen noch warten muss. */
export function waitMs() {
  return Math.max(0, (config.blockedUntil || 0) - Date.now());
}

/**
 * Prüft den Code — und bremst nach den ersten Fehlversuchen exponentiell ab.
 * Vier Ziffern sind schnell durchprobiert, wenn niemand dazwischengeht.
 */
export async function verify(code) {
  if (!config.code) return true;
  if (waitMs() > 0) throw new Error('Zu viele Versuche. Kurz warten.');

  const hash = await derive(code, config.code.salt, config.code.iterations);
  if (sameSecret(hash, config.code.hash)) {
    write({ failures: 0, blockedUntil: 0 });
    return true;
  }

  const failures = (config.failures || 0) + 1;
  const over = failures - FREE_TRIES;
  const wait = over > 0 ? Math.min(MAX_WAIT_MS, 2 ** (over - 1) * 5000) : 0;
  write({ failures, blockedUntil: wait ? Date.now() + wait : 0 });
  return false;
}

export async function unlock(code) {
  if (!(await verify(code))) return false;
  locked = false;
  emit();
  return true;
}

export function lock() {
  if (!config.code || locked) return;
  locked = true;
  emit();
}

// -------------------------------------------------------------- Biometrie

/**
 * Fingerabdruck oder Gesicht statt Zifferncode — über WebAuthn, mit dem
 * Authenticator, den das Gerät ohnehin mitbringt.
 *
 * Ehrlich gesagt, was das leistet: hier steht kein Server, der die Signatur
 * nachrechnet. Geprüft wird also nicht kryptografisch, sondern es wird
 * verlangt, dass das Gerät seine eigene Nutzerprüfung durchführt und den
 * hinterlegten Schlüssel wiederfindet. Für den Fall, gegen den diese Sperre
 * hilft — jemand hat das entsperrte Handy in der Hand — reicht das. Der
 * Zifferncode bleibt deshalb daneben bestehen und ist der Weg, der immer geht.
 */
export async function biometricsAvailable() {
  try {
    if (!globalThis.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

const toBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function challenge() {
  const buf = new Uint8Array(32);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export async function enrollBiometrics() {
  if (!config.code) throw new Error('Erst einen Code einrichten, dann kommt die Biometrie dazu.');
  const userId = new Uint8Array(16);
  globalThis.crypto.getRandomValues(userId);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: 'Urlaubstracker' },
      user: { id: userId, name: 'Urlaubskasse', displayName: 'Dieses Gerät' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!credential) throw new Error('Das hat nicht geklappt.');
  write({ biometrics: { id: toBase64(credential.rawId) } });
}

export function disableBiometrics() {
  write({ biometrics: null });
}

export async function unlockWithBiometrics() {
  if (!config.biometrics?.id) return false;
  if (waitMs() > 0) throw new Error('Zu viele Versuche. Kurz warten.');
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: challenge(),
      allowCredentials: [{ type: 'public-key', id: fromBase64(config.biometrics.id) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!assertion) return false;
  write({ failures: 0, blockedUntil: 0 });
  locked = false;
  emit();
  return true;
}

// ------------------------------------------------------------ Von allein zu

/**
 * Zusperren, wenn die App lange genug aus dem Blick war. „Lange genug“ ist
 * einstellbar: sofort ist am sichersten, fünf Minuten am erträglichsten, wenn
 * unterwegs ständig zwischen Karte und Kasse gewechselt wird.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenSince = Date.now();
      if (config.minutes === 0) lock();
      return;
    }
    if (!hiddenSince) return;
    const away = Date.now() - hiddenSince;
    hiddenSince = 0;
    if (away >= config.minutes * 60000) lock();
  });

  // Ein zweiter Tab, der die Sperre einschaltet oder den Code ändert, gilt
  // auch hier — sonst steht auf einem Gerät beides gleichzeitig.
  addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    config = read();
    if (!config.code) locked = false;
    emit();
  });
}
