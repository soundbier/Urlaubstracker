/**
 * Die Kontologik — reine Prüfungen, ohne Firebase.
 *
 * Was hier zählt, ist vor allem `emailDomain`: der Rückgabewert wird in
 * `auth.js` und in `firestore.rules` zu einem Firestore-Pfadsegment. Was dort
 * durchrutscht, landet in einer Abfrage — deshalb prüft dieser Test vor allem
 * die Fälle, in denen nichts herauskommen darf.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEmail, emailDomain, checkEmail, checkDisplayName, checkAccountPassword,
  describeAuthError, MAX_DISPLAY_NAME, MIN_ACCOUNT_PASSWORD, MAX_ACCOUNT_PASSWORD,
} from '../js/account.js';

test('Adressen werden einheitlich klein und ohne Rand gelesen', () => {
  assert.equal(normalizeEmail('  Anna@Example.COM '), 'anna@example.com');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(undefined), '');
});

test('die Domain ist das, was hinter dem @ steht — sonst nichts', () => {
  assert.equal(emailDomain('anna@example.com'), 'example.com');
  assert.equal(emailDomain('  Anna@Sub.Example.co.uk '), 'sub.example.co.uk');
});

test('aus einer kaputten Adresse kommt keine Domain — und damit kein Pfadsegment', () => {
  // Jeder dieser Werte würde sonst in `blockedEmailDomains/$(domain)` landen.
  for (const bad of [
    '', 'anna', 'anna@', '@example.com', 'anna@@example.com',
    'anna@example', 'anna@.com', 'anna@example.', 'anna@-example.com',
    'anna@exa mple.com', 'anna@exam/ple.com', 'anna@example..com',
    null, undefined,
  ]) {
    assert.equal(emailDomain(bad), '', `„${bad}“ ergibt keine Domain`);
  }
});

test('die Adressprüfung nennt das Problem, statt nur „ungültig“ zu sagen', () => {
  assert.equal(checkEmail('anna@example.com'), null);
  assert.match(checkEmail(''), /eintragen/);
  assert.match(checkEmail('anna'), /vollständig/);
  assert.match(checkEmail('anna@example'), /vollständig/);
});

test('der Anzeigename darf alles sein, nur nicht leer oder endlos', () => {
  assert.equal(checkDisplayName('Anna'), null);
  assert.equal(checkDisplayName('  Anna  '), null, 'Leerzeichen am Rand zählen nicht mit');
  assert.match(checkDisplayName(''), /eintragen/);
  assert.match(checkDisplayName('   '), /eintragen/);
  assert.equal(checkDisplayName('x'.repeat(MAX_DISPLAY_NAME)), null);
  assert.match(checkDisplayName('x'.repeat(MAX_DISPLAY_NAME + 1)), /Höchstens/);
});

test('fürs Konto gilt eine mildere Messlatte als für ein neues Kassenpasswort', () => {
  // Firebase Authentication bremst selbst gegen Erraten (Ratenbegrenzung) —
  // hier reicht deshalb dieselbe Grenze, die Firebase Authentication selbst
  // verlangt: sechs bis 4096 Zeichen, ohne weitere Prüfung.
  assert.equal(checkAccountPassword('geheim'), null, 'sechs Zeichen reichen, ganz ohne Ansprüche an die Art');
  assert.equal(checkAccountPassword('passwort123'), null, 'anders als beim Kassenpasswort gilt hier keine Sperrliste');
  assert.equal(checkAccountPassword('x'.repeat(MAX_ACCOUNT_PASSWORD)), null, 'bis zur Grenze ist es gültig');
  assert.match(checkAccountPassword(''), /eintragen/);
  assert.match(checkAccountPassword('kurz'), new RegExp(`mindestens ${MIN_ACCOUNT_PASSWORD}`));
  assert.match(checkAccountPassword('x'.repeat(MAX_ACCOUNT_PASSWORD + 1)), /höchstens/);
});

test('Firebase-Fehler werden zu Sätzen, die man lesen kann', () => {
  assert.match(describeAuthError({ code: 'auth/email-already-in-use' }), /schon ein Konto/);
  assert.match(describeAuthError({ code: 'auth/invalid-credential' }), /stimmt nicht/);
  assert.match(describeAuthError({ code: 'auth/too-many-requests' }), /Warte/);
  assert.match(describeAuthError({ code: 'auth/network-request-failed' }), /Empfang/);
  // Ob eine Adresse schon vergeben ist, verrät Firebase je nach Einstellung
  // gar nicht mehr — was die App nicht sicher weiß, behauptet sie auch nicht.
  assert.match(describeAuthError({ code: 'auth/user-not-found' }), /stimmt nicht/);
  assert.equal(describeAuthError({ message: 'Sonderfall' }), 'Sonderfall');
});
