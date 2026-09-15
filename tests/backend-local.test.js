/**
 * Das lokale Backend — die Reisedaten selbst.
 *
 * Hier hängt am meisten dran: Name der Gruppe, Beträge, wer was bezahlt hat.
 * Geprüft wird, dass das alles verschlüsselt im Speicher landet, dass ein
 * neu gestartetes Backend denselben Stand wiederfindet, dass ein
 * unverschlüsselter Altbestand (vor dieser Fassung) sauber übernommen wird,
 * und dass ein beschädigter Datensatz die App nicht zum Absturz bringt,
 * sondern leer weiterlaufen lässt — mit einer Meldung, keiner Stille.
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
// `_onStorage`/`_emit` hängen sich an `addEventListener`/`removeEventListener`
// — im Test genügt ein Nichts-Tuer, gebraucht wird hier nur `start`/`stop`.
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const { LocalBackend } = await import('../js/backend-local.js');
const { secureRead, secureWrite } = await import('../js/secure-storage.js');

const KEY = 'urlaubstracker.data.v1';

const trip = {
  id: 't1',
  name: 'Norwegen Roadtrip',
  startDate: '2026-07-01',
  endDate: '2026-07-10',
  currency: 'EUR',
  budgetMode: 'dynamic',
  people: [{ id: 'p1', name: 'Marie', share: 1, color: '#123456' }],
};

function backend() {
  const events = [];
  const b = new LocalBackend();
  return { b, events, start: () => b.start((data) => events.push(data), (s) => events.push({ status: s })) };
}

test('eine neue Kasse liegt verschlüsselt im Speicher', async () => {
  store.clear();
  const { b, start } = backend();
  await start();
  await b.createTrip(trip);

  const raw = store.get(KEY);
  assert.ok(raw, 'es wurde etwas gespeichert');
  assert.ok(!raw.includes('Norwegen'), 'der Name der Reise steht nicht im Klartext');
  assert.ok(!raw.includes('Marie'), 'auch keine Person');
  const envelope = JSON.parse(raw);
  assert.equal(envelope.v, 1);
  assert.ok(envelope.iv && envelope.ct);
});

test('ein neu gestartetes Backend findet denselben Stand wieder', async () => {
  store.clear();
  const first = backend();
  await first.start();
  await first.b.createTrip(trip);
  await first.b.putExpense({ id: 'e1', amount: 4500, date: '2026-07-02', category: 'food', payer: 'pot' });

  const second = backend();
  await second.start();
  assert.equal(second.b.data.trip.name, 'Norwegen Roadtrip');
  assert.equal(second.b.data.expenses.length, 1);
  assert.equal(second.b.data.expenses[0].amount, 4500);
});

test('eine Unterkunft übersteht einen Neustart wie jede andere Liste', async () => {
  store.clear();
  const first = backend();
  await first.start();
  await first.b.createTrip(trip);
  await first.b.putStay({ id: 's1', name: 'Hotel Fjord', address: 'Strandvegen 1', startDate: '2026-07-01', endDate: '2026-07-03', note: '' });

  const second = backend();
  await second.start();
  assert.equal(second.b.data.stays.length, 1);
  assert.equal(second.b.data.stays[0].name, 'Hotel Fjord');

  await second.b.removeStay('s1');
  const third = backend();
  await third.start();
  assert.equal(third.b.data.stays.length, 0);
});

test('unverschlüsselter Altbestand aus einer Fassung vor der Verschlüsselung wird übernommen und migriert', async () => {
  store.clear();
  // So, wie es vor `secure-storage.js` aussah: rohes JSON am Speicherplatz.
  store.set(KEY, JSON.stringify({
    trip, contributions: [], expenses: [{ id: 'e1', amount: 1000, date: '2026-07-01', category: 'food', payer: 'pot' }],
    cashOuts: [], planItems: [], packItems: [],
  }));

  const { b, start } = backend();
  await start();
  assert.equal(b.data.trip.name, 'Norwegen Roadtrip', 'der Altbestand wird eingelesen');
  assert.equal(b.data.expenses.length, 1);

  // Migration läuft im Hintergrund — kurz nachgeben (Schlüssel erzeugen
  // und verschlüsseln brauchen selbst ein paar echte Umläufe).
  await new Promise((r) => setTimeout(r, 50));

  const raw = store.get(KEY);
  assert.ok(!raw.includes('Norwegen'), 'am Speicherplatz steht jetzt kein Klartext mehr');
  assert.deepEqual(await secureRead(KEY), JSON.parse(JSON.stringify({
    trip, contributions: [], expenses: [{ id: 'e1', amount: 1000, date: '2026-07-01', category: 'food', payer: 'pot' }],
    cashOuts: [], planItems: [], packItems: [],
  })), 'und liest sich verschlüsselt genauso wieder ein');
});

test('ein beschädigter Datensatz startet leer statt abzustürzen — und meldet sich', async () => {
  store.clear();
  await secureWrite(KEY, { trip, contributions: [], expenses: [], cashOuts: [], planItems: [], packItems: [] });
  const envelope = JSON.parse(store.get(KEY));
  envelope.ct = envelope.ct.slice(0, -4) + (envelope.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  store.set(KEY, JSON.stringify(envelope));

  const { b, events, start } = backend();
  await start();
  assert.equal(b.data.trip, null, 'lieber ehrlich leer als ein Absturz');
  const statusEvent = events.find((e) => e.status)?.status;
  assert.match(statusEvent?.error || '', /nicht entschlüsseln/, 'die Oberfläche bekommt eine Meldung, statt dass die Reise still verschwindet');
});

test('kaputtes JSON (nicht einmal ein Umschlag) startet ebenso leer und meldet sich ebenso', async () => {
  store.clear();
  store.set(KEY, '{das ist kein JSON');

  const { b, events, start } = backend();
  await start();
  assert.equal(b.data.trip, null);
  const statusEvent = events.find((e) => e.status)?.status;
  assert.ok(statusEvent?.error, 'auch ein von Hand verstelltes Feld verschwindet nicht kommentarlos');
});

/**
 * Der leere Anfangszustand darf nichts sein, was sich zwischen zwei Kassen
 * teilen lässt.
 *
 * Er stand einmal als Konstante da und wurde mit `{ ...EMPTY }` „kopiert“ —
 * das kopiert aber nur die äußere Hülle, die Listen darin blieben ein und
 * dasselbe Array. Aufgefallen ist das nie, weil zwischen „leer“ und dem
 * ersten Eintrag immer `createTrip` lag, das die Listen ersetzt. Der Test
 * hält fest, dass es darauf nicht ankommen soll: ein Eintrag in der einen
 * Kasse darf in der nächsten nicht wieder auftauchen, in welcher Reihenfolge
 * auch immer.
 */
