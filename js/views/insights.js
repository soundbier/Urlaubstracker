/**
 * Auswertung: derselbe Urlaub, von der Seite angesehen.
 *
 * Die beiden anderen Reiter unter „Finanzen“ beantworten, was zu tun ist —
 * eintragen (Ausgaben) und ausgleichen (Kasse). Hier ist nichts zu tun: keine
 * Knöpfe, keine antippbaren Zeilen, kein schwebender Knopf (siehe `app.fab`).
 * Das ist eine Aufstellung zum Lesen, wie die Gepäckübersicht unter
 * „Packliste“ — eine Zahl, die sich unter dem Finger als Knopf entpuppt, wäre
 * hier eine Falle.
 *
 * Die Seite hat eine Summe, und jede Zahl darunter ordnet sich ihr unter: was
 * die Reise bisher gekostet hat, aufgeteilt nach Tagen, nach Kategorien und
 * nach dem Topf, aus dem bezahlt wurde. Deshalb zählt hier auch eine bezahlte
 * Vormerkung voll mit — sie ist bezahlt, das Geld ist weg. Das Tagesbudget
 * rechnet an der Stelle bewusst anders (siehe `calc.spendingStats`).
 */
import { h, s, icon } from '../dom.js';
import {
  computeBudget, spendingByDay, spendingStats, spentByCategory, spentByPayer,
  planItemDone, packProgress, todayISO, CATEGORY_BY_ID,
} from '../calc.js';
import { money, moneySigned, days, plural, dayMonth, dayMonthShort } from '../format.js';
import { stat, sectionTitle, bar, payerLabel } from '../ui/parts.js';

export function renderInsights(state) {
  const { trip, expenses, contributions } = state;
  const today = todayISO();
  const cur = trip.currency;
  const b = computeBudget({ trip, contributions, expenses, today });
  const stats = spendingStats({ trip, expenses, today });

  if (!stats.entries) {
    // Vor der ersten Ausgabe gibt es nichts zu verteilen — die Reise selbst
    // lässt sich aber schon zählen, und genau das steht dann hier.
    return h('div.view',
      h('div.hero.hero--muted',
        h('p.hero__title', 'Noch nichts auszuwerten'),
        h('p.hero__sub', 'Sobald die ersten Ausgaben eingetragen sind, steht hier, wofür das Geld ging, an welchen Tagen und was am Ende dabei herauskommt.'),
      ),
      countsSection(state, stats),
    );
  }

  const series = spendingByDay({ trip, expenses, today });
  const categories = spentByCategory(expenses);
  const payers = spentByPayer(expenses);

  return h('div.view',
    // Die eine Zahl dieser Seite. Sie steht in der Kasse nur als Nachsatz
    // unter dem Kassenstand („… von … ausgegeben“) — hier ist sie der Anker,
    // auf den sich jede Aufteilung darunter bezieht.
    h('div.summary',
      h('p.summary__label', 'Ausgegeben'),
      h('p.summary__value', money(stats.spent, cur)),
      h('p.summary__meta', plural(stats.entries, 'Eintrag', 'Einträge')),
    ),
    // Zwei Spalten, nicht drei: „Teuerster Tag“ brach als Beschriftung um und
    // schob seine Spalte gegenüber den Nachbarn nach unten. Der teuerste Tag
    // steht ohnehin besser unter dem Tagesbild — dort ist er der Ausschlag,
    // auf den man gerade zeigt.
    h('div.stats.stats--2',
      stat('Ø pro Tag', stats.elapsedDays ? money(stats.perDay, cur) : '—', stats.elapsedDays ? `über ${days(stats.elapsedDays)}` : 'ab dem ersten Tag'),
      stat('Ø je Eintrag', money(stats.perEntry, cur), 'über alle Kategorien'),
    ),

    h('section.section',
      sectionTitle('Tag für Tag'),
      dayChart(trip, series, b.planPerDay, cur),
      ...dayNotes(stats, cur),
    ),

    h('section.section',
      sectionTitle('Wofür'),
      categoryList(categories, stats.spent, cur),
    ),

    h('section.section',
      sectionTitle('Womit bezahlt'),
      payerList(trip, payers, stats.spent, cur),
    ),

    // Nur unterwegs: vorher gibt es keinen Schnitt, aus dem sich etwas
    // hochrechnen ließe, und hinterher steht das Ergebnis schon auf „Heute“.
    b.phase === 'during' && b.elapsedDays ? projection(b, cur) : null,

    countsSection(state, stats),
  );
}

// ------------------------------------------------------------- Tag für Tag

