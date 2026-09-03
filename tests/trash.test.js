/**
 * Die Kopie, die das Löschen auffängt.
 *
 * „Urlaubskasse löschen“ war endgültig: ein Fehlgriff kostete den ganzen
 * Urlaub, wenn niemand vorher an eine Sicherungskopie gedacht hatte. Diese
 * Prüfungen halten die beiden Enden fest, an denen das hängt — die Kopie muss
 * wieder einlesbar sein, und sie darf nicht ewig liegen bleiben.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { keepCopy, lastCopy, discardCopy, TRASH_DAYS } = await import('../js/trash.js');
const { parseImport } = await import('../js/link.js');

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

test('ohne Löschung liegt nichts herum', () => {
  store.clear();
  assert.equal(lastCopy(), null);
});

test('die Kopie ist dieselbe Datei wie eine Sicherungskopie', () => {
  store.clear();
  assert.equal(keepCopy({ trip, contributions: [], expenses, cashOuts: [] }), true);

  const copy = lastCopy();
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

test('nach der Frist räumt sie sich selbst weg', () => {
  store.clear();
  keepCopy({ trip, contributions: [], expenses, cashOuts: [] });

  const row = JSON.parse(store.get('urlaubstracker.trash.v1'));
  row.savedAt = Date.now() - (TRASH_DAYS + 1) * 86400000;
  store.set('urlaubstracker.trash.v1', JSON.stringify(row));

  // Gelöscht muss gelöscht heißen: eine Kopie, die Wochen später noch da wäre,
  // wäre genau die Speicherung, die niemand mehr erwartet.
  assert.equal(lastCopy(), null);
  assert.equal(store.has('urlaubstracker.trash.v1'), false, 'und sie ist wirklich weg');
});

test('endgültig entfernen entfernt endgültig', () => {
  store.clear();
  keepCopy({ trip, contributions: [], expenses, cashOuts: [] });
  discardCopy();
  assert.equal(lastCopy(), null);
  assert.equal(store.size, 0);
});

test('ohne Trip gibt es nichts zu sichern', () => {
  store.clear();
  assert.equal(keepCopy({ trip: null }), false);
  assert.equal(store.size, 0);
});
