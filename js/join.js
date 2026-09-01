/**
 * Beitreten mit Name und Passwort.
 *
 * Bisher war der Einladungslink der einzige Weg in eine geteilte Kasse: er trug
 * die Trip-Kennung und einen zufälligen Code, und wer ihn nicht bekam, kam nicht
 * rein. Ein Link ist aber nichts, was man am Frühstückstisch weitersagen kann.
 *
 * Deshalb rechnet die App beides aus zwei Angaben aus, die man sich merken und
 * vorlesen kann:
 *
 *   Name der Kasse   → Kennung des Trip-Dokuments (SHA-256)
 *   Name + Passwort  → Nachweis, den die Sicherheitsregeln gegen `inviteCode`
 *                      im Dokument prüfen (PBKDF2)
 *
 * Damit braucht ein fremdes Gerät nichts weiter als diese zwei Angaben. Der
 * Nachweis ist genau das, was vorher der Einladungscode war — an den Regeln in
 * `firestore.rules` ändert sich nichts.
 *
 * Das Passwort selbst wird nie übertragen und steht nirgends in der Datenbank:
 * dort liegt nur der abgeleitete Nachweis. Der Name bestimmt die Kennung, ist
 * also pro Firebase-Projekt eindeutig — zwei Kassen mit demselben Namen kann es
 * nicht geben, und das Anlegen sagt das auch.
 */

export const MIN_PASSWORD = 6;
export const MIN_NAME = 3;

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    // `crypto.subtle` gibt es nur in sicherem Kontext. Praktisch heißt das:
    // die Seite läuft über http statt https.
    throw new Error('Beitreten braucht eine sichere Verbindung (https). Über http kann der Browser das Passwort nicht prüfen.');
  }
  return s;
};

const bytes = (text) => new TextEncoder().encode(text);

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Alles wegräumen, was beim Abtippen wackelt: Groß- und Kleinschreibung,
 * doppelte Leerzeichen, Akzente, Binde- und Satzzeichen. „Roadtrip Süd 2026“,
 * „roadtrip-sued…“ — nein, das nicht: dieselbe Schreibweise muss es schon sein.
 * Aber „Roadtrip  Süd 2026 “ und „roadtrip süd 2026“ landen bei derselben Kasse.
 */
export function normalizeJoinName(name) {
  return String(name || '')
    .replace(/ß/g, 'ss')
    // NFKD zerlegt „ü“ in u + Zeichen; das Zeichen fällt danach weg.
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Taugt der Name als Beitrittsname? Gibt eine Meldung zurück, sonst `null`. */
export function checkJoinName(name) {
  const key = normalizeJoinName(name);
  if (!key) return 'Bitte einen Namen eintragen.';
  if (key.length < MIN_NAME) return `Der Name braucht mindestens ${MIN_NAME} Buchstaben oder Ziffern.`;
  return null;
}

/** Taugt das Passwort? Gibt eine Meldung zurück, sonst `null`. */
export function checkPassword(password) {
  const value = String(password || '');
  if (!value.trim()) return 'Bitte ein Passwort eintragen.';
  if (value.length < MIN_PASSWORD) return `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`;
  return null;
}

/**
 * Die Kennung des Trip-Dokuments. Sie hängt nur am Namen — sonst könnte ein
 * beitretendes Gerät das Dokument gar nicht erst finden.
 */
export async function tripIdForName(name) {
  const problem = checkJoinName(name);
  if (problem) throw new Error(problem);
  const digest = await subtle().digest('SHA-256', bytes(`urlaubstracker:trip:v1:${normalizeJoinName(name)}`));
  // Ein Buchstabe vorweg: Firestore mag keine Kennungen, die wie eine Zahl
  // aussehen könnten, und lesbar bleibt sie so auch.
  return `k${hex(digest).slice(0, 31)}`;
}

/**
 * Der Nachweis, der beim Beitreten mitgeschickt und serverseitig gegen den
 * gespeicherten Wert verglichen wird.
 *
 * PBKDF2 statt eines einzelnen Durchlaufs: in der Datenbank steht damit nichts,
 * woraus sich ein kurzes Passwort mal eben zurückrechnen ließe. Der Name dient
 * als Salz — dasselbe Passwort ergibt in einer anderen Kasse einen anderen Wert.
 */
export async function joinProofFor(name, password) {
  const nameProblem = checkJoinName(name);
  if (nameProblem) throw new Error(nameProblem);
  const passwordProblem = checkPassword(password);
  if (passwordProblem) throw new Error(passwordProblem);

  const material = await subtle().importKey('raw', bytes(String(password)), 'PBKDF2', false, ['deriveBits']);
  const derived = await subtle().deriveBits(
    {
      name: 'PBKDF2',
      salt: bytes(`urlaubstracker:join:v1:${normalizeJoinName(name)}`),
      iterations: 120000,
      hash: 'SHA-256',
    },
    material,
    256,
  );
  return hex(derived);
}

/** Kennung und Nachweis in einem Rutsch — beides wird immer zusammen gebraucht. */
export async function joinKeysFor(name, password) {
  const [tripId, proof] = await Promise.all([tripIdForName(name), joinProofFor(name, password)]);
  return { tripId, proof };
}

/**
 * Ein Vorschlag fürs Passwort. Zwei Silben und eine Zahl statt Zeichensalat:
 * das hier wird vorgelesen und in einen Chat getippt, nicht in einen
 * Passwortspeicher gelegt.
 */
export function suggestPassword() {
  const parts = ['sonne', 'welle', 'berg', 'route', 'anker', 'duene', 'strand', 'gipfel', 'insel', 'hafen'];
  const pick = () => parts[Math.floor(random() * parts.length)];
  return `${pick()}-${pick()}-${String(Math.floor(random() * 90) + 10)}`;
}

function random() {
  const buf = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  }
  return Math.random();
}
