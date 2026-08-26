/** Die Kasse: was reinkam, wie es sich verteilt, und wer am Ende was bekommt. */
import { h, s, icon } from '../dom.js';
import { computeBudget, dailySeries, settleUp, spentByCategory, todayISO } from '../calc.js';
import { money, moneySigned, days, dayMonthShort, number } from '../format.js';
import { tile, sectionTitle, contributionRow, emptyState, bar, bufferLabel } from '../ui/parts.js';

export function renderBudget(state, actions) {
  const { trip, expenses, contributions } = state;
  const today = todayISO();
  const cur = trip.currency;
  const b = computeBudget({ trip, contributions, expenses, today });

  return h('div.view',
    h('div.card',
      h('div.card__head',
        h('div', h('p.summary__label', 'In der Kasse'), h('p.summary__value', money(b.remaining, cur))),
        h('p.summary__meta', `${money(b.spent, cur)} von ${money(b.total, cur)} ausgegeben`),
      ),
      bar(b.spentRatio, b.remaining < 0 ? 'over' : b.spentRatio > 0.85 ? 'warn' : 'good'),
      h('div.tiles.tiles--flat',
        tile('Pro Tag', money(b.planPerDay, cur), `${money(b.total, cur)} ÷ ${days(b.totalDays)}`),
        tile('Heute', b.phase === 'after' ? '—' : money(b.perDayToday, cur), trip.budgetMode === 'fixed' ? 'fester Satz' : 'Rest ÷ Resttage'),
        tile('Ø bisher', b.elapsedDays ? money(b.pace, cur) : '—', b.elapsedDays ? `über ${days(b.elapsedDays)}` : 'noch nichts'),
      ),
      b.elapsedDays && b.total
        ? h('p.card__note',
            b.buffer >= 0 ? icon('check', 16) : icon('info', 16),
            ` Ihr liegt ${bufferLabel(b.buffer, cur)}. `,
            b.phase === 'during' ? `Hochgerechnet bleiben am Ende ${money(b.projectedLeftover, cur)} übrig.` : '',
          )
        : null,
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
        : emptyState('Tragt ein, was ihr beide überwiesen habt.', 'Einzahlung eintragen', actions.addContribution),
    ),

    expenses.length ? h('section.section', sectionTitle('Wofür ging das Geld?'), categoryList(expenses, b.spent, cur)) : null,

    h('section.section', sectionTitle('Endabrechnung'), settlement(trip, contributions, expenses, cur)),
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
      h('span.legend__item', h('i.legend__swatch.legend__swatch--actual'), 'tatsächlich übrig'),
      h('span.legend__item', h('i.legend__swatch.legend__swatch--plan'), 'gleichmäßig geplant'),
    ),
    h('div.chart__axisLabels', h('span', dayMonthShort(trip.startDate)), h('span', dayMonthShort(trip.endDate))),
  );
}

// --------------------------------------------------------------- Kategorien

function categoryList(expenses, total, cur) {
  const rows = spentByCategory(expenses);
  return h('div.catlist', ...rows.map((c) => {
    const share = total > 0 ? c.amount / total : 0;
    return h('div.cat',
      h('span.cat__icon', c.icon),
      h('div.cat__main',
        h('div.cat__top', h('span.cat__label', c.label), h('span.cat__amount', money(c.amount, cur))),
        bar(share, 'neutral'),
      ),
      h('span.cat__pct', `${number(share * 100)} %`),
    );
  }));
}

// -------------------------------------------------------------- Abrechnung

/**
 * Wer hat wie viel getragen und wer bekommt am Ende was. Eingezahltes und
 * privat Bezahltes zählen gleich viel; der Rest auf dem Konto wird an die
 * Guthaben ausgezahlt, und was dann noch offen ist, überweist man sich direkt.
 */
function settlement(trip, contributions, expenses, cur) {
  const st = settleUp({ trip, contributions, expenses });

  if (!st.totalSpent && !st.potBalance) {
    return emptyState('Sobald Geld eingezahlt oder ausgegeben ist, steht hier, wer wem was schuldet.');
  }

  const table = h('div.settle',
    ...st.rows.map((r) =>
      h('div.settle__row',
        h('div.settle__who', h('span.dot', { style: { background: trip.people.find((p) => p.id === r.personId)?.color } }), r.name),
        h('div.settle__nums',
          h('span', `eingezahlt ${money(r.paidIn, cur)}`),
          r.paidPrivate ? h('span', `privat ${money(r.paidPrivate, cur)}`) : null,
          h('span.settle__share', `Anteil ${money(r.fairShare, cur)}`),
        ),
        h('div.settle__balance', { class: r.balance < 0 ? 'is-negative' : '' }, moneySigned(r.balance, cur)),
      ),
    ),
  );

  const actions = [];
  if (st.payouts.length && st.potBalance > 0) {
    actions.push(h('li',
      `Vom gemeinsamen Konto (${money(st.potBalance, cur)}) zurück: `,
      ...st.payouts.map((p, i) => h('span', i ? ', ' : '', h('strong', p.name), ` ${money(p.amount, cur)}`)),
    ));
  }
  for (const t of st.transfers) {
    actions.push(h('li', h('strong', t.from), ' überweist ', h('strong', money(t.amount, cur)), ' an ', h('strong', t.to), '.'));
  }
  if (!actions.length) actions.push(h('li', 'Ihr seid quitt — nichts mehr zu überweisen.'));

  return h('div',
    table,
    h('div.callout.callout--soft', h('p.callout__title', 'Zum Ausgleich'), h('ul.settle__todo', ...actions)),
  );
}
