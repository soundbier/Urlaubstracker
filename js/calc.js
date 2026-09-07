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
 * Zahler-Kennung für „aus dem Bargeld dieser Person bezahlt“.
 *
 * Anders als bei `payer = personId` (privat vorgestreckt, eigenes Geld) ist
 * das hier Geld, das vorher schon aus der Kasse ausgezahlt wurde — es gehört
 * also weiterhin der Gruppe, nur eben in bar statt auf dem Konto. Deshalb ist
 * das kein eigener Personenwert, sondern derselbe mit einem Präfix: so bleibt
 * an jeder Ausgabe ablesbar, wessen Bargeld weniger geworden ist, ohne dass
 * die Abrechnung diese Person dafür wie eine Einzahlerin behandelt.
 */
const CASH_PREFIX = 'cash:';

export const cashPayerFor = (personId) => `${CASH_PREFIX}${personId}`;
export const isCashPayer = (payer) => typeof payer === 'string' && payer.startsWith(CASH_PREFIX);
/** Die Person hinter einem Bargeld-Zahler, sonst `null`. */
export const cashPayerPerson = (payer) => (isCashPayer(payer) ? payer.slice(CASH_PREFIX.length) : null);

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
 *
 * Gedeckt statt leuchtend: Diese Punkte stehen neben Tinte auf Papier, und in
 * Neon waren sie der lauteste Ton auf jedem Bildschirm, obwohl sie nur sagen,
 * wer gemeint ist. Bestehende Kassen behalten ihre gespeicherten Farben —
 * diese Liste gilt für alle, die neu dazukommen.
 */
