import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCsv, parseImport, buildExport } from '../js/link.js';
import { POT } from '../js/calc.js';

const TRIP = {
  id: 't1',
  name: 'Roadtrip',
  startDate: '2026-07-01',
  endDate: '2026-07-10',
  currency: 'EUR',
  budgetMode: 'dynamic',
  people: [
    { id: 'p1', name: 'Nour', share: 1 },
    { id: 'p2', name: 'Kim', share: 1 },
  ],
};

test('CSV enthält Klartext, keine internen Kennungen', () => {
  const csv = buildCsv({
    trip: TRIP,
    contributions: [{ id: 'c1', personId: 'p1', amount: 80000, date: '2026-06-20', note: 'Überweisung' }],
    expenses: [
      { id: 'e1', date: '2026-07-01', amount: 20000, category: 'stay', payer: POT, note: '' },
      { id: 'e2', date: '2026-07-02', amount: 4250, category: 'food', payer: 'p2', note: 'Eis am Strand' },
    ],
  });

  assert.ok(csv.includes('"Übernachtung"'), 'Kategorie steht ausgeschrieben da');
  assert.ok(csv.includes('"Essen & Trinken"'));
  assert.ok(!/"(stay|food|pot)"/.test(csv), 'keine internen Kennungen in der Tabelle');
  assert.ok(csv.includes('"Gemeinsame Kasse"'));
  assert.ok(csv.includes('"Kim"'));
  assert.ok(csv.includes('"42,50"'), 'Beträge mit Komma, wie Excel sie hier erwartet');
  assert.ok(csv.startsWith('﻿'), 'BOM für die Umlaute');
});

test('CSV maskiert Anführungszeichen in Notizen', () => {
  const csv = buildCsv({
    trip: TRIP,
    contributions: [],
    expenses: [{ id: 'e', date: '2026-07-01', amount: 100, category: 'other', payer: POT, note: 'Bar "Zum Anker"' }],
  });
  assert.ok(csv.includes('"Bar ""Zum Anker"""'));
});

const backup = (patch) =>
  JSON.stringify({ format: 'urlaubstracker', version: 1, trip: TRIP, contributions: [], expenses: [], ...patch });

test('Import weist Dateien ab, an denen die App danach scheitern würde', () => {
  assert.throws(() => parseImport('{"format":"etwas-anderes"}'), /keine Sicherungskopie/);
  assert.throws(() => parseImport(backup({ trip: { ...TRIP, startDate: undefined } })), /Zeitraum/);
  assert.throws(() => parseImport(backup({ trip: { ...TRIP, startDate: '2026-07-20' } })), /Zeitraum/, 'Ende vor Anfang');
  assert.throws(() => parseImport(backup({ trip: { ...TRIP, people: [] } })), /keine einzige Person/);
});

test('Import räumt auf, statt kaputte Zeilen durchzulassen', () => {
  const p = parseImport(
    backup({
      contributions: [
        { id: 'c1', personId: 'p1', amount: 5000, date: '2026-06-20' },
        { id: 'c2', personId: 'weg', amount: 5000, date: '2026-06-20' },
        { id: 'c3', personId: 'p1', amount: 12.5, date: '2026-06-20' },
        { id: 'c4', personId: 'p1', amount: 5000, date: 'gestern' },
      ],
      expenses: [
        { id: 'e1', date: '2026-07-01', amount: 900, category: 'quatsch', payer: 'auch weg' },
        { id: 'e2', date: '2026-07-01', amount: 900, category: 'food', payer: 'p2' },
      ],
    }),
  );

  assert.deepEqual(p.contributions.map((c) => c.id), ['c1'], 'unbekannte Person, Nicht-Cent und Nicht-Datum fliegen raus');
  assert.equal(p.expenses.length, 2);
  assert.equal(p.expenses[0].category, 'other', 'unbekannte Kategorie wird Sonstiges');
  assert.equal(p.expenses[0].payer, POT, 'unbekannter Zahler fällt auf die Kasse zurück');
  assert.equal(p.expenses[1].payer, 'p2', 'bekannte Zahler bleiben stehen');
});

test('Import füllt fehlende Angaben mit etwas Brauchbarem', () => {
  const p = parseImport(backup({ trip: { ...TRIP, name: '  ', currency: '', budgetMode: 'quatsch', people: [{ id: 'p1' }] } }));
  assert.equal(p.trip.name, 'Unser Urlaub');
  assert.equal(p.trip.currency, 'EUR');
  assert.equal(p.trip.budgetMode, 'dynamic');
  assert.equal(p.trip.people[0].name, 'Person 1');
});

test('Was exportiert wurde, lässt sich wieder einlesen', () => {
  const contributions = [{ id: 'c1', personId: 'p1', amount: 80000, date: '2026-06-20', note: '' }];
  const expenses = [{ id: 'e1', date: '2026-07-01', amount: 20000, category: 'stay', payer: POT, note: '' }];
  const back = parseImport(buildExport({ trip: TRIP, contributions, expenses }));

  assert.deepEqual(back.contributions, contributions);
  assert.deepEqual(back.expenses, expenses);
  assert.equal(back.trip.id, TRIP.id);
  assert.deepEqual(back.trip.people, TRIP.people);
});
