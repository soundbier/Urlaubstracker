/**
 * Reine Rechenlogik des Urlaubstrackers.
 *
 * Alle Geldbeträge sind ganzzahlige Cent-Werte, damit beim Teilen und
 * Aufsummieren nichts wegrundet. Alle Datumsangaben sind ISO-Strings
 * (`YYYY-MM-DD`) und werden als lokale Kalendertage behandelt, nie als
 * Zeitpunkte — ein Urlaubstag ist ein Tag, keine 24-Stunden-Spanne.
 */

export const CATEGORIES = [
  // `short` steht auf den Auswahl-Chips, `label` überall dort, wo Platz ist.
  // `icon` ist ein Name aus dem Icon-Vorrat in `dom.js`.
  { id: 'food', label: 'Essen & Trinken', short: 'Essen', icon: 'food' },
  { id: 'transport', label: 'Sprit & Transport', short: 'Sprit', icon: 'transport' },
  { id: 'stay', label: 'Übernachtung', short: 'Schlafen', icon: 'stay' },
  { id: 'activity', label: 'Aktivitäten', short: 'Erleben', icon: 'activity' },
  { id: 'shopping', label: 'Einkaufen', short: 'Einkauf', icon: 'shopping' },
  { id: 'other', label: 'Sonstiges', short: 'Sonstiges', icon: 'other' },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/** Zahler-Kennung für „aus der gemeinsamen Kasse bezahlt“. */
export const POT = 'pot';

/**
 * Wie viele Personen eine Kasse haben kann.
 *
 * Die Zahl ist keine technische Grenze, sondern eine des Bildschirms: bei mehr
 * als acht Namen wird aus der Zahler-Auswahl im Eingabe-Sheet eine Tapete. Sie
 * passt außerdem zur Obergrenze der Geräte in `firestore.rules`.
 */
export const MAX_PEOPLE = 8;

/**
 * Die Farben, an denen man die Personen in Listen und Abrechnung auseinander
 * hält. Acht Stück, deutlich verschiedene Farbtöne — auf hellem wie dunklem
 * Grund lesbar.
 */
export const PERSON_COLORS = [
  '#f472b6', '#38bdf8', '#a3e635', '#fbbf24',
  '#c084fc', '#2dd4bf', '#fb7185', '#94a3b8',
];

/** Die nächste freie Farbe — nach einem Wechsel in der Gruppe kann eine mittendrin frei werden. */
export function nextPersonColor(people = []) {
  const used = new Set(people.map((p) => p.color));
  return PERSON_COLORS.find((c) => !used.has(c)) || PERSON_COLORS[people.length % PERSON_COLORS.length];
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

/**
 * Anteile auf kleine, gut lesbare Zahlen bringen.
 *
 * Die Kostenaufteilung wird zu zweit in Prozent gespeichert (60/40), ab drei
 * Personen als Anteile (3:2). Beides ist dieselbe Aussage — aber ein Regler,
 * der „60“ hinterlässt, würde in der Anteilsliste als 60 dastehen und sich
 * dort nicht mehr sinnvoll bedienen lassen. Gekürzt wird deshalb auf den
 * größten gemeinsamen Teiler; was danach noch über `max` liegt, wird
 * heruntergerechnet, ohne dass jemand auf null fällt.
 */
export function normalizeShares(shares, max = 9) {
  const vals = shares.map((v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 1));
  if (!vals.length) return [];
  const teiler = vals.reduce((a, b) => gcd(a, b));
  const out = vals.map((v) => v / teiler);
  const biggest = Math.max(...out);
  if (biggest <= max) return out;
  return out.map((v) => Math.max(1, Math.round((v * max) / biggest)));
}

/** Der Anteil, mit dem jemand neu dazukommt: so viel wie die anderen im Schnitt. */
export function averageShare(people = []) {
  const vals = people.map((p) => (typeof p?.share === 'number' && p.share > 0 ? p.share : 1));
  if (!vals.length) return 1;
  return Math.max(1, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
}

/**
 * Woran hängt eine Person Geld? Genau das steht dem Entfernen im Weg: eine
 * Einzahlung ohne Einzahler oder eine privat bezahlte Ausgabe ohne Zahler
 * würde die Abrechnung still verfälschen.
 */
export function personEntryCount(personId, { contributions = [], expenses = [] } = {}) {
  return (
    contributions.filter((c) => c.personId === personId).length +
    expenses.filter((e) => e.payer === personId).length
  );
}

// ---------------------------------------------------------------- Datumshilfen

/** Heutiger Kalendertag als ISO-String, in der Zeitzone des Geräts. */
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** ISO-Tag als UTC-Mitternacht — nur für Differenzrechnungen gedacht. */
function dayValue(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 86400000;

export function addDays(iso, n) {
  const t = new Date(dayValue(iso) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Anzahl Tage von `a` bis `b`, beide eingeschlossen. Mindestens 1. */
export function daysInclusive(a, b) {
  return Math.max(1, Math.round((dayValue(b) - dayValue(a)) / DAY_MS) + 1);
}

/** Alle Kalendertage von `a` bis `b` als ISO-Strings. */
export function dateRange(a, b) {
  const out = [];
  const n = daysInclusive(a, b);
  for (let i = 0; i < n; i++) out.push(addDays(a, i));
  return out;
}

export function isValidDate(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(dayValue(iso));
}

// ------------------------------------------------------------------ Geldhilfen

/**
 * Wandelt eine Nutzereingabe in Cent. Akzeptiert Komma wie Punkt und
 * ignoriert Währungszeichen und Leerzeichen. Gibt `null` zurück, wenn sich
 * keine Zahl erkennen lässt.
 */
export function parseAmount(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  // Tausendertrennzeichen entfernen: das letzte Trennzeichen ist das Dezimalkomma
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const sep = Math.max(lastComma, lastDot);
  if (sep === -1) {
    s = s.replace(/[.,]/g, '');
  } else {
    const head = s.slice(0, sep).replace(/[.,]/g, '');
    const tail = s.slice(sep + 1).replace(/[.,]/g, '');
    s = `${head}.${tail}`;
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Teilt `cents` ganzzahlig auf `parts` Anteile; Restcent gehen an die ersten. */
export function splitCents(cents, parts) {
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  const base = Math.floor(abs / parts);
  const rest = abs - base * parts;
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < rest ? 1 : 0)));
}

/**
 * Verteilt `cents` nach Quoten, ohne dass Rundung Geld erzeugt oder
 * vernichtet: die Summe der Ergebnisse ist exakt `cents`.
 */
export function allocateByShares(cents, shares) {
  const total = shares.reduce((a, b) => a + b, 0);
  if (total <= 0) return splitCents(cents, Math.max(1, shares.length));
  const exact = shares.map((s) => (cents * s) / total);
  const floored = exact.map(Math.floor);
  let rest = cents - floored.reduce((a, b) => a + b, 0);
  // Restcent an die Anteile mit dem größten abgeschnittenen Nachkommateil
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floored.slice();
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length].i] += 1;
  return out;
}

// ---------------------------------------------------------------- Aggregation

const sum = (rows, pick) => rows.reduce((acc, r) => acc + (pick(r) || 0), 0);

/**
 * Verplante Ausgaben sind vorgemerkt, aber noch nicht bezahlt: das Geld liegt
 * noch in der Kasse, ist aber schon vergeben. Sie zählen deshalb nirgends als
 * Ausgabe mit — sie werden nur vom verteilbaren Geld abgezogen, bevor das
 * Tagesbudget entsteht. Wird so ein Eintrag bezahlt, verliert er diese Marke
 * und bekommt `fromPlan` (siehe unten).
 */
export const isPlanned = (e) => e?.planned === true;

/**
 * War es eine Vormerkung und ist inzwischen bezahlt? Diese Marke bleibt am
 * Eintrag hängen, damit das reservierte Geld auch nach dem Bezahlen aus dem
 * Tagesbudget herausgerechnet bleibt. Sonst spränge das Tagesbudget in dem
 * Moment nach oben, in dem das Hotel bezahlt wird — obwohl gerade Geld weg ist.
 */
export const isFromPlan = (e) => e?.fromPlan === true && !isPlanned(e);

/** Vorgemerktes oder daraus bezahltes Geld: läuft am Tagesbudget vorbei. */
export const isReserved = (e) => isPlanned(e) || isFromPlan(e);

/** Nur die tatsächlich bezahlten Ausgaben. */
export const paidOnly = (expenses) => expenses.filter((e) => !isPlanned(e));

/** Bezahlte Ausgaben ohne die aus einer Vormerkung — das tägliche Geld. */
export const everydayOnly = (expenses) => expenses.filter((e) => !isReserved(e));

/** Nur die vorgemerkten Ausgaben, nach Datum aufsteigend. */
export const plannedOnly = (expenses) =>
  expenses.filter(isPlanned).sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1));

export function totalContributed(contributions) {
  return sum(contributions, (c) => c.amount);
}

/** Was wirklich weg ist. Vorgemerktes zählt hier bewusst nicht mit. */
export function totalSpent(expenses) {
  return sum(paidOnly(expenses), (e) => e.amount);
}

/** Was vorgemerkt, aber noch nicht bezahlt ist. */
export function totalPlanned(expenses) {
  return sum(expenses.filter(isPlanned), (e) => e.amount);
}

/** Summen je Kalendertag: `{ '2026-07-03': 4210, … }` */
export function spentByDay(expenses) {
  const out = {};
  for (const e of paidOnly(expenses)) out[e.date] = (out[e.date] || 0) + e.amount;
  return out;
}

/** Ausgaben je Kategorie, absteigend sortiert. */
export function spentByCategory(expenses) {
  const acc = {};
  for (const e of paidOnly(expenses)) {
    const id = CATEGORY_BY_ID[e.category] ? e.category : 'other';
    acc[id] = (acc[id] || 0) + e.amount;
  }
  return Object.entries(acc)
    .map(([id, amount]) => ({ ...CATEGORY_BY_ID[id], amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Ausgaben nach Tag gruppiert, neueste zuerst; innerhalb eines Tages neueste Eingabe zuerst. */
export function groupByDay(expenses) {
  const days = new Map();
  for (const e of paidOnly(expenses)) {
    if (!days.has(e.date)) days.set(e.date, []);
    days.get(e.date).push(e);
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      total: totalSpent(items),
      items: items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    }));
}

// ------------------------------------------------------------- Budget-Kennzahlen

/**
 * Wo im Urlaub stehen wir? `before` (noch nicht losgefahren), `during` oder
 * `after` (zurück).
 */
export function tripPhase(trip, today) {
  if (today < trip.startDate) return 'before';
  if (today > trip.endDate) return 'after';
  return 'during';
}

/**
 * Die zentrale Rechnung: was ist da, was ist weg, was bleibt heute übrig.
 *
 * `budgetMode`:
 *   - `dynamic` – das Tagesbudget wird jeden Morgen neu aus dem Restgeld
 *     geteilt durch die verbleibenden Tage berechnet. Ein teurer Tag macht die
 *     Folgetage nur ein bisschen kleiner statt eine Schuld aufzubauen.
 *   - `fixed`   – jeden Tag derselbe Betrag (Gesamtbudget ÷ Urlaubstage).
 *
 * Wichtig: das Tagesbudget wird aus dem Stand von *heute früh* gerechnet.
 * Sonst würde es beim Eintragen einer Ausgabe unter den Fingern schrumpfen.
 *
 * Verplantes Geld (`planned`) ist schon vergeben, aber noch nicht bezahlt. Es
 * wird vom verteilbaren Geld abgezogen, bevor geteilt wird: bei 2000 € Kasse
 * und 250 € Vorgemerktem rechnet das Tagesbudget mit 1750 €. Sonst würde die
 * App jeden Tag Geld anbieten, das längst für das Hotel eingeplant ist. Nach
 * dem Bezahlen bleibt der Betrag über `fromPlan` draußen — das Tagesbudget
 * darf nicht in dem Moment nach oben springen, in dem Geld abfließt.
 */
export function computeBudget({ trip, contributions = [], expenses = [], today = todayISO() }) {
  const paid = paidOnly(expenses);
  const everyday = everydayOnly(expenses);
  const total = totalContributed(contributions);
  const spent = totalSpent(expenses);
  const planned = totalPlanned(expenses);
  const paidFromPlan = sum(paid.filter(isFromPlan), (e) => e.amount);
  // Alles, was einmal verplant war — offen oder inzwischen bezahlt. Genau
  // dieser Betrag bleibt dauerhaft aus dem Tagesbudget heraus.
  const reserved = planned + paidFromPlan;
  const spentEveryday = sum(everyday, (e) => e.amount);
  const remaining = total - spent;
  // Was nach Abzug des noch offenen Vorgemerkten wirklich frei verfügbar ist.
  const free = remaining - planned;
  // Die Grundlage aller Tagesbudgets: die Kasse ohne das Vergebene.
  const budgetBase = total - reserved;

  const totalDays = daysInclusive(trip.startDate, trip.endDate);
  const phase = tripPhase(trip, today);

  // Angebrochene Tage inkl. heute; vor der Reise 0, danach alle.
  const elapsedDays =
    phase === 'before' ? 0 : phase === 'after' ? totalDays : daysInclusive(trip.startDate, today);
  // Tage, auf die sich das Restgeld noch verteilt — heute zählt mit.
  const daysLeft = phase === 'before' ? totalDays : phase === 'after' ? 0 : totalDays - elapsedDays + 1;

  // Fürs Tagesbudget zählt nur das tägliche Geld: eine bezahlte Vormerkung war
  // nie Teil davon und darf den Tag nicht auffressen.
  const spentToday = sum(everyday.filter((e) => e.date === today), (e) => e.amount);
  const spentBeforeToday = sum(everyday.filter((e) => e.date < today), (e) => e.amount);
  const availableThisMorning = budgetBase - spentBeforeToday;

  // Vorgemerktes, aufgeteilt danach, wann es dran ist — für die Anzeige.
  const plannedRows = plannedOnly(expenses);
  const plannedToday = sum(plannedRows.filter((e) => e.date === today), (e) => e.amount);
  const plannedAhead = sum(plannedRows.filter((e) => e.date > today), (e) => e.amount);
  const plannedOverdue = sum(plannedRows.filter((e) => e.date < today), (e) => e.amount);

  const planPerDay = totalDays > 0 ? Math.round(budgetBase / totalDays) : 0;
  const dynamicPerDay = daysLeft > 0 ? Math.floor(availableThisMorning / daysLeft) : 0;
  const perDayToday = trip.budgetMode === 'fixed' ? planPerDay : dynamicPerDay;
  const leftToday = perDayToday - spentToday;

  // Polster: wie weit liegen wir gegenüber „gleichmäßig ausgeben“ vorn oder hinten.
  const buffer = planPerDay * elapsedDays - spentEveryday;

  // Hochrechnung: wenn es im Schnitt so weitergeht wie bisher. Das Reservierte
  // kommt obendrauf — es folgt keinem Schnitt, es steht ja schon fest.
  const pace = elapsedDays > 0 ? Math.round(spentEveryday / elapsedDays) : 0;
  const projectedTotal = elapsedDays > 0 ? pace * totalDays + reserved : 0;
  const projectedLeftover = elapsedDays > 0 ? total - projectedTotal : free;

  let status;
  if (total === 0) status = 'empty';
  else if (remaining < 0 || free < 0) status = 'over';
  else if (leftToday < 0) status = 'over';
  else if (perDayToday > 0 && leftToday < perDayToday * 0.2) status = 'tight';
  else status = 'good';

  return {
    total,
    spent,
    spentEveryday,
    planned,
    reserved,
    paidFromPlan,
    plannedToday,
    plannedAhead,
    plannedOverdue,
    plannedCount: plannedRows.length,
    budgetBase,
    remaining,
    free,
    totalDays,
    elapsedDays,
    daysLeft,
    phase,
    daysUntilStart: phase === 'before' ? daysInclusive(today, trip.startDate) - 1 : 0,
    spentToday,
    spentBeforeToday,
    availableThisMorning,
    planPerDay,
    dynamicPerDay,
    perDayToday,
    leftToday,
    buffer,
    pace,
    projectedTotal,
    projectedLeftover,
    status,
    spentRatio: total > 0 ? Math.min(1, spent / total) : 0,
    plannedRatio: total > 0 ? Math.min(1, Math.max(0, planned) / total) : 0,
  };
}

/**
 * Verlauf über den Urlaub: Soll-Linie gegen tatsächlichen Kontostand.
 * Tage nach heute bleiben bei `actual: null`, damit der Chart dort aufhört.
 */
export function dailySeries({ trip, contributions = [], expenses = [], today = todayISO() }) {
  const total = totalContributed(contributions);
  const days = dateRange(trip.startDate, trip.endDate);
  const perDay = spentByDay(expenses);
  // Die Soll-Linie verteilt nur das freie Geld: sie endet nicht bei null,
  // sondern beim vorgemerkten Betrag, der bis zuletzt reserviert bleibt.
  const reserved = totalPlanned(expenses);
  const planPerDay = (total - reserved) / days.length;

  // Ausgaben vor Reisebeginn zählen mit, sonst fehlt Geld ohne Erklärung.
  let cum = sum(paidOnly(expenses).filter((e) => e.date < trip.startDate), (e) => e.amount);

  return days.map((date, i) => {
    const spentOnDay = perDay[date] || 0;
    const isFuture = date > today;
    if (!isFuture) cum += spentOnDay;
    return {
      date,
      spentOnDay,
      planned: Math.round(total - planPerDay * (i + 1)),
      actual: isFuture ? null : total - cum,
      isToday: date === today,
      isFuture,
    };
  });
}

// ----------------------------------------------------------------- Abrechnung

/**
 * Endabrechnung: wer hat wie viel getragen, was liegt noch auf dem gemeinsamen
 * Konto, und wer muss wem am Ende noch etwas überweisen.
 *
 * Getragen hat jede Person, was sie eingezahlt und was sie zusätzlich aus
 * eigener Tasche bezahlt hat. Fair wäre ihr Anteil an den Gesamtausgaben
 * (standardmäßig durch alle geteilt, über `person.share` änderbar — eine
 * Person mit doppeltem Anteil trägt doppelt so viel). Die Differenz ist ihr
 * Guthaben — die Summe aller Guthaben ist genau das, was auf dem Konto liegt.
 * Das gilt in beide Richtungen: steht das Konto im Minus, sind auch die
 * Guthaben in der Summe negativ, und `topUps` sagt, wer wie viel nachlegt.
 */
export function settleUp({ trip, contributions = [], expenses = [] }) {
  const people = trip.people || [];
  // Vorgemerktes ist noch nicht geflossen und gehört deshalb nicht in die
  // Abrechnung — sonst schuldete jemand Geld für ein Hotel, das keiner zahlte.
  const paid = paidOnly(expenses);
  const spent = totalSpent(paid);

  const shares = people.map((p) => (typeof p.share === 'number' && p.share > 0 ? p.share : 1));
  const fairShares = allocateByShares(spent, shares);

  const paidIntoPot = sum(paid.filter((e) => e.payer === POT), (e) => e.amount);
  const potBalance = totalContributed(contributions) - paidIntoPot;

  const rows = people.map((p, i) => {
    const paidIn = sum(contributions.filter((c) => c.personId === p.id), (c) => c.amount);
    const paidPrivate = sum(paid.filter((e) => e.payer === p.id), (e) => e.amount);
    return {
      personId: p.id,
      name: p.name,
      paidIn,
      paidPrivate,
      contributed: paidIn + paidPrivate,
      fairShare: fairShares[i],
      balance: paidIn + paidPrivate - fairShares[i],
    };
  });

  const payouts = [];
  const topUps = [];
  let pot = potBalance;
  const owed = new Map(rows.map((r) => [r.personId, r.balance]));

  if (pot > 0) {
    // Der Normalfall: es liegt noch Geld auf dem Konto. Das geht zuerst an die
    // Guthaben zurück, bevor sich jemand privat etwas überweist.
    for (const r of rows) {
      if (pot <= 0) break;
      const take = Math.min(pot, Math.max(0, owed.get(r.personId)));
      if (take > 0) {
        payouts.push({ personId: r.personId, name: r.name, amount: take });
        owed.set(r.personId, owed.get(r.personId) - take);
        pot -= take;
      }
    }
  } else if (pot < 0) {
    // Vom Konto ging mehr weg, als eingezahlt wurde — es steht im Minus. Das
    // Loch stopfen die, die ohnehin zu wenig beigesteuert haben; erst danach
    // bleibt überhaupt etwas übrig, das man sich untereinander überweisen kann.
    let missing = -pot;
    for (const r of rows) {
      if (missing <= 0) break;
      const give = Math.min(missing, Math.max(0, -owed.get(r.personId)));
      if (give > 0) {
        topUps.push({ personId: r.personId, name: r.name, amount: give });
        owed.set(r.personId, owed.get(r.personId) + give);
        missing -= give;
        pot += give;
      }
    }
  }

  // … was danach offen bleibt, gleichen die Personen untereinander aus.
  const debtors = rows.filter((r) => owed.get(r.personId) < 0).map((r) => ({ ...r, open: -owed.get(r.personId) }));
  const creditors = rows.filter((r) => owed.get(r.personId) > 0).map((r) => ({ ...r, open: owed.get(r.personId) }));
  const transfers = [];
  let di = 0;
  for (const c of creditors) {
    let need = c.open;
    while (need > 0 && di < debtors.length) {
      const d = debtors[di];
      const amount = Math.min(need, d.open);
      if (amount > 0) {
        transfers.push({ fromId: d.personId, from: d.name, toId: c.personId, to: c.name, amount });
        d.open -= amount;
        need -= amount;
      }
      if (d.open === 0) di++;
    }
  }

  return { rows, potBalance, totalSpent: spent, payouts, topUps, transfers, leftInPot: pot };
}