export const PERSON_COLORS = [
  '#b5654e', '#4a7a8c', '#7d8b52', '#c08a3e',
  '#8a6a9c', '#4f8a7b', '#a8556a', '#7b7468',
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
 * Woran hängt eine Person Geld — oder eine Liste, die sonst niemand mehr zu
 * sehen bekäme? Genau das steht dem Entfernen im Weg: eine Einzahlung ohne
 * Einzahler, eine privat bezahlte Ausgabe ohne Zahler oder eine
 * Bargeld-Auszahlung ohne Empfänger würde die Abrechnung still verfälschen —
 * und ein Eintrag der privaten Packliste ohne die Person, der er gehört,
 * wäre für niemanden mehr auffindbar (siehe `packItemsMine`). Die gemeinsame
 * Packliste zählt hier nicht mit: die gehört nach dem Entfernen weiter allen
 * übrigen.
 */
export function personEntryCount(personId, { contributions = [], expenses = [], cashOuts = [], planItems = [], packItems = [] } = {}) {
  return (
    contributions.filter((c) => c.personId === personId).length +
    expenses.filter((e) => e.payer === personId || cashPayerPerson(e.payer) === personId).length +
    cashOuts.filter((c) => c.personId === personId).length +
    planItems.filter((p) => p.payer === personId).length +
    packItems.filter((p) => p.createdBy === personId && p.shared === false).length
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

/**
 * Zwingt ein Datum in den Reisezeitraum.
 *
 * Für den Tageswechsel im Tagesplan: außerhalb der Reise gibt es keinen Tag,
 * den man dort ansehen könnte — vor der Abfahrt zeigt die Tagesansicht deshalb
 * gleich den ersten Reisetag, nach der Rückkehr den letzten, statt an einem
 * Datum zu landen, zu dem es nichts zu planen gibt.
 */
export function clampDateToTrip(date, trip) {
  if (date < trip.startDate) return trip.startDate;
  if (date > trip.endDate) return trip.endDate;
  return date;
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

// ------------------------------------------------------------------ Reiseplan

/**
 * Ob ein Programmpunkt „erledigt“ wirkt.
 *
 * Das ist nicht immer dasselbe wie sein eigenes `done`-Feld: Wird die
 * verknüpfte Vormerkung direkt unter „Ausgaben“ bezahlt (statt über den Haken
 * im Reiseplan), bleibt `done` dort unberührt stehen. Der Programmpunkt soll
 * trotzdem sofort als erledigt gelten — sonst zeigte der Plan ein „noch
 * offen“, das die Kasse längst nicht mehr kennt.
 */
export function planItemDone(item, expenseById) {
  if (item.done) return true;
  const linked = item.linkedExpenseId ? expenseById.get(item.linkedExpenseId) : null;
  return !!(linked && !linked.planned);
}

/** Programmpunkte eines einzelnen Tages, sortiert für die Anzeige. */
export function planItemsOnDay(planItems, date) {
  return planItems
    .filter((p) => p.date === date)
    .sort((a, b) => {
      const at = a.time || '';
      const bt = b.time || '';
      if (at === bt) return (a.createdAt || 0) - (b.createdAt || 0);
      // Ohne Uhrzeit zuerst — wie ein „ganztägig“ am Kopf eines Kalendertages.
      if (!at) return -1;
      if (!bt) return 1;
      return at < bt ? -1 : 1;
    });
}

/**
 * Programmpunkte je Reisetag, aufsteigend — auch für Tage, an denen noch
 * nichts steht. Ein Planer, der nur die Tage mit Einträgen zeigt, verschweigt
 * genau die Lücken, die er eigentlich sichtbar machen soll. Punkte außerhalb
 * des Reisezeitraums (kommt kaum vor, etwa nach einer Verlängerung) gehen
 * deshalb nicht verloren, sondern hängen als eigener Tag hinten dran.
 */
export function planItemsByDay(planItems, startDate, endDate) {
  const days = new Set(dateRange(startDate, endDate));
  for (const p of planItems) days.add(p.date);
  return [...days].sort().map((date) => ({ date, items: planItemsOnDay(planItems, date) }));
}

/**
 * Wie viele Programmpunkte eines Tages schon erledigt sind — für den
 * Tagesfortschritt im Reiseplan. Zählt über `planItemDone`, nicht über das
 * eigene Feld: sonst bliebe ein anderswo bezahlter Programmpunkt ungezählt.
 */
export function planDayProgress(items, expenseById) {
  const done = items.filter((p) => planItemDone(p, expenseById)).length;
  return { done, total: items.length };
}

// ------------------------------------------------------------------ Packliste

/**
 * Die andere Hälfte der Planung: nicht „was machen wir“, sondern „was muss
 * mit“.
 *
 * Ein Eintrag der Packliste kennt weder Datum noch Betrag — ein Koffer wird
 * nicht an einem Dienstag gepackt, sondern bis zur Abfahrt, und was er kostet,
 * steht (wenn überhaupt) längst unter „Ausgaben“. Übrig bleiben drei Angaben:
 * was es ist, wie weit es ist, in welche Tasche es gehört.
 *
 * Die Kategorien sind eigene, nicht die der Ausgaben: „Essen & Trinken“ ist
 * keine Sorte Gepäck, „Hygiene“ keine Sorte Ausgabe. Eine geteilte Liste
 * hätte beiden Seiten schlecht gepasst.
 */
export const PACK_CATEGORIES = [
  // `short`: „Dokumente“ hat keine natürliche Trennstelle und bricht ohne
  // verlässliche Worttrennung mitten im Wort um („Dokument-e“ ohne
  // Trennzeichen) — Chromium hat nicht überall eine Silbentrennung parat.
  { id: 'documents', label: 'Dokumente', short: 'Papiere', icon: 'documents' },
  { id: 'tech', label: 'Technik', icon: 'tech' },
  { id: 'hygiene', label: 'Hygiene', icon: 'hygiene' },
  // `short` nur hier: als einziger Name in dieser Liste ist „Reiseapotheke“
  // allein schon breiter als eine Rasterspalte im Eingabe-Sheet und brach
  // dort mitten im Wort um. Die Filterreiter und Gruppentitel zeigen weiter
  // den vollen Namen — sie binden `label`, nicht `short`.
  { id: 'meds', label: 'Reiseapotheke', short: 'Apotheke', icon: 'meds' },
  { id: 'shoes', label: 'Schuhe', icon: 'shoes' },
  { id: 'trips', label: 'Ausflüge', icon: 'backpack' },
  { id: 'beach', label: 'Strand', icon: 'beach' },
  { id: 'clothing', label: 'Kleidung', icon: 'clothing' },
  { id: 'other', label: 'Sonstiges', icon: 'other' },
];

/**
 * Die Sorten innerhalb einer Kategorie — „Kleidung“ allein sagt nicht, ob
 * jemand vier Hemden oder viermal dieselbe Jeans dabei hat.
 *
 * Sie hängen bewusst an der Kategorie und stehen nicht in einer gemeinsamen
 * Liste: „Sneaker“ unter Hygiene wäre ein Tippfehler, den niemand bemerkt,
 * und eine Auswahl aus achtzig Sorten wäre keine Auswahl mehr. Was hier steht,
 * ist deshalb kurz gehalten — es soll die Frage „was genau ist das“ mit einem
 * Tipp beantworten, nicht jeden Gegenstand der Welt benennen. Was nicht
 * dabeisteht, bleibt ohne Sorte: die Angabe ist freiwillig, und die Zeile ist
 * auch ohne sie vollständig.
 *
 * „Sonstiges“ bekommt keine — was dort landet, hat sich ja gerade keiner
 * Sorte fügen wollen.
 */
export const PACK_SUBCATEGORIES = {
  documents: [
    { id: 'passport', label: 'Ausweis & Pass' },
    { id: 'ticket', label: 'Ticket' },
    { id: 'booking', label: 'Buchung' },
    { id: 'insurance', label: 'Versicherung' },
    { id: 'license', label: 'Führerschein' },
    { id: 'money', label: 'Bargeld & Karten' },
  ],
  tech: [
    { id: 'charger', label: 'Ladekabel' },
    { id: 'powerbank', label: 'Powerbank' },
    { id: 'adapter', label: 'Adapter' },
    { id: 'headphones', label: 'Kopfhörer' },
    { id: 'camera', label: 'Kamera' },
    { id: 'device', label: 'Gerät' },
  ],
  hygiene: [
    { id: 'teeth', label: 'Zahnpflege' },
    { id: 'shower', label: 'Duschzeug' },
    { id: 'hair', label: 'Haarpflege' },
    { id: 'care', label: 'Pflege & Creme' },
    { id: 'shave', label: 'Rasur' },
    { id: 'towel', label: 'Handtuch' },
  ],
  meds: [
    { id: 'pills', label: 'Medikament' },
    { id: 'painkiller', label: 'Schmerzmittel' },
    { id: 'plaster', label: 'Pflaster & Verband' },
    { id: 'sun', label: 'Sonnenschutz' },
    { id: 'insect', label: 'Insektenschutz' },
    { id: 'stomach', label: 'Magen & Darm' },
  ],
  shoes: [
    { id: 'sneaker', label: 'Sneaker' },
    { id: 'sandals', label: 'Sandalen' },
    { id: 'flipflops', label: 'Badelatschen' },
    { id: 'hiking', label: 'Wanderschuhe' },
    { id: 'smart', label: 'Elegante Schuhe' },
    { id: 'boots', label: 'Stiefel' },
  ],
  trips: [
    { id: 'backpack', label: 'Rucksack' },
    { id: 'bottle', label: 'Trinkflasche' },
    { id: 'raingear', label: 'Regenschutz' },
    { id: 'guide', label: 'Karte & Führer' },
    { id: 'binoculars', label: 'Fernglas' },
    { id: 'snack', label: 'Proviant' },
  ],
  beach: [
    { id: 'beachtowel', label: 'Strandtuch' },
    { id: 'sunglasses', label: 'Sonnenbrille' },
    { id: 'hat', label: 'Sonnenhut' },
    { id: 'snorkel', label: 'Schnorchel' },
    { id: 'float', label: 'Luftmatratze' },
    { id: 'toys', label: 'Strandspielzeug' },
  ],
  clothing: [
    { id: 'tshirt', label: 'T-Shirt' },
    { id: 'shirt', label: 'Hemd & Bluse' },
    { id: 'pullover', label: 'Pullover' },
    { id: 'jacket', label: 'Jacke' },
    { id: 'longpants', label: 'Lange Hose' },
    { id: 'shortpants', label: 'Kurze Hose' },
    { id: 'dress', label: 'Kleid & Rock' },
    { id: 'underwear', label: 'Unterwäsche' },
    { id: 'socks', label: 'Socken' },
    { id: 'sleepwear', label: 'Schlafanzug' },
    { id: 'swimwear', label: 'Badesachen' },
    { id: 'sportswear', label: 'Sportsachen' },
  ],
  other: [],
};

/**
 * Wie weit ein Eintrag ist — in der Reihenfolge, in der ein Ding durch die
 * Woche vor der Abfahrt wandert: es steht auf der Liste, muss vielleicht noch
 * gekauft oder gewaschen werden, liegt dann bereit und liegt am Ende im
 * Koffer.
 *
 * `short` steht als Beiwort an der Zeile, wo nur ein Wort Platz hat; `label`
 * in der Auswahl und über den Gruppen, wo der ganze Satz hingehört.
 */
export const PACK_STATUSES = [
  { id: 'open', label: 'Noch offen', short: 'offen' },
  { id: 'buy', label: 'Noch zu kaufen', short: 'kaufen' },
  { id: 'wash', label: 'Noch zu waschen', short: 'waschen' },
  { id: 'ready', label: 'Liegt bereit', short: 'bereit' },
  { id: 'packed', label: 'Eingepackt', short: 'eingepackt' },
];

/**
 * Handgepäck oder Aufgabegepäck — die Frage, die am Flughafen zählt und die
 * sich beim Eintragen selten schon beantworten lässt. Deshalb ein dritter
 * Wert: noch offen ist ein gültiger Zustand, kein fehlender.
 */
export const PACK_BAGS = [
  { id: 'none', label: 'Noch offen', short: '' },
  { id: 'hand', label: 'Handgepäck', short: 'Handgepäck' },
  { id: 'hold', label: 'Aufgabegepäck', short: 'Aufgabegepäck' },
];

export const PACK_CATEGORY_BY_ID = Object.fromEntries(PACK_CATEGORIES.map((c) => [c.id, c]));
export const PACK_STATUS_BY_ID = Object.fromEntries(PACK_STATUSES.map((s) => [s.id, s]));
export const PACK_BAG_BY_ID = Object.fromEntries(PACK_BAGS.map((b) => [b.id, b]));
// Erst die Kategorie, dann die Sorte: dieselbe Kennung kann in zwei
// Kategorien vorkommen, ohne dass die eine die andere trifft.
const PACK_SUB_BY_ID = Object.fromEntries(
  Object.entries(PACK_SUBCATEGORIES).map(([cat, list]) => [cat, Object.fromEntries(list.map((s) => [s.id, s]))]),
);

// Aus einer Sicherungskopie, von einem älteren Gerät oder aus einer künftigen
// Fassung kann ein Wert kommen, den diese hier nicht kennt. Gelesen wird
// deshalb nie das rohe Feld, sondern immer durch diese drei — sonst stünde ein
// Eintrag in keiner Gruppe und wäre unauffindbar, obwohl er da ist.
export const packCategory = (item) => (PACK_CATEGORY_BY_ID[item?.category] ? item.category : 'other');
export const packStatus = (item) => (PACK_STATUS_BY_ID[item?.status] ? item.status : 'open');
export const packBag = (item) => (PACK_BAG_BY_ID[item?.bag] ? item.bag : 'none');
export const packItemPacked = (item) => packStatus(item) === 'packed';

/**
 * Wessen Liste: die eigene, private — oder die gemeinsame, die alle sehen und
 * abhaken dürfen.
 *
 * Vorher gehörte jeder Eintrag automatisch allen: wer der Kasse beitrat, sah
 * sofort die ganze Packliste eines anderen. Das passt für das, was wirklich
 * alle angeht (die gemeinsame Erste-Hilfe-Tasche, das Zelt), aber nicht für
 * „meine Unterwäsche“ — deshalb jetzt zwei Listen statt einer.
 *
 * Ein Eintrag ohne das Feld stammt aus der Zeit vor dieser Unterscheidung und
 * war damals für alle sichtbar; er bleibt es, sonst verschwände er beim
 * nächsten Update kommentarlos aus jeder Liste. Neu angelegte Einträge tragen
 * das Feld immer ausdrücklich (siehe `store.js`).
 */
export const packItemShared = (item) => item?.shared !== false;

export const PACK_SCOPES = [
  { id: 'mine', label: 'Meine Liste', icon: 'person' },
  { id: 'shared', label: 'Gemeinsame Liste', icon: 'people' },
];

/**
 * Die eigene, private Liste — ohne gewählte Person gibt es die gar nicht:
 * sonst landeten die privaten Einträge mehrerer Geräte ohne Person in einem
 * Topf, nur weil an keinem von ihnen `createdBy` gesetzt ist.
 */
export function packItemsMine(items, myPersonId) {
  if (!myPersonId) return [];
  return items.filter((i) => !packItemShared(i) && i.createdBy === myPersonId);
}

/** Die gemeinsame Liste — für alle Mitglieder der Kasse gleich. */
export function packItemsShared(items) {
  return items.filter(packItemShared);
}

/** Die Sorten, die zu einer Kategorie gehören — leer, wo es keine gibt. */
export const packSubs = (categoryId) => PACK_SUBCATEGORIES[categoryId] || [];

/**
 * Die Sorte wird immer gegen die Kategorie geprüft, in der sie steht. Das
 * erledigt zwei Fälle mit derselben Zeile: eine unbekannte Sorte (aus einer
 * Sicherung, aus einer künftigen Fassung) und eine, die zu einer anderen
 * Kategorie gehört — wer „T-Shirt“ nachträglich auf „Schuhe“ umstellt, hat
 * danach keine Sorte mehr, statt einer falschen.
 */
export const packSub = (item) => (PACK_SUB_BY_ID[packCategory(item)]?.[item?.sub] ? item.sub : '');
export const packSubLabel = (item) => PACK_SUB_BY_ID[packCategory(item)]?.[packSub(item)]?.label || '';

/**
 * Wie viele Stück ein Eintrag meint.
 *
 * Sechs T-Shirts sind sechs Zeilen wert, wenn sie sich unterscheiden — und
 * eine, wenn nicht. Beides kommt vor, deshalb steht die Anzahl am Eintrag und
 * nicht bloß in der Notiz: nur so kann die Übersicht „6 T-Shirts“ sagen, ohne
 * zu raten, was in „6x T-Shirt (blau/weiß)“ die Zahl ist. Voreingestellt ist
 * eins; alles Unlesbare zählt ebenfalls als eins, denn ein Eintrag ohne
 * Anzahl ist immer noch ein Ding, das mitmuss.
 */
export const PACK_QTY_MAX = 99;
export const packQty = (item) => {
  const n = Math.floor(Number(item?.qty));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, PACK_QTY_MAX) : 1;
};

/** Wie viel schon im Koffer liegt — der Stand über der Liste. */
export function packProgress(items) {
  return { done: items.filter(packItemPacked).length, total: items.length };
}

/**
 * Innerhalb einer Gruppe bleibt die Reihenfolge die der Eingabe: Wer die
 * Kleidung in einem Rutsch einträgt, denkt dabei in einer Reihenfolge, und ein
 * alphabetisch sortierendes Feld würde jede Zeile unter dem Finger wegziehen.
 */
const byEntryOrder = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

function groupPackItems(items, buckets, keyOf) {
  return buckets
    .map((bucket) => ({ ...bucket, items: items.filter((i) => keyOf(i) === bucket.id).sort(byEntryOrder) }))
    // Leere Kategorien fallen weg — anders als bei den Reisetagen, wo die
    // Lücke selbst die Auskunft ist. „Strand“ ohne Einträge sagt nichts, es
    // fährt ja nicht jeder ans Meer.
    .filter((g) => g.items.length);
}

/** Nach Kategorie gruppiert, in der Reihenfolge von `PACK_CATEGORIES`. */
export function packItemsByCategory(items) {
  return groupPackItems(items, PACK_CATEGORIES, packCategory);
}

/** Nach Stand gruppiert — für den Blick „was fehlt noch“. */
export function packItemsByStatus(items) {
  return groupPackItems(items, PACK_STATUSES, packStatus);
}

/**
 * Die drei Sichten der Übersicht. „Beides“ steht vorn, weil die Frage meistens
 * erst beim zweiten Hinsehen auf eine Tasche zielt; wer nur wissen will, was
 * überhaupt mitkommt, soll nichts umstellen müssen.
 */
export const PACK_OVERVIEW_BAGS = [
  // `where` steht unter der Zahl („14 von 22 Teilen im Handgepäck“) und sagt,
  // worauf sie sich bezieht — die Auswahl darüber ist beim Lesen der Zahl
  // längst wieder aus dem Blick.
  { id: 'both', label: 'Beides', where: 'insgesamt' },
  { id: 'hand', label: 'Handgepäck', where: 'im Handgepäck' },
  { id: 'hold', label: 'Aufgabegepäck', where: 'im Aufgabegepäck' },
];

/**
 * Die Übersicht: nicht welche Zeilen es gibt, sondern wie viel davon.
 *
 * Das ist der eine Ort in dieser App, an dem in Stücken gezählt wird und nicht
 * in Einträgen — „vier lange Hosen“ ist die Auskunft, die man vor dem
 * Zuklappen des Koffers sucht, und ob sie aus vier Zeilen kommt oder aus einer
 * mit der Anzahl vier, ist dabei gleichgültig. Der Stand über der Liste zählt
 * weiterhin Einträge: er misst das Abhaken, und abgehakt wird eine Zeile.
 *
 * Zurück kommt die volle Aufteilung nach Kategorie und Sorte, ohne die
 * leeren Fächer — dieselbe Zurückhaltung wie bei den Gruppen der Liste. Was
 * ohne Sorte eingetragen ist, verschwindet nicht, sondern steht am Ende seiner
 * Kategorie: sonst wäre die Übersicht kleiner als die Liste und niemand
 * wüsste, warum.
 */
export function packOverview(items, bagId = 'both') {
  const shown = bagId === 'hand' || bagId === 'hold' ? items.filter((i) => packBag(i) === bagId) : items;

  const tally = (list) => list.reduce((acc, i) => {
    const n = packQty(i);
    acc.total += n;
    if (packItemPacked(i)) acc.done += n;
    return acc;
  }, { done: 0, total: 0 });

  const categories = PACK_CATEGORIES
    .map((cat) => {
      const own = shown.filter((i) => packCategory(i) === cat.id);
      const rows = [
        ...packSubs(cat.id).map((sub) => ({ id: sub.id, label: sub.label, ...tally(own.filter((i) => packSub(i) === sub.id)) })),
        { id: '', label: 'Ohne Angabe', ...tally(own.filter((i) => !packSub(i))) },
      ].filter((r) => r.total);
      return { ...cat, ...tally(own), rows };
    })
    .filter((c) => c.total);

  return { bag: bagId, ...tally(shown), categories };
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

// -------------------------------------------------------------------- Bargeld

/**
 * Bargeldbestand je Person: was aus der Kasse an sie ausgezahlt wurde, abzüglich
 * dessen, was davon schon bar ausgegeben ist.
 *
 * Das ist ein eigenes, kleines Buch neben der Kasse selbst — eine Auszahlung
 * verschiebt Geld nur von der Form „auf dem Konto“ in die Form „in der
 * Tasche“, sie ist keine Ausgabe und keine Einzahlung. Sie taucht deshalb
 * weder im Tagesbudget noch im Kontostand der Endabrechnung auf; die zählt
 * erst, wenn das Bargeld tatsächlich für etwas draufgeht.
 */
export function cashBalances({ people = [], cashOuts = [], expenses = [] } = {}) {
  const paid = paidOnly(expenses);
  return people.map((p) => {
    const paidOut = sum(cashOuts.filter((c) => c.personId === p.id), (c) => c.amount);
    const spent = sum(paid.filter((e) => cashPayerPerson(e.payer) === p.id), (e) => e.amount);
    return { personId: p.id, name: p.name, paidOut, spent, balance: paidOut - spent };
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
 *
 * Bar bezahlt zählt dabei wie aus der Kasse bezahlt, nicht wie privat
 * vorgestreckt: das Geld war schon der Gruppe ihres, nur eben als Bargeld
 * unterwegs statt auf dem Konto. Wer noch Bargeld übrig hat, steht zusätzlich
 * in `cashBalance` — das muss vor dem Auszahlen noch zurück in die Kasse.
 */
export function settleUp({ trip, contributions = [], expenses = [], cashOuts = [] }) {
  const people = trip.people || [];
  // Vorgemerktes ist noch nicht geflossen und gehört deshalb nicht in die
  // Abrechnung — sonst schuldete jemand Geld für ein Hotel, das keiner zahlte.
  const paid = paidOnly(expenses);
  const spent = totalSpent(paid);

  const shares = people.map((p) => (typeof p.share === 'number' && p.share > 0 ? p.share : 1));
  const fairShares = allocateByShares(spent, shares);

  const paidIntoPot = sum(paid.filter((e) => e.payer === POT || isCashPayer(e.payer)), (e) => e.amount);
  const potBalance = totalContributed(contributions) - paidIntoPot;
  const cashByPerson = new Map(cashBalances({ people, cashOuts, expenses }).map((c) => [c.personId, c.balance]));

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
      cashBalance: cashByPerson.get(p.id) || 0,
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
