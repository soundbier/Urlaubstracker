/**
 * Übergänge rund um Konto und Kassenliste — reine Zustandslogik aus `store.js`.
 *
 * Ein echter Auf- und Abbau (Firestore, `LocalBackend`) bleibt außen vor;
 * `_setStateForTests` stellt stattdessen genau die Zustände nach, die sich
 * sonst nur mit einem echten Firebase-Projekt nachstellen ließen — etwa
 * „gerade angemeldet, aber das lokale Backend steckt noch im leeren
 * Anfangszustand“.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Store importiert prefs.js (verschlüsselt im localStorage) und darüber
// secure-storage.js (IndexedDB) — dieselben Ersatzstücke wie in lock.test.js
// und trash.test.js, hier vor dem Import gesetzt, weil store.js sie beim
// Laden schon braucht.
const raw = new Map();
globalThis.localStorage = {
  getItem: (k) => (raw.has(k) ? raw.get(k) : null),
  setItem: (k, v) => raw.set(k, String(v)),
  removeItem: (k) => raw.delete(k),
};
globalThis.addEventListener = () => {};

const { installFakeIndexedDB } = await import('./helpers/fake-indexeddb.mjs');
installFakeIndexedDB();

const store = await import('../js/store.js');

function reset(patch) {
  store._setStateForTests({
    account: { status: 'unknown', uid: null, email: '', displayName: '', emailVerified: false },
    invite: null,
    trip: null,
    phase: 'onboarding',
    showTripList: false,
    ...patch,
  });
}

test('frisches Gerät, gerade angemeldet: die Liste erscheint, nicht „Kasse anlegen“', () => {
  // Genau der gemeldete Fall: ein Gerät ohne lokale Kasse meldet `phase:
  // 'onboarding'` (leerer lokaler Speicher, nichts mit dem Konto zu tun) —
  // und zwar auch dann noch, wenn die Anmeldung längst durch ist.
  reset({ account: { status: 'ready', uid: 'u1', email: 'a@example.org', displayName: 'Anna', emailVerified: true } });
  assert.equal(store.needsTripList(), true);
  assert.equal(store.needsAccountScreen(), false, 'angemeldet ist angemeldet — die Maske kommt nicht noch einmal');
});

test('ohne Konto bleibt „Kasse anlegen“ die richtige Antwort', () => {
  reset({ account: { status: 'localOnly' } });
  assert.equal(store.needsTripList(), false);
});

test('mit offener Kasse drängt sich die Liste nicht auf — „Meine Kassen“ ist der Weg dorthin', () => {
  reset({
    account: { status: 'ready', uid: 'u1' },
    trip: { id: 't1', name: 'Roadtrip' },
    phase: 'ready',
  });
  assert.equal(store.needsTripList(), false);
});

test('ausdrücklich aufgerufen (Einstellungen → Meine Kassen) erscheint sie trotz offener Kasse', () => {
  reset({
    account: { status: 'ready', uid: 'u1' },
    trip: { id: 't1', name: 'Roadtrip' },
    phase: 'ready',
    showTripList: true,
  });
  assert.equal(store.needsTripList(), true);
});

test('eine angetippte Einladung geht der Liste vor', () => {
  reset({
    account: { status: 'ready', uid: 'u1' },
    invite: { tripId: 'x', inviteCode: 'y' },
  });
  assert.equal(store.needsTripList(), false);
});
