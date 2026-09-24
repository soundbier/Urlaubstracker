/** Die Kasse: was reinkam, wie es sich verteilt, und wer am Ende was bekommt. */
import { h, s, icon } from '../dom.js';
import { computeBudget, dailySeries, settleUp, cashBalances, accountBalance, isCashContribution, todayISO } from '../calc.js';
import { money, moneySigned, days, dayMonthShort } from '../format.js';
import { stat, sectionTitle, contributionRow, cashOutRow, emptyState, bar, bufferLabel } from '../ui/parts.js';

export function renderBudget(state, actions) {
  const { trip, expenses, contributions, cashOuts } = state;
  const today = todayISO();
  const cur = trip.currency;
  const b = computeBudget({ trip, contributions, expenses, today });

  return h('div.view',
    // Kein Karton um den Kassenstand: er ist das Erste auf der Seite und
    // braucht keinen Rahmen, der ihm das sagt. Was danach kommt, ordnet sich
    // über Abstand und Schriftgröße unter.
    h('div.potblock',
      potHead(b, cur),
      bar(b.spentRatio, b.remaining < 0 ? 'over' : b.spentRatio > 0.85 ? 'warn' : 'good'),
      h('div.stats',
        stat('Pro Tag', money(b.planPerDay, cur), `auf ${days(b.totalDays)}`),
        // Einzeilige Untertexte: „Rest ÷ Resttage“ brach um und schob die eine
        // Spalte höher als ihre beiden Nachbarn.
        stat('Heute', b.phase === 'after' ? '—' : money(b.perDayToday, cur), trip.budgetMode === 'fixed' ? 'fester Satz' : 'mitwachsend'),
        stat('Ø bisher', b.elapsedDays ? money(b.pace, cur) : '—', b.elapsedDays ? `über ${days(b.elapsedDays)}` : 'noch nichts'),
      ),
      b.elapsedDays && b.total
        ? h('p.note', `Die Kasse liegt ${bufferLabel(b.buffer, cur)}.`)
        : null,
    ),

    // „Wer bekommt was, wer zahlt was“ steht jetzt oben statt ganz unten hinter
    // einer Klappe: das ist die Frage, für die man diese Seite überhaupt
    // aufmacht. Während der Reise ist es ein Zwischenstand — das sagt der
    // Nachsatz, nicht ein zugeklappter Deckel darüber.
    h('section.section',
      sectionTitle(b.phase === 'after' ? 'Abrechnung' : 'Stand jetzt'),
      settlement(trip, contributions, expenses, cashOuts, cur, b.phase),
    ),

    b.total ? h('section.section', sectionTitle('Verlauf'), trendChart(trip, contributions, expenses, today, b)) : null,

    accountSection(trip, contributions, expenses, cashOuts, cur, actions),

    cashSection(trip, contributions, cashOuts, expenses, cur, actions),
    // „Wofür ging das Geld“ stand hier als letzter Abschnitt und war der
    // einzige, der nicht vom Kassenstand handelte. Er steht jetzt im Reiter
    // „Auswertung“ — dort, wo die übrigen Aufteilungen stehen, und mit der
    // Anzahl der Einträge daneben, für die hier nie Platz war.
  );
}

// --------------------------------------------------------- Die beiden Töpfe

/*
 * Die Reisekasse hat zwei Töpfe, und jeder bekommt seinen eigenen Abschnitt:
 * das gemeinsame Konto und das Bargeld, das die Leute dabeihaben. Vorher war
 * Bargeld ein Ableger des Kontos — es konnte nur daraus abgehoben werden, und
 * wer 1200 € überwiesen und 100 € bar mitgenommen hatte, musste 1300 €
 * einzahlen und die 100 € danach wieder herausbuchen. Jetzt ist es eine
 * Einzahlung wie jede andere, nur mit einem anderen Ziel (siehe
 * `calc.contributionTarget`).
 *
 * Was wo steht, folgt derselben Trennung: eine Einzahlung erscheint in genau
 * dem Topf, in den sie gegangen ist. Was jemand insgesamt beigesteuert hat,
 * steht dafür weiterhin an einer Stelle zusammen — in der Abrechnung oben.
 */

function personDot(trip, personId) {
  return h('span.dot', { style: { background: trip.people.find((p) => p.id === personId)?.color || 'var(--text-faint)' } });
}

function splitRow(trip, entries, cur) {
  return h('div.split', ...entries.map(([personId, name, value]) =>
    h('div.split__item', personDot(trip, personId), h('span.split__name', name), h('span.split__value', money(value, cur))),
  ));
}

