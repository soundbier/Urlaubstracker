/**
 * Das Konto: anmelden, registrieren, bestätigen, wieder loswerden.
 *
 * Ein Konto braucht diese App für genau eine Sache — eine Kasse, die mehr als
 * ein Gerät sieht. Wer allein auf diesem Gerät rechnet, kommt ohne aus und
 * lädt diese Datei nie (sie wird, wie `backend-firestore.js`, erst bei Bedarf
 * nachgeladen). Die Linie verläuft also nicht zwischen „angemeldet“ und
 * „nicht angemeldet“, sondern zwischen „auf diesem Gerät“ und „geteilt“.
 *
 * Warum überhaupt Konten, wo doch Name und Passwort der Kasse bisher
 * gereicht haben: bisher gehörte eine Kasse den *Geräten*, die in
 * `memberUids` standen — ein neues Handy hieß neu beitreten, ein verlorenes
 * hieß aussperren, und wer beides hatte, belegte zwei der acht Plätze. Mit
 * einem Konto gehört sie *Menschen*. Nebenbei wird damit erst durchsetzbar,
 * was ohne Konto nicht ging: eine bestätigte E-Mail-Adresse und die Sperre
 * gegen Wegwerf-Adressen (siehe `firestore.rules`).
 *
 * Ehrlich zur Grenze: das Konto liegt bei Firebase Authentication, und
 * Firebase Authentication speichert in den USA — anders als die Kasse selbst,
 * für die sich eine EU-Region wählen lässt. E-Mail-Adresse, Passwort-Hash und
 * die IP-Adressen der Anmeldungen verlassen damit den EWR. Das steht so auch
 * in der Datenschutzerklärung der App (`privacy.js`); wer das nicht will,
 * bleibt beim lokalen Modus, der ohne Konto auskommt.
 */
import * as fb from '../vendor/firebase.js';
import { connectFirebase, currentUser } from './firebase-app.js';
import { normalizeEmail, emailDomain, checkEmail, checkAccountPassword, checkDisplayName, describeAuthError } from './account.js';

/**
 * Die Sammlung, gegen die Wegwerf-Adressen geprüft werden — dieselbe, die
 * auch `firestore.rules` befragt. Eine Liste, zwei Leser: das Formular für
 * die sofortige Rückmeldung, die Regeln für die tatsächliche Durchsetzung.
 * Zwei getrennte Listen wären früher oder später zwei verschiedene Listen.
 */
const BLOCKLIST = 'blockedEmailDomains';

const listeners = new Set();

/**
 * Fünf Zustände, weil vier davon verschiedene Bildschirme bedeuten:
 *
 *   unknown    — noch nicht nachgesehen (beim Start, bis Firebase antwortet)
 *   signedOut  — niemand angemeldet
 *   anonymous  — anonym angemeldet: der Zustand aus der Zeit vor den Konten.
 *                Bestehende geteilte Kassen hängen daran; wer hier ein Konto
 *                anlegt, behält sie (siehe `signUp`).
 *   unverified — Konto da, E-Mail noch nicht bestätigt
 *   ready      — Konto da und bestätigt
 */
let state = { status: 'unknown', uid: null, email: '', displayName: '', emailVerified: false };

export function getAuthState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function emit(next) {
  state = next;
  for (const fn of listeners) fn(state);
}

function describe(user) {
  if (!user) return { status: 'signedOut', uid: null, email: '', displayName: '', emailVerified: false };
  if (user.isAnonymous) return { status: 'anonymous', uid: user.uid, email: '', displayName: '', emailVerified: false };
  return {
    status: user.emailVerified ? 'ready' : 'unverified',
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    emailVerified: !!user.emailVerified,
  };
}

let conn = null;

/**
 * Verbindung herstellen und ab jetzt jede Änderung am Anmeldezustand melden.
 * Mehrfach aufrufen ist harmlos — die Verbindung entsteht nur einmal.
 */
export async function start(config) {
  conn = connectFirebase(config);
  await conn.ready;
  fb.onAuthStateChanged(conn.auth, (user) => emit(describe(user)));
  // Den ersten Bericht abwarten: erst danach steht fest, ob eine gespeicherte
  // Anmeldung wiedergekommen ist. Ohne das zeigte die App beim Start kurz die
  // Anmeldemaske, obwohl längst jemand angemeldet ist.
  await currentUser(conn.auth);
  return state;
}

function requireConnection() {
  if (!conn) throw new Error('Für ein Konto braucht dieses Gerät zuerst die Firebase-Konfiguration der Gruppe.');
  return conn;
}

// ------------------------------------------------------------ Wegwerf-Adressen

/**
 * Steht die Domain dieser Adresse auf der Sperrliste?
 *
 * Gefragt wird dieselbe Sammlung, die auch die Sicherheitsregeln befragen —
 * hier nur, um es *vor* dem Anlegen sagen zu können, statt jemanden ein
 * Konto erstellen zu lassen, das anschließend zu nichts taugt. Verlassen darf
 * sich die App darauf nicht: durchgesetzt wird die Sperre in den Regeln, wo
 * sie sich nicht umgehen lässt.
 *
 * Ist die Liste nicht erreichbar, gilt die Adresse hier als in Ordnung — die
 * Regeln fangen den Fall dann ohnehin ab, und ein Netzfehler soll niemanden
 * fälschlich aussperren.
 */