/**
 * Ein Balken je Reisetag, dazu die gestrichelte Linie des Tagesbudgets.
 *
 * Bewusst etwas anderes als der Verlauf in der Kasse: der zeigt den Kontostand
 * und damit „wie lange reicht es noch“, hier steht jeder Tag für sich und
 * beantwortet „welcher Tag war teuer“. Ein Tag ohne Ausgabe bekommt keinen
 * Balken — die Lücke ist die Auskunft.
 *
 * Alle Balken tragen dieselbe Tinte; über der Linie zu liegen ist kein
 * Verdikt, das eine Farbe bräuchte, das sagt die Linie selbst. Farbe bekommt
 * nur der heutige Tag, damit man im Bild findet, wo man steht.
 */
function dayChart(trip, series, planPerDay, cur) {
  const W = 320;
  const H = 120;
  const padTop = 10;
  const padBottom = 14;
  const n = series.length;
  const max = Math.max(planPerDay, ...series.map((d) => d.total), 1);
  const band = W / n;
  const barW = Math.max(1.5, Math.min(band - 2, band * 0.68));
  const y = (v) => padTop + (1 - Math.max(0, v) / max) * (H - padTop - padBottom);
  const base = y(0);

  return h('div.chart',
    s('svg.chart__svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Ausgaben je Tag über ${days(n)}` },
      s('line.chart__axis', { x1: 0, y1: base, x2: W, y2: base }),
      planPerDay > 0 ? s('line.chart__plan', { x1: 0, y1: y(planPerDay), x2: W, y2: y(planPerDay) }) : null,
      ...series.map((d, i) => {
        if (!d.total) return null;
        const top = y(d.total);
        return s(d.isToday ? 'rect.chart__bar.chart__bar--today' : 'rect.chart__bar', {
          x: (i * band + (band - barW) / 2).toFixed(1),
          y: top.toFixed(1),
          width: barW.toFixed(1),
          // Ein Cent soll sichtbar bleiben, sonst fehlt der Tag im Bild.
          height: Math.max(1, base - top).toFixed(1),
        });
      }),
    ),
    planPerDay > 0
      ? h('div.chart__legend',
          h('span.legend__item', h('i.legend__swatch.legend__swatch--plan'), `Plan ${money(planPerDay, cur)} am Tag`),
        )
      : null,
    h('div.chart__axisLabels', h('span', dayMonthShort(trip.startDate)), h('span', dayMonthShort(trip.endDate))),
  );
}

/**
 * Was die Balken nicht zeigen können: die Lücken, den Ausschlag nach oben und
 * das Geld, das gar nicht in den Reisezeitraum fällt. Der letzte Satz gehört
 * zur Redlichkeit des Bildes — die Anzahlung vom Mai steht in keinem Balken,
 * aber in der Summe oben.
 */
function dayNotes(stats, cur) {
  const biggest = stats.biggest;
  // Anführungszeichen stehen um eine Notiz, die jemand geschrieben hat — nicht
  // um „Essen & Trinken“: eine Kategorie ist kein Zitat.
  const label = biggest
    && (biggest.note ? `„${biggest.note}“` : (CATEGORY_BY_ID[biggest.category] || CATEGORY_BY_ID.other).label);
  // Überall das ausgeschriebene Datum (`dayMonth`), nicht die kurze Form: „am
  // 04.09.“ endet selbst auf einen Punkt und macht aus dem Satzende zwei.
  return [
    stats.topDay
      ? h('p.note',
          `Teuerster Tag: ${dayMonth(stats.topDay.date)} mit ${money(stats.topDay.total, cur)}.`,
          stats.quietDays ? ` ${plural(stats.quietDays, 'Tag', 'Tage')} ohne eine einzige Ausgabe.` : null,
        )
      : null,
    biggest ? h('p.note', `Größte einzelne Ausgabe: ${money(biggest.amount, cur)} für ${label} am ${dayMonth(biggest.date)}.`) : null,
    stats.outside
      ? h('p.note', `${money(stats.outside, cur)} fielen außerhalb des Reisezeitraums an und stehen in keinem Balken.`)
      : null,
  ].filter(Boolean);
}

// ------------------------------------------------------- Wofür und womit

/**
 * Dieselbe Aufstellung, die vorher in der Kasse stand — dort war sie der
 * einzige Absatz, der nicht vom Kassenstand handelte. Hier hat sie Platz für
 * das, was ihr gefehlt hat: wie viele Einträge das waren und was einer davon
 * im Schnitt kostete.
 */
function categoryList(rows, total, cur) {
  return h('div.catlist', ...rows.map((c) =>
    h('div.cat',
      h('span.cat__icon', icon(c.icon, 19)),
      h('div.cat__main',
        h('div.cat__top', h('span.cat__label', c.label), h('span.cat__amount', money(c.amount, cur))),
        bar(total > 0 ? c.amount / total : 0, 'neutral'),
        h('p.cat__meta', `${plural(c.count, 'Eintrag', 'Einträge')} · Ø ${money(Math.round(c.amount / c.count), cur)}`),
      ),
    ),
  ));
}

