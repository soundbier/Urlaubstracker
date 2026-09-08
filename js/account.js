/**
 * Was ein gültiges Konto ausmacht — reine Prüfungen, ohne Firebase.
 *
 * Getrennt von `auth.js` aus demselben Grund, aus dem `join.js` getrennt von
 * `backend-firestore.js` steht: das hier lässt sich prüfen, ohne eine
 * Verbindung aufzubauen, und die Tests laufen ohne ein einziges Byte Firebase.
 *
 * Ein Konto braucht diese App nur für eines: eine geteilte Kasse. Wer allein
 * auf diesem Gerät rechnet, braucht keins — deshalb steht hier auch nichts,
 * was über E-Mail, Passwort und Anzeigename hinausgeht. Je weniger ein Konto
 * über eine Person weiß, desto weniger kann darüber verlorengehen
 * (Art. 5 Abs. 1 lit. c DSGVO, Datenminimierung).
 */
import { checkNewPassword } from './join.js';

/** So lang darf ein Anzeigename werden — er steht in Listen, nicht in Aufsätzen. */
export const MAX_DISPLAY_NAME = 40;

/**
 * Groß-/Kleinschreibung und Leerzeichen wegräumen. Der lokale Teil einer
 * Adresse ist laut Norm zwar unterscheidungsfähig („Anna@“ ≠ „anna@“), in der
 * Praxis behandelt ihn kein Anbieter so — und Firebase legt Adressen ohnehin
 * kleingeschrieben ab. Einheitlich klein ist deshalb die ehrlichere Annahme
 * als ein Unterschied, den nachher niemand einhält.
 */
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Der Teil hinter dem @ — das, was über Wegwerf-Adressen entscheidet. Gibt
 * `''` zurück, wo nichts Brauchbares steht: eine leere Domain darf nie als
 * Dokumentkennung in einer Abfrage landen.
 */
export function emailDomain(email) {
  const parts = normalizeEmail(email).split('@');
  // Auch der Teil *vor* dem @ muss dastehen: „@example.com“ ist keine Adresse,
  // und eine Domain daraus zurückzugeben hieße, sie als eine zu behandeln.
  if (parts.length !== 2 || !parts[0]) return '';
  const domain = parts[1];
  // Keine Punkte am Rand, kein Doppelpunkt: was hier durchrutscht, wird gleich
  // zu einem Firestore-Pfadsegment.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return '';
  return domain;
}

/** Taugt die Adresse der Form nach? Gibt eine Meldung zurück, sonst `null`. */
export function checkEmail(email) {
  const value = normalizeEmail(email);
  if (!value) return 'Bitte eine E-Mail-Adresse eintragen.';
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0]) return 'Diese E-Mail-Adresse sieht nicht vollständig aus.';
  if (!emailDomain(value)) return 'Diese E-Mail-Adresse sieht nicht vollständig aus.';
  return null;
}

/**
 * Das Passwort fürs Konto. Dieselbe Messlatte wie beim Passwort einer neuen
 * Kasse (siehe `join.js`) — zwei verschiedene Vorstellungen davon, was ein
 * gutes Passwort ist, wären in einer App eine zu viel.
 */
export const checkAccountPassword = checkNewPassword;

/** Taugt der Anzeigename? Gibt eine Meldung zurück, sonst `null`. */
export function checkDisplayName(name) {
  const value = String(name || '').trim();
  if (!value) return 'Bitte einen Namen eintragen — er steht später an deinen Einträgen.';
  if (value.length > MAX_DISPLAY_NAME) return `Höchstens ${MAX_DISPLAY_NAME} Zeichen.`;
  return null;
}

/**
 * Aus Firebase-Fehlerkennungen wird ein Satz, den man lesen kann.
 *
 * Bewusst nicht für jede Kennung eine eigene Auskunft: ob eine Adresse schon
 * vergeben ist, verrät Firebase je nach Projekteinstellung gar nicht mehr
 * (Schutz vor dem Abklopfen, welche Adressen registriert sind) — und was die
 * App nicht sicher weiß, sollte sie auch nicht behaupten.
 */
export function describeAuthError(err) {
  const code = String(err?.code || err?.message || '');
  if (code.includes('auth/invalid-email')) return 'Diese E-Mail-Adresse sieht nicht vollständig aus.';
  if (code.includes('auth/email-already-in-use')) return 'Mit dieser Adresse gibt es schon ein Konto. Melde dich stattdessen an.';
  if (code.includes('auth/weak-password')) return 'Dieses Passwort ist zu kurz.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) {
    return 'E-Mail-Adresse oder Passwort stimmt nicht.';
  }
  if (code.includes('auth/too-many-requests')) return 'Zu viele Versuche. Warte einen Moment und probier es dann noch einmal.';
  if (code.includes('auth/network-request-failed')) return 'Dafür braucht es Empfang. Versuch es gleich noch einmal.';
  if (code.includes('auth/requires-recent-login')) return 'Das geht nur direkt nach einer Anmeldung. Melde dich einmal ab und wieder an.';
  if (code.includes('auth/operation-not-allowed')) return 'Anmeldung mit E-Mail und Passwort ist im Firebase-Projekt noch nicht aktiviert (Authentication → Sign-in method).';
  if (code.includes('auth/credential-already-in-use') || code.includes('auth/provider-already-linked')) {
    return 'Diese Adresse gehört schon zu einem anderen Konto.';
  }
  return err?.message || 'Das hat nicht geklappt.';
}
