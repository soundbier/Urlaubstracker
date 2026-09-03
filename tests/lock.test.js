/**
 * Die Gerätesperre.
 *
 * Sie ist der einzige Schutz, den die App gegen ein verlorenes, entsperrtes
 * Handy aufbieten kann — die Anmeldung an der Kasse gilt ja dauerhaft. Was hier
 * geprüft wird, ist deshalb nicht die Oberfläche, sondern das, worauf sie sich
 * verlässt: dass ein falscher Code nicht durchkommt, dass Durchprobieren teuer
 * wird, und dass der Code nirgends im Klartext landet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Ein Speicher wie im Browser, damit sich nachsehen lässt, was dort wirklich
// landet. Muss vor dem Import stehen: `lock.js` liest ihn beim Laden.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const lock = await import('../js/lock.js');

test('zu einfache Codes lässt die App gar nicht erst zu', () => {
  assert.match(lock.checkCode(''), /Code eintragen/);
  assert.match(lock.checkCode('123'), /Mindestens/);
  assert.match(lock.checkCode('12a4'), /Ziffern/);
  assert.match(lock.checkCode('1111'), /immer wieder/);
  assert.match(lock.checkCode('123456'), /Zahlenreihe/);
  assert.match(lock.checkCode('9876'), /Zahlenreihe/, 'auch rückwärts');
  assert.equal(lock.checkCode('4071'), null);
});

test('gesetzt, geprüft, wieder aus', async () => {
  await lock.setCode('4071');
  assert.equal(lock.isEnabled(), true);
  assert.equal(lock.isLocked(), false, 'wer gerade einrichtet, steht nicht vor der eigenen Tür');

  lock.lock();
  assert.equal(lock.isLocked(), true);

  assert.equal(await lock.unlock('4072'), false, 'falscher Code öffnet nicht');
  assert.equal(lock.isLocked(), true);
  assert.equal(await lock.unlock('4071'), true);
  assert.equal(lock.isLocked(), false);

  await lock.disable('4071');
  assert.equal(lock.isEnabled(), false);
});

test('ausschalten geht nur mit dem gültigen Code', async () => {
  await lock.setCode('4071');
  await assert.rejects(() => lock.disable('0000'), /stimmt nicht/);
  assert.equal(lock.isEnabled(), true, 'die Sperre steht noch');
  await lock.disable('4071');
});

test('Durchprobieren wird teuer', async () => {
  await lock.setCode('4071');
  // Vier Ziffern sind zehntausend Möglichkeiten — ohne Bremse ist das eine
  // Frage von Minuten.
  for (let i = 0; i < 4; i++) await lock.verify('0000');
  assert.ok(lock.waitMs() > 0, 'nach den freien Versuchen wird gewartet');
  await assert.rejects(() => lock.verify('4071'), /warten/, 'auch der richtige Code muss warten');
  await lock.disable('4071').catch(() => {});
});

test('der Code selbst steht nirgends', async () => {
  await lock.setCode('4071');
  // Gespeichert wird der PBKDF2-Wert samt zufälligem Salz — nicht der Code.
  // Wer den Speicher des Browsers ausliest, kommt damit nicht weiter, als es
  // die 200 000 Runden erlauben.
  const stored = [...store.values()].join('\n');
  assert.ok(stored, 'es wurde überhaupt etwas gespeichert');
  assert.ok(!stored.includes('4071'), 'der Code steht nicht im Klartext da');
  assert.match(stored, /"salt":"[0-9a-f]{32}"/, 'mit zufälligem Salz');
  assert.match(stored, /"iterations":200000/);

  // Und derselbe Code ergibt in einer zweiten Einrichtung einen anderen Wert.
  const first = JSON.parse(store.get('urlaubstracker.lock.v1')).code.hash;
  await lock.setCode('4071');
  const second = JSON.parse(store.get('urlaubstracker.lock.v1')).code.hash;
  assert.notEqual(first, second);

  await lock.disable('4071');
  assert.equal(JSON.parse(store.get('urlaubstracker.lock.v1')).code, null, 'ausgeschaltet bleibt nichts stehen');
});
