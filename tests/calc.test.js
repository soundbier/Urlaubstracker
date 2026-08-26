import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAmount, splitCents, allocateByShares,
  addDays, daysInclusive, dateRange, todayISO, isValidDate,
  computeBudget, dailySeries, settleUp, spentByCategory, groupByDay,
  tripPhase, POT,
} from '../js/calc.js';

// Ein durchgängiges Beispiel: 10 Tage Juli, 1500 € Kasse, heute ist Tag 3.
const TRIP = {
  id: 't1',
  name: 'Roadtrip',
  startDate: '2026-07-01',
  endDate: '2026-07-10',
  currency: 'EUR',
  budgetMode: 'dynamic',
  people: [
    { id: 'marie', name: 'Marie', share: 1 },
    { id: 'lukas', name: 'Lukas', share: 1 },
  ],
};
const CONTRIB = [
  { id: 'c1', personId: 'marie', amount: 80000, date: '2026-06-20' },
  { id: 'c2', personId: 'lukas', amount: 70000, date: '2026-06-20' },
];
const EXPENSES = [
  { id: 'e1', date: '2026-07-01', amount: 20000, category: 'stay', payer: POT, createdAt: 1 },
  { id: 'e2', date: '2026-07-02', amount: 10000, category: 'food', payer: POT, createdAt: 2 },
  { id: 'e3', date: '2026-07-03', amount: 4000, category: 'food', payer: 'lukas', createdAt: 3 },
];
const TODAY = '2026-07-03';

test('parseAmount versteht deutsche und englische Schreibweise', () => {
  assert.equal(parseAmount('12,50'), 1250);
  assert.equal(parseAmount('12.50'), 1250);
  assert.equal(parseAmount('1.234,56'), 123456);
  assert.equal(parseAmount('1,234.56'), 123456);
  assert.equal(parseAmount('  8 € '), 800);
  assert.equal(parseAmount('7'), 700);
  assert.equal(parseAmount('0,05'), 5);
  assert.equal(parseAmount(12.345), 1235);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(null), null);
});

test('Cent-Aufteilung verliert und erfindet kein Geld', () => {
  assert.deepEqual(splitCents(1001, 2), [501, 500]);
  assert.deepEqual(splitCents(-5, 2), [-3, -2]);
  for (const [cents, shares] of [[10001, [1, 1]], [7, [3, 1]], [0, [1, 1]], [999999, [2, 1, 1]]]) {
    const parts = allocateByShares(cents, shares);
    assert.equal(parts.reduce((a, b) => a + b, 0), cents, `Summe stimmt für ${cents}`);
  }
});

test('Datumsrechnung zählt Kalendertage, nicht Stunden', () => {
  assert.equal(daysInclusive('2026-07-01', '2026-07-10'), 10);
  assert.equal(daysInclusive('2026-07-01', '2026-07-01'), 1);
  assert.equal(daysInclusive('2026-07-10', '2026-07-01'), 1, 'nie kleiner als 1');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(dateRange('2026-07-01', '2026-07-03').length, 3);
  // Über die Sommerzeitumstellung hinweg bleibt ein Tag ein Tag.
  assert.equal(daysInclusive('2026-03-28', '2026-03-30'), 3);
  assert.equal(daysInclusive('2026-10-24', '2026-10-26'), 3);
  assert.ok(isValidDate(todayISO()));
  assert.ok(!isValidDate('2026-7-1'));
});

test('tripPhase erkennt vorher, mittendrin und danach', () => {
  assert.equal(tripPhase(TRIP, '2026-06-30'), 'before');
  assert.equal(tripPhase(TRIP, '2026-07-01'), 'during');
  assert.equal(tripPhase(TRIP, '2026-07-10'), 'during');
  assert.equal(tripPhase(TRIP, '2026-07-11'), 'after');
});

test('Budget: Grundzahlen an Tag 3', () => {
  const b = computeBudget({ trip: TRIP, contributions: CONTRIB, expenses: EXPENSES, today: TODAY });
  assert.equal(b.total, 150000);
  assert.equal(b.spent, 34000);
  assert.equal(b.remaining, 116000);
  assert.equal(b.totalDays, 10);
  assert.equal(b.elapsedDays, 3);
  assert.equal(b.daysLeft, 8);
  assert.equal(b.planPerDay, 15000);
  assert.equal(b.spentBeforeToday, 30000);
  assert.equal(b.availableThisMorning, 120000);
  assert.equal(b.dynamicPerDay, 15000, '1200 € auf 8 Tage');
  assert.equal(b.spentToday, 4000);
  assert.equal(b.leftToday, 11000);
  assert.equal(b.buffer, 11000, 'liegen 110 € unter der Soll-Linie');
  assert.equal(b.status, 'good');
});

test('Budget: das Tagesbudget schrumpft nicht, während man Ausgaben einträgt', () => {
  const before = computeBudget({ trip: TRIP, contributions: CONTRIB, expenses: EXPENSES, today: TODAY });
  const after = computeBudget({
    trip: TRIP,
    contributions: CONTRIB,
    expenses: [...EXPENSES, { id: 'e4', date: TODAY, amount: 2500, category: 'food', payer: POT }],
    today: TODAY,
  });
  assert.equal(after.perDayToday, before.perDayToday, 'Tagesbudget bleibt stehen');
  assert.equal(after.leftToday, before.leftToday - 2500, 'nur der Rest sinkt');
});