test('eine gelöschte und eine neue Kasse teilen sich keine Listen', async () => {
  store.clear();
  const first = backend();
  await first.start();
  await first.b.createTrip(trip);
  await first.b.putExpense({ id: 'e1', amount: 1000, date: '2026-07-01', category: 'food', payer: 'pot' });
  await first.b.deleteTrip();

  // Nach dem Löschen steht die Kasse leer da — und was jetzt noch hineinfällt,
  // gehört dieser einen Instanz, nicht dem Modul.
  assert.deepEqual(first.b.data.expenses, []);
  await first.b.putExpense({ id: 'e2', amount: 500, date: '2026-07-02', category: 'food', payer: 'pot' });

  // Leerer Speicher, frisches Backend: was jetzt noch auftaucht, kann nur über
  // ein geteiltes Feld hereingekommen sein, denn abgelegt ist nichts mehr.
  store.clear();
  const second = backend();
  await second.start();
  assert.deepEqual(second.b.data.expenses, [], 'die nächste Kasse fängt wirklich bei null an');
  assert.deepEqual(second.b.data.contributions, []);
  await second.b.createTrip(trip);
  assert.deepEqual(second.b.data.expenses, [], 'und bleibt leer, auch nachdem sie angelegt ist');
});

/**
 * `replaceAll` bekommt die Listen des Aufrufers gereicht (den Zustand im
 * `store`, eine eingelesene Sicherung). Würden sie einfach übernommen, änderte
 * der nächste Eintrag fremde Daten hinter deren Rücken.
 */
test('eingespielte Listen bleiben unberührt, wenn danach etwas eingetragen wird', async () => {
  store.clear();
  const expenses = [{ id: 'e1', amount: 1000, date: '2026-07-01', category: 'food', payer: 'pot' }];
  const { b, start } = backend();
  await start();
  await b.replaceAll({ trip, contributions: [], expenses, cashOuts: [], planItems: [], packItems: [], stays: [] });

  await b.putExpense({ id: 'e2', amount: 500, date: '2026-07-02', category: 'food', payer: 'pot' });
  assert.equal(expenses.length, 1, 'die Liste des Aufrufers hat sich nicht verändert');
  assert.equal(b.data.expenses.length, 2);
});
