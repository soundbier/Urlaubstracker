/**
 * Geräteeigene Einstellungen — vor allem das Beitrittspasswort darin.
 *
 * `tripRef.joinPassword` ist das Feld, das ein anderes Gerät ungefragt in die
 * Kasse ließe. Geprüft wird, dass es verschlüsselt liegt, dass ein neu
 * geladenes Modul denselben Stand wiederfindet, und dass die Farbwahl davon
 * bewusst ausgenommen bleibt — sie muss synchron feststehen, bevor dieses
 * Modul überhaupt geladen ist (siehe der Kommentar in `index.html`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './helpers/fake-indexeddb.mjs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
installFakeIndexedDB();
// `prefs.js` fragt beim Laden nach der bevorzugten Farbe — im Test reicht
// „keine Meinung“, damit `resolveTheme()` nicht an einem fehlenden Browser
// scheitert.
globalThis.matchMedia = undefined;

const PREFS_KEY = 'urlaubstracker.prefs.v1';
const THEME_KEY = 'urlaubstracker.theme.v1';

const prefs = await import('../js/prefs.js');
const { secureRead } = await import('../js/secure-storage.js');

test('das Beitrittspasswort liegt verschlüsselt, nicht im Klartext', async () => {
  prefs.setPrefs({ tripRef: { mode: 'cloud', tripId: 'abc123', inviteCode: 'geheim', joinName: 'Kim', joinPassword: 'S0nnenblume!' } });
  // Der Schreibvorgang läuft im Hintergrund — kurz nachgeben (Schlüssel
  // erzeugen und verschlüsseln brauchen selbst ein paar echte Umläufe).
  await new Promise((r) => setTimeout(r, 50));

  const raw = store.get(PREFS_KEY);
  assert.ok(raw, 'es wurde etwas gespeichert');
  assert.ok(!raw.includes('S0nnenblume'), 'das Passwort steht nicht im Klartext im Speicher');
  assert.ok(!raw.includes('geheim'), 'auch der Einladungscode nicht');
  const envelope = JSON.parse(raw);
  assert.equal(envelope.v, 1);

  assert.deepEqual((await secureRead(PREFS_KEY)).tripRef, {
    mode: 'cloud', tripId: 'abc123', inviteCode: 'geheim', joinName: 'Kim', joinPassword: 'S0nnenblume!',
  });
});

test('getPrefs() liest sofort — kein Warten auf den Schreibvorgang', () => {
  prefs.setPrefs({ myPersonId: 'p9' });
  // Synchron, direkt danach: der Zwischenspeicher gilt schon, bevor
  // überhaupt verschlüsselt geschrieben wurde.
  assert.equal(prefs.getPrefs().myPersonId, 'p9');
});

test('die Farbwahl steht zusätzlich unverschlüsselt an ihrer eigenen Stelle', async () => {
  // `setPrefs` direkt statt `setTheme()`: die Farbe auch auf die Seite
  // anzuwenden (`applyTheme`) braucht ein DOM, das dieser Test nicht hat —
  // hier geht es nur um die Ablage, nicht um die Anzeige.
  prefs.setPrefs({ theme: 'dark' });
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(store.get(THEME_KEY), 'dark', 'genau das liest das Skript in index.html synchron');
  assert.equal(prefs.getPrefs().theme, 'dark');

  prefs.setPrefs({ theme: 'auto' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(store.has(THEME_KEY), false, '„automatisch“ hinterlässt keinen eigenen Eintrag');
});

test('clearPrefs() räumt beide Stellen weg', async () => {
  prefs.setPrefs({ tripRef: { mode: 'local' }, theme: 'light' });
  await new Promise((r) => setTimeout(r, 50));

  prefs.clearPrefs();
  assert.equal(store.has(PREFS_KEY), false);
  assert.equal(store.has(THEME_KEY), false);
  assert.equal(prefs.getPrefs().tripRef, null);
  assert.equal(prefs.getPrefs().theme, 'auto');
});