export async function isDisposableEmail(email) {
  const domain = emailDomain(email);
  if (!domain) return false;
  try {
    const { db } = requireConnection();
    const snap = await fb.getDoc(fb.doc(db, BLOCKLIST, domain));
    return snap.exists();
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------- Anmelden

/**
 * Konto anlegen.
 *
 * Der wichtige Teil steht in `linkWithCredential`: wer dieses Gerät bisher
 * anonym benutzt hat, hat womöglich schon eine geteilte Kasse — und die hängt
 * an der anonymen Kennung. Ein frisch angelegtes Konto hätte eine neue
 * Kennung, und die Kasse wäre weg. `linkWithCredential` hebt stattdessen die
 * bestehende Anmeldung an: dieselbe Kennung, jetzt mit E-Mail und Passwort.
 * Alles, worin dieses Gerät Mitglied war, bleibt es.
 */
export async function signUp({ email, password, displayName }) {
  const { auth } = requireConnection();
  const address = normalizeEmail(email);
  const name = String(displayName || '').trim();

  for (const problem of [checkEmail(address), checkAccountPassword(password), checkDisplayName(name)]) {
    if (problem) throw new Error(problem);
  }
  if (await isDisposableEmail(address)) {
    throw new Error('Diese Adresse gehört zu einem Wegwerf-Postfach. Bitte nimm eine Adresse, die dir auch morgen noch gehört.');
  }

  try {
    const credential = fb.EmailAuthProvider.credential(address, password);
    const existing = auth.currentUser;
    const result = existing?.isAnonymous
      ? await fb.linkWithCredential(existing, credential)
      : await fb.createUserWithEmailAndPassword(auth, address, password);

    await fb.updateProfile(result.user, { displayName: name });
    await fb.sendEmailVerification(result.user);
    emit(describe(result.user));
    return state;
  } catch (err) {
    throw new Error(describeAuthError(err));
  }
}

export async function signIn({ email, password }) {
  const { auth } = requireConnection();
  try {
    const result = await fb.signInWithEmailAndPassword(auth, normalizeEmail(email), password);
    emit(describe(result.user));
    return state;
  } catch (err) {
    throw new Error(describeAuthError(err));
  }
}

export async function signOutAccount() {
  const { auth } = requireConnection();
  await fb.signOut(auth);
  emit(describe(null));
}

// ---------------------------------------------------------------- Bestätigung

/** Die Bestätigungsmail noch einmal schicken. */
export async function resendVerification() {
  const { auth } = requireConnection();
  const user = auth.currentUser;
  if (!user) throw new Error('Dafür musst du angemeldet sein.');
  try {
    await fb.sendEmailVerification(user);
  } catch (err) {
    throw new Error(describeAuthError(err));
  }
}

/**
 * Nachsehen, ob die Adresse inzwischen bestätigt ist.
 *
 * Zwei Schritte, und beide sind nötig: `reload()` holt den Kontostand neu,
 * `getIdToken(true)` erneuert das Merkmal, das die Sicherheitsregeln lesen
 * (`email_verified`). Ohne den zweiten Schritt zeigt die App „bestätigt“, und
 * der Server sieht weiterhin das alte „nein“ — der verwirrendste aller
 * Zwischenzustände.
 */
export async function refreshVerification() {
  const { auth } = requireConnection();
  const user = auth.currentUser;
  if (!user) return state;
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
  emit(describe(auth.currentUser));
  return state;
}

// ------------------------------------------------------------------- Verwalten

export async function resetPassword(email) {
  const { auth } = requireConnection();
  const address = normalizeEmail(email);
  const problem = checkEmail(address);
  if (problem) throw new Error(problem);
  try {
    await fb.sendPasswordResetEmail(auth, address);
  } catch (err) {
    throw new Error(describeAuthError(err));
  }
}

export async function changeDisplayName(displayName) {
  const { auth } = requireConnection();
  const name = String(displayName || '').trim();
  const problem = checkDisplayName(name);
  if (problem) throw new Error(problem);
  const user = auth.currentUser;
  if (!user) throw new Error('Dafür musst du angemeldet sein.');
  await fb.updateProfile(user, { displayName: name });
  emit(describe(user));
}

/**
 * Konto löschen (Art. 17 DSGVO).
 *
 * Firebase verlangt dafür eine frische Anmeldung — sonst könnte ein fremder
 * Griff an ein offen liegendes Gerät das Konto mitsamt allem wegräumen.
 * Deshalb das Passwort noch einmal.
 *
 * Was diese Funktion *nicht* tut: die Person aus ihren Kassen austragen. Das
 * muss vorher passieren, solange die Anmeldung noch gilt — danach gibt es
 * niemanden mehr, der es dürfte, und die Kennung stünde für immer in
 * `memberUids`. Siehe `store.js`, wo beides zusammen abläuft.
 */
export async function deleteAccount(password) {
  const { auth } = requireConnection();
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Dafür musst du mit einem Konto angemeldet sein.');
  try {
    const credential = fb.EmailAuthProvider.credential(user.email, password);
    await fb.reauthenticateWithCredential(user, credential);
    await fb.deleteUser(user);
    emit(describe(null));
  } catch (err) {
    throw new Error(describeAuthError(err));
  }
}