/** Das gemeinsame Konto: was darauf überwiesen wurde und was noch daraufliegt. */
function accountSection(trip, contributions, expenses, cashOuts, cur, actions) {
  const onAccount = contributions.filter((c) => !isCashContribution(c));
  const left = accountBalance({ contributions, expenses, cashOuts });

  return h('section.section',
    sectionTitle('Gemeinsames Konto', h('button.btn.btn--small', { type: 'button', onclick: () => actions.addContribution() }, icon('plus', 16), 'Eintragen')),
    onAccount.length
      ? h('div',
          h('div.list', ...onAccount.map((c) => contributionRow(c, trip, actions.editContribution))),
          splitRow(trip, trip.people.map((p) => [
            p.id,
            p.name,
            onAccount.filter((c) => c.personId === p.id).reduce((a, c) => a + c.amount, 0),
          ]), cur),
          // Der Kontostand ist etwas anderes als „In der Kasse“ oben: privat
          // vorgestrecktes Geld ist nie über dieses Konto gelaufen.
          h('p.note', `Auf dem Konto liegen noch ${money(left, cur)}.`),
        )
      : emptyState('Tragt ein, wer wie viel auf das gemeinsame Konto überwiesen hat.', 'Einzahlung eintragen', () => actions.addContribution()),
  );
}

/**
 * Bargeld: ein eigener Topf, kein Ableger des Kontos.
 *
 * Zwei Wege führen hinein, und sie bedeuten Verschiedenes. Mitgebrachtes
 * Bargeld ist frisches Geld und vergrößert die Reisekasse; vom Konto
 * abgehobenes ist nur ein Umzug zwischen den Töpfen. Deshalb steht das
 * Mitbringen auf dem Knopf oben (der häufige Fall) und das Abheben als
 * leisere Zeile darunter.
 *
 * Was zählt, ist am Ende der Bestand je Person: das Geld liegt in einer
 * bestimmten Tasche, und nur wer sie dabeihat, kann damit zahlen.
 */
function cashSection(trip, contributions, cashOuts, expenses, cur, actions) {
  const balances = cashBalances({ people: trip.people, contributions, cashOuts, expenses });
  const brought = contributions.filter(isCashContribution);
  const relevant = brought.length || cashOuts.length || balances.some((r) => r.spent);
  const total = balances.reduce((a, r) => a + r.balance, 0);

  const withdraw = h('button.btn.btn--ghost.btn--small', { type: 'button', onclick: actions.addCashOut },
    icon('download', 16), 'Vom Konto abgehoben');

  // Beide Zuflüsse in einer Liste, nach Datum: unterwegs interessiert die
  // Reihenfolge, nicht die Bauart des Eintrags.
  const rows = [
    ...brought.map((c) => ({ date: c.date, createdAt: c.createdAt, node: () => contributionRow(c, trip, actions.editContribution) })),
    ...cashOuts.map((c) => ({ date: c.date, createdAt: c.createdAt, node: () => cashOutRow(c, trip, actions.editCashOut) })),
  ].sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));

  return h('section.section',
    sectionTitle('Bargeld', h('button.btn.btn--small', { type: 'button', onclick: () => actions.addContribution({ target: 'cash' }) }, icon('plus', 16), 'Eintragen')),
    relevant
      ? h('div.stack',
          h('div',
            rows.length ? h('div.list', ...rows.map((r) => r.node())) : null,
            splitRow(trip, balances.map((r) => [r.personId, r.name, r.balance]), cur),
            h('p.note', `Zusammen ${money(total, cur)} bar dabei.`),
          ),
          withdraw,
        )
      : h('div.stack',
          emptyState('Bargeld, das ihr mitnehmt, gehört genauso zur Reisekasse wie das Geld auf dem Konto — hier steht, wer wie viel davon dabeihat.', 'Bargeld eintragen', () => actions.addContribution({ target: 'cash' })),
          withdraw,
        ),
  );
}

/**
 * „In der Kasse“ zeigt Bargeld; verplant ist davon schon vergeben.
 *
 * Die Einordnung stand rechts neben der großen Zahl und rutschte auf schmalen
 * Schirmen darunter — dann klebte sie rechtsbündig unter einer linksbündigen
 * Zahl und sah aus wie ein zweiter, eigener Wert. Jetzt steht sie einfach
 * darunter, an derselben Kante wie alles andere auf der Seite.
 */
function potHead(b, cur) {
  return h('div.pot',
    h('p.summary__label', 'In der Kasse'),
    h('p.summary__value', money(b.remaining, cur)),
    h('p.pot__meta',
      `${money(b.spent, cur)} von ${money(b.total, cur)} ausgegeben`,
      b.planned ? ` · ${money(b.planned, cur)} verplant` : '',
    ),
  );
}

// ------------------------------------------------------------------- Verlauf

/**
 * Soll gegen Ist: die gestrichelte Linie ist „gleichmäßig ausgeben“, die
 * gefüllte Fläche ist das Geld, das tatsächlich noch da ist.
 */
