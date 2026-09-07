/**
 * Die Kopie, die das Löschen auffängt.
 *
 * „Urlaubskasse löschen“ war endgültig: ein Fehlgriff kostete den ganzen
 * Urlaub, wenn niemand vorher an eine Sicherungskopie gedacht hatte. Diese
 * Prüfungen halten die beiden Enden fest, an denen das hängt — die Kopie muss
 * wieder einlesbar sein, und sie darf nicht ewig liegen bleiben. Dazu: dass
 * sie im Speicher verschlüsselt liegt wie jede andere Ablage dieses Geräts.
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

const { keepCopy, lastCopy, discardCopy, TRASH_DAYS } = await import('../js/trash.js');
const { parseImport } = await import('../js/link.js');
const { secureRead, secureWrite } = await import('../js/secure-storage.js');

const TRASH_KEY = 'urlaubstracker.trash.v1';

const trip = {
  id: 't1',
  name: 'Roadtrip Süd 2026',
  startDate: '2026-07-01',
  endDate: '2026-07-14',
  currency: 'EUR',
  budgetMode: 'dynamic',
  people: [{ id: 'p1', name: 'Kim', share: 1, color: '#123456' }],
};
const expenses = [{ id: 'e1', amount: 1250, date: '2026-07-02', category: 'food', payer: 'pot' }];

test('ohne Löschung liegt nichts herum', async () => {
  store.clear();
  assert.equal(await lastCopy(), null);
});

test('die Kopie ist dieselbe Datei wie eine Sicherungskopie — und liegt verschlüsselt', async () => {
  store.clear();
  assert.equal(await keepCopy({ trip, contributions: [], expenses, cashOuts: [] }), true);

  const raw = store.get(TRASH_KEY);
  assert.ok(!raw.includes(trip.name), 'der Name steht nicht im Klartext im Speicher');
  assert.ok(!raw.includes('Kim'), 'auch keine der Personen');

  const copy = await lastCopy();
  assert.ok(copy, 'die Kopie ist da');
  assert.equal(copy.name, 'Roadtrip Süd 2026');
  assert.equal(copy.entries, 1);
  assert.equal(copy.daysLeft, TRASH_DAYS);

  // Zurückholen heißt: durch dieselbe Prüfung wie ein Import von Hand. Was
  // hier nicht durchkommt, wäre im Ernstfall wertlos.
  const back = parseImport(copy.json);
  assert.equal(back.trip.name, trip.name);
  assert.equal(back.expenses.length, 1);
  assert.equal(back.expenses[0].amount, 1250);
});

test('nach der Frist räumt sie sich selbst weg', async () => {
  store.clear();
  await keepCopy({ trip, contributions: [], expenses, cashOuts: [] });

  // Den Datensatz ent- und mit einem älteren Zeitstempel wieder verschlüsseln
  // — dieselbe Rolle, die vor der Verschlüsselung ein direktes Umschreiben
  // des rohen JSON gespielt hat.
  const row = await secureRead(TRASH_KEY);
  row.savedAt = Date.now() - (TRASH_DAYS + 1) * 86400000;
  await secureWrite(TRASH_KEY, row);

  // Gelöscht muss gelöscht heißen: eine Kopie, die Wochen später noch da wäre,
  // wäre genau die Speicherung, die niemand mehr erwartet.
  assert.equal(await lastCopy(), null);
  assert.equal(store.has(TRASH_KEY), false, 'und sie ist wirklich weg');
});

test('endgültig entfernen entfernt endgültig', async () => {
  store.clear();
  await keepCopy({ trip, contributions: [], expenses, cashOuts: [] });
  await discardCopy();
  assert.equal(await lastCopy(), null);
  assert.equal(store.size, 0);
});

test('ohne Trip gibt es nichts zu sichern', async () => {
  store.clear();
  assert.equal(await keepCopy({ trip: null }), false);
  assert.equal(store.size, 0);
});

test('die Kopie nimmt Reiseplan und Packliste mit', async () => {
  // Beide Listen führen kein Geld — und wären deshalb genau die, die still
  // fehlen, bis jemand die Kasse zurückholt und vor einem leeren Reiseplan
  // steht.
  store.clear();
  const planItems = [{ id: 'pl1', date: '2026-07-02', time: '', title: 'Museum', category: 'activity', location: '', note: '', payer: 'pot', linkedExpenseId: null, done: false }];
  const packItems = [{ id: 'pk1', title: 'Reisepass', category: 'documents', sub: '', qty: 1, status: 'open', bag: 'hand', note: '' }];
  await keepCopy({ trip, contributions: [], expenses, cashOuts: [], planItems, packItems });

  const copy = await lastCopy();
  assert.equal(copy.entries, 3, 'gezählt wird alles, was verloren ginge');

  const back = parseImport(copy.json);
  assert.deepEqual(back.planItems, planItems);
  assert.deepEqual(back.packItems, packItems);
});

test('ein beschädigter Datensatz gilt als „nichts da“, nicht als Absturz', async () => {
  store.clear();
  await keepCopy({ trip, contributions: [], expenses, cashOuts: [] });
  const envelope = JSON.parse(store.get(TRASH_KEY));
  envelope.ct = envelope.ct.slice(0, -4) + (envelope.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  store.set(TRASH_KEY, JSON.stringify(envelope));

  assert.equal(await lastCopy(), null, 'lieber ehrlich nichts als ein Absturz');
});
