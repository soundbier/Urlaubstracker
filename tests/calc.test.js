import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAmount, splitCents, allocateByShares,
  addDays, daysInclusive, dateRange, todayISO, isValidDate,
  computeBudget, dailySeries, settleUp, spentByCategory, groupByDay,
  totalSpent, totalPlanned, plannedOnly, paidOnly,
  tripPhase, POT, MAX_PEOPLE, PERSON_COLORS, nextPersonColor, personEntryCount,
  normalizeShares, averageShare,
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

// Der Fall aus dem Alltag: 2000 € Kasse, 250 € sind vorher schon verplant.
test('Budget: Verplantes wird abgezogen, bevor geteilt wird', () => {
  const trip = { ...TRIP, startDate: '2026-07-01', endDate: '2026-07-10' };
  const contrib = [{ id: 'c', personId: 'marie', amount: 200000, date: '2026-06-01' }];
  const geplant = [{ id: 'p1', date: '2026-07-05', amount: 25000, category: 'stay', payer: POT, planned: true }];

  const b = computeBudget({ trip, contributions: contrib, expenses: geplant, today: '2026-06-28' });
  assert.equal(b.total, 200000);
  assert.equal(b.spent, 0, 'vorgemerkt ist nicht ausgegeben');
  assert.equal(b.planned, 25000);
  assert.equal(b.free, 175000);
  assert.equal(b.budgetBase, 175000);
  assert.equal(b.planPerDay, 17500, '1750 € auf 10 Tage statt 2000 €');
  assert.equal(b.perDayToday, 17500);
  assert.equal(b.plannedAhead, 25000);
});

test('Budget: aus verplant wird bezahlt, ohne dass sich die Kasse verrechnet', () => {
  const trip = { ...TRIP, startDate: '2026-07-01', endDate: '2026-07-10' };
  const contrib = [{ id: 'c', personId: 'marie', amount: 200000, date: '2026-06-01' }];
  const row = { id: 'p1', date: '2026-07-03', amount: 25000, category: 'stay', payer: POT };

  // So, wie `markExpensePaid` es schreibt: die Marke wechselt, das Geld bleibt reserviert.
  const vorher = computeBudget({ trip, contributions: contrib, expenses: [{ ...row, planned: true }], today: '2026-07-03' });
  const nachher = computeBudget({ trip, contributions: contrib, expenses: [{ ...row, planned: false, fromPlan: true }], today: '2026-07-03' });

  assert.equal(vorher.free, nachher.remaining, 'das frei verfügbare Geld bleibt gleich');
  assert.equal(vorher.planPerDay, nachher.planPerDay, 'auch das geplante Tagesbudget');
  assert.equal(vorher.perDayToday, nachher.perDayToday, 'und das von heute');
  assert.equal(nachher.spent, 25000, 'bezahlt ist bezahlt');
  assert.equal(vorher.spentToday, 0);
  assert.equal(nachher.spentToday, 0, 'die Vormerkung frisst nicht das Tagesbudget');
  assert.equal(nachher.reserved, 25000);
});

test('Verplantes zählt weder als Ausgabe noch in der Abrechnung', () => {
  const geplant = [...EXPENSES, { id: 'p1', date: '2026-07-08', amount: 12000, category: 'activity', payer: 'marie', planned: true }];
  assert.equal(totalSpent(geplant), 34000);
  assert.equal(totalPlanned(geplant), 12000);
  assert.equal(paidOnly(geplant).length, 3);
  assert.equal(plannedOnly(geplant).length, 1);

  const ohne = settleUp({ trip: TRIP, contributions: CONTRIB, expenses: EXPENSES });
  const mit = settleUp({ trip: TRIP, contributions: CONTRIB, expenses: geplant });
  assert.deepEqual(mit.rows, ohne.rows, 'die Abrechnung bleibt unberührt');
  assert.equal(mit.totalSpent, ohne.totalSpent);

  assert.deepEqual(groupByDay(geplant).map((g) => g.date), groupByDay(EXPENSES).map((g) => g.date));
  assert.deepEqual(spentByCategory(geplant), spentByCategory(EXPENSES));
  assert.deepEqual(
    dailySeries({ trip: TRIP, contributions: CONTRIB, expenses: geplant, today: TODAY }).map((d) => d.actual),
    dailySeries({ trip: TRIP, contributions: CONTRIB, expenses: EXPENSES, today: TODAY }).map((d) => d.actual),
  );
});