function trendChart(trip, contributions, expenses, today, budget) {
  const series = dailySeries({ trip, contributions, expenses, today });
  const total = budget.total;
  const W = 320;
  const H = 130;
  const padTop = 10;
  const padBottom = 22;
  const n = series.length;

  const startActual = series[0].actual !== null ? series[0].actual + series[0].spentOnDay : total;
  const maxV = Math.max(total, startActual, 1);
  const x = (i) => (i / n) * W;
  const y = (v) => padTop + (1 - Math.max(0, v) / maxV) * (H - padTop - padBottom);

  const plannedPts = [[0, total], ...series.map((d, i) => [i + 1, d.planned])];
  const actualPts = [[0, startActual], ...series.filter((d) => d.actual !== null).map((d, i) => [i + 1, d.actual])];

  const line = (pts) => pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const todayIdx = series.findIndex((d) => d.isToday);
  const marker = todayIdx >= 0 && series[todayIdx].actual !== null ? [todayIdx + 1, series[todayIdx].actual] : null;

  return h('div.chart',
    s('svg.chart__svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Kontostand über ${days(n)}` },
      // Die Farben stehen im Stylesheet (`var()` greift in SVG-Attributen nicht).
      // Die getönte Fläche unter der Kurve ist weg: sie trug keine Auskunft,
      // die die Linie nicht schon trägt, und war der einzige Verlauf der App.
      s('line.chart__axis', { x1: 0, y1: y(0), x2: W, y2: y(0) }),
      s('path.chart__plan', { d: line(plannedPts) }),
      s('path.chart__actual', { d: line(actualPts) }),
      marker ? s('circle.chart__dot', { cx: x(marker[0]), cy: y(marker[1]), r: 4 }) : null,
    ),
    h('div.chart__legend',
      h('span.legend__item', h('i.legend__swatch.legend__swatch--actual'), 'Ist'),
      h('span.legend__item', h('i.legend__swatch.legend__swatch--plan'), 'Soll'),
    ),
    h('div.chart__axisLabels', h('span', dayMonthShort(trip.startDate)), h('span', dayMonthShort(trip.endDate))),
  );
}

// -------------------------------------------------------------- Abrechnung

/**
 * Wer hat wie viel getragen und wer bekommt am Ende was. Eingezahltes und
 * privat Bezahltes zählen gleich viel; der Rest auf dem Konto wird an die
 * Guthaben ausgezahlt, und was dann noch offen ist, überweist man sich direkt.
 *
 * Bar Bezahltes zählt dabei wie aus der Kasse bezahlt — wer noch Bargeld übrig
 * hat, das gehört rechnerisch also weiter der Kasse, steht dafür als eigener
 * Hinweis dabei: das Geld muss erst zurück, bevor die Beträge oben stimmen.
 */
function settlement(trip, contributions, expenses, cashOuts, cur, phase = 'after') {
  const st = settleUp({ trip, contributions, expenses, cashOuts });
  const done = phase === 'after';

  if (!st.totalSpent && !st.potBalance) {
    return emptyState('Sobald Geld eingezahlt oder ausgegeben ist, steht hier, wer wem noch was schuldet.');
  }

  const table = h('div.settle',
    ...st.rows.map((r) =>
      h('div.settle__row',
        h('div.settle__who', h('span.dot', { style: { background: trip.people.find((p) => p.id === r.personId)?.color } }), r.name),
        h('div.settle__nums',
          h('span', `eingezahlt ${money(r.paidIn, cur)}`),
          r.paidPrivate ? h('span', `privat ${money(r.paidPrivate, cur)}`) : null,
          r.cashBalance > 0 ? h('span', `Bargeld übrig ${money(r.cashBalance, cur)}`) : null,
          h('span.settle__share', `Anteil ${money(r.fairShare, cur)}`),
        ),
        h('div.settle__balance', { class: r.balance < 0 ? 'is-negative' : '' }, moneySigned(r.balance, cur)),
      ),
    ),
  );

  /*
   * Kein Kasten mit Anweisungen mehr darunter.
   *
   * Er zählte auf, was die Tabelle schon sagt — nur in Sätzen, und mit einer
   * Zeile je Person und Topf wurde er länger als die Tabelle selbst. Was zu
   * tun ist, steht rechts an jeder Zeile: eine positive Zahl bekommt die
   * Person zurück, eine negative legt sie nach. Seit Bargeld ein eigener Topf
   * ist (siehe `cashSection`), galt außerdem sein wichtigster Satz nicht mehr —
   * übriges Bargeld muss nicht erst „zurück in die Kasse“, es *ist* Kasse.
   */
  return h('div.stack',
    table,
    done ? null : h('p.settle__hint', 'Mitten im Urlaub ist das eine Momentaufnahme: jede Ausgabe verschiebt sie wieder.'),
  );
}
