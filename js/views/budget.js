/** Die Kasse: was reinkam, wie es sich verteilt, und wer am Ende was bekommt. */
import { h, s, icon } from '../dom.js';
import { computeBudget, dailySeries, settleUp, spentByCategory, cashBalances, todayISO } from '../calc.js';
import { money, moneySigned, days, dayMonthShort } from '../format.js';
import { stat, sectionTitle, contributionRow, cashOutRow, emptyState, bar, bufferLabel, disclosure } from '../ui/parts.js';

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
      howItWorks(b, trip, cur),
    ),

    b.total ? h('section.section', sectionTitle('Verlauf'), trendChart(trip, contributions, expenses, today, b)) : null,

    h('section.section',
      sectionTitle('Einzahlungen', h('button.btn.btn--small', { type: 'button', onclick: actions.addContribution }, icon('plus', 16), 'Eintragen')),
      contributions.length
        ? h('div',
            h('div.list', ...contributions.map((c) => contributionRow(c, trip, actions.editContribution))),
            h('div.split', ...trip.people.map((p) => {
              const sum = contributions.filter((c) => c.personId === p.id).reduce((a, c) => a + c.amount, 0);
              return h('div.split__item', h('span.dot', { style: { background: p.color } }), h('span.split__name', p.name), h('span.split__value', money(sum, cur)));
            })),
          )
        : emptyState('Tragt ein, wer wie viel auf das gemeinsame Konto überwiesen hat.', 'Einzahlung eintragen', actions.addContribution),
    ),

    trip.people.length > 1 ? cashSection(trip, cashOuts, expenses, cur, actions) : null,

    expenses.length ? h('section.section', sectionTitle('Wofür ging das Geld?'), categoryList(expenses, b.spent, cur)) : null,

    h('section.section',
      sectionTitle('Endabrechnung'),
      // An Tag 6 von 14 ist das keine Anweisung, sondern ein Zwischenstand —
      // und der ändert sich mit jeder Ausgabe wieder. Aufgeklappt steht er
      // erst da, wenn er auch gilt.
      b.phase === 'after'
        ? settlement(trip, contributions, expenses, cashOuts, cur, b.phase)
        : disclosure('Zwischenstand ansehen', h('span.disclosure__summary', 'Stand jetzt'),
            settlement(trip, contributions, expenses, cashOuts, cur, b.phase)),
    ),
  );
}

// -------------------------------------------------------------------- Bargeld

/**
 * Wer noch wie viel Bargeld in der Tasche hat.
 *
 * Steht extra neben den Einzahlungen: eine Auszahlung ist keine Ausgabe (das
 * Geld ist ja noch da, nur eben in bar statt auf dem Konto) und würde deshalb
 * in keiner anderen Liste auftauchen. Ohne diese Übersicht wüsste am Ende
 * niemand mehr, wer noch Bargeld übrig hat und in die Kasse zurücklegen muss.
 */
function cashSection(trip, cashOuts, expenses, cur, actions) {
  const balances = cashBalances({ people: trip.people, cashOuts, expenses });
  const relevant = balances.some((r) => r.paidOut || r.spent);

  return h('section.section',
    sectionTitle('Bargeld', h('button.btn.btn--small', { type: 'button', onclick: actions.addCashOut }, icon('plus', 16), 'Eintragen')),
    relevant
      ? h('div',
          h('div.list', ...cashOuts.map((c) => cashOutRow(c, trip, actions.editCashOut))),
          h('div.split', ...balances.map((r) =>
            h('div.split__item', h('span.dot', { style: { background: trip.people.find((p) => p.id === r.personId)?.color } }), h('span.split__name', r.name), h('span.split__value', money(r.balance, cur))),
          )),
        )
      : emptyState('Nehmt ihr Bargeld aus der Kasse für unterwegs mit, steht hier, wer davon noch wie viel hat.', 'Bargeld ausgezahlt', actions.addCashOut),
  );
}

/**
 * Wie aus der Kasse ein Tagesbudget wird.
 *
 * Steht zugeklappt da, weil es die Frage beantwortet, die man einmal stellt
 * und dann nicht mehr. Offen liegen die Zahlen, offen liegt auch die
 * Erklärung — dann sind es aber elf Zahlen auf einer Karte, und keine davon
 * bleibt hängen.
 */
