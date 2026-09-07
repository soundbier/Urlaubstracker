/**
 * Die verschlüsselte Ablage.
 *
 * Geprüft wird, was diese Datei zusichert: AES-256-GCM mit echtem Web Crypto,
 * ein neuer IV pro Schreibvorgang, ein Schlüssel, der IndexedDB-Neustarts
 * übersteht, eine saubere Migration aus unverschlüsseltem Altbestand, und ein
 * sauberer Fehler statt eines Absturzes, wenn ein Datensatz nicht mehr lesbar
 * ist.
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

const { secureRead, secureWrite, secureRemove, SecureStorageError, _forgetCachedKeyForTests } =
  await import('../js/secure-storage.js');

test('nichts abgelegt heißt undefined, kein Fehler', async () => {
  store.clear();
  assert.equal(await secureRead('nichts-da'), undefined);
});

test('geschrieben, gelesen, derselbe Wert', async () => {
  store.clear();
  const value = { trip: { name: 'Norwegen', people: ['Marie', 'Lukas'] }, amount: 4500 };
  await secureWrite('k1', value);
  assert.deepEqual(await secureRead('k1'), value);
});

test('im Speicher steht kein Klartext', async () => {
  store.clear();
  await secureWrite('k1', { geheim: 'Passwort123', name: 'Trollstigen Ticket' });
  const raw = store.get('k1');
  assert.ok(!raw.includes('geheim'), 'Feldname nicht im Klartext');
  assert.ok(!raw.includes('Passwort123'));
  assert.ok(!raw.includes('Trollstigen'));
  const envelope = JSON.parse(raw);
  assert.equal(envelope.v, 1);
  assert.ok(envelope.iv && envelope.ct, 'IV und Ciphertext stehen da');
});

test('zwei Verschlüsselungen desselben Werts ergeben unterschiedliche IVs und Ciphertexte', async () => {
  store.clear();
  await secureWrite('a', { x: 1 });
  const first = JSON.parse(store.get('a'));
  await secureWrite('a', { x: 1 });
  const second = JSON.parse(store.get('a'));
  assert.notEqual(first.iv, second.iv, 'jeder Schreibvorgang bekommt einen neuen IV');
  assert.notEqual(first.ct, second.ct, 'derselbe Klartext ergibt deshalb einen anderen Ciphertext');
  // Trotzdem entschlüsseln beide zum selben Wert.
  assert.deepEqual(await secureRead('a'), { x: 1 });
});

test('eine verstellte Ciphertext wird erkannt, nicht stillschweigend hingenommen', async () => {
  store.clear();
  await secureWrite('k', { amount: 100 });
  const envelope = JSON.parse(store.get('k'));
  // Ein Byte in der Mitte der Ciphertext kippen.
  const bytes = [...envelope.ct];
  const mid = Math.floor(bytes.length / 2);
  bytes[mid] = bytes[mid] === 'A' ? 'B' : 'A';
  envelope.ct = bytes.join('');
  store.set('k', JSON.stringify(envelope));

  await assert.rejects(() => secureRead('k'), SecureStorageError);
});

test('kaputtes JSON am Speicherplatz wird gemeldet, nicht als Wert durchgereicht', async () => {
  store.clear();
  store.set('k', '{nicht: gültig');
  await assert.rejects(() => secureRead('k'), SecureStorageError);
});

test('unverschlüsselter Altbestand wird gelesen und im Hintergrund verschlüsselt', async () => {
  store.clear();
  // So, wie eine Fassung vor dieser Datei hier gespeichert hätte: rohes JSON.
  store.set('alt', JSON.stringify({ trip: { name: 'Alte Reise' } }));

  const value = await secureRead('alt');
  assert.deepEqual(value, { trip: { name: 'Alte Reise' } }, 'der Altbestand kommt unverändert zurück');

  // Migration läuft im Hintergrund — kurz nachgeben (Schlüssel erzeugen
  // und verschlüsseln brauchen selbst ein paar echte Umläufe).
  await new Promise((r) => setTimeout(r, 50));

  const raw = store.get('alt');
  assert.ok(!raw.includes('Alte Reise'), 'am Speicherplatz steht jetzt kein Klartext mehr');
  assert.deepEqual(await secureRead('alt'), { trip: { name: 'Alte Reise' } }, 'und liest sich weiterhin richtig');
});

test('entfernen braucht keine Entschlüsselung und funktioniert synchron', async () => {
  store.clear();
  await secureWrite('weg', { a: 1 });
  secureRemove('weg');
  assert.equal(await secureRead('weg'), undefined);
});

test('der Schlüssel übersteht einen simulierten Neustart', async () => {
  store.clear();
  await secureWrite('bleibt', { treu: true });

  // „Neustart“: der zwischengespeicherte Schlüssel im Arbeitsspeicher ist
  // weg, IndexedDB (der fake) bleibt aber bestehen — wie beim echten Browser.
  _forgetCachedKeyForTests();

  assert.deepEqual(await secureRead('bleibt'), { treu: true }, 'derselbe Schlüssel wird aus IndexedDB wiedergefunden');
});

test('ohne Web Crypto gibt es einen sauberen Fehler, keinen Absturz', async () => {
  store.clear();
  const realCrypto = globalThis.crypto;
  // `crypto` ist in Node nur über einen Getter da — für diesen einen Test
  // absichtlich durch eine Fassung ohne `.subtle` ersetzt.
  Object.defineProperty(globalThis, 'crypto', {
    value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) },
    configurable: true,
  });
  _forgetCachedKeyForTests();
  try {
    await assert.rejects(() => secureWrite('x', { a: 1 }), SecureStorageError);
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
    _forgetCachedKeyForTests();
  }
});