/**
 * Aus welchem Topf das Geld kam. Dieselbe Bauart wie die Kategorien darüber,
 * weil es dieselbe Frage in einer anderen Richtung ist: dort „wofür“, hier
 * „woraus“ — und beide Spalten addieren sich zur Summe oben.
 *
 * Die Beschriftung kommt aus `payerLabel`, damit „Bargeld · Marie“ hier genau
 * so heißt wie an jeder Ausgabenzeile. Was „privat“ bedeutet, sagt die
 * Unterzeile: ein Name allein ließe offen, ob das Geld der Person oder der
 * Kasse gehörte.
 */
function payerList(trip, rows, total, cur) {
  const symbol = { pot: 'wallet', cash: 'cash', private: 'person' };
  return h('div.catlist', ...rows.map((r) =>
    h('div.cat',
      h('span.cat__icon', icon(symbol[r.kind], 19)),
      h('div.cat__main',
        h('div.cat__top', h('span.cat__label', payerLabel(trip, r.payer)), h('span.cat__amount', money(r.amount, cur))),
        bar(total > 0 ? r.amount / total : 0, 'neutral'),
        h('p.cat__meta',
          r.kind === 'private'
            ? `privat vorgestreckt · ${plural(r.count, 'Eintrag', 'Einträge')}`
            : plural(r.count, 'Eintrag', 'Einträge'),
        ),
      ),
    ),
  ));
}

// ------------------------------------------------------------ Hochrechnung

/**
 * Wenn es so weitergeht wie bisher: was am Ende ausgegeben ist und was dann
 * noch in der Kasse liegt. Beides rechnet `computeBudget` längst aus
 * (`projectedTotal`, `projectedLeftover`) — bis jetzt stand es nirgends.
 *
 * Keine zweite Durchschnittszahl daneben: der Schnitt, mit dem hochgerechnet
 * wird, lässt Vorgemerktes draußen und wäre damit ein anderer als der oben in
 * der Kennzahlreihe. Zwei Zahlen mit demselben Namen und verschiedenen Werten
 * auf einer Seite sind schlimmer als eine, die in Worten erklärt wird.
 */
function projection(b, cur) {
  return h('section.section',
    sectionTitle('Hochrechnung'),
    h('div.stats.stats--2',
      stat('Am Ende ausgegeben', money(b.projectedTotal, cur), 'wenn es so weitergeht'),
      stat(
        'Dann übrig',
        moneySigned(b.projectedLeftover, cur),
        b.projectedLeftover < 0 ? 'so viel fehlt' : 'bleibt liegen',
        { tone: b.projectedLeftover < 0 ? 'over' : '' },
      ),
    ),
    h('p.note', 'Gerechnet mit dem täglichen Schnitt der angebrochenen Tage. Vorgemerktes kommt obendrauf — es folgt keinem Schnitt, es steht schon fest.'),
  );
}

// -------------------------------------------------------- Reise in Zahlen

/**
 * Was sich an dieser Reise zählen lässt, ohne dass Geld darin vorkommt.
 *
 * Dieselbe Aufstellung wie die Gepäckübersicht (`.tally`): „4 von 6“, solange
 * noch etwas aussteht, und bloß „6“, wenn alles erledigt ist — „6 von 6“ sagt
 * zweimal dasselbe. Zeilen, zu denen es gar keine Einträge gibt, fallen weg;
 * „0 Unterkünfte“ ist keine Auskunft, es trägt ja nicht jeder eine ein.
 */
function countsSection(state, stats) {
  const { trip, expenses, contributions, cashOuts, planItems, packItems, stays } = state;
  const expenseById = new Map(expenses.map((e) => [e.id, e]));
  const pack = packProgress(packItems);

  const rows = [
    { label: 'Reisetage', done: Math.min(stats.elapsedDays, stats.totalDays), total: stats.totalDays },
    { label: 'In der Gruppe', total: trip.people.length },
    stats.entries ? { label: 'Ausgaben eingetragen', total: stats.entries } : null,
    contributions.length ? { label: 'Einzahlungen', total: contributions.length } : null,
    cashOuts.length ? { label: 'Abhebungen', total: cashOuts.length } : null,
    planItems.length
      ? { label: 'Programmpunkte', done: planItems.filter((p) => planItemDone(p, expenseById)).length, total: planItems.length }
      : null,
    pack.total ? { label: 'Auf der Packliste', done: pack.done, total: pack.total } : null,
    stays.length ? { label: 'Unterkünfte', total: stays.length } : null,
  ].filter(Boolean);

  const count = (r) => (r.done === undefined || r.done === r.total ? String(r.total) : `${r.done} von ${r.total}`);

  return h('section.section',
    sectionTitle('Reise in Zahlen'),
    h('div.tally', ...rows.map((r) =>
      h('div.tally__row',
        h('span.tally__label', r.label),
        h('span.tally__count', { class: r.done !== undefined && r.done === r.total ? 'is-done' : '' }, count(r)),
      ),
    )),
  );
}