function howItWorks(b, trip, cur) {
  return disclosure('Wie wird gerechnet?', null,
    h('div.stack',
      b.planned
        ? h('div.stack.stack--tight',
            h('p.field__note', `${money(b.planned, cur)} von ${money(b.remaining, cur)} in der Kasse sind schon verplant: vergeben, aber noch nicht bezahlt.`),
            h('p.field__note', `Frei verfügbar sind ${money(b.free, cur)}.`),
          )
        : null,
      trip.budgetMode === 'fixed'
        ? h('div.stack.stack--tight',
            h('p.field__note', `${money(b.budgetBase, cur)} ÷ ${days(b.totalDays)} = ${money(b.planPerDay, cur)} pro Tag.`),
            h('p.field__note', 'Der Betrag bleibt jeden Tag gleich.'),
          )
        : h('div.stack.stack--tight',
            h('p.field__note', `${money(b.budgetBase, cur)} ÷ ${days(b.totalDays)} = ${money(b.planPerDay, cur)} pro Tag im Plan.`),
            h('p.field__note', 'Jeden Morgen neu: Restgeld ÷ Resttage.'),
          ),
      b.reserved
        ? h('p.field__note', 'Verplantes Geld läuft am Tagesbudget vorbei, auch nachdem es bezahlt ist: sonst spränge das Tagesbudget genau dann nach oben, wenn das Hotel abgebucht wird.')
        : null,
      // Aus einem oder zwei Tagen lässt sich nichts hochrechnen — der erste
      // Tankstopp sagt noch nicht, wie der Urlaub ausgeht.
      b.phase === 'during' && b.elapsedDays >= 3
        ? h('p.field__note', projection(b.projectedLeftover, cur))
        : null,
    ),
  );
}

/** „bleiben −80 € übrig“ ist keine Aussage — bei Unterdeckung fehlt Geld. */
function projection(leftover, cur) {
  return leftover < 0
    ? `Wenn es so weitergeht, fehlen am Ende ${money(-leftover, cur)}.`
    : `Wenn es so weitergeht, bleiben am Ende ${money(leftover, cur)} übrig.`;
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
  const area = `${line(actualPts)} L${x(actualPts.at(-1)[0]).toFixed(1)} ${y(0).toFixed(1)} L0 ${y(0).toFixed(1)} Z`;

  const todayIdx = series.findIndex((d) => d.isToday);
  const marker = todayIdx >= 0 && series[todayIdx].actual !== null ? [todayIdx + 1, series[todayIdx].actual] : null;

  return h('div.chart',
    s('svg.chart__svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Kontostand über ${days(n)}` },
      // Die Farben stehen im Stylesheet (`var()` greift in SVG-Attributen nicht),
      // die Füllung bleibt als Attribut (`url(#…)` aus externem CSS greift nicht).
      s('defs', s('linearGradient', { id: 'ut-chart-fill', x1: '0', y1: '0', x2: '0', y2: '1' },
        s('stop.chart__stopTop', { offset: '0%' }),
        s('stop.chart__stopBottom', { offset: '100%' }),
      )),
      s('line.chart__axis', { x1: 0, y1: y(0), x2: W, y2: y(0) }),
      s('path.chart__area', { d: area, fill: 'url(#ut-chart-fill)' }),
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

// --------------------------------------------------------------- Kategorien

/**
 * Der Balken ist der Anteil — daneben stand er bis eben noch einmal als
 * Prozentzahl. Die dritte Spalte hat außerdem die Beträge von der rechten
 * Kante weggeschoben, an der sie sich sonst untereinander vergleichen lassen.
 */
function categoryList(expenses, total, cur) {
  const rows = spentByCategory(expenses);
  return h('div.catlist', ...rows.map((c) => {
    const share = total > 0 ? c.amount / total : 0;
    return h('div.cat',
      h('span.cat__icon', icon(c.icon, 19)),
      h('div.cat__main',
        h('div.cat__top', h('span.cat__label', c.label), h('span.cat__amount', money(c.amount, cur))),
        bar(share, 'neutral'),
      ),
    );
  }));
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

  const openCash = st.rows.filter((r) => r.cashBalance > 0);

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

  const names = (list) => list.map((p, i) => h('span', i ? ', ' : '', h('strong', p.name), ` ${money(p.amount, cur)}`));

  const actions = [];
  if (st.payouts.length && st.potBalance > 0) {
    actions.push(h('li', `Vom gemeinsamen Konto (${money(st.potBalance, cur)}) zurück: `, ...names(st.payouts)));
  }
  if (st.topUps.length) {
    actions.push(h('li',
      `Auf dem gemeinsamen Konto fehlen ${money(-st.potBalance, cur)} — nachzahlen: `,
      ...names(st.topUps),
    ));
  }
  for (const t of st.transfers) {
    actions.push(h('li', h('strong', t.from), ' überweist ', h('strong', money(t.amount, cur)), ' an ', h('strong', t.to), '.'));
  }
  // Rechnerisch gehört das noch der Kasse — solange es nicht zurück ist,
  // stimmen die Beträge oben nur, wenn diese Person es auch wirklich beisteuert.
  for (const r of openCash) {
    actions.push(h('li', h('strong', r.name), ' hat noch ', h('strong', money(r.cashBalance, cur)), ' Bargeld übrig — das erst zurück in die Kasse.'));
  }
  if (!actions.length) actions.push(h('li', 'Alles ausgeglichen. Nichts mehr zu überweisen.'));

  return h('div',
    table,
    h('div.callout',
      h('p.callout__title', done ? 'Zum Ausgleich' : 'Stand jetzt'),
      done ? null : h('p.settle__hint', 'Würdet ihr heute abrechnen:'),
      h('ul.settle__todo', ...actions),
    ),
  );
}