test('Budget: fester Modus hält das Tagesbudget konstant', () => {
  const teuer = [...EXPENSES, { id: 'x', date: '2026-07-02', amount: 50000, category: 'other', payer: POT }];
  const dyn = computeBudget({ trip: TRIP, contributions: CONTRIB, expenses: teuer, today: TODAY });
  const fix = computeBudget({ trip: { ...TRIP, budgetMode: 'fixed' }, contributions: CONTRIB, expenses: teuer, today: TODAY });
  assert.equal(fix.perDayToday, 15000);
  assert.ok(dyn.perDayToday < 15000, 'dynamisch fängt den teuren Tag ab');
  assert.equal(dyn.perDayToday, Math.floor((150000 - 80000) / 8));
});

test('Budget: vor der Abfahrt und nach der Rückkehr', () => {
  const vorher = computeBudget({ trip: TRIP, contributions: CONTRIB, expenses: [], today: '2026-06-28' });
  assert.equal(vorher.phase, 'before');
  assert.equal(vorher.elapsedDays, 0);
  assert.equal(vorher.daysLeft, 10);
  assert.equal(vorher.perDayToday, 15000);
  assert.equal(vorher.daysUntilStart, 3);

  const danach = computeBudget({ trip: TRIP, contributions: CONTRIB, expenses: EXPENSES, today: '2026-07-20' });
  assert.equal(danach.phase, 'after');
  assert.equal(danach.daysLeft, 0);
  assert.equal(danach.elapsedDays, 10);
  assert.equal(danach.remaining, 116000);
});

test('Budget: leere Kasse und Überziehung werden gemeldet', () => {
  const leer = computeBudget({ trip: TRIP, contributions: [], expenses: [], today: TODAY });
  assert.equal(leer.status, 'empty');
  assert.equal(leer.planPerDay, 0);

  const drueber = computeBudget({
    trip: TRIP,
    contributions: CONTRIB,
    expenses: [{ id: 'z', date: TODAY, amount: 200000, category: 'other', payer: POT }],
    today: TODAY,
  });
  assert.equal(drueber.status, 'over');
  assert.equal(drueber.remaining, -50000);
});

test('Verlauf: Soll-Linie und tatsächlicher Kontostand', () => {
  const s = dailySeries({ trip: TRIP, contributions: CONTRIB, expenses: EXPENSES, today: TODAY });
  assert.equal(s.length, 10);
  assert.equal(s[0].planned, 135000);
  assert.equal(s[9].planned, 0, 'die Soll-Linie endet bei null');
  assert.equal(s[0].actual, 130000);
  assert.equal(s[2].actual, 116000);
  assert.ok(s[2].isToday);
  assert.equal(s[3].actual, null, 'die Zukunft bleibt leer');
  assert.ok(s[3].isFuture);
});

test('Verlauf: Ausgaben vor Reisebeginn fehlen nicht im Kontostand', () => {
  const s = dailySeries({
    trip: TRIP,
    contributions: CONTRIB,
    expenses: [{ id: 'v', date: '2026-06-29', amount: 5000, category: 'transport', payer: POT }],
    today: TODAY,
  });
  assert.equal(s[0].actual, 145000);
});

test('Abrechnung: Guthaben summieren sich auf den Kontostand', () => {
  const s = settleUp({ trip: TRIP, contributions: CONTRIB, expenses: EXPENSES });
  assert.equal(s.totalSpent, 34000);
  assert.equal(s.potBalance, 120000, '1500 € eingezahlt, 300 € vom Konto bezahlt');
  const [marie, lukas] = s.rows;
  assert.equal(marie.fairShare, 17000);
  assert.equal(lukas.fairShare, 17000);
  assert.equal(marie.balance, 63000);
  assert.equal(lukas.balance, 57000, 'die 40 € aus eigener Tasche zählen mit');
  assert.equal(marie.balance + lukas.balance, s.potBalance);
  assert.equal(s.transfers.length, 0, 'das Konto deckt beide Guthaben');
  assert.deepEqual(s.payouts.map((p) => p.amount), [63000, 57000]);
  assert.equal(s.leftInPot, 0);
});

test('Abrechnung: wer zu wenig eingezahlt hat, überweist den Rest', () => {
  const s = settleUp({
    trip: TRIP,
    contributions: [{ id: 'c', personId: 'lukas', amount: 10000, date: '2026-06-20' }],
    expenses: [{ id: 'e', date: '2026-07-01', amount: 10000, category: 'food', payer: POT }],
  });
  assert.equal(s.potBalance, 0);
  assert.equal(s.transfers.length, 1);
  assert.deepEqual(
    { from: s.transfers[0].from, to: s.transfers[0].to, amount: s.transfers[0].amount },
    { from: 'Marie', to: 'Lukas', amount: 5000 },
  );
});

test('Abrechnung: ungleiche Quote wird berücksichtigt', () => {
  const trip = { ...TRIP, people: [{ id: 'marie', name: 'Marie', share: 2 }, { id: 'lukas', name: 'Lukas', share: 1 }] };
  const s = settleUp({ trip, contributions: CONTRIB, expenses: EXPENSES });
  assert.equal(s.rows[0].fairShare + s.rows[1].fairShare, 34000);
  assert.equal(s.rows[0].fairShare, 22667);
  assert.equal(s.rows[0].balance + s.rows[1].balance, s.potBalance);
});

test('Gruppierungen für die Listen', () => {
  const cats = spentByCategory(EXPENSES);
  assert.equal(cats[0].id, 'stay');
  assert.equal(cats[0].amount, 20000);
  assert.equal(cats.reduce((a, c) => a + c.amount, 0), 34000);

  const days = groupByDay(EXPENSES);
  assert.equal(days.length, 3);
  assert.equal(days[0].date, '2026-07-03', 'neueste zuerst');
  assert.equal(days[2].total, 20000);

  // Unbekannte Kategorien landen unter „Sonstiges“ statt zu verschwinden.
  const seltsam = spentByCategory([{ date: TODAY, amount: 100, category: 'quatsch' }]);
  assert.equal(seltsam[0].id, 'other');
});