test('Budget: mehr verplant als da ist, wird als Überziehung gemeldet', () => {
  const b = computeBudget({
    trip: TRIP,
    contributions: CONTRIB,
    expenses: [{ id: 'p', date: '2026-07-09', amount: 200000, category: 'stay', payer: POT, planned: true }],
    today: TODAY,
  });
  assert.equal(b.spent, 0);
  assert.equal(b.free, -50000);
  assert.equal(b.status, 'over');
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

test('Abrechnung: ein überzogenes Konto meldet sich, statt „quitt“ zu sagen', () => {
  // Vom gemeinsamen Konto wurde mehr bezahlt, als beide eingezahlt haben.
  const s = settleUp({
    trip: TRIP,
    contributions: [{ id: 'c', personId: 'marie', amount: 120000, date: '2026-06-20' }],
    expenses: [{ id: 'e', date: '2026-07-01', amount: 394500, category: 'stay', payer: POT }],
  });

  assert.equal(s.potBalance, -274500, 'das Konto steht im Minus');
  assert.equal(s.rows[0].balance + s.rows[1].balance, s.potBalance, 'die Guthaben summieren sich weiterhin darauf');
  assert.ok(s.rows.every((r) => r.balance < 0), 'hier ist niemand im Plus');

  assert.equal(s.payouts.length, 0, 'von einem leeren Konto gibt es nichts zurück');
  assert.equal(s.topUps.reduce((a, p) => a + p.amount, 0), 274500, 'das Loch wird vollständig gestopft');
  assert.equal(s.leftInPot, 0);
  // Hier deckt sich die Schuld beider genau mit dem Loch — danach ist nichts offen.
  assert.equal(s.transfers.length, 0);
});

test('Abrechnung: überzogenes Konto und Privatauslagen zugleich', () => {
  // Marie hat 300 € aus eigener Tasche gezahlt, Lukas nichts eingezahlt.
  const s = settleUp({
    trip: TRIP,
    contributions: [{ id: 'c', personId: 'marie', amount: 10000, date: '2026-06-20' }],
    expenses: [
      { id: 'e1', date: '2026-07-01', amount: 40000, category: 'stay', payer: POT },
      { id: 'e2', date: '2026-07-01', amount: 30000, category: 'food', payer: 'marie' },
    ],
  });

  assert.equal(s.potBalance, -30000, '100 € drauf, 400 € runter');
  const [marie, lukas] = s.rows;
  assert.equal(marie.balance, 5000, 'Marie hat 400 € getragen bei 350 € Anteil');
  assert.equal(lukas.balance, -35000);
  assert.equal(marie.balance + lukas.balance, s.potBalance);

  // Lukas stopft das Loch, der Rest geht direkt an Marie.
  assert.deepEqual(s.topUps.map((p) => [p.name, p.amount]), [['Lukas', 30000]]);
  assert.equal(s.leftInPot, 0);
  assert.deepEqual(s.transfers.map((t) => [t.from, t.to, t.amount]), [['Lukas', 'Marie', 5000]]);
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

// --------------------------------------------------------------- Reisegruppe

test('Abrechnung: zu dritt geht die Rechnung genauso auf', () => {
  const trip = {
    ...TRIP,
    people: [
      { id: 'marie', name: 'Marie', share: 1 },
      { id: 'lukas', name: 'Lukas', share: 1 },
      { id: 'jo', name: 'Jo', share: 1 },
    ],
  };
  const contributions = [
    { id: 'c1', personId: 'marie', amount: 50000, date: '2026-06-20' },
    { id: 'c2', personId: 'lukas', amount: 50000, date: '2026-06-20' },
    // Jo hat nichts überwiesen, aber unterwegs privat bezahlt.
  ];
  const expenses = [
    { id: 'e1', date: '2026-07-01', amount: 60000, category: 'stay', payer: POT },
    { id: 'e2', date: '2026-07-02', amount: 30000, category: 'food', payer: 'jo' },
  ];
  const s = settleUp({ trip, contributions, expenses });

  assert.equal(s.rows.length, 3);
  assert.equal(s.totalSpent, 90000);
  // 900 € durch drei — ohne Rundungsverlust.
  assert.deepEqual(s.rows.map((r) => r.fairShare), [30000, 30000, 30000]);
  assert.equal(s.rows.reduce((a, r) => a + r.fairShare, 0), s.totalSpent);
  assert.equal(s.potBalance, 40000, '1000 € eingezahlt, 600 € vom Konto bezahlt');
  assert.equal(s.rows.reduce((a, r) => a + r.balance, 0), s.potBalance, 'die Guthaben summieren sich auf den Kontostand');
  // Jo hat genau seinen Anteil privat getragen und ist damit quitt.
  assert.equal(s.rows[2].balance, 0);
  assert.equal(s.leftInPot, 0);
});

test('Abrechnung: ungleiche Anteile in einer größeren Gruppe', () => {
  // Zwei Erwachsene tragen je zwei Anteile, ein Kind einen.
  const trip = {
    ...TRIP,
    people: [
      { id: 'a', name: 'Anna', share: 2 },
      { id: 'b', name: 'Ben', share: 2 },
      { id: 'c', name: 'Cem', share: 1 },
    ],
  };
  const contributions = [{ id: 'c1', personId: 'a', amount: 100000, date: '2026-06-20' }];
  const expenses = [{ id: 'e1', date: '2026-07-01', amount: 10000, category: 'food', payer: POT }];
  const s = settleUp({ trip, contributions, expenses });

  assert.deepEqual(s.rows.map((r) => r.fairShare), [4000, 4000, 2000]);
  assert.equal(s.rows.reduce((a, r) => a + r.fairShare, 0), 10000, 'kein Cent geht beim Teilen verloren');
  assert.equal(s.rows.reduce((a, r) => a + r.balance, 0), s.potBalance);
});

test('Abrechnung: allein unterwegs ist niemandem etwas zu überweisen', () => {
  const trip = { ...TRIP, people: [{ id: 'solo', name: 'Robin', share: 1 }] };
  const s = settleUp({
    trip,
    contributions: [{ id: 'c1', personId: 'solo', amount: 50000, date: '2026-06-20' }],
    expenses: [{ id: 'e1', date: '2026-07-01', amount: 20000, category: 'food', payer: POT }],
  });
  assert.equal(s.rows[0].fairShare, 20000);
  assert.equal(s.rows[0].balance, 30000);
  assert.equal(s.transfers.length, 0);
  assert.deepEqual(s.payouts.map((p) => p.amount), [30000], 'das Restgeld geht zurück');
});

test('Aufteilen bleibt auch bei krummen Beträgen verlustfrei', () => {
  // Drei Personen, ein Betrag, der sich nicht glatt teilen lässt.
  for (const cents of [1, 100, 1001, 34567]) {
    const parts = allocateByShares(cents, [1, 1, 1]);
    assert.equal(parts.reduce((a, b) => a + b, 0), cents, `${cents} geht auf`);
  }
});

test('Personenfarben reichen für die ganze Gruppe und wiederholen sich nicht', () => {
  assert.ok(PERSON_COLORS.length >= MAX_PEOPLE, 'für jede Person eine eigene Farbe');
  assert.equal(new Set(PERSON_COLORS).size, PERSON_COLORS.length);

  const people = [{ color: PERSON_COLORS[0] }, { color: PERSON_COLORS[2] }];
  assert.equal(nextPersonColor(people), PERSON_COLORS[1], 'eine mittendrin frei gewordene Farbe wird wiederverwendet');
  assert.equal(nextPersonColor([]), PERSON_COLORS[0]);
});

test('An wem Geld hängt, lässt sich zählen', () => {
  const daten = { contributions: CONTRIB, expenses: EXPENSES };
  assert.equal(personEntryCount('lukas', daten), 2, 'eine Einzahlung und eine privat bezahlte Ausgabe');
  assert.equal(personEntryCount('marie', daten), 1);
  assert.equal(personEntryCount('niemand', daten), 0);
});

test('Anteile bleiben lesbar, wenn die Gruppe wächst', () => {
  // Zu zweit speichert der Regler Prozente. Kommt eine dritte Person dazu,
  // bekommt sie den Durchschnitt — und die Liste zeigt gekürzte Anteile.
  const zuZweit = [{ share: 50 }, { share: 50 }];
  assert.equal(averageShare(zuZweit), 50);
  assert.deepEqual(normalizeShares([50, 50, averageShare(zuZweit)]), [1, 1, 1], 'gleichmäßig bleibt gleichmäßig');

  const ungleich = [{ share: 75 }, { share: 25 }];
  assert.deepEqual(normalizeShares([75, 25, averageShare(ungleich)]), [3, 1, 2]);

  // Sehr schiefe Aufteilungen werden heruntergerechnet, ohne jemanden auf 0 zu setzen.
  assert.deepEqual(normalizeShares([95, 5]), [9, 1]);
  assert.ok(normalizeShares([100, 1]).every((v) => v >= 1));
  // Unsinnige Werte fallen auf einen Anteil zurück, statt die Rechnung zu kippen.
  assert.deepEqual(normalizeShares([0, -3, NaN]), [1, 1, 1]);
  assert.equal(averageShare([]), 1);
});

test('Anteile in Prozent summieren sich auf 100', () => {
  // Die Anzeige neben den Steppern nutzt dieselbe Verteilung wie das Geld.
  assert.equal(allocateByShares(100, [1, 1, 1, 1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(allocateByShares(100, [2, 1, 1]), [50, 25, 25]);
});
